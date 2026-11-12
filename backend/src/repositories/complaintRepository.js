const { getPool } = require('../config/db');
const { paginationClause } = require('../utils/pagination');

const activeStatuses = ['OPEN', 'UNDER_REVIEW'];
const transitions = {
  OPEN: ['UNDER_REVIEW', 'RESOLVED', 'REJECTED'],
  UNDER_REVIEW: ['RESOLVED', 'REJECTED'],
  RESOLVED: ['CLOSED'],
  REJECTED: ['CLOSED'],
};

async function notify(connection, userId, message) {
  if (!userId) return;
  await connection.execute(
    `INSERT INTO notifications (user_id, type, message)
     VALUES (?, 'COMPLAINT', ?)`,
    [userId, message],
  );
}

async function notifyAdmins(connection, message) {
  const [admins] = await connection.execute(
    "SELECT id FROM users WHERE role = 'ADMIN' AND is_active = TRUE",
  );
  for (const admin of admins) await notify(connection, admin.id, message);
}

function accessClause(role, userId) {
  if (role === 'ADMIN') return { sql: '', params: [] };
  return {
    sql: 'AND (c.complainant_id = ? OR c.respondent_id = ?)',
    params: [userId, userId],
  };
}

async function listComplaints({ userId, role, limit = 50, offset = 0 }) {
  const access = accessClause(role, userId);
  const [rows] = await getPool().execute(
    `SELECT c.id, c.complainant_id AS complainantId, c.respondent_id AS respondentId,
            c.purchase_order_id AS orderId, c.category, c.title, c.description, c.status,
            c.created_at AS createdAt, c.updated_at AS updatedAt,
            cu.name AS complainantName, cu.role AS complainantRole,
            ru.name AS respondentName, ru.role AS respondentRole
     FROM complaints c
     JOIN users cu ON cu.id = c.complainant_id
     LEFT JOIN users ru ON ru.id = c.respondent_id
     WHERE 1 = 1 ${access.sql}
     ORDER BY c.updated_at DESC, c.id DESC ${paginationClause(limit, offset)}`,
    access.params,
  );
  return rows;
}

async function getComplaint(complaintId, { userId, role }) {
  const access = accessClause(role, userId);
  const [rows] = await getPool().execute(
    `SELECT c.id, c.complainant_id AS complainantId, c.respondent_id AS respondentId,
            c.purchase_order_id AS orderId, c.category, c.title, c.description, c.status,
            c.created_at AS createdAt, c.updated_at AS updatedAt,
            cu.name AS complainantName, cu.role AS complainantRole,
            ru.name AS respondentName, ru.role AS respondentRole
     FROM complaints c
     JOIN users cu ON cu.id = c.complainant_id
     LEFT JOIN users ru ON ru.id = c.respondent_id
     WHERE c.id = ? ${access.sql} LIMIT 1`,
    [complaintId, ...access.params],
  );
  if (!rows.length) return null;
  const [history] = await getPool().execute(
    `SELECT h.id, h.action, h.status, h.response, h.created_at AS createdAt,
            u.id AS actionBy, u.name AS actionByName, u.role AS actionByRole
     FROM complaint_history h JOIN users u ON u.id = h.action_by
     WHERE h.complaint_id = ? ORDER BY h.id`,
    [complaintId],
  );
  return { ...rows[0], history };
}

