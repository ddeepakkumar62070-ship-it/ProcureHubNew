const { getPool } = require('../config/db');

async function create({ userId, type, message }) {
  const [result] = await getPool().execute(
    'INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)',
    [userId, type, message],
  );
  return result.insertId;
}

async function createMany(recipients, type, message) {
  if (!recipients.length) return;
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    for (const userId of recipients) {
      await connection.execute(
        'INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)',
        [userId, type, message],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listForUser(userId, { limit, offset }) {
  const [rows] = await getPool().execute(
    `SELECT id, type, message, read_at AS readAt, created_at AS createdAt
     FROM notifications WHERE user_id = ?
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [userId, limit, offset],
  );
  return rows;
}

async function markRead(userId, notificationId) {
  const [result] = await getPool().execute(
    'UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND read_at IS NULL',
    [notificationId, userId],
  );
  if (result.affectedRows) return 'UPDATED';
  const [rows] = await getPool().execute(
    'SELECT id, read_at FROM notifications WHERE id = ? AND user_id = ?',
    [notificationId, userId],
  );
  return rows.length ? 'ALREADY_READ' : 'NOT_FOUND';
}

async function recentForUser(userId, limit = 5) {
  const [rows] = await getPool().execute(
    `SELECT id, type, message, read_at AS readAt, created_at AS createdAt
     FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    [userId, limit],
  );
  return rows;
}

module.exports = { create, createMany, listForUser, markRead, recentForUser };
