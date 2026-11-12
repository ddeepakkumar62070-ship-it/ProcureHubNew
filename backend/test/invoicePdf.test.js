const assert = require('node:assert/strict');
const { test } = require('node:test');
const { renderInvoicePdf } = require('../src/utils/invoicePdf');

test('renders a multipage invoice PDF with an actual PDF signature', async () => {
  const invoice = {
    invoiceNumber: 'PH-TEST-0001',
    orderId: 1,
    amount: '2500.00',
    currency: 'INR',
    status: 'UNPAID',
    createdAt: new Date('2026-01-15T00:00:00Z'),
    dueAt: null,
    buyerName: 'Audit Buyer',
    buyerEmail: 'buyer@example.test',
    supplierName: 'Audit Supplier',
    supplierEmail: 'supplier@example.test',
    items: Array.from({ length: 75 }, (_, index) => ({
      name: `Invoice line ${index + 1} with a sufficiently descriptive item name`,
      quantity: 1,
      unit: 'box',
      unitPrice: '10.00',
      lineTotal: '10.00',
    })),
    payments: [],
  };
  const pdf = await renderInvoicePdf(invoice);
  assert.ok(pdf.subarray(0, 5).equals(Buffer.from('%PDF-')));
  const pageCount = (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
  assert.ok(pageCount > 1, `Expected a multipage invoice, received ${pageCount} page.`);
});
