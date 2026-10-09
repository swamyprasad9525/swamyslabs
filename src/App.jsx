import { lazy, Suspense } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import AboutSection from './components/AboutSection';
import AdminGuard from './components/admin/AdminGuard';
import PublicLayout from './components/layout/PublicLayout';
import SEO from './components/SEO';
import { AdminProvider } from './context/AdminContext';
import HomePage from './pages/HomePage';
import { getStoneById } from './lib/catalog';

const StonesPage = lazy(() => import('./pages/StonesPage'));
const StoneDetailsPage = lazy(() => import('./pages/StoneDetailsPage'));
const ProjectPlannerPage = lazy(() => import('./pages/ProjectPlannerPage'));
const ContactPage = lazy(() => import('./pages/ContactPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const AdminLayout = lazy(() => import('./components/admin/AdminLayout'));
const AdminLoginPage = lazy(() => import('./pages/admin/AdminLoginPage'));
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'));
const LeadPipelinePage = lazy(() => import('./pages/admin/LeadPipelinePage'));
const LeadDetailPage = lazy(() => import('./pages/admin/LeadDetailPage'));
const CustomerListPage = lazy(() => import('./pages/admin/CustomerListPage'));
const CustomerDetailPage = lazy(() => import('./pages/admin/CustomerDetailPage'));
const InventoryPage = lazy(() => import('./pages/admin/InventoryPage'));
const InventoryBatchFormPage = lazy(() => import('./pages/admin/InventoryBatchFormPage'));
const InventoryBatchDetailPage = lazy(() => import('./pages/admin/InventoryBatchDetailPage'));
const InvoiceListPage = lazy(() => import('./pages/admin/InvoiceListPage'));
const InvoiceFormPage = lazy(() => import('./pages/admin/InvoiceFormPage'));
const InvoiceViewPage = lazy(() => import('./pages/admin/InvoiceViewPage'));
const AdminNotFoundPage = lazy(() => import('./pages/admin/AdminNotFoundPage'));

const RouteFallback = () => (
  <div className="min-h-[50vh] flex items-center justify-center bg-[var(--color-background)]" role="status">
    <div className="h-8 w-8 rounded-full border-2 border-stone-300 border-t-stone-900 motion-safe:animate-spin" />
    <span className="sr-only">Loading page</span>
  </div>
);

function PageTransition({ children }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
      transition={{ duration: .35, ease: [0.22, 1, 0.36, 1] }}
      className="w-full"
    >
      {children}
    </motion.div>
  );
}

const AdminLayoutOutlet = () => (
  <>
    <SEO title="Admin Portal" description="Swamy Slabs administration portal." noIndex />
    <Outlet />
  </>
);

function LegacyStoneRedirect() {
  const { id } = useParams();
  const stone = getStoneById(id);
  return <Navigate to={stone ? `/stones/${stone.slug}` : '/404'} replace />;
}

export default function App() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Suspense fallback={<RouteFallback />}>
        <Routes location={location}>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<PageTransition><HomePage /></PageTransition>} />
            <Route path="/stones" element={<PageTransition><StonesPage /></PageTransition>} />
            <Route path="/stones/:slug" element={<PageTransition><StoneDetailsPage /></PageTransition>} />
            <Route path="/project-planner" element={<PageTransition><ProjectPlannerPage /></PageTransition>} />
            <Route path="/collection" element={<Navigate to="/stones" replace />} />
            <Route path="/collection/:id" element={<LegacyStoneRedirect />} />
            <Route path="/about" element={
              <PageTransition>
                <SEO title="About Swamy Slabs | Natural Stone Processing" description="Learn about Swamy Slabs and its approach to natural stone selection, shaping, finishing and calibration for project use." />
                <div className="min-h-screen bg-stone-50"><AboutSection /></div>
              </PageTransition>
            } />
            <Route path="/contact" element={<PageTransition><ContactPage /></PageTransition>} />
            <Route path="*" element={<PageTransition><NotFoundPage /></PageTransition>} />
          </Route>

          <Route path="/admin" element={<AdminProvider><AdminLayoutOutlet /></AdminProvider>}>
            <Route path="login" element={<AdminLoginPage />} />
            <Route element={<AdminGuard />}>
              <Route element={<AdminLayout />}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<AdminDashboardPage />} />
                <Route path="crm" element={<LeadPipelinePage />} />
                <Route path="crm/:id" element={<LeadDetailPage />} />
                <Route path="customers" element={<CustomerListPage />} />
                <Route path="customers/:id" element={<CustomerDetailPage />} />
                <Route path="inventory" element={<InventoryPage />} />
                <Route path="inventory/batches/new" element={<InventoryBatchFormPage />} />
                <Route path="inventory/batches/:id" element={<InventoryBatchDetailPage />} />
                <Route path="inventory/batches/:id/edit" element={<InventoryBatchFormPage />} />
                <Route path="invoices" element={<InvoiceListPage />} />
                <Route path="invoices/new" element={<InvoiceFormPage />} />
                <Route path="invoices/:id" element={<InvoiceViewPage />} />
                <Route path="*" element={<AdminNotFoundPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </AnimatePresence>
  );
}
