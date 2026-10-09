import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import CartDrawer from '../CartDrawer';
import ScrollToTop from '../common/ScrollToTop';
import PublicFooter from './PublicFooter';
import PublicHeader from './PublicHeader';

export default function PublicLayout() {
  const location = useLocation();

  useEffect(() => {
    if (!location.hash) return;

    const section = document.getElementById(location.hash.slice(1));
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash, location.pathname]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--color-background)] text-[var(--color-text-primary)] selection:bg-stone-900 selection:text-white">
      <ScrollToTop />
      <PublicHeader />
      <div className={location.pathname === '/' ? '' : 'pt-[72px] lg:pt-20'}><Outlet /></div>
      <PublicFooter />
      <CartDrawer />
    </div>
  );
}
