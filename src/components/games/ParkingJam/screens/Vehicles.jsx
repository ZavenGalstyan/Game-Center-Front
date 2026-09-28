/**
 * Parking Jam — vehicle style collection. Ten garage bays; each shows a car
 * wearing that style. Styles are purely cosmetic and unlock through level,
 * star and perfect-level milestones — there is no shop and no currency.
 */
import { Icon } from "../components/icons.jsx";
import { SKINS, unlockText } from "../data/skins.js";
import { VehicleBadge } from "../render/Vehicle.jsx";
import { summary } from "../utils/progress.js";

const SHOWCASE = [
  ["compact", "blue"], ["sedan", "red"], ["hatch", "yellow"], ["suv", "green"], ["coupe", "orange"],
  ["sedan", "black"], ["van", "teal", 3], ["coupe", "red"], ["compact", "white"], ["coupe", "purple"],
];

export default function Vehicles({ progress, onSelect, onBack }) {
  const s = summary(progress);
  const owned = progress.unlockedSkins;
  return (
    <div className="pj-garage">
      <header className="pj-head">
        <button type="button" className="pj-btn pj-btn--icon" onClick={onBack} aria-label="Back to menu"><Icon.back /></button>
        <h2 className="pj-head__title">Vehicles</h2>
        <span className="pj-head__meta">{owned.length} / {SKINS.length} styles</span>
      </header>
      <p className="pj-garage__note">Styles repaint every car in the lot. Cosmetic only — size, speed and rules never change.</p>
      <div className="pj-garage__bays">
        {SKINS.map((skin, i) => {
          const have = owned.includes(skin.id);
          const on = progress.selectedVehicleSkin === skin.id;
          const [type, color, cells = 2] = SHOWCASE[i];
          let prog = null;
          if (!have) {
            const u = skin.unlock;
            const cur = u.kind === "levels" ? s.completed : u.kind === "stars" ? s.stars : s.perfect;
            prog = `${Math.min(cur, u.n)} / ${u.n}`;
          }
          return (
            <button
              key={skin.id}
              type="button"
              className={`pj-bay${have ? "" : " is-locked"}${on ? " is-on" : ""}`}
              onClick={() => have && onSelect(skin.id)}
              disabled={!have}
              aria-pressed={on}
            >
              <span className="pj-bay__floor">
                <VehicleBadge type={type} cells={cells} color={color} skin={skin} angle={0} id={`pjg${i}`} />
              </span>
              <span className="pj-bay__info">
                <b>{skin.name}</b>
                <small>{have ? (on ? "Selected" : skin.desc) : unlockText(skin)}</small>
                {prog && <small className="pj-bay__prog"><Icon.lock /> {prog}</small>}
              </span>
              {on && <span className="pj-bay__tag"><Icon.check /></span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
