/**
 * Stunt Racer 3D — menu screens (DOM panels over the 3D backdrop):
 * Main Menu, Level Select (world map), Garage, Statistics, Settings,
 * Controls.
 */
import { useMemo, useState } from "react";
import { CARS, CAR_BY_ID, STAT_KEYS } from "../data/cars.js";
import { WORLDS, worldOfLevel } from "../data/worlds.js";
import { getLevel, levelAvailable, TOTAL_LEVELS } from "../data/levels.js";
import { trackFor } from "../engine/run.js";
import {
  isLevelUnlocked,
  isWorldUnlocked,
  isCarUnlocked,
  unlockProgress,
  continueLevel,
  completedCount,
  goldCount,
  starCount,
  worldStars,
} from "../engine/storage.js";
import { Medal, Slider } from "../hud/Overlays.jsx";
import { StarIcon } from "../hud/Hud.jsx";
import { fmtTime, fmtDist, fmtDuration } from "../hud/useSample.js";

function Back({ onBack, label = "BACK" }) {
  return (
    <button type="button" className="sr-btn sr-btn--ghost sr-back" onClick={onBack}>
      ◂ {label}
    </button>
  );
}

export function Logo({ small }) {
  return (
    <div className={`sr-logo${small ? " sr-logo--small" : ""}`}>
      <div className="sr-logo__word">
        STUNT <span>RACER</span> <em>3D</em>
      </div>
      <div className="sr-logo__tag">DRIVE • FLY • SURVIVE</div>
    </div>
  );
}

export function MainMenu({ state, onPlay, onNav }) {
  const started = Object.keys(state.best).length > 0;
  const next = continueLevel(state, levelAvailable);
  const def = getLevel(next);
  const car = CAR_BY_ID.get(state.car);
  return (
    <div className="sr-menu">
      <Logo />
      <div className="sr-menu__buttons">
        <button type="button" className="sr-btn sr-btn--primary sr-btn--xl" onClick={() => onPlay(next)} autoFocus>
          {started ? "CONTINUE" : "PLAY"}
          {def && <small>{`Level ${next} · ${def.name}`}</small>}
        </button>
        <button type="button" className="sr-btn sr-btn--lg" onClick={() => onNav("levels")}>
          LEVELS
        </button>
        <button type="button" className="sr-btn sr-btn--lg" onClick={() => onNav("garage")}>
          GARAGE
        </button>
        <div className="sr-menu__small">
          <button type="button" className="sr-btn" onClick={() => onNav("stats")}>
            STATISTICS
          </button>
          <button type="button" className="sr-btn" onClick={() => onNav("settings")}>
            SETTINGS
          </button>
          <button type="button" className="sr-btn" onClick={() => onNav("controls")}>
            CONTROLS
          </button>
        </div>
      </div>
      <div className="sr-menu__foot">
        <span className="sr-chip">
          <Medal kind="gold" size={18} /> <b>{goldCount(state)}</b>
        </span>
        <span className="sr-chip">
          <StarIcon on /> <b>{starCount(state)}</b> / {TOTAL_LEVELS * 3}
        </span>
        <span className="sr-chip">
          <b>{completedCount(state)}</b> / {TOTAL_LEVELS} levels
        </span>
        <span className="sr-chip" style={{ borderColor: car.colors.body }}>
          Car: <b>{car.name}</b>
        </span>
      </div>
    </div>
  );
}

// six nodes on a winding road across each world map (% of the map)
const NODES = [
  [11, 64],
  [27, 34],
  [44, 62],
  [58, 28],
  [74, 56],
  [89, 26],
];

