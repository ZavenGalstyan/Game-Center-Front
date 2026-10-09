/**
 * Police Escape 3D — menu screens (DOM panels over the 3D backdrop):
 * Main Menu, Mission Select (district map), Garage, Statistics, Settings,
 * Controls.
 */
import { useState } from "react";
import { CARS, CAR_BY_ID, STAT_KEYS } from "../data/cars.js";
import { WORLDS, worldOfMission } from "../data/worlds.js";
import { getMission, missionAvailable, TOTAL_MISSIONS } from "../data/missions.js";
import { isMissionUnlocked, isWorldUnlocked, isCarUnlocked, unlockProgress, continueMission, completedCount, starCount, worldStars } from "../engine/storage.js";
import { Stars, Slider } from "../hud/Overlays.jsx";
import { fmtTime, fmtDist, fmtDuration } from "../hud/useSample.js";

const TYPE_NAME = { escape: "ESCAPE", time: "TIME ESCAPE", survive: "SURVIVE", checkpoint: "CHECKPOINT RUN", roadblock: "ROADBLOCK RUN", final: "FINAL PURSUIT" };

function Back({ onBack, label = "BACK" }) {
  return (
    <button type="button" className="pe-btn pe-btn--ghost pe-back" onClick={onBack}>
      ◂ {label}
    </button>
  );
}

export function Logo() {
  return (
    <div className="pe-logo">
      <div className="pe-logo__word">
        POLICE <span>ESCAPE</span> <em>3D</em>
      </div>
      <div className="pe-logo__tag">DRIVE • ESCAPE • SURVIVE</div>
    </div>
  );
}

export function MainMenu({ state, onPlay, onNav }) {
  const started = Object.keys(state.best).length > 0;
  const next = continueMission(state, missionAvailable);
  const def = getMission(next);
  const car = CAR_BY_ID.get(state.car);
  return (
    <div className="pe-menu">
      <Logo />
      <div className="pe-menu__buttons">
        <button type="button" className="pe-btn pe-btn--primary pe-btn--xl" onClick={() => onPlay(next)} autoFocus>
          {started ? "CONTINUE" : "PLAY"}
          {def && <small>{`Mission ${next} · ${def.name}`}</small>}
        </button>
        <button type="button" className="pe-btn pe-btn--lg" onClick={() => onNav("missions")}>
          MISSIONS
        </button>
        <button type="button" className="pe-btn pe-btn--lg" onClick={() => onNav("garage")}>
          GARAGE
        </button>
        <div className="pe-menu__small">
          <button type="button" className="pe-btn" onClick={() => onNav("stats")}>
            STATISTICS
          </button>
          <button type="button" className="pe-btn" onClick={() => onNav("settings")}>
            SETTINGS
          </button>
          <button type="button" className="pe-btn" onClick={() => onNav("controls")}>
            CONTROLS
          </button>
        </div>
      </div>
      <div className="pe-menu__foot">
        <span className="pe-chip">
          <Stars n={1} of={1} /> <b>{starCount(state)}</b> / {TOTAL_MISSIONS * 3}
        </span>
        <span className="pe-chip">
          <b>{completedCount(state)}</b> / {TOTAL_MISSIONS} missions
        </span>
        <span className="pe-chip" style={{ borderColor: car.colors.glow }}>
          Car: <b>{car.name}</b>
        </span>
      </div>
    </div>
  );
}

// mission nodes on each district map (% of the map)
const NODES = [
  [12, 70],
  [28, 36],
  [45, 64],
  [60, 30],
  [75, 60],
  [89, 30],
];

function MapArt({ world }) {
  const pal = world.palette;
  const id = `pm${world.id}`;
  const cols = 14;
  const rows = 8;
  const r = (k) => Math.abs((Math.sin(k * 12.9898 + world.id * 7.1) * 43758.5453) % 1);
  return (
    <svg className="pe-map__art" viewBox="0 0 140 80" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={world.sky.horizon} />
          <stop offset="1" stopColor={world.sky.top} />
        </linearGradient>
      </defs>
      <rect width="140" height="80" fill={`url(#g-${id})`} />
      {/* street grid with glowing avenues */}
      {Array.from({ length: cols + 1 }, (_, i) => (
        <rect key={`v${i}`} x={i * 10 - 0.6} y="0" width={i % 4 === 2 ? 2 : 1.2} height="80" fill={i % 4 === 2 ? pal.neon[1] : "#0a0c12"} opacity={i % 4 === 2 ? 0.55 : 0.9} />
      ))}
      {Array.from({ length: rows + 1 }, (_, j) => (
        <rect key={`h${j}`} x="0" y={j * 10 - 0.6} width="140" height={j % 3 === 1 ? 2 : 1.2} fill={j % 3 === 1 ? pal.neon[0] : "#0a0c12"} opacity={j % 3 === 1 ? 0.5 : 0.9} />
      ))}
      {/* rooftops with lit windows */}
      {Array.from({ length: cols * rows }, (_, k) => {
        const i = k % cols;
        const j = Math.floor(k / cols);
        const water = world.theme === "coastal" && j >= 5 && i > 3 && i < 10;
        return (
          <g key={k}>
            <rect x={i * 10 + 1} y={j * 10 + 1} width="8" height="8" fill={water ? "#0f3050" : pal.towers[k % pal.towers.length]} opacity={0.95} />
            {!water && r(k) > 0.45 && <rect x={i * 10 + 2 + r(k + 1) * 4} y={j * 10 + 2 + r(k + 2) * 4} width="1.2" height="1.2" fill={pal.windows[k % pal.windows.length]} />}
          </g>
        );
      })}
    </svg>
  );
}

