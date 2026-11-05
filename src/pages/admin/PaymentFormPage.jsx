import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Banknote,
  FileText,
  Save,
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
  formatBillingMoney,
} from '../../lib/billing';
import {
  parsePaymentResponse,
  PAYMENT_METHODS,
} from '../../lib/payment';

function generateRequestKey() {
  return globalThis.crypto?.randomUUID?.() || `req-${Date.now()}-${Math.random().toString(36).substring(2)}`;
}

export default function PaymentFormPage() {
  const [searchParams] = useSearchParams();
  const initialInvoiceId = searchParams.get('invoiceId') || '';
  const { authFetch, logout } = useAdmin();
  const navigate = useNavigate();

  const [invoiceId, setInvoiceId] = useState(initialInvoiceId);
  const [invoice, setInvoice] = useState(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);

  const [amountRupees, setAmountRupees] = useState('');
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [issuedInvoices, setIssuedInvoices] = useState([]);
  const [loadingInvoicesList, setLoadingInvoicesList] = useState(false);

  const fetchInvoice = useCallback(
    async (idToFetch) => {
      if (!idToFetch) {
        setInvoice(null);
        return;
      }
      setLoadingInvoice(true);
      setError('');
      try {
        const res = await authFetch(`/api/admin/invoices/${encodeURIComponent(idToFetch)}`);
        if (res.status === 401) {
          logout();
          navigate('/admin/login', { replace: true });
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load invoice.');
        setInvoice(data.invoice);
      } catch (err) {
        setError(err.message || 'Failed to load invoice.');
        setInvoice(null);
      } finally {
        setLoadingInvoice(false);
      }
    },
    [authFetch, logout, navigate],
  );

  useEffect(() => {
    if (invoiceId) {
      fetchInvoice(invoiceId);
    }
  }, [fetchInvoice, invoiceId]);

  // Load unpaid / partially paid issued invoices for dropdown if invoiceId not given
  useEffect(() => {
    async function loadIssued() {
      setLoadingInvoicesList(true);
      try {
        const res = await authFetch('/api/admin/invoices?documentStatus=ISSUED&limit=50');
        if (res.ok) {
          const data = await res.json();
          setIssuedInvoices(data.invoices || []);
        }
      } catch {
        // Non-critical dropdown prefetch
      } finally {
        setLoadingInvoicesList(false);
      }
    }
    loadIssued();
  }, [authFetch]);

  const outstandingMinor = invoice
    ? Math.max(0, (invoice.grandTotalMinor || 0) - (invoice.paymentSummary?.confirmedMinor || 0))
    : 0;

  const handleFillFullBalance = () => {
    if (outstandingMinor > 0) {
      setAmountRupees((outstandingMinor / 100).toFixed(2));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!invoiceId) {
      setError('Please select an issued invoice.');
      return;
    }
    const parsedAmount = parseFloat(amountRupees);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid payment amount greater than zero.');
      return;
    }
    const amountMinor = Math.round(parsedAmount * 100);
    if (amountMinor > outstandingMinor) {
      setError(
        `Payment amount (${formatBillingMoney(amountMinor)}) cannot exceed outstanding balance (${formatBillingMoney(
          outstandingMinor,
        )}).`,
      );
      return;
    }
    if (!referenceNumber.trim()) {
      setError('Reference / UTR / Cheque number is required for audit integrity.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const idempotencyKey = generateRequestKey();
      const payload = {
        invoiceId,
        amountMinor,
        method,
        referenceNumber: referenceNumber.trim(),
        receivedAt: new Date(receivedAt).toISOString(),
        notes: notes.trim(),
        requestKey: idempotencyKey,
      };

      const response = await authFetch('/api/admin/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 401) {
        logout();
        navigate('/admin/login', { replace: true });
        return;
      }

      const data = await parsePaymentResponse(response, 'Failed to record payment.');
      navigate(`/admin/payments/${data.payment._id}`);
    } catch (err) {
      setError(err.message || 'Failed to record payment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminPage size="standard" className="space-y-6 pb-12">
      <Helmet>
        <title>Record Payment | Swamy Slabs Admin</title>
      </Helmet>

      <div>
        <Link
          to="/admin/payments"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-600 hover:text-stone-950 no-underline mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Payments
        </Link>
        <AdminPageHeader
          eyebrow="Commercial Ledger"
          title="Record Customer Payment"
          description="Log receipt of funds against an issued invoice for verification and balance reconciliation."
        />
      </div>

      {error && (
        <AdminFeedback tone="error" title="Submission Error">
          {error}
        </AdminFeedback>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <AdminPanel
          title="1. Invoice Selection"
          description="Select the issued commercial invoice being paid."
          icon={FileText}
          bodyClassName="p-5 space-y-4"
        >
          {initialInvoiceId && invoice ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-800">
                    Selected Invoice
                  </span>
                  <p className="text-base font-bold text-stone-900 font-mono">
                    {invoice.invoiceNumber || invoice._id}
                  </p>
                  <p className="text-xs text-stone-600 mt-0.5">
                    Customer: <span className="font-semibold">{invoice.buyer?.name || invoice.customerSnapshot?.name || 'Customer'}</span>
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black uppercase tracking-wider text-stone-500">
                    Outstanding Balance
                  </span>
                  <p className="text-lg font-black text-amber-700">
                    {formatBillingMoney(outstandingMinor)}
                  </p>
                  <p className="text-[11px] text-stone-500">
                    Total: {formatBillingMoney(invoice.grandTotalMinor || 0)}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Select Issued Invoice <span className="text-rose-500">*</span>
              </label>
              <select
                value={invoiceId}
                onChange={(e) => setInvoiceId(e.target.value)}
                disabled={loadingInvoicesList}
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-stone-900 outline-none focus:border-amber-500"
              >
                <option value="">-- Choose an issued invoice --</option>
                {issuedInvoices.map((inv) => (
                  <option key={inv._id} value={inv._id}>
                    {inv.invoiceNumber || inv._id} — {inv.buyer?.name || 'Customer'} (Total: {formatBillingMoney(inv.grandTotalMinor || 0)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {loadingInvoice && <AdminLoadingState label="Loading invoice balance..." rows={2} compact />}
        </AdminPanel>

        <AdminPanel
          title="2. Payment Details"
          description="Enter transaction proof, payment method, and amount."
          icon={Banknote}
          bodyClassName="p-5 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-stone-700">
                  Amount Received (₹) <span className="text-rose-500">*</span>
                </label>
                {outstandingMinor > 0 && (
                  <button
                    type="button"
                    onClick={handleFillFullBalance}
                    className="text-[11px] font-bold text-amber-600 hover:text-amber-800 underline"
                  >
                    Pay Full Balance ({formatBillingMoney(outstandingMinor)})
                  </button>
                )}
              </div>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="e.g. 50000.00"
                value={amountRupees}
                onChange={(e) => setAmountRupees(e.target.value)}
                required
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-xs font-bold text-stone-900 outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Payment Method <span className="text-rose-500">*</span>
              </label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-stone-900 outline-none focus:border-amber-500"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Reference / UTR / Cheque Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. UTR1234567890 or CHQ-002931"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                required
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-xs font-mono text-stone-900 outline-none focus:border-amber-500"
              />
              <p className="mt-1 text-[11px] text-stone-500">
                Mandatory reference number for bank reconciliation.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Received Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={receivedAt}
                onChange={(e) => setReceivedAt(e.target.value)}
                required
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-xs font-medium text-stone-900 outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              Internal Notes (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Received via HDFC corporate account, confirmed by accounts clerk."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-xs text-stone-900 outline-none focus:border-amber-500"
            />
          </div>
        </AdminPanel>

        <div className="flex items-center justify-end gap-3">
          <Link
            to="/admin/payments"
            className="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-xs font-bold text-stone-700 hover:bg-stone-50 no-underline shadow-sm"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting || !invoiceId}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-xs font-bold text-stone-950 shadow-sm hover:bg-amber-400 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {submitting ? 'Recording Payment...' : 'Record Payment'}
          </button>
        </div>
      </form>
    </AdminPage>
  );
}
