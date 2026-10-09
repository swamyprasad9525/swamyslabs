import { Link } from 'react-router-dom';
import { ArrowLeft, LayoutDashboard, SearchX } from 'lucide-react';
import { Helmet } from 'react-helmet-async';

export default function AdminNotFoundPage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center">
      <Helmet>
        <title>Admin Page Not Found | Swamy Slabs</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <section className="w-full rounded-2xl border border-stone-200 bg-white px-6 py-12 text-center shadow-sm sm:px-10">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100 text-stone-600">
          <SearchX className="h-7 w-7" aria-hidden="true" />
        </span>
        <p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-amber-700">Admin 404</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-stone-950 sm:text-3xl">This admin page does not exist</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-stone-500">
          The address may be outdated or incomplete. Return to a known protected admin area.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/admin/dashboard" className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-950 px-5 py-3 text-sm font-black text-white hover:bg-stone-800">
            <LayoutDashboard className="h-4 w-4" aria-hidden="true" /> Dashboard
          </Link>
          <Link to="/admin/crm" className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-black text-stone-700 hover:bg-stone-50">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> CRM pipeline
          </Link>
        </div>
      </section>
    </div>
  );
}
