const express = require('express');
const { addReview, listReviews } = require('../controllers/reviewController');
const { authMiddleware, authorize } = require('../middleware/auth');

const router = express.Router();

router.post('/', authMiddleware, authorize('BUYER'), addReview);
router.get('/', authMiddleware, listReviews);

module.exports = router;
