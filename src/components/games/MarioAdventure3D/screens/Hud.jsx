/**
 * Mario Adventure 3D — in-level HUD and overlay cards.
 *
 * HUD (compact, corners only): hearts + coins/goal (top-left), level name or
 * boss health (top-centre), the three star slots + pause button (top-right),
 * active power-ups with countdown rings (bottom-left), the E prompt
 * (bottom-centre). Cards: start gate, pause, level complete, game over.
 */
import { Heart, Coin, Star, Pause, PowerIcon, Key } from "./icons.jsx";
import { POWER } from "../engine/config.js";

export function Hud({ hud, level, world, onPause, showHints }) {
  const code = `${level.world}-${level.num}`;
  return (
    <div className="ma-hud">
      <div className="ma-hud__tl">
        <div className="ma-hearts" aria-label={`${hud.hearts} of 3 hearts`}>
          {[0, 1, 2].map((i) => (
            <Heart key={i} full={i < hud.hearts} />
          ))}
        </div>
        <div className={`ma-coins${hud.coinGoal && hud.coins >= hud.coinGoal ? " is-goal" : ""}`} aria-label={`${hud.coins} coins`}>
          <Coin />
          <span className="ma-coins__n">{hud.coins}</span>
          <span className="ma-coins__goal">/ {hud.coinGoal}</span>
        </div>
      </div>
      <div className="ma-hud__tc">
        {hud.boss ? (
          <div className="ma-bossbar" aria-label={`${hud.boss.name} health`}>
            <div className="ma-bossbar__name">{hud.boss.name}</div>
            <div className="ma-bossbar__track">
              {Array.from({ length: hud.boss.max }).map((_, i) => (
                <span key={i} className={`ma-bossbar__pip${i < hud.boss.hp ? " is-on" : ""}`} />
              ))}
            </div>
            {hud.boss.phase ? <div className="ma-bossbar__hint">{hud.boss.phase}</div> : null}
          </div>
        ) : (
          <div className="ma-levelname" style={{ "--acc": world.accent }}>
            <span className="ma-levelname__code">{code}</span>
            {level.name}
          </div>
        )}
      </div>
      <div className="ma-hud__tr">
        <div className="ma-starslots" aria-label="Stars this run">
          <Star on={hud.clear} />
          <Star on={hud.coins >= hud.coinGoal} />
          <Star on={hud.hidden} />
        </div>
        <button type="button" className="ma-iconbtn" onClick={onPause} aria-label="Pause (Esc)" title="Pause (Esc)">
          <Pause />
        </button>
      </div>
      <div className="ma-hud__bl">
        {hud.powers.map((p) => (
          <div key={p.type} className={`ma-power${p.left < 2.5 ? " is-ending" : ""}`} style={{ "--pc": POWER[p.type].color, "--k": p.left / POWER[p.type].dur }} title={POWER[p.type].name}>
            <span className="ma-power__ring" />
            <PowerIcon type={p.type} />
            <span className="ma-power__t">{Math.ceil(p.left)}</span>
          </div>
        ))}
      </div>
      {hud.prompt ? (
        <div className="ma-prompt">
          <Key>E</Key> {hud.prompt}
        </div>
      ) : null}
      {showHints ? (
        <div className="ma-hints">
          <span>
            <Key>W</Key>
            <Key>A</Key>
            <Key>S</Key>
            <Key>D</Key> move
          </span>
          <span>
            <Key wide>Space</Key> jump ×2
          </span>
          <span>
            <Key wide>Shift</Key> sprint
          </span>
          <span>Mouse — camera</span>
        </div>
      ) : null}
    </div>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className="ma-toast" key={toast.id} data-kind={toast.kind || ""}>
      {toast.text}
    </div>
  );
}

export function SignMessage({ text, onClose }) {
  if (!text) return null;
  return (
    <div className="ma-sign" role="dialog" aria-live="polite">
      <p>{text}</p>
      <button type="button" className="ma-btn ma-btn--small" onClick={onClose}>
        OK
      </button>
    </div>
  );
}

