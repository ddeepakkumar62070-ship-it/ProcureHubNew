const complaintRepository = require('../repositories/complaintRepository');
const { parsePagination } = require('../utils/pagination');

const categories = new Set(['quality', 'delivery', 'invoice_payment', 'communication', 'other']);

async function listComplaints(req, res, next) {
  try {
    const complaints = await complaintRepository.listComplaints({
      userId: req.user.id,
      role: req.user.role,
      ...parsePagination(req.query),
    });
    return res.json({ complaints });
  } catch (error) {
    return next(error);
  }
}

async function getComplaint(req, res, next) {
  try {
    const complaint = await complaintRepository.getComplaint(req.params.id, {
      userId: req.user.id,
      role: req.user.role,
    });
    if (!complaint) return res.status(404).json({ message: 'Complaint not found.' });
    return res.json({ complaint });
  } catch (error) {
    return next(error);
  }
}

async function createComplaint(req, res, next) {
  const { orderId, category, title, description } = req.body || {};
  if (!categories.has(category)) return res.status(400).json({ message: 'Choose a valid complaint category.' });
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 200) {
    return res.status(400).json({ message: 'A complaint title up to 200 characters is required.' });
  }
  if (typeof description !== 'string' || !description.trim()
      || Buffer.byteLength(description, 'utf8') > 10000) {
    return res.status(400).json({ message: 'Complaint details up to 10000 characters are required.' });
  }
  let parsedOrderId = null;
  if (orderId !== undefined && orderId !== null && orderId !== '') {
    if (!Number.isSafeInteger(Number(orderId)) || Number(orderId) < 1) {
      return res.status(400).json({ message: 'A valid order ID is required when linking an order.' });
    }
    parsedOrderId = Number(orderId);
  }
  try {
    const result = await complaintRepository.createComplaint({
      complainantId: req.user.id,
      role: req.user.role,
      orderId: parsedOrderId,
      category,
      title: title.trim(),
      description: description.trim(),
    });
    if (result === 'FORBIDDEN') return res.status(403).json({ message: 'Only buyers and suppliers may submit complaints.' });
    if (result === 'ORDER_NOT_FOUND') {
      return res.status(404).json({ message: 'Linked order not found or you are not a participant.' });
    }
    if (result === 'DUPLICATE_ACTIVE') {
      return res.status(409).json({ message: 'An active complaint with this title already exists for that order.' });
    }
    return res.status(201).json({ message: 'Complaint submitted.', complaint: result });
  } catch (error) {
    return next(error);
  }
}

async function addComplaintResponse(req, res, next) {
  const { response } = req.body || {};
  if (typeof response !== 'string' || !response.trim()
      || Buffer.byteLength(response, 'utf8') > 4000) {
    return res.status(400).json({ message: 'A response up to 4000 characters is required.' });
  }
  try {
    const result = await complaintRepository.addComplaintResponse({
      complaintId: req.params.id,
      userId: req.user.id,
      role: req.user.role,
      response: response.trim(),
    });
    if (result === 'NOT_FOUND') return res.status(404).json({ message: 'Complaint not found.' });
    if (result === 'CLOSED') return res.status(409).json({ message: 'This complaint is closed and cannot receive responses.' });
    return res.status(201).json({ message: 'Response added.', complaint: result });
  } catch (error) {
    return next(error);
  }
}

async function updateComplaintStatus(req, res, next) {
  const { status, note } = req.body || {};
  if (!['UNDER_REVIEW', 'RESOLVED', 'REJECTED', 'CLOSED'].includes(status)) {
    return res.status(400).json({ message: 'Choose a valid complaint status.' });
  }
  if (note !== undefined && note !== null
      && (typeof note !== 'string' || Buffer.byteLength(note, 'utf8') > 4000)) {
    return res.status(400).json({ message: 'Status note must be text up to 4000 characters.' });
  }
  try {
    const result = await complaintRepository.updateComplaintStatus({
      complaintId: req.params.id,
      adminId: req.user.id,
      status,
      note: note?.trim() || null,
    });
    if (result === 'NOT_FOUND') return res.status(404).json({ message: 'Complaint not found.' });
    if (result === 'INVALID_TRANSITION') {
      return res.status(409).json({ message: 'That complaint status transition is not permitted.' });
    }
    return res.json({ message: 'Complaint status updated.', complaint: result });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  addComplaintResponse,
  createComplaint,
  getComplaint,
  listComplaints,
  updateComplaintStatus,
};
