/** Jump Ball — main menu. The live bouncing demo on the canvas is the backdrop. */
import { Icon } from "./icons.jsx";
import { levelsDone, totalStars } from "../utils/storage.js";
import { LEVELS } from "../data/levels.js";

export default function MainMenu({ progress, onPlay, onEndless, onBalls, onStats, onSettings }) {
  const done = levelsDone(progress);
  return (
    <div className="jb-menu">
      <div className="jb-menu__head">
        <h1 className="jb-title">
          <span>JUMP</span>
          <span>BALL</span>
        </h1>
        <p className="jb-sub">BOUNCE • CLIMB • GO HIGHER</p>
      </div>
      <div className="jb-menu__actions">
        <button type="button" className="jb-btn jb-btn--primary jb-btn--play" onClick={onPlay}>
          <Icon name="play" />
          PLAY
        </button>
        <div className="jb-menu__row">
          <button type="button" className="jb-btn" onClick={onEndless}>
            <Icon name="infinity" />
            ENDLESS
          </button>
          <button type="button" className="jb-btn" onClick={onBalls}>
            <Icon name="ball" />
            BALLS
          </button>
          <button type="button" className="jb-btn" onClick={onStats}>
            <Icon name="chart" />
            STATISTICS
          </button>
          <button type="button" className="jb-btn" onClick={onSettings}>
            <Icon name="gear" />
            SETTINGS
          </button>
        </div>
        <p className="jb-menu__meta">
          <span>
            <Icon name="flag" /> {done}/{LEVELS.length}
          </span>
          <span>
            <Icon name="star" /> {totalStars(progress)}/{LEVELS.length * 3}
          </span>
          {progress.stats.bestEndless > 0 && (
            <span>
              <Icon name="up" /> {progress.stats.bestEndless} M
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
