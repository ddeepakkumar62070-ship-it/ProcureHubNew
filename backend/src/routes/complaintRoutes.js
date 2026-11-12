const express = require('express');
const { authMiddleware, authorize } = require('../middleware/auth');
const {
  addComplaintResponse,
  createComplaint,
  getComplaint,
  listComplaints,
  updateComplaintStatus,
} = require('../controllers/complaintController');

const router = express.Router();
router.use(authMiddleware, authorize('BUYER', 'SUPPLIER', 'ADMIN'));
router.get('/', listComplaints);
router.post('/', authorize('BUYER', 'SUPPLIER'), createComplaint);
router.get('/:id', getComplaint);
router.post('/:id/responses', addComplaintResponse);
router.patch('/:id/status', authorize('ADMIN'), updateComplaintStatus);

module.exports = router;
