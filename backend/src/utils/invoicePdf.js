const PDFDocument = require('pdfkit');

const money = (currency, amount) => `${currency} ${Number(amount).toFixed(2)}`;
const date = (value) => (value ? new Date(value).toISOString().slice(0, 10) : 'Not specified');

function renderInvoicePdf(invoice) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    const pageWidth = doc.page.width;
    const left = doc.page.margins.left;
    const right = pageWidth - doc.page.margins.right;
    const contentWidth = right - left;
    const itemColumns = {
      name: left,
      quantity: left + 255,
      unitPrice: left + 340,
      total: right - 70,
    };

    const drawHeading = () => {
      doc.font('Helvetica-Bold').fontSize(21).fillColor('#153b5b').text('ProcureHub', left, 42);
      doc.font('Helvetica-Bold').fontSize(18).fillColor('#1e293b').text('INVOICE', left, 79);
      doc.font('Helvetica').fontSize(9).fillColor('#475569');
      doc.text(`Invoice number: ${invoice.invoiceNumber}`, left, 108);
      doc.text(`Issued: ${date(invoice.createdAt)}`, left, 122);
      doc.text(`Due: ${date(invoice.dueAt)}`, left, 136);
      doc.text(`Status: ${invoice.status}`, left, 150);
      doc.text(`Purchase order: #${invoice.orderId}`, right - 170, 108, { width: 170, align: 'right' });

      const detailsY = 176;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#1e293b').text('Billed to', left, detailsY);
      doc.font('Helvetica').fontSize(9).fillColor('#475569');
      doc.text(invoice.buyerBusinessName || invoice.buyerName || 'Buyer', left, detailsY + 16, { width: 235 });
      doc.text(invoice.buyerAddress || invoice.buyerEmail || '', left, detailsY + 30, { width: 235 });
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#1e293b').text('Supplier', left + 270, detailsY);
      doc.font('Helvetica').fontSize(9).fillColor('#475569');
      doc.text(invoice.supplierBusinessName || invoice.supplierName || 'Supplier', left + 270, detailsY + 16, { width: 235 });
      doc.text(invoice.supplierAddress || invoice.supplierEmail || '', left + 270, detailsY + 30, { width: 235 });
    };

    const drawTableHeader = (y) => {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#153b5b');
      doc.text('Description', itemColumns.name, y, { width: 245 });
      doc.text('Quantity', itemColumns.quantity, y, { width: 70, align: 'right' });
      doc.text('Unit price', itemColumns.unitPrice, y, { width: 75, align: 'right' });
      doc.text('Line total', itemColumns.total, y, { width: 70, align: 'right' });
      doc.moveTo(left, y + 16).lineTo(right, y + 16).strokeColor('#cbd5e1').stroke();
    };

    drawHeading();
    let y = 245;
    drawTableHeader(y);
    y += 24;
    let subtotal = 0;
    for (const item of invoice.items || []) {
      const description = String(item.name || 'Item');
      const detail = item.unit ? `${description} (${item.unit})` : description;
      const textHeight = doc.font('Helvetica').fontSize(9).heightOfString(detail, { width: 245 });
      const rowHeight = Math.max(24, textHeight + 8);
      if (y + rowHeight > doc.page.height - 105) {
        doc.addPage();
        y = 55;
        drawTableHeader(y);
        y += 24;
      }
      doc.font('Helvetica').fontSize(9).fillColor('#334155');
      doc.text(detail, itemColumns.name, y, { width: 245 });
      doc.text(`${item.quantity}`, itemColumns.quantity, y, { width: 70, align: 'right' });
      doc.text(money(invoice.currency, item.unitPrice), itemColumns.unitPrice, y, { width: 75, align: 'right' });
      doc.text(money(invoice.currency, item.lineTotal), itemColumns.total, y, { width: 70, align: 'right' });
      y += rowHeight;
      subtotal += Number(item.lineTotal) || 0;
    }

    if (y + 90 > doc.page.height - 48) {
      doc.addPage();
      y = 55;
    }
    doc.moveTo(left, y).lineTo(right, y).strokeColor('#cbd5e1').stroke();
    y += 14;
    doc.font('Helvetica').fontSize(9).fillColor('#475569').text('Subtotal', right - 145, y, { width: 75, align: 'right' });
    doc.text(money(invoice.currency, subtotal), right - 70, y, { width: 70, align: 'right' });
    y += 17;
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#153b5b').text('Total', right - 145, y, { width: 75, align: 'right' });
    doc.text(money(invoice.currency, invoice.amount), right - 70, y, { width: 70, align: 'right' });
    y += 34;
    doc.font('Helvetica').fontSize(8).fillColor('#64748b');
    doc.text('This document reflects the invoice and payment records currently stored in ProcureHub.', left, y, {
      width: contentWidth,
      align: 'left',
    });

    const pageRange = doc.bufferedPageRange();
    for (let index = 0; index < pageRange.count; index += 1) {
      doc.switchToPage(pageRange.start + index);
      doc.font('Helvetica').fontSize(8).fillColor('#64748b');
      doc.text(`Page ${index + 1} of ${pageRange.count}`, left, doc.page.height - 35, {
        width: contentWidth,
        align: 'right',
      });
    }
    doc.end();
  });
}

module.exports = { renderInvoicePdf };
