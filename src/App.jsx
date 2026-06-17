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
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
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
  const location = useLocation();
  const { toggleCart, cartCount } = useCart();

  const navLinks = [
    { label: 'Collections', path: '/collection' },
    { label: 'About', path: '/about' },
    { label: 'Contact', path: '/contact' },
  ];

  return (
    <div className="min-h-screen bg-stone-50 selection:bg-stone-900 selection:text-white w-full overflow-x-hidden">
      <ScrollToTop />

      {/* Navigation */}
      <nav className="glass-nav w-full z-50 transition-all duration-300">
        <div className="container mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          {/* Logo */}
          <Link to="/" className="text-xl sm:text-2xl font-serif font-bold tracking-tighter text-stone-900 flex-shrink-0">
            SWAMY <span className="text-stone-500">SLABS</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex space-x-8 items-center">
            {navLinks.map(({ label, path }) => (
              <Link
                key={label}
                to={path}
                className="text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors uppercase tracking-widest"
              >
                {label}
              </Link>
            ))}
            <div className="flex items-center gap-6 pl-4 border-l border-stone-200">
              <button
                onClick={toggleCart}
                aria-label={`Open cart (${cartCount} items)`}
                className="relative text-stone-600 hover:text-stone-900 transition p-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                </svg>
                {cartCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-stone-900 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full">
                    {cartCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Mobile Right — Cart + Hamburger */}
          <div className="flex md:hidden items-center gap-3">
            <button
              onClick={toggleCart}
              aria-label={`Open cart (${cartCount} items)`}
              className="relative text-stone-600 hover:text-stone-900 transition p-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
              </svg>
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-stone-900 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full">
                  {cartCount}
                </span>
              )}
            </button>
            <button
              className="p-2 text-stone-700 hover:text-stone-900 transition"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMenuOpen ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden bg-white border-t border-stone-100 overflow-hidden"
            >
              <div className="flex flex-col px-6 py-4 space-y-1">
                {navLinks.map(({ label, path }) => (
                  <Link
                    key={label}
                    to={path}
                    className="text-base font-medium text-stone-900 py-3 border-b border-stone-50 last:border-0 hover:text-stone-600 transition-colors"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {label}
                  </Link>
                ))}
                <a
                  href="tel:+919381260584"
                  className="flex items-center gap-2 text-base font-medium text-amber-700 py-3 mt-1"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                  </svg>
                  +91 93812 60584
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={
            <PageTransition>
              <SEO
                title="Swamy Slabs | Premium Indian Limestone & Natural Stone Exporter"
                description="Swamy Slabs is a leading Indian Limestone Exporter and Stone Calibration Services provider. Specializing in Tandur Yellow, Kadappa Black, Sandstone & Granite slabs from Betamcherla, Kurnool, AP."
                keywords="Indian Limestone Exporter, Stone Calibration Services, Tandur Yellow Sandstone, Natural Stone India, Kadappa Black Limestone, Flagstones, Granite Processing, Betamcherla Stone"
                canonicalUrl="https://swamyslabs.vercel.app"
              />
              <SchemaMarkup />
              <HeroSection />
              <ParallaxSection />
              <main className="container mx-auto px-4 py-12 md:py-20">
                <ProductListing products={featuredProducts} />
                <section id="planner" className="mt-16 md:mt-24 mb-12">
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
                title="About Swamy Slabs - Natural Stone Manufacturer & Exporter"
                description="Discover Swamy Slabs — 20+ years of expertise in Indian Limestone, Granite, and precision stone calibration. Manufacturer & exporter from Betamcherla, Kurnool, Andhra Pradesh."
                keywords="About Swamy Slabs, Stone Industry Legacy, Natural Stone Experts, Granite Processing History, Betamcherla Stone Manufacturer"
                canonicalUrl="https://swamyslabs.vercel.app/about"
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
      <footer className="py-12 bg-black relative overflow-hidden">
        {/* Animated Background Text - hidden on small screens to prevent overflow */}
        <div className="absolute inset-x-0 bottom-[-10%] z-0 hidden md:flex justify-center pointer-events-none select-none overflow-hidden">
          <motion.p
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
          </motion.p>
        </div>

        <div className="container mx-auto px-4 relative z-10">
          <div className="bg-[#111] rounded-2xl md:rounded-3xl p-6 md:p-8 lg:p-16 shadow-2xl shadow-black border border-stone-800">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 mb-10 md:mb-16">

              {/* Brand Section */}
              <div className="md:col-span-4 space-y-4 md:space-y-6">
                <Link to="/" className="text-2xl md:text-3xl font-serif font-bold tracking-tighter text-white flex items-center gap-2">
                  SWAMY SLABS
                </Link>
                <p className="text-stone-400 text-sm leading-relaxed max-w-xs">
                  Masterfully refined stone for timeless architecture. Specializing in custom shaping, expert tumbling, and precision calibration.
                </p>
                {/* Social Icons */}
                <div className="flex space-x-4 pt-2">
                  <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="text-stone-500 hover:text-white transition">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z" /></svg>
                  </a>
                  <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="text-stone-500 hover:text-white transition">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" /></svg>
                  </a>
                  <a href="https://wa.me/919381260584" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="text-stone-500 hover:text-white transition">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" /></svg>
                  </a>
                </div>
              </div>

              {/* Links Sections */}
              <div className="md:col-span-8 grid grid-cols-2 md:grid-cols-3 gap-6 md:gap-8 md:pl-12">
                <div>
                  <h4 className="font-bold text-white mb-4 md:mb-6 text-sm uppercase tracking-widest">Collections</h4>
                  <ul className="space-y-3 text-sm text-stone-400 font-medium">
                    <li><Link to="/collection" className="hover:text-white transition-colors">Granite Slabs</Link></li>
                    <li><Link to="/collection" className="hover:text-white transition-colors">Sandstone</Link></li>
                    <li><Link to="/collection" className="hover:text-white transition-colors">Limestone</Link></li>
                    <li><Link to="/collection" className="hover:text-white transition-colors">Cobbles</Link></li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-bold text-white mb-4 md:mb-6 text-sm uppercase tracking-widest">Contact Us</h4>
                  <ul className="space-y-3 text-sm text-stone-400 font-medium">
                    <li>
                      <a href="mailto:kolliswami784@gmail.com" className="hover:text-white transition-colors break-all">
                        kolliswami784@gmail.com
                      </a>
                    </li>
                    <li>
                      <a href="tel:+919381260584" className="hover:text-white transition-colors">
                        +91 93812 60584
                      </a>
                    </li>
                    <li className="leading-relaxed">
                      Kurnool Road, 31,<br />Bugganapalli,<br />Betamcherla, AP 518599
                    </li>
                  </ul>
                </div>
                <div className="col-span-2 md:col-span-1">
                  <h4 className="font-bold text-white mb-4 md:mb-6 text-sm uppercase tracking-widest">Company</h4>
                  <ul className="space-y-3 text-sm text-stone-400 font-medium">
                    <li><Link to="/about" className="hover:text-white transition-colors">About Swamy Slabs</Link></li>
                    <li><Link to="/contact" className="hover:text-white transition-colors">Contact Us</Link></li>
                    <li>
                      <a href="https://wa.me/919381260584?text=Hi, I am interested in your stone products." target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors flex items-center gap-1">
                        WhatsApp Us
                      </a>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Bottom Bar */}
            <div className="pt-6 md:pt-8 border-t border-stone-800 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs font-medium text-stone-500">
              <div>©{new Date().getFullYear()} Swamy Slabs International. All rights reserved.</div>
              <div className="flex gap-4">
                <span>Betamcherla, Kurnool, AP</span>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Global WhatsApp Floating Button */}
      <a
        href="https://wa.me/919381260584?text=Hi,%20I%20am%20interested%20in%20your%20stone%20products."
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-[60] group"
        aria-label="Chat on WhatsApp"
      >
        <div className="bg-[#25D366] text-white p-3.5 md:p-4 rounded-full shadow-2xl cursor-pointer hover:bg-[#20bd5a] transition-all hover:scale-110 active:scale-95 relative flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="fill-white">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
          </svg>
          <div className="absolute right-full mr-4 top-1/2 -translate-y-1/2 bg-white text-stone-900 px-3 py-2 rounded-xl shadow-lg text-xs font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none hidden md:flex items-center gap-2">
            Chat on WhatsApp
          </div>
        </div>
      </a>

      <CartDrawer />
      <LeadCapturePopup />
    </div>
  );
}

export default App;
