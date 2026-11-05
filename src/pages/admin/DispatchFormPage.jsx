import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Boxes,
  CheckCircle2,
  Package,
  Plus,
  Save,
  Truck,
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
  formatBillingNumber,
} from '../../lib/billing';
import {
  parseDispatchResponse,
  TRANSPORT_MODES,
} from '../../lib/dispatch';

export default function DispatchFormPage() {
  const [searchParams] = useSearchParams();
  const initialSalesOrderId = searchParams.get('salesOrderId') || '';
  const { authFetch, logout } = useAdmin();
  const navigate = useNavigate();

  const [salesOrderId, setSalesOrderId] = useState(initialSalesOrderId);
  const [salesOrder, setSalesOrder] = useState(null);
  const [salesOrdersList, setSalesOrdersList] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const [eligibleReservations, setEligibleReservations] = useState([]);
  const [loadingReservations, setLoadingReservations] = useState(false);
  const [selectedReservationIds, setSelectedReservationIds] = useState([]);

  // Transport details
  const [transportMode, setTransportMode] = useState('BY_LORRY');
  const [carrierName, setCarrierName] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [lrNumber, setLrNumber] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Fetch sales orders list for dropdown if not provided
  useEffect(() => {
    async function loadOrders() {
      setLoadingOrders(true);
      try {
        const res = await authFetch('/api/admin/sales-orders?status=CONFIRMED&limit=50');
        if (res.ok) {
          const data = await res.json();
          setSalesOrdersList(data.salesOrders || []);
        }
      } catch {
        // Non-critical dropdown prefetch
      } finally {
        setLoadingOrders(false);
      }
    }
    loadOrders();
  }, [authFetch]);

  // Fetch eligible reservations whenever salesOrderId changes
  const fetchEligibleReservations = useCallback(
    async (orderId) => {
      if (!orderId) {
        setEligibleReservations([]);
        setSelectedReservationIds([]);
        setSalesOrder(null);
        return;
      }
      setLoadingReservations(true);
      setError('');
      try {
        const [resResponse, orderResponse] = await Promise.all([
          authFetch(`/api/admin/dispatches/eligible-reservations?salesOrderId=${encodeURIComponent(orderId)}`),
          authFetch(`/api/admin/sales-orders/${encodeURIComponent(orderId)}`),
        ]);

        if (resResponse.status === 401 || orderResponse.status === 401) {
          logout();
          navigate('/admin/login', { replace: true });
          return;
        }

        const resData = await parseDispatchResponse(resResponse, 'Failed to load reservations.');
        const orderData = await orderResponse.json();

        setEligibleReservations(resData.eligibleReservations || []);
        // By default, pre-select all eligible reservations
        setSelectedReservationIds((resData.eligibleReservations || []).map((r) => r._id));
        setSalesOrder(orderData.salesOrder || null);
      } catch (err) {
        setError(err.message || 'Failed to load reservations.');
        setEligibleReservations([]);
        setSelectedReservationIds([]);
      } finally {
        setLoadingReservations(false);
      }
    },
    [authFetch, logout, navigate],
  );

  useEffect(() => {
    if (salesOrderId) {
      fetchEligibleReservations(salesOrderId);
    }
  }, [fetchEligibleReservations, salesOrderId]);

  const toggleReservation = (id) => {
    setSelectedReservationIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const selectAllReservations = () => {
    setSelectedReservationIds(eligibleReservations.map((r) => r._id));
  };

  const deselectAllReservations = () => {
    setSelectedReservationIds([]);
  };

  const selectedReservations = eligibleReservations.filter((r) =>
    selectedReservationIds.includes(r._id),
  );

  const totalSelectedSlabs = selectedReservations.reduce(
    (sum, r) => sum + (r.slabsCount || (r.slabIds ? r.slabIds.length : 0) || r.quantity || 0),
    0,
  );
  const totalSelectedArea = selectedReservations.reduce(
    (sum, r) => sum + (r.areaSqFt || 0),
    0,
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!salesOrderId) {
      setError('Please select a confirmed Sales Order.');
      return;
    }
    if (selectedReservationIds.length === 0) {
      setError('At least one active inventory reservation must be selected for dispatch.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const payload = {
        salesOrderId,
        reservationIds: selectedReservationIds,
        transport: {
          mode: transportMode,
          carrierName: carrierName.trim(),
          vehicleNumber: vehicleNumber.trim().toUpperCase(),
          driverName: driverName.trim(),
          driverPhone: driverPhone.trim(),
          lrNumber: lrNumber.trim(),
        },
        notes: notes.trim(),
      };

      const response = await authFetch('/api/admin/dispatches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.status === 401) {
        logout();
        navigate('/admin/login', { replace: true });
        return;
      }

      const data = await parseDispatchResponse(response, 'Failed to create dispatch draft.');
      navigate(`/admin/dispatch/${data.dispatch._id}`);
    } catch (err) {
      setError(err.message || 'Failed to create dispatch draft.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminPage size="standard" className="space-y-6 pb-12">
      <Helmet>
        <title>Prepare Dispatch | Swamy Slabs Admin</title>
      </Helmet>

      <div>
        <Link
          to="/admin/dispatch"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-600 hover:text-stone-950 no-underline mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Dispatches
        </Link>
        <AdminPageHeader
          eyebrow="Physical Logistics"
          title="Prepare Yard Dispatch"
          description="Select reserved stone slabs and log transport details before authorizing physical exit from the yard."
        />
      </div>

      {error && (
        <AdminFeedback tone="error" title="Submission Error">
          {error}
        </AdminFeedback>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <AdminPanel
          title="1. Sales Order Selection"
          description="Choose the confirmed sales order for which stone stock is being loaded."
          icon={Package}
          bodyClassName="p-5 space-y-4"
        >
          {initialSalesOrderId && salesOrder ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-800">
                Selected Sales Order
              </span>
              <p className="text-base font-bold font-mono text-stone-900">
                {salesOrder.salesOrderNumber || salesOrder._id}
              </p>
              <p className="text-xs text-stone-600 mt-0.5">
                Customer:{' '}
                <span className="font-semibold">
                  {salesOrder.customerSnapshot?.name || salesOrder.customerName || 'Customer'}
                </span>{' '}
                • Status: <span className="font-bold text-amber-700">{salesOrder.status}</span>
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Select Sales Order <span className="text-rose-500">*</span>
              </label>
              <select
                value={salesOrderId}
                onChange={(e) => setSalesOrderId(e.target.value)}
                disabled={loadingOrders}
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-stone-900 outline-none focus:border-amber-500"
              >
                <option value="">-- Choose a confirmed sales order --</option>
                {salesOrdersList.map((ord) => (
                  <option key={ord._id} value={ord._id}>
                    {ord.salesOrderNumber} — {ord.customerSnapshot?.name || 'Customer'}
                  </option>
                ))}
              </select>
            </div>
          )}
        </AdminPanel>

        <AdminPanel
          title="2. Select Reserved Inventory to Dispatch"
          description="Only active inventory reservations not currently assigned to another prepared dispatch are eligible."
          icon={Boxes}
          action={
            eligibleReservations.length > 0 && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAllReservations}
                  className="text-xs font-bold text-amber-600 hover:text-amber-800"
                >
                  Select All
                </button>
                <span className="text-stone-300">|</span>
                <button
                  type="button"
                  onClick={deselectAllReservations}
                  className="text-xs font-bold text-stone-500 hover:text-stone-700"
                >
                  Deselect All
                </button>
              </div>
            )
          }
          bodyClassName="p-0"
        >
          {loadingReservations ? (
            <AdminLoadingState label="Loading eligible reservations..." rows={3} />
          ) : !salesOrderId ? (
            <div className="p-8 text-center text-xs text-stone-500">
              Please select a sales order above to view reserved stone stock.
            </div>
          ) : eligibleReservations.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-xs font-bold text-stone-800">No dispatch-eligible reservations found.</p>
              <p className="text-xs text-stone-500 mt-1">
                Either stock has already been dispatched, or reservations are currently undergoing processing.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-stone-200 bg-stone-50 font-bold uppercase tracking-wider text-stone-600">
                  <tr>
                    <th className="px-4 py-3 w-10">Select</th>
                    <th className="px-4 py-3">Batch Number</th>
                    <th className="px-4 py-3">Stone & Surface</th>
                    <th className="px-4 py-3">Thickness</th>
                    <th className="px-4 py-3">Slabs Count</th>
                    <th className="px-4 py-3">Reserved Area</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 font-medium text-stone-700">
                  {eligibleReservations.map((r) => {
                    const isChecked = selectedReservationIds.includes(r._id);
                    return (
                      <tr
                        key={r._id}
                        onClick={() => toggleReservation(r._id)}
                        className={`cursor-pointer transition ${
                          isChecked ? 'bg-amber-50/60 font-semibold' : 'hover:bg-stone-50'
                        }`}
                      >
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleReservation(r._id)}
                            className="h-4 w-4 rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                          />
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-stone-950">
                          {r.batchSnapshot?.batchNumber || '—'}
                        </td>
                        <td className="px-4 py-3 font-bold text-stone-900">
                          {r.batchSnapshot?.stoneName || 'Stone'}
                          {r.batchSnapshot?.surfaceFinish && (
                            <span className="text-[11px] font-normal text-stone-500 block">
                              Finish: {r.batchSnapshot.surfaceFinish}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {r.batchSnapshot?.thicknessMm ? `${r.batchSnapshot.thicknessMm} mm` : '—'}
                        </td>
                        <td className="px-4 py-3 font-bold text-stone-950">
                          {r.slabsCount || (r.slabIds ? r.slabIds.length : 0) || r.quantity || 0}
                        </td>
                        <td className="px-4 py-3 font-mono">
                          {formatBillingNumber(r.areaSqFt || 0)} sq.ft
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="flex items-center justify-between border-t border-stone-200 bg-stone-50/70 px-4 py-3 text-xs">
                <span className="font-bold text-stone-600">
                  Selected for Dispatch: {selectedReservations.length} of {eligibleReservations.length} reservations
                </span>
                <span className="font-mono font-bold text-stone-900">
                  {totalSelectedSlabs} slabs ({formatBillingNumber(totalSelectedArea)} sq.ft)
                </span>
              </div>
            </div>
          )}
        </AdminPanel>

        <AdminPanel
          title="3. Transport & Carrier Logistics"
          description="Enter vehicle, transporter, and driver details for gate verification."
          icon={Truck}
          bodyClassName="p-5 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Transport Mode <span className="text-rose-500">*</span>
              </label>
              <select
                value={transportMode}
                onChange={(e) => setTransportMode(e.target.value)}
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-stone-900 outline-none focus:border-amber-500"
              >
                {TRANSPORT_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Vehicle / Lorry Number
              </label>
              <input
                type="text"
                placeholder="e.g. AP21TC1234"
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-xs font-mono uppercase text-stone-900 outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Transporter / Carrier Name
              </label>
              <input
                type="text"
                placeholder="e.g. VRL Logistics or Balaji Transport"
                value={carrierName}
                onChange={(e) => setCarrierName(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-xs text-stone-900 outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Lorry Receipt (LR) / Bilty #
              </label>
              <input
                type="text"
                placeholder="e.g. LR-98214"
                value={lrNumber}
                onChange={(e) => setLrNumber(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-xs font-mono text-stone-900 outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Driver Name
              </label>
              <input
                type="text"
                placeholder="Driver's full name"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-xs text-stone-900 outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Driver Contact Phone
              </label>
              <input
                type="tel"
                placeholder="e.g. 9848012345"
                value={driverPhone}
                onChange={(e) => setDriverPhone(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-xs text-stone-900 outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              Dispatch Instructions / Notes
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Strapping inspected, loaded in Lorry Bed #2 with wooden edge protectors."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-xs text-stone-900 outline-none focus:border-amber-500"
            />
          </div>
        </AdminPanel>

        <div className="flex items-center justify-end gap-3">
          <Link
            to="/admin/dispatch"
            className="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-xs font-bold text-stone-700 hover:bg-stone-50 no-underline shadow-sm"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting || !salesOrderId || selectedReservationIds.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-xs font-bold text-stone-950 shadow-sm hover:bg-amber-400 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {submitting ? 'Creating Dispatch Draft...' : 'Create Dispatch Draft'}
          </button>
        </div>
      </form>
    </AdminPage>
  );
}

