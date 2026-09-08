/**
 * Fishing Journey — shared header for the non-menu screens: a Back button,
 * the screen title (with an optional lead line), and the live coin balance.
 */
import CoinDisplay from "./CoinDisplay.jsx";
import { IconChevronLeft } from "./Icons.jsx";

export default function ScreenHeader({
  title,
  subtitle,
  coins,
  onBack,
  backLabel = "Menu",
  icon = null,
}) {
  return (
    <header className="fj-screen__header">
      <button
        type="button"
        className="fj-btn fj-btn--ghost fj-btn--sm fj-screen__back"
        onClick={onBack}
      >
        <IconChevronLeft className="fj-screen__back-icon" />
        {backLabel}
      </button>

      <div className="fj-screen__heading">
        {icon && <span className="fj-screen__heading-icon" aria-hidden="true">{icon}</span>}
        <div>
          <h2 className="fj-screen__title">{title}</h2>
          {subtitle && <p className="fj-screen__subtitle">{subtitle}</p>}
        </div>
      </div>

      <CoinDisplay coins={coins} />
    </header>
  );
}
