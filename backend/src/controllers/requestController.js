const procurementRepository = require('../repositories/procurementRepository');
const { parsePagination } = require('../utils/pagination');

const MAX_QUANTITY = 999999999.999;
const MAX_AMOUNT = 9999999999.99;

const createPurchaseRequest = async (req, res, next) => {
  const {
    title, category, items, deliveryAddress, deliveryDeadline, notes, expiresAt,
  } = req.body;
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 200
      || typeof category !== 'string' || !category.trim() || category.trim().length > 120
      || !Array.isArray(items) || items.length === 0 || items.length > 100) {
    return res.status(400).json({ message: 'Title, category and between 1 and 100 items are required.' });
  }
  const validItems = items.every((item) => item && typeof item.name === 'string'
    && item.name.trim() && item.name.trim().length <= 200
    && typeof item.unit === 'string' && item.unit.trim() && item.unit.trim().length <= 40
    && Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0
    && Number(item.quantity) <= MAX_QUANTITY
    && (item.productId === undefined || item.productId === null
      || (Number.isSafeInteger(Number(item.productId)) && Number(item.productId) > 0)));
  if (!validItems) {
    return res.status(400).json({ message: 'Each item needs a name, unit, positive quantity, and optional valid product ID.' });
  }
  for (const [field, value] of Object.entries({ deliveryAddress, notes })) {
    if (value !== undefined && value !== null && typeof value !== 'string') {
      return res.status(400).json({ message: `${field} must be a string.` });
    }
  }
  if ((deliveryAddress && deliveryAddress.length > 500)
      || (notes && Buffer.byteLength(notes, 'utf8') > 65535)) {
    return res.status(400).json({ message: 'Delivery address or notes exceed the supported length.' });
  }
  for (const [field, value] of Object.entries({ deliveryDeadline, expiresAt })) {
    if (value !== undefined && value !== null
        && (typeof value !== 'string' || Number.isNaN(Date.parse(value)))) {
      return res.status(400).json({ message: `${field} must be a valid date.` });
    }
  }
  try {
    const request = await procurementRepository.createRequest({
      buyerId: req.user.id,
      title: String(title).trim(),
      category: String(category).trim(),
      deliveryAddress: deliveryAddress?.trim(),
      deliveryDeadline,
      notes: notes?.trim(),
      expiresAt,
      items: items.map((item) => ({
        productId: item.productId ? Number(item.productId) : null,
        name: item.name.trim(),
        unit: item.unit.trim(),
        quantity: Number(item.quantity),
      })),
    });
    return res.status(201).json({ message: 'Purchase request created successfully.', request });
  } catch (error) {
    if (error.code === 'CATEGORY_NOT_FOUND' || error.code === 'PRODUCT_NOT_FOUND') {
      return res.status(400).json({ message: error.message });
    }
    return next(error);
  }
};

const listPurchaseRequests = async (req, res, next) => {
  try {
    const requests = await procurementRepository.listRequests({
      userId: req.user.id,
      role: req.user.role,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      ...parsePagination(req.query),
    });
    return res.json({ requests });
  } catch (error) {
    return next(error);
  }
};

const getPurchaseRequest = async (req, res, next) => {
  try {
    const request = await procurementRepository.findRequest(req.params.id, {
      userId: req.user.id,
      role: req.user.role,
    });
    if (!request) return res.status(404).json({ message: 'Purchase request not found.' });
    if (request === 'FORBIDDEN') return res.status(403).json({ message: 'You cannot access this purchase request.' });
    return res.json({ request });
  } catch (error) {
    return next(error);
  }
};

const createQuotation = async (req, res, next) => {
  const {
    requestId, amount, message, items, deliveryDays, terms, validUntil,
  } = req.body;
  if (!Number.isSafeInteger(Number(requestId)) || Number(requestId) < 1
      || !Array.isArray(items) || !items.length || items.length > 100) {
    return res.status(400).json({ message: 'A valid request ID and at least one quotation line are required.' });
  }
  if (amount !== undefined && (!Number.isFinite(Number(amount)) || Number(amount) < 0
      || Number(amount) > MAX_AMOUNT)) {
    return res.status(400).json({ message: 'Quotation total must be a non-negative number.' });
  }
  if (deliveryDays !== undefined
      && (!Number.isInteger(Number(deliveryDays)) || Number(deliveryDays) < 0 || Number(deliveryDays) > 3650)) {
    return res.status(400).json({ message: 'Delivery estimate must be a whole number of days from 0 to 3650.' });
  }
  if (validUntil !== undefined && validUntil !== null
      && (typeof validUntil !== 'string' || Number.isNaN(Date.parse(validUntil)))) {
    return res.status(400).json({ message: 'validUntil must be a valid date.' });
  }
  for (const [field, value] of Object.entries({ message, terms })) {
    if (value !== undefined && value !== null && (typeof value !== 'string' || value.length > 4000)) {
      return res.status(400).json({ message: `${field} must be text up to 4000 characters.` });
    }
  }
  const validItems = items.every((item) => item
    && Number.isSafeInteger(Number(item.requestItemId)) && Number(item.requestItemId) > 0
    && Number.isFinite(Number(item.unitPrice)) && Number(item.unitPrice) >= 0
    && Number(item.unitPrice) <= MAX_AMOUNT
    && Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0
    && Number(item.quantity) <= MAX_QUANTITY);
  if (!validItems) return res.status(400).json({ message: 'Quotation lines need a request item, unit price, and positive quantity.' });
  const calculatedTotal = items.reduce(
    (total, item) => total + Number(item.unitPrice) * Number(item.quantity),
    0,
  );
  if (!Number.isFinite(calculatedTotal) || calculatedTotal > MAX_AMOUNT) {
    return res.status(400).json({ message: 'Quotation total exceeds the supported amount.' });
  }
  try {
    const quotation = await procurementRepository.createQuotation({
      supplierId: req.user.id,
      requestId: Number(requestId),
      amount: amount === undefined ? undefined : Number(amount),
      message: message || '',
      items: items.map((item) => ({
        requestItemId: Number(item.requestItemId),
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
      })),
      deliveryDays: deliveryDays === undefined ? null : Number(deliveryDays),
      terms: terms || null,
      validUntil: validUntil || null,
    });
    return res.status(201).json({ message: 'Quotation submitted successfully.', quotation });
  } catch (error) {
    if (['REQUEST_NOT_FOUND', 'INVALID_QUOTATION_ITEMS', 'FORBIDDEN_PRODUCT'].includes(error.code)) {
      const code = error.code === 'REQUEST_NOT_FOUND' ? 404 : error.code === 'FORBIDDEN_PRODUCT' ? 403 : 400;
      return res.status(code).json({ message: error.message });
    }
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'You already submitted a quotation for this request.' });
    }
    return next(error);
  }
};

