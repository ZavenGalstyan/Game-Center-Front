/**
 * Downhill Riders — menu screens (DOM panels over the 3D backdrop):
 * Main Menu, Trail Select (region map), Garage, Statistics, Settings,
 * Controls.
 */
import { useMemo, useState } from "react";
import { BIKES, BIKE_BY_ID } from "../data/bikes.js";
import { REGIONS } from "../data/regions.js";
import { getTrack, TOTAL_TRACKS } from "../data/tracks.js";
import { trailFor } from "../engine/race.js";
import { isTrackUnlocked, isRegionUnlocked, isBikeUnlocked, unlockProgress, continueTrack, medalOf, medalCount, goldCount, regionMedals } from "../engine/storage.js";
import { Medal } from "../hud/Overlays.jsx";
import { fmtRace } from "../hud/useSample.js";

const available = (id) => !!getTrack(id);

function Back({ onBack, label = "Back" }) {
  return (
    <button type="button" className="dr-btn dr-btn--ghost dr-back" onClick={onBack}>
      ◂ {label}
    </button>
  );
}

export function Logo({ small }) {
  return (
    <div className={`dr-logo${small ? " dr-logo--small" : ""}`}>
      <div className="dr-logo__word">
        DOWNHILL <span>RIDERS</span>
      </div>
      <div className="dr-logo__tag">RIDE • JUMP • CONQUER</div>
    </div>
  );
}

export function MainMenu({ state, onPlay, onNav }) {
  const started = Object.keys(state.best).length > 0;
  const next = continueTrack(state, available);
  const def = getTrack(next);
  const bike = BIKE_BY_ID.get(state.bike);
  return (
    <div className="dr-menu">
      <Logo />
      <div className="dr-menu__buttons">
        <button type="button" className="dr-btn dr-btn--primary dr-btn--xl" onClick={() => onPlay(next)}>
          {started ? "CONTINUE" : "PLAY"}
          {def && <small>{`Track ${next} · ${def.name}`}</small>}
        </button>
        <button type="button" className="dr-btn dr-btn--lg" onClick={() => onNav("trails")}>
          TRAILS
        </button>
        <button type="button" className="dr-btn dr-btn--lg" onClick={() => onNav("garage")}>
          GARAGE
        </button>
        <div className="dr-menu__small">
          <button type="button" className="dr-btn" onClick={() => onNav("stats")}>
            STATISTICS
          </button>
          <button type="button" className="dr-btn" onClick={() => onNav("settings")}>
            SETTINGS
          </button>
          <button type="button" className="dr-btn" onClick={() => onNav("controls")}>
            CONTROLS
          </button>
        </div>
      </div>
      <div className="dr-menu__foot">
        <span className="dr-chip">
          <Medal kind="gold" size={18} /> <b>{goldCount(state)}</b>
        </span>
        <span className="dr-chip">
          🏅 <b>{medalCount(state)}</b> / {TOTAL_TRACKS} medals
        </span>
        <span className="dr-chip" style={{ borderColor: bike.colors.frame }}>
          Bike: <b>{bike.name}</b>
        </span>
      </div>
    </div>
  );
}

// node layout for six tracks on a region map (% of the map), winding downhill
const NODES = [
  [10, 16],
  [32, 30],
  [17, 55],
  [43, 68],
  [66, 47],
  [86, 76],
];

