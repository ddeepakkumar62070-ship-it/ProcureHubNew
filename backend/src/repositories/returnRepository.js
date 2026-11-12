const { getPool } = require('../config/db');
const { paginationClause } = require('../utils/pagination');

async function notify(connection, userId, message) {
  await connection.execute(
    `INSERT INTO notifications (user_id, type, message)
     VALUES (?, 'RETURN', ?)`,
    [userId, message],
  );
}

async function getReturn(returnId, { userId, role }) {
  const ownerFilter = role === 'BUYER'
    ? 'AND po.buyer_id = ?'
    : role === 'SUPPLIER' ? 'AND po.supplier_id = ?' : '';
  const params = role === 'ADMIN' ? [returnId] : [returnId, userId];
  const [rows] = await getPool().execute(
    `SELECT rr.id, rr.purchase_order_id AS orderId, rr.requested_by AS requestedBy,
            rr.status, rr.reason, rr.description, rr.decision_by AS decisionBy,
            rr.decision_explanation AS decisionExplanation, rr.created_at AS createdAt,
            rr.updated_at AS updatedAt, po.buyer_id AS buyerId, po.supplier_id AS supplierId,
            rf.id AS refundId, rf.amount AS refundAmount, rf.currency AS refundCurrency,
            rf.status AS refundStatus, rf.transaction_reference AS refundReference,
            rf.processed_at AS refundProcessedAt,
            bb.name AS buyerBusinessName, sb.name AS supplierBusinessName
     FROM return_requests rr
     JOIN purchase_orders po ON po.id = rr.purchase_order_id
     LEFT JOIN refunds rf ON rf.return_request_id = rr.id
     LEFT JOIN businesses bb ON bb.owner_user_id = po.buyer_id
     LEFT JOIN businesses sb ON sb.owner_user_id = po.supplier_id
     WHERE rr.id = ? ${ownerFilter} LIMIT 1`,
    params,
  );
  if (!rows.length) return null;
  const record = rows[0];
  const [items] = await getPool().execute(
    `SELECT rri.id, rri.order_item_id AS orderItemId, rri.quantity,
            oi.name, oi.unit, oi.unit_price AS unitPrice
     FROM return_request_items rri
     JOIN order_items oi ON oi.id = rri.order_item_id
     WHERE rri.return_request_id = ? ORDER BY rri.id`,
    [returnId],
  );
  const [history] = await getPool().execute(
    `SELECT h.previous_status AS previousStatus, h.new_status AS newStatus,
            h.note, h.created_at AS createdAt, u.name AS changedByName
     FROM return_request_history h JOIN users u ON u.id = h.changed_by
     WHERE h.return_request_id = ? ORDER BY h.id`,
    [returnId],
  );
  return { ...record, items, history };
}

async function listReturns({ userId, role, limit = 50, offset = 0 }) {
  const filters = [];
  const params = [];
  if (role === 'BUYER') {
    filters.push('po.buyer_id = ?');
    params.push(userId);
  } else if (role === 'SUPPLIER') {
    filters.push('po.supplier_id = ?');
    params.push(userId);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const [rows] = await getPool().execute(
    `SELECT rr.id, rr.purchase_order_id AS orderId, rr.requested_by AS requestedBy,
            rr.status, rr.reason, rr.description, rr.decision_explanation AS decisionExplanation,
            rr.created_at AS createdAt, po.buyer_id AS buyerId, po.supplier_id AS supplierId,
            rf.id AS refundId, rf.amount AS refundAmount, rf.currency AS refundCurrency,
            rf.status AS refundStatus, rf.transaction_reference AS refundReference,
            rf.processed_at AS refundProcessedAt,
            bb.name AS buyerBusinessName, sb.name AS supplierBusinessName
     FROM return_requests rr JOIN purchase_orders po ON po.id = rr.purchase_order_id
     LEFT JOIN refunds rf ON rf.return_request_id = rr.id
     LEFT JOIN businesses bb ON bb.owner_user_id = po.buyer_id
     LEFT JOIN businesses sb ON sb.owner_user_id = po.supplier_id
     ${where} ORDER BY rr.created_at DESC ${paginationClause(limit, offset)}`,
    params,
  );
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => '?').join(', ');
  const [items] = await getPool().execute(
    `SELECT rri.return_request_id AS returnId, rri.order_item_id AS orderItemId,
            rri.quantity, oi.name, oi.unit
     FROM return_request_items rri JOIN order_items oi ON oi.id = rri.order_item_id
     WHERE rri.return_request_id IN (${placeholders}) ORDER BY rri.id`,
    ids,
  );
  const grouped = new Map();
  for (const item of items) {
    const group = grouped.get(item.returnId) || [];
    group.push(item);
    grouped.set(item.returnId, group);
  }
  return rows.map((row) => ({ ...row, items: grouped.get(row.id) || [] }));
}