const listQuotations = async (req, res, next) => {
  try {
    const quotations = await procurementRepository.listQuotations({
      userId: req.user.id,
      role: req.user.role,
      ...parsePagination(req.query),
    });
    return res.json({ quotations });
  } catch (error) {
    return next(error);
  }
};

const updateQuotationStatus = async (req, res, next) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ message: 'Status is required.' });
  try {
    const result = await procurementRepository.updateQuotationStatus({
      quotationId: req.params.id,
      userId: req.user.id,
      role: req.user.role,
      status,
    });
    if (result === 'NOT_FOUND') return res.status(404).json({ message: 'Quotation not found.' });
    if (result === 'INVALID_STATE') return res.status(409).json({ message: 'Quotation is expired and cannot be changed.' });
    if (result === 'FORBIDDEN') {
      return res.status(403).json({ message: 'You are not allowed to update this quotation or use that status.' });
    }
    return res.json({ message: 'Quotation status updated.' });
  } catch (error) {
    return next(error);
  }
};

const createOrder = async (req, res, next) => {
  const { quotationId } = req.body;
  if (!Number.isSafeInteger(Number(quotationId)) || Number(quotationId) < 1) {
    return res.status(400).json({ message: 'A valid quotation ID is required.' });
  }
  try {
    const result = await procurementRepository.createOrder({ buyerId: req.user.id, quotationId: Number(quotationId) });
    if (result === 'NOT_FOUND') return res.status(404).json({ message: 'Accepted quotation not found for your purchase request.' });
    if (result === 'NOT_ACCEPTED') return res.status(409).json({ message: 'Accept a current quotation before creating an order.' });
    if (result === 'ALREADY_ORDERED') return res.status(409).json({ message: 'An order already exists for this quotation.' });
    if (result === 'NO_ITEMS') return res.status(409).json({ message: 'The quotation has no priced items.' });
    if (result === 'INSUFFICIENT_STOCK') return res.status(409).json({ message: 'Supplier inventory is insufficient to reserve this order.' });
    return res.status(201).json({ message: 'Purchase order created successfully.', order: result });
  } catch (error) {
    return next(error);
  }
};

const listOrders = async (req, res, next) => {
  try {
    const orders = await procurementRepository.listOrders({
      userId: req.user.id,
      role: req.user.role,
      ...parsePagination(req.query),
    });
    return res.json({ orders });
  } catch (error) {
    return next(error);
  }
};

const getOrder = async (req, res, next) => {
  try {
    const order = await procurementRepository.getOrder(req.params.id, {
      userId: req.user.id,
      role: req.user.role,
    });
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    return res.json({ order });
  } catch (error) {
    return next(error);
  }
};

const updateOrderStatus = async (req, res, next) => {
  const { status, note } = req.body;
  if (!status) return res.status(400).json({ message: 'Status is required.' });
  if (note !== undefined && typeof note !== 'string') {
    return res.status(400).json({ message: 'note must be a string.' });
  }
  try {
    const result = await procurementRepository.updateOrderStatus({
      orderId: req.params.id,
      userId: req.user.id,
      role: req.user.role,
      status,
      note: note?.slice(0, 1000),
    });
    if (result === 'INVALID_STATUS') return res.status(400).json({ message: 'Invalid order status.' });
    if (result === 'INVALID_TRANSITION') return res.status(409).json({ message: 'Order status transition is not permitted.' });
    if (result === 'FORBIDDEN') return res.status(403).json({ message: 'Only the assigned supplier or an admin can update this order.' });
    if (result === 'NOT_FOUND') return res.status(404).json({ message: 'Order not found.' });
    return res.json({ message: 'Order status updated.', status: result.status });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createOrder,
  createPurchaseRequest,
  createQuotation,
  getOrder,
  getPurchaseRequest,
  listOrders,
  listPurchaseRequests,
  listQuotations,
  updateOrderStatus,
  updateQuotationStatus,
};
