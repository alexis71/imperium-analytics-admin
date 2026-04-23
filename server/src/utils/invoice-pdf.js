/**
 * Invoice → PDF Buffer · usa pdfkit (server-side).
 * No reutilizamos @nomadknight/pdf-export (ese es client-side jsPDF) porque aquí
 * necesitamos server-side stream. Patrón: dos implementaciones coexisten legítimamente.
 */
let PDFDocument;
try { PDFDocument = require('pdfkit'); } catch { PDFDocument = null; }

const ACCENT = '#7c3aed';
const MUTED = '#64748b';
const FG = '#111827';

function fmtMXN(n) {
  return '$' + Number(n || 0).toLocaleString('es-MX');
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
}

async function invoiceToPdfBuffer(inv) {
  if (!PDFDocument) {
    throw new Error('pdfkit no instalado · npm install pdfkit');
  }

  const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((res) => doc.on('end', () => res(Buffer.concat(chunks))));

  // ─ Header ──────────────────────────────────────────────
  doc.fillColor(ACCENT).fontSize(20).text('Imperium Analytics', 50, 50, { align: 'left' });
  doc.fillColor(MUTED).fontSize(10).text('Nomad Knight · Muselecom', 50, 75);
  doc.fillColor(FG).fontSize(9).text('RFC: XAXX010101000', 50, 90);

  doc.fillColor(FG).fontSize(18).text('FACTURA', 50, 50, { align: 'right' });
  doc.fontSize(11).text(inv.numero, 50, 75, { align: 'right' });
  doc.fillColor(MUTED).fontSize(9)
    .text('Emitida: ' + fmtDate(inv.issuedAt || inv.createdAt), 50, 92, { align: 'right' })
    .text('Vence: ' + fmtDate(inv.dueAt), 50, 105, { align: 'right' });

  // ─ Línea separadora ────────────────────────────────────
  doc.moveTo(50, 130).lineTo(562, 130).strokeColor(ACCENT).lineWidth(1).stroke();

  // ─ Customer ────────────────────────────────────────────
  doc.fillColor(MUTED).fontSize(9).text('FACTURAR A', 50, 145);
  doc.fillColor(FG).fontSize(12).text(inv.customer.legalName, 50, 160);
  if (inv.customer.rfc)      doc.fontSize(10).text('RFC: ' + inv.customer.rfc, 50, 178);
  if (inv.customer.address)  doc.fontSize(9).fillColor(MUTED).text(inv.customer.address, 50, 192);
  if (inv.customer.contactEmail) doc.fontSize(9).fillColor(MUTED).text(inv.customer.contactEmail, 50, 205);

  // ─ Período ─────────────────────────────────────────────
  doc.fillColor(MUTED).fontSize(9).text('PERÍODO', 350, 145);
  doc.fillColor(FG).fontSize(10)
    .text(fmtDate(inv.periodStart) + ' – ' + fmtDate(new Date(inv.periodEnd.getTime ? inv.periodEnd.getTime() - 86400000 : new Date(inv.periodEnd).getTime() - 86400000)), 350, 160);
  doc.fillColor(MUTED).fontSize(9).text('Estado: ' + (inv.status || '').toUpperCase(), 350, 178);

  // ─ Items table ─────────────────────────────────────────
  let y = 240;
  doc.rect(50, y, 512, 22).fillColor('#f3f4f6').fill();
  doc.fillColor(FG).fontSize(9)
    .text('Descripción', 60, y + 7, { width: 320 })
    .text('Cant', 380, y + 7, { width: 40, align: 'right' })
    .text('P.U.', 420, y + 7, { width: 70, align: 'right' })
    .text('Total', 490, y + 7, { width: 62, align: 'right' });
  y += 22;

  const items = Array.isArray(inv.items) ? inv.items : (inv.items?.items || []);
  for (const it of items) {
    doc.fillColor(FG).fontSize(10)
      .text(it.description || `${it.moduleName || ''} · ${it.tier || ''}`, 60, y + 5, { width: 320 })
      .text(String(it.quantity || 1), 380, y + 5, { width: 40, align: 'right' })
      .text(fmtMXN(it.unitPriceMXN || it.totalMXN), 420, y + 5, { width: 70, align: 'right' })
      .text(fmtMXN(it.totalMXN), 490, y + 5, { width: 62, align: 'right' });
    y += 24;
  }

  // ─ Totales ─────────────────────────────────────────────
  y += 10;
  doc.moveTo(380, y).lineTo(562, y).strokeColor('#e5e7eb').stroke();
  y += 8;
  doc.fillColor(MUTED).fontSize(10)
    .text('Subtotal', 380, y, { width: 110, align: 'right' })
    .fillColor(FG).text(fmtMXN(inv.subtotalMXN), 490, y, { width: 62, align: 'right' });
  y += 18;
  doc.fillColor(MUTED).text('IVA 16%', 380, y, { width: 110, align: 'right' })
    .fillColor(FG).text(fmtMXN(inv.ivaMXN), 490, y, { width: 62, align: 'right' });
  y += 22;
  doc.moveTo(380, y).lineTo(562, y).strokeColor(ACCENT).lineWidth(1).stroke();
  y += 6;
  doc.fillColor(ACCENT).fontSize(13).text('TOTAL', 380, y, { width: 110, align: 'right' })
    .text(fmtMXN(inv.totalMXN), 490, y, { width: 62, align: 'right' });
  y += 30;

  // ─ Payments ────────────────────────────────────────────
  if (inv.payments?.length) {
    doc.fillColor(MUTED).fontSize(9).text('PAGOS RECIBIDOS', 50, y);
    y += 14;
    for (const p of inv.payments) {
      doc.fillColor(FG).fontSize(9)
        .text(fmtDate(p.paidAt) + ' · ' + p.method + (p.reference ? ' · ' + p.reference : ''), 60, y)
        .text(fmtMXN(p.amountMXN), 490, y, { width: 62, align: 'right' });
      y += 14;
    }
  }

  // ─ Footer ──────────────────────────────────────────────
  doc.fontSize(8).fillColor(MUTED).text(
    'Imperium Analytics · Nomad Knight · Muselecom · México',
    50, 740, { width: 512, align: 'center' }
  );

  doc.end();
  return done;
}

module.exports = { invoiceToPdfBuffer };
