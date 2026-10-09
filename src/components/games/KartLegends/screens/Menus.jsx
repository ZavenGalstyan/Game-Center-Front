/**
 * Kart Legends — menu screens (DOM panels over the 3D menu backdrop):
 * Main Menu, Race Select (world tour), Garage, Statistics, Settings,
 * Controls.
 */
import { useState } from "react";
import { KARTS, KART_BY_ID } from "../data/karts.js";
import { WORLDS } from "../data/worlds.js";
import { getTrack, TOTAL_TRACKS } from "../data/tracks.js";
import { totalStars, isWorldUnlocked, isTrackUnlocked, isKartUnlocked, unlockProgress, continueTrack, worldComplete } from "../engine/storage.js";
import { Stars } from "../hud/Overlays.jsx";
import { fmtRace, ordinal } from "../hud/useSample.js";

const available = (id) => !!getTrack(id);

function Back({ onBack, label = "Back" }) {
  return (
    <button type="button" className="kl-btn kl-btn--ghost kl-back" onClick={onBack}>
      ◂ {label}
    </button>
  );
}

export function Logo({ small }) {
  return (
    <div className={`kl-logo${small ? " kl-logo--small" : ""}`}>
      <div className="kl-logo__word">
        KART <span>LEGENDS</span>
      </div>
      <div className="kl-logo__tag">RACE • DRIFT • WIN</div>
    </div>
  );
}

export function MainMenu({ state, onPlay, onNav }) {
  const started = Object.keys(state.best).length > 0;
  const next = continueTrack(state, available);
  const def = getTrack(next);
  const kart = KART_BY_ID.get(state.kart);
  const stars = totalStars(state);
  return (
    <div className="kl-menu">
      <Logo />
      <div className="kl-menu__buttons">
        <button type="button" className="kl-btn kl-btn--primary kl-btn--xl" onClick={() => onPlay(next)}>
          {started ? "CONTINUE" : "PLAY"}
          {def && <small>{started ? `Track ${next} · ${def.name}` : def.name}</small>}
        </button>
        <button type="button" className="kl-btn kl-btn--lg" onClick={() => onNav("select")}>
          RACES
        </button>
        <button type="button" className="kl-btn kl-btn--lg" onClick={() => onNav("garage")}>
          GARAGE
        </button>
        <div className="kl-menu__small">
          <button type="button" className="kl-btn" onClick={() => onNav("stats")}>
            STATISTICS
          </button>
          <button type="button" className="kl-btn" onClick={() => onNav("settings")}>
            SETTINGS
          </button>
          <button type="button" className="kl-btn" onClick={() => onNav("controls")}>
            CONTROLS
          </button>
        </div>
      </div>
      <div className="kl-menu__foot">
        <span className="kl-chip">
          ★ <b>{stars}</b> / {TOTAL_TRACKS * 3}
        </span>
        <span className="kl-chip">
          🏆 <b>{state.stats.wins}</b> wins
        </span>
        <span className="kl-chip" style={{ borderColor: kart.colors.body }}>
          Kart: <b>{kart.name}</b>
        </span>
      </div>
    </div>
  );
}

