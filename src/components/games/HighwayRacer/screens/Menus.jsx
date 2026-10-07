/**
 * Highway Racer — menu screens drawn over the live 3D world:
 * Main Menu, Garage, Statistics, Settings.
 */
import { CARS, carById, carTuning } from "../data/cars.js";
import { ENVIRONMENTS, envById, envUnlocked } from "../data/environments.js";
import { KMH } from "../engine/config.js";

export const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.floor(m)} m`);
export const fmtInt = (n) => Math.floor(n).toLocaleString("en-US");
const fmtTime = (s) => {
  const t = Math.floor(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${String(sec).padStart(2, "0")}s` : `${sec}s`;
};

function CoinBadge({ coins }) {
  return (
    <span className="hr-coins-badge">
      <i className="hr-coin-icon" />
      {fmtInt(coins)}
    </span>
  );
}

const Chevron = ({ dir }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d={dir < 0 ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
  </svg>
);

/* ================================================================== main */
export function MainMenu({ progress, envId, onPlay, onNav, onEnv }) {
  const car = carById(progress.selectedCar);
  const env = envById(envId);
  const lock = envLockText(env, progress);
  const idx = ENVIRONMENTS.findIndex((e) => e.id === env.id);
  const step = (d) => {
    const next = ENVIRONMENTS[(idx + d + ENVIRONMENTS.length) % ENVIRONMENTS.length];
    onEnv(next.id);
  };
  const returning = progress.statistics.runs > 0;
  return (
    <div className="hr-menu">
      <div className="hr-menu__brand">
        <h1 className="hr-title">
          <span>HIGHWAY</span>
          <span className="hr-title__accent">RACER</span>
        </h1>
        <div className="hr-tagline">DRIVE • DODGE • SURVIVE</div>
      </div>

      <div className="hr-menu__actions">
        <button type="button" className="hr-btn hr-btn--primary hr-btn--play" onClick={onPlay} disabled={!!lock} autoFocus>
          {lock ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 11V8a5 5 0 0110 0v3M6 11h12v9H6z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 4.5v15l13-7.5z" />
            </svg>
          )}
          {lock ? "LOCKED" : returning ? "PLAY AGAIN" : "PLAY"}
        </button>
        <div className="hr-menu__row">
          <button type="button" className="hr-btn" onClick={() => onNav("garage")}>
            GARAGE
          </button>
          <button type="button" className="hr-btn" onClick={() => onNav("stats")}>
            STATISTICS
          </button>
          <button type="button" className="hr-btn" onClick={() => onNav("settings")}>
            SETTINGS
          </button>
        </div>
        <div className="hr-envpick">
          <button type="button" className="hr-icon-btn" aria-label="Previous highway" onClick={() => step(-1)}>
            <Chevron dir={-1} />
          </button>
          <div className="hr-envpick__name">
            <span className="hr-envpick__label">{lock ? lock.toUpperCase() : "HIGHWAY"}</span>
            {env.name}
          </div>
          <button type="button" className="hr-icon-btn" aria-label="Next highway" onClick={() => step(1)}>
            <Chevron dir={1} />
          </button>
        </div>
      </div>

      <div className="hr-menu__records">
        <div className="hr-record">
          <span>BEST DISTANCE</span>
          <b>{fmtDist(progress.bestDistance)}</b>
        </div>
        <div className="hr-record">
          <span>BEST SCORE</span>
          <b>{fmtInt(progress.bestScore)}</b>
        </div>
        <div className="hr-record">
          <span>COINS</span>
          <b>
            <i className="hr-coin-icon" />
            {fmtInt(progress.coins)}
          </b>
        </div>
        <div className="hr-record hr-record--car">
          <span>CAR</span>
          <b>{car.name}</b>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== theme lock note */
export function envLockText(env, progress) {
  if (envUnlocked(env, progress.bestDistance)) return null;
  return `Reach ${env.unlockKm} km in one run to unlock`;
}

/* ================================================================== garage */
function StatBar({ label, value }) {
  return (
    <div className="hr-statbar">
      <span>{label}</span>
      <span className="hr-statbar__track">
        {[1, 2, 3, 4, 5].map((i) => (
          <i key={i} className={i <= value ? "on" : ""} />
        ))}
      </span>
    </div>
  );
}

export function Garage({ progress, previewId, onPreview, onSelect, onUnlock, onBack }) {
  const idx = Math.max(0, CARS.findIndex((c) => c.id === previewId));
  const car = CARS[idx];
  const owned = progress.unlockedCars.includes(car.id);
  const selected = progress.selectedCar === car.id;
  const t = carTuning(car);
  const afford = progress.coins >= car.price;
  const go = (d) => onPreview(CARS[(idx + d + CARS.length) % CARS.length].id);
  return (
    <div className="hr-garage">
      <div className="hr-screen-head">
        <button type="button" className="hr-btn hr-btn--ghost hr-btn--back" onClick={onBack}>
          <Chevron dir={-1} /> BACK
        </button>
        <div className="hr-screen-head__title">GARAGE</div>
        <CoinBadge coins={progress.coins} />
      </div>

      <button type="button" className="hr-garage__arrow hr-garage__arrow--l" aria-label="Previous car" onClick={() => go(-1)}>
        <Chevron dir={-1} />
      </button>
      <button type="button" className="hr-garage__arrow hr-garage__arrow--r" aria-label="Next car" onClick={() => go(1)}>
        <Chevron dir={1} />
      </button>

      <div className="hr-garage__card">
        <div className="hr-garage__name">
          {car.name}
          <span className="hr-garage__count">
            {idx + 1} / {CARS.length}
          </span>
        </div>
        <div className="hr-garage__blurb">{car.blurb}</div>
        <StatBar label="SPEED" value={car.stats.speed} />
        <StatBar label="HANDLING" value={car.stats.handling} />
        <StatBar label="BOOST" value={car.stats.boost} />
        <div className="hr-garage__facts">
          <span>Top {Math.round(t.topSpeed * KMH)} km/h</span>
          <span>Lane {Math.round(t.laneTime * 1000)} ms</span>
          <span>Boost {t.boostDuration.toFixed(1)} s</span>
        </div>
        <div className="hr-garage__cta">
          {owned ? (
            <button type="button" className={`hr-btn hr-btn--primary hr-btn--wide${selected ? " is-done" : ""}`} disabled={selected} onClick={() => onSelect(car.id)}>
              {selected ? "SELECTED" : "SELECT"}
            </button>
          ) : (
            <button type="button" className="hr-btn hr-btn--primary hr-btn--wide" disabled={!afford} onClick={() => onUnlock(car.id)}>
              UNLOCK · <i className="hr-coin-icon" />
              {fmtInt(car.price)}
            </button>
          )}
          {!owned && !afford && <div className="hr-garage__need">Need {fmtInt(car.price - progress.coins)} more coins</div>}
        </div>
      </div>
      <div className="hr-garage__hint">Drag to rotate</div>
    </div>
  );
}

/* ================================================================== statistics */
export function Statistics({ progress, onBack }) {
  const s = progress.statistics;
  const rows = [
    ["Runs", fmtInt(s.runs)],
    ["Total distance", fmtDist(s.totalDistance)],
    ["Best distance", fmtDist(progress.bestDistance)],
    ["Best score", fmtInt(progress.bestScore)],
    ["Highest speed", `${Math.round(s.highestSpeed)} km/h`],
    ["Traffic cars passed", fmtInt(s.carsPassed)],
    ["Near misses", fmtInt(s.nearMisses)],
    ["Best near-miss combo", s.bestCombo ? `×${s.bestCombo}` : "—"],
    ["Coins collected", fmtInt(s.coinsCollected)],
    ["Boosts used", fmtInt(s.boostsUsed)],
    ["Crashes", fmtInt(s.crashes)],
    ["Longest run", fmtTime(s.longestRun)],
    ["Cars unlocked", `${progress.unlockedCars.length} / ${CARS.length}`],
    ["Total play time", fmtTime(s.playTime)],
  ];
  return (
    <div className="hr-overlay hr-overlay--menu">
      <div className="hr-panel hr-panel--wide">
        <div className="hr-screen-head hr-screen-head--panel">
          <button type="button" className="hr-btn hr-btn--ghost hr-btn--back" onClick={onBack}>
            <Chevron dir={-1} /> BACK
          </button>
          <div className="hr-screen-head__title">STATISTICS</div>
          <span />
        </div>
        <div className="hr-stats-grid">
          {rows.map(([k, v]) => (
            <div key={k} className="hr-stats-row">
              <span>{k}</span>
              <b>{v}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== settings */
function Seg({ label, value, options, onChange }) {
  return (
    <div className="hr-set-row">
      <span className="hr-set-row__label">{label}</span>
      <span className="hr-seg" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={String(v)} type="button" role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </span>
    </div>
  );
}
function Slider({ label, value, onChange, disabled }) {
  return (
    <div className="hr-set-row">
      <span className="hr-set-row__label">{label}</span>
      <span className="hr-slider">
        <input type="range" min="0" max="1" step="0.05" value={value} disabled={disabled} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
        <b>{Math.round(value * 100)}</b>
      </span>
    </div>
  );
}
const ONOFF = [
  [true, "ON"],
  [false, "OFF"],
];

export function Settings({ settings: s, muted, onChange, onBack }) {
  return (
    <div className="hr-overlay hr-overlay--menu">
      <div className="hr-panel hr-panel--wide">
        <div className="hr-screen-head hr-screen-head--panel">
          <button type="button" className="hr-btn hr-btn--ghost hr-btn--back" onClick={onBack}>
            <Chevron dir={-1} /> BACK
          </button>
          <div className="hr-screen-head__title">SETTINGS</div>
          <span />
        </div>
        <div className="hr-settings">
          <div className="hr-settings__col">
            <div className="hr-settings__group">AUDIO{muted && <em> · muted by the Game Center</em>}</div>
            <Slider label="Sound" value={s.sound} onChange={(v) => onChange({ sound: v })} />
            <Slider label="Music" value={s.music} onChange={(v) => onChange({ music: v })} />
            <Slider label="SFX" value={s.sfx} onChange={(v) => onChange({ sfx: v })} />
            <div className="hr-settings__group">GAMEPLAY</div>
            <Seg label="Camera shake" value={s.cameraShake} options={[["off", "OFF"], ["low", "LOW"], ["normal", "NORMAL"]]} onChange={(v) => onChange({ cameraShake: v })} />
            <Seg label="Speed effects" value={s.speedEffects} options={ONOFF} onChange={(v) => onChange({ speedEffects: v })} />
          </div>
          <div className="hr-settings__col">
            <div className="hr-settings__group">GRAPHICS</div>
            <Seg label="Quality" value={s.graphics} options={[["low", "LOW"], ["medium", "MEDIUM"], ["high", "HIGH"]]} onChange={(v) => onChange({ graphics: v })} />
            <Seg label="Shadows" value={s.shadows} options={[["off", "OFF"], ["low", "LOW"], ["high", "HIGH"]]} onChange={(v) => onChange({ shadows: v })} />
            <Seg label="Particles" value={s.particles} options={[["low", "LOW"], ["normal", "NORMAL"]]} onChange={(v) => onChange({ particles: v })} />
            <div className="hr-settings__group">COMFORT</div>
            <Seg label="Reduced motion" value={s.reducedMotion} options={ONOFF} onChange={(v) => onChange({ reducedMotion: v })} />
            <Seg label="Control help" value={s.controlHelp} options={ONOFF} onChange={(v) => onChange({ controlHelp: v })} />
            <p className="hr-settings__note">Graphics never change gameplay: traffic, speed and collisions are identical on every setting.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
