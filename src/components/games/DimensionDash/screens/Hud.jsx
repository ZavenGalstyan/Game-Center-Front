/**
 * Dimension Dash — in-level HUD and overlays: score / time / rings / lives,
 * level + objective, the 2.5D ⇄ 3D mode chip and shift banner, power-up
 * timers, red-star slots, speed meter, boss bar, toasts, start gate, pause,
 * results (rank stamp + bonus tally) and game over.
 */
import { useEffect, useState } from "react";
import { POWER } from "../engine/config.js";

export const fmtTime = (t) => {
  if (!Number.isFinite(t)) return "--:--";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t * 100) % 100);
  return `${m}'${String(s).padStart(2, "0")}"${String(cs).padStart(2, "0")}`;
};

export function RingIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <ellipse cx="12" cy="12" rx="8" ry="9" fill="none" stroke="#ffcc22" strokeWidth="3.4" />
      <ellipse cx="10" cy="9" rx="2" ry="3" fill="#fff6c0" opacity="0.8" />
    </svg>
  );
}
export function StarIcon({ on, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill="none" stroke={on ? "#ff2a3a" : "rgba(255,255,255,0.35)"} strokeWidth="2" />
      <path d="M12 4.5l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7z" fill={on ? "#ff2a3a" : "rgba(255,255,255,0.18)"} />
    </svg>
  );
}
export function HeadIcon({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M4 18 L1 10 L8 12 L5 4 L13 8 L16 2 L19 9 Q28 9 28 18 Q28 28 17 28 Q6 28 4 18Z" fill="#1f4fe0" />
      <ellipse cx="19" cy="17" rx="6" ry="7" fill="#fff" />
      <ellipse cx="21" cy="17" rx="2.2" ry="3.4" fill="#2fb84a" />
      <ellipse cx="21.5" cy="17" rx="1" ry="1.8" fill="#111" />
      <ellipse cx="18" cy="24" rx="6" ry="3" fill="#f6c99a" />
    </svg>
  );
}

const POWER_LABEL = { speed: "SPEED", magnet: "MAGNET", shield: "SHIELD", invincible: "INVINCIBLE", jump: "HI-JUMP" };