function MapArt({ region }) {
  const th = region.theme;
  const ground = { forest: ["#7cc35a", "#3f8a3a"], canyon: ["#e7a067", "#a8532c"], alpine: ["#9fd07a", "#4f8f5a"], snow: ["#f4f8fc", "#c8d8e8"], summit: ["#c7a08a", "#5d4a5c"] }[th];
  const peaks = region.mountains;
  return (
    <svg className="dr-map__art" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`sky-${th}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={region.sky.top} />
          <stop offset="1" stopColor={region.sky.horizon} />
        </linearGradient>
        <linearGradient id={`gr-${th}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={ground[0]} />
          <stop offset="1" stopColor={ground[1]} />
        </linearGradient>
      </defs>
      <rect width="100" height="60" fill={`url(#sky-${th})`} />
      <path d="M0 26 L12 12 L20 20 L31 6 L44 19 L55 9 L68 21 L80 7 L92 18 L100 12 L100 60 L0 60Z" fill={peaks[1]} opacity="0.75" />
      <path d="M31 6 L35 10 L33 11 L29 9Z M80 7 L84 11 L81 12 L77 10Z M55 9 L58 12 L54 13Z" fill="#ffffff" opacity={th === "canyon" ? 0 : 0.9} />
      <path d="M0 34 L14 22 L26 30 L40 18 L54 29 L70 20 L84 30 L100 22 L100 60 L0 60Z" fill={peaks[0]} opacity="0.85" />
      <path d="M0 38 C20 30 35 40 50 34 C68 28 82 38 100 32 L100 60 L0 60Z" fill={`url(#gr-${th})`} />
    </svg>
  );
}

