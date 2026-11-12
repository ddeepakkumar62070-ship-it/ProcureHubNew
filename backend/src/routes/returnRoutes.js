const express = require('express');
const { authMiddleware, authorize } = require('../middleware/auth');
const {
  createReturn,
  getReturn,
  listReturns,
  updateReturnStatus,
} = require('../controllers/returnController');

const router = express.Router();
router.use(authMiddleware, authorize('BUYER', 'SUPPLIER', 'ADMIN'));
router.get('/', listReturns);
router.post('/', authorize('BUYER'), createReturn);
router.get('/:id', getReturn);
router.patch('/:id/status', authorize('SUPPLIER'), updateReturnStatus);

module.exports = router;
