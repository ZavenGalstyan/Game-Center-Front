/**
 * Liquid Sort — Main Menu. A little idle stage of real glass bottles (one
 * gently tilting through a demo pour) instead of plain buttons on a flat
 * background — the game should look good before anyone taps Play.
 *
 * Laid out to fit the GamePlayer stage without scrolling on normal desktop
 * sizes: everything below sizes off the container's own height (`cqh`, see
 * `container-type: size` on `.ls`) instead of fixed pixels, and the
 * secondary actions are one compact icon row instead of three stacked
 * full-width buttons.
 */
import GameDefs from "../components/GameDefs.jsx";
import Bottle from "../components/Bottle.jsx";
import { IconPlay, IconGrid, IconChart, IconSettings } from "../components/icons.jsx";
import { TOTAL_LEVELS } from "../data/chapters.js";

const DEMO_BOTTLES = [
  ["crimson", "crimson", "crimson", "crimson"],
  ["ocean", "ocean", "lemon", "lemon"],
  ["emerald", "emerald", "emerald"],
  ["violet", "orange", "cyan"],
];

export default function LiquidMenu({ state, onPlay, onLevels, onStats, onSettings }) {
  const totalStars = state.statistics.totalStars;

  return (
    <div className="ls-menu">
      <GameDefs />
      <div className="ls-menu__stage" aria-hidden="true">
        {DEMO_BOTTLES.map((colors, i) => (
          <Bottle
            key={i}
            colors={colors}
            styleId={state.cosmetics.bottleStyle}
            disabled
            animationsOn={state.settings.animations}
            label=""
            className={i === 2 && state.settings.animations ? "ls-bottle--demo-pour" : ""}
          />
        ))}
      </div>

      <h1 className="ls-menu__title">LIQUID<br />SORT</h1>
      <p className="ls-menu__subtitle">Pour · Match · Solve</p>

      <div className="ls-menu__stats">
        <div className="ls-menu__stat"><b>{state.statistics.levelsCompleted}/{TOTAL_LEVELS}</b><span>Completed</span></div>
        <div className="ls-menu__stat"><b>{totalStars}</b><span>Stars</span></div>
        <div className="ls-menu__stat"><b>{state.statistics.perfectSolves}</b><span>Perfect</span></div>
      </div>

      <div className="ls-menu__actions">
        <button type="button" className="ls-btn ls-btn--primary ls-menu__play" onClick={onPlay}>
          <IconPlay width={18} height={18} /> Play
        </button>
        <div className="ls-menu__secondary">
          <button type="button" className="ls-btn ls-menu__iconbtn" onClick={onLevels}>
            <IconGrid width={18} height={18} /><span>Levels</span>
          </button>
          <button type="button" className="ls-btn ls-menu__iconbtn" onClick={onStats}>
            <IconChart width={18} height={18} /><span>Stats</span>
          </button>
          <button type="button" className="ls-btn ls-menu__iconbtn" onClick={onSettings}>
            <IconSettings width={18} height={18} /><span>Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
}
