import {
  commercialLineQuantity,
  commercialLineRateMinor,
  commercialStoneName,
  formatCommercialDate,
  formatCommercialMoney,
  formatCommercialNumber,
  labelCommercialUnit,
  quotationCustomer,
  quotationTotals,
} from '../../lib/commercial';

function compact(values) {
  return values.map((value) => String(value || '').trim()).filter(Boolean);
}

function addressLines(address) {
  if (!address || typeof address !== 'object') return [];
  return compact([
    address.line1 || address.address1,
    address.line2 || address.address2,
    compact([address.city || address.place, address.state, address.postalCode || address.pincode]).join(', '),
    address.country,
  ]);
}

function contactLines(entity) {
  return compact([entity?.email, entity?.phone]);
}

function LineDescription({ item }) {
  const specifications = compact([
    item.finish,
    item.thicknessMm != null ? `${formatCommercialNumber(item.thicknessMm)} mm` : '',
    item.dimensions?.lengthMm && item.dimensions?.widthMm
      ? `${formatCommercialNumber(item.dimensions.lengthMm)} × ${formatCommercialNumber(item.dimensions.widthMm)} mm`
      : '',
  ]);
  const processing = Array.isArray(item.processingRequirements)
    ? item.processingRequirements.map((entry) => (
      typeof entry === 'string' ? entry : entry.operation
    )).filter(Boolean)
    : [];

  return (
    <div>
      <strong>{commercialStoneName(item)}</strong>
      {specifications.length > 0 && <div className="quotation-print-muted">{specifications.join(' · ')}</div>}
      {item.areaSqFt != null && <div className="quotation-print-muted">Area: {formatCommercialNumber(item.areaSqFt)} sq.ft</div>}
      {processing.length > 0 && <div className="quotation-print-muted">Processing: {processing.join(', ').replaceAll('_', ' ')}</div>}
      {item.notes && <div className="quotation-print-muted">{item.notes}</div>}
    </div>
  );
}

export default function QuotationPrint({ quotation }) {
  if (!quotation) return null;

  const seller = quotation.sellerSnapshot || quotation.seller || {};
  const customer = quotationCustomer(quotation);
  const billingAddress = quotation.billingAddress || customer.billingAddress;
  const shippingAddress = quotation.shippingAddress || customer.deliveryAddress;
  const items = Array.isArray(quotation.lineItems) ? quotation.lineItems : [];
  const totals = quotationTotals(quotation);
  const currency = quotation.currency || quotation.financialSnapshot?.currency || '';
  const isDraft = quotation.status === 'DRAFT';

  return (
    <article className="quotation-print-root" aria-label={`Quotation ${quotation.quotationNumber || ''}`}>
      {isDraft && <div className="quotation-print-watermark" aria-hidden="true">DRAFT</div>}

      <header className="quotation-print-header">
        <div>
          <p className="quotation-print-kicker">Quotation</p>
          <h1>{seller.name || 'Seller details not recorded'}</h1>
          {seller.tagline && <p>{seller.tagline}</p>}
          {addressLines(seller.address && typeof seller.address === 'object' ? seller.address : { line1: seller.address }).map((line) => <p key={line}>{line}</p>)}
          {contactLines(seller).length > 0 && <p>{contactLines(seller).join(' · ')}</p>}
          {seller.gstin && <p>GSTIN: {seller.gstin}</p>}
        </div>
        <dl className="quotation-print-meta">
          <div><dt>Quotation</dt><dd>{quotation.quotationNumber || 'Draft number pending'}</dd></div>
          <div><dt>Revision</dt><dd>{quotation.revision ?? 1}</dd></div>
          <div><dt>Issue date</dt><dd>{formatCommercialDate(quotation.issueDate)}</dd></div>
          <div><dt>Valid until</dt><dd>{formatCommercialDate(quotation.validUntil)}</dd></div>
          <div><dt>Status</dt><dd>{quotation.status || 'Not recorded'}</dd></div>
        </dl>
      </header>

      <section className="quotation-print-parties" aria-label="Customer and delivery details">
        <div>
          <h2>Quotation for</h2>
          <p><strong>{customer.company || customer.name || 'Customer not recorded'}</strong></p>
          {customer.company && customer.name && <p>{customer.name}</p>}
          {addressLines(billingAddress).map((line) => <p key={line}>{line}</p>)}
          {contactLines(customer).map((line) => <p key={line}>{line}</p>)}
          {customer.gstin && <p>GSTIN: {customer.gstin}</p>}
        </div>
        {addressLines(shippingAddress).length > 0 && (
          <div>
            <h2>Delivery context</h2>
            {addressLines(shippingAddress).map((line) => <p key={line}>{line}</p>)}
          </div>
        )}
      </section>

      <table className="quotation-print-table">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Material and specification</th>
            <th scope="col">Quantity</th>
            <th scope="col">Rate</th>
            <th scope="col">Discount</th>
            <th scope="col">Tax</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item._id || item.lineItemId || index}>
              <td>{index + 1}</td>
              <td><LineDescription item={item} /></td>
              <td>{formatCommercialNumber(commercialLineQuantity(item))} {labelCommercialUnit(item.unit)}</td>
              <td>{formatCommercialMoney(commercialLineRateMinor(item), currency)}</td>
              <td>{formatCommercialMoney(item.discountMinor ?? 0, currency)}</td>
              <td>{formatCommercialMoney(item.taxMinor ?? 0, currency)}</td>
              <td><strong>{formatCommercialMoney(item.lineTotalMinor, currency)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="quotation-print-summary">
        <dl>
          <div><dt>Subtotal</dt><dd>{formatCommercialMoney(totals.subtotalMinor, currency)}</dd></div>
          <div><dt>Discount</dt><dd>{formatCommercialMoney(totals.discountMinor ?? 0, currency)}</dd></div>
          <div><dt>Taxable amount</dt><dd>{formatCommercialMoney(totals.taxableMinor, currency)}</dd></div>
          <div><dt>Tax</dt><dd>{formatCommercialMoney(totals.taxMinor ?? 0, currency)}</dd></div>
          <div className="quotation-print-total"><dt>Grand total</dt><dd>{formatCommercialMoney(totals.grandTotalMinor, currency)}</dd></div>
        </dl>
      </section>

      <section className="quotation-print-terms">
        {quotation.paymentTerms && <div><h2>Payment terms</h2><p>{quotation.paymentTerms}</p></div>}
        {quotation.deliveryTerms && <div><h2>Delivery terms</h2><p>{quotation.deliveryTerms}</p></div>}
        {quotation.notes && <div><h2>Notes</h2><p>{quotation.notes}</p></div>}
      </section>

      <footer>
        <p>This document reflects the persisted quotation revision shown above. Availability and processing remain subject to the recorded commercial terms.</p>
        {seller.name && <p className="quotation-print-signature">For {seller.name}</p>}
      </footer>
    </article>
  );
}
