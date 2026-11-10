const express = require('express');
const { registerUser, loginUser, getCurrentUser } = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');
const { loginRateLimit, registrationRateLimit } = require('../middleware/authRateLimit');

const router = express.Router();

router.post('/register', registrationRateLimit, registerUser);
router.post('/login', loginRateLimit, loginUser);
router.get('/me', authMiddleware, getCurrentUser);

module.exports = router;
