import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Boxes,
  CircleDollarSign,
  Layers3,
  MapPin,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  SquareStack,
  Warehouse,
} from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { getAllStones } from '../../lib/catalog';
import {
  batchAreaOnHand,
  batchInventoryMode,
  batchQuantityOnHand,
  batchStone,
  formatInventoryCurrency,
  formatInventoryDate,
  formatInventoryLocation,
  formatInventoryNumber,
  INVENTORY_STATUSES,
  INVENTORY_STATUS_STYLES,
  labelInventoryStatus,
  parseInventoryResponse,
} from '../../lib/inventory';

const PAGE_SIZE = 20;
const EMPTY_FILTERS = Object.freeze({ search: '', stone: '', finish: '', status: '', warehouse: '' });

function MetricCard({ label, value, detail, icon }) {
  const Icon = icon;
  return (
    <article className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-stone-500">{label}</p>
          <p className="mt-3 break-words text-2xl font-black tabular-nums text-stone-950">{value}</p>
          {detail && <p className="mt-1 text-[11px] leading-4 text-stone-500">{detail}</p>}
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-amber-100 bg-amber-50 text-amber-800" aria-hidden="true">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </article>
  );
}

function InventorySkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading inventory">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-xl border border-stone-200 bg-white" />)}
      </div>
      <div className="h-96 animate-pulse rounded-xl border border-stone-200 bg-white" />
    </div>
  );
}

