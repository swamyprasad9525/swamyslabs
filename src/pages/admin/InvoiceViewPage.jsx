import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAdmin } from '../../context/AdminContext';
import InvoicePrint from '../../components/admin/InvoicePrint';

export default function InvoiceViewPage() {
  const { id } = useParams();
  const { authFetch, logout } = useAdmin();
  const navigate = useNavigate();

  const [invoice, setInvoice]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [dlLoading, setDlLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch(`/api/invoices/${id}`);
        if (res.status === 401) { logout(); return; }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Not found');
        setInvoice(data.invoice);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, authFetch, logout]);

  const downloadExcel = async () => {
    setDlLoading(true);
    try {
      const res = await authFetch(`/api/invoices/${id}/excel`);
      if (!res.ok) { alert('Export failed'); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `Invoice_${(invoice.invoiceNumber || id).replace(/\//g, '-')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { alert('Export failed'); }
    finally  { setDlLoading(false); }
  };

  return (
    <div className="min-h-screen bg-stone-50 font-sans">
      {/* Top bar */}
      <div className="no-print bg-stone-900 px-6 py-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-4">
          <Link to="/admin/invoices" className="text-stone-400 hover:text-white text-sm font-semibold transition-colors no-underline">
            ← Back to Invoices
          </Link>
          {invoice && (
            <span className="text-white text-base font-extrabold tracking-tight hidden sm:inline">
              Invoice {invoice.invoiceNumber}
            </span>
          )}
        </div>

        {invoice && (
          <div className="flex gap-3">
            <button
              id="download-excel-btn"
              onClick={downloadExcel}
              disabled={dlLoading}
              className="bg-stone-700 hover:bg-stone-600 text-white border-none px-5 py-2.5 rounded-lg cursor-pointer text-sm font-bold transition-all shadow-sm active:scale-95 disabled:opacity-75 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {dlLoading ? (
                <>⏳ Exporting…</>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  Download Excel
                </>
              )}
            </button>
            <button
              id="print-invoice-btn"
              onClick={() => window.print()}
              className="bg-stone-800 hover:bg-stone-700 text-white border-none px-5 py-2.5 rounded-lg cursor-pointer text-sm font-bold transition-all shadow-sm active:scale-95 flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
              Print
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 py-8 sm:py-10 max-w-5xl mx-auto">
        {loading && (
          <div className="text-center py-20 text-stone-500 font-medium animate-pulse">Loading invoice…</div>
        )}
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200 mb-6 font-medium">
            {error}
          </div>
        )}
        {invoice && (
          <div className="bg-white rounded-xl shadow-lg border border-stone-200 p-6 sm:p-10 overflow-x-auto">
            <InvoicePrint invoice={invoice} />
          </div>
        )}
      </div>
    </div>
  );
}
