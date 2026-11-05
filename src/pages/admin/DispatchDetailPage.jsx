import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Boxes,
  CheckCircle2,
  Clock,
  ExternalLink,
  History,
  PackageCheck,
  Printer,
  ShieldAlert,
  Truck,
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
  formatBillingNumber,
} from '../../lib/billing';
import {
  DISPATCH_STATUS_STYLES,
  labelDispatchStatus,
  labelTransportMode,
  parseDispatchResponse,
} from '../../lib/dispatch';

export default function DispatchDetailPage() {
  const { id } = useParams();
  const { authFetch, logout } = useAdmin();
  const navigate = useNavigate();

  const [dispatch, setDispatch] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [busyAction, setBusyAction] = useState('');

  // Cancel modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Confirm Physical Dispatch modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const fetchDispatch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await authFetch(`/api/admin/dispatches/${encodeURIComponent(id)}`);
      if (response.status === 401) {
        logout();
        navigate('/admin/login', { replace: true });
        return;
      }
      const data = await parseDispatchResponse(response, 'Failed to load dispatch record.');
      setDispatch(data.dispatch);
      setEvents(data.events || []);
    } catch (err) {
      setError(err.message || 'Failed to load dispatch record.');
    } finally {
      setLoading(false);
    }
  }, [authFetch, id, logout, navigate]);

  useEffect(() => {
    fetchDispatch();
  }, [fetchDispatch]);

  const handleMarkReady = async () => {
    setBusyAction('ready');
    setError('');
    setActionSuccess('');
    try {
      const response = await authFetch(`/api/admin/dispatches/${encodeURIComponent(id)}/ready`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.status === 401) {
        logout();
        navigate('/admin/login', { replace: true });
        return;
      }
      const data = await parseDispatchResponse(response, 'Failed to mark dispatch ready.');
      setDispatch(data.dispatch);
      setActionSuccess('Dispatch marked as Ready to Dispatch. Vehicle loading authorized.');
      fetchDispatch();
    } catch (err) {
      setError(err.message || 'Failed to mark dispatch ready.');
    } finally {
      setBusyAction('');
    }
  };

  const handleConfirmPhysicalDispatch = async () => {
    setBusyAction('confirm');
    setError('');
    setActionSuccess('');
    try {
      const response = await authFetch(`/api/admin/dispatches/${encodeURIComponent(id)}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.status === 401) {
        logout();
        navigate('/admin/login', { replace: true });
        return;
      }
      const data = await parseDispatchResponse(response, 'Failed to confirm physical dispatch.');
      setDispatch(data.dispatch);
      setShowConfirmModal(false);
      setActionSuccess(
        `Physical dispatch confirmed! Gate Pass #${data.dispatch.gatePassNumber} issued. Inventory stock deducted and movement logged.`,
      );
      fetchDispatch();
    } catch (err) {
      setError(err.message || 'Failed to confirm physical dispatch.');
    } finally {
      setBusyAction('');
    }
  };

  const handleCancelDispatch = async (e) => {
    e.preventDefault();
    if (!cancelReason.trim()) {
      setError('A cancellation reason is required.');
      return;
    }
    setBusyAction('cancel');
    setError('');
    try {
      const response = await authFetch(`/api/admin/dispatches/${encodeURIComponent(id)}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      if (response.status === 401) {
        logout();
        navigate('/admin/login', { replace: true });
        return;
      }
      const data = await parseDispatchResponse(response, 'Failed to cancel dispatch.');
      setDispatch(data.dispatch);
      setShowCancelModal(false);
      setActionSuccess('Dispatch cancelled. Inventory reservations released back to active order pool.');
      fetchDispatch();
    } catch (err) {
      setError(err.message || 'Failed to cancel dispatch.');
    } finally {
      setBusyAction('');
    }
  };

  if (loading) {
    return (
      <AdminPage size="standard" className="space-y-6 pb-12">
        <AdminLoadingState label="Loading dispatch record..." rows={6} />
      </AdminPage>
    );
  }

  if (error && !dispatch) {
    return (
      <AdminPage size="standard" className="space-y-6 pb-12">
        <AdminFeedback tone="error" title="Failed to load dispatch" onRetry={fetchDispatch}>
          {error}
        </AdminFeedback>
      </AdminPage>
    );
  }

  return (
    <AdminPage size="standard" className="space-y-6 pb-12">
      <Helmet>
        <title>
          {dispatch?.gatePassNumber || dispatch?.dispatchNumber || 'Dispatch'} | Swamy Slabs Admin
        </title>
      </Helmet>

      <div>
        <Link
          to="/admin/dispatch"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-600 hover:text-stone-950 no-underline mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Dispatches
        </Link>
        <AdminPageHeader
          eyebrow="Physical Logistics & Gate Pass"
          title={dispatch.gatePassNumber || dispatch.dispatchNumber}
          description={`Created on ${formatBillingDate(dispatch.createdAt)} for Sales Order ${
            dispatch.salesOrderNumber || ''
          }.`}
          actions={
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide ${
                  DISPATCH_STATUS_STYLES[dispatch.status] || DISPATCH_STATUS_STYLES.DRAFT
                }`}
              >
                {labelDispatchStatus(dispatch.status)}
              </span>

              {dispatch.status === 'DRAFT' && (
                <>
                  <button
                    type="button"
                    onClick={handleMarkReady}
                    disabled={!!busyAction}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-stone-950 shadow-sm hover:bg-amber-400 disabled:opacity-50"
                  >
                    <PackageCheck className="h-4 w-4" />
                    {busyAction === 'ready' ? 'Updating...' : 'Mark Ready to Dispatch'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCancelModal(true)}
                    disabled={!!busyAction}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4" />
                    Cancel Draft
                  </button>
                </>
              )}

              {dispatch.status === 'READY_TO_DISPATCH' && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowConfirmModal(true)}
                    disabled={!!busyAction}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Confirm Physical Dispatch
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCancelModal(true)}
                    disabled={!!busyAction}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4" />
                    Cancel Dispatch
                  </button>
                </>
              )}

              {dispatch.status === 'DISPATCHED' && (
                <Link
                  to={`/admin/dispatch/${dispatch._id}/print`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-stone-950 px-4 py-2 text-xs font-bold text-amber-400 shadow-sm hover:bg-stone-800 no-underline"
                >
                  <Printer className="h-4 w-4 text-amber-400" />
                  Print Gate Pass
                </Link>
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
            title="Dispatched Stone Slabs"
            description="Itemized stone inventory allocated and released from yard batches."
            icon={Boxes}
            bodyClassName="p-0"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-stone-200 bg-stone-50 font-bold uppercase tracking-wider text-stone-600">
                  <tr>
                    <th className="px-4 py-3">Batch Number</th>
                    <th className="px-4 py-3">Stone & Surface</th>
                    <th className="px-4 py-3">Thickness</th>
                    <th className="px-4 py-3">Slabs</th>
                    <th className="px-4 py-3">Area (Sq.Ft)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 font-medium text-stone-700">
                  {(dispatch.items || []).map((item, idx) => (
                    <tr key={item.reservationId || idx} className="hover:bg-stone-50/60">
                      <td className="px-4 py-3 font-mono font-bold text-stone-950">
                        {item.batchSnapshot?.batchNumber || '—'}
                      </td>
                      <td className="px-4 py-3 font-bold text-stone-900">
                        {item.batchSnapshot?.stoneName || 'Stone'}
                        {item.batchSnapshot?.surfaceFinish && (
                          <span className="text-[11px] font-normal text-stone-500 block">
                            Finish: {item.batchSnapshot.surfaceFinish}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {item.batchSnapshot?.thicknessMm ? `${item.batchSnapshot.thicknessMm} mm` : '—'}
                      </td>
                      <td className="px-4 py-3 font-bold text-stone-950">{item.slabsCount || 0}</td>
                      <td className="px-4 py-3 font-mono">
                        {formatBillingNumber(item.areaSqFt || 0)} sq.ft
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex items-center justify-between border-t border-stone-200 bg-stone-50/80 px-4 py-3 text-xs">
                <span className="font-bold text-stone-600">Total Slabs & Area</span>
                <span className="font-mono font-bold text-stone-950 text-sm">
                  {dispatch.totalSlabsCount || (dispatch.items || []).reduce((s, i) => s + (i.slabsCount || 0), 0)} slabs •{' '}
                  {formatBillingNumber(dispatch.totalAreaSqFt || 0)} sq.ft
                </span>
              </div>
            </div>
          </AdminPanel>

          <AdminPanel
            title="Transport & Gate Logistics"
            icon={Truck}
            bodyClassName="p-5 divide-y divide-stone-100"
          >
            <div className="flex justify-between py-2.5">
              <span className="text-xs font-bold text-stone-500">Transport Mode</span>
              <span className="text-xs font-semibold text-stone-900">
                {labelTransportMode(dispatch.transport?.mode)}
              </span>
            </div>
            <div className="flex justify-between py-2.5">
              <span className="text-xs font-bold text-stone-500">Vehicle / Lorry #</span>
              <span className="text-xs font-mono font-bold text-stone-950">
                {dispatch.transport?.vehicleNumber || 'Not specified'}
              </span>
            </div>
            <div className="flex justify-between py-2.5">
              <span className="text-xs font-bold text-stone-500">Carrier / Transporter</span>
              <span className="text-xs font-semibold text-stone-900">
                {dispatch.transport?.carrierName || 'Not specified'}
              </span>
            </div>
            <div className="flex justify-between py-2.5">
              <span className="text-xs font-bold text-stone-500">LR / Bilty Number</span>
              <span className="text-xs font-mono text-stone-900">
                {dispatch.transport?.lrNumber || '—'}
              </span>
            </div>
            <div className="flex justify-between py-2.5">
              <span className="text-xs font-bold text-stone-500">Driver Details</span>
              <span className="text-xs text-stone-900">
                {dispatch.transport?.driverName || '—'}{' '}
                {dispatch.transport?.driverPhone && `(${dispatch.transport.driverPhone})`}
              </span>
            </div>
            {dispatch.notes && (
              <div className="py-2.5">
                <span className="text-xs font-bold text-stone-500 block mb-1">Gate / Loading Notes</span>
                <p className="text-xs text-stone-700 bg-stone-50 p-2.5 rounded-lg border border-stone-200">
                  {dispatch.notes}
                </p>
              </div>
            )}
          </AdminPanel>

          <AdminPanel
            title="Audit Trail & Logistics Events"
            description="Immutable log of physical dispatch transitions."
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
            title="Commercial Order Link"
            icon={ExternalLink}
            bodyClassName="p-5 space-y-3"
          >
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-stone-500">
                Sales Order
              </span>
              <p className="text-base font-bold font-mono text-stone-950">
                {dispatch.salesOrderNumber || '—'}
              </p>
              {dispatch.salesOrderId && (
                <Link
                  to={`/admin/sales-orders/${dispatch.salesOrderId}`}
                  className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:underline mt-1"
                >
                  View Sales Order <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>

            <div className="border-t border-stone-100 pt-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-stone-500">
                Customer Name
              </span>
              <p className="text-xs font-bold text-stone-900">
                {dispatch.customerSnapshot?.name || 'Customer'}
              </p>
            </div>

            <div className="border-t border-stone-100 pt-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-stone-500">
                Delivery Location
              </span>
              <p className="text-xs text-stone-700">
                {dispatch.customerSnapshot?.deliveryAddress || dispatch.customerSnapshot?.billingAddress || 'Betamcherla Yard Pickup'}
              </p>
            </div>

            {dispatch.status === 'DISPATCHED' && (
              <div className="border-t border-stone-100 pt-3 bg-emerald-50/60 -mx-5 -mb-5 p-5 rounded-b-xl border-t border-emerald-200">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 block">
                  Dispatched Timestamp
                </span>
                <p className="text-xs font-bold text-emerald-950">
                  {formatBillingDate(dispatch.dispatchedAt)} at {new Date(dispatch.dispatchedAt).toLocaleTimeString()}
                </p>
                <p className="text-[11px] text-emerald-800 mt-1">
                  Dispatched by: <span className="font-semibold">{dispatch.dispatchedBy || 'admin'}</span>
                </p>
              </div>
            )}
          </AdminPanel>
        </div>
      </div>

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-600" />
              Cancel Dispatch
            </h3>
            <p className="mt-1 text-xs text-stone-600">
              Provide a reason for cancelling this dispatch. All assigned reservations will be released back to the sales order.
            </p>
            <form onSubmit={handleCancelDispatch} className="mt-4 space-y-4">
              <textarea
                required
                rows={3}
                placeholder="Reason for cancellation..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full rounded-lg border border-stone-300 p-2 text-xs text-stone-900 outline-none focus:border-rose-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-50"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={busyAction === 'cancel'}
                  className="rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-50"
                >
                  {busyAction === 'cancel' ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Physical Dispatch Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl border border-stone-200">
            <div className="flex items-center gap-3 text-emerald-700">
              <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-stone-900">Authorize Physical Gate Exit</h3>
                <p className="text-xs text-stone-500">Confirm physical departure of stone slabs from the yard</p>
              </div>
            </div>

            <div className="mt-4 rounded-lg bg-amber-50/80 p-3.5 border border-amber-200 text-xs text-amber-900 space-y-1.5">
              <p className="font-bold flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                This action is irreversible and executes an atomic multi-document transaction:
              </p>
              <ul className="list-disc list-inside space-y-1 pl-1 text-amber-800">
                <li>Deducts physical stone inventory on-hand & reserved balances.</li>
                <li>Depletes individual slab records and consumes reservations.</li>
                <li>Generates an immutable gate pass and audit movement record.</li>
                <li>Recalculates Sales Order fulfillment percentages.</li>
              </ul>
            </div>

            <div className="mt-4 rounded-lg bg-stone-50 p-3 border border-stone-200 text-xs divide-y divide-stone-200">
              <div className="flex justify-between py-1.5">
                <span className="text-stone-500">Vehicle:</span>
                <span className="font-mono font-bold text-stone-900">
                  {dispatch.transport?.vehicleNumber || 'Self-Pickup / Lorry'}
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-stone-500">Total Slabs to Deplete:</span>
                <span className="font-bold text-stone-950">
                  {dispatch.totalSlabsCount || (dispatch.items || []).reduce((s, i) => s + (i.slabsCount || 0), 0)} slabs
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-stone-500">Total Area to Deplete:</span>
                <span className="font-mono font-bold text-stone-950">
                  {formatBillingNumber(dispatch.totalAreaSqFt || 0)} sq.ft
                </span>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPhysicalDispatch}
                disabled={busyAction === 'confirm'}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                {busyAction === 'confirm' ? 'Confirming Dispatch...' : 'Confirm Physical Dispatch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminPage>
  );
}