export function TrailSelect({ state, onPick, onBack }) {
  const lastRegion = REGIONS.find((r) => state.lastTrack >= r.tracks[0] && state.lastTrack <= r.tracks[1]) || REGIONS[0];
  const [rid, setRid] = useState(isRegionUnlocked(state, lastRegion.id) ? lastRegion.id : 1);
  const region = REGIONS.find((r) => r.id === rid);
  const ids = [];
  for (let id = region.tracks[0]; id <= region.tracks[1]; id++) ids.push(id);
  const firstOpen = ids.filter((id) => isTrackUnlocked(state, id, available)).pop();
  const [sel, setSel] = useState(() => (state.lastTrack >= region.tracks[0] && state.lastTrack <= region.tracks[1] ? state.lastTrack : firstOpen || region.tracks[0]));
  const selId = sel >= region.tracks[0] && sel <= region.tracks[1] ? sel : firstOpen || region.tracks[0];
  const def = getTrack(selId);
  const open = isTrackUnlocked(state, selId, available);
  const best = state.best[selId];
  const info = useMemo(() => {
    if (!def) return null;
    const T = trailFor(def);
    return { km: (T.raceLen / 1000).toFixed(2), drop: Math.round(T.samples[0].y - T.samples[T.N - 1].y), ramps: T.ramps.length, shortcut: !!T.shortcut, cps: T.checkpoints.length };
  }, [def]);
  const path = NODES.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  return (
    <div className="dr-panel dr-trails">
      <div className="dr-panel__head">
        <Back onBack={onBack} />
        <h2>Trail Map</h2>
        <span className="dr-chip">
          🏅 <b>{medalCount(state)}</b> / {TOTAL_TRACKS}
        </span>
      </div>
      <div className="dr-regions">
        {REGIONS.map((r) => {
          const ro = isRegionUnlocked(state, r.id);
          return (
            <button
              type="button"
              key={r.id}
              className={`dr-region${r.id === rid ? " is-active" : ""}${ro ? "" : " is-locked"}`}
              style={{ "--acc": r.accent }}
              onClick={() => {
                setRid(r.id);
                setSel(r.tracks[0]);
              }}
            >
              <span className="dr-region__n">{ro ? r.id : "🔒"}</span>
              <span className="dr-region__name">{r.name}</span>
              <span className="dr-region__meta">{ro ? `${regionMedals(state, r.id)} / 6 medals` : "Locked"}</span>
            </button>
          );
        })}
      </div>
      <div className="dr-trails__body">
        <div className={`dr-map dr-theme--${region.theme}`}>
          <MapArt region={region} />
          <svg className="dr-map__path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path d={path} />
          </svg>
          {ids.map((id, i) => {
            const d = getTrack(id);
            const o = isTrackUnlocked(state, id, available);
            const m = medalOf(state, id);
            const [x, y] = NODES[i];
            return (
              <button
                type="button"
                key={id}
                className={`dr-node${id === selId ? " is-sel" : ""}${o ? "" : " is-locked"}${state.best[id] ? " is-done" : ""}`}
                style={{ left: `${x}%`, top: `${y}%`, "--acc": region.accent }}
                onClick={() => setSel(id)}
                onDoubleClick={() => o && onPick(id)}
                title={d ? d.name : "Coming soon"}
              >
                <span className="dr-node__n">{o ? id : "🔒"}</span>
                {m && (
                  <span className="dr-node__medal">
                    <Medal kind={m} size={22} />
                  </span>
                )}
                <span className="dr-node__name">{d ? d.name : "—"}</span>
              </button>
            );
          })}
          <div className="dr-map__title" style={{ color: region.accent }}>
            {region.name}
          </div>
        </div>
        <div className="dr-trackcard" style={{ "--acc": region.accent }}>
          <div className="dr-card__eyebrow" style={{ color: region.accent }}>
            Track {selId} · {region.name}
          </div>
          <h3>{def ? def.name : "Coming soon"}</h3>
          <p>{def ? def.blurb : region.blurb}</p>
          {info && (
            <div className="dr-trackcard__facts">
              <span>
                <b>{info.km}</b> km
              </span>
              <span>
                <b>{info.drop}</b> m drop
              </span>
              <span>
                <b>{info.ramps}</b> jumps
              </span>
              {info.shortcut && <span className="dr-tag">Shortcut</span>}
            </div>
          )}
          {def && (
            <div className="dr-trackcard__diff">
              Difficulty
              {[0, 1, 2, 3, 4].map((k) => (
                <i key={k} className={k < Math.ceil(def.difficulty * 5 + 0.01) ? "is-on" : ""} />
              ))}
            </div>
          )}
          <div className="dr-trackcard__best">
            <Medal kind={medalOf(state, selId)} size={44} />
            <div>
              <div className="dr-kv dr-kv--sub">
                <span>Best time</span>
                <b>{best ? fmtRace(best.time) : "—"}</b>
              </div>
              <div className="dr-kv dr-kv--sub">
                <span>Best tricks</span>
                <b>{best ? best.trickScore.toLocaleString() : "—"}</b>
              </div>
            </div>
          </div>
          {open ? (
            <button type="button" className="dr-btn dr-btn--primary dr-btn--lg" onClick={() => onPick(selId)}>
              RIDE ▸
            </button>
          ) : (
            <div className="dr-lockmsg">🔒 {selId > 1 ? `Earn a medal on Track ${selId - 1} to unlock` : "Locked"}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatBar({ label, v }) {
  return (
    <div className="dr-statbar">
      <span>{label}</span>
      <div className="dr-statbar__track">
        {[1, 2, 3, 4, 5].map((i) => (
          <i key={i} className={i <= v ? "is-on" : ""} />
        ))}
      </div>
    </div>
  );
}

export function Garage({ state, preview, onPreview, onSelect, onBack }) {
  const b = BIKE_BY_ID.get(preview) || BIKE_BY_ID.get(state.bike);
  const open = isBikeUnlocked(state, b.id);
  const prog = unlockProgress(state, b.unlock);
  return (
    <div className="dr-garage">
      <div className="dr-panel dr-garage__panel">
        <div className="dr-panel__head">
          <Back onBack={onBack} />
          <h2>Bike Garage</h2>
        </div>
        <div className="dr-garage__list">
          {BIKES.map((x) => {
            const u = isBikeUnlocked(state, x.id);
            return (
              <button type="button" key={x.id} className={`dr-bikechip${x.id === b.id ? " is-active" : ""}${u ? "" : " is-locked"}`} onClick={() => onPreview(x.id)}>
                <span className="dr-bikechip__sw" style={{ background: x.colors.frame, borderColor: x.colors.accent }} />
                <span className="dr-bikechip__name">{x.name}</span>
                {!u && <span className="dr-bikechip__lock">🔒</span>}
                {x.id === state.bike && <span className="dr-bikechip__tick">✓</span>}
              </button>
            );
          })}
        </div>
        <div className="dr-garage__detail">
          <h3 style={{ color: b.colors.frame }}>{b.name}</h3>
          <p>{b.blurb}</p>
          <StatBar label="SPEED" v={b.stats.speed} />
          <StatBar label="ACCELERATION" v={b.stats.accel} />
          <StatBar label="HANDLING" v={b.stats.handling} />
          <StatBar label="JUMP CONTROL" v={b.stats.jump} />
          {open ? (
            <button type="button" className="dr-btn dr-btn--primary dr-btn--lg" disabled={state.bike === b.id} onClick={() => onSelect(b.id)}>
              {state.bike === b.id ? "SELECTED" : "SELECT"}
            </button>
          ) : (
            <div className="dr-lockbar">
              <div className="dr-lockbar__fill" style={{ width: `${prog.frac * 100}%` }} />
              <span>
                🔒 {b.unlock.text} — {prog.label}
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="dr-garage__hint">Drag to spin</div>
    </div>
  );
}

export function Statistics({ state, onBack }) {
  const s = state.stats;
  const bikes = BIKES.filter((b) => isBikeUnlocked(state, b.id)).length;
  const hours = Math.floor(s.playTime / 3600);
  const mins = Math.floor((s.playTime % 3600) / 60);
  const rows = [
    ["Races completed", s.races],
    ["Races won", s.wins],
    ["Gold medals", `${goldCount(state)} / ${TOTAL_TRACKS}`],
    ["All medals", `${medalCount(state)} / ${TOTAL_TRACKS}`],
    ["Total distance", `${(s.distance / 1000).toFixed(1)} km`],
    ["Total jumps", s.jumps],
    ["Tricks landed", s.tricks],
    ["Trick points", Math.round(s.trickScore).toLocaleString()],
    ["Best combo", s.bestCombo ? `×${s.bestCombo}` : "—"],
    ["Crashes", s.crashes],
    ["Bikes unlocked", `${bikes} / ${BIKES.length}`],
    ["Playtime", hours ? `${hours} h ${mins} min` : `${mins} min`],
  ];
  const times = Object.entries(state.best)
    .map(([id, b]) => [Number(id), b])
    .filter(([id]) => getTrack(id))
    .sort((a, b) => a[0] - b[0]);
  return (
    <div className="dr-panel dr-stats">
      <div className="dr-panel__head">
        <Back onBack={onBack} />
        <h2>Statistics</h2>
      </div>
      <div className="dr-stats__body">
        <div className="dr-stats__grid">
          {rows.map(([k, v]) => (
            <div key={k} className="dr-stat">
              <b>{v}</b>
              <span>{k}</span>
            </div>
          ))}
        </div>
        <div className="dr-stats__times">
          <h4>Best times</h4>
          {times.length === 0 && <p className="dr-note">Finish a race to set a time.</p>}
          {times.map(([id, b]) => (
            <div key={id} className="dr-kv dr-kv--sub">
              <span>
                <Medal kind={medalOf(state, id)} size={16} /> {id}. {getTrack(id).name}
              </span>
              <b>{fmtRace(b.time)}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Seg({ value, options, onChange }) {
  return (
    <div className="dr-seg">
      {options.map(([v, label]) => (
        <button type="button" key={String(v)} className={v === value ? "is-on" : ""} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function SettingsScreen({ settings, onChange, muted, onReset, onBack }) {
  const [confirm, setConfirm] = useState(false);
  const slider = (key, label) => (
    <label className="dr-set">
      <span>{label}</span>
      <input type="range" min="0" max="1" step="0.05" value={settings[key]} onChange={(e) => onChange({ [key]: Number(e.target.value) })} />
      <em>{Math.round(settings[key] * 100)}</em>
    </label>
  );
  return (
    <div className="dr-panel dr-settings">
      <div className="dr-panel__head">
        <Back onBack={onBack} />
        <h2>Settings</h2>
      </div>
      <div className="dr-settings__body">
        <div className="dr-settings__col">
          <h4>Audio</h4>
          {slider("master", "Master volume")}
          {slider("music", "Music")}
          {slider("sfx", "Sound FX")}
          <div className="dr-set">
            <span>Music</span>
            <Seg value={settings.musicOn} options={[[true, "On"], [false, "Off"]]} onChange={(v) => onChange({ musicOn: v })} />
          </div>
          {muted && <div className="dr-note">Sound is muted from the Game Center controls.</div>}
        </div>
        <div className="dr-settings__col">
          <h4>Display</h4>
          <div className="dr-set">
            <span>Graphics</span>
            <Seg value={settings.graphics} options={[["low", "Low"], ["medium", "Medium"], ["high", "High"]]} onChange={(v) => onChange({ graphics: v })} />
          </div>
          <div className="dr-set">
            <span>Shadows</span>
            <Seg value={settings.shadows} options={[[true, "On"], [false, "Off"]]} onChange={(v) => onChange({ shadows: v })} />
          </div>
          <div className="dr-set">
            <span>Effects</span>
            <Seg value={settings.effects} options={[[true, "On"], [false, "Off"]]} onChange={(v) => onChange({ effects: v })} />
          </div>
          <div className="dr-set">
            <span>Camera shake</span>
            <Seg value={settings.shake} options={[[0, "Off"], [0.5, "Low"], [1, "Full"]]} onChange={(v) => onChange({ shake: v })} />
          </div>
          <div className="dr-set">
            <span>Reduced motion</span>
            <Seg value={settings.reducedMotion} options={[[false, "Off"], [true, "On"]]} onChange={(v) => onChange({ reducedMotion: v })} />
          </div>
          <div className="dr-set">
            <span>Units</span>
            <Seg value={settings.units} options={[["kmh", "km/h"], ["mph", "mph"]]} onChange={(v) => onChange({ units: v })} />
          </div>
        </div>
      </div>
      <div className="dr-settings__danger">
        {!confirm ? (
          <button type="button" className="dr-btn dr-btn--ghost" onClick={() => setConfirm(true)}>
            Reset progress…
          </button>
        ) : (
          <div className="dr-row">
            <span className="dr-note">Erase all medals, times, unlocks and statistics?</span>
            <button
              type="button"
              className="dr-btn dr-btn--danger"
              onClick={() => {
                onReset();
                setConfirm(false);
              }}
            >
              Erase
            </button>
            <button type="button" className="dr-btn" onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ControlsList({ touch }) {
  const rows = [
    ["W / ↑", "Pedal · accelerate"],
    ["S / ↓", "Brake"],
    ["A D / ← →", "Steer (works in the air too)"],
    ["Space", "Jump · bunny hop"],
    ["Shift", "Pedal boost (one meter segment)"],
    ["Q", "Whip  ·  Q + steer: 360 Spin"],
    ["E", "Tabletop  ·  E + steer: Bar Spin"],
    ["R", "Respawn at the last checkpoint"],
    ["Esc / P", "Pause"],
  ];
  return (
    <div className="dr-controls">
      <h3>Controls</h3>
      <div className="dr-controls__grid">
        {rows.map(([k, v]) => (
          <div key={k} className="dr-controls__row">
            <kbd>{k}</kbd>
            <span>{v}</span>
          </div>
        ))}
      </div>
      {touch && <p className="dr-note">Touch: ◀ ▶ steer on the left; PEDAL, BRAKE, JUMP, BOOST and TRICK A / B on the right.</p>}
      <div className="dr-tips">
        <div>
          <b>Gravity is your engine</b> Steep sections build speed on their own. Pedal on the flats, brake <i>before</i> sharp turns.
        </div>
        <div>
          <b>Jumps & tricks</b> Hit a ramp, then press Q or E in the air. Finish the trick before you land — points only count on a clean landing.
        </div>
        <div>
          <b>Boost</b> Clean tricks, blue orbs and checkpoints fill the meter. Each segment is one burst.
        </div>
        <div>
          <b>Obstacles</b> Glancing a rock costs speed; hitting one head-on, or riding off a cliff, means a crash and a checkpoint respawn. Hop over logs.
        </div>
        <div>
          <b>Medals</b> 1st gold · 2nd silver · 3rd bronze. A medal unlocks the next trail; your best medal is always kept.
        </div>
      </div>
    </div>
  );
}

export function ControlsScreen({ touch, onBack }) {
  return (
    <div className="dr-panel dr-controls-screen">
      <div className="dr-panel__head">
        <Back onBack={onBack} />
        <h2>How to ride</h2>
      </div>
      <ControlsList touch={touch} />
    </div>
  );
}
