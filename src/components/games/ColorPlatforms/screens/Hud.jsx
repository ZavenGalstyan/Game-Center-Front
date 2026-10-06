/**
 * Color Platforms — in-level HUD: level label + pause, small timer, stars,
 * falls, the active-color selector (keys 1/2/3 on desktop, big buttons on
 * touch), contextual hints and the touch movement pads.
 */
import { Icon, COLOR_ICON } from "./icons.jsx";
import { PLAYER_COLORS } from "../engine/constants.js";
import { fmtTime } from "./ui.js";

const NAME = { BLUE: "BLUE", RED: "RED", YELLOW: "YELLOW" };

export function Hud({ level, chapter, hud, onPause, paused, done, controlHelp, touch, onColor, hint, banner, showIntro }) {
  return (
    <div className="cp-hud">
      <div className="cp-hud__top">
        <div className="cp-hud__left">
          <button type="button" className="cp-iconbtn" aria-label="Pause" onClick={onPause} disabled={done || paused}>
            <Icon name="pause" />
          </button>
          <div className="cp-hud__label">
            <span>{chapter.name}</span>
            <strong>
              {level.id} · {level.name}
            </strong>
          </div>
        </div>
        <div className="cp-hud__center">
          <div className="cp-timer" aria-label="Time">
            <Icon name="clock" />
            {fmtTime(hud.time)}
          </div>
        </div>
        <div className="cp-hud__right">
          {hud.falls > 0 && (
            <div className="cp-falls" title="Falls">
              <Icon name="fall" />
              {hud.falls}
            </div>
          )}
          <div className="cp-stars" aria-label={`${hud.stars} of 3 stars`}>
            {[0, 1, 2].map((i) => (
              <Icon key={i} name="star" className={hud.starsGot?.[i] ? "is-on" : ""} />
            ))}
          </div>
        </div>
      </div>

      {showIntro && (
        <div className="cp-banner" key={`intro${level.id}`}>
          <span>LEVEL {level.id}</span>
          <strong>{level.name}</strong>
        </div>
      )}
      {banner && (
        <div className="cp-toast-mini" key={banner.key}>
          {banner.text}
        </div>
      )}

      {hint && !done && !paused && (
        <div className="cp-hint" key={hint.key}>
          {(touch ? hint.touchKeys || hint.keys : hint.keys).map((k) => (
            <kbd key={k} className={hint.color && /^[123]$/.test(k) ? `is-${hint.color.toLowerCase()}` : ""}>
              {k}
            </kbd>
          ))}
          <em className={hint.color ? `is-${hint.color.toLowerCase()}` : ""}>{hint.alt}</em>
        </div>
      )}

      {!touch && (
        <div className="cp-colorbar" role="group" aria-label="Active color">
          {PLAYER_COLORS.map((c, i) => (
            <button
              key={c}
              type="button"
              tabIndex={-1}
              className={`cp-chip is-${c.toLowerCase()}${hud.color === c ? " is-on" : ""}`}
              aria-pressed={hud.color === c}
              aria-label={`${NAME[c]} (key ${i + 1})`}
              onPointerDown={(e) => {
                e.preventDefault();
                onColor(c);
              }}
            >
              {controlHelp && <kbd>{i + 1}</kbd>}
              <Icon name={COLOR_ICON[c]} />
              <span>{NAME[c]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Touch controls: ◀ ▶ on the left; colors + JUMP on the right. Pointer-down = immediate. */
export function TouchControls({ color, onMove, onJump, onColor }) {
  const hold = (key) => ({
    onPointerDown: (e) => {
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      onMove(key, true);
    },
    onPointerUp: () => onMove(key, false),
    onPointerCancel: () => onMove(key, false),
    onLostPointerCapture: () => onMove(key, false),
  });
  return (
    <div className="cp-touch">
      <div className="cp-touch__left">
        <button type="button" className="cp-pad" aria-label="Move left" {...hold("left")}>
          <Icon name="left" />
        </button>
        <button type="button" className="cp-pad" aria-label="Move right" {...hold("right")}>
          <Icon name="right" />
        </button>
      </div>
      <div className="cp-touch__right">
        <div className="cp-touch__colors">
          {PLAYER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`cp-tcolor is-${c.toLowerCase()}${color === c ? " is-on" : ""}`}
              aria-label={NAME[c]}
              aria-pressed={color === c}
              onPointerDown={(e) => {
                e.preventDefault();
                onColor(c);
              }}
            >
              <Icon name={COLOR_ICON[c]} />
            </button>
          ))}
        </div>
        <button
          type="button"
          className="cp-pad cp-pad--jump"
          aria-label="Jump"
          onPointerDown={(e) => {
            e.preventDefault();
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              /* ignore */
            }
            onJump(true);
          }}
          onPointerUp={() => onJump(false)}
          onPointerCancel={() => onJump(false)}
          onLostPointerCapture={() => onJump(false)}
        >
          <Icon name="up" />
          <span>JUMP</span>
        </button>
      </div>
    </div>
  );
}
