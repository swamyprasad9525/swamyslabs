import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, RefreshCw } from 'lucide-react';
import QuotationPrint from '../../components/admin/QuotationPrint';
import { AdminFeedback, AdminPage } from '../../components/admin/AdminPrimitives';
import { useAdmin } from '../../context/AdminContext';
import { parseCommercialResponse } from '../../lib/commercial';

export default function QuotationPrintPage() {
  const { id } = useParams();
  const { authFetch, logout } = useAdmin();
  const navigate = useNavigate();
  const [quotation, setQuotation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadQuotation = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await authFetch(`/api/admin/quotations/${encodeURIComponent(id)}`);
      if (response.status === 401) {
        logout();
        navigate('/admin/login', { replace: true });
        return;
      }
      const data = await parseCommercialResponse(response, 'Unable to load the quotation document.');
      setQuotation(data.quotation);
    } catch (requestError) {
      setError(requestError.message || 'Unable to load the quotation document.');
    } finally {
      setLoading(false);
    }
  }, [authFetch, id, logout, navigate]);

  useEffect(() => { loadQuotation(); }, [loadQuotation]);

  return (
    <AdminPage size="standard" className="quotation-document-screen space-y-5">
      <Helmet><title>{quotation?.quotationNumber ? `${quotation.quotationNumber} Quotation` : 'Quotation Document'} | Swamy Slabs</title><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="no-print flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <Link to={`/admin/quotations/${id}`} className="inline-flex min-h-11 items-center gap-2 text-xs font-black text-stone-700 no-underline"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Quotation detail</Link>
        <button type="button" disabled={!quotation} onClick={() => window.print()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-stone-950 px-5 text-xs font-black text-white disabled:opacity-50"><Printer className="h-4 w-4" aria-hidden="true" /> Print quotation</button>
      </div>
      {loading && <div className="rounded-xl border border-stone-200 bg-white px-6 py-20 text-center" role="status"><RefreshCw className="mx-auto h-7 w-7 animate-spin text-amber-700 motion-reduce:animate-none" aria-hidden="true" /><p className="mt-3 text-sm font-bold text-stone-600">Loading persisted quotation document…</p></div>}
      {error && <AdminFeedback title="Quotation document unavailable" onRetry={loadQuotation}>{error}</AdminFeedback>}
      {quotation && <div className="quotation-document-frame overflow-x-auto rounded-xl border border-stone-300 bg-white p-3 shadow-xl sm:p-6"><QuotationPrint quotation={quotation} /></div>}
    </AdminPage>
  );
}
