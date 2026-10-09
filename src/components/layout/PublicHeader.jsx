import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Layers3 } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCart } from '../../context/CartContext';
import { cn } from '../../lib/utils';
import { ActionLink, Container } from '../ui/DesignPrimitives';

const navigation = [
  { label: 'Stones', to: '/stones' },
  { label: 'Project Planner', to: '/project-planner' },
  { label: 'Capabilities', to: '/#capabilities' },
  { label: 'Applications', to: '/#applications' },
  { label: 'About', to: '/about' },
  { label: 'Contact', to: '/contact' },
];

export default function PublicHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const { toggleCart, cartCount } = useCart();
  const overHero = location.pathname === '/' && !scrolled;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setOpen(false), [location.pathname, location.hash]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <header className={cn('fixed inset-x-0 top-0 z-[70] border-b transition-colors duration-300', overHero ? 'border-white/15 bg-stone-950/20 text-white' : 'border-stone-200/80 bg-[rgba(247,244,238,.94)] text-stone-950 shadow-[0_8px_30px_rgba(28,25,23,.06)] backdrop-blur-xl')}>
      <Container size="wide" className="flex h-[72px] items-center justify-between lg:h-20">
        <Link to="/" aria-label="Swamy Slabs home" className="group flex shrink-0 items-center gap-3 whitespace-nowrap font-serif text-xl font-semibold tracking-[-0.03em] sm:text-2xl">
          <span className={cn('h-8 w-[3px] transition-colors', overHero ? 'bg-[#c7935f]' : 'bg-[var(--color-brand)]')} aria-hidden="true" />
          SWAMY SLABS
        </Link>

        <nav aria-label="Primary navigation" className="hidden items-center gap-7 xl:flex">
          {navigation.map(item => (
            <Link key={item.label} to={item.to} className="nav-link">{item.label}</Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button type="button" onClick={toggleCart} className="selection-button" aria-label={`Open project selection with ${cartCount} items`}>
            <Layers3 size={18} aria-hidden="true" />
            <span className="hidden sm:inline">Project Selection</span>
            {cartCount > 0 && <span className="selection-count">{cartCount}</span>}
          </button>
          <ActionLink to="/contact?intent=quote" className="hidden sm:inline-flex">Request Quote</ActionLink>
          <button type="button" className="grid h-11 w-11 place-items-center rounded-full border border-current/25 xl:hidden" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls="mobile-navigation" aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </Container>

      <AnimatePresence>
        {open && (
          <motion.nav
            id="mobile-navigation"
            aria-label="Mobile navigation"
            initial={reduceMotion ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            className="overflow-hidden border-t border-stone-200 bg-[var(--color-background)] text-stone-950 xl:hidden"
          >
            <Container className="py-5">
              <div className="grid">
                {navigation.map(item => <Link key={item.label} to={item.to} className="border-b border-stone-200 py-4 text-base font-medium last:border-0">{item.label}</Link>)}
              </div>
              <ActionLink to="/contact?intent=quote" className="mt-5 w-full">Request Quote</ActionLink>
            </Container>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