export function Hud({ hud, level, world, onPause, showHints }) {
  const ringsLow = hud.rings === 0;
  return (
    <div className="dd-hud" data-world={world.key}>
      <div className="dd-hud__tl">
        <div className="dd-hud__row">
          <span className="dd-hud__label">SCORE</span>
          <span className="dd-hud__val">{hud.score.toLocaleString()}</span>
        </div>
        <div className="dd-hud__row">
          <span className="dd-hud__label">TIME</span>
          <span className="dd-hud__val dd-mono">{fmtTime(hud.time)}</span>
        </div>
        <div className={`dd-hud__row${ringsLow ? " is-low" : ""}`}>
          <span className="dd-hud__label">RINGS</span>
          <span className="dd-hud__val">
            <RingIcon size={20} /> {hud.rings}
          </span>
        </div>
      </div>

      <div className="dd-hud__tr">
        <div className="dd-hud__level">
          <span className="dd-hud__lvnum">
            {level.world}-{level.num}
          </span>
          <span className="dd-hud__lvname">{level.name}</span>
        </div>
        <div className="dd-hud__obj">{hud.objective}</div>
        <div className="dd-hud__stars" aria-label={`${hud.stars.filter(Boolean).length} of 3 red star rings`}>
          {hud.stars.map((s, i) => (
            <StarIcon key={i} on={s} />
          ))}
        </div>
        <div className={`dd-mode dd-mode--${hud.camMode}`}>
          <span className="dd-mode__dot" />
          {hud.camMode === "side" ? "2.5D · CLASSIC" : hud.camMode === "blend" ? "SHIFTING…" : "3D · MODERN"}
        </div>
      </div>

      {hud.boss ? (
        <div className="dd-boss">
          <div className="dd-boss__name">{hud.boss.name}</div>
          <div className="dd-boss__bar">
            <div className="dd-boss__fill" style={{ width: `${(hud.boss.hp / hud.boss.max) * 100}%` }} />
            {Array.from({ length: hud.boss.max - 1 }, (_, i) => (
              <span key={i} className="dd-boss__tick" style={{ left: `${((i + 1) / hud.boss.max) * 100}%` }} />
            ))}
          </div>
          {hud.boss.hint ? <div className="dd-boss__hint">{hud.boss.hint}</div> : null}
        </div>
      ) : null}

      <div className="dd-hud__bl">
        <HeadIcon />
        <span className="dd-hud__lives">× {hud.lives}</span>
      </div>

      {hud.powers.length ? (
        <div className="dd-hud__powers">
          {hud.powers.map((p) => (
            <div key={p.type} className="dd-power" style={{ "--c": POWER[p.type].color }}>
              <span>{POWER_LABEL[p.type]}</span>
              {p.left > 0 ? <b>{Math.ceil(p.left)}</b> : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="dd-hud__br">
        <div className="dd-speed">
          <div className="dd-speed__fill" style={{ width: `${Math.min(100, (hud.speed / 44) * 100)}%` }} />
        </div>
        <span className="dd-speed__label">{Math.round(hud.speed * 3.6)} km/h</span>
      </div>

      {hud.prompt ? <div className="dd-prompt">{hud.prompt}</div> : null}

      {showHints ? (
        <div className="dd-hints">
          {hud.camMode === "side" ? (
            <>
              <span>
                <kbd>A</kbd>
                <kbd>D</kbd> run
              </span>
              <span>
                <kbd>Space</kbd> jump · again near a robot = homing
              </span>
              <span>
                <kbd>S</kbd>+<kbd>Space</kbd> spin dash
              </span>
              <span>
                <kbd>Shift</kbd> sprint
              </span>
            </>
          ) : (
            <>
              <span>
                <kbd>WASD</kbd> run
              </span>
              <span>Mouse: camera</span>
              <span>
                <kbd>Click</kbd> homing
              </span>
              <span>
                <kbd>A</kbd>/<kbd>D</kbd> on rails: switch
              </span>
              <span>
                <kbd>Q</kbd> spin dash
              </span>
            </>
          )}
        </div>
      ) : null}

      <button type="button" className="dd-pausebtn" onClick={onPause} aria-label="Pause">
        ❚❚
      </button>
      <div className="dd-speedlines" style={{ opacity: Math.max(0, Math.min(0.85, (hud.speed - 24) / 18)) }} />
    </div>
  );
}

export function ShiftBanner({ banner }) {
  if (!banner) return null;
  return (
    <div key={banner.id} className={`dd-shift dd-shift--${banner.mode}`}>
      <div className="dd-shift__stripe" />
      <div className="dd-shift__text">
        <small>DIMENSION SHIFT</small>
        {banner.mode === "side" ? "2.5D" : "3D"}
      </div>
    </div>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div key={toast.id} className={`dd-toast dd-toast--${toast.kind || "info"}`}>
      {toast.text}
    </div>
  );
}

export function StartGate({ level, world, onStart, touch }) {
  return (
    <div className="dd-overlay dd-gate" data-world={world.key}>
      <div className="dd-gate__card">
        <div className="dd-gate__world">{world.name}</div>
        <div className="dd-gate__title">
          <span>{level.world}-{level.num}</span> {level.name}
        </div>
        <div className="dd-gate__obj">{level.objective}</div>
        {touch ? (
          <p className="dd-gate__warn">Dimension Dash needs a keyboard and mouse.</p>
        ) : (
          <button type="button" className="dd-btn dd-btn--primary dd-btn--big" onClick={onStart} autoFocus>
            Click to start
          </button>
        )}
        <p className="dd-gate__tip">The mouse turns the 3D camera. Esc pauses.</p>
      </div>
    </div>
  );
}

export function PauseCard({ onResume, onRestart, onCheckpoint, hasCheckpoint, onSettings, onControls, onQuit }) {
  return (
    <div className="dd-overlay">
      <div className="dd-panel dd-pause">
        <h2 className="dd-panel__title">Paused</h2>
        <button type="button" className="dd-btn dd-btn--primary" onClick={onResume} autoFocus>
          Resume
        </button>
        {hasCheckpoint ? (
          <button type="button" className="dd-btn" onClick={onCheckpoint}>
            Back to checkpoint
          </button>
        ) : null}
        <button type="button" className="dd-btn" onClick={onRestart}>
          Restart level
        </button>
        <button type="button" className="dd-btn" onClick={onSettings}>
          Settings
        </button>
        <button type="button" className="dd-btn" onClick={onControls}>
          How to play
        </button>
        <button type="button" className="dd-btn dd-btn--ghost" onClick={onQuit}>
          Level select
        </button>
      </div>
    </div>
  );
}

function useCount(target, ms = 900, delay = 0) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now() + delay;
    const tick = (now) => {
      const k = Math.max(0, Math.min(1, (now - t0) / ms));
      setV(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, delay]);
  return v;
}

export function Results({ res, hasNext, onNext, onReplay, onWorlds }) {
  const tb = useCount(res.bonus.time, 900, 400);
  const rb = useCount(res.bonus.rings, 900, 700);
  const cb = useCount(res.bonus.clean, 600, 1000);
  const total = useCount(res.score, 1200, 1300);
  const [stamp, setStamp] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setStamp(true), 2200);
    return () => clearTimeout(id);
  }, []);
  return (
    <div className="dd-overlay dd-results">
      <div className="dd-results__card">
        <div className="dd-results__head">
          <span className="dd-results__got">{res.boss ? "BOSS DEFEATED" : "STAGE CLEAR"}</span>
          <span className="dd-results__name">{res.levelName}</span>
        </div>
        <div className="dd-results__grid">
          <div className="dd-results__stats">
            <div>
              <span>Time</span>
              <b className="dd-mono">{fmtTime(res.time)}</b>
              {res.newBestTime ? <em>NEW BEST</em> : null}
            </div>
            <div>
              <span>Rings</span>
              <b>
                {res.ringsCollected} <small>/ {res.ringTotal}</small>
              </b>
            </div>
            <div>
              <span>Robots</span>
              <b>
                {res.enemies} <small>/ {res.enemyTotal}</small>
              </b>
            </div>
            <div>
              <span>Hits taken</span>
              <b>{res.hits}</b>
            </div>
            <div>
              <span>Red stars</span>
              <b className="dd-results__stars">
                {res.redStarFlags.map((s, i) => (
                  <StarIcon key={i} on={s} size={20} />
                ))}
              </b>
            </div>
          </div>
          <div className="dd-results__bonus">
            <div>
              <span>Time bonus</span>
              <b>{tb.toLocaleString()}</b>
            </div>
            <div>
              <span>Ring bonus</span>
              <b>{rb.toLocaleString()}</b>
            </div>
            <div>
              <span>No-hit bonus</span>
              <b>{cb.toLocaleString()}</b>
            </div>
            <div className="dd-results__total">
              <span>Total</span>
              <b>{total.toLocaleString()}</b>
            </div>
          </div>
          <div className={`dd-rank dd-rank--${res.rank}${stamp ? " is-in" : ""}`}>
            <span className="dd-rank__label">RANK</span>
            <span className="dd-rank__letter">{res.rank}</span>
            {res.newBestRank ? <em>NEW BEST</em> : null}
          </div>
        </div>
        {res.unlockText ? <div className="dd-results__unlock">{res.unlockText}</div> : null}
        <div className="dd-results__btns">
          {hasNext ? (
            <button type="button" className="dd-btn dd-btn--primary" onClick={onNext} autoFocus>
              Next level
            </button>
          ) : null}
          <button type="button" className="dd-btn" onClick={onReplay} autoFocus={!hasNext}>
            Replay
          </button>
          <button type="button" className="dd-btn dd-btn--ghost" onClick={onWorlds}>
            Level select
          </button>
        </div>
      </div>
    </div>
  );
}

export function GameOver({ hasCheckpoint, onContinue, onRestart, onWorlds }) {
  return (
    <div className="dd-overlay">
      <div className="dd-panel dd-gameover">
        <h2 className="dd-gameover__title">GAME OVER</h2>
        <p>Out of lives — but the run isn't lost.</p>
        <button type="button" className="dd-btn dd-btn--primary" onClick={onContinue} autoFocus>
          {hasCheckpoint ? "Continue from checkpoint" : "Continue"}
        </button>
        <button type="button" className="dd-btn" onClick={onRestart}>
          Restart level
        </button>
        <button type="button" className="dd-btn dd-btn--ghost" onClick={onWorlds}>
          Level select
        </button>
      </div>
    </div>
  );
}