export function RaceSelect({ state, onPick, onBack }) {
  const firstOpen = WORLDS.filter((w) => isWorldUnlocked(state, w.id)).pop() || WORLDS[0];
  const lastWorld = WORLDS.find((w) => state.lastTrack >= w.tracks[0] && state.lastTrack <= w.tracks[1]);
  const [wid, setWid] = useState((lastWorld && isWorldUnlocked(state, lastWorld.id) ? lastWorld : firstOpen).id);
  const world = WORLDS.find((w) => w.id === wid);
  const stars = totalStars(state);
  const ids = [];
  for (let id = world.tracks[0]; id <= world.tracks[1]; id++) ids.push(id);
  const wOpen = isWorldUnlocked(state, world.id);
  return (
    <div className="kl-panel kl-select">
      <div className="kl-panel__head">
        <Back onBack={onBack} />
        <h2>World Tour</h2>
        <span className="kl-chip">
          ★ <b>{stars}</b>
        </span>
      </div>
      <div className="kl-tour">
        {WORLDS.map((w, i) => {
          const open = isWorldUnlocked(state, w.id);
          let got = 0;
          for (let id = w.tracks[0]; id <= w.tracks[1]; id++) got += state.stars[id] || 0;
          return (
            <button
              type="button"
              key={w.id}
              className={`kl-tour__stop kl-theme--${w.theme}${w.id === wid ? " is-active" : ""}${open ? "" : " is-locked"}`}
              onClick={() => setWid(w.id)}
              style={{ "--acc": w.accent }}
            >
              {i > 0 && <i className="kl-tour__road" />}
              <span className="kl-tour__badge">{open ? (worldComplete(state, w.id) ? "✓" : w.id) : "🔒"}</span>
              <span className="kl-tour__name">{w.name}</span>
              <span className="kl-tour__meta">{open ? `${got} / 18 ★` : w.unlock.text}</span>
            </button>
          );
        })}
      </div>
      <div className={`kl-world kl-theme--${world.theme}`} style={{ "--acc": world.accent }}>
        <div className="kl-world__info">
          <h3>{world.name}</h3>
          <p>{world.blurb}</p>
          {!wOpen && (
            <div className="kl-lockbar">
              <div className="kl-lockbar__fill" style={{ width: `${unlockProgress(state, world.unlock).frac * 100}%` }} />
              <span>
                🔒 {world.unlock.text} — {unlockProgress(state, world.unlock).label}
              </span>
            </div>
          )}
        </div>
        <div className="kl-tracks">
          {ids.map((id) => {
            const def = getTrack(id);
            const open = isTrackUnlocked(state, id, available);
            const best = state.best[id];
            return (
              <button type="button" key={id} className={`kl-track${open ? "" : " is-locked"}`} disabled={!open} onClick={() => onPick(id)}>
                <span className="kl-track__no">{id}</span>
                <span className="kl-track__name">{def ? def.name : "Coming soon"}</span>
                {open ? (
                  <>
                    <Stars n={state.stars[id] || 0} size="sm" />
                    <span className="kl-track__best">{best ? `${ordinal(best.place)} · ${fmtRace(best.time)}` : "Not raced"}</span>
                  </>
                ) : (
                  <span className="kl-track__lock">{!def ? "In development" : !wOpen ? "World locked" : "Finish the previous track"}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatBar({ label, v }) {
  return (
    <div className="kl-statbar">
      <span>{label}</span>
      <div className="kl-statbar__track">
        {[1, 2, 3, 4, 5].map((i) => (
          <i key={i} className={i <= v ? "is-on" : ""} />
        ))}
      </div>
    </div>
  );
}

export function Garage({ state, preview, onPreview, onSelect, onBack }) {
  const k = KART_BY_ID.get(preview) || KART_BY_ID.get(state.kart);
  const open = isKartUnlocked(state, k.id);
  const prog = unlockProgress(state, k.unlock);
  return (
    <div className="kl-garage">
      <div className="kl-panel kl-garage__panel">
        <div className="kl-panel__head">
          <Back onBack={onBack} />
          <h2>Garage</h2>
        </div>
        <div className="kl-garage__list">
          {KARTS.map((x) => {
            const u = isKartUnlocked(state, x.id);
            return (
              <button type="button" key={x.id} className={`kl-kartchip${x.id === k.id ? " is-active" : ""}${u ? "" : " is-locked"}${x.id === state.kart ? " is-selected" : ""}`} onClick={() => onPreview(x.id)}>
                <span className="kl-kartchip__sw" style={{ background: x.colors.body, borderColor: x.colors.trim }} />
                <span className="kl-kartchip__name">{x.name}</span>
                {!u && <span className="kl-kartchip__lock">🔒</span>}
                {x.id === state.kart && <span className="kl-kartchip__tick">✓</span>}
              </button>
            );
          })}
        </div>
        <div className="kl-garage__detail">
          <h3 style={{ color: k.colors.body }}>{k.name}</h3>
          <p>{k.blurb}</p>
          <StatBar label="SPEED" v={k.stats.speed} />
          <StatBar label="ACCELERATION" v={k.stats.accel} />
          <StatBar label="HANDLING" v={k.stats.handling} />
          <StatBar label="BOOST" v={k.stats.boost} />
          {open ? (
            <button type="button" className="kl-btn kl-btn--primary kl-btn--lg" disabled={state.kart === k.id} onClick={() => onSelect(k.id)}>
              {state.kart === k.id ? "SELECTED" : "SELECT"}
            </button>
          ) : (
            <div className="kl-lockbar">
              <div className="kl-lockbar__fill" style={{ width: `${prog.frac * 100}%` }} />
              <span>
                🔒 {k.unlock.text} — {prog.label}
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="kl-garage__hint">Drag to spin</div>
    </div>
  );
}

export function Statistics({ state, onBack }) {
  const s = state.stats;
  let tracksDone = 0;
  let threeStar = 0;
  for (let id = 1; id <= TOTAL_TRACKS; id++) {
    if (state.best[id]) tracksDone++;
    if (state.stars[id] === 3) threeStar++;
  }
  const karts = KARTS.filter((k) => isKartUnlocked(state, k.id)).length;
  const rows = [
    ["Races", s.races],
    ["Wins", s.wins],
    ["Podiums", s.podiums],
    ["Win rate", s.races ? `${Math.round((s.wins / s.races) * 100)}%` : "—"],
    ["Stars", `${totalStars(state)} / ${TOTAL_TRACKS * 3}`],
    ["Tracks finished", `${tracksDone} / ${TOTAL_TRACKS}`],
    ["Three-star tracks", threeStar],
    ["Karts unlocked", `${karts} / ${KARTS.length}`],
    ["Drifts", s.drifts],
    ["Mini-turbos", s.miniTurbos],
    ["Boosts used", s.boosts],
    ["Distance", `${(s.distance / 1000).toFixed(1)} km`],
    ["Time racing", `${Math.floor(s.playTime / 60)} min`],
  ];
  const laps = Object.entries(s.bestLaps)
    .map(([id, t]) => [Number(id), t])
    .filter(([id]) => getTrack(id))
    .sort((a, b) => a[0] - b[0]);
  return (
    <div className="kl-panel kl-stats">
      <div className="kl-panel__head">
        <Back onBack={onBack} />
        <h2>Statistics</h2>
      </div>
      <div className="kl-stats__body">
        <div className="kl-stats__grid">
          {rows.map(([k, v]) => (
            <div key={k} className="kl-stat">
              <b>{v}</b>
              <span>{k}</span>
            </div>
          ))}
        </div>
        <div className="kl-stats__laps">
          <h4>Best laps</h4>
          {laps.length === 0 && <p className="kl-note">Finish a race to set a lap record.</p>}
          {laps.map(([id, t]) => (
            <div key={id} className="kl-kv kl-kv--sub">
              <span>
                {id}. {getTrack(id).name}
              </span>
              <b>{fmtRace(t)}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Seg({ value, options, onChange }) {
  return (
    <div className="kl-seg">
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
    <label className="kl-set">
      <span>{label}</span>
      <input type="range" min="0" max="1" step="0.05" value={settings[key]} onChange={(e) => onChange({ [key]: Number(e.target.value) })} />
      <em>{Math.round(settings[key] * 100)}</em>
    </label>
  );
  return (
    <div className="kl-panel kl-settings">
      <div className="kl-panel__head">
        <Back onBack={onBack} />
        <h2>Settings</h2>
      </div>
      <div className="kl-settings__body">
        <div className="kl-settings__col">
          <h4>Audio</h4>
          {slider("master", "Master")}
          {slider("music", "Music")}
          {slider("sfx", "Sound FX")}
          <div className="kl-set">
            <span>Music</span>
            <Seg value={settings.musicOn} options={[[true, "On"], [false, "Off"]]} onChange={(v) => onChange({ musicOn: v })} />
          </div>
          {muted && <div className="kl-note">Sound is muted from the Game Center controls.</div>}
        </div>
        <div className="kl-settings__col">
          <h4>Display</h4>
          <div className="kl-set">
            <span>Graphics</span>
            <Seg value={settings.graphics} options={[["low", "Low"], ["medium", "Medium"], ["high", "High"]]} onChange={(v) => onChange({ graphics: v })} />
          </div>
          <div className="kl-set">
            <span>Shadows</span>
            <Seg value={settings.shadows} options={[[true, "On"], [false, "Off"]]} onChange={(v) => onChange({ shadows: v })} />
          </div>
          <div className="kl-set">
            <span>Effects</span>
            <Seg value={settings.effects} options={[[true, "On"], [false, "Off"]]} onChange={(v) => onChange({ effects: v })} />
          </div>
          <div className="kl-set">
            <span>Camera shake</span>
            <Seg value={settings.shake} options={[[0, "Off"], [0.5, "Low"], [1, "Full"]]} onChange={(v) => onChange({ shake: v })} />
          </div>
          <div className="kl-set">
            <span>Speed units</span>
            <Seg value={settings.units} options={[["kmh", "km/h"], ["mph", "mph"]]} onChange={(v) => onChange({ units: v })} />
          </div>
          <div className="kl-set">
            <span>Minimap</span>
            <Seg value={settings.minimap} options={[[true, "On"], [false, "Off"]]} onChange={(v) => onChange({ minimap: v })} />
          </div>
        </div>
      </div>
      <div className="kl-settings__danger">
        {!confirm ? (
          <button type="button" className="kl-btn kl-btn--ghost" onClick={() => setConfirm(true)}>
            Reset progress…
          </button>
        ) : (
          <div className="kl-row">
            <span className="kl-note">Erase all stars, records, unlocks and statistics?</span>
            <button
              type="button"
              className="kl-btn kl-btn--danger"
              onClick={() => {
                onReset();
                setConfirm(false);
              }}
            >
              Erase
            </button>
            <button type="button" className="kl-btn" onClick={() => setConfirm(false)}>
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
    ["W / ↑", "Accelerate"],
    ["S / ↓", "Brake · reverse"],
    ["A D / ← →", "Steer"],
    ["Space (hold)", "Drift — steer into a corner, then hold"],
    ["Shift", "Boost (spends one meter segment)"],
    ["Esc / P", "Pause"],
  ];
  return (
    <div className="kl-controls">
      <h3>Controls</h3>
      <div className="kl-controls__grid">
        {rows.map(([k, v]) => (
          <div key={k} className="kl-controls__row">
            <kbd>{k}</kbd>
            <span>{v}</span>
          </div>
        ))}
      </div>
      {touch && (
        <p className="kl-note">
          Touch: ◀ ▶ steer on the left; GAS, BRAKE, DRIFT and BOOST on the right.
        </p>
      )}
      <div className="kl-tips">
        <div>
          <b>Drift</b> Hold drift while turning at speed. Sparks turn <span style={{ color: "#7fd4ff" }}>blue</span>, then <span style={{ color: "#ffa531" }}>orange</span>, then <span style={{ color: "#d76bff" }}>purple</span> — release for a mini-turbo.
        </div>
        <div>
          <b>Boost meter</b> Fills from drifts and blue crystals. Each segment is one boost.
        </div>
        <div>
          <b>Boost pads</b> Orange chevrons on the road give a free burst.
        </div>
        <div>
          <b>Stars</b> 1st = ★★★ · 2nd = ★★ · 3rd = ★. Your best result is kept.
        </div>
      </div>
    </div>
  );
}

export function ControlsScreen({ touch, onBack }) {
  return (
    <div className="kl-panel kl-controls-screen">
      <div className="kl-panel__head">
        <Back onBack={onBack} />
        <h2>How to race</h2>
      </div>
      <ControlsList touch={touch} />
    </div>
  );
}
