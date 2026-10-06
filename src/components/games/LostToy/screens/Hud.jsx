/**
 * Lost Toy — in-run overlays: a deliberately minimal HUD (level name ·
 * Memory Buttons · optional timer), contextual hints, the "E" prompt (only
 * near something usable), toasts, the pause card and the results card.
 * The timer text, fade and prompt are written directly by the renderer
 * (refs), so none of this re-renders per frame.
 */
import { Btn, ButtonPips } from "./ui.jsx";
import { formatTime } from "../three/gameRenderer.js";
import { MEMORIES } from "../data/memories.js";
import { Icon } from "./icons.jsx";

export const HINTS = {
  move: { keys: ["W", "A", "S", "D"], text: "Walk", sub: "Mouse to look around", touch: { keys: ["STICK"], text: "Walk", sub: "Drag the right side to look" } },
  jump: { keys: ["SPACE"], text: "Jump", sub: "Hold for a higher jump", touch: { keys: ["JUMP"], text: "Jump", sub: "Hold for a higher jump" } },
  bounce: { keys: ["SPACE"], text: "Soft things bounce", sub: "Drop onto the pillow — hold Space for a big bounce", touch: { keys: ["JUMP"], text: "Soft things bounce", sub: "Hold Jump as you land for a big bounce" } },
  push: { keys: [], text: "Push", sub: "Walk into the block to slide it", touch: { keys: [], text: "Push", sub: "Walk into the block to slide it" } },
  ledge: { keys: [], text: "Grab ledges", sub: "Jump at an edge — Pip pulls up", touch: { keys: [], text: "Grab ledges", sub: "Jump at an edge — Pip pulls up" } },
  interact: { keys: ["E"], text: "Use things", sub: "Wind the crank", touch: { keys: ["USE"], text: "Use things", sub: "Wind the crank" } },
  ride: { keys: [], text: "Hop on", sub: "Moving toys carry you", touch: { keys: [], text: "Hop on", sub: "Moving toys carry you" } },
  climb: { keys: [], text: "Climb cloth", sub: "Jump onto it and hold forward", touch: { keys: [], text: "Climb cloth", sub: "Jump onto it and push forward" } },
  balance: { keys: [], text: "Balance", sub: "Narrow beams — slow and steady", touch: { keys: [], text: "Balance", sub: "Narrow beams — slow and steady" } },
  sprint: { keys: ["SHIFT"], text: "Sprint", sub: "Longer jumps", touch: { keys: ["STICK"], text: "Sprint", sub: "Push the stick all the way" } },
  explore: { keys: [], text: "Memory Buttons", sub: "Optional — hidden off the main path", touch: { keys: [], text: "Memory Buttons", sub: "Optional — hidden off the main path" } },
  pet: { keys: [], text: "A giant friend", sub: "Pets are curious, not mean — watch their timing", touch: { keys: [], text: "A giant friend", sub: "Watch their timing" } },
  water: { keys: [], text: "Water is deep", sub: "Shallow puddles slow you; deep water sends you back", touch: { keys: [], text: "Water is deep", sub: "Deep water sends you back" } },
  wind: { keys: [], text: "Wind", sub: "Lean into the breeze", touch: { keys: [], text: "Wind", sub: "Lean into the breeze" } },
};

