import Invoice from '../models/Invoice.js';
import Counter from '../models/Counter.js';
import { SELLER } from '../constants/seller.js';
import {
  getFY,
  counterKey,
  deriveTaxType,
  amountInWords,
  computeTotals,
} from '../utils/invoiceHelpers.js';
import ExcelJS from 'exceljs';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/invoices  — create a new invoice
// ─────────────────────────────────────────────────────────────────────────────
export async function createInvoice(req, res) {
  try {
    const {
      invoiceDate = new Date(),
      copyType,
      poNumber,
      transportMode,
      vehicleNumber,
      placeOfSupply,
      buyer,
      consignee,
      lineItems,
      packing,
      taxRate = 18,
      notes,
    } = req.body;

    // Validation
    if (!buyer || !buyer.name) return res.status(400).json({ error: 'Buyer name is required.' });
    if (!consignee || !consignee.name) return res.status(400).json({ error: 'Consignee name is required.' });
    if (!lineItems || lineItems.length === 0) return res.status(400).json({ error: 'At least one line item is required.' });

    // 1. Invoice numbering — atomic counter per FY unless client provides custom number
    let invoiceNumber = req.body.invoiceNumber;
    if (!invoiceNumber || invoiceNumber === 'auto' || invoiceNumber.trim() === '' || invoiceNumber.includes('(auto)')) {
      const fy = getFY(invoiceDate);
      const key = counterKey(fy);
      const counter = await Counter.findOneAndUpdate(
        { _id: key },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      invoiceNumber = `${counter.seq}/${fy}`;
    } else {
      // Validate unique constraint manually or let MongoDB throw index duplicate error
      invoiceNumber = invoiceNumber.trim();
    }

    // 2. Server-side totals (never trust client)
    const { lineItems: computedItems, taxableValue, taxAmount, grandTotal } =
      computeTotals(lineItems, taxRate);

    // 3. Tax type — derived from state codes
    const taxType = deriveTaxType(buyer.stateCode, SELLER.stateCode);

    // 4. Amount in words
    const words = amountInWords(grandTotal);

    // 5. Snapshot seller info
    const seller = { ...SELLER };

    const invoice = await Invoice.create({
      invoiceNumber,
      invoiceDate,
      copyType: copyType || 'ORIGINAL FOR RECIPIENT',
      poNumber,
      transportMode: transportMode || 'By Lorry',
      vehicleNumber,
      placeOfSupply,
      seller,
      buyer,
      consignee,
      lineItems: computedItems,
      packing,
      taxableValue,
      taxType,
      taxRate: Number(taxRate),
      taxAmount,
      grandTotal,
      amountInWords: words,
      notes,
      createdBy: req.admin?.role || 'admin',
    });

    res.status(201).json({ success: true, invoice });
  } catch (err) {
    console.error('createInvoice error:', err);
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Invoice number collision — please retry.' });
    }
    res.status(500).json({ error: 'Failed to create invoice.' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/invoices  — list invoices (paginated + searchable)
// ─────────────────────────────────────────────────────────────────────────────
export async function listInvoices(req, res) {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      from,
      to,
    } = req.query;

    const filter = {};

    if (search) {
      filter.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { 'buyer.name': { $regex: search, $options: 'i' } },
      ];
    }

    if (from || to) {
      filter.invoiceDate = {};
      if (from) filter.invoiceDate.$gte = new Date(from);
      if (to) filter.invoiceDate.$lte = new Date(to);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [invoices, total] = await Promise.all([
      Invoice.find(filter)
        .sort({ invoiceDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select('invoiceNumber invoiceDate copyType buyer.name grandTotal taxType'),
      Invoice.countDocuments(filter),
    ]);

    res.json({ invoices, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    console.error('listInvoices error:', err);
    res.status(500).json({ error: 'Failed to fetch invoices.' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/invoices/:id  — single invoice
// ─────────────────────────────────────────────────────────────────────────────
export async function getInvoice(req, res) {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
    res.json({ invoice });
  } catch (err) {
    console.error('getInvoice error:', err);
    res.status(500).json({ error: 'Failed to fetch invoice.' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/invoices/:id/excel  — stream Excel download
// ─────────────────────────────────────────────────────────────────────────────
export async function exportInvoiceExcel(req, res) {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Swamy Slabs Industries';
    wb.created = new Date();

    const ws = wb.addWorksheet('Invoice', {
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true },
    });

    // ── Column widths ──────────────────────────────────────────────────────
    ws.columns = [
      { width: 4 },   // A  (padding)
      { width: 28 },  // B  Description of Goods
      { width: 12 },  // C  HSN Code
      { width: 8 },   // D  Qty
      { width: 8 },   // E  Rate
      { width: 12 },  // F  Taxable Value
      { width: 7 },   // G  SGST Rate
      { width: 10 },  // H  SGST Amount
      { width: 7 },   // I  CGST Rate
      { width: 10 },  // J  CGST Amount
      { width: 7 },   // K  IGST Rate
      { width: 10 },  // L  IGST Amount
    ];

    // ── Helpers ────────────────────────────────────────────────────────────
    const border = {
      top: { style: 'thin' }, left: { style: 'thin' },
      bottom: { style: 'thin' }, right: { style: 'thin' },
    };
    const boldFont = { name: 'Calibri', bold: true, size: 10 };
    const normalFont = { name: 'Calibri', size: 10 };
    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAD3' } };
    const yellowFill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };

    const merge = (from, to) => ws.mergeCells(from, to);
    const cell  = (addr) => ws.getCell(addr);
    const setCell = (addr, value, opts = {}) => {
      const c = ws.getCell(addr);
      c.value = value;
      if (opts.font)      c.font      = opts.font;
      if (opts.fill)      c.fill      = opts.fill;
      if (opts.border)    c.border    = opts.border;
      if (opts.alignment) c.alignment = opts.alignment;
      if (opts.numFmt)    c.numFmt    = opts.numFmt;
    };

    let row = 1;

    // ── Row 1: GST INVOICE header ──────────────────────────────────────────
    merge(`B${row}`, `J${row}`);
    setCell(`B${row}`, 'GST INVOICE', {
      font: { name: 'Calibri', bold: true, size: 14 },
      alignment: { horizontal: 'center', vertical: 'middle' },
    });
    merge(`K${row}`, `L${row}`);
    setCell(`K${row}`, invoice.copyType === 'ORIGINAL FOR RECIPIENT' ? 'ORIGINAL' :
                        invoice.copyType === 'DUPLICATE FOR TRANSPORTER' ? 'DUPLICATE' : 'TRIPLICATE', {
      font: { name: 'Calibri', bold: true, size: 10, color: { argb: 'FFFF0000' } },
      alignment: { horizontal: 'right', vertical: 'middle' },
    });
    ws.getRow(row).height = 20;
    row++;

    // ── Row 2: Company name ────────────────────────────────────────────────
    merge(`B${row}`, `L${row}`);
    setCell(`B${row}`, invoice.seller.name, {
      font: { name: 'Calibri', bold: true, size: 16 },
      alignment: { horizontal: 'center', vertical: 'middle' },
    });
    ws.getRow(row).height = 24;
    row++;

    // ── Row 3: GSTIN ───────────────────────────────────────────────────────
    merge(`B${row}`, `L${row}`);
    setCell(`B${row}`, `GSTIN : ${invoice.seller.gstin}`, {
      font: boldFont,
      alignment: { horizontal: 'center' },
    });
    row++;

    // ── Row 4: Tagline ────────────────────────────────────────────────────
    merge(`B${row}`, `L${row}`);
    setCell(`B${row}`, invoice.seller.tagline, {
      font: normalFont,
      alignment: { horizontal: 'center' },
    });
    row++;

    // ── Row 5: Address ─────────────────────────────────────────────────────
    merge(`B${row}`, `L${row}`);
    setCell(`B${row}`, invoice.seller.address, {
      font: normalFont,
      alignment: { horizontal: 'center' },
    });
    row++;

    // ── Row 6: Email / Phone ───────────────────────────────────────────────
    merge(`B${row}`, `L${row}`);
    setCell(`B${row}`, `email: ${invoice.seller.email} , Cell : ${invoice.seller.phone}`, {
      font: normalFont,
      alignment: { horizontal: 'center' },
    });
    row++;

    // ── Separator ──────────────────────────────────────────────────────────
    merge(`B${row}`, `L${row}`);
    ws.getCell(`B${row}`).border = { bottom: { style: 'medium' } };
    row++;

    // ── Invoice meta block (Invoice No / Date / PO | Transport / Vehicle / Place) ──
    const metaRow1 = row;
    ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].forEach(c => {
      ws.getCell(`${c}${metaRow1}`).border = border;
    });
    // Left side labels
    setCell(`B${row}`, 'Invoice NO', { font: boldFont, border, alignment: { vertical: 'middle' } });
    merge(`C${row}`, `E${row}`);
    setCell(`C${row}`, invoice.invoiceNumber, { font: normalFont, border, alignment: { vertical: 'middle' } });
    // Right side
    merge(`G${row}`, `H${row}`);
    setCell(`G${row}`, 'Transport Mode', { font: boldFont, border, alignment: { vertical: 'middle' } });
    merge(`I${row}`, `L${row}`);
    setCell(`I${row}`, invoice.transportMode, { font: normalFont, border, alignment: { vertical: 'middle' } });
    row++;

    setCell(`B${row}`, 'DATE', { font: boldFont, border, alignment: { vertical: 'middle' } });
    merge(`C${row}`, `E${row}`);
    setCell(`C${row}`, invoice.invoiceDate
      ? new Date(invoice.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')
      : '', { font: normalFont, border, alignment: { vertical: 'middle' } });
    merge(`G${row}`, `H${row}`);
    setCell(`G${row}`, 'Vehicle Number', { font: boldFont, border, alignment: { vertical: 'middle' } });
    merge(`I${row}`, `L${row}`);
    setCell(`I${row}`, invoice.vehicleNumber || '', { font: normalFont, border, alignment: { vertical: 'middle' } });
    row++;

    setCell(`B${row}`, 'P.O. No', { font: boldFont, border, alignment: { vertical: 'middle' } });
    merge(`C${row}`, `E${row}`);
    setCell(`C${row}`, invoice.poNumber || '', { font: normalFont, border, alignment: { vertical: 'middle' } });
    merge(`G${row}`, `H${row}`);
    setCell(`G${row}`, 'Place of Supply', { font: boldFont, border, alignment: { vertical: 'middle' } });
    merge(`I${row}`, `L${row}`);
    setCell(`I${row}`, invoice.placeOfSupply || '', { font: normalFont, border, alignment: { vertical: 'middle' } });
    row++;

    // ── Buyer / Consignee headers ──────────────────────────────────────────
    merge(`B${row}`, `F${row}`);
    setCell(`B${row}`, 'Details of Receiver / Billed To', {
      font: boldFont, fill: headerFill, border,
      alignment: { horizontal: 'center', vertical: 'middle' },
    });
    merge(`G${row}`, `L${row}`);
    setCell(`G${row}`, 'Details of Consignee / Shipped To', {
      font: boldFont, fill: headerFill, border,
      alignment: { horizontal: 'center', vertical: 'middle' },
    });
    row++;

    // Buyer / Consignee detail rows
    const partyRows = [
      ['Name',       invoice.buyer.name,       invoice.consignee.name],
      ['Address',    invoice.buyer.address,     invoice.consignee.address],
      ['State',      invoice.buyer.state,       invoice.consignee.state],
      ['State Code', invoice.buyer.stateCode,   invoice.consignee.stateCode],
      ['GSTIN',      invoice.buyer.gstin || '', ''],
    ];
    for (const [label, buyerVal, consVal] of partyRows) {
      setCell(`B${row}`, label, { font: boldFont, border });
      merge(`C${row}`, `F${row}`);
      setCell(`C${row}`, buyerVal || '', { font: normalFont, border, alignment: { wrapText: true } });
      merge(`G${row}`, `H${row}`);
      setCell(`G${row}`, label === 'GSTIN' ? '' : label, { font: boldFont, border });
      merge(`I${row}`, `L${row}`);
      setCell(`I${row}`, label === 'GSTIN' ? '' : (consVal || ''), { font: normalFont, border, alignment: { wrapText: true } });
      row++;
    }

    // ── Line items table header ────────────────────────────────────────────
    merge(`B${row}`, `B${row + 1}`); setCell(`B${row}`, 'Description of Goods', { font: boldFont, fill: headerFill, border, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true } });
    merge(`C${row}`, `C${row + 1}`); setCell(`C${row}`, 'HSN Code', { font: boldFont, fill: headerFill, border, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true } });
    merge(`D${row}`, `D${row + 1}`); setCell(`D${row}`, `Qty\n(${invoice.lineItems[0]?.unit || 'Sqm'})`, { font: boldFont, fill: headerFill, border, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true } });
    merge(`E${row}`, `E${row + 1}`); setCell(`E${row}`, 'Rate', { font: boldFont, fill: headerFill, border, alignment: { horizontal: 'center', vertical: 'middle' } });
    merge(`F${row}`, `F${row + 1}`); setCell(`F${row}`, 'Taxable\nValue', { font: boldFont, fill: headerFill, border, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true } });

    if (invoice.taxType === 'CGST_SGST') {
      merge(`G${row}`, `H${row}`); setCell(`G${row}`, 'SGST', { font: boldFont, fill: headerFill, border, alignment: { horizontal: 'center', vertical: 'middle' } });
      merge(`I${row}`, `J${row}`); setCell(`I${row}`, 'CGST', { font: boldFont, fill: headerFill, border, alignment: { horizontal: 'center', vertical: 'middle' } });
      merge(`K${row}`, `L${row}`); setCell(`K${row}`, 'IGST', { font: boldFont, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }, border, alignment: { horizontal: 'center', vertical: 'middle' } });
    } else {
      merge(`G${row}`, `H${row}`); setCell(`G${row}`, 'SGST', { font: boldFont, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }, border, alignment: { horizontal: 'center', vertical: 'middle' } });
      merge(`I${row}`, `J${row}`); setCell(`I${row}`, 'CGST', { font: boldFont, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }, border, alignment: { horizontal: 'center', vertical: 'middle' } });
      merge(`K${row}`, `L${row}`); setCell(`K${row}`, 'IGST', { font: boldFont, fill: headerFill, border, alignment: { horizontal: 'center', vertical: 'middle' } });
    }
    row++;

    // Sub-headers: Rate / Amount
    setCell(`G${row}`, 'Rate',   { font: boldFont, fill: headerFill, border, alignment: { horizontal: 'center' } });
    setCell(`H${row}`, 'Amount', { font: boldFont, fill: headerFill, border, alignment: { horizontal: 'center' } });
    setCell(`I${row}`, 'Rate',   { font: boldFont, fill: headerFill, border, alignment: { horizontal: 'center' } });
    setCell(`J${row}`, 'Amount', { font: boldFont, fill: headerFill, border, alignment: { horizontal: 'center' } });
    setCell(`K${row}`, 'Rate',   { font: boldFont, fill: headerFill, border, alignment: { horizontal: 'center' } });
    setCell(`L${row}`, 'Amount', { font: boldFont, fill: headerFill, border, alignment: { horizontal: 'center' } });
    row++;

    // ── Line item rows ─────────────────────────────────────────────────────
    const halfRate = invoice.taxRate / 2;
    for (const item of invoice.lineItems) {
      setCell(`B${row}`, item.description, { font: normalFont, border, alignment: { wrapText: true, vertical: 'middle' } });
      setCell(`C${row}`, item.hsnCode || '',  { font: normalFont, border, alignment: { horizontal: 'center', vertical: 'middle' } });
      setCell(`D${row}`, item.qty,            { font: normalFont, border, alignment: { horizontal: 'center' }, numFmt: '#,##0.00' });
      setCell(`E${row}`, item.rate,           { font: normalFont, border, alignment: { horizontal: 'right'  }, numFmt: '#,##0.00' });
      setCell(`F${row}`, item.amount,         { font: normalFont, border, alignment: { horizontal: 'right'  }, numFmt: '#,##0.00' });

      if (invoice.taxType === 'CGST_SGST') {
        setCell(`G${row}`, `${halfRate}%`,                           { font: normalFont, border, alignment: { horizontal: 'center' } });
        setCell(`H${row}`, item.amount * halfRate / 100,             { font: normalFont, border, alignment: { horizontal: 'right'  }, numFmt: '#,##0.00' });
        setCell(`I${row}`, `${halfRate}%`,                           { font: normalFont, border, alignment: { horizontal: 'center' } });
        setCell(`J${row}`, item.amount * halfRate / 100,             { font: normalFont, border, alignment: { horizontal: 'right'  }, numFmt: '#,##0.00' });
        setCell(`K${row}`, '', { font: normalFont, border });
        setCell(`L${row}`, '', { font: normalFont, border });
      } else {
        setCell(`G${row}`, '', { font: normalFont, border });
        setCell(`H${row}`, '', { font: normalFont, border });
        setCell(`I${row}`, '', { font: normalFont, border });
        setCell(`J${row}`, '', { font: normalFont, border });
        setCell(`K${row}`, `${invoice.taxRate}%`,                  { font: normalFont, border, alignment: { horizontal: 'center' } });
        setCell(`L${row}`, item.amount * invoice.taxRate / 100,    { font: normalFont, border, alignment: { horizontal: 'right'  }, numFmt: '#,##0.00' });
      }
      ws.getRow(row).height = 30;
      row++;
    }

    // ── 8 blank item rows ──────────────────────────────────────────────────
    for (let i = 0; i < 8; i++) {
      ['B','C','D','E','F','G','H','I','J','K','L'].forEach(c => {
        ws.getCell(`${c}${row}`).border = border;
      });
      row++;
    }

    // ── Packing row ────────────────────────────────────────────────────────
    if (invoice.packing) {
      merge(`B${row}`, `E${row}`);
      const packingText = `TOTAL ${invoice.packing.totalCrates || ''} CRTS(${
        invoice.packing.piecesPerCrate ? Number(invoice.packing.piecesPerCrate).toFixed(2) : ''
      } pcs/Crate)`;
      setCell(`B${row}`, packingText, { font: boldFont, border, alignment: { wrapText: true, vertical: 'middle' } });
      setCell(`F${row}`, invoice.taxableValue, { font: boldFont, border, alignment: { horizontal: 'right' }, numFmt: '#,##0.00' });

      if (invoice.taxType === 'CGST_SGST') {
        setCell(`G${row}`, `${halfRate}%`, { font: boldFont, border, alignment: { horizontal: 'center' } });
        setCell(`H${row}`, invoice.taxAmount / 2, { font: boldFont, border, alignment: { horizontal: 'right' }, numFmt: '#,##0.00' });
        setCell(`I${row}`, `${halfRate}%`, { font: boldFont, border, alignment: { horizontal: 'center' } });
        setCell(`J${row}`, invoice.taxAmount / 2, { font: boldFont, border, alignment: { horizontal: 'right' }, numFmt: '#,##0.00' });
        ws.getCell(`K${row}`).border = border;
        ws.getCell(`L${row}`).border = border;
      } else {
        ws.getCell(`G${row}`).border = border;
        ws.getCell(`H${row}`).border = border;
        ws.getCell(`I${row}`).border = border;
        ws.getCell(`J${row}`).border = border;
        setCell(`K${row}`, `${invoice.taxRate}%`, { font: boldFont, border, alignment: { horizontal: 'center' } });
        setCell(`L${row}`, invoice.taxAmount,      { font: boldFont, border, alignment: { horizontal: 'right' }, numFmt: '#,##0.00' });
      }
      ws.getRow(row).height = 30;
      row++;
    }

    // ── Amount in words + Total row ────────────────────────────────────────
    merge(`B${row}`, `I${row}`);
    setCell(`B${row}`, invoice.amountInWords, {
      font: { name: 'Calibri', bold: true, size: 10, color: { argb: 'FFFF0000' } },
      fill: yellowFill,
      border,
      alignment: { wrapText: true, vertical: 'middle', horizontal: 'left' },
    });
    merge(`J${row}`, `J${row}`);
    setCell(`J${row}`, 'TOTAL', { font: boldFont, border, alignment: { horizontal: 'center', vertical: 'middle' } });
    merge(`K${row}`, `L${row}`);
    setCell(`K${row}`, invoice.grandTotal, {
      font: { name: 'Calibri', bold: true, size: 13 },
      border,
      alignment: { horizontal: 'right', vertical: 'middle' },
      numFmt: '#,##0.00',
    });
    ws.getRow(row).height = 35;
    row++;

    // ── Signature block ────────────────────────────────────────────────────
    merge(`B${row}`, `I${row}`);
    ws.getCell(`B${row}`).border = border;
    merge(`J${row}`, `L${row}`);
    setCell(`J${row}`, `For : ${invoice.seller.name}`, {
      font: boldFont,
      border,
      alignment: { horizontal: 'right', vertical: 'middle' },
    });
    ws.getRow(row).height = 40;
    row++;

    merge(`J${row}`, `L${row}`);
    setCell(`J${row}`, 'Authorised Signatory', {
      font: normalFont,
      border,
      alignment: { horizontal: 'right', vertical: 'middle' },
    });
    merge(`B${row}`, `I${row}`);
    ws.getCell(`B${row}`).border = border;
    ws.getRow(row).height = 20;

    // ── Stream response ────────────────────────────────────────────────────
    const safeNum = invoice.invoiceNumber.replace(/\//g, '-');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice_${safeNum}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('exportInvoiceExcel error:', err);
    res.status(500).json({ error: 'Failed to generate Excel.' });
  }
}
