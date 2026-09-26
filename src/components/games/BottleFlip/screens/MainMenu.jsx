/** Bottle Flip — main menu over a living room scene. */
import MenuScene from "./MenuScene.jsx";
import { Icon } from "../components/icons.jsx";
import { totalStars, highestCompleted, nextLevelId } from "../utils/progress.js";
import { TOTAL_LEVELS } from "../levels/levels.js";

export default function MainMenu({ progress, skin, settings, onPlay, onLevels, onBottles, onStats, onSettings }) {
  const stars = totalStars(progress);
  const done = highestCompleted(progress);
  const fresh = done === 0;
  return (
    <div className="bf-screen bf-menu">
      <MenuScene skin={skin} settings={settings} />
      <div className="bf-menu__shade" />
      <div className="bf-menu__panel">
        <div className="bf-title">
          <h1>
            BOTTLE <span>FLIP</span>
          </h1>
          <p>FLIP • LAND • MASTER</p>
        </div>
        <button type="button" className="bf-btn bf-btn--primary bf-btn--big" onClick={onPlay}>
          <Icon.play /> {fresh ? "PLAY" : `PLAY · LEVEL ${nextLevelId(progress)}`}
        </button>
        <div className="bf-menu__grid">
          <button type="button" className="bf-btn" onClick={onLevels}>
            <Icon.grid /> LEVELS
          </button>
          <button type="button" className="bf-btn" onClick={onBottles}>
            <Icon.bottle /> BOTTLES
          </button>
          <button type="button" className="bf-btn" onClick={onStats}>
            <Icon.chart /> STATISTICS
          </button>
          <button type="button" className="bf-btn" onClick={onSettings}>
            <Icon.gear /> SETTINGS
          </button>
        </div>
        <div className="bf-menu__meta">
          <span>
            <Icon.star /> {stars} / {TOTAL_LEVELS * 3}
          </span>
          <span>
            {done} / {TOTAL_LEVELS} levels
          </span>
        </div>
      </div>
    </div>
  );
}
