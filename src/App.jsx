import React, { useState } from 'react';
import ProductListing from './components/ProductListing';
import SEO from './components/SEO';
import SchemaMarkup from './components/SchemaMarkup';

import CollectionPage from './pages/CollectionPage';
import ProductDetailsPage from './pages/ProductDetailsPage';
import ContactPage from './pages/ContactPage';
import { motion, AnimatePresence } from 'framer-motion';
import { Routes, Route, useNavigate, Link, useLocation } from 'react-router-dom';
import { cn } from './lib/utils';

import { useCart } from './context/CartContext';
import CartDrawer from './components/CartDrawer';
import ParallaxSection from './components/ParallaxText';
import HeroSection from './components/HeroSection';
import LeadCapturePopup from './components/LeadCapturePopup';
import AboutSection from './components/AboutSection';
import SmartSurfacePlanner from './components/SmartSurfacePlanner';
import ScrollToTop from './components/common/ScrollToTop';

import { PREMIUM_STONES } from './data/stones';

const PageTransition = ({ children }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} // Custom easing for premium feel
      className="w-full"
    >
      {children}
    </motion.div>
  );
};

const App = () => {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [featuredProducts, setFeaturedProducts] = useState(PREMIUM_STONES.slice(0, 3));
  const navigate = useNavigate();
  const location = useLocation(); // Hook for AnimatePresence
  const { toggleCart, cartCount } = useCart();

  return (
    <div className="min-h-screen bg-stone-50 selection:bg-stone-900 selection:text-white w-full overflow-x-hidden">
      <ScrollToTop />
      {/* Navigation */}
      <nav className="glass-nav w-full z-50 transition-all duration-300">
        {/* ... (keep nav content same, just ensuring context is correct) ... */}
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <Link to="/" className="text-2xl font-serif font-bold tracking-tighter text-stone-900">
            SWAMY <span className="text-stone-500">SLABS</span>
          </Link>

          <div className="hidden md:flex space-x-8 items-center">
            {['Collections', 'About', 'Contact'].map((item) => {
              const path = item === 'Collections' ? '/collection' : item === 'About' ? '/about' : '/contact';

              return (
                <Link key={item} to={path} className="text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors uppercase tracking-widest">
                  {item}
                </Link>
              );
            })}

            <div className="flex items-center gap-6 pl-4 border-l border-stone-200">
              <button
                onClick={toggleCart}
                className="relative text-stone-600 hover:text-stone-900 transition"
              >
                <span className="font-bold">🛒</span>
                {cartCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-stone-900 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full animate-bounce-short">
                    {cartCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          <button className="md:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? "✕" : "☰"}
          </button>
        </div>

        {isMenuOpen && (
          <div className="md:hidden bg-white border-t border-stone-100">
            <div className="flex flex-col p-6 space-y-4">
              {['Collections', 'About', 'Contact'].map((item) => {
                const path = item === 'Collections' ? '/collection' : item === 'About' ? '/about' : '/contact';
                return (
                  <Link key={item} to={path} className="text-lg font-medium text-stone-900" onClick={() => setIsMenuOpen(false)}>
                    {item}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={
            <PageTransition>
              <SEO
                title="Swamy Slabs"
                description="Swamy Slabs is a leading Indian Limestone Exporter and provider of Stone Calibration Services. We specialize in Tandur Yellow Sandstone and custom stone processing."
                keywords="Indian Limestone Exporter, Stone Calibration Services, Tandur Yellow Sandstone, Natural Stone India, Flagstones, Granite Processing"
              />
              <SchemaMarkup />
              <HeroSection />
              <ParallaxSection />
              <main className="container mx-auto px-4 py-20">
                <ProductListing products={featuredProducts} />
                <section id="planner" className="mt-24 mb-12">
                  <SmartSurfacePlanner />
                </section>
              </main>
            </PageTransition>
          } />

          <Route path="/collection" element={
            <PageTransition>
              <CollectionPage />
            </PageTransition>
          } />

          <Route path="/collection/:id" element={
            <PageTransition>
              <ProductDetailsPage />
            </PageTransition>
          } />

          <Route path="/about" element={
            <PageTransition>
              <SEO
                title="About Us - 20 Years of Excellence"
                description="Discover Swamy Slabs' 20-year legacy in the natural stone industry. We are experts in Indian Limestone, Granite, and precision stone calibration."
                keywords="About Swamy Slabs, Stone Industry Legacy, Natural Stone Experts, Granite Processing History"
              />
              <div className="pt-5 min-h-screen bg-stone-50"><AboutSection /></div>
            </PageTransition>
          } />

          <Route path="/contact" element={
            <PageTransition>
              <ContactPage />
            </PageTransition>
          } />
        </Routes>
      </AnimatePresence>

      {/* Footer */}
      {/* Footer - Redesigned (Dark Mode) */}
      <footer className="py-12 bg-black relative overflow-hidden">

        {/* Animated Background Text - Dark Mode Watermark */}
        <div className="absolute inset-x-0 bottom-[-10%] z-0 flex justify-center pointer-events-none select-none overflow-hidden">
          <motion.h1
            initial={{ opacity: 0, y: 100 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="text-[12vw] font-black text-[#1c1917] uppercase tracking-tighter whitespace-nowrap leading-none"
            style={{
              textShadow: '0px 20px 50px rgba(0,0,0,0.5)',
              maskImage: 'linear-gradient(to bottom, black 90%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, black 90%, transparent 100%)'
            }}
          >
            swamy slabs
          </motion.h1>
        </div>

        <div className="container mx-auto px-4 relative z-10">
          <div className="bg-[#111] rounded-3xl p-8 md:p-16 shadow-2xl shadow-black border border-stone-800">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-12 mb-16">

              {/* Brand Section (Left) */}
              <div className="md:col-span-4 space-y-6">
                <Link to="/" className="text-3xl font-serif font-bold tracking-tighter text-white flex items-center gap-2">
                  {/* <div className="w-8 h-8 bg-white rounded-br-xl rounded-tl-xl"></div> */}
                  SWAMY SLABS
                </Link>
                <p className="text-stone-400 text-sm leading-relaxed max-w-xs">
                  Masterfully refined stone for timeless architecture. Specializing in custom shaping, expert tumbling, and precision calibration
                </p>
                <div className="flex space-x-4 pt-2">
                  {[
                    <svg key="fb" className="w-5 h-5 text-stone-500 hover:text-white cursor-pointer transition" fill="currentColor" viewBox="0 0 24 24"><path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z" /></svg>,
                    <svg key="ig" className="w-5 h-5 text-stone-500 hover:text-white cursor-pointer transition" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" /></svg>,
                    <svg key="tw" className="w-5 h-5 text-stone-500 hover:text-white cursor-pointer transition" fill="currentColor" viewBox="0 0 24 24"><path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z" /></svg>,
                    <svg key="yt" className="w-5 h-5 text-stone-500 hover:text-white cursor-pointer transition" fill="currentColor" viewBox="0 0 24 24"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" /></svg>
                  ]}
                </div>
              </div>

              {/* Links Sections (Right) */}
              <div className="md:col-span-8 grid grid-cols-2 md:grid-cols-3 gap-8 md:pl-12">
                <div>
                  <h4 className="font-bold text-white mb-6">Collections</h4>
                  <ul className="space-y-4 text-sm text-stone-400 font-medium">
                    <li><Link to="/collection" className="hover:text-white transition-colors">Granite Slabs</Link></li>
                    <li><Link to="/collection" className="hover:text-white transition-colors">Sandstone</Link></li>
                    <li><Link to="/collection" className="hover:text-white transition-colors">Limestone</Link></li>
                    <li><Link to="/collection" className="hover:text-white transition-colors">Cobbles</Link></li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-bold text-white mb-6">Contact Us</h4>
                  <ul className="space-y-4 text-sm text-stone-400 font-medium">
                    <li className="hover:text-white transition-colors">Email: <br />kolliswami784@gmail.com</li>
                    <li className="hover:text-white transition-colors">Phone: <br />+91 9381260584</li>
                    <li className="hover:text-white transition-colors">Address:<br></br> KURNOOL ROAD, 31, BUGGANAPALLI, BETAMCHERLA, Kurnool, Andhra Pradesh, 518599</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-bold text-white mb-6">Company</h4>
                  <ul className="space-y-4 text-sm text-stone-400 font-medium">
                    <li><Link to="/about" className="hover:text-white transition-colors">About Swamy Slabs</Link></li>
                    <li><Link to="/contact" className="hover:text-white transition-colors">Contact Us</Link></li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Bottom Bar */}
            <div className="pt-8 border-t border-stone-800 flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-medium text-stone-500">
              <div>
                @{new Date().getFullYear()} Swamy Slabs. All rights reserved.
              </div>

            </div>

          </div>
        </div>
      </footer>
      <CartDrawer />
      <LeadCapturePopup />
    </div>
  );
}

export default App;
