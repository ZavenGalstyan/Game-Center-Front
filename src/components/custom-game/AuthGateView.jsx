import { PortalEmblem } from "./Emblems.jsx";
import { useTranslation } from "../../i18n/useTranslation.js";

export default function AuthGateView({ sessionExpired, onLogin, onRegister }) {
  const { t } = useTranslation();
  return (
    <div className="cg-gate">
      <div className="cg-gate__art">
        <PortalEmblem />
      </div>

      {sessionExpired && (
        <p className="cg-chip cg-chip--warn" role="status">
          <span className="cg-chip__dot" aria-hidden="true" />
          {t("Your session has expired. Please sign in again.")}
        </p>
      )}

      <h2 id="cg-dialog-title" className="cg-dialog__title cg-dialog__title--center">
        {t("Your Game Starts Here")}
      </h2>
      <p id="cg-dialog-desc" className="cg-dialog__lead cg-dialog__lead--center">
        {t("Sign in or create an account to share your game idea with our team.")}
      </p>

      <div className="cg-gate__actions">
        <button type="button" className="cg-btn cg-btn--primary" onClick={onLogin} data-autofocus>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <path d="M10 17l5-5-5-5M15 12H3" />
          </svg>
          <span>{t("Login")}</span>
        </button>
        <button type="button" className="cg-btn cg-btn--secondary" onClick={onRegister}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M19 8v6M22 11h-6" />
          </svg>
          <span>{t("Create Account")}</span>
        </button>
      </div>
    </div>
  );
}
