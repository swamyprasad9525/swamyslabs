import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAdmin } from '../../context/AdminContext';

const fmt = (n) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`;
};

export default function InvoiceListPage() {
  const { authFetch, logout } = useAdmin();
  const navigate = useNavigate();

  const [invoices, setInvoices]   = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [pages, setPages]         = useState(1);
  const [search, setSearch]       = useState('');
  const [from, setFrom]           = useState('');
  const [to, setTo]               = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [dlLoading, setDlLoading] = useState(null);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page, limit: 15 });
      if (search) params.set('search', search);
      if (from)   params.set('from', from);
      if (to)     params.set('to', to);

      const res = await authFetch(`/api/invoices?${params}`);
      if (res.status === 401) { logout(); return; }
      const data = await res.json();
      setInvoices(data.invoices || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch {
      setError('Failed to load invoices.');
    } finally {
      setLoading(false);
    }
  }, [authFetch, logout, page, search, from, to]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchInvoices();
  };

  const downloadExcel = async (id, invoiceNumber) => {
    setDlLoading(id);
    try {
      const res = await authFetch(`/api/invoices/${id}/excel`);
      if (!res.ok) { alert('Export failed'); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `Invoice_${invoiceNumber.replace(/\//g, '-')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { alert('Export failed'); }
    finally  { setDlLoading(null); }
  };

  return (
    <div className="min-h-screen bg-stone-50 font-sans">
      {/* Top bar */}
      <div className="no-print bg-stone-900 px-6 py-4 flex items-center justify-between shadow-md">
        <Link to="/" className="text-lg font-extrabold text-white no-underline flex items-baseline gap-2">
          <span>SWAMY <span className="text-stone-400">SLABS</span></span>
          <span className="text-[11px] font-normal text-stone-500 tracking-wider uppercase">
            Admin
          </span>
        </Link>
        <button id="admin-logout-btn" onClick={() => { logout(); navigate('/admin/login'); }}
          className="bg-transparent border border-white/20 text-stone-400 px-4 py-2 rounded-md text-sm font-semibold hover:bg-white/10 hover:text-white transition-colors duration-200">
          Logout
        </button>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
          <h1 className="text-3xl font-extrabold text-stone-900 m-0 tracking-tight">GST Invoices</h1>
          <Link id="new-invoice-btn" to="/admin/invoices/new" 
            className="bg-stone-900 hover:bg-stone-800 text-white px-5 py-2.5 rounded-lg text-sm font-bold tracking-wide inline-flex items-center gap-2 transition-all shadow-sm hover:shadow-md active:scale-95">
            <span className="text-lg leading-none">+</span> New Invoice
          </Link>
        </div>

        {/* Search / filter */}
        <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-3 mb-6 bg-white p-4 rounded-xl shadow-sm border border-stone-200">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1">Search</label>
            <input
              id="invoice-search"
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/20 focus:border-stone-900 transition-all"
              placeholder="Search buyer or invoice no."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1">From</label>
              <input id="date-from" type="date" className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/20 focus:border-stone-900 transition-all" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1">To</label>
              <input id="date-to" type="date" className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/20 focus:border-stone-900 transition-all" value={to} onChange={e => setTo(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bg-stone-800 hover:bg-stone-900 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm">
              Search
            </button>
            <button type="button" className="bg-stone-300 hover:bg-stone-400 text-stone-800 px-5 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm"
              onClick={() => { setSearch(''); setFrom(''); setTo(''); setPage(1); fetchInvoices(); }}>
              Clear
            </button>
          </div>
        </form>

        {/* Stats */}
        <p className="text-sm text-stone-500 mb-4 font-medium">
          {total} invoice{total !== 1 ? 's' : ''} found
        </p>

        {error && <div className="text-red-600 bg-red-50 p-3 rounded-lg border border-red-100 mb-4 font-medium">{error}</div>}

        {loading ? (
          <div className="text-center py-16 text-stone-500 font-medium animate-pulse">Loading invoices…</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left whitespace-nowrap">
                <thead>
                  <tr className="bg-stone-900 text-white">
                    {['Invoice No', 'Date', 'Buyer', 'Copy Type', 'Tax Type', 'Grand Total', 'Actions'].map((h, i) => (
                      <th key={h} className={`px-4 py-3 text-xs font-bold tracking-wider uppercase ${i === 5 ? 'text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {invoices.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-stone-400">
                        No invoices yet. <Link to="/admin/invoices/new" className="text-stone-900 font-bold hover:underline">Create your first invoice →</Link>
                      </td>
                    </tr>
                  ) : invoices.map(inv => (
                    <tr key={inv._id} className="hover:bg-stone-50 transition-colors group">
                      <td className="px-4 py-3 text-sm font-bold text-stone-900">{inv.invoiceNumber}</td>
                      <td className="px-4 py-3 text-sm text-stone-700">{fmtDate(inv.invoiceDate)}</td>
                      <td className="px-4 py-3 text-sm text-stone-700 font-medium">{inv['buyer.name'] || inv.buyer?.name}</td>
                      <td className="px-4 py-3 text-xs text-stone-500">
                        {(inv.copyType || '').split(' ')[0]}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide
                          ${inv.taxType === 'IGST' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                          {inv.taxType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-bold font-mono text-stone-900 text-right">
                        ₹{fmt(inv.grandTotal)}
                      </td>
                      <td className="px-4 py-3 flex items-center gap-2">
                        <button
                          id={`view-${inv._id}`}
                          className="bg-white border border-stone-200 hover:border-stone-400 text-stone-700 px-3 py-1.5 rounded-md text-xs font-semibold transition-all shadow-sm"
                          onClick={() => navigate(`/admin/invoices/${inv._id}`)}
                          title="View / Print"
                        >👁 View</button>
                        <button
                          id={`excel-${inv._id}`}
                          className="bg-white border border-stone-200 hover:border-stone-400 hover:bg-stone-50 text-stone-700 px-3 py-1.5 rounded-md text-xs font-semibold transition-all shadow-sm disabled:opacity-50"
                          disabled={dlLoading === inv._id}
                          onClick={() => downloadExcel(inv._id, inv.invoiceNumber)}
                          title="Download Excel"
                        >
                          {dlLoading === inv._id ? '⏳' : '⬇ Excel'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex justify-center gap-2 p-4 border-t border-stone-100 bg-stone-50">
                {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
                  <button key={p} 
                    className={`px-3.5 py-1.5 rounded-md text-sm font-semibold transition-colors
                      ${p === page ? 'bg-stone-900 text-white shadow-md' : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-100'}`}
                    onClick={() => setPage(p)}>{p}</button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
