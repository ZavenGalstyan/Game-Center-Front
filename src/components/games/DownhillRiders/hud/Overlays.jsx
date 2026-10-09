/**
 * Downhill Riders — race overlays: pause menu, results, and the medal art
 * shared with the menus.
 */
import { fmtRace, ordinal } from "./useSample.js";
import { BIKE_BY_ID } from "../data/bikes.js";
import { REGION_BY_ID } from "../data/regions.js";

const MEDAL_COL = {
  gold: ["#ffe27a", "#f4b81c", "#9a6a00"],
  silver: ["#f4f6fa", "#b9c2cf", "#5f6878"],
  bronze: ["#f2c093", "#c9803f", "#6e3f17"],
};

export function Medal({ kind, size = 40, dim = false }) {
  if (!kind) {
    return (
      <svg className="dr-medal dr-medal--none" width={size} height={size} viewBox="0 0 40 40" aria-label="No medal">
        <circle cx="20" cy="22" r="12" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3" opacity="0.45" />
      </svg>
    );
  }
  const [hi, mid, lo] = MEDAL_COL[kind];
  const id = `m-${kind}`;
  return (
    <svg className={`dr-medal${dim ? " is-dim" : ""}`} width={size} height={size} viewBox="0 0 40 40" aria-label={`${kind} medal`}>
      <defs>
        <radialGradient id={id} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor={hi} />
          <stop offset="0.6" stopColor={mid} />
          <stop offset="1" stopColor={lo} />
        </radialGradient>
      </defs>
      <path d="M12 2h6l3 10h-6z" fill="#2c6cff" />
      <path d="M28 2h-6l-3 10h6z" fill="#e8343a" />
      <circle cx="20" cy="24" r="12" fill={`url(#${id})`} stroke={lo} strokeWidth="1.2" />
      <circle cx="20" cy="24" r="8.2" fill="none" stroke={hi} strokeWidth="1" opacity="0.8" />
      <path d="M14.5 27.5l3.5-6 2.5 3.5 1.8-2.4 3.2 4.9z" fill={lo} opacity="0.75" />
    </svg>
  );
}

export function PauseMenu({ def, onResume, onRestart, onQuit, onControls, settings, onChangeSettings, muted }) {
  return (
    <div className="dr-overlay">
      <div className="dr-card dr-card--pause">
        <div className="dr-card__eyebrow">PAUSED</div>
        <h2 className="dr-card__title">{def.name}</h2>
        <div className="dr-col">
          <button type="button" className="dr-btn dr-btn--primary dr-btn--lg" onClick={onResume} autoFocus>
            Resume
          </button>
          <button type="button" className="dr-btn" onClick={onRestart}>
            Restart Race
          </button>
          <button type="button" className="dr-btn" onClick={onControls}>
            Controls
          </button>
          <button type="button" className="dr-btn dr-btn--ghost" onClick={onQuit}>
            Quit to Trails
          </button>
        </div>
        <div className="dr-pause-settings">
          <label className="dr-mini-set">
            <span>Music</span>
            <input type="range" min="0" max="1" step="0.05" value={settings.music} onChange={(e) => onChangeSettings({ music: Number(e.target.value) })} />
          </label>
          <label className="dr-mini-set">
            <span>Sound FX</span>
            <input type="range" min="0" max="1" step="0.05" value={settings.sfx} onChange={(e) => onChangeSettings({ sfx: Number(e.target.value) })} />
          </label>
          {muted && <div className="dr-note">Sound is muted from the Game Center controls.</div>}
        </div>
        <div className="dr-hint">Esc / P to resume</div>
      </div>
    </div>
  );
}

