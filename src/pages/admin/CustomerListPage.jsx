import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  ExternalLink,
  RefreshCw,
  Search,
  UsersRound,
} from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { formatCrmDate, parseAdminJsonResponse } from '../../lib/crm';

const PAGE_SIZE = 20;

function sourceLeadId(sourceLead) {
  return typeof sourceLead === 'object' ? sourceLead?._id : sourceLead;
}

export default function CustomerListPage() {
  const { authFetch, logout } = useAdmin();
  const [customers, setCustomers] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [draftSearch, setDraftSearch] = useState('');
  const [search, setSearch] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (search) params.set('search', search);
      const response = await authFetch(`/api/admin/customers?${params.toString()}`);
      if (response.status === 401) {
        logout();
        return;
      }
      const data = await parseAdminJsonResponse(response, 'Unable to load customers.');
      setCustomers(Array.isArray(data.customers) ? data.customers : []);
      setTotal(Number(data.total) || 0);
      setPages(Math.max(1, Number(data.pages) || 1));
    } catch (requestError) {
      setError(requestError.message || 'Unable to load customers.');
    } finally {
      setLoading(false);
    }
  }, [authFetch, logout, page, search]);

  useEffect(() => {
    void refreshKey;
    fetchCustomers();
  }, [fetchCustomers, refreshKey]);

  function submitSearch(event) {
    event.preventDefault();
    setPage(1);
    setSearch(draftSearch.trim());
    setRefreshKey((value) => value + 1);
  }

  function clearSearch() {
    setDraftSearch('');
    setSearch('');
    setPage(1);
    setRefreshKey((value) => value + 1);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-amber-700">
            <UsersRound className="h-4 w-4" aria-hidden="true" /> Customer directory
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-stone-950 sm:text-3xl">Customers</h1>
          <p className="mt-1 text-sm text-stone-500">Qualified leads converted into reusable customer records.</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm shadow-sm">
          <span className="font-black text-stone-950">{total.toLocaleString('en-IN')}</span>
          <span className="ml-1 text-stone-500">customer{total === 1 ? '' : 's'}</span>
        </div>
      </div>

      <form onSubmit={submitSearch} className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label htmlFor="customer-search" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-stone-500">
            Search customers
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
            <input
              id="customer-search"
              type="search"
              maxLength={120}
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
              placeholder="Name, company, email, phone or customer number"
              className="w-full rounded-xl border border-stone-300 py-2.5 pl-10 pr-3 text-sm text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button type="submit" className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-stone-950 px-4 py-2.5 text-sm font-black text-white hover:bg-stone-800 sm:flex-none">
            <Search className="h-4 w-4" aria-hidden="true" /> Search
          </button>
          {(search || draftSearch) && (
            <button type="button" onClick={clearSearch} className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-bold text-stone-700 hover:bg-stone-50">
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={loading}
            aria-label="Refresh customers"
            className="rounded-xl border border-stone-300 bg-white p-2.5 text-stone-600 hover:bg-stone-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </form>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm" aria-busy={loading}>
        {loading ? (
          <div className="px-6 py-20 text-center">
            <RefreshCw className="mx-auto h-7 w-7 animate-spin text-amber-600" aria-hidden="true" />
            <p className="mt-3 text-sm font-bold text-stone-500">Loading customers…</p>
          </div>
        ) : customers.length === 0 ? (
          <div className="px-6 py-20 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-100 text-stone-500">
              <UsersRound className="h-6 w-6" aria-hidden="true" />
            </span>
            <h2 className="mt-4 font-black text-stone-900">{search ? 'No matching customers' : 'No customers yet'}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-500">
              {search
                ? 'Try a different name, company, email, phone, or customer number.'
                : 'Customers appear here only after a qualified lead is explicitly converted.'}
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left">
                <thead className="bg-stone-50 text-[11px] font-black uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="px-5 py-3">Customer</th>
                    <th className="px-5 py-3">Contact</th>
                    <th className="px-5 py-3">Source lead</th>
                    <th className="px-5 py-3">Created</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {customers.map((customer) => {
                    const leadId = sourceLeadId(customer.sourceLead);
                    return (
                      <tr key={customer._id} className="hover:bg-stone-50/70">
                        <td className="px-5 py-4">
                          <Link to={`/admin/customers/${customer._id}`} className="font-black text-stone-950 hover:text-amber-700 hover:underline">
                            {customer.name}
                          </Link>
                          <p className="mt-0.5 text-xs font-bold text-stone-500">{customer.customerNumber}</p>
                          {customer.company && <p className="mt-1 text-xs text-stone-500">{customer.company}</p>}
                        </td>
                        <td className="px-5 py-4 text-sm text-stone-700">
                          <p>{customer.email || 'No email'}</p>
                          <p className="mt-1 text-xs text-stone-500">{customer.phone}</p>
                        </td>
                        <td className="px-5 py-4">
                          {leadId ? (
                            <Link to={`/admin/crm/${leadId}`} className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:underline">
                              View lead <ExternalLink className="h-3 w-3" aria-hidden="true" />
                            </Link>
                          ) : <span className="text-xs text-stone-400">Unavailable</span>}
                        </td>
                        <td className="px-5 py-4 text-xs font-medium text-stone-500">{formatCrmDate(customer.createdAt)}</td>
                        <td className="px-5 py-4 text-right">
                          <Link to={`/admin/customers/${customer._id}`} className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-3 py-2 text-xs font-black text-stone-700 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800">
                            Open <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-stone-100 md:hidden">
              {customers.map((customer) => {
                const leadId = sourceLeadId(customer.sourceLead);
                return (
                  <article key={customer._id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-black text-stone-950">{customer.name}</p>
                        <p className="mt-0.5 text-xs font-bold text-stone-500">{customer.customerNumber}</p>
                      </div>
                      <Link to={`/admin/customers/${customer._id}`} aria-label={`Open ${customer.name}`} className="rounded-lg border border-stone-200 p-2 text-stone-600 hover:bg-stone-50">
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </div>
                    {customer.company && <p className="mt-3 flex items-center gap-1.5 text-sm text-stone-600"><Building2 className="h-3.5 w-3.5" aria-hidden="true" /> {customer.company}</p>}
                    <div className="mt-3 space-y-1 text-xs text-stone-500">
                      <p className="break-all">{customer.email || 'No email provided'}</p>
                      <p>{customer.phone}</p>
                      <p>Created {formatCrmDate(customer.createdAt)}</p>
                    </div>
                    {leadId && (
                      <Link to={`/admin/crm/${leadId}`} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:underline">
                        View source lead <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>

      {!loading && customers.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold text-stone-500">Page {page} of {pages} · {total.toLocaleString('en-IN')} total</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={page <= 1}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((value) => Math.min(pages, value + 1))}
              disabled={page >= pages}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
