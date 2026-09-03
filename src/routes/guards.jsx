import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

/** Gate that requires a hydrated, authenticated user (guide §9.8). */
export function RequireAuth({ children }) {
  const { status } = useAuth();
  if (status === "loading") return <p className="muted">Loading…</p>;
  if (status !== "authenticated") return <Navigate to="/" replace />;
  return children;
}

/** Gate that additionally requires role === "admin". */
export function RequireAdmin({ children }) {
  const { status, isAdmin } = useAuth();
  if (status === "loading") return <p className="muted">Loading…</p>;
  if (status !== "authenticated") return <Navigate to="/" replace />;
  if (!isAdmin) {
    return (
      <div className="empty-state">
        <p className="empty-state__big">You don&apos;t have access</p>
        <p className="empty-state__sub">This area is for administrators only.</p>
      </div>
    );
  }
  return children;
}
