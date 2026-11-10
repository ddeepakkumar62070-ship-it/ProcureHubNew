const express = require('express');
const {
  listProducts, getProductById, createProduct, updateProduct, deleteProduct,
  listMyProducts, listMyInventory, getInventory, updateInventory,
} = require('../controllers/productController');
const { authMiddleware, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', listProducts);
router.get('/mine', authMiddleware, authorize('SUPPLIER'), listMyProducts);
router.get('/inventory', authMiddleware, authorize('SUPPLIER'), listMyInventory);
router.get('/:id/inventory', authMiddleware, authorize('SUPPLIER'), getInventory);
router.put('/:id/inventory', authMiddleware, authorize('SUPPLIER'), updateInventory);
router.get('/:id', getProductById);
router.post('/', authMiddleware, authorize('SUPPLIER'), createProduct);
router.put('/:id', authMiddleware, authorize('SUPPLIER', 'ADMIN'), updateProduct);
router.delete('/:id', authMiddleware, authorize('SUPPLIER', 'ADMIN'), deleteProduct);

module.exports = router;
