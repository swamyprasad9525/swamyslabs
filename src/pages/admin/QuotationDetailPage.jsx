import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileCheck2,
  History,
  Pencil,
  Printer,
  RefreshCw,
  RotateCcw,
  Send,
  ShoppingCart,
  UserRound,
  XCircle,
} from 'lucide-react';
import {
  AdminFeedback,
  AdminLoadingState,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
} from '../../components/admin/AdminPrimitives';
import { useAdmin } from '../../context/AdminContext';
import {
  actionIsAllowed,
  commercialLineQuantity,
  commercialLineRateMinor,
  commercialStoneName,
  customerSnapshotName,
  formatCommercialDate,
  formatCommercialMoney,
  formatCommercialNumber,
  labelCommercialUnit,
  labelQuotationStatus,
  parseCommercialResponse,
  quotationCustomer,
  quotationTotals,
  QUOTATION_STATUS_STYLES,
} from '../../lib/commercial';

function StatusBadge({ status }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${QUOTATION_STATUS_STYLES[status] || QUOTATION_STATUS_STYLES.DRAFT}`}>{labelQuotationStatus(status)}</span>;
}

function Section({ title, description, icon: Icon, children, action }) {
  return <AdminPanel title={title} description={description} icon={Icon} action={action} bodyClassName="p-4 sm:p-5">{children}</AdminPanel>;
}

function InfoRow({ label, value, mono = false }) {
  return <div className="flex flex-col gap-1 border-b border-stone-100 py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-5"><dt className="text-xs font-bold text-stone-500">{label}</dt><dd className={`text-sm font-bold text-stone-900 sm:max-w-[65%] sm:text-right ${mono ? 'font-mono' : ''}`}>{value || 'Not recorded'}</dd></div>;
}

function fallbackAllowed(quotation, action) {
  const matrix = {
    edit: quotation.status === 'DRAFT',
    issue: quotation.status === 'DRAFT',
    accept: quotation.status === 'ISSUED',
    reject: quotation.status === 'ISSUED',
    expire: quotation.status === 'ISSUED',
    revise: ['ISSUED', 'REJECTED', 'EXPIRED'].includes(quotation.status),
    cancel: ['DRAFT', 'ISSUED', 'ACCEPTED'].includes(quotation.status),
    convert: quotation.status === 'ACCEPTED' && !quotation.convertedSalesOrderId,
  };
  return Boolean(matrix[action]);
}

function LineItem({ item, index, currency }) {
  const processing = Array.isArray(item.processingRequirements)
    ? item.processingRequirements.map((entry) => typeof entry === 'string' ? entry : entry.operation).filter(Boolean)
    : [];
  return (
    <article className="rounded-xl border border-stone-200 bg-stone-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-[10px] font-black uppercase tracking-wide text-stone-400">Line {index + 1}</p><h3 className="mt-1 text-sm font-black text-stone-950">{commercialStoneName(item)}</h3><p className="mt-1 text-xs text-stone-500">{[item.finish, item.thicknessMm != null && `${formatCommercialNumber(item.thicknessMm)} mm`, item.dimensions?.lengthMm && item.dimensions?.widthMm && `${formatCommercialNumber(item.dimensions.lengthMm)} × ${formatCommercialNumber(item.dimensions.widthMm)} mm`].filter(Boolean).join(' · ') || 'No additional specification recorded'}</p></div>
        <p className="text-base font-black tabular-nums text-stone-950">{formatCommercialMoney(item.lineTotalMinor, currency)}</p>
      </div>
      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-5"><div><dt className="font-bold text-stone-400">QUANTITY</dt><dd className="mt-1 font-bold text-stone-800">{formatCommercialNumber(commercialLineQuantity(item))} {labelCommercialUnit(item.unit)}</dd></div><div><dt className="font-bold text-stone-400">AREA</dt><dd className="mt-1 font-bold text-stone-800">{item.areaSqFt == null ? 'Not recorded' : `${formatCommercialNumber(item.areaSqFt)} sq.ft`}</dd></div><div><dt className="font-bold text-stone-400">RATE</dt><dd className="mt-1 font-bold text-stone-800">{formatCommercialMoney(commercialLineRateMinor(item), currency)}</dd></div><div><dt className="font-bold text-stone-400">DISCOUNT</dt><dd className="mt-1 font-bold text-stone-800">{formatCommercialMoney(item.discountMinor ?? 0, currency)}</dd></div><div><dt className="font-bold text-stone-400">TAX</dt><dd className="mt-1 font-bold text-stone-800">{formatCommercialMoney(item.taxMinor ?? 0, currency)}</dd></div></dl>
      {processing.length > 0 && <p className="mt-4 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs leading-5 text-violet-900"><strong>Processing:</strong> {processing.join(', ').replaceAll('_', ' ')}</p>}
      {item.notes && <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-stone-600">{item.notes}</p>}
    </article>
  );
}

export default function QuotationDetailPage() {
  const { id } = useParams();
  const { authFetch, logout } = useAdmin();
  const navigate = useNavigate();
  const [quotation, setQuotation] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchQuotation = useCallback(async ({ showLoader = true } = {}) => {
    if (showLoader) setLoading(true);
    setError('');
    try {
      const response = await authFetch(`/api/admin/quotations/${encodeURIComponent(id)}`);
      if (response.status === 401) { logout(); navigate('/admin/login', { replace: true }); return; }
      const data = await parseCommercialResponse(response, 'Unable to load this quotation.');
      setQuotation({ ...data.quotation, ...(data.allowedActions ? { allowedActions: data.allowedActions } : {}) });
      setEvents(Array.isArray(data.events) ? data.events : Array.isArray(data.quotation?.events) ? data.quotation.events : []);
    } catch (requestError) {
      setError(requestError.message || 'Unable to load this quotation.');
    } finally {
      setLoading(false);
    }
  }, [authFetch, id, logout, navigate]);

  useEffect(() => { fetchQuotation(); }, [fetchQuotation]);

  function allowed(action) {
    return actionIsAllowed(quotation, action, fallbackAllowed(quotation, action));
  }

  async function performAction(action, path, body = {}, confirmation = '') {
    if (confirmation && !window.confirm(confirmation)) return;
    setBusy(action);
    setError('');
    setSuccess('');
    try {
      const response = await authFetch(`/api/admin/quotations/${encodeURIComponent(id)}${path}`, { method: 'POST', body: JSON.stringify(body) });
      if (response.status === 401) { logout(); navigate('/admin/login', { replace: true }); return; }
      const data = await parseCommercialResponse(response, `Unable to ${action} this quotation.`);
      if (action === 'convert') {
        const order = data.salesOrder;
        if (!order?._id) throw new Error('The server did not return the sales order identity.');
        navigate(`/admin/sales-orders/${order._id}`);
        return;
      }
      if (action === 'revise') {
        const revised = data.quotation;
        if (!revised?._id) throw new Error('The server did not return the revised quotation.');
        navigate(`/admin/quotations/${revised._id}/edit`);
        return;
      }
      setReason('');
      setSuccess(data.duplicate ? 'The existing result was returned; no duplicate record was created.' : `Quotation ${action} completed.`);
      await fetchQuotation({ showLoader: false });
    } catch (requestError) {
      setError(requestError.message || `Unable to ${action} this quotation.`);
    } finally {
      setBusy('');
    }
  }

  if (loading && !quotation) return <AdminPage size="standard"><AdminLoadingState label="Loading quotation detail" rows={6} /></AdminPage>;
  if (!quotation) return <AdminPage size="standard" className="space-y-4"><Link to="/admin/quotations" className="inline-flex min-h-10 items-center gap-2 text-xs font-bold text-stone-600"><ArrowLeft className="h-4 w-4" /> Quotations</Link><AdminFeedback title="Quotation unavailable" onRetry={() => fetchQuotation()}>{error || 'Quotation not found.'}</AdminFeedback></AdminPage>;

  const customer = quotationCustomer(quotation);
  const customerId = quotation.customerId?._id || quotation.customerId || customer._id;
  const leadId = quotation.sourceLeadId?._id || quotation.sourceLeadId;
  const orderId = quotation.convertedSalesOrderId?._id || quotation.convertedSalesOrderId;
  const totals = quotationTotals(quotation);
  const currency = quotation.currency || quotation.financialSnapshot?.currency;

  return (
    <AdminPage className="space-y-6">
      <Helmet><title>{quotation.quotationNumber || 'Quotation'} | Swamy Slabs Admin</title><meta name="robots" content="noindex, nofollow" /></Helmet>
      <Link to="/admin/quotations" className="inline-flex min-h-10 items-center gap-2 text-xs font-bold text-stone-600 no-underline hover:text-stone-950"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Quotations</Link>
      <AdminPageHeader
        eyebrow="Commercial quotation"
        title={quotation.quotationNumber || 'Draft quotation'}
        description={`Revision ${quotation.revision ?? 1} · Created ${formatCommercialDate(quotation.createdAt, { includeTime: true })}`}
        actions={(
          <>
            <StatusBadge status={quotation.status} />
            <button type="button" onClick={() => fetchQuotation()} disabled={loading || Boolean(busy)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-xs font-black text-stone-700 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" /> Refresh</button>
            <Link to={`/admin/quotations/${id}/print`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-xs font-black text-stone-700 no-underline"><Printer className="h-4 w-4" aria-hidden="true" /> Print</Link>
            {allowed('edit') && <Link to={`/admin/quotations/${id}/edit`} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-stone-950 px-4 text-xs font-black text-white no-underline"><Pencil className="h-4 w-4" aria-hidden="true" /> Edit draft</Link>}
          </>
        )}
      />

      {error && <AdminFeedback title="Action could not be completed">{error}</AdminFeedback>}
      {success && <AdminFeedback tone="success" title="Quotation updated">{success}</AdminFeedback>}
      {quotation.status === 'ISSUED' && <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900"><strong>Issued document.</strong> This state does not claim that email or another notification was delivered.</div>}

      <div className="grid gap-6 xl:grid-cols-2">
        <Section icon={FileCheck2} title="Quotation identity" description="Immutable commercial identity and revision context."><dl><InfoRow label="Quotation number" value={quotation.quotationNumber} mono /><InfoRow label="Revision" value={`R${quotation.revision ?? 1}`} /><InfoRow label="Issue date" value={formatCommercialDate(quotation.issueDate)} /><InfoRow label="Valid until" value={formatCommercialDate(quotation.validUntil)} /><InfoRow label="Currency" value={currency} /><InfoRow label="Accepted" value={formatCommercialDate(quotation.acceptedAt, { includeTime: true })} /></dl></Section>
        <Section icon={UserRound} title="Customer snapshot" description="Commercial snapshot retained with this quotation revision."><dl><InfoRow label="Customer" value={customerSnapshotName(customer)} /><InfoRow label="Contact" value={customer.name} /><InfoRow label="Customer number" value={customer.customerNumber} mono /><InfoRow label="Email" value={customer.email} /><InfoRow label="Phone" value={customer.phone} /><InfoRow label="GSTIN" value={customer.gstin} mono /></dl><div className="mt-4 flex flex-wrap gap-2">{customerId && <Link to={`/admin/customers/${customerId}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-200 px-4 text-xs font-black text-stone-700 no-underline">Open customer <ExternalLink className="h-4 w-4" aria-hidden="true" /></Link>}{leadId && <Link to={`/admin/crm/${leadId}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-200 px-4 text-xs font-black text-stone-700 no-underline">Open source lead <ExternalLink className="h-4 w-4" aria-hidden="true" /></Link>}</div></Section>
      </div>

      <Section icon={FileCheck2} title="Commercial lines" description="Stored line calculations from the server-authoritative quotation revision."><div className="space-y-3">{quotation.lineItems?.map((item, index) => <LineItem key={item._id || item.lineItemId || index} item={item} index={index} currency={currency} />)}</div><dl className="ml-auto mt-5 grid max-w-md gap-2 rounded-xl bg-stone-950 p-4 text-sm text-stone-300"><div className="flex justify-between gap-4"><dt>Subtotal</dt><dd className="font-bold text-white">{formatCommercialMoney(totals.subtotalMinor, currency)}</dd></div><div className="flex justify-between gap-4"><dt>Discount</dt><dd className="font-bold text-white">{formatCommercialMoney(totals.discountMinor ?? 0, currency)}</dd></div><div className="flex justify-between gap-4"><dt>Taxable</dt><dd className="font-bold text-white">{formatCommercialMoney(totals.taxableMinor, currency)}</dd></div><div className="flex justify-between gap-4"><dt>Tax</dt><dd className="font-bold text-white">{formatCommercialMoney(totals.taxMinor ?? 0, currency)}</dd></div><div className="mt-1 flex justify-between gap-4 border-t border-stone-700 pt-3 text-base"><dt className="font-black text-white">Grand total</dt><dd className="font-black text-amber-400">{formatCommercialMoney(totals.grandTotalMinor, currency)}</dd></div></dl></Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Terms and customer notes" description="Customer-facing terms preserved on this revision."><div className="space-y-4 text-sm leading-6 text-stone-700">{quotation.paymentTerms && <div><h3 className="text-xs font-black uppercase tracking-wide text-stone-500">Payment terms</h3><p className="mt-1 whitespace-pre-wrap">{quotation.paymentTerms}</p></div>}{quotation.deliveryTerms && <div><h3 className="text-xs font-black uppercase tracking-wide text-stone-500">Delivery terms</h3><p className="mt-1 whitespace-pre-wrap">{quotation.deliveryTerms}</p></div>}{quotation.notes && <div><h3 className="text-xs font-black uppercase tracking-wide text-stone-500">Notes</h3><p className="mt-1 whitespace-pre-wrap">{quotation.notes}</p></div>}{!quotation.paymentTerms && !quotation.deliveryTerms && !quotation.notes && <p className="text-stone-500">No customer-facing terms or notes were recorded.</p>}</div></Section>
        <Section title="Internal notes" description="Protected operational context; excluded from the printed document."><p className="whitespace-pre-wrap text-sm leading-6 text-stone-700">{quotation.internalNotes || 'No internal note recorded.'}</p></Section>
      </div>

      <Section icon={ShoppingCart} title="Valid actions" description="Only transitions allowed for the current server state are shown. Issuing does not send email.">
        <div className="space-y-4">
          {(allowed('reject') || allowed('revise') || allowed('cancel')) && <label className="block text-xs font-bold text-stone-700">Reason / revision note<textarea maxLength={1000} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1.5 w-full resize-y rounded-lg border border-stone-300 px-3 py-2.5 text-sm" placeholder="Required for rejection and cancellation; optional for revision" /></label>}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {allowed('issue') && <button type="button" disabled={Boolean(busy)} onClick={() => performAction('issue', '/issue', {}, 'Issue this persisted quotation revision? This does not send an email.')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-sky-700 px-5 text-xs font-black text-white disabled:opacity-50"><Send className="h-4 w-4" aria-hidden="true" /> Issue quotation</button>}
            {allowed('accept') && <button type="button" disabled={Boolean(busy)} onClick={() => performAction('accept', '/accept', {}, 'Record verified customer acceptance for this quotation?')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 text-xs font-black text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Record acceptance</button>}
            {allowed('reject') && <button type="button" disabled={Boolean(busy) || !reason.trim()} onClick={() => performAction('reject', '/reject', { reason: reason.trim() })} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-rose-300 px-5 text-xs font-black text-rose-700 disabled:opacity-50"><XCircle className="h-4 w-4" aria-hidden="true" /> Record rejection</button>}
            {allowed('expire') && <button type="button" disabled={Boolean(busy)} onClick={() => performAction('expire', '/expire', {}, 'Mark this issued quotation as expired?')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-amber-300 px-5 text-xs font-black text-amber-800 disabled:opacity-50"><Clock3 className="h-4 w-4" aria-hidden="true" /> Mark expired</button>}
            {allowed('revise') && <button type="button" disabled={Boolean(busy)} onClick={() => performAction('revise', '/revise', { reason: reason.trim() || undefined })} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-violet-300 px-5 text-xs font-black text-violet-800 disabled:opacity-50"><RotateCcw className="h-4 w-4" aria-hidden="true" /> Create revision</button>}
            {allowed('convert') && <button type="button" disabled={Boolean(busy)} onClick={() => performAction('convert', '/convert-to-sales-order', {}, 'Create the sales order from this accepted commercial snapshot? Retrying is idempotent.')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-stone-950 px-5 text-xs font-black text-white disabled:opacity-50"><ShoppingCart className="h-4 w-4" aria-hidden="true" /> Convert to sales order</button>}
            {allowed('cancel') && <button type="button" disabled={Boolean(busy) || !reason.trim()} onClick={() => performAction('cancel', '/cancel', { reason: reason.trim() }, 'Cancel this quotation while retaining its history?')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-rose-300 px-5 text-xs font-black text-rose-700 disabled:opacity-50"><Ban className="h-4 w-4" aria-hidden="true" /> Cancel quotation</button>}
            {orderId && <Link to={`/admin/sales-orders/${orderId}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-5 text-xs font-black text-emerald-900 no-underline">Open sales order <ExternalLink className="h-4 w-4" aria-hidden="true" /></Link>}
          </div>
          {busy && <p role="status" className="flex items-center gap-2 text-xs font-bold text-stone-500"><RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Completing {busy}…</p>}
        </div>
      </Section>

      <Section icon={History} title="Immutable quotation timeline" description="Server-recorded commercial events for this quotation and its revision lifecycle.">
        {events.length === 0 ? <p className="py-8 text-center text-sm text-stone-500">No quotation events were returned.</p> : <ol className="space-y-0">{events.map((event, index) => <li key={event._id || `${event.type}-${event.createdAt}-${index}`} className="relative flex gap-3 pb-5 last:pb-0">{index < events.length - 1 && <span className="absolute bottom-0 left-3 top-7 w-px bg-stone-200" aria-hidden="true" />}<span className="relative mt-1 h-6 w-6 shrink-0 rounded-full bg-amber-100 ring-4 ring-white" aria-hidden="true" /><div className="min-w-0 flex-1 rounded-lg border border-stone-100 bg-stone-50 p-4"><div className="flex flex-wrap justify-between gap-2"><p className="text-xs font-black uppercase tracking-wide text-stone-800">{String(event.type || 'EVENT').replaceAll('_', ' ')}</p><time className="text-[11px] text-stone-400">{formatCommercialDate(event.occurredAt || event.createdAt, { includeTime: true })}</time></div>{(event.note || event.reason) && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-700">{event.note || event.reason}</p>}<p className="mt-2 text-[11px] text-stone-400">Actor: {event.actor || 'Authenticated admin'}</p></div></li>)}</ol>}
      </Section>
    </AdminPage>
  );
}
