const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const { after, before, test } = require('node:test');
const { app } = require('../src/server');
const { closeDatabase, getPool, initializeDatabase } = require('../src/config/db');
const { getJwtSecret } = require('../src/utils/jwt');

let server;
let apiBase;
let buyerToken;
let supplierToken;
let adminToken;
let auditBuyerToken;
let auditSupplierToken;
let buyerId;
let supplierId;
let adminId;
let auditBuyerId;
let auditSupplierId;
let requestId;
let quotationId;
let orderId;
let invoiceId;
let productId;
let secondProductId;
let auditBuyerEmail;
let auditBuyerPassword;
let auditSupplierEmail;
let auditSupplierPassword;
let initialNotificationId = 0;
let buyerProfile;
const notificationIds = [];
const returnIds = [];
const complaintIds = [];
const additionalRequestIds = [];
const requestTitle = `ProcureHub integration test ${randomUUID()}`;

async function request(path, { method = 'GET', token, body, headers = {} } = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  assert.ok(response.ok, `${method} ${path} failed with status ${response.status}: ${data.message || 'request rejected'}`);
  return data;
}

async function rawRequest(path, { method = 'GET', token, body, headers = {} } = {}) {
  return fetch(`${apiBase}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function login(email, password) {
  const result = await request('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  return result;
}

async function captureNotification(userId, type, message) {
  const [rows] = await getPool().execute(
    `SELECT id FROM notifications
     WHERE user_id = ? AND type = ? AND message = ? AND id > ?
     ORDER BY id DESC LIMIT 1`,
    [userId, type, message, initialNotificationId],
  );
  assert.ok(rows.length, `Expected ${type} notification to be stored.`);
  notificationIds.push(rows[0].id);
}

before(async () => {
  for (const key of ['DEMO_BUYER_PASSWORD', 'DEMO_SUPPLIER_PASSWORD']) {
    assert.ok(process.env[key], `Set ${key} in backend/.env to run integration tests.`);
  }
  await initializeDatabase();
  const [notificationRows] = await getPool().query('SELECT COALESCE(MAX(id), 0) AS maxId FROM notifications');
  initialNotificationId = Number(notificationRows[0].maxId);
  server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  apiBase = `http://127.0.0.1:${server.address().port}/api`;
  const [buyer, supplier, admin] = await Promise.all([
    login('buyer@procurehub.com', process.env.DEMO_BUYER_PASSWORD),
    login('supplier@procurehub.com', process.env.DEMO_SUPPLIER_PASSWORD),
    login('admin@procurehub.com', process.env.DEMO_ADMIN_PASSWORD),
  ]);
  buyerToken = buyer.token;
  supplierToken = supplier.token;
  adminToken = admin.token;
  buyerId = buyer.user.id;
  supplierId = supplier.user.id;
  adminId = admin.user.id;
  const auditId = randomUUID();
  auditBuyerEmail = `audit-buyer-${auditId}@example.test`;
  auditBuyerPassword = `Audit-${randomUUID()}Aa8!`;
  auditSupplierEmail = `audit-supplier-${auditId}@example.test`;
  auditSupplierPassword = `Audit-${randomUUID()}Bb9!`;
  const [auditBuyer, auditSupplier] = await Promise.all([
    request('/auth/register', {
      method: 'POST',
      body: {
        name: 'Temporary Audit Buyer',
        email: auditBuyerEmail,
        password: auditBuyerPassword,
        role: 'BUYER',
        businessName: '',
      },
    }),
    request('/auth/register', {
      method: 'POST',
      body: { name: 'Temporary Audit Supplier', email: auditSupplierEmail, password: auditSupplierPassword, role: 'SUPPLIER' },
    }),
  ]);
  auditBuyerToken = auditBuyer.token;
  auditBuyerId = auditBuyer.user.id;
  auditSupplierToken = auditSupplier.token;
  auditSupplierId = auditSupplier.user.id;
  assert.equal((await login(auditBuyerEmail, auditBuyerPassword)).user.role, 'BUYER');
  assert.equal((await login(auditSupplierEmail, auditSupplierPassword)).user.role, 'SUPPLIER');
  const profileResponse = await request('/businesses/me', { token: buyerToken });
  buyerProfile = profileResponse.business;
});

