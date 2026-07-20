import React from 'react';

/**
 * InvoicePrint — renders a GST invoice that mirrors the paper format.
 * Used both as the on-screen review/view and as the @media print target.
 * No external dependencies — pure HTML/CSS in JSX.
 */
export default function InvoicePrint({ invoice }) {
  if (!invoice) return null;

  const {
    invoiceNumber, invoiceDate, copyType = 'ORIGINAL FOR RECIPIENT',
    poNumber, transportMode, vehicleNumber, placeOfSupply,
    seller, buyer, consignee, lineItems = [], packing,
    taxableValue, taxType, taxRate, taxAmount, grandTotal, amountInWords,
  } = invoice;

  const fmtDate = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`;
  };

  const fmtCurrency = (n) =>
    Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const halfRate = Number(taxRate) / 2;
  const copyLabel = copyType === 'ORIGINAL FOR RECIPIENT'      ? 'ORIGINAL'
                  : copyType === 'DUPLICATE FOR TRANSPORTER'   ? 'DUPLICATE'
                  : 'TRIPLICATE';

  const BLANK_ROWS = Math.max(0, 10 - lineItems.length); // pad to at least 10 rows total

  return (
    <div className="invoice-print-root" style={{
      fontFamily: 'Calibri, Arial, sans-serif',
      fontSize: '11px',
      color: '#000',
      maxWidth: '900px',
      margin: '0 auto',
      background: '#fff',
    }}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 0 }}>
        <tbody>
          <tr>
            <td colSpan={8} style={{ textAlign: 'center', paddingBottom: '2px', position: 'relative' }}>
              <span style={{ fontSize: '15px', fontWeight: 'bold' }}>GST INVOICE</span>
              <span style={{
                position: 'absolute', right: 0, top: 0,
                fontSize: '11px', fontWeight: 'bold', color: '#c00',
              }}>
                {copyLabel}
              </span>
            </td>
          </tr>
          <tr>
            <td colSpan={8} style={{ textAlign: 'center', fontSize: '18px', fontWeight: 'bold', paddingBottom: '2px' }}>
              {seller?.name}
            </td>
          </tr>
          <tr>
            <td colSpan={8} style={{ textAlign: 'center', fontWeight: 'bold' }}>
              GSTIN : {seller?.gstin}
            </td>
          </tr>
          <tr>
            <td colSpan={8} style={{ textAlign: 'center' }}>{seller?.tagline}</td>
          </tr>
          <tr>
            <td colSpan={8} style={{ textAlign: 'center' }}>{seller?.address}</td>
          </tr>
          <tr>
            <td colSpan={8} style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '4px' }}>
              email: {seller?.email} , Cell : {seller?.phone}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Invoice Meta ───────────────────────────────────────────── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000' }}>
        <tbody>
          <tr>
            <Td w="90px" bold>Invoice NO</Td>
            <Td w="140px">{invoiceNumber}</Td>
            <Td w="10px" style={{ borderLeft: '1px solid #000' }} />
            <Td bold>Transport Mode</Td>
            <Td>{transportMode}</Td>
          </tr>
          <tr>
            <Td bold>DATE</Td>
            <Td>{fmtDate(invoiceDate)}</Td>
            <Td style={{ borderLeft: '1px solid #000' }} />
            <Td bold>Vehicle Number</Td>
            <Td>{vehicleNumber}</Td>
          </tr>
          <tr>
            <Td bold>P.O. No</Td>
            <Td>{poNumber}</Td>
            <Td style={{ borderLeft: '1px solid #000' }} />
            <Td bold>Place of Supply</Td>
            <Td>{placeOfSupply}</Td>
          </tr>
        </tbody>
      </table>

      {/* ── Buyer / Consignee ──────────────────────────────────────── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', marginTop: 0 }}>
        <tbody>
          <tr>
            <Th colSpan={2} style={{ width: '50%', background: '#d9ead3', textAlign: 'center' }}>
              Details of Receiver / Billed To
            </Th>
            <Th colSpan={2} style={{ width: '50%', background: '#d9ead3', textAlign: 'center', borderLeft: '1px solid #000' }}>
              Details of Consignee / Shipped To
            </Th>
          </tr>
          {[
            ['Name',       buyer?.name,       consignee?.name],
            ['Address',    buyer?.address,    consignee?.address],
            ['State',      buyer?.state,      consignee?.state],
            ['State Code', buyer?.stateCode,  consignee?.stateCode],
            ['GSTIN',      buyer?.gstin,      consignee?.gstin],
          ].map(([label, bVal, cVal]) => (
            <tr key={label}>
              <Td bold w="80px">{label}</Td>
              <Td style={{ maxWidth: '260px', wordBreak: 'break-word' }}>{bVal}</Td>
              <Td bold w="80px" style={{ borderLeft: '1px solid #000' }}>
                {label !== 'GSTIN' ? label : ''}
              </Td>
              <Td style={{ maxWidth: '260px', wordBreak: 'break-word' }}>
                {label !== 'GSTIN' ? cVal : ''}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Line Items Table ───────────────────────────────────────── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', marginTop: 0 }}>
        <thead>
          <tr style={{ background: '#d9ead3' }}>
            <Th rowSpan={2} style={{ width: '24%', textAlign: 'center' }}>Description of Goods</Th>
            <Th rowSpan={2} style={{ width: '10%', textAlign: 'center' }}>HSN Code</Th>
            <Th rowSpan={2} style={{ width: '8%',  textAlign: 'center' }}>Qty<br/>(Sqm)</Th>
            <Th rowSpan={2} style={{ width: '6%',  textAlign: 'center' }}>Rate</Th>
            <Th rowSpan={2} style={{ width: '10%', textAlign: 'center' }}>Taxable<br/>Value</Th>
            {/* SGST */}
            <Th colSpan={2} style={{
              width: '14%', textAlign: 'center',
              background: taxType === 'CGST_SGST' ? '#d9ead3' : '#f0f0f0',
            }}>SGST</Th>
            {/* CGST */}
            <Th colSpan={2} style={{
              width: '14%', textAlign: 'center',
              background: taxType === 'CGST_SGST' ? '#d9ead3' : '#f0f0f0',
            }}>CGST</Th>
            {/* IGST */}
            <Th colSpan={2} style={{
              width: '14%', textAlign: 'center',
              background: taxType === 'IGST' ? '#d9ead3' : '#f0f0f0',
            }}>IGST</Th>
          </tr>
          <tr style={{ background: '#d9ead3' }}>
            <Th style={{ textAlign: 'center', fontSize: '10px' }}>Rate</Th>
            <Th style={{ textAlign: 'center', fontSize: '10px' }}>Amou<br/>nt</Th>
            <Th style={{ textAlign: 'center', fontSize: '10px' }}>Rate</Th>
            <Th style={{ textAlign: 'center', fontSize: '10px' }}>Amou<br/>nt</Th>
            <Th style={{ textAlign: 'center', fontSize: '10px' }}>Rate</Th>
            <Th style={{ textAlign: 'center', fontSize: '10px' }}>Amou<br/>nt</Th>
          </tr>
          {/* HSN code row (shown above items, matching paper layout) */}
          {lineItems[0]?.hsnCode && (
            <tr>
              <td colSpan={2} style={tdBase} />
              <td colSpan={1} style={{ ...tdBase, textAlign: 'center', fontWeight: 'bold' }}>
                {lineItems[0].hsnCode}
              </td>
              <td colSpan={7} style={tdBase} />
            </tr>
          )}
        </thead>
        <tbody>
          {lineItems.map((item, idx) => (
            <tr key={idx}>
              <Td style={{ verticalAlign: 'top', paddingTop: '6px' }}>{item.description}</Td>
              <Td style={{ textAlign: 'center' }}>{/* HSN shown in header row */}</Td>
              <Td style={{ textAlign: 'center' }}>{item.qty}</Td>
              <Td style={{ textAlign: 'right'  }}>{item.rate}</Td>
              <Td style={{ textAlign: 'right'  }}>{fmtCurrency(item.amount)}</Td>
              {taxType === 'CGST_SGST' ? <>
                <Td style={{ textAlign: 'center' }}>{halfRate}%</Td>
                <Td style={{ textAlign: 'right'  }}>{fmtCurrency(item.amount * halfRate / 100)}</Td>
                <Td style={{ textAlign: 'center' }}>{halfRate}%</Td>
                <Td style={{ textAlign: 'right'  }}>{fmtCurrency(item.amount * halfRate / 100)}</Td>
                <Td /><Td />
              </> : <>
                <Td /><Td />
                <Td /><Td />
                <Td style={{ textAlign: 'center' }}>{taxRate}%</Td>
                <Td style={{ textAlign: 'right'  }}>{fmtCurrency(item.amount * Number(taxRate) / 100)}</Td>
              </>}
            </tr>
          ))}
          {/* Blank padding rows */}
          {Array.from({ length: BLANK_ROWS }).map((_, i) => (
            <tr key={`blank-${i}`} style={{ height: '22px' }}>
              {Array.from({ length: 11 }).map((__, j) => (
                <td key={j} style={tdBase}>&nbsp;</td>
              ))}
            </tr>
          ))}

          {/* Packing + totals row */}
          <tr style={{ fontWeight: 'bold', borderTop: '1px solid #000' }}>
            <Td colSpan={2} style={{ verticalAlign: 'middle', lineHeight: '1.3' }}>
              {packing ? (
                <>
                  TOTAL {packing.totalCrates} CRTS<br/>
                  ({Number(packing.piecesPerCrate || 0).toFixed(2)} pcs/Crate)
                </>
              ) : null}
            </Td>
            <Td /><Td />
            <Td style={{ textAlign: 'right', fontWeight: 'bold' }}>{fmtCurrency(taxableValue)}</Td>
            {taxType === 'CGST_SGST' ? <>
              <Td style={{ textAlign: 'center' }}>{halfRate}%</Td>
              <Td style={{ textAlign: 'right'  }}>{fmtCurrency(taxAmount / 2)}</Td>
              <Td style={{ textAlign: 'center' }}>{halfRate}%</Td>
              <Td style={{ textAlign: 'right'  }}>{fmtCurrency(taxAmount / 2)}</Td>
              <Td /><Td />
            </> : <>
              <Td /><Td />
              <Td /><Td />
              <Td style={{ textAlign: 'center' }}>{taxRate}%</Td>
              <Td style={{ textAlign: 'right' }}>{fmtCurrency(taxAmount)}</Td>
            </>}
          </tr>

          {/* Amount in words + Grand Total */}
          <tr>
            <td colSpan={8} style={{
              ...tdBase, background: '#ffff00',
              fontWeight: 'bold', color: '#c00',
              padding: '6px 8px',
              lineHeight: '1.5',
            }}>
              {amountInWords}
            </td>
            <Td style={{ textAlign: 'center', fontWeight: 'bold' }} colSpan={1}>TOTAL</Td>
            <Td colSpan={2} style={{
              textAlign: 'right', fontWeight: 'bold', fontSize: '14px',
            }}>
              {fmtCurrency(grandTotal)}
            </Td>
          </tr>

          {/* Signature block */}
          <tr>
            <td colSpan={8} style={{ ...tdBase, height: '50px', verticalAlign: 'bottom', padding: '4px 8px' }}>
              &nbsp;
            </td>
            <td colSpan={3} style={{
              ...tdBase,
              textAlign: 'right',
              fontWeight: 'bold',
              verticalAlign: 'top',
              padding: '6px 8px',
            }}>
              For : {seller?.name}
            </td>
          </tr>
          <tr>
            <td colSpan={8} style={{ ...tdBase, height: '24px' }} />
            <td colSpan={3} style={{
              ...tdBase,
              textAlign: 'right',
              fontSize: '10px',
              color: '#555',
              paddingRight: '8px',
              paddingBottom: '4px',
            }}>
              Authorised Signatory
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Tiny style helpers ─────────────────────────────────────────────────────────

const tdBase = {
  border: '1px solid #000',
  padding: '3px 6px',
  verticalAlign: 'middle',
};

function Td({ children, bold, w, colSpan, style = {}, ...rest }) {
  return (
    <td
      colSpan={colSpan}
      style={{
        ...tdBase,
        fontWeight: bold ? 'bold' : 'normal',
        width: w,
        ...style,
      }}
      {...rest}
    >
      {children}
    </td>
  );
}

function Th({ children, colSpan, rowSpan, style = {} }) {
  return (
    <th
      colSpan={colSpan}
      rowSpan={rowSpan}
      style={{
        ...tdBase,
        fontWeight: 'bold',
        ...style,
      }}
    >
      {children}
    </th>
  );
}
