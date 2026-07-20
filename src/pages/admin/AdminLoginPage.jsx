import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAdmin } from '../../context/AdminContext';

export default function AdminLoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAdmin();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/admin/invoices';

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
    <div className="min-h-screen bg-gradient-to-br from-stone-900 via-stone-800 to-stone-900 flex items-center justify-center font-sans px-4">
      <div className="bg-white/5 border border-white/10 rounded-2xl p-10 w-full max-w-md backdrop-blur-xl shadow-2xl">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-3xl font-extrabold text-white tracking-tight">
            SWAMY <span className="text-stone-400">SLABS</span>
          </div>
          <div className="mt-2 text-xs text-stone-500 tracking-[0.2em] uppercase">
            Admin Portal
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-semibold text-stone-400 tracking-wider uppercase mb-2">
              Admin Password
            </label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoFocus
              placeholder="Enter password"
              className="w-full px-4 py-3 rounded-lg border border-white/20 bg-white/5 text-white text-sm outline-none transition-all duration-200 focus:border-white/50 focus:bg-white/10 placeholder:text-stone-500"
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm animate-pulse">
              {error}
            </div>
          )}

          <button
            id="admin-login-btn"
            type="submit"
            disabled={loading}
            className={`w-full py-3 rounded-lg font-bold text-sm tracking-wide text-white transition-all duration-200 outline outline-2 outline-white/20 hover:outline-white/40 focus:outline-white/60 active:scale-[0.98]
              ${loading ? 'bg-stone-700 cursor-not-allowed' : 'bg-stone-800 hover:bg-stone-700'}`}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center mt-6 text-xs text-stone-600">
          GST Invoice Management System
        </p>
      </div>
    </div>
  );
}
