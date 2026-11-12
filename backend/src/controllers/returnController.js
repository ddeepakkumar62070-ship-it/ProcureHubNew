const returnRepository = require('../repositories/returnRepository');
const { parsePagination } = require('../utils/pagination');

const MAX_RETURN_QUANTITY = 999999999.999;
const hasValidQuantityPrecision = (quantity) => (
  Math.abs(quantity * 1000 - Math.round(quantity * 1000)) < 0.000001
);

async function listReturns(req, res, next) {
  try {
    const returns = await returnRepository.listReturns({
      userId: req.user.id,
      role: req.user.role,
      ...parsePagination(req.query),
    });
    return res.json({ returns });
  } catch (error) {
    return next(error);
  }
}

async function getReturn(req, res, next) {
  try {
    const record = await returnRepository.getReturn(req.params.id, {
      userId: req.user.id,
      role: req.user.role,
    });
    if (!record) return res.status(404).json({ message: 'Return request not found.' });
    return res.json({ returnRequest: record });
  } catch (error) {
    return next(error);
  }
}

async function createReturn(req, res, next) {
  const { orderId, reason, description, items } = req.body || {};
  if (!Number.isSafeInteger(Number(orderId)) || Number(orderId) < 1) {
    return res.status(400).json({ message: 'A valid order ID is required.' });
  }
  if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 120) {
    return res.status(400).json({ message: 'A return reason up to 120 characters is required.' });
  }
  if (description !== undefined && description !== null
      && (typeof description !== 'string' || Buffer.byteLength(description, 'utf8') > 4000)) {
    return res.status(400).json({ message: 'Return description must be text up to 4000 characters.' });
  }
  if (!Array.isArray(items) || items.length < 1 || items.length > 100
      || !items.every((item) => item
        && Number.isSafeInteger(Number(item.orderItemId)) && Number(item.orderItemId) > 0
        && Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0
        && Number(item.quantity) <= MAX_RETURN_QUANTITY
        && hasValidQuantityPrecision(Number(item.quantity)))) {
    return res.status(400).json({ message: 'Select 1 to 100 order items with positive quantities up to three decimal places.' });
  }
  try {
    const result = await returnRepository.createReturn({
      orderId: Number(orderId),
      buyerId: req.user.id,
      reason: reason.trim(),
      description: description?.trim() || null,
      items: items.map((item) => ({
        orderItemId: Number(item.orderItemId),
        quantity: Number(item.quantity),
      })),
    });
    if (result === 'NOT_FOUND') return res.status(404).json({ message: 'Order not found.' });
    if (result === 'INELIGIBLE_ORDER') {
      return res.status(409).json({ message: 'A return may only be requested for an order that has been delivered.' });
    }
    if (result === 'INVALID_ITEM') return res.status(400).json({ message: 'A selected item is not part of this order.' });
    if (result === 'DUPLICATE_ITEM') return res.status(400).json({ message: 'Each order item may appear only once.' });
    if (result === 'EXCESS_QUANTITY') {
      return res.status(409).json({ message: 'Requested quantity exceeds the amount still eligible for return.' });
    }
    return res.status(201).json({ message: 'Return request submitted.', returnRequest: result });
  } catch (error) {
    return next(error);
  }
}

async function updateReturnStatus(req, res, next) {
  const { status, explanation } = req.body || {};
  if (!['RETURN_APPROVED', 'RETURN_REJECTED', 'RETURN_COMPLETED'].includes(status)) {
    return res.status(400).json({ message: 'Choose a valid return decision.' });
  }
  if (explanation !== undefined && explanation !== null
      && (typeof explanation !== 'string' || Buffer.byteLength(explanation, 'utf8') > 2000)) {
    return res.status(400).json({ message: 'Decision explanation must be text up to 2000 characters.' });
  }
  try {
    const result = await returnRepository.updateReturnStatus({
      returnId: req.params.id,
      supplierId: req.user.id,
      status,
      explanation: explanation?.trim() || '',
    });
    if (result === 'NOT_FOUND') return res.status(404).json({ message: 'Return request not found.' });
    if (result === 'FORBIDDEN') return res.status(403).json({ message: 'You cannot review returns for another supplier.' });
    if (result === 'INVALID_TRANSITION') return res.status(409).json({ message: 'This return request cannot move to that status.' });
    if (result === 'EXPLANATION_REQUIRED') return res.status(400).json({ message: 'Provide an explanation when rejecting a return.' });
    if (result === 'INVOICE_NOT_FOUND') {
      return res.status(409).json({ message: 'A refund cannot be calculated because this order has no invoice.' });
    }
    if (result === 'INVENTORY_UNAVAILABLE') {
      return res.status(409).json({ message: 'Inventory could not be restored to the original supplier product.' });
    }
    return res.json({ message: 'Return request updated.', returnRequest: result });
  } catch (error) {
    return next(error);
  }
}

module.exports = { createReturn, getReturn, listReturns, updateReturnStatus };
