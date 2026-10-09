import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAdmin } from '../../context/AdminContext';
import { ShieldCheck, Lock, Eye, EyeOff, ArrowRight, Sparkles, Building2 } from 'lucide-react';
import { motion } from 'framer-motion';

export default function AdminLoginPage() {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAdmin();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/admin';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed. Check your password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-950 font-sans flex items-center justify-center p-4 relative overflow-hidden selection:bg-amber-400 selection:text-stone-950">
      
      {/* Dynamic Ambient Background Elements */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-purple-600/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute top-10 left-10 w-72 h-72 bg-blue-600/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Main Glassmorphic Login Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-md bg-stone-900/80 backdrop-blur-2xl border border-stone-800 rounded-3xl p-8 sm:p-10 shadow-2xl shadow-black relative z-10"
      >
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 shadow-xl shadow-amber-500/20 mb-4">
            <ShieldCheck className="w-8 h-8 text-stone-950" />
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center justify-center gap-2">
            SWAMY <span className="text-amber-400">SLABS</span>
          </h1>
          
          <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-stone-800/80 border border-stone-700 text-[11px] font-bold text-stone-300 uppercase tracking-widest">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Admin Management Portal</span>
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-stone-300 tracking-wider uppercase mb-2 flex items-center justify-between">
              <span>Admin Password</span>
              <span className="text-[10px] text-stone-500 font-normal normal-case">Protected access</span>
            </label>
            
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-500">
                <Lock className="w-4 h-4" />
              </div>
              
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoFocus
                placeholder="Enter portal password"
                className="w-full pl-10 pr-10 py-3.5 rounded-xl border border-stone-700/80 bg-stone-950/60 text-white text-sm outline-none transition-all duration-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 placeholder:text-stone-600 font-medium"
              />

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-stone-500 hover:text-stone-300 transition cursor-pointer"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3.5 text-rose-400 text-xs font-bold text-center"
            >
              ⚠️ {error}
            </motion.div>
          )}

          <button
            id="admin-login-btn"
            type="submit"
            disabled={loading}
            className={`w-full py-3.5 px-6 rounded-xl font-black text-xs uppercase tracking-wider text-stone-950 transition-all duration-200 shadow-lg cursor-pointer flex items-center justify-center gap-2 active:scale-95 ${
              loading
                ? 'bg-amber-600/50 cursor-not-allowed text-stone-900'
                : 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 shadow-amber-500/20 hover:shadow-amber-500/30'
            }`}
          >
            {loading ? (
              <span>Authenticating…</span>
            ) : (
              <>
                <span>Sign In to Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer info */}
        <div className="mt-8 pt-6 border-t border-stone-800/80 flex items-center justify-between text-xs text-stone-500">
          <div className="flex items-center gap-1.5 font-medium">
            <Building2 className="w-3.5 h-3.5 text-stone-400" />
            <span>Swamy Slabs Industries</span>
          </div>
          <Link to="/" className="text-stone-400 hover:text-amber-400 font-semibold transition no-underline">
            Back to site →
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
