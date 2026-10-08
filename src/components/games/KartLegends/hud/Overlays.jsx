/**
 * Kart Legends — race overlays: pause menu and the results screen.
 */
import { fmtRace, ordinal } from "./useSample.js";
import { KART_BY_ID } from "../data/karts.js";
import { WORLD_BY_ID } from "../data/worlds.js";

export function Stars({ n, max = 3, size = "md" }) {
  return (
    <span className={`kl-stars kl-stars--${size}`} aria-label={`${n} of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`kl-star${i < n ? " is-on" : ""}`}>
          ★
        </span>
      ))}
    </span>
  );
}

export function PauseMenu({ def, onResume, onRestart, onQuit, onControls, settings, onChangeSettings, muted }) {
  return (
    <div className="kl-overlay">
      <div className="kl-card kl-card--pause">
        <div className="kl-card__eyebrow">PAUSED</div>
        <h2 className="kl-card__title">{def.name}</h2>
        <div className="kl-col">
          <button type="button" className="kl-btn kl-btn--primary kl-btn--lg" onClick={onResume} autoFocus>
            Resume
          </button>
          <button type="button" className="kl-btn" onClick={onRestart}>
            Restart Race
          </button>
          <button type="button" className="kl-btn" onClick={onControls}>
            Controls
          </button>
          <button type="button" className="kl-btn kl-btn--ghost" onClick={onQuit}>
            Quit to Race Select
          </button>
        </div>
        <div className="kl-pause-settings">
          <label className="kl-mini-set">
            <span>Music</span>
            <input type="range" min="0" max="1" step="0.05" value={settings.music} onChange={(e) => onChangeSettings({ music: Number(e.target.value) })} />
          </label>
          <label className="kl-mini-set">
            <span>Sound FX</span>
            <input type="range" min="0" max="1" step="0.05" value={settings.sfx} onChange={(e) => onChangeSettings({ sfx: Number(e.target.value) })} />
          </label>
          {muted && <div className="kl-note">Sound is muted from the Game Center controls.</div>}
        </div>
        <div className="kl-hint">Esc / P to resume</div>
      </div>
    </div>
  );
}

export function Results({ def, world, results, outcome, kartId, hasNext, nextLocked, onNext, onRetry, onSelect, onGarage }) {
  const { place, time, bestLap, lapTimes, order } = results;
  const earned = outcome?.earned ?? 0;
  const headline = place === 1 ? "VICTORY!" : place <= 3 ? "PODIUM!" : "RACE COMPLETE";
  const kart = KART_BY_ID.get(kartId);
  return (
    <div className="kl-overlay kl-overlay--results">
      <div className={`kl-card kl-card--results kl-card--p${place}`}>
        <div className="kl-results__head">
          <div className={`kl-results__place kl-place--${place}`}>
            {place}
            <small>{ordinal(place).slice(-2)}</small>
          </div>
          <div>
            <div className="kl-card__eyebrow" style={{ color: world.accent }}>
              {world.name} · Track {def.id}
            </div>
            <h2 className="kl-card__title">{headline}</h2>
            <div className="kl-results__sub">{def.name}</div>
          </div>
          <div className="kl-results__stars">
            <Stars n={earned} size="lg" />
            {outcome?.improved && <div className="kl-tag kl-tag--gold">New best stars</div>}
            {!outcome?.improved && outcome && outcome.prevStars > earned && <div className="kl-tag">Best kept: {outcome.prevStars}★</div>}
          </div>
        </div>
        <div className="kl-results__body">
          <div className="kl-results__times">
            <div className="kl-kv">
              <span>Race time</span>
              <b>{fmtRace(time)}</b>
              {outcome?.newBestTime && <i className="kl-tag kl-tag--green">Best</i>}
            </div>
            <div className="kl-kv">
              <span>Best lap</span>
              <b>{fmtRace(bestLap)}</b>
            </div>
            {lapTimes.map((t, i) => (
              <div key={i} className="kl-kv kl-kv--sub">
                <span>Lap {i + 1}</span>
                <b>{fmtRace(t)}</b>
              </div>
            ))}
            <div className="kl-kv kl-kv--sub">
              <span>Kart</span>
              <b>{kart?.name}</b>
            </div>
          </div>
          <ol className="kl-order">
            {order.map((r, i) => (
              <li key={r.name} className={r.isPlayer ? "is-player" : ""}>
                <span className="kl-order__pos">{i + 1}</span>
                <span className="kl-order__chip" style={{ background: r.colors.body }} />
                <span className="kl-order__name">{r.isPlayer ? "You" : r.name}</span>
                <span className="kl-order__time">{r.projected ? `~${fmtRace(r.time)}` : fmtRace(r.time)}</span>
              </li>
            ))}
          </ol>
        </div>
        {outcome?.newUnlocks?.length > 0 && (
          <div className="kl-unlocks">
            {outcome.newUnlocks.map((u) => {
              const [kind, id] = u.split(":");
              const name = kind === "kart" ? `${KART_BY_ID.get(id)?.name} kart` : WORLD_BY_ID.get(Number(id))?.name;
              return (
                <div key={u} className="kl-unlock">
                  <span className="kl-unlock__icon">{kind === "kart" ? "🏎" : "🏁"}</span> Unlocked: <b>{name}</b>
                </div>
              );
            })}
          </div>
        )}
        <div className="kl-row">
          {hasNext && (
            <button type="button" className="kl-btn kl-btn--primary kl-btn--lg" onClick={onNext} disabled={nextLocked} title={nextLocked ? "Locked" : ""}>
              Next Race ▸
            </button>
          )}
          <button type="button" className={`kl-btn${hasNext ? "" : " kl-btn--primary kl-btn--lg"}`} onClick={onRetry}>
            Retry
          </button>
          <button type="button" className="kl-btn" onClick={onSelect}>
            Race Select
          </button>
          <button type="button" className="kl-btn kl-btn--ghost" onClick={onGarage}>
            Garage
          </button>
        </div>
      </div>
    </div>
  );
}
