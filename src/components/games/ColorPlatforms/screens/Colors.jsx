/** Color Platforms — cosmetics. Unlocked by total stars; gameplay hues never change. */
import { Icon } from "./icons.jsx";
import { COSMETICS } from "../data/cosmetics.js";
import { totalStars } from "../utils/storage.js";
import MascotPreview from "./MascotPreview.jsx";
import { ui } from "./ui.js";

const TRAIL = { none: "No trail", dots: "Dot trail", neon: "Neon streak", hearts: "Heart trail", bubbles: "Bubble trail", embers: "Ember trail" };

export default function Colors({ progress, onSelect, onBack }) {
  const stars = totalStars(progress);
  return (
    <div className="cp-screen">
      <div className="cp-panel cp-sheet">
        <header className="cp-sheet__head">
          <button type="button" className="cp-iconbtn" aria-label="Back" onClick={onBack} {...ui}>
            <Icon name="back" />
          </button>
          <h2>COLORS</h2>
          <span className="cp-sheet__aside">
            <Icon name="star" /> {stars}
          </span>
        </header>
        <p className="cp-sheet__note">Styles change shade, trail and accessory — Blue, Red and Yellow always stay themselves.</p>
        <ul className="cp-cos">
          {COSMETICS.map((c) => {
            const open = progress.unlockedCosmetics.includes(c.id);
            const on = progress.selectedCosmetic === c.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className={`cp-cos__card${on ? " is-on" : ""}${open ? "" : " is-locked"}`}
                  disabled={!open}
                  onClick={() => onSelect(c.id)}
                  aria-pressed={on}
                  {...ui}
                >
                  <MascotPreview cosmetic={c} assist={progress.settings.assist} locked={!open} />
                  <strong>{c.name}</strong>
                  <small>{open ? (on ? "EQUIPPED" : TRAIL[c.trail]) : <><Icon name="lock" /> {c.stars} <Icon name="star" /></>}</small>
                  {on && <span className="cp-cos__check"><Icon name="check" /></span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
