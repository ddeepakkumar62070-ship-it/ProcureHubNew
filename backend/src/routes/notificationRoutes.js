const express = require('express');
const { authMiddleware, authorize } = require('../middleware/auth');
const { listNotifications, markNotificationRead } = require('../controllers/notificationController');

const router = express.Router();
router.use(authMiddleware, authorize('BUYER', 'SUPPLIER', 'ADMIN'));
router.get('/', listNotifications);
router.patch('/:id/read', markNotificationRead);

module.exports = router;
