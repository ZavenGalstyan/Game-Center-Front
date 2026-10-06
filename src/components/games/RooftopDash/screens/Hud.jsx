/**
 * Rooftop Dash — in-run overlays: HUD (level · timer · stars · dash pip),
 * contextual tutorial hints, flow callouts, checkpoint toast, pause card and
 * the results card. The timer text and the fall fade are written directly by
 * the renderer (refs), so none of this re-renders per frame.
 */
import { formatTime } from "../three/gameRenderer.js";
import { Btn, Stars } from "./Menus.jsx";
import { IconStar, IconPause, IconTimer, IconFall, IconWave, IconRetry, IconNext, IconMap, IconPlay, IconGear, IconHome, IconFlag, IconCheck, IconBolt } from "./icons.jsx";

const HINTS = {
  move: { keys: ["W", "A", "S", "D"], text: "Move", sub: "Mouse to look", touch: { keys: ["STICK"], text: "Move", sub: "Drag right side to look" } },
  jump: { keys: ["SPACE"], text: "Jump", sub: "Hold for a higher jump", touch: { keys: ["JUMP"], text: "Jump", sub: "Hold for a higher jump" } },
  vault: { keys: [], text: "Vault", sub: "Run straight at low obstacles", touch: { keys: [], text: "Vault", sub: "Run straight at low obstacles" } },
  slide: { keys: ["C"], text: "Slide", sub: "While running — under the pipe", touch: { keys: ["SLIDE"], text: "Slide", sub: "While running — under the pipe" } },
  sprint: { keys: ["SHIFT"], text: "Sprint", sub: "Longer jumps", touch: { keys: ["STICK"], text: "Sprint", sub: "Push the stick all the way" } },
  wallrun: { keys: ["SPACE"], text: "Wall run", sub: "Jump alongside painted walls", touch: { keys: ["JUMP"], text: "Wall run", sub: "Jump alongside painted walls" } },
  walljump: { keys: ["SPACE"], text: "Wall jump", sub: "While on the wall — push off to the roof", touch: { keys: ["JUMP"], text: "Wall jump", sub: "While on the wall" } },
  dash: { keys: ["E"], text: "Dash", sub: "In the air — once per jump", touch: { keys: ["DASH"], text: "Dash", sub: "In the air — once per jump" } },
};

export function Hud({ level, world, hud, touch, onPause, timerRef, dashRef }) {
  return (
    <div className="rd-hud">
      <div className="rd-hud__lvl">
        <span className="rd-hud__num" style={{ background: world.accent }}>
          {level.id}
        </span>
        <span className="rd-hud__name">{level.name}</span>
      </div>
      <div className="rd-hud__timer">
        <IconTimer />
        <span ref={timerRef}>0:00.00</span>
        {!hud.started && <em>ready</em>}
      </div>
      <div className="rd-hud__stars">
        {[0, 1, 2].map((i) => (
          <IconStar key={i} filled={i < hud.stars} className={i < hud.stars ? "on" : "off"} />
        ))}
        {touch && (
          <button type="button" className="rd-hud__pause" onClick={onPause} aria-label="Pause">
            <IconPause />
          </button>
        )}
      </div>
      <div ref={dashRef} className="rd-dash rd-dash--ready" title="Dash">
        <IconBolt />
      </div>
      {hud.flow && (
        <div key={hud.flowKey} className="rd-flow">
          <span>{hud.flow}</span>
          <small>x{hud.flowCount}</small>
        </div>
      )}
      {hud.toast && (
        <div key={hud.toast.key} className={`rd-toast rd-toast--${hud.toast.tone || "info"}`}>
          {hud.toast.text}
        </div>
      )}
    </div>
  );
}

