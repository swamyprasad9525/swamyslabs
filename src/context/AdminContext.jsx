import React, { createContext, useContext, useState, useCallback } from 'react';

const AdminContext = createContext(null);

const STORAGE_KEY = 'swamylabs_admin_token';
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export function AdminProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_KEY) || null);

  const isAdmin = Boolean(token);

  const login = useCallback(async (password) => {
    const res = await fetch(`${API_BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

    localStorage.setItem(STORAGE_KEY, data.token);
    setToken(data.token);
    return data.token;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
  }, []);

  /** Authenticated fetch — injects Bearer token automatically */
  const authFetch = useCallback(async (url, options = {}) => {
    const res = await fetch(`${API_BASE}${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });
    return res;
  }, [token]);

  return (
    <AdminContext.Provider value={{ isAdmin, token, login, logout, authFetch }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used inside <AdminProvider>');
  return ctx;
}
