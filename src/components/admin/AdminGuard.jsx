import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAdmin } from '../../context/AdminContext';

/**
 * Route guard — redirects to /admin/login if not authenticated.
 * Preserves the intended destination in location state so after
 * login the user is sent back to where they wanted to go.
 */
export default function AdminGuard({ children }) {
  const { isAdmin } = useAdmin();
  const location = useLocation();

  if (!isAdmin) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  return children || <Outlet />;
}
