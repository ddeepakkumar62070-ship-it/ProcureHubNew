const { getPool } = require('../config/db');

async function notify(connection, userId, type, message) {
  await connection.execute(
    'INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)',
    [userId, type, message],
  );
}

async function listRequests({ userId, role, status, limit = 50, offset = 0 }) {
  const conditions = [];
  const params = [];
  if (role === 'BUYER') {
    conditions.push('pr.buyer_id = ?');
    params.push(userId);
  } else if (role === 'SUPPLIER') {
    conditions.push("pr.status = 'OPEN'");
  }
  if (status) {
    conditions.push('pr.status = ?');
    params.push(status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);
  const [requests] = await getPool().execute(
    `SELECT pr.id, pr.buyer_id AS buyerId, pr.title, c.name AS category,
            pr.status, pr.delivery_address AS deliveryAddress,
            pr.delivery_deadline AS deliveryDeadline, pr.notes, pr.expires_at AS expiresAt,
            pr.created_at AS createdAt
     FROM purchase_requests pr
     LEFT JOIN categories c ON c.id = pr.category_id
     ${where}
     ORDER BY pr.created_at DESC LIMIT ? OFFSET ?`,
    params,
  );
  if (!requests.length) return [];
  const ids = requests.map((request) => request.id);
  const placeholders = ids.map(() => '?').join(', ');
  const [items] = await getPool().execute(
    `SELECT id, purchase_request_id AS requestId, name, quantity, unit, product_id AS productId
     FROM purchase_request_items
     WHERE purchase_request_id IN (${placeholders}) ORDER BY id`,
    ids,
  );
  const itemsByRequest = new Map();
  for (const item of items) {
    const group = itemsByRequest.get(item.requestId) || [];
    group.push(item);
    itemsByRequest.set(item.requestId, group);
  }
  return requests.map((request) => ({ ...request, items: itemsByRequest.get(request.id) || [] }));
}

async function findRequest(requestId, { userId, role }) {
  const [rows] = await getPool().execute(
    `SELECT pr.id, pr.buyer_id AS buyerId, pr.title, c.name AS category,
            pr.status, pr.delivery_address AS deliveryAddress,
            pr.delivery_deadline AS deliveryDeadline, pr.notes, pr.expires_at AS expiresAt,
            pr.created_at AS createdAt
     FROM purchase_requests pr LEFT JOIN categories c ON c.id = pr.category_id
     WHERE pr.id = ?`,
    [requestId],
  );
  if (!rows.length) return null;
  const request = rows[0];
  if (role === 'BUYER' && Number(request.buyerId) !== Number(userId)) return 'FORBIDDEN';
  if (role === 'SUPPLIER' && request.status !== 'OPEN') return 'NOT_FOUND';
  const [items] = await getPool().execute(
    `SELECT id, purchase_request_id AS requestId, name, quantity, unit, product_id AS productId
     FROM purchase_request_items WHERE purchase_request_id = ? ORDER BY id`,
    [requestId],
  );
  const [quotations] = await getPool().execute(
    `SELECT q.id, q.supplier_id AS supplierId, b.name AS supplierName, q.amount, q.currency,
            q.status, q.message, q.delivery_days AS deliveryDays, q.terms,
            q.valid_until AS validUntil, q.created_at AS createdAt
     FROM quotations q LEFT JOIN businesses b ON b.owner_user_id = q.supplier_id
     WHERE q.purchase_request_id = ? ORDER BY q.amount, q.created_at`,
    [requestId],
  );
  for (const quotation of quotations) {
    const [quoteItems] = await getPool().execute(
      `SELECT id, purchase_request_item_id AS requestItemId, name, quantity, unit,
              unit_price AS unitPrice
       FROM quotation_items WHERE quotation_id = ? ORDER BY id`,
      [quotation.id],
    );
    quotation.items = quoteItems;
  }
  return { ...request, items, quotations };
}

async function createRequest({
  buyerId, title, category, items, deliveryAddress, deliveryDeadline, notes, expiresAt,
}) {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [categories] = await connection.execute(
      'SELECT id FROM categories WHERE name = ? AND is_active = TRUE LIMIT 1',
      [category],
    );
    if (!categories.length) {
      const error = new Error('Category not found or inactive.');
      error.code = 'CATEGORY_NOT_FOUND';
      throw error;
    }

    const productIds = items.map((item) => item.productId).filter(Boolean);
    if (productIds.length) {
      const [products] = await connection.execute(
        `SELECT id FROM products WHERE is_active = TRUE AND id IN (${productIds.map(() => '?').join(', ')})`,
        productIds,
      );
      if (products.length !== new Set(productIds.map(Number)).size) {
        const error = new Error('One or more selected products are unavailable.');
        error.code = 'PRODUCT_NOT_FOUND';
        throw error;
      }
    }
    const [result] = await connection.execute(
      `INSERT INTO purchase_requests
         (buyer_id, title, category_id, delivery_address, delivery_deadline, notes, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [buyerId, title, categories[0].id, deliveryAddress || null, deliveryDeadline || null, notes || null, expiresAt || null],
    );
    for (const item of items) {
      await connection.execute(
        `INSERT INTO purchase_request_items (purchase_request_id, product_id, name, quantity, unit)
         VALUES (?, ?, ?, ?, ?)`,
        [result.insertId, item.productId || null, item.name, item.quantity, item.unit],
      );
    }
    const [suppliers] = await connection.execute(
      "SELECT id FROM users WHERE role = 'SUPPLIER' AND is_active = TRUE",
    );
    for (const supplier of suppliers) {
      await notify(connection, supplier.id, 'PURCHASE_REQUEST', `A buyer posted a purchase request: ${title}`);
    }
    await connection.commit();
    const created = await findRequest(result.insertId, { userId: buyerId, role: 'BUYER' });
    return created;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listQuotations({ userId, role, limit = 50, offset = 0 }) {
  let where = '';
  const params = [];
  if (role === 'SUPPLIER') {
    where = 'WHERE q.supplier_id = ?';
    params.push(userId);
  } else if (role === 'BUYER') {
    where = 'WHERE pr.buyer_id = ?';
    params.push(userId);
  }
  params.push(limit, offset);
  const [rows] = await getPool().execute(
    `SELECT q.id, q.purchase_request_id AS requestId, q.supplier_id AS supplierId,
            b.name AS supplierName, q.amount, q.currency, q.status, q.message,
            q.delivery_days AS deliveryDays, q.terms, q.valid_until AS validUntil,
            q.created_at AS createdAt
     FROM quotations q
     JOIN purchase_requests pr ON pr.id = q.purchase_request_id
     LEFT JOIN businesses b ON b.owner_user_id = q.supplier_id
     ${where}
     ORDER BY q.created_at DESC LIMIT ? OFFSET ?`,
    params,
  );
  for (const quotation of rows) {
    const [items] = await getPool().execute(
      `SELECT id, purchase_request_item_id AS requestItemId, name, quantity, unit,
              unit_price AS unitPrice
       FROM quotation_items WHERE quotation_id = ? ORDER BY id`,
      [quotation.id],
    );
    quotation.items = items;
  }
  return rows;
}

async function createQuotation({
  supplierId, requestId, amount, message, items, deliveryDays, terms, validUntil,
}) {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [requests] = await connection.execute(
      `SELECT pr.id, pr.buyer_id AS buyerId
       FROM purchase_requests pr
       WHERE pr.id = ? AND pr.status = 'OPEN'
         AND (pr.expires_at IS NULL OR pr.expires_at > CURRENT_TIMESTAMP)
       FOR UPDATE`,
      [requestId],
    );
    if (!requests.length) {
      const error = new Error('Open purchase request not found or expired.');
      error.code = 'REQUEST_NOT_FOUND';
      throw error;
    }
    const [requestItems] = await connection.execute(
      `SELECT pri.id, pri.product_id AS productId, pri.name, pri.quantity, pri.unit,
              p.supplier_id AS productSupplierId, p.is_active AS productActive
       FROM purchase_request_items pri
       LEFT JOIN products p ON p.id = pri.product_id
       WHERE pri.purchase_request_id = ?
       ORDER BY pri.id
       FOR UPDATE`,
      [requestId],
    );
    if (!items.length || items.length !== requestItems.length) {
      const error = new Error('A quotation must price every item in the purchase request.');
      error.code = 'INVALID_QUOTATION_ITEMS';
      throw error;
    }
    if (new Set(items.map((item) => Number(item.requestItemId))).size !== items.length) {
      const error = new Error('Each requested line can only appear once in a quotation.');
      error.code = 'INVALID_QUOTATION_ITEMS';
      throw error;
    }
    let calculatedTotal = 0;
    const normalizedItems = [];
    for (const quotedItem of items) {
      const requested = requestItems.find((item) => Number(item.id) === Number(quotedItem.requestItemId));
      const unitPrice = Number(quotedItem.unitPrice);
      if (!requested || !Number.isFinite(unitPrice) || unitPrice < 0
          || Number(quotedItem.quantity) !== Number(requested.quantity)) {
        const error = new Error('Quotation line item does not match the requested item and quantity.');
        error.code = 'INVALID_QUOTATION_ITEMS';
        throw error;
      }
      if (requested.productId && (Number(requested.productSupplierId) !== Number(supplierId) || !requested.productActive)) {
        const error = new Error('You can only quote products owned by your supplier account.');
        error.code = 'FORBIDDEN_PRODUCT';
        throw error;
      }
      calculatedTotal += unitPrice * Number(requested.quantity);
      normalizedItems.push({
        requestItemId: requested.id,
        name: requested.name,
        quantity: requested.quantity,
        unit: requested.unit,
        unitPrice,
      });
    }
    const total = Number(calculatedTotal.toFixed(2));
    if (amount !== undefined && Math.abs(Number(amount) - total) > 0.01) {
      const error = new Error('Quotation total must equal the sum of its line items.');
      error.code = 'INVALID_QUOTATION_ITEMS';
      throw error;
    }
    const [result] = await connection.execute(
      `INSERT INTO quotations
         (purchase_request_id, supplier_id, amount, message, delivery_days, terms, valid_until)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [requestId, supplierId, total, message || null, deliveryDays || null, terms || null, validUntil || null],
    );
    for (const item of normalizedItems) {
      await connection.execute(
        `INSERT INTO quotation_items
           (quotation_id, purchase_request_item_id, name, quantity, unit, unit_price)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [result.insertId, item.requestItemId, item.name, item.quantity, item.unit, item.unitPrice],
      );
    }
    await notify(connection, requests[0].buyerId, 'QUOTATION_RECEIVED', 'A supplier submitted a quotation for your purchase request.');
    await connection.commit();
    const [rows] = await pool.execute(
      `SELECT q.id, q.purchase_request_id AS requestId, q.supplier_id AS supplierId,
              b.name AS supplierName, q.amount, q.currency, q.status, q.message,
              q.delivery_days AS deliveryDays, q.terms, q.valid_until AS validUntil,
              q.created_at AS createdAt
       FROM quotations q LEFT JOIN businesses b ON b.owner_user_id = q.supplier_id
       WHERE q.id = ?`,
      [result.insertId],
    );
    return { ...rows[0], items: normalizedItems };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateQuotationStatus({ quotationId, userId, role, status }) {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT q.id, q.purchase_request_id AS requestId, q.supplier_id AS supplierId,
              pr.buyer_id AS buyerId, q.status, q.valid_until AS validUntil
       FROM quotations q
       JOIN purchase_requests pr ON pr.id = q.purchase_request_id
       WHERE q.id = ? FOR UPDATE`,
      [quotationId],
    );
    if (!rows.length) {
      await connection.rollback();
      return 'NOT_FOUND';
    }
    const quote = rows[0];
    if (quote.validUntil && new Date(quote.validUntil) <= new Date()) {
      await connection.rollback();
      return 'INVALID_STATE';
    }
    const buyerAction = role === 'BUYER' && Number(quote.buyerId) === Number(userId)
      && ['ACCEPTED', 'REJECTED'].includes(status)
      && ['PENDING', 'REVISED'].includes(quote.status);
    const supplierAction = role === 'SUPPLIER' && Number(quote.supplierId) === Number(userId)
      && status === 'REVISED' && ['PENDING', 'REVISED'].includes(quote.status);
    if (!buyerAction && !supplierAction) {
      await connection.rollback();
      return 'FORBIDDEN';
    }
    await connection.execute('UPDATE quotations SET status = ? WHERE id = ?', [status, quotationId]);
    if (buyerAction) {
      if (status === 'ACCEPTED') {
        await connection.execute(
          `UPDATE quotations SET status = 'REJECTED'
           WHERE purchase_request_id = ? AND id <> ? AND status IN ('PENDING', 'REVISED')`,
          [quote.requestId, quotationId],
        );
      }
      await notify(
        connection,
        quote.supplierId,
        status === 'ACCEPTED' ? 'QUOTATION_ACCEPTED' : 'QUOTATION_REJECTED',
        `Your quotation for purchase request #${quote.requestId} was ${status.toLowerCase()}.`,
      );
    }
    await connection.commit();
    return 'UPDATED';
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function createOrderAttempt({ buyerId, quotationId }) {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [quotes] = await connection.execute(
      `SELECT q.id, q.purchase_request_id AS requestId, q.supplier_id AS supplierId,
              q.amount, q.currency, q.valid_until AS validUntil,
              pr.buyer_id AS buyerId, pr.status AS requestStatus,
              q.status AS quoteStatus, pr.title
       FROM quotations q JOIN purchase_requests pr ON pr.id = q.purchase_request_id
       WHERE q.id = ? FOR UPDATE`,
      [quotationId],
    );
    if (!quotes.length || Number(quotes[0].buyerId) !== Number(buyerId)) {
      await connection.rollback();
      return 'NOT_FOUND';
    }
    const quote = quotes[0];
    if (quote.quoteStatus !== 'ACCEPTED' || quote.requestStatus !== 'OPEN'
        || (quote.validUntil && new Date(quote.validUntil) <= new Date())) {
      await connection.rollback();
      return 'NOT_ACCEPTED';
    }
    const [quotedItems] = await connection.execute(
      `SELECT qi.purchase_request_item_id AS requestItemId, qi.name, qi.quantity,
              qi.unit, qi.unit_price AS unitPrice, pri.product_id AS productId
       FROM quotation_items qi
       JOIN purchase_request_items pri ON pri.id = qi.purchase_request_item_id
       WHERE qi.quotation_id = ? ORDER BY pri.product_id, pri.id`,
      [quotationId],
    );
    if (!quotedItems.length) {
      await connection.rollback();
      return 'NO_ITEMS';
    }
    const [result] = await connection.execute(
      `INSERT INTO purchase_orders
         (quotation_id, purchase_request_id, buyer_id, supplier_id, total_amount, currency, status)
       VALUES (?, ?, ?, ?, ?, ?, 'PO_CREATED')`,
      [quote.id, quote.requestId, buyerId, quote.supplierId, quote.amount, quote.currency],
    );
    const orderId = result.insertId;
    const quantitiesByProduct = new Map();
    for (const item of quotedItems) {
      await connection.execute(
        `INSERT INTO order_items
           (purchase_order_id, product_id, name, quantity, unit, unit_price)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, item.productId, item.name, item.quantity, item.unit, item.unitPrice],
      );
      if (item.productId) {
        quantitiesByProduct.set(
          Number(item.productId),
          (quantitiesByProduct.get(Number(item.productId)) || 0) + Number(item.quantity),
        );
      }
    }
    for (const [productId, quantity] of [...quantitiesByProduct].sort(([a], [b]) => a - b)) {
      const [inventory] = await connection.execute(
        `SELECT i.quantity, i.reserved_quantity AS reservedQuantity
         FROM inventory i JOIN products p ON p.id = i.product_id
         WHERE i.product_id = ? AND p.is_active = TRUE AND p.supplier_id = ?
         FOR UPDATE`,
        [productId, quote.supplierId],
      );
      if (!inventory.length || Number(inventory[0].quantity) - Number(inventory[0].reservedQuantity) < quantity) {
        await connection.rollback();
        return 'INSUFFICIENT_STOCK';
      }
      await connection.execute(
        'UPDATE inventory SET reserved_quantity = reserved_quantity + ? WHERE product_id = ?',
        [quantity, productId],
      );
      await connection.execute(
        `INSERT INTO inventory_reservations (purchase_order_id, product_id, quantity)
         VALUES (?, ?, ?)`,
        [orderId, productId, quantity],
      );
    }
    await connection.execute(
      `UPDATE purchase_requests SET status = 'AWARDED' WHERE id = ?`,
      [quote.requestId],
    );
    await connection.execute(
      `INSERT INTO order_status_history (purchase_order_id, previous_status, new_status, changed_by)
       VALUES (?, NULL, 'PO_CREATED', ?)`,
      [orderId, buyerId],
    );
    await notify(connection, quote.supplierId, 'PURCHASE_ORDER', `A buyer created purchase order #${orderId}.`);
    await connection.commit();
    return {
      id: orderId,
      requestId: quote.requestId,
      buyerId: Number(buyerId),
      supplierId: quote.supplierId,
      totalAmount: quote.amount,
      currency: quote.currency,
      status: 'PO_CREATED',
      items: quotedItems,
    };
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') return 'ALREADY_ORDERED';
    throw error;
  } finally {
    connection.release();
  }
}

async function createOrder(args) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await createOrderAttempt(args);
    } catch (error) {
      if (error.code !== 'ER_LOCK_DEADLOCK' || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
  throw new Error('Order creation retry loop ended unexpectedly.');
}

async function listOrders({ userId, role, limit = 50, offset = 0 }) {
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
    `SELECT po.id, po.purchase_request_id AS requestId, po.buyer_id AS buyerId,
            po.supplier_id AS supplierId, po.total_amount AS totalAmount,
            po.currency, po.status, po.created_at AS createdAt,
            bb.name AS buyerBusinessName, sb.name AS supplierBusinessName
     FROM purchase_orders po
     LEFT JOIN businesses bb ON bb.owner_user_id = po.buyer_id
     LEFT JOIN businesses sb ON sb.owner_user_id = po.supplier_id
     ${where}
     ORDER BY po.created_at DESC LIMIT ? OFFSET ?`,
    params,
  );
  for (const order of rows) {
    const [items] = await getPool().execute(
      `SELECT id, product_id AS productId, name, quantity, unit, unit_price AS unitPrice
       FROM order_items WHERE purchase_order_id = ? ORDER BY id`,
      [order.id],
    );
    order.items = items;
  }
  return rows;
}

async function getOrder(orderId, { userId, role }) {
  let condition = '';
  const params = [orderId];
  if (role === 'BUYER') {
    condition = ' AND po.buyer_id = ?';
    params.push(userId);
  } else if (role === 'SUPPLIER') {
    condition = ' AND po.supplier_id = ?';
    params.push(userId);
  }
  const [rows] = await getPool().execute(
    `SELECT po.id, po.purchase_request_id AS requestId, po.quotation_id AS quotationId,
            po.buyer_id AS buyerId, po.supplier_id AS supplierId, po.total_amount AS totalAmount,
            po.currency, po.status, po.created_at AS createdAt,
            bb.name AS buyerBusinessName, sb.name AS supplierBusinessName
     FROM purchase_orders po
     LEFT JOIN businesses bb ON bb.owner_user_id = po.buyer_id
     LEFT JOIN businesses sb ON sb.owner_user_id = po.supplier_id
     WHERE po.id = ? ${condition} LIMIT 1`,
    params,
  );
  if (!rows.length) return null;
  const order = rows[0];
  const [items] = await getPool().execute(
    `SELECT id, product_id AS productId, name, quantity, unit, unit_price AS unitPrice
     FROM order_items WHERE purchase_order_id = ? ORDER BY id`,
    [orderId],
  );
  const [history] = await getPool().execute(
    `SELECT h.previous_status AS previousStatus, h.new_status AS newStatus,
            h.note, h.changed_by AS changedBy, u.name AS changedByName, h.created_at AS createdAt
     FROM order_status_history h JOIN users u ON u.id = h.changed_by
     WHERE h.purchase_order_id = ? ORDER BY h.id`,
    [orderId],
  );
  return { ...order, items, history };
}

const transitions = {
  PO_CREATED: { SUPPLIER: ['CONFIRMED', 'REJECTED'], ADMIN: ['CONFIRMED', 'REJECTED', 'CANCELLED'] },
  CONFIRMED: { SUPPLIER: ['PROCESSING'], ADMIN: ['PROCESSING', 'CANCELLED'] },
  PROCESSING: { SUPPLIER: ['SHIPPED'], ADMIN: ['SHIPPED', 'CANCELLED'] },
  SHIPPED: { SUPPLIER: ['OUT_FOR_DELIVERY'], ADMIN: ['OUT_FOR_DELIVERY'] },
  OUT_FOR_DELIVERY: { SUPPLIER: ['DELIVERED'], ADMIN: ['DELIVERED'] },
};

async function updateOrderStatus({ orderId, userId, role, status, note }) {
  if (!['CONFIRMED', 'REJECTED', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'].includes(status)) {
    return 'INVALID_STATUS';
  }
  if (!['SUPPLIER', 'ADMIN'].includes(role)) return 'FORBIDDEN';
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT id, buyer_id AS buyerId, supplier_id AS supplierId, status
       FROM purchase_orders WHERE id = ? FOR UPDATE`,
      [orderId],
    );
    if (!rows.length) {
      await connection.rollback();
      return 'NOT_FOUND';
    }
    const order = rows[0];
    if (role === 'SUPPLIER' && Number(order.supplierId) !== Number(userId)) {
      await connection.rollback();
      return 'FORBIDDEN';
    }
    if (!(transitions[order.status]?.[role] || []).includes(status)) {
      await connection.rollback();
      return 'INVALID_TRANSITION';
    }
    if (status === 'REJECTED' || status === 'CANCELLED') {
      const [reservations] = await connection.execute(
        `SELECT product_id AS productId, quantity FROM inventory_reservations
         WHERE purchase_order_id = ? AND status = 'RESERVED' FOR UPDATE`,
        [orderId],
      );
      for (const reservation of reservations) {
        const [released] = await connection.execute(
          `UPDATE inventory SET reserved_quantity = reserved_quantity - ?
           WHERE product_id = ? AND reserved_quantity >= ?`,
          [reservation.quantity, reservation.productId, reservation.quantity],
        );
        if (!released.affectedRows) {
          throw new Error('Inventory reservation could not be released consistently.');
        }
      }
      await connection.execute(
        `UPDATE inventory_reservations SET status = 'RELEASED'
         WHERE purchase_order_id = ? AND status = 'RESERVED'`,
        [orderId],
      );
    }
    await connection.execute('UPDATE purchase_orders SET status = ? WHERE id = ?', [status, orderId]);
    await connection.execute(
      `INSERT INTO order_status_history (purchase_order_id, previous_status, new_status, changed_by, note)
       VALUES (?, ?, ?, ?, ?)`,
      [orderId, order.status, status, userId, note || null],
    );

    let finalStatus = status;
    if (status === 'DELIVERED') {
      const [reservations] = await connection.execute(
        `SELECT product_id AS productId, quantity FROM inventory_reservations
         WHERE purchase_order_id = ? AND status = 'RESERVED' FOR UPDATE`,
        [orderId],
      );
      for (const reservation of reservations) {
        const [result] = await connection.execute(
          `UPDATE inventory
           SET quantity = quantity - ?, reserved_quantity = reserved_quantity - ?
           WHERE product_id = ? AND quantity >= ? AND reserved_quantity >= ?`,
          [reservation.quantity, reservation.quantity, reservation.productId, reservation.quantity, reservation.quantity],
        );
        if (!result.affectedRows) throw new Error('Inventory changed before delivery could be committed.');
      }
      await connection.execute(
        `UPDATE inventory_reservations SET status = 'COMMITTED'
         WHERE purchase_order_id = ? AND status = 'RESERVED'`,
        [orderId],
      );
      const [invoiceResult] = await connection.execute(
        `INSERT INTO invoices (purchase_order_id, invoice_number, amount, currency, status)
         SELECT po.id, CONCAT('PH-', DATE_FORMAT(CURRENT_DATE(), '%Y%m%d'), '-', LPAD(po.id, 8, '0')),
                po.total_amount, po.currency, 'UNPAID'
         FROM purchase_orders po WHERE po.id = ?`,
        [orderId],
      );
      const [items] = await connection.execute(
        `SELECT id, name, quantity, unit, unit_price
         FROM order_items WHERE purchase_order_id = ?`,
        [orderId],
      );
      for (const item of items) {
        const lineTotal = (Number(item.quantity) * Number(item.unit_price)).toFixed(2);
        await connection.execute(
          `INSERT INTO invoice_items (invoice_id, order_item_id, name, quantity, unit, unit_price, line_total)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [invoiceResult.insertId, item.id, item.name, item.quantity, item.unit, item.unit_price, lineTotal],
        );
      }
      await connection.execute('UPDATE purchase_orders SET status = ? WHERE id = ?', ['PAYMENT_PENDING', orderId]);
      await connection.execute(
        `INSERT INTO order_status_history (purchase_order_id, previous_status, new_status, changed_by, note)
         VALUES (?, 'DELIVERED', 'INVOICE_GENERATED', ?, 'Invoice generated automatically on delivery'),
                (?, 'INVOICE_GENERATED', 'PAYMENT_PENDING', ?, 'Invoice is awaiting payment')`,
        [orderId, userId, orderId, userId],
      );
      await notify(connection, order.buyerId, 'INVOICE_GENERATED', `Invoice generated for order #${orderId}.`);
      finalStatus = 'PAYMENT_PENDING';
    } else {
      const recipient = role === 'SUPPLIER' ? order.buyerId : order.supplierId;
      await notify(connection, recipient, 'ORDER_STATUS', `Order #${orderId} status changed to ${status}.`);
    }
    await connection.commit();
    return { status: finalStatus };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listReviews({ userId, role, limit = 50, offset = 0 }) {
  let where = '';
  const params = [];
  if (role === 'BUYER') {
    where = 'WHERE r.buyer_id = ?';
    params.push(userId);
  } else if (role === 'SUPPLIER') {
    where = 'WHERE r.supplier_id = ?';
    params.push(userId);
  }
  params.push(limit, offset);
  const [rows] = await getPool().execute(
    `SELECT r.id, r.purchase_order_id AS orderId, r.buyer_id AS buyerId,
            r.supplier_id AS supplierId, r.rating, r.comment, r.created_at AS createdAt,
            bb.name AS buyerBusinessName, sb.name AS supplierBusinessName
     FROM reviews r
     LEFT JOIN businesses bb ON bb.owner_user_id = r.buyer_id
     LEFT JOIN businesses sb ON sb.owner_user_id = r.supplier_id
     ${where}
     ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
    params,
  );
  return rows;
}

async function createReview({ orderId, buyerId, rating, comment }) {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [orders] = await connection.execute(
      `SELECT id, supplier_id AS supplierId
       FROM purchase_orders
       WHERE id = ? AND buyer_id = ? AND status = 'COMPLETED'
       FOR UPDATE`,
      [orderId, buyerId],
    );
    if (!orders.length) {
      await connection.rollback();
      return 'ORDER_NOT_REVIEWABLE';
    }
    const [result] = await connection.execute(
      `INSERT INTO reviews (purchase_order_id, buyer_id, supplier_id, rating, comment)
       VALUES (?, ?, ?, ?, ?)`,
      [orderId, buyerId, orders[0].supplierId, rating, comment],
    );
    await notify(connection, orders[0].supplierId, 'REVIEW_RECEIVED', `A buyer reviewed completed order #${orderId}.`);
    await connection.commit();
    return {
      id: result.insertId,
      orderId: Number(orderId),
      buyerId: Number(buyerId),
      supplierId: orders[0].supplierId,
      rating,
      comment,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listOrderHistory(orderId, { userId, role }) {
  const condition = role === 'ADMIN' ? '' : role === 'BUYER' ? 'AND po.buyer_id = ?' : 'AND po.supplier_id = ?';
  const params = role === 'ADMIN' ? [orderId] : [orderId, userId];
  const [rows] = await getPool().execute(
    `SELECT h.previous_status AS previousStatus, h.new_status AS newStatus,
            h.note, h.changed_by AS changedBy, u.name AS changedByName, h.created_at AS createdAt
     FROM order_status_history h
     JOIN purchase_orders po ON po.id = h.purchase_order_id
     JOIN users u ON u.id = h.changed_by
     WHERE h.purchase_order_id = ? ${condition}
     ORDER BY h.id`,
    params,
  );
  return rows;
}

module.exports = {
  createOrder,
  createQuotation,
  createRequest,
  createReview,
  findRequest,
  getOrder,
  listOrderHistory,
  listOrders,
  listQuotations,
  listRequests,
  listReviews,
  updateOrderStatus,
  updateQuotationStatus,
};
