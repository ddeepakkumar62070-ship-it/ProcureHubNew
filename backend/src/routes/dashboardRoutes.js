const express = require('express');
const { getBuyerDashboard, getSupplierDashboard, getAdminDashboard } = require('../controllers/dashboardController');
const { authMiddleware, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/buyer', authMiddleware, authorize('BUYER'), getBuyerDashboard);
router.get('/supplier', authMiddleware, authorize('SUPPLIER'), getSupplierDashboard);
router.get('/admin', authMiddleware, authorize('ADMIN'), getAdminDashboard);

module.exports = router;
