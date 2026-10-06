/** Color Platforms — main menu. The canvas mascot demo (B → R → Y) is the backdrop. */
import { Icon } from "./icons.jsx";
import { levelsDone, totalStars, continueLevel } from "../utils/storage.js";
import { LEVELS } from "../data/levels/index.js";
import { ui } from "./ui.js";

const TITLE = [
  ["C", "b"],
  ["O", "r"],
  ["L", "y"],
  ["O", "b"],
  ["R", "r"],
];

export default function MainMenu({ progress, onPlay, onLevels, onColors, onStats, onSettings }) {
  const done = levelsDone(progress);
  const fresh = done === 0;
  const next = continueLevel(progress);
  return (
    <div className="cp-menu">
      <div className="cp-menu__col">
        <h1 className="cp-title" aria-label="Color Platforms">
          <span className="cp-title__top" aria-hidden="true">
            {TITLE.map(([ch, c], i) => (
              <i key={i} className={`is-${c}`} style={{ "--i": i }}>
                {ch}
              </i>
            ))}
          </span>
          <span className="cp-title__bottom" aria-hidden="true">
            PLATFORMS
          </span>
        </h1>
        <p className="cp-tagline">
          <span className="is-b">SWITCH</span> • <span className="is-r">JUMP</span> • <span className="is-y">MATCH</span>
        </p>
        <div className="cp-menu__actions">
          <button type="button" className="cp-btn cp-btn--primary cp-btn--play" onClick={onPlay} {...ui}>
            <Icon name="play" />
            {fresh ? "PLAY" : "CONTINUE"}
            {!fresh && <small>LEVEL {next}</small>}
          </button>
          <div className="cp-menu__grid">
            <button type="button" className="cp-btn" onClick={onLevels} {...ui}>
              <Icon name="grid" />
              LEVELS
            </button>
            <button type="button" className="cp-btn" onClick={onColors} {...ui}>
              <Icon name="palette" />
              COLORS
            </button>
            <button type="button" className="cp-btn" onClick={onStats} {...ui}>
              <Icon name="chart" />
              STATISTICS
            </button>
            <button type="button" className="cp-btn" onClick={onSettings} {...ui}>
              <Icon name="gear" />
              SETTINGS
            </button>
          </div>
          <p className="cp-menu__meta">
            <span>
              <Icon name="flag" /> {done}/{LEVELS.length}
            </span>
            <span>
              <Icon name="star" /> {totalStars(progress)}/{LEVELS.length * 3}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