export function Hud({ level, world, hud, touch, onPause, timerRef, showTimer, promptRef }) {
  return (
    <div className="lt-hud">
      <div className="lt-hud__lvl">
        <span className="lt-hud__num" style={{ background: world.accent }}>
          {level.id}
        </span>
        <span className="lt-hud__name">{level.name}</span>
      </div>
      <div className="lt-hud__right">
        {showTimer && (
          <div className="lt-hud__timer">
            <Icon name="clock" />
            <span ref={timerRef}>0:00.0</span>
          </div>
        )}
        <div className="lt-hud__buttons" title="Memory Buttons">
          <ButtonPips got={hud.buttons} size="md" />
        </div>
        {touch && (
          <button type="button" className="lt-hud__pause" onClick={onPause} aria-label="Pause">
            <Icon name="pause" />
          </button>
        )}
      </div>
      <div ref={promptRef} className="lt-prompt">
        <kbd>{touch ? "USE" : "E"}</kbd>
        <span data-label>Interact</span>
      </div>
      {hud.toast && (
        <div key={hud.toast.key} className={`lt-toast lt-toast--${hud.toast.tone || "info"}`}>
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
    <div className="lt-hint" key={id}>
      {h.keys.length > 0 && (
        <div className="lt-hint__keys">
          {h.keys.map((k) => (
            <kbd key={k} className={k.length > 1 ? "wide" : ""}>
              {k}
            </kbd>
          ))}
        </div>
      )}
      <div className="lt-hint__text">
        <b>{h.text}</b>
        <span>{h.sub}</span>
      </div>
    </div>
  );
}

export function PauseCard({ level, world, onResume, onRestart, onSettings, onControls, onLevels, onMenu }) {
  return (
    <div className="lt-overlay">
      <div className="lt-card lt-card--pause">
        <div className="lt-card__eyebrow" style={{ color: world.accent }}>
          {world.name} · Level {level.id}
        </div>
        <div className="lt-card__title">Paused</div>
        <div className="lt-card__stack">
          <Btn kind="primary" onClick={onResume}>
            <Icon name="play" /> Resume
          </Btn>
          <Btn onClick={onRestart}>
            <Icon name="retry" /> Restart level
          </Btn>
          <div className="lt-row">
            <Btn onClick={onSettings}>
              <Icon name="gear" /> Settings
            </Btn>
            <Btn onClick={onControls}>
              <Icon name="keys" /> Controls
            </Btn>
          </div>
          <div className="lt-row">
            <Btn onClick={onLevels}>
              <Icon name="map" /> Levels
            </Btn>
            <Btn onClick={onMenu}>
              <Icon name="home" /> Menu
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Results({ level, world, res, showTimer, hasNext, onRetry, onNext, onLevels }) {
  const mems = (res.memories || []).map((id) => MEMORIES.find((m) => m.id === id)).filter(Boolean);
  const last = level.id === 50;
  return (
    <div className="lt-overlay lt-overlay--results">
      <div className="lt-card lt-card--results">
        <div className="lt-card__eyebrow" style={{ color: world.accent }}>
          {world.name} · Level {level.id}
        </div>
        <div className="lt-card__title">{last ? "Home Again" : "Level Complete"}</div>
        <div className="lt-card__sub">{level.name}</div>
        <div className="lt-results__buttons">
          <ButtonPips got={res.buttons} size="lg" />
          <span>
            Memory Buttons <b>{res.buttons.filter(Boolean).length}/3</b>
            {res.savedButtons && res.savedButtons.filter(Boolean).length > res.buttons.filter(Boolean).length && <em> · {res.savedButtons.filter(Boolean).length}/3 found overall</em>}
          </span>
        </div>
        <div className="lt-results__grid">
          <div>
            <small>Falls</small>
            <b>{res.falls}</b>
          </div>
          {showTimer && (
            <div>
              <small>Time</small>
              <b>{formatTime(res.time)}</b>
            </div>
          )}
          {showTimer && (
            <div>
              <small>Best</small>
              <b>
                {formatTime(res.best)}
                {res.newBest && <em className="lt-new">new!</em>}
              </b>
            </div>
          )}
        </div>
        {(mems.length > 0 || res.cosmetics.length > 0 || res.unlocked.length > 0) && (
          <div className="lt-results__unlocks">
            {mems.map((m) => (
              <span key={m.id} className="lt-chip lt-chip--gold">
                <Icon name="heart" /> Memory: {m.title}
              </span>
            ))}
            {res.cosmetics.map((c) => (
              <span key={c} className="lt-chip">
                <Icon name="shirt" /> New look: {c}
              </span>
            ))}
            {res.unlocked.map((id) => (
              <span key={id} className="lt-chip">
                <Icon name="unlock" /> Level {id} unlocked
              </span>
            ))}
          </div>
        )}
        <div className="lt-card__actions">
          <Btn onClick={onLevels}>
            <Icon name="map" /> Levels
          </Btn>
          <Btn onClick={onRetry}>
            <Icon name="retry" /> Replay
          </Btn>
          {hasNext && (
            <Btn kind="primary" onClick={onNext}>
              Next level <Icon name="next" />
            </Btn>
          )}
        </div>
      </div>
    </div>
  );
}
