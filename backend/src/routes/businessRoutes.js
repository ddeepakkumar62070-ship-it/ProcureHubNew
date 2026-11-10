const express = require('express');
const {
  getBusinessById,
  getMyProfile,
  getSupplierProfile,
  listBusinesses,
  updateMyProfile,
} = require('../controllers/businessController');
const { authMiddleware, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/suppliers/:supplierId/public', getSupplierProfile);
router.get('/me', authMiddleware, authorize('BUYER', 'SUPPLIER', 'ADMIN'), getMyProfile);
router.patch('/me', authMiddleware, authorize('BUYER', 'SUPPLIER', 'ADMIN'), updateMyProfile);
router.get('/', authMiddleware, authorize('ADMIN'), listBusinesses);
router.get('/:id', authMiddleware, authorize('ADMIN', 'BUYER', 'SUPPLIER'), getBusinessById);

module.exports = router;
