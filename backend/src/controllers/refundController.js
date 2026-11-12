const refundRepository = require('../repositories/refundRepository');
const { parsePagination } = require('../utils/pagination');

async function listRefunds(req, res, next) {
  try {
    const refunds = await refundRepository.listRefunds({
      userId: req.user.id,
      role: req.user.role,
      ...parsePagination(req.query),
    });
    return res.json({ refunds });
  } catch (error) {
    return next(error);
  }
}

async function getRefund(req, res, next) {
  try {
    const refund = await refundRepository.getRefund(req.params.id, {
      userId: req.user.id,
      role: req.user.role,
    });
    if (!refund) return res.status(404).json({ message: 'Refund not found.' });
    return res.json({ refund });
  } catch (error) {
    return next(error);
  }
}

async function updateRefund(req, res, next) {
  const { status, transactionReference, processedAt, manualTransferConfirmed, note } = req.body || {};
  if (!['REFUND_PENDING', 'REFUND_PROCESSED', 'REFUND_FAILED'].includes(status)) {
    return res.status(400).json({ message: 'Choose a valid refund status.' });
  }
  if (status === 'REFUND_PROCESSED' && manualTransferConfirmed !== true) {
    return res.status(400).json({ message: 'Confirm that the refund was manually transferred before recording it as processed.' });
  }
  if (status === 'REFUND_FAILED' && (typeof note !== 'string' || !note.trim())) {
    return res.status(400).json({ message: 'Explain why the refund processing failed.' });
  }
  if (transactionReference !== undefined && transactionReference !== null
      && (typeof transactionReference !== 'string' || transactionReference.trim().length > 120)) {
    return res.status(400).json({ message: 'Transaction reference must be text up to 120 characters.' });
  }
  if (status === 'REFUND_PROCESSED'
      && (typeof processedAt !== 'string' || !processedAt.trim() || Number.isNaN(Date.parse(processedAt)))) {
    return res.status(400).json({ message: 'A valid manual processing date is required.' });
  }
  if (note !== undefined && note !== null
      && (typeof note !== 'string' || Buffer.byteLength(note, 'utf8') > 2000)) {
    return res.status(400).json({ message: 'Refund note must be text up to 2000 characters.' });
  }
  try {
    const result = await refundRepository.updateRefund({
      refundId: req.params.id,
      adminId: req.user.id,
      status,
      transactionReference: transactionReference?.trim() || null,
      processedAt: status === 'REFUND_PROCESSED' ? new Date(processedAt) : null,
      note: note?.trim() || null,
    });
    if (result === 'NOT_FOUND') return res.status(404).json({ message: 'Refund not found.' });
    if (result === 'INVALID_TRANSITION') return res.status(409).json({ message: 'That refund status transition is not permitted.' });
    if (result === 'INVOICE_NOT_FOUND') return res.status(409).json({ message: 'The refund invoice no longer exists.' });
    if (result === 'REFUND_EXCEEDS_PAID') {
      return res.status(409).json({ message: 'Processed refunds cannot exceed the amount actually recorded as paid.' });
    }
    return res.json({ message: 'Refund record updated. This action records a manual transfer; it does not transfer money.', refund: result });
  } catch (error) {
    return next(error);
  }
}

module.exports = { getRefund, listRefunds, updateRefund };
