import { Link } from "react-router-dom";
import { useTranslation } from "../i18n/useTranslation.js";

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="empty-state">
      <p className="empty-state__big">{t("Page not found")}</p>
      <p className="empty-state__sub">
        <Link to="/" className="linkbtn">
          {t("Go back to Game Center")}
        </Link>
      </p>
    </div>
  );
}
