const express = require('express');
const {
  createPurchaseRequest, listPurchaseRequests, getPurchaseRequest,
  createQuotation, listQuotations, updateQuotationStatus,
  createOrder, listOrders, getOrder, updateOrderStatus,
} = require('../controllers/requestController');
const { authMiddleware, authorize } = require('../middleware/auth');

const router = express.Router();

router.post('/purchase-requests', authMiddleware, authorize('BUYER'), createPurchaseRequest);
router.get('/purchase-requests', authMiddleware, listPurchaseRequests);
router.get('/purchase-requests/:id', authMiddleware, authorize('BUYER', 'SUPPLIER', 'ADMIN'), getPurchaseRequest);
router.post('/quotations', authMiddleware, authorize('SUPPLIER'), createQuotation);
router.get('/quotations', authMiddleware, listQuotations);
router.patch('/quotations/:id', authMiddleware, updateQuotationStatus);
router.post('/orders', authMiddleware, authorize('BUYER'), createOrder);
router.get('/orders', authMiddleware, listOrders);
router.get('/orders/:id', authMiddleware, authorize('BUYER', 'SUPPLIER', 'ADMIN'), getOrder);
router.patch('/orders/:id', authMiddleware, updateOrderStatus);

module.exports = router;
