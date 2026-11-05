import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAdmin } from '../../context/AdminContext';
import InvoicePrint from '../../components/admin/InvoicePrint';
import {
  ArrowLeft,
  Printer,
  Download,
  AlertCircle,
  CheckCircle2,
  Banknote,
  Plus,
  ShieldAlert,
  XCircle,
  ExternalLink,
  History,
} from 'lucide-react';
import {
  AdminFeedback,
  AdminPanel,
} from '../../components/admin/AdminPrimitives';
import {
  formatBillingDate,
  formatBillingMoney,
  INVOICE_DOCUMENT_STATUS_STYLES,
  INVOICE_PAYMENT_STATUS_STYLES,
  labelInvoiceDocumentStatus,
  labelInvoicePaymentStatus,
} from '../../lib/billing';
import {
  labelPaymentMethod,
  labelPaymentStatus,
  PAYMENT_STATUS_STYLES,
} from '../../lib/payment';

export default function InvoiceViewPage() {
  const { id } = useParams();
  const { authFetch, logout } = useAdmin();
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState(null);
  const [events, setEvents] = useState([]);
  const [payments, setPayments] = useState([]);
  const [salesOrder, setSalesOrder] = useState(null);
  const [taxProfile, setTaxProfile] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [dlLoading, setDlLoading] = useState(false);

  // Void modal
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');

  const fetchInvoiceData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [res, taxProfileRes] = await Promise.all([
        authFetch(`/api/admin/invoices/${encodeURIComponent(id)}`),
        authFetch('/api/admin/invoices/tax-profile').catch(() => null),
      ]);

      if (res.status === 401) {
        logout();
        navigate('/admin/login', { replace: true });
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invoice not found');

      setInvoice(data.invoice);
      setEvents(data.events || []);
      setPayments(data.payments || []);
      setSalesOrder(data.salesOrder || null);

      if (taxProfileRes && taxProfileRes.ok) {
        const taxData = await taxProfileRes.json();
        setTaxProfile(taxData.profile || null);
      }
    } catch (err) {
      setError(err.message || 'Failed to load invoice');
    } finally {
      setLoading(false);
    }
  }, [authFetch, id, logout, navigate]);

  useEffect(() => {
    fetchInvoiceData();
  }, [fetchInvoiceData]);

  const downloadExcel = async () => {
    if (!invoice) return;
    setDlLoading(true);
    try {
      const res = await authFetch(`/api/invoices/${id}/excel`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice_${(invoice.invoiceNumber || id).replace(/\//g, '-')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to download Excel export');
    } finally {
      setDlLoading(false);
    }
  };

  const handleIssueInvoice = async () => {
    if (!window.confirm('Are you sure you want to issue this invoice? An official consecutive GST invoice number will be allocated and the document will become immutable.')) {
      return;
    }
    setBusyAction('issue');
    setError('');
    setActionSuccess('');
    try {
      const res = await authFetch(`/api/admin/invoices/${encodeURIComponent(id)}/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.status === 401) {
        logout();
        navigate('/admin/login', { replace: true });
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to issue invoice');
      setActionSuccess(`Invoice officially issued as ${data.invoice.invoiceNumber}!`);
      fetchInvoiceData();
    } catch (err) {
      setError(err.message || 'Failed to issue invoice');
    } finally {
      setBusyAction('');
    }
  };

  const handleVoidInvoice = async (e) => {
    e.preventDefault();
    if (!voidReason.trim()) {
      setError('A void reason is required.');
      return;
    }
    setBusyAction('void');
    setError('');
    try {
      const res = await authFetch(`/api/admin/invoices/${encodeURIComponent(id)}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: voidReason.trim() }),
      });
      if (res.status === 401) {
        logout();
        navigate('/admin/login', { replace: true });
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to void invoice');
      setShowVoidModal(false);
      setActionSuccess('Invoice successfully voided.');
      fetchInvoiceData();
    } catch (err) {
      setError(err.message || 'Failed to void invoice');
    } finally {
      setBusyAction('');
    }
  };

  const isV2 = invoice?.recordVersion === 2;
  const isTaxProfileVerified = taxProfile?.verification?.identityVerified;
  const outstandingMinor = invoice
    ? Math.max(0, (invoice.grandTotalMinor || 0) - (invoice.paymentSummary?.confirmedMinor || 0))
    : 0;

  return (
    <div className="min-h-screen bg-stone-100 font-sans selection:bg-amber-400 selection:text-stone-950 pb-16">
      {/* Action Toolbar */}
      <div className="no-print bg-white border-b border-stone-200 shadow-sm py-3.5 px-4 sm:px-6 sticky top-16 z-20">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              to="/admin/invoices"
              className="text-stone-600 hover:text-stone-950 text-xs font-bold transition flex items-center gap-1.5 no-underline"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Invoices</span>
            </Link>

            {isV2 && invoice && (
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    INVOICE_DOCUMENT_STATUS_STYLES[invoice.documentStatus] || INVOICE_DOCUMENT_STATUS_STYLES.DRAFT
                  }`}
                >
                  {labelInvoiceDocumentStatus(invoice.documentStatus)}
                </span>
                <span
                  className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    INVOICE_PAYMENT_STATUS_STYLES[invoice.paymentStatus] || INVOICE_PAYMENT_STATUS_STYLES.UNPAID
                  }`}
                >
                  {labelInvoicePaymentStatus(invoice.paymentStatus)}
                </span>
              </div>
            )}
          </div>

          {invoice && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Draft actions */}
              {isV2 && invoice.documentStatus === 'DRAFT' && (
                <button
                  type="button"
                  onClick={handleIssueInvoice}
                  disabled={!!busyAction}
                  className="bg-amber-500 hover:bg-amber-400 text-stone-950 border-none px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-75 cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{busyAction === 'issue' ? 'Issuing...' : 'Issue GST Invoice'}</span>
                </button>
              )}

              {/* Issued actions */}
              {isV2 && invoice.documentStatus === 'ISSUED' && (
                <>
                  {invoice.paymentStatus !== 'PAID' && (
                    <Link
                      to={`/admin/payments/new?invoiceId=${invoice._id}`}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white border-none px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 no-underline flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Record Payment</span>
                    </Link>
                  )}
                  {invoice.paymentSummary?.confirmedMinor === 0 && (
                    <button
                      type="button"
                      onClick={() => setShowVoidModal(true)}
                      disabled={!!busyAction}
                      className="bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 px-3.5 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-75 cursor-pointer flex items-center gap-1.5"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Void Invoice</span>
                    </button>
                  )}
                </>
              )}

              <button
                id="download-excel-btn"
                onClick={downloadExcel}
                disabled={dlLoading}
                className="bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-75 cursor-pointer flex items-center gap-1.5"
              >
                {dlLoading ? <>⏳ Exporting…</> : <><Download className="w-4 h-4" /><span>Export Excel</span></>}
              </button>

              <button
                id="print-invoice-btn"
                onClick={() => window.print()}
                className="bg-stone-950 hover:bg-stone-800 text-amber-400 border-none px-4 py-2 rounded-xl text-xs font-black transition-all shadow-sm active:scale-95 flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4 text-amber-400" />
                <span>Print Document</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto space-y-6">
        {loading && (
          <div className="bg-white rounded-2xl p-20 border border-stone-200 text-center text-stone-500 font-bold animate-pulse space-y-3">
            <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <div>Loading invoice details…</div>
          </div>
        )}

        {actionSuccess && (
          <AdminFeedback tone="success" title="Success">
            {actionSuccess}
          </AdminFeedback>
        )}

        {error && (
          <div className="bg-rose-50 text-rose-700 p-5 rounded-2xl border border-rose-200 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Verification Alert if Draft and Seller Profile unverified */}
        {isV2 && invoice?.documentStatus === 'DRAFT' && !isTaxProfileVerified && (
          <div className="bg-amber-50 border border-amber-300 p-4 rounded-xl text-xs text-amber-900 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Seller GST Identity Verification Required</p>
              <p className="mt-0.5 text-amber-800">
                To issue this invoice legally under Indian GST regulations, the seller tax identity and stone tax rules must be verified in Seller Tax Settings.
              </p>
            </div>
          </div>
        )}

        {/* V2 Payment Summary Cards */}
        {isV2 && invoice && (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 no-print">
            <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-wider text-stone-500">
                Invoice Total
              </span>
              <p className="text-lg font-black text-stone-950 mt-1">
                {formatBillingMoney(invoice.grandTotalMinor || 0)}
              </p>
              <p className="text-[11px] text-stone-500 mt-0.5">
                Tax: {formatBillingMoney(invoice.taxMinor || 0)} ({invoice.taxType})
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-wider text-stone-500">
                Confirmed Receipts
              </span>
              <p className="text-lg font-black text-emerald-700 mt-1">
                {formatBillingMoney(invoice.paymentSummary?.confirmedMinor || 0)}
              </p>
              <p className="text-[11px] text-emerald-800 mt-0.5 font-semibold">
                {invoice.paymentStatus}
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-wider text-stone-500">
                Outstanding Balance
              </span>
              <p className="text-lg font-black text-amber-700 mt-1">
                {formatBillingMoney(outstandingMinor)}
              </p>
              <p className="text-[11px] text-stone-500 mt-0.5">
                Due from {invoice.buyer?.name || 'Customer'}
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-wider text-stone-500">
                Linked Sales Order
              </span>
              <p className="text-base font-bold font-mono text-stone-900 mt-1">
                {invoice.salesOrderNumber || salesOrder?.salesOrderNumber || '—'}
              </p>
              {invoice.salesOrderId && (
                <Link
                  to={`/admin/sales-orders/${invoice.salesOrderId}`}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:underline mt-0.5"
                >
                  View Order <ExternalLink className="w-3 h-3" />
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Invoice Document Layout (Official Printable View) */}
        {invoice && (
          <div className="bg-white rounded-2xl shadow-xl border border-stone-300 p-6 sm:p-10 overflow-x-auto">
            <InvoicePrint invoice={invoice} />
          </div>
        )}

        {/* V2 Payments Ledger Section */}
        {isV2 && (
          <div className="no-print space-y-4">
            <AdminPanel
              title="Recorded Payments"
              description="Transactions recorded against this invoice."
              icon={Banknote}
              action={
                invoice?.documentStatus === 'ISSUED' &&
                invoice?.paymentStatus !== 'PAID' && (
                  <Link
                    to={`/admin/payments/new?invoiceId=${invoice._id}`}
                    className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-stone-950 no-underline hover:bg-amber-400"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Record Payment
                  </Link>
                )
              }
              bodyClassName="p-0"
            >
              {payments.length === 0 ? (
                <div className="p-6 text-center text-xs text-stone-500">
                  No payment records logged for this invoice yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-stone-200 bg-stone-50 font-bold uppercase text-stone-600">
                      <tr>
                        <th className="px-4 py-3">Payment #</th>
                        <th className="px-4 py-3">Amount</th>
                        <th className="px-4 py-3">Method</th>
                        <th className="px-4 py-3">Ref / UTR</th>
                        <th className="px-4 py-3">Received Date</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 font-medium text-stone-700">
                      {payments.map((p) => (
                        <tr key={p._id} className="hover:bg-stone-50">
                          <td className="px-4 py-3 font-mono font-bold text-stone-900">
                            {p.paymentNumber}
                          </td>
                          <td className="px-4 py-3 font-bold text-stone-950">
                            {formatBillingMoney(p.amountMinor)}
                          </td>
                          <td className="px-4 py-3">{labelPaymentMethod(p.method)}</td>
                          <td className="px-4 py-3 font-mono text-stone-500">
                            {p.referenceNumber || '—'}
                          </td>
                          <td className="px-4 py-3">{formatBillingDate(p.receivedAt)}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
                                PAYMENT_STATUS_STYLES[p.status] || PAYMENT_STATUS_STYLES.PENDING_VERIFICATION
                              }`}
                            >
                              {labelPaymentStatus(p.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              to={`/admin/payments/${p._id}`}
                              className="text-amber-700 font-bold hover:underline"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </AdminPanel>

            {/* Audit Trail */}
            <AdminPanel
              title="Invoice Audit Trail"
              description="Chronological event history."
              icon={History}
              bodyClassName="p-5"
            >
              {events.length === 0 ? (
                <p className="text-xs text-stone-500">No events recorded.</p>
              ) : (
                <ol className="relative border-l border-stone-200 ml-2 space-y-3">
                  {events.map((ev) => (
                    <li key={ev._id || ev.occurredAt} className="ml-4">
                      <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-white bg-amber-500" />
                      <time className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                        {formatBillingDate(ev.occurredAt)} • {new Date(ev.occurredAt).toLocaleTimeString()}
                      </time>
                      <p className="text-xs font-bold text-stone-900">{ev.eventType}</p>
                      <p className="text-[11px] text-stone-600">
                        by <span className="font-semibold">{ev.actor || 'system'}</span>
                      </p>
                      {ev.payload?.reason && (
                        <p className="mt-1 text-xs text-stone-600 italic">"{ev.payload.reason}"</p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </AdminPanel>
          </div>
        )}
      </div>

      {/* Void Invoice Modal */}
      {showVoidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-600" />
              Void Issued Invoice
            </h3>
            <p className="mt-1 text-xs text-stone-600">
              Voiding an invoice marks the document void permanently. Invoices with confirmed payments cannot be voided.
            </p>
            <form onSubmit={handleVoidInvoice} className="mt-4 space-y-4">
              <textarea
                required
                rows={3}
                placeholder="Reason for voiding invoice..."
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                className="w-full rounded-lg border border-stone-300 p-2 text-xs text-stone-900 outline-none focus:border-rose-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowVoidModal(false)}
                  className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busyAction === 'void'}
                  className="rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-50"
                >
                  {busyAction === 'void' ? 'Voiding...' : 'Confirm Void'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