function MapArt({ world }) {
  const th = world.theme;
  const sky = world.sky;
  const id = `m${world.id}`;
  return (
    <svg className="sr-map__art" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`sky-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky.top} />
          <stop offset="1" stopColor={sky.horizon} />
        </linearGradient>
      </defs>
      <rect width="100" height="60" fill={`url(#sky-${id})`} />
      {th === "neon" &&
        Array.from({ length: 40 }, (_, i) => <circle key={i} cx={(i * 37) % 100} cy={(i * 13) % 26} r="0.25" fill="#fff" opacity="0.7" />)}
      <path d="M0 34 L12 22 L22 30 L34 16 L46 28 L58 18 L70 30 L82 20 L92 28 L100 22 L100 60 L0 60Z" fill={world.mountains[1]} opacity="0.55" />
      <path d="M0 40 L14 30 L26 38 L40 28 L54 37 L68 29 L84 38 L100 31 L100 60 L0 60Z" fill={world.mountains[0]} opacity="0.7" />
      {th === "sky" || th === "extreme" ? (
        <>
          <ellipse cx="20" cy="54" rx="26" ry="6" fill="#fff" opacity="0.85" />
          <ellipse cx="62" cy="56" rx="34" ry="7" fill="#fff" opacity="0.8" />
          <ellipse cx="96" cy="53" rx="20" ry="6" fill="#fff" opacity="0.85" />
          <rect y="55" width="100" height="5" fill="#fff" opacity="0.9" />
        </>
      ) : th === "desert" ? (
        <>
          <path d="M6 60 L8 44 L18 44 L20 60Z M70 60 L73 40 L86 40 L88 60Z" fill="#a85434" />
          <path d="M36 60 Q46 40 56 60" stroke="#b5643c" strokeWidth="3" fill="none" />
          <rect y="54" width="100" height="6" fill="#e2a96e" />
        </>
      ) : th === "ocean" ? (
        <>
          <rect y="50" width="100" height="10" fill="#1aa6c8" />
          <path d="M14 50 Q20 42 26 50Z M60 50 Q68 40 76 50Z" fill="#3fae5a" />
          <rect x="66" y="40" width="1" height="10" fill="#bff4ff" opacity="0.9" />
        </>
      ) : (
        <>
          {Array.from({ length: 22 }, (_, i) => (
            <rect key={i} x={i * 4.6} y={36 + ((i * 7) % 14)} width="3.8" height="30" fill="#140c26" stroke="#3a1a7a" strokeWidth="0.2" />
          ))}
          {Array.from({ length: 30 }, (_, i) => (
            <rect key={`w${i}`} x={(i * 3.3) % 100} y={42 + ((i * 5) % 14)} width="0.8" height="0.8" fill={i % 3 ? "#ffd98a" : "#2ff3ff"} />
          ))}
        </>
      )}
    </svg>
  );
}

function levelFeatures(def) {
  const T = trackFor(def);
  return {
    len: T.finish - T.start,
    jumps: T.ramps.length,
    loops: T.loops.length,
    obstacles: T.obstacles.length + T.falls.length,
    boosts: T.boosts.length,
    cps: T.checkpoints.length,
  };
}

export function LevelSelect({ state, onPick, onBack }) {
  const lastWorld = worldOfLevel(state.lastLevel);
  const [wid, setWid] = useState(isWorldUnlocked(state, lastWorld.id, levelAvailable) ? lastWorld.id : 1);
  const world = WORLDS.find((w) => w.id === wid);
  const ids = [];
  for (let id = world.levels[0]; id <= world.levels[1]; id++) ids.push(id);
  const lastOpen = ids.filter((id) => isLevelUnlocked(state, id, levelAvailable)).pop();
  const [sel, setSel] = useState(() => (state.lastLevel >= world.levels[0] && state.lastLevel <= world.levels[1] ? continueLevel(state, levelAvailable) : lastOpen || world.levels[0]));
  const selId = sel >= world.levels[0] && sel <= world.levels[1] ? sel : lastOpen || world.levels[0];
  const def = getLevel(selId);
  const open = isLevelUnlocked(state, selId, levelAvailable);
  const best = state.best[selId];
  const info = useMemo(() => (def ? levelFeatures(def) : null), [def]);
  const path = NODES.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  return (
    <div className="sr-panel sr-levels">
      <div className="sr-panel__head">
        <Back onBack={onBack} />
        <h2>SELECT LEVEL</h2>
        <span className="sr-chip">
          <StarIcon on /> <b>{starCount(state)}</b> / {TOTAL_LEVELS * 3}
        </span>
      </div>
      <div className="sr-worlds" role="tablist">
        {WORLDS.map((w) => {
          const unlocked = isWorldUnlocked(state, w.id, levelAvailable);
          return (
            <button
              key={w.id}
              type="button"
              role="tab"
              aria-selected={w.id === wid}
              className={`sr-world${w.id === wid ? " is-active" : ""}${unlocked ? "" : " is-locked"}`}
              style={{ "--w1": w.card[0], "--w2": w.card[1] }}
              onClick={() => unlocked && setWid(w.id)}
              disabled={!unlocked}
            >
              <span className="sr-world__num">WORLD {w.id}</span>
              <span className="sr-world__name">{w.name}</span>
              <span className="sr-world__meta">{unlocked ? `★ ${worldStars(state, w.id)}/18` : "🔒 LOCKED"}</span>
            </button>
          );
        })}
      </div>
      <div className="sr-levels__body">
        <div className="sr-map">
          <MapArt world={world} />
          <svg className="sr-map__road" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path d={path} />
            <path d={path} className="sr-map__dash" />
          </svg>
          {ids.map((id, i) => {
            const unlocked = isLevelUnlocked(state, id, levelAvailable);
            const b = state.best[id];
            const [x, y] = NODES[i];
            return (
              <button
                key={id}
                type="button"
                className={`sr-node${id === selId ? " is-sel" : ""}${unlocked ? "" : " is-locked"}${b ? " is-done" : ""}`}
                style={{ left: `${x}%`, top: `${y}%` }}
                onClick={() => setSel(id)}
                onDoubleClick={() => unlocked && onPick(id)}
                aria-label={`Level ${id}${unlocked ? "" : " (locked)"}`}
              >
                <span className="sr-node__num">{unlocked ? id : "🔒"}</span>
                {b && (
                  <span className="sr-node__medal">
                    <Medal kind={b.medal} size={22} />
                  </span>
                )}
                <span className="sr-node__stars">
                  {[0, 1, 2].map((k) => (
                    <StarIcon key={k} on={!!b && b.stars.includes(k)} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        {def && (
          <div className="sr-detail">
            <div className="sr-detail__kicker">
              {world.name.toUpperCase()} · LEVEL {selId}
            </div>
            <h3 className="sr-detail__name">{def.name}</h3>
            <div className="sr-detail__best">
              <Medal kind={best ? best.medal : null} size={44} />
              <div>
                <span>BEST TIME</span>
                <b>{best ? fmtTime(best.time, true) : "—"}</b>
              </div>
              <div className="sr-detail__stars">
                {[0, 1, 2].map((k) => (
                  <StarIcon key={k} on={!!best && best.stars.includes(k)} size="1.5em" />
                ))}
              </div>
            </div>
            {info && (
              <div className="sr-detail__chips">
                <span>{fmtDist(info.len)}</span>
                {info.jumps > 0 && <span>{info.jumps} jump{info.jumps > 1 ? "s" : ""}</span>}
                {info.loops > 0 && <span>{info.loops} loop{info.loops > 1 ? "s" : ""}</span>}
                {info.obstacles > 0 && <span>{info.obstacles} obstacle{info.obstacles > 1 ? "s" : ""}</span>}
                {info.boosts > 0 && <span>{info.boosts} boost pad{info.boosts > 1 ? "s" : ""}</span>}
                <span>{info.cps} checkpoint{info.cps > 1 ? "s" : ""}</span>
              </div>
            )}
            {def.medals && (
              <div className="sr-detail__targets">
                <span>
                  <Medal kind="gold" size={18} /> {fmtTime(def.medals.gold)}
                </span>
                <span>
                  <Medal kind="silver" size={18} /> {fmtTime(def.medals.silver)}
                </span>
                <span>
                  <Medal kind="bronze" size={18} /> finish
                </span>
              </div>
            )}
            <button type="button" className="sr-btn sr-btn--primary sr-btn--lg sr-detail__play" disabled={!open} onClick={() => onPick(selId)}>
              {open ? "PLAY ▸" : `🔒 FINISH LEVEL ${selId - 1}`}
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
    <div className="sr-panel sr-garage">
      <div className="sr-panel__head">
        <Back onBack={onBack} />
        <h2>GARAGE</h2>
        <span className="sr-chip">Drag the car to spin it</span>
      </div>
      <div className="sr-garage__body">
        <div className="sr-garage__list" role="listbox" aria-label="Cars">
          {CARS.map((c) => {
            const u = isCarUnlocked(state, c.id);
            return (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={c.id === id}
                className={`sr-carbtn${c.id === id ? " is-sel" : ""}${u ? "" : " is-locked"}${state.car === c.id ? " is-current" : ""}`}
                style={{ "--c1": c.colors.body, "--c2": c.colors.accent }}
                onClick={() => onPreview(c.id)}
              >
                <span className="sr-carbtn__swatch" />
                <span className="sr-carbtn__name">{c.name}</span>
                <span className="sr-carbtn__role">{u ? c.role : "🔒 " + unlockProgress(state, c.unlock).need}</span>
              </button>
            );
          })}
        </div>
        <div className="sr-garage__spacer" />
        <div className="sr-garage__card">
          <div className="sr-garage__name" style={{ "--c1": car.colors.body }}>
            {car.name}
          </div>
          <div className="sr-garage__role">{car.role}</div>
          <p className="sr-garage__blurb">{car.blurb}</p>
          <div className="sr-stats">
            {STAT_KEYS.map(([k, label]) => (
              <div key={k} className="sr-stat">
                <span>{label}</span>
                <div className="sr-stat__bar">
                  {Array.from({ length: 10 }, (_, i) => (
                    <i key={i} className={i < car.stats[k] ? "is-on" : ""} style={i < car.stats[k] ? { background: car.colors.body } : null} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          {!unlocked && (
            <div className="sr-garage__lock">
              <div>🔒 UNLOCK: {prog.need}</div>
              <div className="sr-progress">
                <i style={{ transform: `scaleX(${prog.frac})` }} />
              </div>
              <small>{prog.label}</small>
            </div>
          )}
          <button type="button" className="sr-btn sr-btn--primary sr-btn--lg" disabled={!unlocked || selected} onClick={() => onSelect(id)}>
            {selected ? "✓ SELECTED" : unlocked ? "SELECT" : "LOCKED"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Statistics({ state, onBack }) {
  const st = state.stats;
  const carsUnlocked = CARS.filter((c) => isCarUnlocked(state, c.id)).length;
  const tiles = [
    ["Levels Completed", `${completedCount(state)} / ${TOTAL_LEVELS}`],
    ["Gold Medals", goldCount(state)],
    ["Stars Collected", `${starCount(state)} / ${TOTAL_LEVELS * 3}`],
    ["Total Jumps", st.jumps],
    ["Successful Landings", st.landings],
    ["Crashes", st.crashes],
    ["Total Distance", fmtDist(st.distance)],
    ["Nitro Used", `${st.nitroUsed.toFixed(1)} s`],
    ["Cars Unlocked", `${carsUnlocked} / ${CARS.length}`],
    ["Playtime", fmtDuration(st.playTime)],
    ["Levels Finished (runs)", st.finishes],
    ["Longest Air", `${st.bestAir.toFixed(2)} s`],
  ];
  return (
    <div className="sr-panel sr-statsp">
      <div className="sr-panel__head">
        <Back onBack={onBack} />
        <h2>STATISTICS</h2>
        <span />
      </div>
      <div className="sr-tiles">
        {tiles.map(([k, v]) => (
          <div key={k} className="sr-tile">
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
    <div className="sr-toggle">
      <span>{label}</span>
      <div className="sr-seg" role="radiogroup" aria-label={label}>
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
    <div className="sr-panel sr-settings">
      <div className="sr-panel__head">
        <Back onBack={onBack} />
        <h2>SETTINGS</h2>
        <span />
      </div>
      <div className="sr-settings__grid">
        <div className="sr-box">
          <h4>AUDIO</h4>
          <Slider label="Master Volume" value={settings.master} onChange={(v) => onChange({ master: v })} />
          <Slider label="Music" value={settings.music} onChange={(v) => onChange({ music: v })} />
          <Slider label="SFX" value={settings.sfx} onChange={(v) => onChange({ sfx: v })} />
          <Toggle label="Music Track" value={settings.musicOn} onChange={(v) => onChange({ musicOn: v })} options={[[true, "ON"], [false, "OFF"]]} />
          {muted && <div className="sr-note">The Game Center mute is on — nothing will play until it is turned off.</div>}
        </div>
        <div className="sr-box">
          <h4>VIDEO &amp; COMFORT</h4>
          <Toggle label="Graphics Quality" value={settings.graphics} onChange={(v) => onChange({ graphics: v })} options={[["low", "LOW"], ["medium", "MEDIUM"], ["high", "HIGH"]]} />
          <Toggle label="Shadows" value={settings.shadows} onChange={(v) => onChange({ shadows: v })} options={[[true, "ON"], [false, "OFF"]]} />
          <Toggle label="Camera Shake" value={settings.shake} onChange={(v) => onChange({ shake: v })} options={[[0, "OFF"], [0.5, "LOW"], [1, "FULL"]]} />
          <Toggle label="Reduced Motion" value={settings.reducedMotion} onChange={(v) => onChange({ reducedMotion: v })} options={[[false, "OFF"], [true, "ON"]]} />
        </div>
      </div>
      <div className="sr-settings__reset">
        {confirm ? (
          <>
            <span>Erase all Stunt Racer 3D progress? Settings are kept.</span>
            <button type="button" className="sr-btn sr-btn--danger" onClick={() => (onReset(), setConfirm(false))}>
              ERASE
            </button>
            <button type="button" className="sr-btn" onClick={() => setConfirm(false)}>
              CANCEL
            </button>
          </>
        ) : (
          <button type="button" className="sr-btn sr-btn--ghost" onClick={() => setConfirm(true)}>
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
    ["Steer", ["A", "D", "←", "→"], "◀ ▶"],
    ["Handbrake", ["Space"], "DRIFT"],
    ["Nitro (hold)", ["Shift"], "N2O"],
    ["Reset to Checkpoint", ["R"], "RESET"],
    ["Pause", ["Esc", "P"], "❚❚"],
  ];
  return (
    <div className="sr-controls">
      <h3>CONTROLS</h3>
      <div className="sr-controls__grid">
        {rows.map(([what, keys, t]) => (
          <div key={what} className="sr-controls__row">
            <span>{what}</span>
            <span className="sr-controls__keys">
              {touch ? (
                <kbd>{t}</kbd>
              ) : (
                keys.map((k) => <kbd key={k}>{k}</kbd>)
              )}
            </span>
          </div>
        ))}
      </div>
      <ul className="sr-tips">
        <li>Hit ramps straight and fast — a clean landing refills some nitro.</li>
        <li>Loops and big jumps show the speed they need. Hold nitro on the run-up.</li>
        <li>Steering still works a little in the air: line up your landing.</li>
        <li>Fall off? You restart at the last checkpoint — the clock keeps running.</li>
      </ul>
    </div>
  );
}

export function ControlsScreen({ touch, onBack }) {
  return (
    <div className="sr-panel sr-ctrlp">
      <div className="sr-panel__head">
        <Back onBack={onBack} />
        <h2>CONTROLS</h2>
        <span />
      </div>
      <div className="sr-box sr-box--center">
        <ControlsList touch={touch} />
      </div>
    </div>
  );
}
