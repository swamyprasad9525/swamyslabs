import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAdmin } from '../../context/AdminContext';
import { FileText, PlusCircle, LogOut, ExternalLink, ShieldCheck, Menu, X } from 'lucide-react';

export default function AdminHeader({ title = 'GST Invoicing Portal' }) {
  const { logout } = useAdmin();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  const navItems = [
    { label: 'Invoices List', path: '/admin/invoices', icon: FileText },
    { label: 'New Invoice', path: '/admin/invoices/new', icon: PlusCircle },
  ];

  return (
    <header className="no-print bg-stone-950/95 border-b border-stone-800 text-white sticky top-0 z-50 backdrop-blur-lg shadow-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        
        {/* Left: Brand + Active Section */}
        <div className="flex items-center gap-4">
          <Link to="/admin/invoices" className="flex items-center gap-2.5 text-white no-underline group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:scale-105 transition-transform duration-200">
              <ShieldCheck className="w-5 h-5 text-stone-950" />
            </div>
            <div>
              <div className="font-extrabold text-base tracking-tight leading-none text-white flex items-center gap-1.5">
                SWAMY <span className="text-amber-400">SLABS</span>
              </div>
              <div className="text-[10px] font-semibold text-stone-400 tracking-wider uppercase mt-0.5">
                {title}
              </div>
            </div>
          </Link>
        </div>

        {/* Desktop Nav Items */}
        <div className="hidden md:flex items-center gap-2">
          {navItems.map(({ label, path, icon: Icon }) => {
            const isActive = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-2 no-underline ${
                  isActive
                    ? 'bg-amber-400 text-stone-950 shadow-md shadow-amber-400/20 font-black'
                    : 'text-stone-300 hover:text-white hover:bg-stone-800/80'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-stone-950' : 'text-stone-400'}`} />
                <span>{label}</span>
              </Link>
            );
          })}

          <div className="h-4 w-px bg-stone-800 mx-2" />

          {/* Visit Main Website */}
          <Link
            to="/"
            target="_blank"
            className="px-3 py-2 rounded-xl text-xs font-semibold text-stone-400 hover:text-white hover:bg-stone-800/60 transition-all flex items-center gap-1.5 no-underline"
            title="Open storefront in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Live Store</span>
          </Link>

          {/* Logout button */}
          <button
            id="admin-logout-btn"
            onClick={handleLogout}
            className="ml-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white border border-rose-500/20 transition-all duration-200 flex items-center gap-1.5 active:scale-95 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>

        {/* Mobile Hamburger Toggle */}
        <div className="flex md:hidden items-center gap-2">
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 text-stone-300 hover:text-white hover:bg-stone-800 rounded-lg transition"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown */}
      {mobileOpen && (
        <div className="md:hidden bg-stone-900 border-t border-stone-800 px-4 py-3 space-y-2">
          {navItems.map(({ label, path, icon: Icon }) => {
            const isActive = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold no-underline ${
                  isActive ? 'bg-amber-400 text-stone-950 font-black' : 'text-stone-300 hover:bg-stone-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </Link>
            );
          })}
          <div className="pt-2 border-t border-stone-800 flex justify-between items-center">
            <Link
              to="/"
              target="_blank"
              onClick={() => setMobileOpen(false)}
              className="text-xs text-stone-400 hover:text-white flex items-center gap-1.5 no-underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Live Website</span>
            </Link>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white transition flex items-center gap-1 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
