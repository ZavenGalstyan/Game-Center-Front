/**
 * Mini Golf Journey — in-game HUD.
 *
 * Compact, never covers the shot: world + level on the left, par / strokes on
 * the right, a small pause control. Reorganises to a single row on narrow
 * screens via CSS container queries.
 */
import { IconPause, IconRestart } from "./Icons.jsx";

export default function GolfHUD({ world, level, par, strokes, onPause, onRestart }) {
  const over = strokes - par;
  const tone = strokes === 0 ? "" : over <= 0 ? "is-good" : over === 1 ? "is-warn" : "is-bad";
  return (
    <div className="mgj-hud">
      <div className="mgj-hud__id">
        <span className="mgj-hud__world" style={{ "--w-accent": world.palette.accent }}>
          {world.name}
        </span>
        <span className="mgj-hud__level">
          Level {level.levelNumber} <i>/ 10</i>
        </span>
      </div>

      <div className="mgj-hud__score">
        <div className="mgj-hud__stat">
          <span className="mgj-hud__stat-k">Par</span>
          <span className="mgj-hud__stat-v">{par}</span>
        </div>
        <div className={`mgj-hud__stat mgj-hud__stat--strokes ${tone}`}>
          <span className="mgj-hud__stat-k">Strokes</span>
          <span className="mgj-hud__stat-v">{strokes}</span>
        </div>
      </div>

      <div className="mgj-hud__ctrl">
        <button type="button" className="mgj-iconbtn" onClick={onRestart} title="Restart hole">
          <IconRestart />
        </button>
        <button type="button" className="mgj-iconbtn" onClick={onPause} title="Pause">
          <IconPause />
        </button>
      </div>
    </div>
  );
}
