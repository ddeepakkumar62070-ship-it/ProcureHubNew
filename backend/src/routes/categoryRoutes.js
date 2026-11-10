const express = require('express');
const { authMiddleware, authorize } = require('../middleware/auth');
const { createCategory, listCategories, updateCategory } = require('../controllers/categoryController');

const router = express.Router();
router.get('/', (req, res, next) => {
  if (req.query.includeInactive === 'true') {
    return authMiddleware(req, res, (error) => {
      if (error) return next(error);
      return authorize('ADMIN')(req, res, () => listCategories(req, res, next));
    });
  }
  return listCategories(req, res, next);
});
router.post('/', authMiddleware, authorize('ADMIN'), createCategory);
router.patch('/:id', authMiddleware, authorize('ADMIN'), updateCategory);

module.exports = router;
