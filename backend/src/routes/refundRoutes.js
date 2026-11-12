const express = require('express');
const { authMiddleware, authorize } = require('../middleware/auth');
const { getRefund, listRefunds, updateRefund } = require('../controllers/refundController');

const router = express.Router();
router.use(authMiddleware, authorize('BUYER', 'SUPPLIER', 'ADMIN'));
router.get('/', listRefunds);
router.get('/:id', getRefund);
router.patch('/:id', authorize('ADMIN'), updateRefund);

module.exports = router;
