/**
 * Water Tanks — cosmetic tank styles. Purely visual; unlocked by total
 * stars (no currency, no store). Each card shows a live glass in that style.
 */
import ScreenHead from "../components/ScreenHead.jsx";
import TankGlass from "../components/TankGlass.jsx";
import { Icon, Star } from "../components/icons.jsx";
import { tankGeometry } from "../components/geometry.js";
import { STYLES, styleVars } from "../data/styles.js";
import { summary } from "../utils/progress.js";

const GEO = tankGeometry(64, 104, "standard");

export default function TankStyles({ progress, onSelect, onBack }) {
  const { stars } = summary(progress);
  return (
    <div className="wt-page">
      <ScreenHead kicker="Cosmetics" title="Tanks" onBack={onBack} right={<span className="wt-head__stat"><Star on size={14} /> {stars} / 150</span>} />
      <p className="wt-page__note">Glass styles change only how tanks look — never the puzzle. Earn stars to unlock more.</p>
      <div className="wt-styles">
        {STYLES.map((st) => {
          const unlocked = stars >= st.stars;
          const selected = progress.selectedTankStyle === st.id;
          return (
            <button
              key={st.id}
              type="button"
              className={`wt-style${selected ? " is-selected" : ""}${unlocked ? "" : " is-locked"}`}
              style={styleVars(st.id)}
              onClick={() => unlocked && onSelect(st.id)}
              aria-disabled={!unlocked}
              aria-pressed={selected}
            >
              <span className="wt-style__glass">
                <TankGlass uid={`style-${st.id}`} geo={GEO} capacity={5} amount={3} showNumbers={false} />
              </span>
              <span className="wt-style__text">
                <b>{st.name}</b>
                <small>{st.blurb}</small>
                <em>
                  {selected ? (<><Icon.check /> Equipped</>) : unlocked ? "Tap to equip" : (<><Icon.lock /> {st.stars} stars</>)}
                </em>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
