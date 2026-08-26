import React from 'react';

/**
 * InvoicePrint — renders a GST invoice matching the exact paper PDF output layout.
 * Optimized for crisp A4 page alignment, larger typography, and pixel-perfect borders.
 */
export default function InvoicePrint({ invoice }) {
  if (!invoice) return null;

  const {
    invoiceNumber, invoiceDate, copyType = 'ORIGINAL FOR RECIPIENT',
    poNumber, transportMode = 'By Lorry', vehicleNumber, placeOfSupply = 'BETAMCHERLA',
    seller = {}, buyer = {}, consignee = {}, lineItems = [], packing,
    taxableValue = 0, taxType = 'IGST', taxRate = 18, taxAmount = 0, grandTotal = 0, amountInWords = '',
  } = invoice;

  const fmtDate = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    return `${String(dt.getDate()).padStart(2, '0')}-${String(dt.getMonth() + 1).padStart(2, '0')}-${dt.getFullYear()}`;
  };

  // Format currency without decimals if integer, or with 2 decimals if fraction
  const fmtCurrency = (n) => {
    const val = Number(n || 0);
    return val % 1 === 0 ? val.toLocaleString('en-IN') : val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const halfRate = Number(taxRate) / 2;
  const copyLabel = copyType === 'ORIGINAL FOR RECIPIENT' ? 'ORIGINAL'
    : copyType === 'DUPLICATE FOR TRANSPORTER' ? 'DUPLICATE'
      : 'TRIPLICATE';

  const BLANK_ROWS = Math.max(0, 11 - lineItems.length);

  return (
    <div className="invoice-print-root" style={{
      fontFamily: 'Calibri, Arial, sans-serif',
      fontSize: '12px',
      color: '#000',
      maxWidth: '850px',
      margin: '0 auto',
      background: '#fff',
      border: '2px solid #000',
      padding: '0',
      boxSizing: 'border-box',
    }}>
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 6mm 8mm;
          }
          html, body {
            background: #ffffff !important;
            background-color: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          .invoice-print-root {
            border: 2px solid #000000 !important;
            width: 100% !important;
            max-width: 100% !important;
            background: #ffffff !important;
            background-color: #ffffff !important;
            box-sizing: border-box !important;
          }
          table, tr, td, th {
            background: #ffffff !important;
            background-color: #ffffff !important;
          }
        }
      `}</style>

      {/* ── Top Header Section ─────────────────────────────────────────────── */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td colSpan={11} style={{ textAlign: 'center', paddingTop: '6px', paddingBottom: '2px', position: 'relative' }}>
              <span style={{ fontSize: '16px', fontWeight: 'bold', letterSpacing: '0.05em' }}>GST INVOICE</span>
              <span style={{
                position: 'absolute', right: '12px', top: '6px',
                fontSize: '12px', fontWeight: 'bold', color: '#000', textTransform: 'uppercase',
              }}>
                {copyLabel}
              </span>
            </td>
          </tr>
          <tr>
            <td colSpan={11} style={{ textAlign: 'center', fontSize: '20px', fontWeight: 'bold', paddingBottom: '2px' }}>
              {seller.name || 'SWAMY SLABS INDUSTRIES'}
            </td>
          </tr>
          <tr>
            <td colSpan={11} style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '12px' }}>
              GSTIN : {seller.gstin || '37FEIPK5873Q1ZF'}
            </td>
          </tr>
          <tr>
            <td colSpan={11} style={{ textAlign: 'center', fontSize: '12px' }}>
              {seller.tagline || 'Mfrs. Of : Rough & Black Polished Slabs'}
            </td>
          </tr>
          <tr>
            <td colSpan={11} style={{ textAlign: 'center', fontSize: '12px' }}>
              {seller.address || 'BETAMCHERLA - 518599. Kurnool Dist. A.P.'}
            </td>
          </tr>
          <tr>
            <td colSpan={11} style={{
              textAlign: 'center', fontSize: '12px', borderBottom: '1.5px solid #000', paddingBottom: '6px',
            }}>
              email: {seller.email || 'swamyslabsindustries@gmail.com'} , Cell : {seller.phone || '9490238301'}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Metadata Section (Pill boxes around values) ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', borderBottom: '1.5px solid #000' }}>
        <tbody>
          <tr>
            <td style={{ ...tdBase, width: '14%', fontWeight: 'bold', fontSize: '12px' }}>Invoice NO</td>
            <td style={{ ...tdBase, width: '36%' }}>
              <ValBox>{invoiceNumber}</ValBox>
            </td>
            <td style={{ ...tdBase, width: '18%', fontWeight: 'bold', fontSize: '12px', borderLeft: '1.5px solid #000' }}>Transport Mode</td>
            <td style={{ ...tdBase, width: '32%' }}>
              <ValBox>{transportMode}</ValBox>
            </td>
          </tr>
          <tr>
            <td style={{ ...tdBase, fontWeight: 'bold', fontSize: '12px' }}>DATE</td>
            <td style={{ ...tdBase }}>
              <ValBox>{fmtDate(invoiceDate)}</ValBox>
            </td>
            <td style={{ ...tdBase, fontWeight: 'bold', fontSize: '12px', borderLeft: '1.5px solid #000' }}>Vehicle Number</td>
            <td style={{ ...tdBase }}>
              <ValBox>{vehicleNumber}</ValBox>
            </td>
          </tr>
          <tr>
            <td style={{ ...tdBase, fontWeight: 'bold', fontSize: '12px' }}>P.O. No</td>
            <td style={{ ...tdBase }}>
              <ValBox>{poNumber}</ValBox>
            </td>
            <td style={{ ...tdBase, fontWeight: 'bold', fontSize: '12px', borderLeft: '1.5px solid #000' }}>Place of Supply</td>
            <td style={{ ...tdBase }}>
              <ValBox>{placeOfSupply || 'BETAMCHERLA'}</ValBox>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Buyer / Consignee Details Section ──────────────────────────────── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', borderBottom: '1.5px solid #000', tableLayout: 'fixed' }}>
        <tbody>
          <tr>
            <td colSpan={2} style={{
              ...tdBase, width: '50%', fontWeight: 'bold', textAlign: 'center', fontSize: '12px', padding: '5px',
            }}>
              Details of Receiver (Billed To)
            </td>
            <td colSpan={2} style={{
              ...tdBase, width: '50%', fontWeight: 'bold', textAlign: 'center', fontSize: '12px', borderLeft: '1.5px solid #000', padding: '5px',
            }}>
              Details of Consignee (Shipped To)
            </td>
          </tr>
          <tr>
            <td style={{ ...tdBase, width: '15%', fontWeight: 'bold' }}>Name</td>
            <td style={{ ...tdBase, width: '35%', fontWeight: 'bold', fontSize: '13px' }}>{buyer.name}</td>
            <td style={{ ...tdBase, width: '15%', fontWeight: 'bold', borderLeft: '1.5px solid #000' }}>Name</td>
            <td style={{ ...tdBase, width: '35%', fontWeight: 'bold', fontSize: '13px' }}>{consignee.name}</td>
          </tr>
          <tr>
            <td style={{ ...tdBase, fontWeight: 'bold' }}>Address</td>
            <td style={{ ...tdBase }}>{buyer.address}</td>
            <td style={{ ...tdBase, fontWeight: 'bold', borderLeft: '1.5px solid #000' }}>Address</td>
            <td style={{ ...tdBase }}>{consignee.address}</td>
          </tr>
          <tr>
            <td style={{ ...tdBase, fontWeight: 'bold' }}>State</td>
            <td style={{ ...tdBase }}>{buyer.state}</td>
            <td style={{ ...tdBase, fontWeight: 'bold', borderLeft: '1.5px solid #000' }}>State</td>
            <td style={{ ...tdBase }}>{consignee.state}</td>
          </tr>
          <tr>
            <td style={{ ...tdBase, fontWeight: 'bold' }}>State Code</td>
            <td style={{ ...tdBase }}>{buyer.stateCode}</td>
            <td style={{ ...tdBase, fontWeight: 'bold', borderLeft: '1.5px solid #000' }}>State Code</td>
            <td style={{ ...tdBase }}>{consignee.stateCode}</td>
          </tr>
          <tr>
            <td style={{ ...tdBase, fontWeight: 'bold' }}>GSTIN</td>
            <td style={{ ...tdBase, fontWeight: 'bold' }}>{buyer.gstin}</td>
            <td style={{ ...tdBase, fontWeight: 'bold', borderLeft: '1.5px solid #000' }}>GSTIN</td>
            <td style={{ ...tdBase, fontWeight: 'bold' }}>{consignee.gstin}</td>
          </tr>
        </tbody>
      </table>

      {/* ── Line Items Table ───────────────────────────────────────────────── */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'center', fontWeight: 'bold' }}>
            <th rowSpan={2} style={{ ...thBase, width: '28%', fontSize: '12px' }}>Description of Goods</th>
            <th rowSpan={2} style={{ ...thBase, width: '12%', fontSize: '12px' }}>HSN Code</th>
            <th rowSpan={2} style={{ ...thBase, width: '7%', fontSize: '12px' }}>Qty<br />(Sqm)</th>
            <th rowSpan={2} style={{ ...thBase, width: '7%', fontSize: '12px' }}>Rate</th>
            <th rowSpan={2} style={{ ...thBase, width: '12%', fontSize: '12px' }}>Taxable<br />Value</th>
            <th colSpan={2} style={{ ...thBase, width: '11%', fontSize: '12px' }}>SGST</th>
            <th colSpan={2} style={{ ...thBase, width: '11%', fontSize: '12px' }}>CGST</th>
            <th colSpan={2} style={{ ...thBase, width: '12%', fontSize: '12px' }}>IGST</th>
          </tr>
          <tr style={{ textAlign: 'center', fontWeight: 'bold' }}>
            <th style={{ ...thBase, fontSize: '10px' }}>Rate</th>
            <th style={{ ...thBase, fontSize: '10px' }}>Amount</th>
            <th style={{ ...thBase, fontSize: '10px' }}>Rate</th>
            <th style={{ ...thBase, fontSize: '10px' }}>Amount</th>
            <th style={{ ...thBase, fontSize: '10px' }}>Rate</th>
            <th style={{ ...thBase, fontSize: '10px' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {lineItems.map((item, idx) => {
            const amt = Math.round(Number(item.qty || 0) * Number(item.rate || 0) * 100) / 100;
            return (
              <tr key={idx} style={{ height: '24px' }}>
                <td style={{ ...tdBase, textAlign: 'left', fontWeight: 'bold', fontSize: '12px' }}>{item.description}</td>
                <td style={{ ...tdBase, textAlign: 'center', fontSize: '11px' }}>{item.hsnCode || ''}</td>
                <td style={{ ...tdBase, textAlign: 'center', fontSize: '12px' }}>{item.qty}</td>
                <td style={{ ...tdBase, textAlign: 'center', fontSize: '12px' }}>{item.rate}</td>
                <td style={{ ...tdBase, textAlign: 'right', fontWeight: 'bold', fontSize: '12px' }}>{fmtCurrency(amt)}</td>
                {taxType === 'CGST_SGST' ? (
                  <>
                    <td style={{ ...tdBase, textAlign: 'center', fontSize: '12px' }}>{halfRate}%</td>
                    <td style={{ ...tdBase, textAlign: 'right', fontSize: '12px' }}>{fmtCurrency(amt * halfRate / 100)}</td>
                    <td style={{ ...tdBase, textAlign: 'center', fontSize: '12px' }}>{halfRate}%</td>
                    <td style={{ ...tdBase, textAlign: 'right', fontSize: '12px' }}>{fmtCurrency(amt * halfRate / 100)}</td>
                    <td style={{ ...tdBase }} />
                    <td style={{ ...tdBase }} />
                  </>
                ) : (
                  <>
                    <td style={{ ...tdBase }} />
                    <td style={{ ...tdBase }} />
                    <td style={{ ...tdBase }} />
                    <td style={{ ...tdBase }} />
                    <td style={{ ...tdBase, textAlign: 'center', fontSize: '12px' }}>{taxRate}%</td>
                    <td style={{ ...tdBase, textAlign: 'right', fontSize: '12px' }}>{fmtCurrency(amt * Number(taxRate) / 100)}</td>
                  </>
                )}
              </tr>
            );
          })}

          {/* Blank padding rows to fill paper layout height */}
          {Array.from({ length: BLANK_ROWS }).map((_, i) => (
            <tr key={`blank-${i}`} style={{ height: '24px' }}>
              <td style={{ ...tdBase }}>&nbsp;</td>
              <td style={{ ...tdBase }}>&nbsp;</td>
              <td style={{ ...tdBase }}>&nbsp;</td>
              <td style={{ ...tdBase }}>&nbsp;</td>
              <td style={{ ...tdBase }}>&nbsp;</td>
              <td style={{ ...tdBase }}>&nbsp;</td>
              <td style={{ ...tdBase }}>&nbsp;</td>
              <td style={{ ...tdBase }}>&nbsp;</td>
              <td style={{ ...tdBase }}>&nbsp;</td>
              <td style={{ ...tdBase }}>&nbsp;</td>
              <td style={{ ...tdBase }}>&nbsp;</td>
            </tr>
          ))}

          {/* Packing & Taxable Value Row */}
          <tr style={{ fontWeight: 'bold', height: '26px' }}>
            <td colSpan={4} style={{ ...tdBase, textAlign: 'left', verticalAlign: 'middle', fontSize: '11px' }}>
              {packing && packing.totalCrates ? (
                <>
                  TOTAL {packing.totalCrates} CRTS({Number(packing.piecesPerCrate || 0).toFixed(2)} pcs / Crate)
                </>
              ) : null}
            </td>
            <td style={{ ...tdBase, textAlign: 'right', fontWeight: 'bold', fontSize: '12px' }}>{fmtCurrency(taxableValue)}</td>
            {taxType === 'CGST_SGST' ? (
              <>
                <td style={{ ...tdBase, textAlign: 'center', fontSize: '12px' }}>{halfRate}%</td>
                <td style={{ ...tdBase, textAlign: 'right', fontSize: '12px' }}>{fmtCurrency(taxAmount / 2)}</td>
                <td style={{ ...tdBase, textAlign: 'center', fontSize: '12px' }}>{halfRate}%</td>
                <td style={{ ...tdBase, textAlign: 'right', fontSize: '12px' }}>{fmtCurrency(taxAmount / 2)}</td>
                <td style={{ ...tdBase }} />
                <td style={{ ...tdBase }} />
              </>
            ) : (
              <>
                <td style={{ ...tdBase }} />
                <td style={{ ...tdBase }} />
                <td style={{ ...tdBase }} />
                <td style={{ ...tdBase }} />
                <td style={{ ...tdBase, textAlign: 'center', fontSize: '12px' }}>{taxRate}%</td>
                <td style={{ ...tdBase, textAlign: 'right', fontSize: '12px' }}>{fmtCurrency(taxAmount)}</td>
              </>
            )}
          </tr>

          {/* Amount in Words + Total Row */}
          <tr style={{ fontWeight: 'bold', height: '36px' }}>
            <td colSpan={7} style={{
              ...tdBase, textAlign: 'left', verticalAlign: 'middle', paddingLeft: '8px', fontSize: '11px', textTransform: 'uppercase',
            }}>
              {amountInWords}
            </td>
            <td colSpan={2} style={{ ...tdBase, textAlign: 'center', verticalAlign: 'middle', fontSize: '12px' }}>TOTAL</td>
            <td colSpan={2} style={{
              ...tdBase, textAlign: 'right', verticalAlign: 'middle', paddingRight: '8px', fontSize: '16px', fontWeight: 'bold',
            }}>
              {fmtCurrency(grandTotal)}
            </td>
          </tr>

          {/* Signature Block */}
          <tr>
            <td colSpan={7} style={{ ...tdBase, height: '65px', verticalAlign: 'bottom', borderBottom: 'none' }}>
              &nbsp;
            </td>
            <td colSpan={4} style={{
              ...tdBase, textAlign: 'right', verticalAlign: 'top', padding: '8px 10px', borderBottom: 'none',
            }}>
              <div style={{ fontWeight: 'bold', fontSize: '13px' }}>For : {seller.name || 'SWAMY SLABS INDUSTRIES'}</div>
              <div style={{ marginTop: '40px', textAlign: 'right', fontSize: '12px', fontWeight: 'normal' }}>Proprietor</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Value Pill Box Component ──────────────────────────────────────────────────
function ValBox({ children }) {
  return (
    <div style={{
      border: '1.5px solid #000',
      borderRadius: '4px',
      padding: '2px 10px',
      fontWeight: 'bold',
      fontSize: '12px',
      display: 'inline-block',
      width: '100%',
      boxSizing: 'border-box',
      background: '#fff',
    }}>
      {children || <>&nbsp;</>}
    </div>
  );
}

const tdBase = {
  border: '1px solid #000',
  padding: '4px 6px',
  verticalAlign: 'middle',
};

const thBase = {
  border: '1px solid #000',
  padding: '5px 6px',
  verticalAlign: 'middle',
  background: '#fff',
};
