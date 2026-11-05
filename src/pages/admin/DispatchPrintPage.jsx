import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import {
  formatBillingDate,
  formatBillingNumber,
} from '../../lib/billing';
import {
  labelTransportMode,
  parseDispatchResponse,
} from '../../lib/dispatch';

export default function DispatchPrintPage() {
  const { id } = useParams();
  const { authFetch } = useAdmin();
  const [dispatch, setDispatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const response = await authFetch(`/api/admin/dispatches/${encodeURIComponent(id)}`);
        const data = await parseDispatchResponse(response, 'Failed to load dispatch record.');
        setDispatch(data.dispatch);
      } catch (err) {
        setError(err.message || 'Failed to load dispatch.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [authFetch, id]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-100 font-sans text-stone-600">
        <div className="text-center space-y-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-800 border-t-transparent mx-auto" />
          <p className="text-xs font-bold">Generating Gate Pass Document...</p>
        </div>
      </div>
    );
  }

  if (error || !dispatch) {
    return (
      <div className="p-8 text-center text-rose-700">
        <p className="font-bold">Error loading dispatch gate pass</p>
        <p className="text-xs mt-1">{error}</p>
        <Link to="/admin/dispatch" className="mt-4 inline-block text-xs font-bold underline">
          Back to Dispatches
        </Link>
      </div>
    );
  }

  const items = dispatch.items || [];
  const totalSlabs = dispatch.totalSlabsCount || items.reduce((s, i) => s + (i.slabsCount || 0), 0);
  const totalArea = dispatch.totalAreaSqFt || items.reduce((s, i) => s + (i.areaSqFt || 0), 0);

  return (
    <div className="min-h-screen bg-stone-100 font-sans text-stone-900 pb-16">
      <Helmet>
        <title>Gate Pass — {dispatch.gatePassNumber || dispatch.dispatchNumber}</title>
      </Helmet>

      {/* Action Toolbar */}
      <div className="no-print sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link
            to={`/admin/dispatch/${dispatch._id}`}
            className="flex items-center gap-1.5 text-xs font-bold text-stone-600 hover:text-stone-950 no-underline"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Dispatch Details
          </Link>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2 text-xs font-bold text-amber-400 shadow-sm hover:bg-stone-800 cursor-pointer"
          >
            <Printer className="h-4 w-4 text-amber-400" />
            Print Gate Pass (A4)
          </button>
        </div>
      </div>

      {/* Gate Pass Print Container */}
      <div className="mx-auto mt-6 max-w-4xl bg-white p-8 sm:p-12 shadow-md border border-stone-300 gatepass-print-area">
        <style>{`
          @media print {
            @page {
              size: A4 portrait;
              margin: 10mm 12mm;
            }
            body {
              background: #ffffff !important;
              color: #000000 !important;
              padding: 0 !important;
              margin: 0 !important;
            }
            .no-print {
              display: none !important;
            }
            .gatepass-print-area {
              box-shadow: none !important;
              border: 2px solid #000000 !important;
              padding: 15px !important;
              margin: 0 !important;
              width: 100% !important;
              max-width: 100% !important;
            }
            table, tr, td, th {
              border-color: #000000 !important;
            }
          }
        `}</style>

        {/* Header */}
        <div className="border-b-2 border-stone-900 pb-4 text-center">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-500">
              ORIGINAL / TRANSPORTER COPY
            </span>
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-500">
              GSTIN: 37FEIPK5873Q1ZF
            </span>
          </div>

          <h1 className="text-2xl font-black uppercase tracking-tight text-stone-950 mt-1">
            SWAMY SLABS INDUSTRIES
          </h1>
          <p className="text-xs font-medium text-stone-700">
            Mfrs. Of : Premium Natural Stones, Rough & Polished Slabs, Finished Tiles
          </p>
          <p className="text-[11px] text-stone-600 mt-0.5">
            Betamcherla - 518599, Kurnool District, Andhra Pradesh, India • Phone: +91 94902 38301
          </p>

          <div className="mt-3 inline-block rounded border border-stone-900 bg-stone-950 px-4 py-1 text-xs font-black uppercase tracking-widest text-white">
            MATERIAL DISPATCH GATE PASS / DELIVERY CHALLAN
          </div>
        </div>

        {/* Top Details Grid */}
        <div className="mt-4 grid grid-cols-2 gap-4 border border-stone-900 p-3 text-xs">
          <div className="space-y-1.5 border-r border-stone-900 pr-3">
            <div className="flex justify-between">
              <span className="font-bold text-stone-600">Gate Pass No:</span>
              <span className="font-mono font-black text-stone-950 text-sm">
                {dispatch.gatePassNumber || dispatch.dispatchNumber}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-bold text-stone-600">Date & Time:</span>
              <span className="font-semibold text-stone-900">
                {dispatch.dispatchedAt
                  ? `${formatBillingDate(dispatch.dispatchedAt)} ${new Date(dispatch.dispatchedAt).toLocaleTimeString()}`
                  : formatBillingDate(dispatch.createdAt)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-bold text-stone-600">Sales Order No:</span>
              <span className="font-mono font-bold text-stone-900">
                {dispatch.salesOrderNumber || '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-bold text-stone-600">Issued By:</span>
              <span className="font-semibold text-stone-900">
                {dispatch.dispatchedBy || 'Admin Yard Manager'}
              </span>
            </div>
          </div>

          <div className="space-y-1.5 pl-1">
            <div className="flex justify-between">
              <span className="font-bold text-stone-600">Consignee (Customer):</span>
              <span className="font-bold text-stone-950">
                {dispatch.customerSnapshot?.name || 'Customer'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-bold text-stone-600">Destination:</span>
              <span className="text-right text-stone-800 max-w-[200px]">
                {dispatch.customerSnapshot?.deliveryAddress || dispatch.customerSnapshot?.billingAddress || 'Betamcherla'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-bold text-stone-600">Transport Mode:</span>
              <span className="font-semibold text-stone-900">
                {labelTransportMode(dispatch.transport?.mode)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-bold text-stone-600">Vehicle / Lorry No:</span>
              <span className="font-mono font-black text-stone-950">
                {dispatch.transport?.vehicleNumber || 'Self-Pickup'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-bold text-stone-600">Transporter / LR No:</span>
              <span className="font-semibold text-stone-900">
                {dispatch.transport?.carrierName || 'Direct'}{' '}
                {dispatch.transport?.lrNumber && `(LR: ${dispatch.transport.lrNumber})`}
              </span>
            </div>
          </div>
        </div>

        {/* Itemized Table */}
        <div className="mt-4">
          <table className="w-full border-collapse border border-stone-900 text-xs">
            <thead>
              <tr className="border-b border-stone-900 bg-stone-100 font-black uppercase text-stone-900">
                <th className="border-r border-stone-900 p-2 text-center w-10">S.No</th>
                <th className="border-r border-stone-900 p-2 text-left">Batch No</th>
                <th className="border-r border-stone-900 p-2 text-left">Stone & Surface Finish</th>
                <th className="border-r border-stone-900 p-2 text-center w-24">Thickness</th>
                <th className="border-r border-stone-900 p-2 text-center w-20">Slabs</th>
                <th className="p-2 text-right w-28">Area (Sq.Ft)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx} className="border-b border-stone-300">
                  <td className="border-r border-stone-900 p-2 text-center font-mono">{idx + 1}</td>
                  <td className="border-r border-stone-900 p-2 font-mono font-bold text-stone-950">
                    {item.batchSnapshot?.batchNumber || '—'}
                  </td>
                  <td className="border-r border-stone-900 p-2">
                    <span className="font-bold text-stone-900">{item.batchSnapshot?.stoneName}</span>
                    {item.batchSnapshot?.surfaceFinish && (
                      <span className="text-[11px] text-stone-600 block">
                        Surface: {item.batchSnapshot.surfaceFinish}
                      </span>
                    )}
                  </td>
                  <td className="border-r border-stone-900 p-2 text-center">
                    {item.batchSnapshot?.thicknessMm ? `${item.batchSnapshot.thicknessMm} mm` : '—'}
                  </td>
                  <td className="border-r border-stone-900 p-2 text-center font-bold text-stone-950">
                    {item.slabsCount || 0}
                  </td>
                  <td className="p-2 text-right font-mono font-semibold">
                    {formatBillingNumber(item.areaSqFt || 0)}
                  </td>
                </tr>
              ))}

              {/* Blank filler rows for crisp formatting if fewer than 5 items */}
              {Array.from({ length: Math.max(0, 5 - items.length) }).map((_, fIdx) => (
                <tr key={`fill-${fIdx}`} className="border-b border-stone-200 h-8">
                  <td className="border-r border-stone-900 p-2">&nbsp;</td>
                  <td className="border-r border-stone-900 p-2">&nbsp;</td>
                  <td className="border-r border-stone-900 p-2">&nbsp;</td>
                  <td className="border-r border-stone-900 p-2">&nbsp;</td>
                  <td className="border-r border-stone-900 p-2">&nbsp;</td>
                  <td className="p-2">&nbsp;</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-stone-900 bg-stone-100 font-bold">
                <td colSpan={4} className="border-r border-stone-900 p-2.5 text-right uppercase tracking-wider">
                  Total Dispatched Material:
                </td>
                <td className="border-r border-stone-900 p-2.5 text-center font-black text-sm">
                  {totalSlabs}
                </td>
                <td className="p-2.5 text-right font-mono font-black text-sm">
                  {formatBillingNumber(totalArea)} sq.ft
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Gate Remarks */}
        <div className="mt-3 border border-stone-900 p-2.5 text-xs">
          <span className="font-bold text-stone-700">Driver / Gate Remarks:</span>{' '}
          <span className="text-stone-900 font-medium">
            {dispatch.notes || 'Goods dispatched in sound condition, properly strapped and verified against order specs.'}
          </span>
        </div>

        {/* Declaration */}
        <p className="mt-4 text-[10px] text-stone-500 italic text-center">
          "Certified that the particulars given above are true and correct, and the material has been loaded, inspected, and released from the factory/yard premises."
        </p>

        {/* Signature Blocks */}
        <div className="mt-12 grid grid-cols-3 gap-6 text-center text-xs">
          <div className="border-t border-stone-900 pt-2">
            <p className="font-bold text-stone-900">Yard Incharge / Dispatcher</p>
            <p className="text-[10px] text-stone-500">Authorized Signatory</p>
          </div>
          <div className="border-t border-stone-900 pt-2">
            <p className="font-bold text-stone-900">Security Gate Exit Officer</p>
            <p className="text-[10px] text-stone-500">Vehicle & Count Verified</p>
          </div>
          <div className="border-t border-stone-900 pt-2">
            <p className="font-bold text-stone-900">Transporter / Driver</p>
            <p className="text-[10px] text-stone-500">Received Slabs in Good Order</p>
          </div>
        </div>
      </div>
    </div>
  );
}
