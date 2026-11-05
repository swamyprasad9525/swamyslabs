import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAdmin } from '../../context/AdminContext';
import { 
  FileText, Plus, Search, RefreshCw, Eye, Download, 
  IndianRupee, CheckCircle2, AlertCircle, ShieldAlert,
  Clock, Ban
} from 'lucide-react';
import {
  formatBillingDate,
  formatBillingMoney,
  INVOICE_DOCUMENT_STATUS_STYLES,
  INVOICE_PAYMENT_STATUS_STYLES,
  labelInvoiceDocumentStatus,
  labelInvoicePaymentStatus,
  parseBillingResponse,
} from '../../lib/billing';

export default function InvoiceListPage() {
  const { authFetch, logout } = useAdmin();
  const navigate = useNavigate();

  const [invoices, setInvoices] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState('');
  const [documentStatus, setDocumentStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dlLoading, setDlLoading] = useState(null);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page, limit: 15 });
      if (search) params.set('search', search);
      if (documentStatus) params.set('documentStatus', documentStatus);
      if (paymentStatus) params.set('paymentStatus', paymentStatus);

      const res = await authFetch(`/api/admin/invoices?${params}`);
      if (res.status === 401) { logout(); navigate('/admin/login', { replace: true }); return; }
      const data = await parseBillingResponse(res, 'Failed to load invoices.');
      setInvoices(data.invoices || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch (err) {
      setError(err.message || 'Failed to load invoices.');
    } finally {
      setLoading(false);
    }
  }, [authFetch, logout, navigate, page, search, documentStatus, paymentStatus]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchInvoices();
  };

  const handleReset = () => {
    setSearch('');
    setDocumentStatus('');
    setPaymentStatus('');
    setPage(1);
  };

  const downloadExcel = async (id, invoiceNumber) => {
    setDlLoading(id);
    try {
      const res = await authFetch(`/api/invoices/${id}/excel`);
      if (!res.ok) { throw new Error('Export failed'); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice_${invoiceNumber.replace(/\//g, '-')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Excel download is only available for legacy format invoices.');
    } finally {
      setDlLoading(null);
    }
  };

  // Metrics on page
  const totalBilledOnPage = invoices.reduce((sum, inv) => {
    if (inv.grandTotalMinor != null) return sum + inv.grandTotalMinor;
    return sum + ((inv.grandTotal || 0) * 100);
  }, 0);

  const outstandingOnPage = invoices.reduce((sum, inv) => {
    if (inv.paymentSummary?.outstandingMinor != null) {
      return sum + inv.paymentSummary.outstandingMinor;
    }
    return sum;
  }, 0);

  const issuedCount = invoices.filter((i) => i.documentStatus === 'ISSUED' || !i.documentStatus).length;
  const draftCount = invoices.filter((i) => i.documentStatus === 'DRAFT').length;

  return (
    <div className="min-h-screen bg-stone-100 font-sans pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 space-y-6">
        
        {/* Title Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight flex items-center gap-2.5">
              <span>Invoices & Billing</span>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-stone-900 text-amber-400 shadow-sm">
                {total} Total
              </span>
            </h1>
            <p className="text-xs text-stone-500 font-medium mt-1">
              Sales Order billing, official GST tax invoices, and payment tracking.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              id="new-invoice-btn"
              to="/admin/invoices/new"
              className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition shadow-sm no-underline"
            >
              <Plus className="w-4 h-4" />
              <span>New Invoice</span>
            </Link>
          </div>
        </div>

        {/* KPI METRICS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">Page Billed Amount</div>
              <div className="text-xl sm:text-2xl font-black text-stone-900 mt-1 font-mono">
                {formatBillingMoney(totalBilledOnPage)}
              </div>
              <div className="text-[10px] text-stone-400 font-medium mt-1">
                From {invoices.length} invoices on page
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
              <IndianRupee className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">Page Outstanding</div>
              <div className="text-xl sm:text-2xl font-black text-amber-800 mt-1 font-mono">
                {formatBillingMoney(outstandingOnPage)}
              </div>
              <div className="text-[10px] text-amber-700 font-bold mt-1">
                Awaiting confirmed payment
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
              <Clock className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">Issued Invoices</div>
              <div className="text-xl sm:text-2xl font-black text-stone-900 mt-1">
                {issuedCount}
              </div>
              <div className="text-[10px] text-emerald-600 font-bold mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Legally active
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <FileText className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">Draft Invoices</div>
              <div className="text-xl sm:text-2xl font-black text-stone-900 mt-1">
                {draftCount}
              </div>
              <div className="text-[10px] text-stone-500 font-medium mt-1">
                Pending official issuance
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-stone-50 border border-stone-200 flex items-center justify-center text-stone-600">
              <FileText className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm space-y-3">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by invoice #, customer name, sales order..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-stone-300 bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition"
              />
            </div>

            <select
              value={documentStatus}
              onChange={(e) => { setDocumentStatus(e.target.value); setPage(1); }}
              className="text-xs border border-stone-300 bg-stone-50 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">All Document Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="ISSUED">Issued</option>
              <option value="VOID">Void</option>
            </select>

            <select
              value={paymentStatus}
              onChange={(e) => { setPaymentStatus(e.target.value); setPage(1); }}
              className="text-xs border border-stone-300 bg-stone-50 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">All Payment Statuses</option>
              <option value="UNPAID">Unpaid</option>
              <option value="PARTIALLY_PAID">Partially Paid</option>
              <option value="PAID">Paid</option>
            </select>

            <div className="flex gap-2">
              <button
                type="submit"
                className="bg-stone-900 hover:bg-stone-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Filter</span>
              </button>
              {(search || documentStatus || paymentStatus) && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="bg-stone-200 hover:bg-stone-300 text-stone-700 px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>
          </form>
        </div>

        {error && (
          <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-xs font-bold text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Table View */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-xs font-bold text-stone-500 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-amber-600" />
              <span>Loading invoice records...</span>
            </div>
          ) : invoices.length === 0 ? (
            <div className="p-12 text-center text-stone-500 space-y-2">
              <FileText className="w-10 h-10 mx-auto text-stone-300" />
              <div className="text-sm font-bold text-stone-700">No invoices found</div>
              <p className="text-xs max-w-sm mx-auto">
                No billing records match your filter criteria. Create an invoice draft from an active Sales Order.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 font-bold text-stone-600 uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Invoice #</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Sales Order</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4 text-center">Document</th>
                    <th className="py-3 px-4 text-center">Payment</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {invoices.map((inv) => {
                    const isV2 = inv.recordVersion === 2;
                    const docStatus = inv.documentStatus || 'ISSUED';
                    const payStatus = inv.paymentSummary?.status || 'UNPAID';
                    const customerName = inv.customerIdentitySnapshot?.company
                      || inv.customerIdentitySnapshot?.name
                      || inv.buyer?.name
                      || 'Unknown customer';

                    const amountMinor = inv.grandTotalMinor != null ? inv.grandTotalMinor : (inv.grandTotal * 100);

                    return (
                      <tr key={inv._id} className="hover:bg-stone-50 transition">
                        <td className="py-3 px-4 font-mono font-bold text-amber-900">
                          {inv.invoiceNumber}
                        </td>
                        <td className="py-3 px-4 text-stone-600">
                          {formatBillingDate(inv.issueDate || inv.invoiceDate)}
                        </td>
                        <td className="py-3 px-4">
                          {inv.salesOrderId ? (
                            <Link
                              to={`/admin/sales-orders/${inv.salesOrderId}`}
                              className="font-mono text-stone-700 hover:text-amber-700 font-bold underline"
                            >
                              {inv.salesOrderNumber || 'Sales Order'}
                            </Link>
                          ) : (
                            <span className="text-stone-400">Legacy / Direct</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-bold text-stone-900 max-w-[200px] truncate">
                          {customerName}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-stone-900">
                          {formatBillingMoney(amountMinor)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${INVOICE_DOCUMENT_STATUS_STYLES[docStatus] || INVOICE_DOCUMENT_STATUS_STYLES.DRAFT}`}>
                            {labelInvoiceDocumentStatus(docStatus)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${INVOICE_PAYMENT_STATUS_STYLES[payStatus] || INVOICE_PAYMENT_STATUS_STYLES.UNPAID}`}>
                            {labelInvoicePaymentStatus(payStatus)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              to={`/admin/invoices/${inv._id}`}
                              className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-100 text-stone-700 font-bold flex items-center gap-1 text-[11px] no-underline"
                              title="View & Manage Invoice"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View</span>
                            </Link>
                            {!isV2 && (
                              <button
                                onClick={() => downloadExcel(inv._id, inv.invoiceNumber)}
                                disabled={dlLoading === inv._id}
                                className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-100 text-emerald-700 font-bold flex items-center gap-1 text-[11px] cursor-pointer"
                                title="Download Excel"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pages > 1 && (
            <div className="p-4 border-t border-stone-200 flex items-center justify-between text-xs text-stone-600">
              <div>
                Page <span className="font-bold">{page}</span> of <span className="font-bold">{pages}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 rounded-lg border border-stone-200 disabled:opacity-40 font-bold hover:bg-stone-50 cursor-pointer"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  disabled={page >= pages}
                  className="px-3 py-1.5 rounded-lg border border-stone-200 disabled:opacity-40 font-bold hover:bg-stone-50 cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