export function Results({ def, results, outcome, bikeId, hasNext, nextLocked, onNext, onRetry, onTrails, onMenu }) {
  const { place, time, trickScore, tricks, order, crashes } = results;
  const region = REGION_BY_ID.get(def.region);
  const medal = outcome?.medal ?? null;
  const headline = place === 1 ? "GOLD MEDAL!" : place === 2 ? "SILVER MEDAL!" : place === 3 ? "BRONZE MEDAL!" : "RACE COMPLETE";
  const bike = BIKE_BY_ID.get(bikeId);
  return (
    <div className="dr-overlay dr-overlay--results">
      <div className={`dr-card dr-card--results dr-card--p${place}`}>
        <div className="dr-results__head">
          <div className={`dr-results__medal${medal ? " is-" + medal : ""}`}>
            <Medal kind={medal} size={84} />
          </div>
          <div className="dr-results__titles">
            <div className="dr-card__eyebrow" style={{ color: region?.accent }}>
              {region?.name} · Track {def.id}
            </div>
            <h2 className="dr-card__title">{headline}</h2>
            <div className="dr-results__sub">
              {def.name} — finished <b>{ordinal(place)}</b>
            </div>
          </div>
        </div>
        <div className="dr-results__body">
          <div className="dr-results__times">
            <div className="dr-kv">
              <span>Race time</span>
              <b>{fmtRace(time)}</b>
              {outcome?.newBestTime && <i className="dr-tag dr-tag--green">Best</i>}
            </div>
            <div className="dr-kv">
              <span>Trick score</span>
              <b>{trickScore.toLocaleString()}</b>
            </div>
            <div className="dr-kv dr-kv--sub">
              <span>Tricks landed</span>
              <b>{tricks}</b>
            </div>
            <div className="dr-kv dr-kv--sub">
              <span>Crashes</span>
              <b>{crashes}</b>
            </div>
            <div className="dr-kv dr-kv--sub">
              <span>Bike</span>
              <b>{bike?.name}</b>
            </div>
            {outcome && !outcome.improved && outcome.prevMedal && (
              <div className="dr-kv dr-kv--sub">
                <span>Best medal kept</span>
                <b className="dr-cap">{outcome.prevMedal}</b>
              </div>
            )}
          </div>
          <ol className="dr-order">
            {order.map((r, i) => (
              <li key={r.name} className={r.isPlayer ? "is-player" : ""}>
                <span className="dr-order__pos">{i + 1}</span>
                <span className="dr-order__chip" style={{ background: r.colors.jersey }} />
                <span className="dr-order__name">{r.isPlayer ? "You" : r.name}</span>
                <span className="dr-order__time">{r.projected ? `~${fmtRace(r.time)}` : fmtRace(r.time)}</span>
              </li>
            ))}
          </ol>
        </div>
        {(outcome?.newUnlocks?.length > 0 || outcome?.nextUnlocked) && (
          <div className="dr-unlocks">
            {outcome.nextUnlocked && (
              <div className="dr-unlock">
                <span className="dr-unlock__icon">⛰</span> New trail unlocked: <b>Track {def.id + 1}</b>
              </div>
            )}
            {outcome.newUnlocks.map((u) => {
              const [kind, id] = u.split(":");
              const name = kind === "bike" ? `${BIKE_BY_ID.get(id)?.name} bike` : `${REGION_BY_ID.get(Number(id))?.name} region`;
              return (
                <div key={u} className="dr-unlock">
                  <span className="dr-unlock__icon">{kind === "bike" ? "🚲" : "🏔"}</span> Unlocked: <b>{name}</b>
                </div>
              );
            })}
          </div>
        )}
        {!medal && hasNext && nextLocked && <div className="dr-note dr-center">Finish in the top 3 to unlock the next trail.</div>}
        <div className="dr-row">
          {hasNext && (
            <button type="button" className="dr-btn dr-btn--primary dr-btn--lg" onClick={onNext} disabled={nextLocked} title={nextLocked ? "Earn a medal to unlock" : ""}>
              Next Race ▸
            </button>
          )}
          <button type="button" className={`dr-btn${hasNext && !nextLocked ? "" : " dr-btn--primary dr-btn--lg"}`} onClick={onRetry}>
            Retry
          </button>
          <button type="button" className="dr-btn" onClick={onTrails}>
            Trails
          </button>
          <button type="button" className="dr-btn dr-btn--ghost" onClick={onMenu}>
            Menu
          </button>
        </div>
      </div>
    </div>
  );
}
