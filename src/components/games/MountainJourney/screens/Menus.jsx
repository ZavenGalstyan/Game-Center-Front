/**
 * Mountain Journey — menu screens drawn over the live 3D menu scene:
 * the cinematic Main Menu, Statistics, Settings and Controls.
 */
import { TOTAL_LEVELS, getLevel } from "../data/levels.js";
import { REGIONS, regionOfLevel } from "../data/regions.js";
import { progressOf } from "../engine/storage.js";
import { fmtTime } from "../hud/useTicker.js";

export function MainMenu({ state, onPlay, onNav }) {
  const prog = progressOf(state);
  const started = prog.levels > 0 || Object.keys(state.badges).length > 0;
  const next = Math.min(state.unlocked, Math.max(1, state.lastLevel));
  const nextDef = getLevel(next);
  const region = regionOfLevel(next);
  return (
    <div className="mj-menu">
      <div className="mj-menu__brand">
        <div className="mj-menu__kicker">A journey to the summit</div>
        <h1 className="mj-menu__title">
          Mountain
          <br />
          Journey
        </h1>
        <div className="mj-menu__tag">EXPLORE • CLIMB • DISCOVER</div>
      </div>
      <nav className="mj-menu__nav" aria-label="Main menu">
        <button type="button" className="mj-menu__btn mj-menu__btn--primary" onClick={() => onPlay(next)}>
          <span>{started ? "Continue" : "Play"}</span>
          {nextDef && (
            <small>
              {region.name} · {nextDef.name}
            </small>
          )}
        </button>
        <button type="button" className="mj-menu__btn" onClick={() => onNav("levels")}>
          <span>Levels</span>
          <small>
            {prog.levels} / {TOTAL_LEVELS} trails
          </small>
        </button>
        <button type="button" className="mj-menu__btn" onClick={() => onNav("explorer")}>
          <span>Explorer</span>
        </button>
        <button type="button" className="mj-menu__btn" onClick={() => onNav("stats")}>
          <span>Statistics</span>
        </button>
        <button type="button" className="mj-menu__btn" onClick={() => onNav("settings")}>
          <span>Settings</span>
        </button>
        <button type="button" className="mj-menu__btn" onClick={() => onNav("controls")}>
          <span>Controls</span>
        </button>
      </nav>
      <div className="mj-menu__foot">
        <span>★ {prog.badges} badges</span>
        <span>◎ {prog.viewpoints} viewpoints</span>
        {state.stats.summit && <span className="mj-menu__summit">⛰ Summit reached</span>}
      </div>
    </div>
  );
}

function Panel({ title, kicker, onBack, children, wide }) {
  return (
    <div className="mj-screen">
      <div className={`mj-panel${wide ? " mj-panel--wide" : ""}`}>
        <div className="mj-panel__head">
          <div>
            {kicker && <div className="mj-card__kicker">{kicker}</div>}
            <h2 className="mj-panel__title">{title}</h2>
          </div>
          <button type="button" className="mj-btn mj-btn--ghost mj-btn--small" onClick={onBack}>
            ← Back
          </button>
        </div>
        <div className="mj-panel__body">{children}</div>
      </div>
    </div>
  );
}

