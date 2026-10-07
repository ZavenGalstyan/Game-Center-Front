/** Water Tanks — shared header for the menu-style screens. */
import { Icon } from "./icons.jsx";

export default function ScreenHead({ title, kicker, onBack, right = null }) {
  return (
    <header className="wt-head">
      <button type="button" className="wt-iconbtn" onClick={onBack} aria-label="Back"><Icon.back /></button>
      <div className="wt-head__titles">
        {kicker && <span className="wt-head__kicker">{kicker}</span>}
        <h2 className="wt-head__title">{title}</h2>
      </div>
      <div className="wt-head__right">{right}</div>
    </header>
  );
}
