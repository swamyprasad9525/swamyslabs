import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAdmin } from '../../context/AdminContext';
import AdminHeader from '../../components/admin/AdminHeader';
import { 
  FileText, Plus, Search, Calendar, RefreshCw, Eye, Download, 
  IndianRupee, TrendingUp, Layers, CheckCircle2, AlertCircle
} from 'lucide-react';
import { motion } from 'framer-motion';

const fmt = (n) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, '0')}-${String(dt.getMonth() + 1).padStart(2, '0')}-${dt.getFullYear()}`;
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
      setError('Failed to load invoices. Please check connection.');
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

  const handleReset = () => {
    setSearch('');
    setFrom('');
    setTo('');
    setPage(1);
  };

  const downloadExcel = async (id, invoiceNumber) => {
    setDlLoading(id);
    try {
      const res = await authFetch(`/api/invoices/${id}/excel`);
      if (!res.ok) { throw new Error('Export failed'); }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `Invoice_${invoiceNumber.replace(/\//g, '-')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to download Excel file. Please try again.');
    } finally {
      setDlLoading(null);
    }
  };

  // Compute stats on currently loaded page/total
  const totalRevenueOnPage = invoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);
  const igstCount = invoices.filter(i => i.taxType === 'IGST').length;
  const cgstCount = invoices.filter(i => i.taxType === 'CGST_SGST').length;
  const avgInvoiceValue = invoices.length > 0 ? totalRevenueOnPage / invoices.length : 0;

  return (
    <div className="min-h-screen bg-stone-100 font-sans selection:bg-amber-400 selection:text-stone-950 pb-16">
      <AdminHeader title="GST Invoices Directory" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 space-y-6">
        
        {/* Title Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight flex items-center gap-2.5">
              <span>GST Invoices Dashboard</span>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-stone-900 text-amber-400 shadow-sm">
                {total} Total
              </span>
            </h1>
            <p className="text-xs text-stone-500 font-medium mt-1">
              Manage, search, preview, print, and export official GST E-Waybill invoices.
            </p>
          </div>

          <Link
            id="new-invoice-btn"
            to="/admin/invoices/new"
            className="bg-stone-950 hover:bg-stone-800 text-amber-400 border border-stone-800 px-5 py-3 rounded-2xl text-xs font-black tracking-wide inline-flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl active:scale-95 no-underline"
          >
            <Plus className="w-4 h-4 text-amber-400" />
            <span>Create New Invoice</span>
          </Link>
        </div>

        {/* ── KPI METRICS CARDS ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Tile 1: Total Revenue */}
          <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex items-center justify-between transition-all hover:shadow-md">
            <div>
              <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">Page Revenue</div>
              <div className="text-xl sm:text-2xl font-black text-stone-900 mt-1 font-mono">
                ₹{fmt(totalRevenueOnPage)}
              </div>
              <div className="text-[10px] text-stone-400 font-medium mt-1">
                From {invoices.length} invoices on page
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
              <IndianRupee className="w-6 h-6" />
            </div>
          </div>

          {/* Tile 2: Total Invoices */}
          <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex items-center justify-between transition-all hover:shadow-md">
            <div>
              <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">Invoices Issued</div>
              <div className="text-xl sm:text-2xl font-black text-stone-900 mt-1">
                {total} Records
              </div>
              <div className="text-[10px] text-emerald-600 font-bold mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> System synchronized
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <FileText className="w-6 h-6" />
            </div>
          </div>

          {/* Tile 3: Tax Type Breakdown */}
          <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex items-center justify-between transition-all hover:shadow-md">
            <div>
              <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">Tax Split (Page)</div>
              <div className="text-sm font-bold text-stone-900 mt-1 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-xs font-black">
                  {igstCount} IGST
                </span>
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-xs font-black">
                  {cgstCount} Local
                </span>
              </div>
              <div className="text-[10px] text-stone-400 font-medium mt-1">
                Inter-state vs Intra-state
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
              <Layers className="w-6 h-6" />
            </div>
          </div>

          {/* Tile 4: Avg Invoice Value */}
          <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex items-center justify-between transition-all hover:shadow-md">
            <div>
              <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">Average Ticket</div>
              <div className="text-xl sm:text-2xl font-black text-stone-900 mt-1 font-mono">
                ₹{fmt(avgInvoiceValue)}
              </div>
              <div className="text-[10px] text-stone-400 font-medium mt-1">
                Average value per invoice
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>

        </div>

        {/* ── SEARCH & FILTER TOOLBAR ───────────────────────────────────────── */}
        <form onSubmit={handleSearch} className="bg-white p-4 rounded-2xl shadow-sm border border-stone-200 flex flex-wrap items-end gap-3">
          
          {/* Search bar */}
          <div className="flex-1 min-w-[240px]">
            <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Search className="w-3.5 h-3.5 text-stone-400" />
              <span>Search Buyer or Invoice No</span>
            </label>
            <input
              id="invoice-search"
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all font-medium placeholder:text-stone-400"
              placeholder="e.g. GLOBAL IMPEX or 16/2025-26"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Date From */}
          <div className="w-36">
            <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-stone-400" />
              <span>From Date</span>
            </label>
            <input
              id="date-from"
              type="date"
              className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all font-medium"
              value={from}
              onChange={e => setFrom(e.target.value)}
            />
          </div>

          {/* Date To */}
          <div className="w-36">
            <label className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-stone-400" />
              <span>To Date</span>
            </label>
            <input
              id="date-to"
              type="date"
              className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all font-medium"
              value={to}
              onChange={e => setTo(e.target.value)}
            />
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="bg-stone-900 hover:bg-stone-800 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Filter</span>
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="bg-stone-200 hover:bg-stone-300 text-stone-700 px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="Reset Filters"
            >
              <RefreshCw className="w-3.5 h-3.5 text-stone-500" />
              <span>Reset</span>
            </button>
          </div>

        </form>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-xl text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* ── TABLE CONTAINER ──────────────────────────────────────────────── */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-stone-200 p-16 text-center text-stone-500 font-bold animate-pulse space-y-3">
            <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <div>Loading invoices catalog…</div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left whitespace-nowrap">
                <thead>
                  <tr className="bg-stone-950 text-white border-b border-stone-800">
                    <th className="px-5 py-3.5 text-[11px] font-black tracking-wider uppercase">Invoice No</th>
                    <th className="px-5 py-3.5 text-[11px] font-black tracking-wider uppercase">Date</th>
                    <th className="px-5 py-3.5 text-[11px] font-black tracking-wider uppercase">Buyer Name</th>
                    <th className="px-5 py-3.5 text-[11px] font-black tracking-wider uppercase">Copy Type</th>
                    <th className="px-5 py-3.5 text-[11px] font-black tracking-wider uppercase">Tax Type</th>
                    <th className="px-5 py-3.5 text-[11px] font-black tracking-wider uppercase text-right">Grand Total</th>
                    <th className="px-5 py-3.5 text-[11px] font-black tracking-wider uppercase text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {invoices.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-16 text-center">
                        <FileText className="w-12 h-12 text-stone-300 mx-auto mb-3" />
                        <div className="text-base font-bold text-stone-700">No Invoices Found</div>
                        <div className="text-xs text-stone-400 mt-1 mb-4">
                          Try adjusting your search criteria or create a new invoice.
                        </div>
                        <Link
                          to="/admin/invoices/new"
                          className="inline-flex items-center gap-1.5 bg-stone-900 text-amber-400 font-bold text-xs px-4 py-2 rounded-xl no-underline hover:bg-stone-800 transition"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Create First Invoice</span>
                        </Link>
                      </td>
                    </tr>
                  ) : (
                    invoices.map(inv => {
                      const buyerName = inv['buyer.name'] || inv.buyer?.name || 'N/A';
                      const initial = buyerName.charAt(0).toUpperCase();

                      return (
                        <tr key={inv._id} className="hover:bg-stone-50/80 transition-colors group">
                          
                          {/* Invoice Number */}
                          <td className="px-5 py-4">
                            <span className="font-extrabold text-xs text-stone-900 font-mono bg-stone-100 px-2.5 py-1 rounded-lg border border-stone-200">
                              {inv.invoiceNumber}
                            </span>
                          </td>

                          {/* Date */}
                          <td className="px-5 py-4 text-xs font-semibold text-stone-600">
                            {fmtDate(inv.invoiceDate)}
                          </td>

                          {/* Buyer */}
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-stone-900 text-amber-400 font-black text-xs flex items-center justify-center flex-shrink-0">
                                {initial}
                              </div>
                              <span className="text-xs font-bold text-stone-900 truncate max-w-[200px]">
                                {buyerName}
                              </span>
                            </div>
                          </td>

                          {/* Copy Type */}
                          <td className="px-5 py-4 text-xs text-stone-500 font-medium">
                            {(inv.copyType || 'ORIGINAL').split(' ')[0]}
                          </td>

                          {/* Tax Type */}
                          <td className="px-5 py-4">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              inv.taxType === 'IGST'
                                ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                            }`}>
                              {inv.taxType}
                            </span>
                          </td>

                          {/* Grand Total */}
                          <td className="px-5 py-4 text-xs font-black font-mono text-stone-900 text-right">
                            ₹{fmt(inv.grandTotal)}
                          </td>

                          {/* Actions */}
                          <td className="px-5 py-4">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                id={`view-${inv._id}`}
                                onClick={() => navigate(`/admin/invoices/${inv._id}`)}
                                className="bg-white border border-stone-300 hover:border-stone-400 hover:bg-stone-100 text-stone-800 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1 cursor-pointer"
                                title="View & Print Invoice"
                              >
                                <Eye className="w-3.5 h-3.5 text-stone-600" />
                                <span>View</span>
                              </button>

                              <button
                                id={`excel-${inv._id}`}
                                disabled={dlLoading === inv._id}
                                onClick={() => downloadExcel(inv._id, inv.invoiceNumber)}
                                className="bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-800 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                title="Download Excel (.xlsx)"
                              >
                                {dlLoading === inv._id ? (
                                  <span className="animate-spin text-xs">⏳</span>
                                ) : (
                                  <Download className="w-3.5 h-3.5 text-emerald-700" />
                                )}
                                <span>Excel</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex justify-center items-center gap-2 p-4 border-t border-stone-100 bg-stone-50">
                {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      p === page
                        ? 'bg-stone-950 text-amber-400 shadow-md font-black'
                        : 'bg-white border border-stone-300 text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}

      </div>
    </div>
  );
}