export function Hint({ id, touch }) {
  const H = HINTS[id];
  if (!H) return null;
  const h = touch ? H.touch : H;
  return (
    <div className="rd-hint" key={id}>
      {h.keys.length > 0 && (
        <div className="rd-hint__keys">
          {h.keys.map((k) => (
            <kbd key={k} className={k.length > 1 ? "wide" : ""}>
              {k}
            </kbd>
          ))}
        </div>
      )}
      <div className="rd-hint__text">
        <b>{h.text}</b>
        <span>{h.sub}</span>
      </div>
    </div>
  );
}

export function PauseCard({ level, world, onResume, onRestart, onSettings, onControls, onLevels, onMenu }) {
  return (
    <div className="rd-overlay">
      <div className="rd-card rd-card--pause">
        <div className="rd-card__eyebrow" style={{ color: world.accent }}>
          {world.name} · Level {level.id}
        </div>
        <div className="rd-card__title">Paused</div>
        <div className="rd-card__btns">
          <Btn kind="primary" onClick={onResume}>
            <IconPlay /> Resume
          </Btn>
          <Btn onClick={onRestart}>
            <IconRetry /> Restart level
          </Btn>
          <Btn onClick={onSettings}>
            <IconGear /> Settings
          </Btn>
          <Btn onClick={onControls}>Controls</Btn>
          <Btn onClick={onLevels}>
            <IconMap /> Level select
          </Btn>
          <Btn kind="ghost" onClick={onMenu}>
            <IconHome /> Main menu
          </Btn>
        </div>
      </div>
    </div>
  );
}

export function Results({ level, world, res, hasNext, onRetry, onNext, onLevels }) {
  return (
    <div className="rd-overlay rd-overlay--results">
      <div className="rd-card rd-card--results">
        <div className="rd-card__eyebrow" style={{ color: world.accent }}>
          Level {level.id} · {level.name}
        </div>
        <div className="rd-card__title rd-card__title--big">Level complete</div>
        <div className="rd-res__stars">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`rd-res__star ${res.stars[i] ? "on" : ""}`} style={{ animationDelay: `${0.25 + i * 0.18}s` }}>
              <IconStar filled={res.stars[i]} />
            </span>
          ))}
        </div>
        <div className="rd-res__grid">
          <div>
            <IconTimer />
            <span>Time</span>
            <b>{formatTime(res.time)}</b>
            {res.newBest && <em className="rd-tag">New best</em>}
          </div>
          <div>
            <IconFlag />
            <span>Best</span>
            <b>{formatTime(res.best)}</b>
          </div>
          <div>
            <IconCheck />
            <span>Target</span>
            <b>{formatTime(level.targetTime)}</b>
            {res.targetBeaten && <em className="rd-tag rd-tag--ok">Beaten</em>}
          </div>
          <div>
            <IconFall />
            <span>Falls</span>
            <b>{res.falls}</b>
          </div>
          <div>
            <IconWave />
            <span>Best flow</span>
            <b>{res.flowBest ? `x${res.flowBest}` : "—"}</b>
          </div>
          <div>
            <IconStar />
            <span>Stars</span>
            <Stars n={res.stars.filter(Boolean).length} />
          </div>
        </div>
        {(res.unlocked.length > 0 || res.cosmetics.length > 0) && (
          <div className="rd-res__unlocks">
            {res.unlocked.map((id) => (
              <span key={id} className="rd-tag rd-tag--ok">
                Level {id} unlocked
              </span>
            ))}
            {res.cosmetics.map((n) => (
              <span key={n} className="rd-tag">
                New: {n}
              </span>
            ))}
          </div>
        )}
        <div className="rd-card__row">
          <Btn onClick={onRetry}>
            <IconRetry /> Retry
          </Btn>
          {hasNext && (
            <Btn kind="primary" onClick={onNext}>
              Next level <IconNext />
            </Btn>
          )}
          <Btn kind="ghost" onClick={onLevels}>
            <IconMap /> Level select
          </Btn>
        </div>
      </div>
    </div>
  );
}

export { HINTS };