export function StartGate({ level, world, onStart }) {
  return (
    <div className="ma-overlay ma-overlay--gate" onClick={onStart} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onStart()}>
      <div className="ma-card ma-card--gate" style={{ "--acc": world.accent }}>
        <div className="ma-card__kicker">
          {world.name} · Level {level.num}
        </div>
        <h2 className="ma-card__title">{level.name}</h2>
        {level.boss ? <p className="ma-card__sub">Boss battle! Watch its moves — strike when it's dazed.</p> : <p className="ma-card__sub">Find the goal pole. Coins, secrets and a hidden star await!</p>}
        <div className="ma-card__cta">Click to play</div>
        <div className="ma-card__keys">
          <span>
            <Key>W</Key>
            <Key>A</Key>
            <Key>S</Key>
            <Key>D</Key> move
          </span>
          <span>
            <Key wide>Space</Key> jump / double jump
          </span>
          <span>
            <Key wide>Shift</Key> sprint
          </span>
          <span>
            <Key>E</Key> interact
          </span>
          <span>
            <Key wide>Esc</Key> pause
          </span>
        </div>
      </div>
    </div>
  );
}

export function PauseCard({ onResume, onRestart, onCheckpoint, hasCheckpoint, onSettings, onControls, onQuit }) {
  return (
    <div className="ma-overlay">
      <div className="ma-card ma-card--menu">
        <h2 className="ma-card__title">Paused</h2>
        <div className="ma-stack">
          <button type="button" className="ma-btn ma-btn--primary" onClick={onResume} autoFocus>
            Resume
          </button>
          {hasCheckpoint ? (
            <button type="button" className="ma-btn" onClick={onCheckpoint}>
              Back to checkpoint
            </button>
          ) : null}
          <button type="button" className="ma-btn" onClick={onRestart}>
            Restart level
          </button>
          <button type="button" className="ma-btn" onClick={onSettings}>
            Settings
          </button>
          <button type="button" className="ma-btn" onClick={onControls}>
            Controls
          </button>
          <button type="button" className="ma-btn ma-btn--ghost" onClick={onQuit}>
            World select
          </button>
        </div>
      </div>
    </div>
  );
}

export function Results({ res, onNext, hasNext, onReplay, onWorlds }) {
  const s = res.stars;
  return (
    <div className="ma-overlay ma-overlay--win">
      <div className="ma-card ma-card--results">
        <div className="ma-card__kicker">{res.boss ? "Boss defeated!" : res.levelName}</div>
        <h2 className="ma-card__title ma-card__title--big">Level Complete!</h2>
        <div className="ma-bigstars">
          {[
            ["Clear", s.clear],
            [`${res.coinGoal} coins`, s.coins],
            ["Hidden star", s.hidden],
          ].map(([label, on], i) => (
            <div key={label} className={`ma-bigstar${on ? " is-on" : ""}`} style={{ "--d": `${0.25 + i * 0.22}s` }}>
              <Star on={on} />
              <span>{label}</span>
            </div>
          ))}
        </div>
        <div className="ma-results__row">
          <span>
            <Coin /> {res.coins} / {res.coinTotal}
          </span>
          <span>⏱ {fmtTime(res.time)}</span>
          {res.newBest ? <span className="ma-tag">New best!</span> : null}
        </div>
        {res.unlockText ? <div className="ma-unlock">{res.unlockText}</div> : null}
        <div className="ma-row">
          {hasNext ? (
            <button type="button" className="ma-btn ma-btn--primary" onClick={onNext} autoFocus>
              Next level
            </button>
          ) : null}
          <button type="button" className="ma-btn" onClick={onReplay}>
            Replay
          </button>
          <button type="button" className="ma-btn ma-btn--ghost" onClick={onWorlds}>
            World select
          </button>
        </div>
      </div>
    </div>
  );
}

export function GameOver({ onContinue, onRestart, onWorlds, hasCheckpoint }) {
  return (
    <div className="ma-overlay ma-overlay--lose">
      <div className="ma-card ma-card--menu">
        <h2 className="ma-card__title ma-card__title--big ma-card__title--lose">Game Over</h2>
        <p className="ma-card__sub">Out of hearts! Coins and the hidden star you found are kept.</p>
        <div className="ma-stack">
          <button type="button" className="ma-btn ma-btn--primary" onClick={onContinue} autoFocus>
            {hasCheckpoint ? "Continue from checkpoint" : "Try again"}
          </button>
          <button type="button" className="ma-btn" onClick={onRestart}>
            Restart level
          </button>
          <button type="button" className="ma-btn ma-btn--ghost" onClick={onWorlds}>
            World select
          </button>
        </div>
      </div>
    </div>
  );
}

export function fmtTime(t) {
  if (!(t > 0)) return "--:--";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
