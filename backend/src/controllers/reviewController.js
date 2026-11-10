const procurementRepository = require('../repositories/procurementRepository');

const addReview = async (req, res, next) => {
  const { orderId, rating, comment = '' } = req.body;
  const numericRating = Number(rating);
  if (!Number.isSafeInteger(Number(orderId)) || Number(orderId) < 1
      || !Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5
      || typeof comment !== 'string' || comment.length > 2000) {
    return res.status(400).json({ message: 'Provide a valid order ID, a whole-number rating from 1 to 5, and a comment up to 2000 characters.' });
  }

  try {
    const review = await procurementRepository.createReview({
      orderId,
      buyerId: req.user.id,
      rating: numericRating,
      comment,
    });
    if (review === 'ORDER_NOT_REVIEWABLE') {
      return res.status(404).json({ message: 'Delivered order not found for this buyer.' });
    }
    return res.status(201).json({ message: 'Supplier review added successfully.', review });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'This order has already been reviewed.' });
    }
    return next(error);
  }
};

const listReviews = async (req, res, next) => {
  try {
    const reviews = await procurementRepository.listReviews({ userId: req.user.id, role: req.user.role });
    return res.json({ reviews });
  } catch (error) {
    return next(error);
  }
};

module.exports = { addReview, listReviews };
