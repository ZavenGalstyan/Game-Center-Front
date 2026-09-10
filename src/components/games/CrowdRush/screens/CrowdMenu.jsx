/**
 * Crowd Rush — main menu. The 3D diorama fills the background; the title, totals
 * and buttons sit on a soft gradient panel over it, plus a quick crowd-colour
 * picker.
 */

import MenuScene from "../game/MenuScene.jsx";
import { getWorld } from "../data/worlds.js";
import { overallProgress } from "../utils/progression.js";
import { CROWD_COLORS } from "../utils/storage.js";
import { TOTAL_LEVELS } from "../data/levels.js";

export default function CrowdMenu({ state, colorHex, onPlay, onLevels, onStats, onSettings }) {
  const p = overallProgress(state);
  const world = getWorld("sunny-park");

  return (
    <div className="cr-screen cr-menu">
      <div className="cr-menu__scene">
        <MenuScene colorHex={colorHex} world={world} />
      </div>
      <div className="cr-menu__veil" />

      <div className="cr-menu__body">
        <div className="cr-menu__brand">
          <h1 className="cr-menu__title">CROWD<br />RUSH</h1>
          <p className="cr-menu__subtitle">Grow • Dodge • Conquer</p>
        </div>

        <div className="cr-menu__stats">
          <Stat value={`${p.stars} / ${TOTAL_LEVELS * 3}`} label="Total Stars" />
          <Stat value={`${p.completed} / ${p.total}`} label="Levels Completed" />
          <Stat value={p.bestCrowd || "—"} label="Best Crowd" />
        </div>

        <div className="cr-menu__actions">
          <button type="button" className="cr-btn cr-btn--primary cr-btn--lg" onClick={onPlay}>Play</button>
          <button type="button" className="cr-btn cr-btn--lg" onClick={onLevels}>Level Select</button>
          <div className="cr-menu__row">
            <button type="button" className="cr-btn" onClick={onStats}>Statistics</button>
            <button type="button" className="cr-btn" onClick={onSettings}>Settings</button>
          </div>
        </div>

        <div className="cr-menu__swatches">
          {CROWD_COLORS.map((c) => (
            <span
              key={c.id}
              className={`cr-swatch ${state.selectedColor === c.id ? "is-active" : ""}`}
              style={{ background: c.hex }}
              title={c.name}
            />
          ))}
          <span className="cr-menu__swatch-hint">Change colour in Settings</span>
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label }) {
  return (
    <div className="cr-stat">
      <span className="cr-stat__value">{value}</span>
      <span className="cr-stat__label">{label}</span>
    </div>
  );
}
