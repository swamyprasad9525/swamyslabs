import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAdmin } from '../../context/AdminContext';
import InvoicePrint from '../../components/admin/InvoicePrint';
import { ArrowLeft, Printer, Download, FileText, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function InvoiceViewPage() {
  const { id } = useParams();
  const { authFetch, logout } = useAdmin();
  const navigate = useNavigate();

  const [invoice, setInvoice]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [dlLoading, setDlLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch(`/api/invoices/${id}`);
        if (res.status === 401) { logout(); return; }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Invoice not found');
        setInvoice(data.invoice);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, authFetch, logout]);

  const downloadExcel = async () => {
    if (!invoice) return;
    setDlLoading(true);
    try {
      const res = await authFetch(`/api/invoices/${id}/excel`);
      if (!res.ok) { throw new Error('Export failed'); }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `Invoice_${(invoice.invoiceNumber || id).replace(/\//g, '-')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to download Excel export');
    } finally {
      setDlLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 font-sans selection:bg-amber-400 selection:text-stone-950 pb-16">
      {/* Action Toolbar */}
      <div className="no-print bg-white border-b border-stone-200 shadow-sm py-3.5 px-4 sm:px-6 sticky top-16 z-20">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          
          <Link
            to="/admin/invoices"
            className="text-stone-600 hover:text-stone-950 text-xs font-bold transition flex items-center gap-1.5 no-underline"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Invoices</span>
          </Link>

          {invoice && (
            <div className="flex items-center gap-3">
              <button
                id="download-excel-btn"
                onClick={downloadExcel}
                disabled={dlLoading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white border-none px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-75 cursor-pointer flex items-center gap-1.5"
              >
                {dlLoading ? (
                  <>⏳ Exporting…</>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Download Excel</span>
                  </>
                )}
              </button>

              <button
                id="print-invoice-btn"
                onClick={() => window.print()}
                className="bg-stone-950 hover:bg-stone-800 text-amber-400 border-none px-4 py-2 rounded-xl text-xs font-black transition-all shadow-sm active:scale-95 flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4 text-amber-400" />
                <span>Print Invoice</span>
              </button>
            </div>
          )}

        </div>
      </div>

      {/* Content View */}
      <div className="px-4 sm:px-6 py-8 max-w-5xl mx-auto">
        {loading && (
          <div className="bg-white rounded-2xl p-20 border border-stone-200 text-center text-stone-500 font-bold animate-pulse space-y-3">
            <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <div>Loading invoice document details…</div>
          </div>
        )}

        {error && (
          <div className="bg-rose-50 text-rose-700 p-5 rounded-2xl border border-rose-200 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {invoice && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-xl border border-stone-300 p-6 sm:p-10 overflow-x-auto"
          >
            <InvoicePrint invoice={invoice} />
          </motion.div>
        )}
      </div>
    </div>
  );
}