async function createReturn({ orderId, buyerId, reason, description, items }) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [orders] = await connection.execute(
      `SELECT id, status, supplier_id AS supplierId FROM purchase_orders
       WHERE id = ? AND buyer_id = ? FOR UPDATE`,
      [orderId, buyerId],
    );
    if (!orders.length) {
      await connection.rollback();
      return 'NOT_FOUND';
    }
    if (!['DELIVERED', 'PAYMENT_PENDING', 'PAID', 'COMPLETED'].includes(orders[0].status)) {
      await connection.rollback();
      return 'INELIGIBLE_ORDER';
    }
    const [orderItems] = await connection.execute(
      `SELECT id, quantity FROM order_items
       WHERE purchase_order_id = ? ORDER BY id FOR UPDATE`,
      [orderId],
    );
    const uniqueIds = new Set(items.map((item) => Number(item.orderItemId)));
    if (uniqueIds.size !== items.length) {
      await connection.rollback();
      return 'DUPLICATE_ITEM';
    }
    for (const item of items) {
      const purchased = orderItems.find((orderItem) => Number(orderItem.id) === Number(item.orderItemId));
      if (!purchased) {
        await connection.rollback();
        return 'INVALID_ITEM';
      }
      const [claimedRows] = await connection.execute(
        `SELECT COALESCE(SUM(rri.quantity), 0) AS claimed
         FROM return_request_items rri
         JOIN return_requests rr ON rr.id = rri.return_request_id
         WHERE rri.order_item_id = ? AND rr.status <> 'RETURN_REJECTED'`,
        [item.orderItemId],
      );
      const remaining = Number(purchased.quantity) - Number(claimedRows[0].claimed);
      if (Number(item.quantity) > remaining + 0.0005) {
        await connection.rollback();
        return 'EXCESS_QUANTITY';
      }
    }

    const [result] = await connection.execute(
      `INSERT INTO return_requests
         (purchase_order_id, requested_by, reason, description)
       VALUES (?, ?, ?, ?)`,
      [orderId, buyerId, reason, description || null],
    );
    for (const item of items) {
      await connection.execute(
        `INSERT INTO return_request_items (return_request_id, order_item_id, quantity)
         VALUES (?, ?, ?)`,
        [result.insertId, item.orderItemId, item.quantity],
      );
    }
    await connection.execute(
      `INSERT INTO return_request_history
         (return_request_id, previous_status, new_status, changed_by, note)
       VALUES (?, NULL, 'RETURN_REQUESTED', ?, ?)`,
      [result.insertId, buyerId, reason],
    );
    await notify(connection, orders[0].supplierId, `Return request #${result.insertId} was submitted.`);
    await connection.commit();
    return getReturn(result.insertId, { userId: buyerId, role: 'BUYER' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateReturnStatus({ returnId, supplierId, status, explanation }) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT rr.id, rr.purchase_order_id AS orderId, rr.status,
              po.supplier_id AS supplierId, po.buyer_id AS buyerId
       FROM return_requests rr JOIN purchase_orders po ON po.id = rr.purchase_order_id
       WHERE rr.id = ? FOR UPDATE`,
      [returnId],
    );
    if (!rows.length) {
      await connection.rollback();
      return 'NOT_FOUND';
    }
    const current = rows[0];
    if (Number(current.supplierId) !== Number(supplierId)) {
      await connection.rollback();
      return 'FORBIDDEN';
    }
    const allowed = {
      RETURN_REQUESTED: ['RETURN_APPROVED', 'RETURN_REJECTED'],
      RETURN_APPROVED: ['RETURN_COMPLETED'],
    };
    if (!(allowed[current.status] || []).includes(status)) {
      await connection.rollback();
      return 'INVALID_TRANSITION';
    }
    if (status === 'RETURN_REJECTED' && !explanation?.trim()) {
      await connection.rollback();
      return 'EXPLANATION_REQUIRED';
    }

    if (status === 'RETURN_APPROVED') {
      const [invoices] = await connection.execute(
        `SELECT i.id, i.amount, i.currency
         FROM invoices i WHERE i.purchase_order_id = ? FOR UPDATE`,
        [current.orderId],
      );
      if (!invoices.length) {
        await connection.rollback();
        return 'INVOICE_NOT_FOUND';
      }
      const invoice = invoices[0];
      const [returnValueRows] = await connection.execute(
        `SELECT COALESCE(SUM(rri.quantity * oi.unit_price), 0) AS returnValue
         FROM return_request_items rri
         JOIN order_items oi ON oi.id = rri.order_item_id
         WHERE rri.return_request_id = ?`,
        [returnId],
      );
      const [paidRows] = await connection.execute(
        `SELECT COALESCE(SUM(amount), 0) AS paidAmount
         FROM payments WHERE invoice_id = ? AND status IN ('PAID', 'COMPLETED')`,
        [invoice.id],
      );
      const [reservedRows] = await connection.execute(
        `SELECT COALESCE(SUM(amount), 0) AS reservedAmount
         FROM refunds
         WHERE invoice_id = ? AND status IN ('REFUND_PENDING', 'REFUND_PROCESSED')`,
        [invoice.id],
      );
      const returnValue = Number(Number(returnValueRows[0].returnValue).toFixed(2));
      const refundableBalance = Math.max(
        0,
        Number(paidRows[0].paidAmount) - Number(reservedRows[0].reservedAmount),
      );
      const refundAmount = Number(Math.min(returnValue, refundableBalance).toFixed(2));
      const refundStatus = refundAmount > 0 ? 'REFUND_PENDING' : 'NOT_APPLICABLE';
      const [refundResult] = await connection.execute(
        `INSERT INTO refunds
           (return_request_id, invoice_id, amount, currency, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [returnId, invoice.id, refundAmount, invoice.currency, refundStatus, supplierId],
      );
      await connection.execute(
        `INSERT INTO refund_history (refund_id, previous_status, new_status, note, changed_by)
         VALUES (?, NULL, ?, ?, ?)`,
        [
          refundResult.insertId,
          refundStatus,
          refundAmount > 0
            ? 'Refund calculated from returned order items and remaining paid invoice balance.'
            : 'No paid invoice balance is available for refund.',
          supplierId,
        ],
      );
      await connection.execute(
        `INSERT INTO notifications (user_id, type, message)
         VALUES (?, 'REFUND', ?)`,
        [current.buyerId, `A refund record was created for return request #${returnId}.`],
      );
    }

    if (status === 'RETURN_COMPLETED') {
      const [returnItems] = await connection.execute(
        `SELECT rri.id AS returnItemId, rri.quantity, oi.product_id AS productId,
                p.supplier_id AS productSupplierId, i.product_id AS inventoryProductId
         FROM return_request_items rri
         JOIN order_items oi ON oi.id = rri.order_item_id
         LEFT JOIN products p ON p.id = oi.product_id
         LEFT JOIN inventory i ON i.product_id = p.id
         WHERE rri.return_request_id = ?
         ORDER BY rri.id FOR UPDATE`,
        [returnId],
      );
      for (const item of returnItems) {
        if (item.productId === null) continue;
        if (Number(item.productSupplierId) !== Number(current.supplierId)
            || item.inventoryProductId === null) {
          await connection.rollback();
          return 'INVENTORY_UNAVAILABLE';
        }
        const [inventoryUpdate] = await connection.execute(
          `UPDATE inventory SET quantity = quantity + ?
           WHERE product_id = ?`,
          [item.quantity, item.productId],
        );
        if (inventoryUpdate.affectedRows !== 1) {
          await connection.rollback();
          return 'INVENTORY_UNAVAILABLE';
        }
        await connection.execute(
          `INSERT INTO return_inventory_movements
             (return_request_item_id, product_id, supplier_id, quantity)
           VALUES (?, ?, ?, ?)`,
          [item.returnItemId, item.productId, current.supplierId, item.quantity],
        );
      }
    }

    await connection.execute(
      `UPDATE return_requests
       SET status = ?, decision_by = CASE WHEN ? IN ('RETURN_APPROVED', 'RETURN_REJECTED')
         THEN ? ELSE decision_by END,
         decision_explanation = CASE WHEN ? <> '' THEN ? ELSE decision_explanation END
       WHERE id = ?`,
      [status, status, supplierId, explanation || '', explanation || null, returnId],
    );
    await connection.execute(
      `INSERT INTO return_request_history
         (return_request_id, previous_status, new_status, changed_by, note)
       VALUES (?, ?, ?, ?, ?)`,
      [returnId, current.status, status, supplierId, explanation || null],
    );
    await notify(connection, current.buyerId, `Return request #${returnId} status changed to ${status}.`);
    await connection.commit();
    return getReturn(returnId, { userId: supplierId, role: 'SUPPLIER' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { createReturn, getReturn, listReturns, updateReturnStatus };