export function Statistics({ state, onBack }) {
  const prog = progressOf(state);
  const s = state.stats;
  const tiles = [
    ["Levels Completed", `${prog.levels} / ${TOTAL_LEVELS}`],
    ["Collectibles Found", `${prog.badges} / ${TOTAL_LEVELS * 3}`],
    ["Viewpoints Discovered", `${prog.viewpoints} / ${TOTAL_LEVELS}`],
    ["Distance Traveled", s.distance >= 1000 ? `${(s.distance / 1000).toFixed(2)} km` : `${Math.round(s.distance)} m`],
    ["Total Jumps", s.jumps.toLocaleString()],
    ["Total Falls", s.falls.toLocaleString()],
    ["Playtime", fmtLong(s.playtime)],
    ["Summit Reached", s.summit ? "Yes ⛰" : "Not yet"],
  ];
  return (
    <Panel title="Statistics" kicker="Your expedition log" onBack={onBack} wide>
      <div className="mj-stats">
        {tiles.map(([k, v]) => (
          <div key={k} className="mj-stat">
            <span className="mj-stat__k">{k}</span>
            <span className="mj-stat__v">{v}</span>
          </div>
        ))}
      </div>
      <div className="mj-besttimes">
        <div className="mj-besttimes__title">Best Times</div>
        <div className="mj-besttimes__grid">
          {REGIONS.map((r) => (
            <div key={r.id} className="mj-besttimes__region">
              <div className="mj-besttimes__rname" style={{ color: r.accent }}>
                {r.name}
              </div>
              {Array.from({ length: 6 }, (_, i) => r.levels[0] + i).map((id) => (
                <div key={id} className="mj-besttimes__row">
                  <span>{id}</span>
                  <span>{state.bestTime[id] != null ? fmtTime(state.bestTime[id]) : "—"}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function fmtLong(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(sec % 60)}s`;
}

function Slider({ label, value, onChange, min = 0, max = 1, step = 0.05, fmt }) {
  return (
    <label className="mj-setting">
      <span className="mj-setting__label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="mj-setting__val">{fmt ? fmt(value) : `${Math.round(value * 100)}%`}</span>
    </label>
  );
}

function Choice({ label, value, options, onChange }) {
  return (
    <div className="mj-setting">
      <span className="mj-setting__label">{label}</span>
      <div className="mj-seg" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => (
          <button key={String(v)} type="button" role="radio" aria-checked={value === v} className={`mj-seg__opt${value === v ? " is-on" : ""}`} onClick={() => onChange(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SettingsPanel({ settings, onChange, muted, compact }) {
  const set = (k) => (v) => onChange({ [k]: v });
  return (
    <div className={`mj-settings${compact ? " mj-settings--compact" : ""}`}>
      {muted && <div className="mj-note">Sound is muted from the Game Center controls.</div>}
      <Slider label="Master Volume" value={settings.master} onChange={set("master")} />
      <Slider label="Music" value={settings.music} onChange={set("music")} />
      <Slider label="SFX" value={settings.sfx} onChange={set("sfx")} />
      <Choice
        label="Graphics Quality"
        value={settings.graphics}
        onChange={set("graphics")}
        options={[
          ["low", "Low"],
          ["medium", "Medium"],
          ["high", "High"],
        ]}
      />
      <Choice
        label="Shadow Quality"
        value={settings.shadows}
        onChange={set("shadows")}
        options={[
          ["off", "Off"],
          ["medium", "Medium"],
          ["high", "High"],
        ]}
      />
      <Slider label="Camera Sensitivity" value={settings.sensitivity} min={0.3} max={2.5} step={0.05} onChange={set("sensitivity")} fmt={(v) => `${v.toFixed(2)}×`} />
      <Choice
        label="Camera Bob"
        value={settings.cameraBob}
        onChange={set("cameraBob")}
        options={[
          [true, "On"],
          [false, "Off"],
        ]}
      />
      <Choice
        label="Reduced Motion"
        value={settings.reducedMotion}
        onChange={set("reducedMotion")}
        options={[
          [false, "Off"],
          [true, "On"],
        ]}
      />
    </div>
  );
}

export function SettingsScreen({ settings, onChange, muted, onBack }) {
  return (
    <Panel title="Settings" kicker="Sound, graphics & camera" onBack={onBack}>
      <SettingsPanel settings={settings} onChange={onChange} muted={muted} />
    </Panel>
  );
}

export function ControlsList({ touch }) {
  const rows = touch
    ? [
        ["Left side drag", "Move"],
        ["Right side drag", "Look around"],
        ["JUMP", "Jump · climb ledges & ladders"],
        ["RUN", "Toggle running"],
        ["E", "Interact (levers, switches, gates, viewpoints)"],
        ["❚❚", "Pause"],
      ]
    : [
        ["W A S D / Arrows", "Move"],
        ["Mouse", "Rotate camera"],
        ["Space", "Jump · climb ledges & ladders"],
        ["Shift", "Run"],
        ["E", "Interact (levers, switches, gates, viewpoints)"],
        ["W / S on a ladder", "Climb up / down"],
        ["Esc / P", "Pause"],
      ];
  return (
    <div className="mj-controls">
      <div className="mj-controls__title">Controls</div>
      {rows.map(([k, v]) => (
        <div key={k} className="mj-controls__row">
          <kbd>{k}</kbd>
          <span>{v}</span>
        </div>
      ))}
      <div className="mj-controls__tips">
        <p>Pale stone lips with yellow paint marks can be climbed — walk into them or press Jump.</p>
        <p>Falling is never the end: you'll return to the last checkpoint flag, lantern or shelter.</p>
      </div>
    </div>
  );
}

export function ControlsScreen({ onBack, touch }) {
  return (
    <Panel title="Controls" kicker="How to explore" onBack={onBack}>
      <ControlsList touch={touch} />
    </Panel>
  );
}
