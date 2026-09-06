import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "./AuthProvider";

/** Redirects to /login on no session — replaces the old app's GoRouterRefreshStream. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return null; // AppShell's own skeleton covers this; avoid a flash of the login screen
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;

  return children;
}

/** Gate for /einstellungen — admin only. Advisory only, see AuthProvider's isAdmin doc. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}
