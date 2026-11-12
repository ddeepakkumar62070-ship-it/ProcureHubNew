const financeRepository = require('../repositories/financeRepository');
const { parsePagination } = require('../utils/pagination');
const { renderInvoicePdf } = require('../utils/invoicePdf');

async function listInvoices(req, res, next) {
  try {
    const invoices = await financeRepository.listInvoices({
      userId: req.user.id,
      role: req.user.role,
      ...parsePagination(req.query),
    });
    return res.json({ invoices });
  } catch (error) {
    return next(error);
  }
}

async function getInvoice(req, res, next) {
  try {
    const invoice = await financeRepository.getInvoice(req.params.id, { userId: req.user.id, role: req.user.role });
    if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });
    return res.json({ invoice });
  } catch (error) {
    return next(error);
  }
}

async function downloadInvoicePdf(req, res, next) {
  try {
    const invoice = await financeRepository.getInvoice(req.params.id, { userId: req.user.id, role: req.user.role });
    if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });
    const pdf = await renderInvoicePdf(invoice);
    const filename = `${String(invoice.invoiceNumber).replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdf.length,
      'Cache-Control': 'private, no-store',
    });
    return res.send(pdf);
  } catch (error) {
    return next(error);
  }
}

async function createPayment(req, res, next) {
  const amount = Number(req.body.amount);
  const status = req.body.status || 'PENDING';
  const idempotencyKey = req.get('Idempotency-Key') || req.body.idempotencyKey;
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ message: 'Payment amount must be a positive number.' });
  }
  if (!['PENDING', 'PAID', 'FAILED'].includes(status)) {
    return res.status(400).json({ message: 'Payment status must be PENDING, PAID, or FAILED.' });
  }
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 100) {
    return res.status(400).json({ message: 'A unique idempotency key between 8 and 100 characters is required.' });
  }
  try {
    const result = await financeRepository.createPayment({
      invoiceId: req.params.id,
      userId: req.user.id,
      role: req.user.role,
      amount,
      status,
      idempotencyKey,
    });
    if (result === 'FORBIDDEN') return res.status(403).json({ message: 'Only the invoice buyer or an admin can record a payment.' });
    if (result === 'NOT_FOUND') return res.status(404).json({ message: 'Invoice not found.' });
    if (result === 'INVALID_STATE') return res.status(409).json({ message: 'Invoice is not payable.' });
    if (result === 'INVALID_AMOUNT') return res.status(400).json({ message: 'Payment amount exceeds the outstanding invoice balance.' });
    if (result === 'DUPLICATE') return res.status(409).json({ message: 'This payment request has already been recorded.' });
    return res.status(201).json({ message: 'Payment record created.', paymentId: result.paymentId, orderStatus: result.orderStatus });
  } catch (error) {
    return next(error);
  }
}

module.exports = { createPayment, downloadInvoicePdf, getInvoice, listInvoices };
