const { getPool } = require('../config/db');
const notificationRepository = require('./notificationRepository');

async function count(sql, values = []) {
  const [rows] = await getPool().execute(sql, values);
  return Number(rows[0].total);
}

async function buyerSummary(userId) {
  const [purchaseRequests, activeRequests, pendingQuotations, activeOrders, completedOrders] = await Promise.all([
    count('SELECT COUNT(*) AS total FROM purchase_requests WHERE buyer_id = ?', [userId]),
    count("SELECT COUNT(*) AS total FROM purchase_requests WHERE buyer_id = ? AND status = 'OPEN'", [userId]),
    count(
      `SELECT COUNT(*) AS total FROM quotations q JOIN purchase_requests pr ON pr.id = q.purchase_request_id
       WHERE pr.buyer_id = ? AND q.status IN ('PENDING', 'REVISED')`,
      [userId],
    ),
    count("SELECT COUNT(*) AS total FROM purchase_orders WHERE buyer_id = ? AND status NOT IN ('COMPLETED', 'CANCELLED', 'REJECTED')", [userId]),
    count("SELECT COUNT(*) AS total FROM purchase_orders WHERE buyer_id = ? AND status = 'COMPLETED'", [userId]),
  ]);
  const recentNotifications = await notificationRepository.recentForUser(userId);
  return {
    purchaseRequests,
    activeRequests,
    pendingQuotations,
    quotationsReceived: pendingQuotations,
    activeOrders,
    completedOrders,
    orders: activeOrders + completedOrders,
    recentNotifications,
  };
}

async function supplierSummary(userId) {
  const [products, activeProducts, openRequests, submittedQuotations, activeOrders, completedOrders] = await Promise.all([
    count('SELECT COUNT(*) AS total FROM products WHERE supplier_id = ?', [userId]),
    count('SELECT COUNT(*) AS total FROM products WHERE supplier_id = ? AND is_active = TRUE', [userId]),
    count("SELECT COUNT(*) AS total FROM purchase_requests WHERE status = 'OPEN'"),
    count('SELECT COUNT(*) AS total FROM quotations WHERE supplier_id = ?', [userId]),
    count("SELECT COUNT(*) AS total FROM purchase_orders WHERE supplier_id = ? AND status NOT IN ('COMPLETED', 'CANCELLED', 'REJECTED')", [userId]),
    count("SELECT COUNT(*) AS total FROM purchase_orders WHERE supplier_id = ? AND status = 'COMPLETED'", [userId]),
  ]);
  const recentNotifications = await notificationRepository.recentForUser(userId);
  return { products, activeProducts, openRequests, submittedQuotations, activeOrders, completedOrders, orders: activeOrders + completedOrders, recentNotifications };
}

async function adminSummary() {
  const [users, buyers, suppliers, businesses, products, purchaseRequests, orders, completedOrders, reviews] = await Promise.all([
    count('SELECT COUNT(*) AS total FROM users'),
    count("SELECT COUNT(*) AS total FROM users WHERE role = 'BUYER'"),
    count("SELECT COUNT(*) AS total FROM users WHERE role = 'SUPPLIER'"),
    count('SELECT COUNT(*) AS total FROM businesses'),
    count('SELECT COUNT(*) AS total FROM products'),
    count('SELECT COUNT(*) AS total FROM purchase_requests'),
    count('SELECT COUNT(*) AS total FROM purchase_orders'),
    count("SELECT COUNT(*) AS total FROM purchase_orders WHERE status = 'COMPLETED'"),
    count('SELECT COUNT(*) AS total FROM reviews'),
  ]);
  const [orderStatusRows] = await getPool().execute(
    'SELECT status, COUNT(*) AS total FROM purchase_orders GROUP BY status ORDER BY status',
  );
  return {
    users, buyers, suppliers, businesses, products, purchaseRequests, orders,
    completedOrders, reviews,
    orderStatistics: orderStatusRows.map((row) => ({ status: row.status, count: Number(row.total) })),
  };
}

module.exports = { adminSummary, buyerSummary, supplierSummary };
