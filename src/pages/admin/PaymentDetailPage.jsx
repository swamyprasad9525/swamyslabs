import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Clock,
  ExternalLink,
  History,
  RotateCcw,
  ShieldAlert,
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
  formatBillingDate,
  formatBillingMoney,
} from '../../lib/billing';
import {
  labelPaymentMethod,
  labelPaymentStatus,
  parsePaymentResponse,
  PAYMENT_STATUS_STYLES,
} from '../../lib/payment';

export default function PaymentDetailPage() {
  const { id } = useParams();
  const { authFetch, logout } = useAdmin();
  const navigate = useNavigate();

  const [payment, setPayment] = useState(null);
  const [events, setEvents] = useState([]);
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [busyAction, setBusyAction] = useState('');

  // Modal / prompt states
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showReverseModal, setShowReverseModal] = useState(false);
  const [reverseReason, setReverseReason] = useState('');

  const fetchPayment = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await authFetch(`/api/admin/payments/${encodeURIComponent(id)}`);
      if (response.status === 401) {
        logout();
        navigate('/admin/login', { replace: true });
        return;
      }
      const data = await parsePaymentResponse(response, 'Failed to load payment.');
      setPayment(data.payment);
      setEvents(data.events || []);
      setInvoice(data.invoice || null);
    } catch (err) {
      setError(err.message || 'Failed to load payment.');
    } finally {
      setLoading(false);
    }
  }, [authFetch, id, logout, navigate]);

  useEffect(() => {
    fetchPayment();
  }, [fetchPayment]);

  const handleConfirm = async () => {
    if (!window.confirm(`Are you sure you want to confirm this payment of ${formatBillingMoney(payment.amountMinor)}? This will atomically update the invoice balance.`)) {
      return;
    }
    setBusyAction('confirm');
    setError('');
    setActionSuccess('');
    try {
      const response = await authFetch(`/api/admin/payments/${encodeURIComponent(id)}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.status === 401) {
        logout();
        navigate('/admin/login', { replace: true });
        return;
      }
      const data = await parsePaymentResponse(response, 'Failed to confirm payment.');
      setPayment(data.payment);
      setActionSuccess('Payment confirmed successfully. Invoice payment status updated.');
      fetchPayment();
    } catch (err) {
      setError(err.message || 'Failed to confirm payment.');
    } finally {
      setBusyAction('');
    }
  };

  const handleReject = async (e) => {
    e.preventDefault();
    if (!rejectReason.trim()) {
      setError('A rejection reason is required.');
      return;
    }
    setBusyAction('reject');
    setError('');
    try {
      const response = await authFetch(`/api/admin/payments/${encodeURIComponent(id)}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      if (response.status === 401) {
        logout();
        navigate('/admin/login', { replace: true });
        return;
      }
      const data = await parsePaymentResponse(response, 'Failed to reject payment.');
      setPayment(data.payment);
      setShowRejectModal(false);
      setActionSuccess('Payment rejected.');
      fetchPayment();
    } catch (err) {
      setError(err.message || 'Failed to reject payment.');
    } finally {
      setBusyAction('');
    }
  };

  const handleReverse = async (e) => {
    e.preventDefault();
    if (!reverseReason.trim()) {
      setError('A reversal reason is required.');
      return;
    }
    setBusyAction('reverse');
    setError('');
    try {
      const response = await authFetch(`/api/admin/payments/${encodeURIComponent(id)}/reverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reverseReason.trim() }),
      });
      if (response.status === 401) {
        logout();
        navigate('/admin/login', { replace: true });
        return;
      }
      const data = await parsePaymentResponse(response, 'Failed to reverse payment.');
      setPayment(data.payment);
      setShowReverseModal(false);
      setActionSuccess('Payment reversed successfully. Outstanding balance restored on the invoice.');
      fetchPayment();
    } catch (err) {
      setError(err.message || 'Failed to reverse payment.');
    } finally {
      setBusyAction('');
    }
  };

  if (loading) {
    return (
      <AdminPage size="standard" className="space-y-6 pb-12">
        <AdminLoadingState label="Loading payment details..." rows={6} />
      </AdminPage>
    );
  }

  if (error && !payment) {
    return (
      <AdminPage size="standard" className="space-y-6 pb-12">
        <AdminFeedback tone="error" title="Failed to load payment" onRetry={fetchPayment}>
          {error}
        </AdminFeedback>
      </AdminPage>
    );
  }

  return (
    <AdminPage size="standard" className="space-y-6 pb-12">
      <Helmet>
        <title>{payment?.paymentNumber || 'Payment'} | Swamy Slabs Admin</title>
      </Helmet>

      <div>
        <Link
          to="/admin/payments"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-600 hover:text-stone-950 no-underline mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Payments
        </Link>
        <AdminPageHeader
          eyebrow="Commercial Payment Record"
          title={payment.paymentNumber}
          description={`Recorded on ${formatBillingDate(payment.createdAt)} by ${payment.recordedBy || 'admin'}.`}
          actions={
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide ${
                  PAYMENT_STATUS_STYLES[payment.status] || PAYMENT_STATUS_STYLES.PENDING_VERIFICATION
                }`}
              >
                {labelPaymentStatus(payment.status)}
              </span>

              {payment.status === 'PENDING_VERIFICATION' && (
                <>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={!!busyAction}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {busyAction === 'confirm' ? 'Confirming...' : 'Confirm Payment'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRejectModal(true)}
                    disabled={!!busyAction}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4" />
                    Reject
                  </button>
                </>
              )}

              {payment.status === 'CONFIRMED' && (
                <button
                  type="button"
                  onClick={() => setShowReverseModal(true)}
                  disabled={!!busyAction}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reverse Payment
                </button>
              )}
            </div>
          }
        />
      </div>

      {actionSuccess && (
        <AdminFeedback tone="success" title="Success">
          {actionSuccess}
        </AdminFeedback>
      )}

      {error && (
        <AdminFeedback tone="error" title="Error">
          {error}
        </AdminFeedback>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <AdminPanel
            title="Transaction Summary"
            icon={Banknote}
            bodyClassName="p-5 divide-y divide-stone-100"
          >
            <div className="flex justify-between py-2.5">
              <span className="text-xs font-bold text-stone-500">Amount Received</span>
              <span className="text-base font-black text-stone-950">
                {formatBillingMoney(payment.amountMinor)}
              </span>
            </div>
            <div className="flex justify-between py-2.5">
              <span className="text-xs font-bold text-stone-500">Payment Method</span>
              <span className="text-xs font-semibold text-stone-900">
                {labelPaymentMethod(payment.method)}
              </span>
            </div>
            <div className="flex justify-between py-2.5">
              <span className="text-xs font-bold text-stone-500">Reference / UTR</span>
              <span className="text-xs font-mono font-bold text-stone-900">
                {payment.referenceNumber || '—'}
              </span>
            </div>
            <div className="flex justify-between py-2.5">
              <span className="text-xs font-bold text-stone-500">Value Date (Received)</span>
              <span className="text-xs font-semibold text-stone-900">
                {formatBillingDate(payment.receivedAt)}
              </span>
            </div>
            {payment.notes && (
              <div className="py-2.5">
                <span className="text-xs font-bold text-stone-500 block mb-1">Notes</span>
                <p className="text-xs text-stone-700 bg-stone-50 p-2.5 rounded-lg border border-stone-200">
                  {payment.notes}
                </p>
              </div>
            )}
            {payment.status === 'REJECTED' && (
              <div className="py-2.5 bg-rose-50/50 -mx-5 px-5 rounded-b-lg">
                <span className="text-xs font-bold text-rose-700 block mb-1">Rejection Reason</span>
                <p className="text-xs text-rose-900">{payment.rejectionReason || 'No reason specified'}</p>
              </div>
            )}
            {payment.status === 'REVERSED' && (
              <div className="py-2.5 bg-stone-100/50 -mx-5 px-5 rounded-b-lg">
                <span className="text-xs font-bold text-stone-700 block mb-1">Reversal Reason</span>
                <p className="text-xs text-stone-900">{payment.reversalReason || 'No reason specified'}</p>
              </div>
            )}
          </AdminPanel>

          <AdminPanel
            title="Audit Trail & Events"
            description="Immutable log of transaction state changes."
            icon={History}
            bodyClassName="p-5"
          >
            {events.length === 0 ? (
              <p className="text-xs text-stone-500">No events recorded.</p>
            ) : (
              <ol className="relative border-l border-stone-200 ml-2 space-y-4">
                {events.map((ev) => (
                  <li key={ev._id || ev.occurredAt} className="ml-4">
                    <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-white bg-amber-500" />
                    <time className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
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

        <div className="space-y-6">
          <AdminPanel
            title="Linked Invoice"
            icon={ExternalLink}
            bodyClassName="p-5 space-y-3"
          >
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-stone-500">
                Invoice Number
              </span>
              <p className="text-base font-bold font-mono text-stone-950">
                {payment.invoiceNumber || '—'}
              </p>
              {payment.invoiceId && (
                <Link
                  to={`/admin/invoices/${payment.invoiceId}`}
                  className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:underline mt-1"
                >
                  View Invoice Details <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>

            <div className="border-t border-stone-100 pt-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-stone-500">
                Customer Name
              </span>
              <p className="text-xs font-bold text-stone-900">
                {payment.customerSnapshot?.name || 'Customer'}
              </p>
            </div>

            {invoice && (
              <div className="border-t border-stone-100 pt-3 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-stone-500">Grand Total:</span>
                  <span className="font-bold text-stone-900">
                    {formatBillingMoney(invoice.grandTotalMinor || 0)}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-stone-500">Total Confirmed:</span>
                  <span className="font-bold text-emerald-700">
                    {formatBillingMoney(invoice.paymentSummary?.confirmedMinor || 0)}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-stone-500">Outstanding:</span>
                  <span className="font-bold text-amber-700">
                    {formatBillingMoney(
                      Math.max(0, (invoice.grandTotalMinor || 0) - (invoice.paymentSummary?.confirmedMinor || 0))
                    )}
                  </span>
                </div>
              </div>
            )}
          </AdminPanel>
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-600" />
              Reject Payment Record
            </h3>
            <p className="mt-1 text-xs text-stone-600">
              Provide a reason for rejecting this payment (e.g. cheque bounced, UTR not received in bank statement).
            </p>
            <form onSubmit={handleReject} className="mt-4 space-y-4">
              <textarea
                required
                rows={3}
                placeholder="Reason for rejection..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full rounded-lg border border-stone-300 p-2 text-xs text-stone-900 outline-none focus:border-rose-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRejectModal(false)}
                  className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busyAction === 'reject'}
                  className="rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-50"
                >
                  {busyAction === 'reject' ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reverse Modal */}
      {showReverseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-amber-600" />
              Reverse Confirmed Payment
            </h3>
            <p className="mt-1 text-xs text-stone-600">
              This will deduct {formatBillingMoney(payment.amountMinor)} from the invoice's confirmed total and restore the outstanding balance.
            </p>
            <form onSubmit={handleReverse} className="mt-4 space-y-4">
              <textarea
                required
                rows={3}
                placeholder="Reason for reversal..."
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                className="w-full rounded-lg border border-stone-300 p-2 text-xs text-stone-900 outline-none focus:border-amber-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowReverseModal(false)}
                  className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busyAction === 'reverse'}
                  className="rounded-lg bg-stone-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-stone-800 disabled:opacity-50"
                >
                  {busyAction === 'reverse' ? 'Reversing...' : 'Confirm Reversal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminPage>
  );
}

