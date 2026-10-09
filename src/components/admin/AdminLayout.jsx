import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  BriefcaseBusiness,
  ExternalLink,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageSearch,
  Plus,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAdmin } from '../../context/AdminContext';

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard, end: true },
  { label: 'CRM', path: '/admin/crm', icon: BriefcaseBusiness },
  { label: 'Customers', path: '/admin/customers', icon: Users },
  { label: 'Inventory', path: '/admin/inventory', icon: PackageSearch },
  { label: 'Invoices', path: '/admin/invoices', icon: FileText },
];

const SECTION_LABELS = [
  { prefix: '/admin/dashboard', label: 'Dashboard' },
  { prefix: '/admin/crm', label: 'CRM' },
  { prefix: '/admin/customers', label: 'Customers' },
  { prefix: '/admin/inventory', label: 'Inventory' },
  { prefix: '/admin/invoices', label: 'Invoices' },
];

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function AdminRouteFallback() {
  return (
    <div className="grid min-h-[45vh] place-items-center" role="status" aria-live="polite">
      <div className="flex items-center gap-3 text-sm font-semibold text-stone-600">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-stone-300 border-t-amber-600 motion-reduce:animate-none" />
        <span>Loading admin page&hellip;</span>
      </div>
    </div>
  );
}

function SidebarLink({ item, onNavigate }) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.path}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) => [
        'flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-bold no-underline transition-colors',
        isActive
          ? 'bg-amber-400 text-stone-950 shadow-sm shadow-amber-950/20'
          : 'text-stone-300 hover:bg-stone-800 hover:text-white',
      ].join(' ')}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{item.label}</span>
    </NavLink>
  );
}

export default function AdminLayout() {
  const { logout } = useAdmin();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawerRef = useRef(null);
  const menuButtonRef = useRef(null);

  const sectionLabel = useMemo(
    () => SECTION_LABELS.find(({ prefix }) => location.pathname.startsWith(prefix))?.label || 'Admin Portal',
    [location.pathname],
  );

  const closeDrawer = (restoreFocus = false) => {
    setMobileOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => menuButtonRef.current?.focus());
    }
  };

  useEffect(() => {
    if (!mobileOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const drawer = drawerRef.current;
    const firstFocusable = drawer?.querySelector(focusableSelector);
    firstFocusable?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDrawer(true);
        return;
      }

      if (event.key !== 'Tab' || !drawer) return;
      const focusable = [...drawer.querySelectorAll(focusableSelector)];
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileOpen]);

  const handleLogout = () => {
    logout();
    navigate('/admin/login', { replace: true });
  };

  return (
    <div className="admin-shell min-h-screen bg-stone-100 font-sans text-stone-900">
      {mobileOpen && (
        <button
          type="button"
          className="no-print fixed inset-0 z-40 h-full w-full cursor-default bg-stone-950/70 backdrop-blur-sm md:hidden"
          aria-label="Close admin navigation"
          onClick={() => closeDrawer(true)}
        />
      )}

      <aside
        ref={drawerRef}
        id="admin-navigation"
        aria-label="Admin navigation"
        className={`no-print fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-stone-800 bg-stone-950 text-white shadow-2xl transition-transform duration-200 ease-out md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-stone-800 px-4">
          <Link
            to="/admin/dashboard"
            onClick={() => closeDrawer()}
            className="flex min-h-11 items-center gap-2.5 text-white no-underline"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-400 text-stone-950 shadow-lg shadow-amber-500/10">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-black tracking-tight">
                SWAMY <span className="text-amber-400">SLABS</span>
              </span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                Admin workspace
              </span>
            </span>
          </Link>

          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-lg text-stone-400 hover:bg-stone-800 hover:text-white md:hidden"
            aria-label="Close admin navigation"
            onClick={() => closeDrawer(true)}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5" aria-label="Primary admin navigation">
          {NAV_ITEMS.map((item) => (
            <SidebarLink key={item.path} item={item} onNavigate={() => closeDrawer()} />
          ))}

          <div className="my-4 border-t border-stone-800" />

          <Link
            to="/admin/invoices/new"
            onClick={() => closeDrawer()}
            className="flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-bold text-stone-300 no-underline transition-colors hover:bg-stone-800 hover:text-white"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>New invoice</span>
          </Link>
        </nav>

        <div className="space-y-1 border-t border-stone-800 p-3">
          <Link
            to="/"
            target="_blank"
            rel="noreferrer"
            className="flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-stone-400 no-underline hover:bg-stone-800 hover:text-white"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            <span>View public site</span>
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-bold text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <div className="admin-shell__main min-h-screen md:pl-64">
        <header className="no-print sticky top-0 z-30 flex h-16 items-center justify-between border-b border-stone-200 bg-white/95 px-4 shadow-sm backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              ref={menuButtonRef}
              type="button"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-stone-200 text-stone-700 hover:border-stone-300 hover:bg-stone-100 md:hidden"
              aria-label="Open admin navigation"
              aria-controls="admin-navigation"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">Swamy Slabs</p>
              <p className="truncate text-sm font-black text-stone-900 sm:text-base">{sectionLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/"
              target="_blank"
              rel="noreferrer"
              className="hidden min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-bold text-stone-600 no-underline hover:bg-stone-100 hover:text-stone-950 sm:flex"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              <span>Public site</span>
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="hidden min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-bold text-stone-600 hover:bg-rose-50 hover:text-rose-700 md:flex"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span>Sign out</span>
            </button>
          </div>
        </header>

        <main className="admin-shell__content min-w-0 p-4 sm:p-6 lg:p-8">
          <Suspense fallback={<AdminRouteFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
