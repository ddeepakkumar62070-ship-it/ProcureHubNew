const { getPool } = require('../config/db');

function access(role) {
  if (role === 'ADMIN') return { clause: '', params: [] };
  if (role === 'BUYER') return { clause: 'AND po.buyer_id = ?', params: [] };
  return { clause: 'AND po.supplier_id = ?', params: [] };
}

async function listRefunds({ userId, role, limit = 50, offset = 0 }) {
  const scope = access(role);
  const params = [...scope.params];
  if (role !== 'ADMIN') params.push(userId);
  params.push(limit, offset);
  const [rows] = await getPool().execute(
    `SELECT rf.id, rf.return_request_id AS returnId, rf.invoice_id AS invoiceId,
            rf.amount, rf.currency, rf.status, rf.transaction_reference AS transactionReference,
            rf.processed_at AS processedAt, rf.created_at AS createdAt,
            rr.reason, rr.status AS returnStatus, rr.purchase_order_id AS orderId,
            i.invoice_number AS invoiceNumber, po.buyer_id AS buyerId, po.supplier_id AS supplierId,
            bb.name AS buyerBusinessName, sb.name AS supplierBusinessName
     FROM refunds rf
     JOIN return_requests rr ON rr.id = rf.return_request_id
     JOIN invoices i ON i.id = rf.invoice_id
     JOIN purchase_orders po ON po.id = rr.purchase_order_id
     LEFT JOIN businesses bb ON bb.owner_user_id = po.buyer_id
     LEFT JOIN businesses sb ON sb.owner_user_id = po.supplier_id
     WHERE 1 = 1 ${scope.clause}
     ORDER BY rf.created_at DESC, rf.id DESC LIMIT ? OFFSET ?`,
    params,
  );
  return rows;
}

async function getRefund(refundId, { userId, role }) {
  const scope = access(role);
  const params = [refundId, ...scope.params];
  if (role !== 'ADMIN') params.push(userId);
  const [rows] = await getPool().execute(
    `SELECT rf.id, rf.return_request_id AS returnId, rf.invoice_id AS invoiceId,
            rf.amount, rf.currency, rf.status, rf.transaction_reference AS transactionReference,
            rf.processed_at AS processedAt, rf.created_at AS createdAt, rf.updated_at AS updatedAt,
            rr.reason, rr.description AS returnDescription, rr.status AS returnStatus,
            rr.purchase_order_id AS orderId, i.invoice_number AS invoiceNumber,
            i.amount AS invoiceAmount, i.status AS invoiceStatus,
            po.buyer_id AS buyerId, po.supplier_id AS supplierId,
            bb.name AS buyerBusinessName, sb.name AS supplierBusinessName
     FROM refunds rf
     JOIN return_requests rr ON rr.id = rf.return_request_id
     JOIN invoices i ON i.id = rf.invoice_id
     JOIN purchase_orders po ON po.id = rr.purchase_order_id
     LEFT JOIN businesses bb ON bb.owner_user_id = po.buyer_id
     LEFT JOIN businesses sb ON sb.owner_user_id = po.supplier_id
     WHERE rf.id = ? ${scope.clause} LIMIT 1`,
    params,
  );
  if (!rows.length) return null;
  const refund = rows[0];
  const [items] = await getPool().execute(
    `SELECT rri.quantity, oi.name, oi.unit, oi.unit_price AS unitPrice,
            ROUND(rri.quantity * oi.unit_price, 2) AS lineValue
     FROM return_request_items rri
     JOIN order_items oi ON oi.id = rri.order_item_id
     WHERE rri.return_request_id = ? ORDER BY rri.id`,
    [refund.returnId],
  );
  const [history] = await getPool().execute(
    `SELECT h.previous_status AS previousStatus, h.new_status AS newStatus,
            h.transaction_reference AS transactionReference, h.note,
            h.processed_at AS processedAt, h.created_at AS createdAt,
            u.name AS changedByName, u.role AS changedByRole
     FROM refund_history h JOIN users u ON u.id = h.changed_by
     WHERE h.refund_id = ? ORDER BY h.id`,
    [refundId],
  );
  return { ...refund, items, history };
}

async function updateRefund({
  refundId,
  adminId,
  status,
  transactionReference,
  processedAt,
  note,
}) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT rf.id, rf.invoice_id AS invoiceId, rf.return_request_id AS returnId,
              rf.amount, rf.currency, rf.status, rr.purchase_order_id AS orderId,
              po.buyer_id AS buyerId, po.supplier_id AS supplierId
       FROM refunds rf
       JOIN return_requests rr ON rr.id = rf.return_request_id
       JOIN purchase_orders po ON po.id = rr.purchase_order_id
       WHERE rf.id = ? FOR UPDATE`,
      [refundId],
    );
    if (!rows.length) {
      await connection.rollback();
      return 'NOT_FOUND';
    }
    const refund = rows[0];
    if (refund.status === 'NOT_APPLICABLE') {
      await connection.rollback();
      return 'INVALID_TRANSITION';
    }

    const allowed = {
      REFUND_PENDING: ['REFUND_PROCESSED', 'REFUND_FAILED'],
      REFUND_FAILED: ['REFUND_PENDING'],
    };
    if (!(allowed[refund.status] || []).includes(status)) {
      await connection.rollback();
      return 'INVALID_TRANSITION';
    }

    if (status === 'REFUND_PROCESSED') {
      const [invoices] = await connection.execute(
        'SELECT id FROM invoices WHERE id = ? FOR UPDATE',
        [refund.invoiceId],
      );
      if (!invoices.length) {
        await connection.rollback();
        return 'INVOICE_NOT_FOUND';
      }
      const [paidRows] = await connection.execute(
        `SELECT COALESCE(SUM(amount), 0) AS paidAmount
         FROM payments WHERE invoice_id = ? AND status IN ('PAID', 'COMPLETED')`,
        [refund.invoiceId],
      );
      const [otherRefundRows] = await connection.execute(
        `SELECT COALESCE(SUM(amount), 0) AS processedAmount
         FROM refunds
         WHERE invoice_id = ? AND id <> ? AND status = 'REFUND_PROCESSED'`,
        [refund.invoiceId, refundId],
      );
      if (Number(refund.amount) + Number(otherRefundRows[0].processedAmount)
          > Number(paidRows[0].paidAmount) + 0.001) {
        await connection.rollback();
        return 'REFUND_EXCEEDS_PAID';
      }
    }

    const nextReference = status === 'REFUND_PENDING' ? null : transactionReference;
    const nextProcessedAt = status === 'REFUND_PROCESSED' ? processedAt : null;
    await connection.execute(
      `UPDATE refunds
       SET status = ?, transaction_reference = ?, processed_at = ?, updated_by = ?
       WHERE id = ?`,
      [status, nextReference, nextProcessedAt, adminId, refundId],
    );
    await connection.execute(
      `INSERT INTO refund_history
         (refund_id, previous_status, new_status, transaction_reference, note, changed_by, processed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        refundId,
        refund.status,
        status,
        nextReference,
        note || null,
        adminId,
        nextProcessedAt,
      ],
    );
    for (const userId of [refund.buyerId, refund.supplierId]) {
      await connection.execute(
        `INSERT INTO notifications (user_id, type, message)
         VALUES (?, 'REFUND', ?)`,
        [userId, `Refund #${refundId} status changed to ${status}.`],
      );
    }
    await connection.commit();
    return getRefund(refundId, { userId: adminId, role: 'ADMIN' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { getRefund, listRefunds, updateRefund };