export function MissionSelect({ state, onPick, onBack }) {
  const lastWorld = worldOfMission(state.lastMission);
  const [wid, setWid] = useState(isWorldUnlocked(state, lastWorld.id, missionAvailable) ? lastWorld.id : 1);
  const world = WORLDS.find((w) => w.id === wid);
  const ids = [];
  for (let id = world.missions[0]; id <= world.missions[1]; id++) ids.push(id);
  const lastOpen = ids.filter((id) => isMissionUnlocked(state, id, missionAvailable)).pop();
  const [sel, setSel] = useState(() => continueMission(state, missionAvailable));
  const selId = sel >= world.missions[0] && sel <= world.missions[1] ? sel : lastOpen || world.missions[0];
  const def = getMission(selId);
  const open = isMissionUnlocked(state, selId, missionAvailable);
  const best = state.best[selId];
  const path = NODES.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  return (
    <div className="pe-panel pe-missions">
      <div className="pe-panel__head">
        <Back onBack={onBack} />
        <h2>MISSIONS</h2>
        <span className="pe-chip">
          <Stars n={1} of={1} /> <b>{starCount(state)}</b> / {TOTAL_MISSIONS * 3}
        </span>
      </div>
      <div className="pe-worlds" role="tablist">
        {WORLDS.map((w) => {
          const unlocked = isWorldUnlocked(state, w.id, missionAvailable);
          return (
            <button key={w.id} type="button" role="tab" aria-selected={w.id === wid} disabled={!unlocked} className={`pe-world${w.id === wid ? " is-active" : ""}${unlocked ? "" : " is-locked"}`} style={{ "--w1": w.card[0], "--w2": w.card[1] }} onClick={() => unlocked && setWid(w.id)}>
              <span className="pe-world__num">DISTRICT {w.id}</span>
              <span className="pe-world__name">{w.name}</span>
              <span className="pe-world__meta">{unlocked ? `★ ${worldStars(state, w.id)}/18` : "🔒 LOCKED"}</span>
            </button>
          );
        })}
      </div>
      <div className="pe-missions__body">
        <div className="pe-map">
          <MapArt world={world} />
          <svg className="pe-map__route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path d={path} style={{ stroke: world.palette.neon[0] }} />
          </svg>
          {ids.map((id, i) => {
            const unlocked = isMissionUnlocked(state, id, missionAvailable);
            const b = state.best[id];
            const [x, y] = NODES[i];
            return (
              <button key={id} type="button" className={`pe-node${id === selId ? " is-sel" : ""}${unlocked ? "" : " is-locked"}${b ? " is-done" : ""}`} style={{ left: `${x}%`, top: `${y}%`, "--n": world.palette.neon[i % world.palette.neon.length] }} onClick={() => setSel(id)} onDoubleClick={() => unlocked && onPick(id)} aria-label={`Mission ${id}${unlocked ? "" : " (locked)"}`}>
                <span className="pe-node__num">{unlocked ? id : "🔒"}</span>
                <Stars n={b ? b.stars : 0} />
              </button>
            );
          })}
        </div>
        {def && (
          <div className="pe-detail">
            <div className="pe-detail__kicker">
              {world.name.toUpperCase()} · MISSION {selId}
            </div>
            <h3 className="pe-detail__name">{def.name}</h3>
            <div className="pe-detail__type">{TYPE_NAME[def.type] || def.type}</div>
            <p className="pe-detail__brief">{def.brief}</p>
            <div className="pe-detail__chips">
              <span>🚓 {def.police?.start ?? 2}–{Math.min(4, (def.police?.start ?? 2) + (def.police?.max ?? 1) - 1)} police</span>
              {def.timeLimit && <span>⏱ {fmtTime(def.timeLimit)} limit</span>}
              {def.survive && <span>Survive {def.survive}s</span>}
              {def.checkpoints?.length > 0 && <span>{def.checkpoints.length} checkpoints</span>}
              {(def.roadblocks?.length > 0 || def.dynamicBlocks) && <span>Roadblocks</span>}
            </div>
            <div className="pe-detail__best">
              <Stars n={best ? best.stars : 0} size="1.8em" />
              <div>
                <span>BEST ESCAPE</span>
                <b>{best ? fmtTime(best.time, true) : "—"}</b>
              </div>
            </div>
            {def.stars?.time && (
              <div className="pe-detail__targets">
                ★★ under {fmtTime(def.stars.time)} · ★★★ also with {def.stars.integrity ?? 50}%+ integrity
              </div>
            )}
            <button type="button" className="pe-btn pe-btn--primary pe-btn--lg pe-detail__play" disabled={!open} onClick={() => onPick(selId)}>
              {open ? "START PURSUIT ▸" : `🔒 COMPLETE MISSION ${selId - 1}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Garage({ state, preview, onPreview, onSelect, onBack }) {
  const id = preview || state.car;
  const car = CAR_BY_ID.get(id);
  const unlocked = isCarUnlocked(state, id);
  const prog = unlockProgress(state, car.unlock);
  const selected = state.car === id;
  return (
    <div className="pe-panel pe-garage">
      <div className="pe-panel__head">
        <Back onBack={onBack} />
        <h2>GARAGE</h2>
        <span className="pe-chip">Drag the car to spin it</span>
      </div>
      <div className="pe-garage__body">
        <div className="pe-garage__list" role="listbox" aria-label="Cars">
          {CARS.map((c) => {
            const u = isCarUnlocked(state, c.id);
            return (
              <button key={c.id} type="button" role="option" aria-selected={c.id === id} className={`pe-carbtn${c.id === id ? " is-sel" : ""}${u ? "" : " is-locked"}${state.car === c.id ? " is-current" : ""}`} style={{ "--c1": c.colors.body, "--c2": c.colors.glow }} onClick={() => onPreview(c.id)}>
                <span className="pe-carbtn__swatch" />
                <span className="pe-carbtn__name">{c.name}</span>
                <span className="pe-carbtn__role">{u ? c.role : "🔒 " + unlockProgress(state, c.unlock).need}</span>
              </button>
            );
          })}
        </div>
        <div className="pe-garage__spacer" />
        <div className="pe-garage__card">
          <div className="pe-garage__name" style={{ "--c1": car.colors.glow }}>
            {car.name}
          </div>
          <div className="pe-garage__role">{car.role}</div>
          <p className="pe-garage__blurb">{car.blurb}</p>
          <div className="pe-stats">
            {STAT_KEYS.map(([k, label]) => (
              <div key={k} className="pe-stat">
                <span>{label}</span>
                <div className="pe-stat__bar">
                  {Array.from({ length: 10 }, (_, i) => (
                    <i key={i} className={i < car.stats[k] ? "is-on" : ""} style={i < car.stats[k] ? { background: car.colors.glow } : null} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          {!unlocked && (
            <div className="pe-garage__lock">
              <div>🔒 UNLOCK: {prog.need}</div>
              <div className="pe-progress">
                <i style={{ transform: `scaleX(${prog.frac})` }} />
              </div>
              <small>{prog.label}</small>
            </div>
          )}
          <button type="button" className="pe-btn pe-btn--primary pe-btn--lg" disabled={!unlocked || selected} onClick={() => onSelect(id)}>
            {selected ? "✓ SELECTED" : unlocked ? "SELECT" : "LOCKED"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Statistics({ state, onBack }) {
  const st = state.stats;
  const tiles = [
    ["Missions Completed", `${completedCount(state)} / ${TOTAL_MISSIONS}`],
    ["Successful Escapes", st.escapes],
    ["Total Stars", `${starCount(state)} / ${TOTAL_MISSIONS * 3}`],
    ["Best Escape Time", st.bestEscape ? fmtTime(st.bestEscape, true) : "—"],
    ["Total Distance", fmtDist(st.distance)],
    ["Police Cars Evaded", st.evaded],
    ["Roadblocks Avoided", st.roadblocksAvoided],
    ["Nitro Used", `${st.nitroUsed.toFixed(1)} s`],
    ["Cars Unlocked", `${CARS.filter((c) => isCarUnlocked(state, c.id)).length} / ${CARS.length}`],
    ["Playtime", fmtDuration(st.playTime)],
    ["Times Busted", st.busted],
  ];
  return (
    <div className="pe-panel pe-statsp">
      <div className="pe-panel__head">
        <Back onBack={onBack} />
        <h2>STATISTICS</h2>
        <span />
      </div>
      <div className="pe-tiles">
        {tiles.map(([k, v]) => (
          <div key={k} className="pe-tile">
            <span>{k}</span>
            <b>{v}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange, options }) {
  return (
    <div className="pe-toggle">
      <span>{label}</span>
      <div className="pe-seg" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={String(v)} type="button" role="radio" aria-checked={value === v} className={value === v ? "is-on" : ""} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SettingsScreen({ settings, onChange, muted, onReset, onBack }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="pe-panel pe-settings">
      <div className="pe-panel__head">
        <Back onBack={onBack} />
        <h2>SETTINGS</h2>
        <span />
      </div>
      <div className="pe-settings__grid">
        <div className="pe-box">
          <h4>AUDIO</h4>
          <Slider label="Master Volume" value={settings.master} onChange={(v) => onChange({ master: v })} />
          <Slider label="Music Volume" value={settings.music} onChange={(v) => onChange({ music: v })} />
          <Slider label="SFX Volume" value={settings.sfx} onChange={(v) => onChange({ sfx: v })} />
          {muted && <div className="pe-note">The Game Center mute is on — nothing will play until it is turned off.</div>}
        </div>
        <div className="pe-box">
          <h4>VIDEO &amp; COMFORT</h4>
          <Toggle label="Graphics Quality" value={settings.graphics} onChange={(v) => onChange({ graphics: v })} options={[["low", "LOW"], ["medium", "MEDIUM"], ["high", "HIGH"]]} />
          <Toggle label="Shadow Quality" value={settings.shadows} onChange={(v) => onChange({ shadows: v })} options={[["off", "OFF"], ["low", "LOW"], ["medium", "MED"], ["high", "HIGH"]]} />
          <Toggle label="Camera Shake" value={settings.shake} onChange={(v) => onChange({ shake: v })} options={[[0, "OFF"], [0.5, "LOW"], [1, "FULL"]]} />
          <Toggle label="Reduced Motion" value={settings.reducedMotion} onChange={(v) => onChange({ reducedMotion: v })} options={[[false, "OFF"], [true, "ON"]]} />
        </div>
      </div>
      <div className="pe-settings__reset">
        {confirm ? (
          <>
            <span>Erase all Police Escape 3D progress? Settings are kept.</span>
            <button type="button" className="pe-btn pe-btn--danger" onClick={() => (onReset(), setConfirm(false))}>
              ERASE
            </button>
            <button type="button" className="pe-btn" onClick={() => setConfirm(false)}>
              CANCEL
            </button>
          </>
        ) : (
          <button type="button" className="pe-btn pe-btn--ghost" onClick={() => setConfirm(true)}>
            RESET PROGRESS
          </button>
        )}
      </div>
    </div>
  );
}

export function ControlsList({ touch }) {
  const rows = [
    ["Accelerate", ["W", "↑"], "GAS"],
    ["Brake / Reverse", ["S", "↓"], "BRAKE"],
    ["Steer Left", ["A", "←"], "◀"],
    ["Steer Right", ["D", "→"], "▶"],
    ["Nitro (hold)", ["Shift"], "N2O"],
    ["Handbrake", ["Space"], "DRIFT"],
    ["Reset (if stuck)", ["R"], "RESET"],
    ["Pause", ["Esc", "P"], "❚❚"],
  ];
  return (
    <div className="pe-controls">
      <h3>CONTROLS</h3>
      <div className="pe-controls__grid">
        {rows.map(([what, keys, t]) => (
          <div key={what} className="pe-controls__row">
            <span>{what}</span>
            <span className="pe-controls__keys">{touch ? <kbd>{t}</kbd> : keys.map((k) => <kbd key={k}>{k}</kbd>)}</span>
          </div>
        ))}
      </div>
      <ul className="pe-tips">
        <li>Follow the arrow and the beacon to the escape point. The minimap shows police in red / blue.</li>
        <li>Keep moving: police can box in a stopped car — the BUSTED meter fills.</li>
        <li>Near misses and distance refill nitro. Alleys and tunnels shake off pursuers.</li>
        <li>Roadblocks always leave a gap — or take another street.</li>
      </ul>
    </div>
  );
}

export function ControlsScreen({ touch, onBack }) {
  return (
    <div className="pe-panel pe-ctrlp">
      <div className="pe-panel__head">
        <Back onBack={onBack} />
        <h2>CONTROLS</h2>
        <span />
      </div>
      <div className="pe-box pe-box--center">
        <ControlsList touch={touch} />
      </div>
    </div>
  );
}
