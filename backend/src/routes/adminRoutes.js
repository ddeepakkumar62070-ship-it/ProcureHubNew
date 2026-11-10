const express = require('express');
const userRepository = require('../repositories/userRepository');
const productRepository = require('../repositories/productRepository');
const { authMiddleware, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/users', authMiddleware, authorize('ADMIN'), async (req, res, next) => {
  try {
    return res.json({ users: await userRepository.listUsers() });
  } catch (error) {
    return next(error);
  }
});

router.patch('/users/:id/status', authMiddleware, authorize('ADMIN'), async (req, res, next) => {
  const { isActive } = req.body;
  if (typeof isActive !== 'boolean') {
    return res.status(400).json({ message: 'isActive must be a boolean.' });
  }
  if (!isActive && Number(req.params.id) === Number(req.user.id)) {
    return res.status(409).json({ message: 'You cannot deactivate your own administrator account.' });
  }
  try {
    const updated = await userRepository.setActive(req.params.id, isActive);
    if (updated === 'NOT_FOUND') return res.status(404).json({ message: 'User not found.' });
    if (updated === 'LAST_ACTIVE_ADMIN') {
      return res.status(409).json({ message: 'The last active administrator cannot be deactivated.' });
    }
    return res.json({ message: 'User status updated.' });
  } catch (error) {
    return next(error);
  }
});

router.get('/categories', authMiddleware, authorize('ADMIN', 'BUYER', 'SUPPLIER'), async (req, res, next) => {
  try {
    return res.json({ categories: await productRepository.listCategories() });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