after(async () => {
  if (requestId && buyerId && supplierId) {
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const acceptedMessage = `Your quotation for purchase request #${requestId} was accepted.`;
      const [acceptedNotifications] = await connection.execute(
        `SELECT id FROM notifications
         WHERE user_id = ? AND type = 'QUOTATION_ACCEPTED' AND message = ? AND id > ?`,
        [supplierId, acceptedMessage, initialNotificationId],
      );
      notificationIds.push(...acceptedNotifications.map((row) => row.id));
      for (const complaintId of complaintIds) {
        const [complaintNotifications] = await connection.execute(
          `SELECT id FROM notifications
           WHERE type = 'COMPLAINT' AND message LIKE ? AND id > ?`,
          [`Complaint #${complaintId} %`, initialNotificationId],
        );
        notificationIds.push(...complaintNotifications.map((row) => row.id));
      }
      for (const returnId of returnIds) {
        const [returnNotifications] = await connection.execute(
          `SELECT id FROM notifications
           WHERE type = 'RETURN' AND message LIKE ? AND id > ?`,
          [`Return request #${returnId} %`, initialNotificationId],
        );
        notificationIds.push(...returnNotifications.map((row) => row.id));
      }
      if (returnIds.length) {
        const placeholders = returnIds.map(() => '?').join(', ');
        const [refundIds] = await connection.execute(
          `SELECT id FROM refunds WHERE return_request_id IN (${placeholders})`,
          returnIds,
        );
        const refundPatterns = [
          ...returnIds.map((id) => `%return request #${id}%`),
          ...refundIds.map((refund) => `Refund #${refund.id} status changed to %`),
        ];
        const [refundNotifications] = await connection.execute(
          `SELECT id FROM notifications
           WHERE user_id IN (?, ?) AND type = 'REFUND'
             AND id > ? AND (${refundPatterns.map(() => 'message LIKE ?').join(' OR ')})`,
          [buyerId, supplierId, initialNotificationId, ...refundPatterns],
        );
        notificationIds.push(...refundNotifications.map((row) => row.id));
        await connection.execute(
          `DELETE FROM refund_history WHERE refund_id IN (
             SELECT id FROM refunds WHERE return_request_id IN (${placeholders})
           )`,
          returnIds,
        );
        await connection.execute(`DELETE FROM refunds WHERE return_request_id IN (${placeholders})`, returnIds);
        await connection.execute(
          `DELETE FROM return_inventory_movements WHERE return_request_item_id IN (
             SELECT id FROM return_request_items WHERE return_request_id IN (${placeholders})
           )`,
          returnIds,
        );
      }
      if (orderId) {
        const [orderStatusNotifications] = await connection.execute(
          `SELECT id FROM notifications
           WHERE user_id = ? AND type = 'ORDER_STATUS'
             AND message LIKE ? AND id > ?`,
          [buyerId, `Order #${orderId} status changed to %`, initialNotificationId],
        );
        notificationIds.push(...orderStatusNotifications.map((row) => row.id));
        await connection.execute('DELETE FROM reviews WHERE purchase_order_id = ? AND buyer_id = ?', [orderId, buyerId]);
        if (complaintIds.length) {
          const placeholders = complaintIds.map(() => '?').join(', ');
          await connection.execute(`DELETE FROM complaint_history WHERE complaint_id IN (${placeholders})`, complaintIds);
          await connection.execute(`DELETE FROM complaints WHERE id IN (${placeholders})`, complaintIds);
        }
        if (returnIds.length) {
          const placeholders = returnIds.map(() => '?').join(', ');
          await connection.execute(`DELETE FROM return_request_history WHERE return_request_id IN (${placeholders})`, returnIds);
          await connection.execute(`DELETE FROM return_request_items WHERE return_request_id IN (${placeholders})`, returnIds);
          await connection.execute(`DELETE FROM return_requests WHERE id IN (${placeholders})`, returnIds);
        }
        if (invoiceId) {
          await connection.execute('DELETE FROM payments WHERE invoice_id = ?', [invoiceId]);
          await connection.execute('DELETE FROM invoice_items WHERE invoice_id = ?', [invoiceId]);
          await connection.execute('DELETE FROM invoices WHERE id = ? AND purchase_order_id = ?', [invoiceId, orderId]);
        }
        await connection.execute('DELETE FROM order_status_history WHERE purchase_order_id = ?', [orderId]);
        await connection.execute('DELETE FROM inventory_reservations WHERE purchase_order_id = ?', [orderId]);
        await connection.execute('DELETE FROM order_items WHERE purchase_order_id = ?', [orderId]);
        await connection.execute(
          'DELETE FROM purchase_orders WHERE id = ? AND buyer_id = ? AND supplier_id = ?',
          [orderId, buyerId, supplierId],
        );
      }
      if (additionalRequestIds.length) {
        const placeholders = additionalRequestIds.map(() => '?').join(', ');
        await connection.execute(`DELETE FROM purchase_request_items WHERE purchase_request_id IN (${placeholders})`, additionalRequestIds);
        await connection.execute(`DELETE FROM purchase_requests WHERE id IN (${placeholders}) AND buyer_id = ?`, [...additionalRequestIds, buyerId]);
      }
      if (notificationIds.length) {
        const placeholders = notificationIds.map(() => '?').join(', ');
        await connection.execute(`DELETE FROM notifications WHERE id IN (${placeholders})`, notificationIds);
      }
      if (quotationId) {
        await connection.execute('DELETE FROM quotation_items WHERE quotation_id = ?', [quotationId]);
        await connection.execute('DELETE FROM quotations WHERE id = ? AND supplier_id = ?', [quotationId, supplierId]);
      }
      await connection.execute('DELETE FROM purchase_request_items WHERE purchase_request_id = ?', [requestId]);
      await connection.execute('DELETE FROM purchase_requests WHERE id = ? AND buyer_id = ?', [requestId, buyerId]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
  if (buyerProfile && buyerToken && server) {
    await request('/businesses/me', {
      method: 'PATCH',
      token: buyerToken,
      body: {
        name: buyerProfile.name,
        businessType: buyerProfile.businessType,
        phone: buyerProfile.phone,
        address: buyerProfile.address,
        description: buyerProfile.description,
        website: buyerProfile.website,
        taxIdentifier: buyerProfile.taxIdentifier,
      },
    });
  }
  if (productId) {
    await getPool().execute('DELETE FROM inventory WHERE product_id = ?', [productId]);
    await getPool().execute('DELETE FROM products WHERE id = ? AND supplier_id = ?', [productId, supplierId]);
  }
  if (secondProductId) {
    await getPool().execute('DELETE FROM inventory WHERE product_id = ?', [secondProductId]);
    await getPool().execute('DELETE FROM products WHERE id = ? AND supplier_id = ?', [secondProductId, supplierId]);
  }
  if (auditBuyerId || auditSupplierId) {
    const userIds = [auditBuyerId, auditSupplierId].filter(Boolean);
    if (userIds.length) {
      const placeholders = userIds.map(() => '?').join(', ');
      await getPool().execute(`DELETE FROM users WHERE id IN (${placeholders})`, userIds);
    }
  }
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  await closeDatabase();
});

test('persists a buyer-to-supplier procurement workflow through review', async () => {
  const supplierProfile = await request('/businesses/me', { token: supplierToken });
  const privateProfileAttempt = await fetch(`${apiBase}/businesses/${supplierProfile.business.id}`, {
    headers: { Authorization: 'Bearer ' + buyerToken },
  });
  assert.equal(privateProfileAttempt.status, 403, 'A buyer must not read another account’s private business profile.');

  const updatedProfile = await request('/businesses/me', {
    method: 'PATCH',
    token: buyerToken,
    body: { description: `Temporary integration test profile ${randomUUID()}` },
  });
  assert.match(updatedProfile.business.description, /^Temporary integration test profile /);

  const createdProduct = await request('/products', {
    method: 'POST',
    token: supplierToken,
    body: {
      name: `Integration test product ${randomUUID()}`,
      category: 'Groceries',
      unit: 'each',
      price: 12,
      stock: 3,
      description: 'Temporary item used by the automated workflow test.',
    },
  });
  productId = createdProduct.product.id;
  assert.equal(Number(createdProduct.product.stock), 3);
  const secondProduct = await request('/products', {
    method: 'POST',
    token: supplierToken,
    body: {
      name: `Second integration product ${randomUUID()}`,
      category: 'Groceries',
      unit: 'box',
      price: 4,
      stock: 5,
      description: 'Second temporary item used by the automated workflow test.',
    },
  });
  secondProductId = secondProduct.product.id;
  const searchResults = await request(`/products?search=${encodeURIComponent(createdProduct.product.name)}`);
  assert.ok(searchResults.products.some((product) => Number(product.id) === Number(productId)));
  const unauthorizedProductUpdate = await rawRequest(`/products/${productId}`, {
    method: 'PUT',
    token: auditSupplierToken,
    body: { price: 99 },
  });
  assert.equal(unauthorizedProductUpdate.status, 403);
  const negativeInventory = await rawRequest(`/products/${productId}/inventory`, {
    method: 'PUT',
    token: supplierToken,
    body: { quantity: -1 },
  });
  assert.equal(negativeInventory.status, 400);

  const createdRequest = await request('/purchase-requests', {
    method: 'POST',
    token: buyerToken,
    body: {
      title: requestTitle,
      category: 'Groceries',
      items: [{
        productId,
        name: createdProduct.product.name,
        quantity: 2,
        unit: 'each',
      }, {
        productId: secondProductId,
        name: secondProduct.product.name,
        quantity: 3,
        unit: 'box',
      }],
    },
  });
  requestId = createdRequest.request.id;
  assert.equal(createdRequest.request.items.length, 2);
  const [requestDb] = await getPool().execute(
    `SELECT pr.status, COUNT(pri.id) AS itemCount
     FROM purchase_requests pr JOIN purchase_request_items pri ON pri.purchase_request_id = pr.id
     WHERE pr.id = ? GROUP BY pr.id`,
    [requestId],
  );
  assert.equal(requestDb[0].status, 'OPEN');
  assert.equal(Number(requestDb[0].itemCount), 2);
  const supplierRequests = await request('/purchase-requests', { token: supplierToken });
  assert.ok(supplierRequests.requests.some((item) => Number(item.id) === Number(requestId)));
  const otherSupplierRequest = await request(`/purchase-requests/${requestId}`, { token: auditSupplierToken });
  assert.equal(Number(otherSupplierRequest.request.id), Number(requestId));
  await captureNotification(
    supplierId,
    'PURCHASE_REQUEST',
    `A buyer posted a purchase request: ${requestTitle}`,
  );

  const quote = await request('/quotations', {
    method: 'POST',
    token: supplierToken,
    body: {
      requestId,
      amount: 36,
      items: [{
        requestItemId: createdRequest.request.items[0].id,
        quantity: 2,
        unitPrice: 12,
      }, {
        requestItemId: createdRequest.request.items[1].id,
        quantity: 3,
        unitPrice: 4,
      }],
      deliveryDays: 4,
      message: 'Automated workflow test quotation.',
    },
  });
  quotationId = quote.quotation.id;
  assert.equal(quote.quotation.items.length, 2);
  const [quoteDb] = await getPool().execute(
    'SELECT amount, status FROM quotations WHERE id = ? AND supplier_id = ?',
    [quotationId, supplierId],
  );
  assert.equal(Number(quoteDb[0].amount), 36);
  assert.equal(quoteDb[0].status, 'PENDING');
  await captureNotification(
    buyerId,
    'QUOTATION_RECEIVED',
    'A supplier submitted a quotation for your purchase request.',
  );

  await request(`/quotations/${quotationId}`, {
    method: 'PATCH',
    token: buyerToken,
    body: { status: 'ACCEPTED' },
  });
  const quoteComparison = await request(`/purchase-requests/${requestId}`, { token: buyerToken });
  assert.equal(quoteComparison.request.quotations.length, 1);
  assert.equal(Number(quoteComparison.request.quotations[0].amount), 36);
  const [acceptedQuoteDb] = await getPool().execute('SELECT status FROM quotations WHERE id = ?', [quotationId]);
  assert.equal(acceptedQuoteDb[0].status, 'ACCEPTED');
  const concurrentOrders = await Promise.all([
    rawRequest('/orders', { method: 'POST', token: buyerToken, body: { quotationId } }),
    rawRequest('/orders', { method: 'POST', token: buyerToken, body: { quotationId } }),
  ]);
  const orderResponses = await Promise.all(concurrentOrders.map(async (response) => ({
    status: response.status,
    data: await response.json(),
  })));
  assert.equal(orderResponses.filter((result) => result.status === 201).length, 1);
  assert.equal(orderResponses.filter((result) => result.status === 409).length, 1);
  const orderResponse = orderResponses.find((result) => result.status === 201).data;
  orderId = orderResponse.order.id;
  assert.equal(orderResponse.order.status, 'PO_CREATED');
  const [awardedRequest] = await getPool().execute(
    'SELECT status FROM purchase_requests WHERE id = ? AND buyer_id = ?',
    [requestId, buyerId],
  );
  assert.equal(awardedRequest[0].status, 'AWARDED');
  const lateQuotationChange = await rawRequest(`/quotations/${quotationId}`, {
    method: 'PATCH',
    token: buyerToken,
    body: { status: 'REJECTED' },
  });
  assert.equal(lateQuotationChange.status, 409, 'Awarded requests must reject further quote decisions.');
  const secondRequest = await request('/purchase-requests', {
    method: 'POST',
    token: buyerToken,
    body: {
      title: `Independent open request ${randomUUID()}`,
      category: 'Groceries',
      items: [{ name: 'Custom audit item', quantity: 1, unit: 'each' }],
    },
  });
  additionalRequestIds.push(secondRequest.request.id);
  assert.equal(secondRequest.request.status, 'OPEN', 'A completed request must not prevent new request creation.');
  const [ordersDb] = await getPool().execute(
    'SELECT COUNT(*) AS orderCount FROM purchase_orders WHERE quotation_id = ?',
    [quotationId],
  );
  assert.equal(Number(ordersDb[0].orderCount), 1);
  const reservedInventory = await request(`/products/${productId}/inventory`, { token: supplierToken });
  assert.equal(Number(reservedInventory.inventory.reservedQuantity), 2);
  assert.equal(Number(reservedInventory.inventory.availableQuantity), 1);
  const secondReservedInventory = await request(`/products/${secondProductId}/inventory`, { token: supplierToken });
  assert.equal(Number(secondReservedInventory.inventory.reservedQuantity), 3);
  assert.equal(Number(secondReservedInventory.inventory.availableQuantity), 2);
  const [reservationDb] = await getPool().execute(
    `SELECT COUNT(*) AS count FROM inventory_reservations
     WHERE purchase_order_id = ? AND status = 'RESERVED'`,
    [orderId],
  );
  assert.equal(Number(reservationDb[0].count), 2);
  const reservedStockUpdate = await fetch(`${apiBase}/products/${productId}/inventory`, {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer ' + supplierToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ quantity: 1 }),
  });
  assert.equal(reservedStockUpdate.status, 409, 'Inventory updates must not undercut reserved quantities.');
  await captureNotification(supplierId, 'PURCHASE_ORDER', `A buyer created purchase order #${orderId}.`);

  for (const status of ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED']) {
    await request(`/orders/${orderId}`, {
      method: 'PATCH',
      token: supplierToken,
      body: { status },
    });
  }
  const deliveredOrder = await request(`/orders/${orderId}`, { token: buyerToken });
  assert.equal(deliveredOrder.order.status, 'PAYMENT_PENDING');
  const deliveredInventory = await request(`/products/${productId}/inventory`, { token: supplierToken });
  assert.equal(Number(deliveredInventory.inventory.quantity), 1);
  assert.equal(Number(deliveredInventory.inventory.reservedQuantity), 0);
  const deliveredSecondInventory = await request(`/products/${secondProductId}/inventory`, { token: supplierToken });
  assert.equal(Number(deliveredSecondInventory.inventory.quantity), 2);
  assert.equal(Number(deliveredSecondInventory.inventory.reservedQuantity), 0);
  const [deliveredReservations] = await getPool().execute(
    `SELECT COUNT(*) AS count FROM inventory_reservations
     WHERE purchase_order_id = ? AND status = 'COMMITTED'`,
    [orderId],
  );
  assert.equal(Number(deliveredReservations[0].count), 2);
  const invoiceResponse = await request('/invoices', { token: buyerToken });
  const invoice = invoiceResponse.invoices.find((item) => Number(item.orderId) === Number(orderId));
  assert.ok(invoice, 'Delivery must create a persisted invoice.');
  invoiceId = invoice.id;
  const invoicePdfResponse = await rawRequest(`/invoices/${invoiceId}/pdf`, { token: buyerToken });
  assert.equal(invoicePdfResponse.status, 200);
  assert.match(invoicePdfResponse.headers.get('content-type'), /application\/pdf/);
  const invoicePdf = Buffer.from(await invoicePdfResponse.arrayBuffer());
  assert.ok(invoicePdf.subarray(0, 5).equals(Buffer.from('%PDF-')));
  const supplierInvoicePdf = await rawRequest(`/invoices/${invoiceId}/pdf`, { token: supplierToken });
  assert.equal(supplierInvoicePdf.status, 200);
  const unauthorizedInvoicePdf = await rawRequest(`/invoices/${invoiceId}/pdf`, { token: auditBuyerToken });
  assert.equal(unauthorizedInvoicePdf.status, 404);
  const [invoiceDb] = await getPool().execute(
    'SELECT COUNT(*) AS invoiceCount, SUM(amount) AS total FROM invoices WHERE purchase_order_id = ?',
    [orderId],
  );
  assert.equal(Number(invoiceDb[0].invoiceCount), 1);
  assert.equal(Number(invoiceDb[0].total), 36);
  const duplicateDelivery = await rawRequest(`/orders/${orderId}`, {
    method: 'PATCH',
    token: supplierToken,
    body: { status: 'DELIVERED' },
  });
  assert.equal(duplicateDelivery.status, 409);
  const [invoiceCountAfterDuplicateDelivery] = await getPool().execute(
    'SELECT COUNT(*) AS count FROM invoices WHERE purchase_order_id = ?',
    [orderId],
  );
  assert.equal(Number(invoiceCountAfterDuplicateDelivery[0].count), 1);
  const unauthorizedInvoice = await rawRequest(`/invoices/${invoiceId}`, { token: auditBuyerToken });
  assert.equal(unauthorizedInvoice.status, 404);
  const unauthorizedPayment = await rawRequest(`/invoices/${invoiceId}/payments`, {
    method: 'POST',
    token: auditBuyerToken,
    headers: { 'Idempotency-Key': randomUUID() },
    body: { amount: 1, status: 'PAID' },
  });
  assert.equal(unauthorizedPayment.status, 404);
  const supplierPayment = await rawRequest(`/invoices/${invoiceId}/payments`, {
    method: 'POST',
    token: supplierToken,
    headers: { 'Idempotency-Key': randomUUID() },
    body: { amount: 1, status: 'PAID' },
  });
  assert.equal(supplierPayment.status, 403);
  const invalidPaymentState = await rawRequest(`/invoices/${invoiceId}/payments`, {
    method: 'POST',
    token: buyerToken,
    headers: { 'Idempotency-Key': randomUUID() },
    body: { amount: 1, status: 'REFUNDED' },
  });
  assert.equal(invalidPaymentState.status, 400);
  const repeatedKey = randomUUID();
  await request(`/invoices/${invoiceId}/payments`, {
    method: 'POST',
    token: buyerToken,
    headers: { 'Idempotency-Key': repeatedKey },
    body: { amount: 1, status: 'PENDING' },
  });
  const duplicatePayment = await rawRequest(`/invoices/${invoiceId}/payments`, {
    method: 'POST',
    token: buyerToken,
    headers: { 'Idempotency-Key': repeatedKey },
    body: { amount: 1, status: 'PENDING' },
  });
  assert.equal(duplicatePayment.status, 409);
  const [duplicatePaymentDb] = await getPool().execute(
    'SELECT COUNT(*) AS count FROM payments WHERE invoice_id = ? AND idempotency_key = ?',
    [invoiceId, repeatedKey],
  );
  assert.equal(Number(duplicatePaymentDb[0].count), 1);
  await captureNotification(buyerId, 'INVOICE_GENERATED', `Invoice generated for order #${orderId}.`);
  const invoiceNotificationId = notificationIds.at(-1);
  await request(`/notifications/${invoiceNotificationId}/read`, {
    method: 'PATCH',
    token: buyerToken,
  });
  const [readNotificationDb] = await getPool().execute(
    'SELECT read_at AS readAt FROM notifications WHERE id = ? AND user_id = ?',
    [invoiceNotificationId, buyerId],
  );
  assert.ok(readNotificationDb[0].readAt);

  await request(`/invoices/${invoiceId}/payments`, {
    method: 'POST',
    token: buyerToken,
    headers: { 'Idempotency-Key': randomUUID() },
    body: { amount: Number(invoice.amount), status: 'PAID' },
  });
  await captureNotification(
    supplierId,
    'PAYMENT_UPDATED',
    `Invoice payment for order #${orderId} has been recorded.`,
  );
  const paymentAfterPaid = await rawRequest(`/invoices/${invoiceId}/payments`, {
    method: 'POST',
    token: buyerToken,
    headers: { 'Idempotency-Key': randomUUID() },
    body: { amount: 1, status: 'PAID' },
  });
  assert.equal(paymentAfterPaid.status, 409);
  const completedOrder = await request(`/orders/${orderId}`, { token: buyerToken });
  assert.equal(completedOrder.order.status, 'COMPLETED');
  assert.equal(Number(completedOrder.order.id), Number(orderId));
  assert.equal(completedOrder.order.buyerName, 'Aditi Sharma');
  assert.ok(completedOrder.order.supplierBusinessName);
  assert.equal(completedOrder.order.items.length, 2);
  assert.ok(completedOrder.order.items.every((item) => item.lineTotal !== undefined));
  assert.equal(completedOrder.order.invoice.status, 'PAID');
  assert.ok(completedOrder.order.invoice.payments.length >= 2);
  assert.ok(completedOrder.order.history.some((entry) => entry.newStatus === 'INVOICE_GENERATED'));
  const supplierOrderDetails = await request(`/orders/${orderId}`, { token: supplierToken });
  assert.equal(Number(supplierOrderDetails.order.buyerId), Number(buyerId));
  const adminOrderDetails = await request(`/orders/${orderId}`, { token: adminToken });
  assert.equal(Number(adminOrderDetails.order.id), Number(orderId));
  const unrelatedOrderDetails = await rawRequest(`/orders/${orderId}`, { token: auditBuyerToken });
  assert.equal(unrelatedOrderDetails.status, 404);
  const [completedDb] = await getPool().execute(
    `SELECT po.status AS orderStatus, i.status AS invoiceStatus,
            COUNT(DISTINCT pay.id) AS paymentCount
     FROM purchase_orders po JOIN invoices i ON i.purchase_order_id = po.id
     JOIN payments pay ON pay.invoice_id = i.id
     WHERE po.id = ? GROUP BY po.id, i.id`,
    [orderId],
  );
  assert.equal(completedDb[0].orderStatus, 'COMPLETED');
  assert.equal(completedDb[0].invoiceStatus, 'PAID');
  assert.equal(Number(completedDb[0].paymentCount), 2);

  await request('/reviews', {
    method: 'POST',
    token: buyerToken,
    body: { orderId, rating: 5, comment: 'Automated workflow test review.' },
  });
  const duplicateReview = await rawRequest('/reviews', {
    method: 'POST',
    token: buyerToken,
    body: { orderId, rating: 4, comment: 'Duplicate review attempt.' },
  });
  assert.equal(duplicateReview.status, 409);
  const [reviewCount] = await getPool().execute(
    'SELECT COUNT(*) AS count FROM reviews WHERE purchase_order_id = ?',
    [orderId],
  );
  assert.equal(Number(reviewCount[0].count), 1);
  await captureNotification(
    supplierId,
    'REVIEW_RECEIVED',
    `A buyer reviewed completed order #${orderId}.`,
  );
  const reviewResponse = await request('/reviews', { token: supplierToken });
  assert.ok(reviewResponse.reviews.some((review) => Number(review.orderId) === Number(orderId)));

  const orderItems = completedOrder.order.items;
  const firstItemId = orderItems[0].id;
  const oversizedReturn = await rawRequest('/returns', {
    method: 'POST',
    token: buyerToken,
    body: { orderId, reason: 'Too many items', items: [{ orderItemId: firstItemId, quantity: 999 }] },
  });
  assert.equal(oversizedReturn.status, 409);
  const invalidPrecisionReturn = await rawRequest('/returns', {
    method: 'POST',
    token: buyerToken,
    body: { orderId, reason: 'Invalid precision', items: [{ orderItemId: firstItemId, quantity: 0.0001 }] },
  });
  assert.equal(invalidPrecisionReturn.status, 400);
  const returnResponse = await request('/returns', {
    method: 'POST',
    token: buyerToken,
    body: {
      orderId,
      reason: 'Packaging damaged',
      description: 'One unit was damaged on arrival.',
      items: [{ orderItemId: firstItemId, quantity: 1 }, { orderItemId: orderItems[1].id, quantity: 1 }],
    },
  });
  const returnId = returnResponse.returnRequest.id;
  returnIds.push(returnId);
  assert.equal(returnResponse.returnRequest.status, 'RETURN_REQUESTED');
  const [returnNotification] = await getPool().execute(
    `SELECT COUNT(*) AS count FROM notifications
     WHERE user_id = ? AND type = 'RETURN' AND message = ?`,
    [supplierId, `Return request #${returnId} was submitted.`],
  );
  assert.equal(Number(returnNotification[0].count), 1);
  const unrelatedReturn = await rawRequest(`/returns/${returnId}`, { token: auditBuyerToken });
  assert.equal(unrelatedReturn.status, 404);
  await request(`/returns/${returnId}/status`, {
    method: 'PATCH',
    token: supplierToken,
    body: { status: 'RETURN_APPROVED', explanation: 'Return verified.' },
  });
  const pendingRefund = await request('/refunds', { token: buyerToken });
  const refund = pendingRefund.refunds.find((item) => Number(item.returnId) === Number(returnId));
  assert.ok(refund, 'Approving a paid return must create a visible refund record.');
  assert.equal(Number(refund.amount), 16);
  assert.equal(refund.status, 'REFUND_PENDING');
  const duplicateApproval = await rawRequest(`/returns/${returnId}/status`, {
    method: 'PATCH',
    token: supplierToken,
    body: { status: 'RETURN_APPROVED', explanation: 'Duplicate approval attempt.' },
  });
  assert.equal(duplicateApproval.status, 409);
  const [refundCountForReturn] = await getPool().execute(
    'SELECT COUNT(*) AS count FROM refunds WHERE return_request_id = ?',
    [returnId],
  );
  assert.equal(Number(refundCountForReturn[0].count), 1);
  const unrelatedRefund = await rawRequest(`/refunds/${refund.id}`, { token: auditBuyerToken });
  assert.equal(unrelatedRefund.status, 404);
  const supplierCannotProcessRefund = await rawRequest(`/refunds/${refund.id}`, {
    method: 'PATCH',
    token: supplierToken,
    body: { status: 'REFUND_PROCESSED', manualTransferConfirmed: true, processedAt: new Date().toISOString() },
  });
  assert.equal(supplierCannotProcessRefund.status, 403);
  const adminMustConfirmManualTransfer = await rawRequest(`/refunds/${refund.id}`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'REFUND_PROCESSED', manualTransferConfirmed: false, processedAt: new Date().toISOString() },
  });
  assert.equal(adminMustConfirmManualTransfer.status, 400);
  const refundMarkedFailed = await request(`/refunds/${refund.id}`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'REFUND_FAILED', note: 'Manual refund could not be completed.' },
  });
  assert.equal(refundMarkedFailed.refund.status, 'REFUND_FAILED');
  const [failedRefundHistory] = await getPool().execute(
    'SELECT COUNT(*) AS count FROM refund_history WHERE refund_id = ?',
    [refund.id],
  );
  assert.equal(Number(failedRefundHistory[0].count), 2);
  await request(`/refunds/${refund.id}`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'REFUND_PENDING', note: 'Retry after verifying recipient details.' },
  });
  const processedRefund = await request(`/refunds/${refund.id}`, {
    method: 'PATCH',
    token: adminToken,
    body: {
      status: 'REFUND_PROCESSED',
      manualTransferConfirmed: true,
      processedAt: new Date().toISOString(),
      transactionReference: `manual-${randomUUID()}`,
      note: 'Manual transfer confirmed by administrator.',
    },
  });
  assert.equal(processedRefund.refund.status, 'REFUND_PROCESSED');
  assert.ok(processedRefund.refund.processedAt);
  const duplicateRefundProcessing = await rawRequest(`/refunds/${refund.id}`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'REFUND_PROCESSED', manualTransferConfirmed: true, processedAt: new Date().toISOString() },
  });
  assert.equal(duplicateRefundProcessing.status, 409);

  await getPool().execute('DELETE FROM inventory WHERE product_id = ?', [productId]);
  const failedCompletion = await rawRequest(`/returns/${returnId}/status`, {
    method: 'PATCH',
    token: supplierToken,
    body: { status: 'RETURN_COMPLETED' },
  });
  assert.equal(failedCompletion.status, 409);
  const [failedCompletionState] = await getPool().execute(
    `SELECT rr.status, COUNT(m.id) AS movementCount
     FROM return_requests rr
     LEFT JOIN return_request_items rri ON rri.return_request_id = rr.id
     LEFT JOIN return_inventory_movements m ON m.return_request_item_id = rri.id
     WHERE rr.id = ? GROUP BY rr.id`,
    [returnId],
  );
  assert.equal(failedCompletionState[0].status, 'RETURN_APPROVED');
  assert.equal(Number(failedCompletionState[0].movementCount), 0);
  await getPool().execute(
    'INSERT INTO inventory (product_id, quantity, reserved_quantity) VALUES (?, 1, 0)',
    [productId],
  );

  const concurrentCompletionResponses = await Promise.all([
    rawRequest(`/returns/${returnId}/status`, {
      method: 'PATCH',
      token: supplierToken,
      body: { status: 'RETURN_COMPLETED' },
    }),
    rawRequest(`/returns/${returnId}/status`, {
      method: 'PATCH',
      token: supplierToken,
      body: { status: 'RETURN_COMPLETED' },
    }),
  ]);
  const concurrentCompletionResults = await Promise.all(concurrentCompletionResponses.map(async (response) => ({
    status: response.status,
    body: await response.json(),
  })));
  assert.equal(concurrentCompletionResults.filter((result) => result.status === 200).length, 1);
  assert.equal(concurrentCompletionResults.filter((result) => result.status === 409).length, 1);
  assert.equal(
    concurrentCompletionResults.find((result) => result.status === 200).body.returnRequest.status,
    'RETURN_COMPLETED',
  );
  const [returnRecord] = await getPool().execute(
    `SELECT rr.status, SUM(rri.quantity) AS quantity
     FROM return_requests rr JOIN return_request_items rri ON rri.return_request_id = rr.id
     WHERE rr.id = ? GROUP BY rr.id`,
    [returnId],
  );
  assert.equal(returnRecord[0].status, 'RETURN_COMPLETED');
  assert.equal(Number(returnRecord[0].quantity), 2);
  const [inventoryAfterReturn] = await getPool().execute(
    'SELECT quantity, reserved_quantity AS reservedQuantity FROM inventory WHERE product_id = ?',
    [productId],
  );
  assert.equal(Number(inventoryAfterReturn[0].quantity), 2, 'Accepted returned quantity must be restored on completion.');
  assert.equal(Number(inventoryAfterReturn[0].reservedQuantity), 0);
  const [restockMovements] = await getPool().execute(
    `SELECT COUNT(*) AS count, SUM(quantity) AS quantity
     FROM return_inventory_movements
     WHERE return_request_item_id IN (
       SELECT id FROM return_request_items WHERE return_request_id = ?
     )`,
    [returnId],
  );
  assert.equal(Number(restockMovements[0].count), 2);
  assert.equal(Number(restockMovements[0].quantity), 2);
  const excessReturn = await rawRequest('/returns', {
    method: 'POST',
    token: buyerToken,
    body: { orderId, reason: 'Excess quantity', items: [{ orderItemId: firstItemId, quantity: 2 }] },
  });
  assert.equal(excessReturn.status, 409, 'Completed returns must count toward the cumulative return quantity.');
  const rejectedReturnResponse = await request('/returns', {
    method: 'POST',
    token: buyerToken,
    body: { orderId, reason: 'Wrong size', items: [{ orderItemId: firstItemId, quantity: 1 }] },
  });
  const rejectedReturnId = rejectedReturnResponse.returnRequest.id;
  returnIds.push(rejectedReturnId);
  const rejectionWithoutReason = await rawRequest(`/returns/${rejectedReturnId}/status`, {
    method: 'PATCH',
    token: supplierToken,
    body: { status: 'RETURN_REJECTED' },
  });
  assert.equal(rejectionWithoutReason.status, 400);
  const rejectedReturn = await request(`/returns/${rejectedReturnId}/status`, {
    method: 'PATCH',
    token: supplierToken,
    body: { status: 'RETURN_REJECTED', explanation: 'The item was used.' },
  });
  assert.equal(rejectedReturn.returnRequest.status, 'RETURN_REJECTED');
  const [inventoryAfterRejection] = await getPool().execute(
    'SELECT quantity FROM inventory WHERE product_id = ?',
    [productId],
  );
  assert.equal(Number(inventoryAfterRejection[0].quantity), 2, 'Rejected returns must not restore inventory.');
  const competingReturnRequests = await Promise.all([
    rawRequest('/returns', {
      method: 'POST',
      token: buyerToken,
      body: { orderId, reason: 'Concurrent return A', items: [{ orderItemId: firstItemId, quantity: 1 }] },
    }),
    rawRequest('/returns', {
      method: 'POST',
      token: buyerToken,
      body: { orderId, reason: 'Concurrent return B', items: [{ orderItemId: firstItemId, quantity: 1 }] },
    }),
  ]);
  const competingReturnResults = await Promise.all(competingReturnRequests.map(async (response) => ({
    status: response.status,
    body: await response.json(),
  })));
  assert.equal(competingReturnResults.filter((result) => result.status === 201).length, 1);
  assert.equal(competingReturnResults.filter((result) => result.status === 409).length, 1);
  const successfulCompetingReturn = competingReturnResults.find((result) => result.status === 201);
  const competingReturnId = successfulCompetingReturn.body.returnRequest.id;
  returnIds.push(competingReturnId);
  await request(`/returns/${competingReturnId}/status`, {
    method: 'PATCH',
    token: supplierToken,
    body: { status: 'RETURN_REJECTED', explanation: 'Concurrent test request rejected.' },
  });
  const finalReturnResponse = await request('/returns', {
    method: 'POST',
    token: buyerToken,
    body: {
      orderId,
      reason: 'Remaining accepted quantities',
      items: [{ orderItemId: firstItemId, quantity: 1 }, { orderItemId: orderItems[1].id, quantity: 2 }],
    },
  });
  const finalReturnId = finalReturnResponse.returnRequest.id;
  returnIds.push(finalReturnId);
  const finalReturnApproval = await request(`/returns/${finalReturnId}/status`, {
    method: 'PATCH',
    token: supplierToken,
    body: { status: 'RETURN_APPROVED', explanation: 'Remaining items inspected.' },
  });
  assert.equal(finalReturnApproval.returnRequest.refundStatus, 'REFUND_PENDING');
  assert.equal(Number(finalReturnApproval.returnRequest.refundAmount), 20);
  const secondProcessedRefund = await request(`/refunds/${finalReturnApproval.returnRequest.refundId}`, {
    method: 'PATCH',
    token: adminToken,
    body: {
      status: 'REFUND_PROCESSED',
      manualTransferConfirmed: true,
      processedAt: new Date().toISOString(),
      transactionReference: `manual-${randomUUID()}`,
      note: 'Second partial refund manually transferred.',
    },
  });
  assert.equal(secondProcessedRefund.refund.status, 'REFUND_PROCESSED');
  const [refundTotal] = await getPool().execute(
    `SELECT SUM(amount) AS refundAmount
     FROM refunds WHERE invoice_id = ? AND status = 'REFUND_PROCESSED'`,
    [invoiceId],
  );
  const [paidTotal] = await getPool().execute(
    `SELECT SUM(amount) AS paidAmount
     FROM payments WHERE invoice_id = ? AND status IN ('PAID', 'COMPLETED')`,
    [invoiceId],
  );
  assert.equal(Number(refundTotal[0].refundAmount), 36);
  assert.ok(Number(refundTotal[0].refundAmount) <= Number(paidTotal[0].paidAmount));
  const finalReturnCompletions = await Promise.all([
    rawRequest(`/returns/${finalReturnId}/status`, {
      method: 'PATCH',
      token: supplierToken,
      body: { status: 'RETURN_COMPLETED' },
    }),
    rawRequest(`/returns/${finalReturnId}/status`, {
      method: 'PATCH',
      token: supplierToken,
      body: { status: 'RETURN_COMPLETED' },
    }),
  ]);
  const finalCompletionStatuses = await Promise.all(finalReturnCompletions.map((response) => response.status));
  assert.deepEqual(finalCompletionStatuses.sort(), [200, 409]);
  const [fullyRestocked] = await getPool().execute(
    `SELECT p.id, i.quantity
     FROM products p JOIN inventory i ON i.product_id = p.id
     WHERE p.id IN (?, ?) ORDER BY p.id`,
    [productId, secondProductId],
  );
  assert.deepEqual(fullyRestocked.map((row) => Number(row.quantity)), [3, 5]);

  const complaintResponse = await request('/complaints', {
    method: 'POST',
    token: buyerToken,
    body: {
      orderId,
      category: 'quality',
      title: `Quality issue ${randomUUID()}`,
      description: 'One delivered item did not meet the agreed specification.',
    },
  });
  const complaintId = complaintResponse.complaint.id;
  complaintIds.push(complaintId);
  assert.equal(complaintResponse.complaint.status, 'OPEN');
  const supplierComplaintView = await request(`/complaints/${complaintId}`, { token: supplierToken });
  assert.equal(Number(supplierComplaintView.complaint.id), Number(complaintId));
  const unrelatedComplaint = await rawRequest(`/complaints/${complaintId}`, { token: auditSupplierToken });
  assert.equal(unrelatedComplaint.status, 404);
  const duplicateComplaint = await rawRequest('/complaints', {
    method: 'POST',
    token: buyerToken,
    body: {
      orderId,
      category: 'quality',
      title: complaintResponse.complaint.title,
      description: 'Duplicate active complaint.',
    },
  });
  assert.equal(duplicateComplaint.status, 409);
  const buyerCannotResolve = await rawRequest(`/complaints/${complaintId}/status`, {
    method: 'PATCH',
    token: buyerToken,
    body: { status: 'RESOLVED' },
  });
  assert.equal(buyerCannotResolve.status, 403);
  await request(`/complaints/${complaintId}/responses`, {
    method: 'POST',
    token: supplierToken,
    body: { response: 'We will review the quality report.' },
  });
  await request(`/complaints/${complaintId}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'UNDER_REVIEW', note: 'Evidence review started.' },
  });
  await request(`/complaints/${complaintId}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'RESOLVED', note: 'Resolution recorded.' },
  });
  const closedComplaint = await request(`/complaints/${complaintId}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'CLOSED' },
  });
  assert.equal(closedComplaint.complaint.status, 'CLOSED');
  assert.ok(closedComplaint.complaint.history.some((entry) => entry.action === 'RESPONSE'));
  const responseAfterClose = await rawRequest(`/complaints/${complaintId}/responses`, {
    method: 'POST',
    token: buyerToken,
    body: { response: 'This should no longer be accepted.' },
  });
  assert.equal(responseAfterClose.status, 409);
  const [complaintRecord] = await getPool().execute(
    `SELECT c.status, COUNT(h.id) AS historyCount
     FROM complaints c JOIN complaint_history h ON h.complaint_id = c.id
     WHERE c.id = ? GROUP BY c.id`,
    [complaintId],
  );
  assert.equal(complaintRecord[0].status, 'CLOSED');
  assert.equal(Number(complaintRecord[0].historyCount), 5);

  await request(`/products/${productId}`, { method: 'DELETE', token: supplierToken });
  const reactivatedProduct = await request(`/products/${productId}`, {
    method: 'PUT',
    token: supplierToken,
    body: { isActive: true },
  });
  assert.equal(reactivatedProduct.product.isActive, 1);
});

test('enforces role guards and administrator management boundaries', async () => {
  const databaseHealth = await request('/health/db');
  assert.equal(databaseHealth.status, 'ok');
  assert.equal(databaseHealth.database.connected, true);
  assert.equal(databaseHealth.database.database, 'procurehub');

  const unauthorized = await fetch(`${apiBase}/orders`);
  assert.equal(unauthorized.status, 401);

  const buyerProductCreate = await fetch(`${apiBase}/products`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + buyerToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  assert.equal(buyerProductCreate.status, 403);

  const supplierOrderCreate = await fetch(`${apiBase}/orders`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + supplierToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ quotationId: 1 }),
  });
  assert.equal(supplierOrderCreate.status, 403);

  const hiddenCategories = await fetch(`${apiBase}/categories?includeInactive=true`, {
    headers: { Authorization: 'Bearer ' + buyerToken },
  });
  assert.equal(hiddenCategories.status, 403);

  for (const token of [buyerToken, supplierToken]) {
    const adminUsers = await rawRequest('/admin/users', { token });
    assert.equal(adminUsers.status, 403);
    const adminUserStatus = await rawRequest(`/admin/users/${adminId}/status`, {
      method: 'PATCH',
      token,
      body: { isActive: false },
    });
    assert.equal(adminUserStatus.status, 403);
    const hiddenCategoriesForRole = await rawRequest('/categories?includeInactive=true', { token });
    assert.equal(hiddenCategoriesForRole.status, 403);
  }
  const adminUserList = await request('/admin/users', { token: adminToken });
  assert.ok(Array.isArray(adminUserList.users));
  const adminCategories = await request('/categories?includeInactive=true', { token: adminToken });
  assert.ok(Array.isArray(adminCategories.categories));

  const selfDeactivation = await fetch(`${apiBase}/admin/users/${adminId}/status`, {
    method: 'PATCH',
    headers: {
      Authorization: 'Bearer ' + adminToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ isActive: false }),
  });
  assert.equal(selfDeactivation.status, 409);
});

test('rejects invalid and expired authentication tokens and malformed registration', async () => {
  const invalidToken = await rawRequest('/auth/me', { token: 'not-a-valid-jwt' });
  assert.equal(invalidToken.status, 401);

  const expiredToken = jwt.sign({ id: buyerId, role: 'BUYER' }, getJwtSecret(), { expiresIn: -1 });
  const expiredResponse = await rawRequest('/auth/me', { token: expiredToken });
  assert.equal(expiredResponse.status, 401);

  const badLogin = await rawRequest('/auth/login', {
    method: 'POST',
    body: { email: 'buyer@procurehub.com', password: 'incorrect-password' },
  });
  assert.equal(badLogin.status, 401);
  const badLoginBody = await badLogin.json();
  assert.equal(badLoginBody.message, 'Invalid email or password.');
  const unknownAccountLogin = await rawRequest('/auth/login', {
    method: 'POST',
    body: { email: `unknown-${randomUUID()}@example.test`, password: 'incorrect-password' },
  });
  assert.equal(unknownAccountLogin.status, 401);
  assert.equal((await unknownAccountLogin.json()).message, badLoginBody.message);
  const malformedLogin = await rawRequest('/auth/login', {
    method: 'POST',
    body: { email: { value: 'buyer@procurehub.com' }, password: 'incorrect-password' },
  });
  assert.equal(malformedLogin.status, 400);
  const malformedLoginBody = await malformedLogin.json();
  assert.ok(malformedLoginBody.errors.email);
  const weakRegistration = await rawRequest('/auth/register', {
    method: 'POST',
    body: { name: 'Weak Password', email: `weak-${randomUUID()}@example.test`, password: 'short', role: 'BUYER' },
  });
  assert.equal(weakRegistration.status, 400);
  const adminRoleRegistration = await rawRequest('/auth/register', {
    method: 'POST',
    body: { name: 'Escalation Attempt', email: `admin-${randomUUID()}@example.test`, password: `Valid-${randomUUID()}!`, role: 'ADMIN' },
  });
  assert.equal(adminRoleRegistration.status, 400);

  const malformedRequest = await rawRequest('/purchase-requests', {
    method: 'POST',
    token: buyerToken,
    body: {
      title: { value: 'not text' },
      category: 'Groceries',
      items: [{ name: 'Rice', quantity: 1, unit: 'bag' }],
    },
  });
  assert.equal(malformedRequest.status, 400);
  const oversizedRequest = await rawRequest('/purchase-requests', {
    method: 'POST',
    token: buyerToken,
    body: {
      title: 'R'.repeat(201),
      category: 'Groceries',
      items: [{ name: 'Rice', quantity: 1, unit: 'bag' }],
    },
  });
  assert.equal(oversizedRequest.status, 400);
  const malformedQuotation = await rawRequest('/quotations', {
    method: 'POST',
    token: supplierToken,
    body: {
      requestId: 1,
      items: [{ requestItemId: 1, quantity: 1, unitPrice: 1 }],
      message: { value: 'not text' },
    },
  });
  assert.equal(malformedQuotation.status, 400);
});

test('rejects insufficient stock atomically and releases stock on rejection and cancellation', async () => {
  const fixtureTag = randomUUID();
  const titles = {
    insufficient: `ProcureHub insufficient stock ${fixtureTag}`,
    concurrentOne: `ProcureHub concurrent reservation A ${fixtureTag}`,
    concurrentTwo: `ProcureHub concurrent reservation B ${fixtureTag}`,
    rejection: `ProcureHub rejection test ${fixtureTag}`,
    cancellation: `ProcureHub cancellation test ${fixtureTag}`,
  };
  const requestIds = [];
  const quotationIds = [];
  const orderIds = [];
  let auditProductId;
  const supplierMessages = [];
  const [notificationRows] = await getPool().query('SELECT COALESCE(MAX(id), 0) AS maxId FROM notifications');
  const notificationStartId = Number(notificationRows[0].maxId);

  const makeRequestAndQuote = async (title, quantity, unitPrice) => {
    const requestResult = await request('/purchase-requests', {
      method: 'POST',
      token: auditBuyerToken,
      body: {
        title,
        category: 'Groceries',
        items: [{ productId: auditProductId, name: title, quantity, unit: 'each' }],
      },
    });
    const id = requestResult.request.id;
    requestIds.push(id);
    supplierMessages.push(`A buyer posted a purchase request: ${title}`);
    const quotation = await request('/quotations', {
      method: 'POST',
      token: supplierToken,
      body: {
        requestId: id,
        amount: quantity * unitPrice,
        items: [{ requestItemId: requestResult.request.items[0].id, quantity, unitPrice }],
      },
    });
    quotationIds.push(quotation.quotation.id);
    await request(`/quotations/${quotation.quotation.id}`, {
      method: 'PATCH',
      token: auditBuyerToken,
      body: { status: 'ACCEPTED' },
    });
    supplierMessages.push(`Your quotation for purchase request #${id} was accepted.`);
    return quotation.quotation.id;
  };

  try {
    const product = await request('/products', {
      method: 'POST',
      token: supplierToken,
      body: {
        name: `Inventory safety fixture ${fixtureTag}`,
        category: 'Groceries',
        unit: 'each',
        price: 5,
        stock: 4,
      },
    });
    auditProductId = product.product.id;

    const insufficientQuoteId = await makeRequestAndQuote(titles.insufficient, 5, 5);
    const insufficientOrder = await rawRequest('/orders', {
      method: 'POST',
      token: auditBuyerToken,
      body: { quotationId: insufficientQuoteId },
    });
    assert.equal(insufficientOrder.status, 409);
    const [failedOrderDb] = await getPool().execute(
      'SELECT COUNT(*) AS count FROM purchase_orders WHERE quotation_id = ?',
      [insufficientQuoteId],
    );
    assert.equal(Number(failedOrderDb[0].count), 0, 'Failed order must be rolled back entirely.');
    const insufficientInventory = await request(`/products/${auditProductId}/inventory`, { token: supplierToken });
    assert.equal(Number(insufficientInventory.inventory.quantity), 4);
    assert.equal(Number(insufficientInventory.inventory.reservedQuantity), 0);

    const concurrentQuoteOne = await makeRequestAndQuote(titles.concurrentOne, 3, 5);
    const concurrentQuoteTwo = await makeRequestAndQuote(titles.concurrentTwo, 3, 5);
    const concurrentOrderResponses = await Promise.all([
      rawRequest('/orders', { method: 'POST', token: auditBuyerToken, body: { quotationId: concurrentQuoteOne } }),
      rawRequest('/orders', { method: 'POST', token: auditBuyerToken, body: { quotationId: concurrentQuoteTwo } }),
    ]);
    const concurrentOrderResults = await Promise.all(concurrentOrderResponses.map(async (response) => ({
      status: response.status,
      data: await response.json(),
    })));
    assert.equal(concurrentOrderResults.filter((result) => result.status === 201).length, 1);
    assert.equal(concurrentOrderResults.filter((result) => result.status === 409).length, 1);
    const concurrentOrder = concurrentOrderResults.find((result) => result.status === 201).data.order;
    orderIds.push(concurrentOrder.id);
    supplierMessages.push(`A buyer created purchase order #${concurrentOrder.id}.`);
    const concurrentInventory = await request(`/products/${auditProductId}/inventory`, { token: supplierToken });
    assert.equal(Number(concurrentInventory.inventory.quantity), 4);
    assert.equal(Number(concurrentInventory.inventory.reservedQuantity), 3);
    const [concurrentReservationDb] = await getPool().execute(
      `SELECT COUNT(*) AS count FROM inventory_reservations
       WHERE product_id = ? AND status = 'RESERVED'`,
      [auditProductId],
    );
    assert.equal(Number(concurrentReservationDb[0].count), 1);
    await request(`/orders/${concurrentOrder.id}`, {
      method: 'PATCH',
      token: adminToken,
      body: { status: 'CANCELLED' },
    });
    supplierMessages.push(`Order #${concurrentOrder.id} status changed to CANCELLED.`);
    const releasedConcurrentInventory = await request(`/products/${auditProductId}/inventory`, { token: supplierToken });
    assert.equal(Number(releasedConcurrentInventory.inventory.reservedQuantity), 0);

    const rejectedQuoteId = await makeRequestAndQuote(titles.rejection, 2, 5);
    const rejectedOrder = await request('/orders', {
      method: 'POST',
      token: auditBuyerToken,
      body: { quotationId: rejectedQuoteId },
    });
    const rejectedOrderId = rejectedOrder.order.id;
    orderIds.push(rejectedOrderId);
    supplierMessages.push(`A buyer created purchase order #${rejectedOrderId}.`);
    const reservedBeforeReject = await request(`/products/${auditProductId}/inventory`, { token: supplierToken });
    assert.equal(Number(reservedBeforeReject.inventory.reservedQuantity), 2);
    await request(`/orders/${rejectedOrderId}`, {
      method: 'PATCH',
      token: supplierToken,
      body: { status: 'REJECTED' },
    });
    const [rejectedDb] = await getPool().execute(
      `SELECT po.status, ir.status AS reservationStatus, i.reserved_quantity AS reservedQuantity
       FROM purchase_orders po
       JOIN inventory_reservations ir ON ir.purchase_order_id = po.id
       JOIN inventory i ON i.product_id = ir.product_id
       WHERE po.id = ?`,
      [rejectedOrderId],
    );
    assert.equal(rejectedDb[0].status, 'REJECTED');
    assert.equal(rejectedDb[0].reservationStatus, 'RELEASED');
    assert.equal(Number(rejectedDb[0].reservedQuantity), 0);
    const repeatedRejection = await rawRequest(`/orders/${rejectedOrderId}`, {
      method: 'PATCH',
      token: supplierToken,
      body: { status: 'REJECTED' },
    });
    assert.equal(repeatedRejection.status, 409);

    const cancelledQuoteId = await makeRequestAndQuote(titles.cancellation, 1, 5);
    const cancelledOrder = await request('/orders', {
      method: 'POST',
      token: auditBuyerToken,
      body: { quotationId: cancelledQuoteId },
    });
    const cancelledOrderId = cancelledOrder.order.id;
    orderIds.push(cancelledOrderId);
    supplierMessages.push(`A buyer created purchase order #${cancelledOrderId}.`);
    await request(`/orders/${cancelledOrderId}`, {
      method: 'PATCH',
      token: adminToken,
      body: { status: 'CANCELLED' },
    });
    supplierMessages.push(`Order #${cancelledOrderId} status changed to CANCELLED.`);
    const [cancelledDb] = await getPool().execute(
      `SELECT po.status, ir.status AS reservationStatus, i.quantity, i.reserved_quantity AS reservedQuantity
       FROM purchase_orders po
       JOIN inventory_reservations ir ON ir.purchase_order_id = po.id
       JOIN inventory i ON i.product_id = ir.product_id
       WHERE po.id = ?`,
      [cancelledOrderId],
    );
    assert.equal(cancelledDb[0].status, 'CANCELLED');
    assert.equal(cancelledDb[0].reservationStatus, 'RELEASED');
    assert.equal(Number(cancelledDb[0].quantity), 4);
    assert.equal(Number(cancelledDb[0].reservedQuantity), 0);
  } finally {
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const [buyerNotifications] = await connection.execute(
        'SELECT id FROM notifications WHERE user_id = ? AND id > ?',
        [auditBuyerId, notificationStartId],
      );
      const [supplierNotifications] = await connection.execute(
        `SELECT id FROM notifications
         WHERE user_id = ? AND id > ? AND message IN (${supplierMessages.map(() => '?').join(', ') || "''"})`,
        [supplierId, notificationStartId, ...supplierMessages],
      );
      const cleanupNotificationIds = [
        ...buyerNotifications.map((row) => row.id),
        ...supplierNotifications.map((row) => row.id),
      ];
      if (cleanupNotificationIds.length) {
        const placeholders = cleanupNotificationIds.map(() => '?').join(', ');
        await connection.execute(`DELETE FROM notifications WHERE id IN (${placeholders})`, cleanupNotificationIds);
      }
      if (orderIds.length) {
        const placeholders = orderIds.map(() => '?').join(', ');
        await connection.execute(`DELETE FROM inventory_reservations WHERE purchase_order_id IN (${placeholders})`, orderIds);
        await connection.execute(`DELETE FROM order_status_history WHERE purchase_order_id IN (${placeholders})`, orderIds);
        await connection.execute(`DELETE FROM order_items WHERE purchase_order_id IN (${placeholders})`, orderIds);
        await connection.execute(`DELETE FROM purchase_orders WHERE id IN (${placeholders})`, orderIds);
      }
      if (quotationIds.length) {
        const placeholders = quotationIds.map(() => '?').join(', ');
        await connection.execute(`DELETE FROM quotation_items WHERE quotation_id IN (${placeholders})`, quotationIds);
        await connection.execute(`DELETE FROM quotations WHERE id IN (${placeholders})`, quotationIds);
      }
      if (requestIds.length) {
        const placeholders = requestIds.map(() => '?').join(', ');
        await connection.execute(`DELETE FROM purchase_request_items WHERE purchase_request_id IN (${placeholders})`, requestIds);
        await connection.execute(`DELETE FROM purchase_requests WHERE id IN (${placeholders})`, requestIds);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    if (auditProductId) {
      await getPool().execute('DELETE FROM inventory WHERE product_id = ?', [auditProductId]);
      await getPool().execute('DELETE FROM products WHERE id = ? AND supplier_id = ?', [auditProductId, supplierId]);
    }
  }
});
