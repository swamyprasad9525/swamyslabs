import { Link } from 'react-router-dom';
import SEO from '../components/SEO';

export default function NotFoundPage() {
  return (
    <main className="min-h-[70vh] bg-stone-50 flex items-center justify-center px-4 py-20 text-center">
      <SEO title="Page Not Found" description="The requested page could not be found." noIndex />
      <div className="max-w-xl">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-700 mb-4">404</p>
        <h1 className="text-4xl md:text-5xl font-serif text-stone-900 mb-4">This page does not exist.</h1>
        <p className="text-stone-600 mb-8">Return home or continue exploring the Swamy Slabs stone collection.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/" className="bg-stone-900 text-white px-6 py-3 rounded-lg font-semibold">Home</Link>
          <Link to="/stones" className="border border-stone-300 text-stone-900 px-6 py-3 rounded-lg font-semibold">View Stones</Link>
        </div>
      </div>
    </main>
  );
}
