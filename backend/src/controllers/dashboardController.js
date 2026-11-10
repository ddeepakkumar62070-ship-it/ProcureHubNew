const dashboardRepository = require('../repositories/dashboardRepository');
const productRepository = require('../repositories/productRepository');
const procurementRepository = require('../repositories/procurementRepository');
const userRepository = require('../repositories/userRepository');

const getBuyerDashboard = async (req, res, next) => {
  try {
    const [summary, requests, quotations, orders] = await Promise.all([
      dashboardRepository.buyerSummary(req.user.id),
      procurementRepository.listRequests({ userId: req.user.id, role: 'BUYER' }),
      procurementRepository.listQuotations({ userId: req.user.id, role: 'BUYER' }),
      procurementRepository.listOrders({ userId: req.user.id, role: 'BUYER' }),
    ]);
    return res.json({ summary, requests, quotations, orders });
  } catch (error) {
    return next(error);
  }
};

const getSupplierDashboard = async (req, res, next) => {
  try {
    const [summary, products, requests, orders] = await Promise.all([
      dashboardRepository.supplierSummary(req.user.id),
      productRepository.list({ supplierId: req.user.id }),
      procurementRepository.listRequests({ userId: req.user.id, role: 'SUPPLIER' }),
      procurementRepository.listOrders({ userId: req.user.id, role: 'SUPPLIER' }),
    ]);
    return res.json({ summary, products, requests, orders });
  } catch (error) {
    return next(error);
  }
};

const getAdminDashboard = async (req, res, next) => {
  try {
    const [summary, users, products, purchaseRequests, quotations, orders, reviews] = await Promise.all([
      dashboardRepository.adminSummary(),
      userRepository.listUsers(),
      productRepository.list({ includeInactive: true }),
      procurementRepository.listRequests({ userId: req.user.id, role: 'ADMIN' }),
      procurementRepository.listQuotations({ userId: req.user.id, role: 'ADMIN' }),
      procurementRepository.listOrders({ userId: req.user.id, role: 'ADMIN' }),
      procurementRepository.listReviews({ userId: req.user.id, role: 'ADMIN' }),
    ]);
    return res.json({ summary, users, products, purchaseRequests, quotations, orders, reviews });
  } catch (error) {
    return next(error);
  }
};

module.exports = { getAdminDashboard, getBuyerDashboard, getSupplierDashboard };
