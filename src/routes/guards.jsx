import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { isGameRequestsAdmin } from "../auth/gameRequestsAdmin.js";
import { useTranslation } from "../i18n/useTranslation.js";

/** Gate that requires a hydrated, authenticated user (guide §9.8). */
export function RequireAuth({ children }) {
  const { t } = useTranslation();
  const { status } = useAuth();
  if (status === "loading") return <p className="muted">{t("Loading…")}</p>;
  if (status !== "authenticated") return <Navigate to="/" replace />;
  return children;
}

/** Gate that additionally requires role === "admin". */
export function RequireAdmin({ children }) {
  const { t } = useTranslation();
  const { status, isAdmin } = useAuth();
  if (status === "loading") return <p className="muted">{t("Loading…")}</p>;
  if (status !== "authenticated") return <Navigate to="/" replace />;
  if (!isAdmin) {
    return (
      <div className="empty-state">
        <p className="empty-state__big">{t("You don't have access")}</p>
        <p className="empty-state__sub">{t("This area is for administrators only.")}</p>
      </div>
    );
  }
  return children;
}

/**
 * Gate for the Game Requests admin page: username must be exactly "Admin".
 * Children only mount past this check, so nobody else ever triggers its API
 * calls; the backend still enforces the real admin role.
 */
export function RequireGameRequestsAdmin({ children }) {
  const { t } = useTranslation();
  const { status, user } = useAuth();
  if (status === "loading") return <p className="muted">{t("Loading…")}</p>;
  if (status !== "authenticated") return <Navigate to="/" replace />;
  if (!isGameRequestsAdmin(user)) {
    return (
      <div className="empty-state">
        <p className="empty-state__big">{t("You don't have access")}</p>
        <p className="empty-state__sub">{t("This area is for administrators only.")}</p>
      </div>
    );
  }
  return children;
}
