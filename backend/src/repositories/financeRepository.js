const { getPool } = require('../config/db');

async function invoiceAccess(invoiceId, { userId, role }) {
  let ownerFilter = '';
  const params = [invoiceId];
  if (role === 'BUYER') {
    ownerFilter = 'AND po.buyer_id = ?';
    params.push(userId);
  } else if (role === 'SUPPLIER') {
    ownerFilter = 'AND po.supplier_id = ?';
    params.push(userId);
  }
  const [rows] = await getPool().execute(
    `SELECT i.id, i.purchase_order_id AS orderId, i.invoice_number AS invoiceNumber,
            i.amount, i.currency, i.status, i.due_at AS dueAt, i.created_at AS createdAt,
            po.buyer_id AS buyerId, po.supplier_id AS supplierId,
            bu.name AS buyerName, bu.email AS buyerEmail, bb.name AS buyerBusinessName,
            bb.address AS buyerAddress, su.name AS supplierName, su.email AS supplierEmail,
            sb.name AS supplierBusinessName, sb.address AS supplierAddress
     FROM invoices i JOIN purchase_orders po ON po.id = i.purchase_order_id
     JOIN users bu ON bu.id = po.buyer_id
     JOIN users su ON su.id = po.supplier_id
     LEFT JOIN businesses bb ON bb.owner_user_id = po.buyer_id
     LEFT JOIN businesses sb ON sb.owner_user_id = po.supplier_id
     WHERE i.id = ? ${ownerFilter} LIMIT 1`,
    params,
  );
  return rows[0] || null;
}

async function listInvoices({ userId, role, limit = 50, offset = 0 }) {
  let where = '';
  const params = [];
  if (role === 'BUYER') {
    where = 'WHERE po.buyer_id = ?';
    params.push(userId);
  } else if (role === 'SUPPLIER') {
    where = 'WHERE po.supplier_id = ?';
    params.push(userId);
  }
  params.push(limit, offset);
  const [rows] = await getPool().execute(
    `SELECT i.id, i.purchase_order_id AS orderId, i.invoice_number AS invoiceNumber,
            i.amount, i.currency, i.status, i.due_at AS dueAt, i.created_at AS createdAt
     FROM invoices i JOIN purchase_orders po ON po.id = i.purchase_order_id
     ${where} ORDER BY i.created_at DESC LIMIT ? OFFSET ?`,
    params,
  );
  return rows;
}

async function getInvoice(invoiceId, context) {
  const invoice = await invoiceAccess(invoiceId, context);
  if (!invoice) return null;
  const [items] = await getPool().execute(
    `SELECT id, name, quantity, unit, unit_price AS unitPrice, line_total AS lineTotal
     FROM invoice_items WHERE invoice_id = ? ORDER BY id`,
    [invoiceId],
  );
  const [payments] = await getPool().execute(
    `SELECT id, amount, currency, status, reference, paid_at AS paidAt, created_at AS createdAt
     FROM payments WHERE invoice_id = ? ORDER BY created_at`,
    [invoiceId],
  );
  return { ...invoice, items, payments };
}

async function createPayment({ invoiceId, userId, role, amount, status, idempotencyKey }) {
  if (!['BUYER', 'ADMIN'].includes(role)) return 'FORBIDDEN';
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const ownerFilter = role === 'BUYER' ? 'AND po.buyer_id = ?' : '';
    const params = role === 'BUYER' ? [invoiceId, userId] : [invoiceId];
    const [rows] = await connection.execute(
      `SELECT i.id, i.amount, i.currency, i.status AS invoiceStatus,
              po.id AS orderId, po.status AS orderStatus, po.buyer_id AS buyerId,
              po.supplier_id AS supplierId
       FROM invoices i JOIN purchase_orders po ON po.id = i.purchase_order_id
       WHERE i.id = ? ${ownerFilter} FOR UPDATE`,
      params,
    );
    if (!rows.length) {
      await connection.rollback();
      return 'NOT_FOUND';
    }
    const invoice = rows[0];
    if (invoice.invoiceStatus === 'VOID' || invoice.invoiceStatus === 'PAID') {
      await connection.rollback();
      return 'INVALID_STATE';
    }
    const [paidRows] = await connection.execute(
      `SELECT COALESCE(SUM(amount), 0) AS paid
       FROM payments WHERE invoice_id = ? AND status IN ('PAID', 'COMPLETED')`,
      [invoiceId],
    );
    const remaining = Number(invoice.amount) - Number(paidRows[0].paid);
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining + 0.001) {
      await connection.rollback();
      return 'INVALID_AMOUNT';
    }
    const [result] = await connection.execute(
      `INSERT INTO payments (invoice_id, amount, currency, status, reference, idempotency_key, paid_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceId,
        amount,
        invoice.currency,
        status,
        `manual-${idempotencyKey}`,
        idempotencyKey,
        status === 'PAID' ? new Date() : null,
      ],
    );
    let orderStatus = invoice.orderStatus;
    if (status === 'PAID') {
      const newPaidTotal = Number(paidRows[0].paid) + amount;
      if (newPaidTotal >= Number(invoice.amount) - 0.001) {
        await connection.execute("UPDATE invoices SET status = 'PAID' WHERE id = ?", [invoiceId]);
        const [changed] = await connection.execute(
          "UPDATE purchase_orders SET status = 'PAID' WHERE id = ? AND status = 'PAYMENT_PENDING'",
          [invoice.orderId],
        );
        if (changed.affectedRows) {
          await connection.execute(
            `INSERT INTO order_status_history
               (purchase_order_id, previous_status, new_status, changed_by, note)
             VALUES (?, 'PAYMENT_PENDING', 'PAID', ?, 'Payment fully recorded')`,
            [invoice.orderId, userId],
          );
          await connection.execute(
            "UPDATE purchase_orders SET status = 'COMPLETED' WHERE id = ? AND status = 'PAID'",
            [invoice.orderId],
          );
          await connection.execute(
            `INSERT INTO order_status_history
               (purchase_order_id, previous_status, new_status, changed_by, note)
             VALUES (?, 'PAID', 'COMPLETED', ?, 'Payment completed')`,
            [invoice.orderId, userId],
          );
          orderStatus = 'COMPLETED';
        }
        await connection.execute(
          `INSERT INTO notifications (user_id, type, message)
           VALUES (?, 'PAYMENT_UPDATED', ?)`,
          [invoice.supplierId, `Invoice payment for order #${invoice.orderId} has been recorded.`],
        );
      } else {
        await connection.execute("UPDATE invoices SET status = 'PARTIALLY_PAID' WHERE id = ?", [invoiceId]);
        orderStatus = 'PAYMENT_PENDING';
      }
    } else if (status === 'FAILED') {
      await connection.execute(
        `INSERT INTO notifications (user_id, type, message)
         VALUES (?, 'PAYMENT_UPDATED', ?)`,
        [invoice.supplierId, `A payment attempt for order #${invoice.orderId} failed.`],
      );
    }
    await connection.commit();
    return { paymentId: result.insertId, orderStatus };
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') return 'DUPLICATE';
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { createPayment, getInvoice, invoiceAccess, listInvoices };
