/**
 * Stunt Racer 3D — overlays: medal badge, pause menu (with quick audio /
 * camera settings) and the level-complete card.
 */
import { CAR_BY_ID } from "../data/cars.js";
import { WORLD_BY_ID } from "../data/worlds.js";
import { fmtTime } from "./useSample.js";
import { StarIcon } from "./Hud.jsx";

const MEDAL_COL = { gold: ["#ffe27a", "#e0a400"], silver: ["#f2f5f8", "#9aa4b0"], bronze: ["#ffbf8a", "#b0612a"] };

export function Medal({ kind, size = 40, dim = false }) {
  if (!kind) return <span className="sr-medal sr-medal--none" style={{ width: size, height: size }} aria-label="no medal" />;
  const [a, b] = MEDAL_COL[kind];
  return (
    <svg className={`sr-medal${dim ? " is-dim" : ""}`} width={size} height={size} viewBox="0 0 40 40" aria-label={`${kind} medal`}>
      <path d="M12 2h6l3 10h-6zM28 2h-6l-3 10h6z" fill={kind === "gold" ? "#e0262f" : kind === "silver" ? "#2a6ad6" : "#2f9a4a"} />
      <circle cx="20" cy="25" r="12.5" fill={b} />
      <circle cx="20" cy="25" r="10" fill={a} />
      <path d="M20 18.5l2 4.2 4.5.5-3.4 3 1 4.5-4.1-2.3-4.1 2.3 1-4.5-3.4-3 4.5-.5z" fill={b} opacity="0.85" />
    </svg>
  );
}

function Slider({ label, value, onChange }) {
  return (
    <label className="sr-slider">
      <span>{label}</span>
      <input type="range" min="0" max="1" step="0.05" value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <b>{Math.round(value * 100)}</b>
    </label>
  );
}
export { Slider };

export function PauseMenu({ def, onResume, onRestart, onQuit, onControls, settings, onChangeSettings, muted }) {
  return (
    <div className="sr-overlay sr-overlay--pause">
      <div className="sr-card">
        <div className="sr-card__kicker">LEVEL {def.id}</div>
        <h2 className="sr-card__title">PAUSED</h2>
        <div className="sr-card__sub">{def.name}</div>
        <div className="sr-stack">
          <button type="button" className="sr-btn sr-btn--primary sr-btn--lg" onClick={onResume} autoFocus>
            RESUME
          </button>
          <button type="button" className="sr-btn" onClick={onRestart}>
            RESTART LEVEL
          </button>
          <button type="button" className="sr-btn" onClick={onControls}>
            CONTROLS
          </button>
          <button type="button" className="sr-btn sr-btn--ghost" onClick={onQuit}>
            QUIT TO LEVELS
          </button>
        </div>
        <div className="sr-quick">
          <Slider label="Master" value={settings.master} onChange={(v) => onChangeSettings({ master: v })} />
          <Slider label="Music" value={settings.music} onChange={(v) => onChangeSettings({ music: v })} />
          <Slider label="Effects" value={settings.sfx} onChange={(v) => onChangeSettings({ sfx: v })} />
          {muted && <div className="sr-note">Sound is muted from the Game Center controls.</div>}
        </div>
      </div>
    </div>
  );
}

const UNLOCK_TEXT = (id) => {
  const [kind, key] = id.split(":");
  if (kind === "car") return `NEW CAR: ${CAR_BY_ID.get(key)?.name}`;
  if (kind === "world") return `NEW WORLD: ${WORLD_BY_ID.get(Number(key))?.name}`;
  return id;
};

export function Results({ def, results, outcome, hasNext, nextLocked, onNext, onRetry, onLevels, onMenu }) {
  const m = def.medals;
  return (
    <div className="sr-overlay sr-overlay--results">
      <div className="sr-card sr-card--results">
        <div className="sr-card__kicker">LEVEL {def.id} · {def.name.toUpperCase()}</div>
        <h2 className="sr-card__title sr-card__title--big">LEVEL COMPLETE</h2>
        <div className={`sr-result__medal sr-result__medal--${results.medal}`}>
          <Medal kind={results.medal} size={92} />
          <div>
            <div className="sr-result__mname">{results.medal.toUpperCase()} MEDAL</div>
            {outcome.prevMedal && outcome.bestMedal !== outcome.prevMedal && <div className="sr-result__tag">UPGRADED!</div>}
          </div>
        </div>
        <div className="sr-result__grid">
          <div>
            <span>TIME</span>
            <b>{fmtTime(results.time, true)}</b>
            {outcome.newBestTime && outcome.prevTime != null && <em>NEW BEST</em>}
          </div>
          <div>
            <span>BEST</span>
            <b>{fmtTime(Math.min(results.time, outcome.prevTime ?? Infinity), true)}</b>
          </div>
          <div>
            <span>STARS</span>
            <b className="sr-result__stars">
              {Array.from({ length: results.starTotal }, (_, i) => (
                <StarIcon key={i} on={results.stars.includes(i)} />
              ))}
            </b>
          </div>
        </div>
        {m && (
          <div className="sr-result__targets">
            <span>
              <Medal kind="gold" size={18} /> {fmtTime(m.gold)}
            </span>
            <span>
              <Medal kind="silver" size={18} /> {fmtTime(m.silver)}
            </span>
            <span>
              <Medal kind="bronze" size={18} /> finish
            </span>
          </div>
        )}
        <div className="sr-result__stats">
          <span>Jumps {results.stats.jumps}</span>
          <span>Clean landings {results.stats.landings}</span>
          <span>Crashes {results.stats.crashes}</span>
        </div>
        {(outcome.newUnlocks.length > 0 || outcome.nextUnlocked) && (
          <div className="sr-unlocks">
            {outcome.nextUnlocked && <div className="sr-unlock">NEXT LEVEL UNLOCKED</div>}
            {outcome.newUnlocks.map((u) => (
              <div key={u} className="sr-unlock sr-unlock--big">
                {UNLOCK_TEXT(u)}
              </div>
            ))}
          </div>
        )}
        <div className="sr-row">
          {hasNext && (
            <button type="button" className="sr-btn sr-btn--primary sr-btn--lg" onClick={onNext} disabled={nextLocked} autoFocus>
              NEXT LEVEL ▸
            </button>
          )}
          <button type="button" className="sr-btn" onClick={onRetry} autoFocus={!hasNext}>
            RETRY
          </button>
          <button type="button" className="sr-btn" onClick={onLevels}>
            LEVELS
          </button>
          <button type="button" className="sr-btn sr-btn--ghost" onClick={onMenu}>
            MENU
          </button>
        </div>
      </div>
    </div>
  );
}
