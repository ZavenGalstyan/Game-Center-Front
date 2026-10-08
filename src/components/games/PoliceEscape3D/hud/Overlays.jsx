/**
 * Police Escape 3D — overlays: star rows, the pause menu (quick volume
 * sliders), MISSION COMPLETE and BUSTED cards. Both end cards always offer a
 * way on (Retry / Missions / Menu) — never a frozen screen.
 */
import { CAR_BY_ID } from "../data/cars.js";
import { WORLD_BY_ID } from "../data/worlds.js";
import { fmtTime } from "./useSample.js";

export function Stars({ n, of = 3, size = "1em" }) {
  return (
    <span className="pe-stars" aria-label={`${n} of ${of} stars`}>
      {Array.from({ length: of }, (_, i) => (
        <svg key={i} viewBox="0 0 24 24" width={size} height={size} className={i < n ? "is-on" : ""} aria-hidden="true">
          <path d="M12 2.2l2.9 6.2 6.8.8-5 4.6 1.3 6.7L12 17.2 6 20.5l1.3-6.7-5-4.6 6.8-.8z" />
        </svg>
      ))}
    </span>
  );
}

export function Slider({ label, value, onChange }) {
  return (
    <label className="pe-slider">
      <span>{label}</span>
      <input type="range" min="0" max="1" step="0.05" value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <b>{Math.round(value * 100)}</b>
    </label>
  );
}

export function PauseMenu({ def, onResume, onRestart, onQuit, onControls, settings, onChangeSettings, muted }) {
  return (
    <div className="pe-overlay">
      <div className="pe-card">
        <div className="pe-card__kicker">MISSION {def.id}</div>
        <h2 className="pe-card__title">PAUSED</h2>
        <div className="pe-card__sub">{def.name}</div>
        <div className="pe-stack">
          <button type="button" className="pe-btn pe-btn--primary pe-btn--lg" onClick={onResume} autoFocus>
            RESUME
          </button>
          <button type="button" className="pe-btn" onClick={onRestart}>
            RESTART MISSION
          </button>
          <button type="button" className="pe-btn" onClick={onControls}>
            CONTROLS
          </button>
          <button type="button" className="pe-btn pe-btn--ghost" onClick={onQuit}>
            QUIT TO MISSIONS
          </button>
        </div>
        <div className="pe-quick">
          <Slider label="Master" value={settings.master} onChange={(v) => onChangeSettings({ master: v })} />
          <Slider label="Music" value={settings.music} onChange={(v) => onChangeSettings({ music: v })} />
          <Slider label="Effects" value={settings.sfx} onChange={(v) => onChangeSettings({ sfx: v })} />
          {muted && <div className="pe-note">Sound is muted from the Game Center controls.</div>}
        </div>
      </div>
    </div>
  );
}

const UNLOCK_TEXT = (id) => {
  const [kind, key] = id.split(":");
  if (kind === "car") return `NEW CAR: ${CAR_BY_ID.get(key)?.name}`;
  if (kind === "world") return `NEW DISTRICT: ${WORLD_BY_ID.get(Number(key))?.name}`;
  return id;
};

export function Complete({ def, results, outcome, hasNext, onNext, onRetry, onMissions, onMenu }) {
  const st = def.stars || {};
  return (
    <div className="pe-overlay pe-overlay--end">
      <div className="pe-card pe-card--end">
        <div className="pe-card__kicker">
          MISSION {def.id} · {def.name.toUpperCase()}
        </div>
        <h2 className="pe-card__title pe-card__title--big pe-win">MISSION COMPLETE</h2>
        <div className="pe-endstars">
          <Stars n={results.stars} size="3.2em" />
        </div>
        <div className="pe-grid3">
          <div>
            <span>ESCAPE TIME</span>
            <b>{fmtTime(results.time, true)}</b>
            {outcome.newBestTime && outcome.prevTime != null && <em>NEW BEST</em>}
          </div>
          <div>
            <span>INTEGRITY</span>
            <b>{results.integrity}%</b>
          </div>
          <div>
            <span>EVADED</span>
            <b>{results.stats.evaded}</b>
          </div>
        </div>
        <div className="pe-criteria">
          <span className="is-on">★ Escape</span>
          <span className={results.stars >= 2 ? "is-on" : ""}>★ Under {st.time ? fmtTime(st.time) : "target"}</span>
          <span className={results.stars >= 3 ? "is-on" : ""}>★ …with {st.integrity ?? 50}%+ integrity</span>
        </div>
        {(outcome.newUnlocks.length > 0 || outcome.nextUnlocked) && (
          <div className="pe-unlocks">
            {outcome.nextUnlocked && <div className="pe-unlock">NEXT MISSION UNLOCKED</div>}
            {outcome.newUnlocks.map((u) => (
              <div key={u} className="pe-unlock pe-unlock--big">
                {UNLOCK_TEXT(u)}
              </div>
            ))}
          </div>
        )}
        <div className="pe-row">
          {hasNext && (
            <button type="button" className="pe-btn pe-btn--primary pe-btn--lg" onClick={onNext} autoFocus>
              NEXT MISSION ▸
            </button>
          )}
          <button type="button" className="pe-btn" onClick={onRetry} autoFocus={!hasNext}>
            RETRY
          </button>
          <button type="button" className="pe-btn" onClick={onMissions}>
            MISSIONS
          </button>
          <button type="button" className="pe-btn pe-btn--ghost" onClick={onMenu}>
            MENU
          </button>
        </div>
      </div>
    </div>
  );
}

const WHY = {
  caught: ["Boxed in by the police.", "Keep moving — a stopped car gets cuffed."],
  wrecked: ["Your car is wrecked.", "Avoid head-on hits with walls, traffic and police."],
  time: ["Out of time.", "Use nitro on long straights and look for shortcuts."],
};

export function Busted({ def, why, onRetry, onMissions, onMenu }) {
  const [a, b] = WHY[why] || WHY.caught;
  return (
    <div className="pe-overlay pe-overlay--end pe-overlay--busted">
      <div className="pe-card pe-card--end">
        <div className="pe-card__kicker">
          MISSION {def.id} · {def.name.toUpperCase()}
        </div>
        <h2 className="pe-card__title pe-card__title--big pe-busted">{why === "time" ? "TIME UP" : "BUSTED"}</h2>
        <p className="pe-card__sub">{a}</p>
        <p className="pe-tip">TIP: {b}</p>
        <div className="pe-row">
          <button type="button" className="pe-btn pe-btn--primary pe-btn--lg" onClick={onRetry} autoFocus>
            RETRY
          </button>
          <button type="button" className="pe-btn" onClick={onMissions}>
            MISSION SELECT
          </button>
          <button type="button" className="pe-btn pe-btn--ghost" onClick={onMenu}>
            MAIN MENU
          </button>
        </div>
      </div>
    </div>
  );
}