export default function InventoryPage() {
  const { authFetch, logout } = useAdmin();
  const navigate = useNavigate();
  const catalog = useMemo(
    () => getAllStones().slice().sort((left, right) => left.name.localeCompare(right.name)),
    [],
  );
  const finishOptions = useMemo(
    () => [...new Set(catalog.flatMap((stone) => stone.finishes || []).filter(Boolean))].sort(),
    [catalog],
  );
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [batches, setBatches] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadInventory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      const [summaryResponse, batchesResponse] = await Promise.all([
        authFetch('/api/admin/inventory/summary'),
        authFetch(`/api/admin/inventory/batches?${params.toString()}`),
      ]);
      if (summaryResponse.status === 401 || batchesResponse.status === 401) {
        logout();
        navigate('/admin/login', { replace: true });
        return;
      }
      const [summaryData, batchData] = await Promise.all([
        parseInventoryResponse(summaryResponse, 'Unable to load inventory summary.'),
        parseInventoryResponse(batchesResponse, 'Unable to load inventory batches.'),
      ]);
      setMetrics(summaryData.metrics || summaryData.summary || {});
      setBatches(Array.isArray(batchData.batches) ? batchData.batches : []);
      setTotal(Number(batchData.total) || 0);
      setPages(Math.max(1, Number(batchData.pages) || 1));
    } catch (requestError) {
      setError(requestError.message || 'Unable to load inventory.');
    } finally {
      setLoading(false);
    }
  }, [authFetch, filters, logout, navigate, page]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  function submitFilters(event) {
    event.preventDefault();
    setPage(1);
    setFilters({
      search: draftFilters.search.trim(),
      stone: draftFilters.stone,
      finish: draftFilters.finish.trim(),
      status: draftFilters.status,
      warehouse: draftFilters.warehouse.trim(),
    });
  }

  function resetFilters() {
    setDraftFilters(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  const updateDraft = (field) => (event) => {
    setDraftFilters((current) => ({ ...current, [field]: event.target.value }));
  };

  const costValues = Array.isArray(metrics?.inventoryCostValues) ? metrics.inventoryCostValues : [];
  const activeFilters = Object.values(filters).filter(Boolean).length;

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-6">
      <Helmet>
        <title>Inventory | Swamy Slabs Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">Physical material control</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-stone-950 sm:text-3xl">Batch Inventory</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">Auditable batch and slab availability from persisted inventory records.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={loadInventory} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-xs font-bold text-stone-700 hover:bg-stone-50 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh
          </button>
          <Link to="/admin/inventory/batches/new" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-stone-950 px-4 text-xs font-black text-white no-underline hover:bg-stone-800">
            <Plus className="h-4 w-4" aria-hidden="true" /> New batch
          </Link>
        </div>
      </div>

      {error && !metrics ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
          <div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><div><p className="font-black">Inventory unavailable</p><p className="mt-1">{error}</p></div></div>
          <button type="button" onClick={loadInventory} className="mt-4 rounded-lg bg-rose-800 px-4 py-2 text-xs font-bold text-white">Try again</button>
        </div>
      ) : loading && !metrics ? (
        <InventorySkeleton />
      ) : (
        <>
          {error && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Latest refresh failed. Showing the last loaded inventory. {error}</div>}

          <section aria-label="Inventory summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <MetricCard label="Active batches" value={formatInventoryNumber(metrics?.activeBatches, { maximumFractionDigits: 0 })} icon={Boxes} />
            <MetricCard label="Available batches" value={formatInventoryNumber(metrics?.availableBatches, { maximumFractionDigits: 0 })} icon={PackageCheck} />
            <MetricCard
              label="Recorded available area"
              value={metrics?.totalAvailableSqFt == null ? 'Not recorded' : `${formatInventoryNumber(metrics.totalAvailableSqFt)} sq.ft`}
              detail={metrics?.availableAreaTrackedBatches > 0 ? `${metrics.availableAreaTrackedBatches} available batch${metrics.availableAreaTrackedBatches === 1 ? '' : 'es'} with recorded area.` : 'Missing batch area is not inferred.'}
              icon={Layers3}
            />
            <MetricCard label="Individual slabs" value={formatInventoryNumber(metrics?.individualSlabs, { maximumFractionDigits: 0 })} icon={SquareStack} />
            <MetricCard
              label="Depleted / zero stock"
              value={formatInventoryNumber(metrics?.depletedOrZeroStockBatches, { maximumFractionDigits: 0 })}
              detail="No low-stock threshold is inferred."
              icon={Warehouse}
            />
            <MetricCard
              label="Inventory cost value"
              value={costValues.length ? costValues.map((item) => formatInventoryCurrency(item.amount, item.currency)).join(' · ') : 'Not available'}
              detail={costValues.length ? costValues.map((item) => `${item.batches || 0} batch${Number(item.batches) === 1 ? '' : 'es'} in ${item.currency}`).join(' · ') : 'Shown only where verified cost exists.'}
              icon={CircleDollarSign}
            />
          </section>

          <form onSubmit={submitFilters} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-stone-500" aria-hidden="true" /><h2 className="text-sm font-black text-stone-900">Find inventory</h2></div>
              {activeFilters > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black text-amber-900">{activeFilters} active</span>}
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(13rem,1.2fr)_minmax(12rem,1fr)_minmax(10rem,.8fr)_minmax(9rem,.7fr)_minmax(10rem,.8fr)_auto]">
              <label className="block text-xs font-bold text-stone-600">Search
                <span className="relative mt-1.5 block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" /><input maxLength={120} value={draftFilters.search} onChange={updateDraft('search')} placeholder="Batch, stone or lot" className="w-full rounded-lg border border-stone-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200" /></span>
              </label>
              <label className="block text-xs font-bold text-stone-600">Stone
                <select value={draftFilters.stone} onChange={updateDraft('stone')} className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200">
                  <option value="">All stones</option>
                  {catalog.map((stone) => <option key={stone.slug} value={stone.slug}>{stone.name}</option>)}
                </select>
              </label>
              <label className="block text-xs font-bold text-stone-600">Finish
                <input list="inventory-finishes" maxLength={120} value={draftFilters.finish} onChange={updateDraft('finish')} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200" />
                <datalist id="inventory-finishes">{finishOptions.map((finish) => <option key={finish} value={finish} />)}</datalist>
              </label>
              <label className="block text-xs font-bold text-stone-600">Status
                <select value={draftFilters.status} onChange={updateDraft('status')} className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200">
                  <option value="">All statuses</option>
                  {INVENTORY_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                </select>
              </label>
              <label className="block text-xs font-bold text-stone-600">Warehouse
                <input maxLength={120} value={draftFilters.warehouse} onChange={updateDraft('warehouse')} placeholder="Exact or partial name" className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200" />
              </label>
              <div className="flex items-end gap-2">
                <button type="submit" className="min-h-11 flex-1 rounded-lg bg-stone-950 px-4 text-xs font-black text-white hover:bg-stone-800">Apply</button>
                {activeFilters > 0 && <button type="button" onClick={resetFilters} className="min-h-11 rounded-lg border border-stone-300 px-3 text-xs font-bold text-stone-600 hover:bg-stone-50">Clear</button>}
              </div>
            </div>
          </form>

          <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm" aria-busy={loading}>
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 sm:px-5">
              <div><h2 className="text-sm font-black text-stone-950">Inventory batches</h2><p className="mt-0.5 text-xs text-stone-500">{total.toLocaleString('en-IN')} matching record{total === 1 ? '' : 's'}</p></div>
              {loading && <RefreshCw className="h-4 w-4 animate-spin text-amber-700" aria-label="Refreshing" />}
            </div>
            {!loading && batches.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <Boxes className="mx-auto h-8 w-8 text-stone-300" aria-hidden="true" />
                <h3 className="mt-3 font-black text-stone-900">{activeFilters ? 'No matching batches' : 'No inventory batches yet'}</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-500">{activeFilters ? 'Change or clear the filters to search again.' : 'Create a batch only when verified physical inventory is ready to record.'}</p>
              </div>
            ) : (
              <>
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full border-collapse text-left">
                    <thead className="bg-stone-50 text-[10px] font-black uppercase tracking-[0.1em] text-stone-500"><tr><th className="px-5 py-3">Batch / Stone</th><th className="px-4 py-3">Specification</th><th className="px-4 py-3">On hand</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Updated</th><th className="px-5 py-3 text-right">Action</th></tr></thead>
                    <tbody className="divide-y divide-stone-100">
                      {batches.map((batch) => {
                        const stone = batchStone(batch);
                        return (
                          <tr key={batch._id} className="hover:bg-stone-50/70">
                            <td className="px-5 py-4"><Link to={`/admin/inventory/batches/${batch._id}`} className="font-mono text-xs font-black text-amber-800 hover:underline">{batch.batchNumber}</Link><p className="mt-1 max-w-xs truncate text-sm font-bold text-stone-900">{stone.name || 'Stone not recorded'}</p></td>
                            <td className="px-4 py-4 text-xs text-stone-600"><p>{batch.finish || 'Finish not recorded'}</p><p className="mt-1 text-stone-400">{batch.thicknessMm != null ? `${formatInventoryNumber(batch.thicknessMm)} mm` : 'Thickness not recorded'}</p></td>
                            <td className="px-4 py-4 text-xs text-stone-700"><p className="font-black tabular-nums">{formatInventoryNumber(batchQuantityOnHand(batch), { maximumFractionDigits: 0 })} {batchInventoryMode(batch) === 'INDIVIDUAL_SLAB' ? 'slabs' : 'units'}</p><p className="mt-1 text-stone-500">{batchAreaOnHand(batch) == null ? 'Area not recorded' : `${formatInventoryNumber(batchAreaOnHand(batch))} sq.ft`}</p></td>
                            <td className="px-4 py-4 text-xs text-stone-600"><span className="inline-flex max-w-48 items-start gap-1.5"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden="true" /><span>{batchInventoryMode(batch) === 'INDIVIDUAL_SLAB' ? 'Tracked per slab' : formatInventoryLocation(batch.location)}</span></span></td>
                            <td className="px-4 py-4"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${INVENTORY_STATUS_STYLES[batch.status] || INVENTORY_STATUS_STYLES.DRAFT}`}>{labelInventoryStatus(batch.status)}</span></td>
                            <td className="px-4 py-4 text-xs text-stone-500">{formatInventoryDate(batch.updatedAt)}</td>
                            <td className="px-5 py-4 text-right"><Link to={`/admin/inventory/batches/${batch._id}`} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-stone-200 px-3 text-xs font-black text-stone-700 hover:border-amber-300 hover:bg-amber-50">Open <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="divide-y divide-stone-100 lg:hidden">
                  {batches.map((batch) => {
                    const stone = batchStone(batch);
                    return (
                      <Link key={batch._id} to={`/admin/inventory/batches/${batch._id}`} className="block p-4 no-underline hover:bg-stone-50">
                        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-xs font-black text-amber-800">{batch.batchNumber}</p><h3 className="mt-1 truncate text-sm font-black text-stone-950">{stone.name || 'Stone not recorded'}</h3></div><span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-black uppercase ${INVENTORY_STATUS_STYLES[batch.status] || INVENTORY_STATUS_STYLES.DRAFT}`}>{labelInventoryStatus(batch.status)}</span></div>
                        <div className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><p className="text-stone-400">On hand</p><p className="mt-1 font-bold text-stone-700">{formatInventoryNumber(batchQuantityOnHand(batch), { maximumFractionDigits: 0 })} / {batchAreaOnHand(batch) == null ? 'No area' : `${formatInventoryNumber(batchAreaOnHand(batch))} sq.ft`}</p></div><div><p className="text-stone-400">Location</p><p className="mt-1 font-bold text-stone-700">{batchInventoryMode(batch) === 'INDIVIDUAL_SLAB' ? 'Tracked per slab' : formatInventoryLocation(batch.location)}</p></div></div>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </section>

          {!loading && batches.length > 0 && (
            <div className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-semibold text-stone-500">Page {page} of {pages} · {total.toLocaleString('en-IN')} total</p>
              <div className="flex gap-2"><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-stone-300 px-3 text-xs font-bold text-stone-700 disabled:opacity-40"><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Previous</button><button type="button" onClick={() => setPage((value) => Math.min(pages, value + 1))} disabled={page >= pages} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-stone-300 px-3 text-xs font-bold text-stone-700 disabled:opacity-40">Next <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></button></div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