async function createComplaint({ complainantId, role, orderId, category, title, description }) {
  if (!['BUYER', 'SUPPLIER'].includes(role)) return 'FORBIDDEN';
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [complainantId]);
    let respondentId = null;
    if (orderId !== null) {
      const ownerColumn = role === 'BUYER' ? 'buyer_id' : 'supplier_id';
      const otherColumn = role === 'BUYER' ? 'supplier_id' : 'buyer_id';
      const [orders] = await connection.execute(
        `SELECT id, ${otherColumn} AS respondentId
         FROM purchase_orders WHERE id = ? AND ${ownerColumn} = ? FOR UPDATE`,
        [orderId, complainantId],
      );
      if (!orders.length) {
        await connection.rollback();
        return 'ORDER_NOT_FOUND';
      }
      respondentId = orders[0].respondentId;
    }

    const [existing] = await connection.execute(
      `SELECT id FROM complaints
       WHERE complainant_id = ? AND purchase_order_id <=> ?
         AND LOWER(title) = LOWER(?) AND status IN (?, ?)
       LIMIT 1 FOR UPDATE`,
      [complainantId, orderId, title, ...activeStatuses],
    );
    if (existing.length) {
      await connection.rollback();
      return 'DUPLICATE_ACTIVE';
    }
    const [result] = await connection.execute(
      `INSERT INTO complaints
         (complainant_id, respondent_id, purchase_order_id, category, title, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [complainantId, respondentId, orderId, category, title, description],
    );
    await connection.execute(
      `INSERT INTO complaint_history (complaint_id, action, status, response, action_by)
       VALUES (?, 'STATUS', 'OPEN', ?, ?)`,
      [result.insertId, 'Complaint submitted.', complainantId],
    );
    const notice = `Complaint #${result.insertId} was submitted and needs review.`;
    if (respondentId) await notify(connection, respondentId, notice);
    await notifyAdmins(connection, notice);
    await connection.commit();
    return getComplaint(result.insertId, { userId: complainantId, role });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function addComplaintResponse({ complaintId, userId, role, response }) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const access = role === 'ADMIN' ? '' : 'AND (c.complainant_id = ? OR c.respondent_id = ?)';
    const params = role === 'ADMIN' ? [complaintId] : [complaintId, userId, userId];
    const [rows] = await connection.execute(
      `SELECT c.id, c.status FROM complaints c WHERE c.id = ? ${access} FOR UPDATE`,
      params,
    );
    if (!rows.length) {
      await connection.rollback();
      return 'NOT_FOUND';
    }
    if (rows[0].status === 'CLOSED') {
      await connection.rollback();
      return 'CLOSED';
    }
    await connection.execute(
      `INSERT INTO complaint_history (complaint_id, action, status, response, action_by)
       VALUES (?, 'RESPONSE', ?, ?, ?)`,
      [complaintId, rows[0].status, response, userId],
    );
    await connection.execute('UPDATE complaints SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [complaintId]);
    const [participants] = await connection.execute(
      'SELECT complainant_id AS complainantId, respondent_id AS respondentId FROM complaints WHERE id = ?',
      [complaintId],
    );
    const otherParty = Number(participants[0].complainantId) === Number(userId)
      ? participants[0].respondentId : participants[0].complainantId;
    if (role === 'ADMIN') {
      if (participants[0].complainantId) {
        await notify(connection, participants[0].complainantId, `Complaint #${complaintId} received an admin response.`);
      }
      if (participants[0].respondentId) {
        await notify(connection, participants[0].respondentId, `Complaint #${complaintId} received an admin response.`);
      }
    } else {
      if (otherParty) await notify(connection, otherParty, `Complaint #${complaintId} received a new response.`);
      await notifyAdmins(connection, `Complaint #${complaintId} received a new response.`);
    }
    await connection.commit();
    return getComplaint(complaintId, { userId, role });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateComplaintStatus({ complaintId, adminId, status, note }) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      'SELECT id, status FROM complaints WHERE id = ? FOR UPDATE',
      [complaintId],
    );
    if (!rows.length) {
      await connection.rollback();
      return 'NOT_FOUND';
    }
    const previousStatus = rows[0].status;
    if (!(transitions[previousStatus] || []).includes(status)) {
      await connection.rollback();
      return 'INVALID_TRANSITION';
    }
    await connection.execute('UPDATE complaints SET status = ? WHERE id = ?', [status, complaintId]);
    await connection.execute(
      `INSERT INTO complaint_history (complaint_id, action, status, response, action_by)
       VALUES (?, 'STATUS', ?, ?, ?)`,
      [complaintId, status, note || `${previousStatus} -> ${status}`, adminId],
    );
    const [participants] = await connection.execute(
      'SELECT complainant_id AS complainantId, respondent_id AS respondentId FROM complaints WHERE id = ?',
      [complaintId],
    );
    const notice = `Complaint #${complaintId} status changed to ${status}.`;
    await notify(connection, participants[0].complainantId, notice);
    if (participants[0].respondentId) await notify(connection, participants[0].respondentId, notice);
    await connection.commit();
    return getComplaint(complaintId, { userId: adminId, role: 'ADMIN' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  addComplaintResponse,
  createComplaint,
  getComplaint,
  listComplaints,
  updateComplaintStatus,
};
