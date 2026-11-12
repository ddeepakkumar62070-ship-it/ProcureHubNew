const express = require('express');
const { authMiddleware, authorize } = require('../middleware/auth');
const { createPayment, downloadInvoicePdf, getInvoice, listInvoices } = require('../controllers/financeController');

const router = express.Router();
router.use(authMiddleware, authorize('BUYER', 'SUPPLIER', 'ADMIN'));
router.get('/', listInvoices);
router.get('/:id/pdf', downloadInvoicePdf);
router.get('/:id', getInvoice);
router.post('/:id/payments', authorize('BUYER', 'ADMIN'), createPayment);

module.exports = router;
