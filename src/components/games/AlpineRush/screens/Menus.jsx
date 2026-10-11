/**
 * Alpine Rush — menu screens (DOM panels over the 3D alpine backdrop):
 * Main Menu, World Select (+ the world's six courses), Free Ski, Garage
 * (skis + customisation), Statistics, Settings, How to Play.
 */
import { useMemo, useState } from "react";
import { SKIS, SKI_BY_ID, JACKETS, PANTS, HELMETS, GOGGLES, SKI_DESIGNS } from "../data/skis.js";
import { WORLDS } from "../data/worlds.js";
import { getCourse, TOTAL_LEVELS } from "../data/courses.js";
import { courseFor, MODE_NAMES, MISS_PENALTY } from "../engine/race.js";
import { isLevelUnlocked, isWorldUnlocked, isSkiUnlocked, unlockProgress, continueLevel, medalOf, medalCount, goldCount, worldMedals } from "../engine/storage.js";
import { Medal } from "../hud/Overlays.jsx";
import { fmtTime } from "../hud/useSample.js";

const available = (id) => !!getCourse(id);

function Back({ onBack, label = "BACK" }) {
  return (
    <button type="button" className="ar-btn ar-btn--ghost ar-back" onClick={onBack}>
      ◂ {label}
    </button>
  );
}

export function Logo({ small }) {
  return (
    <div className={`ar-logo${small ? " ar-logo--small" : ""}`}>
      <div className="ar-logo__word">
        ALPINE <span>RUSH</span>
      </div>
      <div className="ar-logo__tag">SKI • RACE • CONQUER</div>
    </div>
  );
}

export function MainMenu({ state, onPlay, onNav }) {
  const started = Object.keys(state.best).length > 0;
  const next = continueLevel(state, available);
  const def = getCourse(next);
  const ski = SKI_BY_ID.get(state.ski);
  return (
    <div className="ar-menu">
      <Logo />
      <div className="ar-menu__buttons">
        <button type="button" className="ar-btn ar-btn--primary ar-btn--xl" onClick={() => onPlay(next)}>
          {started ? "CONTINUE" : "PLAY"}
          {def && <small>{`Level ${next} · ${def.name}`}</small>}
        </button>
        <button type="button" className="ar-btn ar-btn--lg" onClick={() => onNav("worlds")}>
          WORLD SELECT
        </button>
        <button type="button" className="ar-btn ar-btn--lg" onClick={() => onNav("free")}>
          FREE SKI
        </button>
        <button type="button" className="ar-btn ar-btn--lg" onClick={() => onNav("garage")}>
          GARAGE
        </button>
        <div className="ar-menu__small">
          <button type="button" className="ar-btn" onClick={() => onNav("stats")}>
            STATISTICS
          </button>
          <button type="button" className="ar-btn" onClick={() => onNav("settings")}>
            SETTINGS
          </button>
          <button type="button" className="ar-btn" onClick={() => onNav("howto")}>
            HOW TO PLAY
          </button>
        </div>
      </div>
      <div className="ar-menu__foot">
        <span className="ar-chip">
          <Medal kind="gold" size={18} /> <b>{goldCount(state)}</b>
        </span>
        <span className="ar-chip">
          <Medal kind="silver" size={18} /> <b>{medalCount(state)}</b> / {TOTAL_LEVELS} medals
        </span>
        <span className="ar-chip" style={{ borderColor: ski.colors.accent }}>
          🎿 <b>{ski.name}</b>
        </span>
      </div>
    </div>
  );
}

/** Small painted preview of a world (SVG) for the cards. */
export function WorldArt({ world }) {
  const th = world.theme;
  const s = world.sky;
  const peaks = world.mountains;
  const storm = th === "blizzard";
  return (
    <svg className="ar-worldart" viewBox="0 0 100 56" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`wsky-${th}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={s.top} />
          <stop offset="1" stopColor={s.horizon} />
        </linearGradient>
      </defs>
      <rect width="100" height="56" fill={`url(#wsky-${th})`} />
      {th === "summit" && <circle cx="78" cy="30" r="7" fill="#ffd2a0" opacity="0.9" />}
      {th === "sunny" && <circle cx="80" cy="12" r="5" fill="#fff6d8" />}
      <path d="M0 30 L14 14 L22 22 L34 6 L46 20 L56 10 L70 24 L82 8 L94 20 L100 15 L100 56 L0 56Z" fill={peaks[1]} opacity="0.8" />
      <path d="M34 6 L38 11 L35 12 L31 10Z M82 8 L86 13 L83 14 L79 11Z M56 10 L59 14 L55 15Z M14 14 L17 17 L12 18Z" fill="#ffffff" />
      <path d="M0 38 L16 26 L28 33 L42 22 L56 32 L72 24 L86 33 L100 26 L100 56 L0 56Z" fill={peaks[0]} opacity="0.9" />
      <path d="M0 44 C22 36 36 46 52 40 C70 34 84 44 100 38 L100 56 L0 56Z" fill={world.snow.a} />
      <path d="M40 56 C46 48 52 46 60 40 C64 37 70 35 76 34" stroke={world.piste.line} strokeWidth="5" fill="none" opacity="0.9" />
      {(th === "pine" || th === "sunny" || th === "blizzard") &&
        [8, 14, 20, 84, 90, 96, 26].map((x, i) => <path key={i} d={`M${x} ${48 - (i % 3)} l2.4 -7 l2.4 7z`} fill={th === "pine" ? "#2a5a3a" : "#3a6a4a"} />)}
      {th === "frozen" && <path d="M60 46 l10 -2 l6 3 l-8 2z" fill="#bfe6fb" opacity="0.9" />}
      {storm && <rect width="100" height="56" fill="#ffffff" opacity="0.35" />}
      {th === "summit" && <rect width="100" height="56" fill="#ff9a6a" opacity="0.12" />}
    </svg>
  );
}

export function WorldSelect({ state, onPick, onBack }) {
  const lastWorld = WORLDS.find((w) => state.lastLevel >= w.levels[0] && state.lastLevel <= w.levels[1]) || WORLDS[0];
  const [wid, setWid] = useState(isWorldUnlocked(state, lastWorld.id, available) ? lastWorld.id : 1);
  const world = WORLDS.find((w) => w.id === wid);
  const ids = [];
  for (let id = world.levels[0]; id <= world.levels[1]; id++) ids.push(id);
  const [sel, setSel] = useState(() => {
    const open = ids.filter((id) => isLevelUnlocked(state, id, available));
    return state.lastLevel >= world.levels[0] && state.lastLevel <= world.levels[1] ? state.lastLevel : open[open.length - 1] || world.levels[0];
  });
  const selId = sel >= world.levels[0] && sel <= world.levels[1] ? sel : world.levels[0];
  const def = getCourse(selId);
  const open = isLevelUnlocked(state, selId, available);
  const best = state.best[selId];
  const info = useMemo(() => {
    if (!def) return null;
    const T = courseFor(def);
    return { km: (T.raceLen / 1000).toFixed(2), drop: Math.round(T.samples[0].y - T.samples[T.N - 1].y), jumps: T.ramps.length, gates: T.gates.length };
  }, [def]);
  return (
    <div className="ar-panel ar-worlds">
      <div className="ar-panel__head">
        <Back onBack={onBack} />
        <h2>World Select</h2>
        <span className="ar-chip">
          <Medal kind="gold" size={16} /> <b>{medalCount(state)}</b> / {TOTAL_LEVELS}
        </span>
      </div>
      <div className="ar-worldcards">
        {WORLDS.map((w) => {
          const wo = isWorldUnlocked(state, w.id, available);
          const m = worldMedals(state, w.id);
          return (
            <button
              type="button"
              key={w.id}
              className={`ar-worldcard${w.id === wid ? " is-active" : ""}${wo ? "" : " is-locked"}`}
              style={{ "--acc": w.accent }}
              onClick={() => {
                setWid(w.id);
                setSel(w.levels[0]);
              }}
            >
              <WorldArt world={w} />
              <span className="ar-worldcard__body">
                <span className="ar-worldcard__n">WORLD {w.id}</span>
                <span className="ar-worldcard__name">{w.name}</span>
                <span className="ar-worldcard__meta">
                  {wo ? (
                    <>
                      {m.done}/6 raced · <i className="is-g">{m.gold}</i> <i className="is-s">{m.silver}</i> <i className="is-b">{m.bronze}</i>
                    </>
                  ) : (
                    `🔒 Medal on level ${w.levels[0] - 1}`
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="ar-worlds__body">
        <div className="ar-levels">
          <div className="ar-levels__title" style={{ color: world.accent }}>
            {world.name} <small>· {world.difficulty}</small>
          </div>
          <p className="ar-note">{world.blurb}</p>
          <div className="ar-levels__list">
            {ids.map((id) => {
              const d = getCourse(id);
              const o = isLevelUnlocked(state, id, available);
              return (
                <button type="button" key={id} className={`ar-level${id === selId ? " is-sel" : ""}${o ? "" : " is-locked"}`} style={{ "--acc": world.accent }} onClick={() => setSel(id)} onDoubleClick={() => o && onPick(id)}>
                  <span className="ar-level__n">{o ? id : "🔒"}</span>
                  <span className="ar-level__name">
                    {d ? d.name : "Coming soon"}
                    {d && <em>{MODE_NAMES[d.mode]}</em>}
                  </span>
                  <span className="ar-level__medal">
                    <Medal kind={medalOf(state, id)} size={24} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="ar-coursecard" style={{ "--acc": world.accent }}>
          <div className="ar-card__eyebrow" style={{ color: world.accent }}>
            Level {selId} · {def ? MODE_NAMES[def.mode] : ""}
          </div>
          <h3>{def ? def.name : "Coming soon"}</h3>
          <p>{def ? def.blurb : world.blurb}</p>
          {info && (
            <div className="ar-coursecard__facts">
              <span>
                <b>{info.km}</b> km
              </span>
              <span>
                <b>{info.drop}</b> m drop
              </span>
              <span>
                <b>{info.gates}</b> gates
              </span>
              <span>
                <b>{info.jumps}</b> jumps
              </span>
            </div>
          )}
          {def && (
            <div className="ar-coursecard__rule">
              Missed gate <b>+{MISS_PENALTY[def.mode]} s</b>
              {def.mode === "rival" ? " · beat three rival skiers" : def.medals ? ` · gold ${fmtTime(def.medals[0])}` : ""}
            </div>
          )}
          <div className="ar-coursecard__best">
            <Medal kind={medalOf(state, selId)} size={44} />
            <div>
              <div className="ar-kv ar-kv--sub">
                <span>Best time</span>
                <b>{best ? fmtTime(best.time) : "—"}</b>
              </div>
              <div className="ar-kv ar-kv--sub">
                <span>Finishes</span>
                <b>{best ? best.finishes : 0}</b>
              </div>
            </div>
          </div>
          {open ? (
            <button type="button" className="ar-btn ar-btn--primary ar-btn--lg" onClick={() => onPick(selId)}>
              RACE ▸
            </button>
          ) : (
            <div className="ar-lockmsg">🔒 {!def ? "This course is coming soon" : selId > 1 ? `Earn a medal on Level ${selId - 1} to unlock` : "Locked"}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function FreeSki({ state, onPick, onBack }) {
  const open = [];
  for (let id = 1; id <= TOTAL_LEVELS; id++) if (isLevelUnlocked(state, id, available)) open.push(id);
  return (
    <div className="ar-panel ar-free">
      <div className="ar-panel__head">
        <Back onBack={onBack} />
        <h2>Free Ski</h2>
      </div>
      <p className="ar-note">No clock, no gates, no rivals. Practise carving, braking and jumps on any mountain you have unlocked. Esc returns to the menu any time.</p>
      <div className="ar-free__grid">
        {open.map((id) => {
          const d = getCourse(id);
          const w = WORLDS.find((x) => id >= x.levels[0] && id <= x.levels[1]);
          return (
            <button type="button" key={id} className="ar-freecard" style={{ "--acc": w.accent }} onClick={() => onPick(id)}>
              <WorldArt world={w} />
              <span className="ar-freecard__name">
                {id}. {d.name}
              </span>
              <span className="ar-freecard__w">{w.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The lighter of two hex colours (keeps titles readable on the dark panel). */
const lum = (h) => {
  const n = parseInt(h.slice(1), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
};
/** The lighter of two colours — unless that one is near-white, then the other. */
const lighter = (a, b) => {
  const [hi, lo] = lum(a) >= lum(b) ? [a, b] : [b, a];
  return lum(hi) > 230 ? lo : hi;
};

function StatBar({ label, v }) {
  return (
    <div className="ar-statbar">
      <span>{label}</span>
      <div className="ar-statbar__track">
        {[1, 2, 3, 4, 5].map((i) => (
          <i key={i} className={i <= v ? "is-on" : ""} />
        ))}
      </div>
    </div>
  );
}

function Swatches({ list, value, onPick, label }) {
  return (
    <div className="ar-swatches" role="radiogroup" aria-label={label}>
      {list.map((c) => (
        <button type="button" key={c} role="radio" aria-checked={c === value} className={`ar-swatch${c === value ? " is-on" : ""}`} style={{ background: c }} onClick={() => onPick(c)} title={c} />
      ))}
    </div>
  );
}

export function Garage({ state, preview, onPreview, onSelect, onCustom, onBack }) {
  const [tab, setTab] = useState("skis");
  const k = SKI_BY_ID.get(preview) || SKI_BY_ID.get(state.ski);
  const open = isSkiUnlocked(state, k.id);
  const prog = unlockProgress(state, k.unlock);
  const c = state.custom;
  return (
    <div className="ar-garage">
      <div className="ar-panel ar-garage__panel">
        <div className="ar-panel__head">
          <Back onBack={onBack} />
          <h2>Ski Garage</h2>
        </div>
        <div className="ar-tabs">
          <button type="button" className={tab === "skis" ? "is-on" : ""} onClick={() => setTab("skis")}>
            SKIS
          </button>
          <button type="button" className={tab === "skier" ? "is-on" : ""} onClick={() => setTab("skier")}>
            SKIER
          </button>
        </div>
        {tab === "skis" ? (
          <>
            <div className="ar-garage__list">
              {SKIS.map((x) => {
                const u = isSkiUnlocked(state, x.id);
                return (
                  <button type="button" key={x.id} className={`ar-skichip${x.id === k.id ? " is-active" : ""}${u ? "" : " is-locked"}`} onClick={() => onPreview(x.id)}>
                    <span className="ar-skichip__sw" style={{ background: `linear-gradient(90deg, ${x.colors.base} 0 40%, ${x.colors.accent} 40% 70%, ${x.colors.tip} 70%)` }} />
                    <span className="ar-skichip__name">{x.name}</span>
                    {!u && <span className="ar-skichip__lock">🔒</span>}
                    {x.id === state.ski && <span className="ar-skichip__tick">✓</span>}
                  </button>
                );
              })}
            </div>
            <div className="ar-garage__detail">
              <h3 style={{ color: lighter(k.colors.base, k.colors.accent) }}>{k.name}</h3>
              <p>{k.blurb}</p>
              <StatBar label="SPEED" v={k.stats.speed} />
              <StatBar label="HANDLING" v={k.stats.handling} />
              <StatBar label="BRAKING" v={k.stats.braking} />
              <StatBar label="STABILITY" v={k.stats.stability} />
              {k.special && <div className="ar-special">★ {k.special.text}</div>}
              {open ? (
                <button type="button" className="ar-btn ar-btn--primary ar-btn--lg" disabled={state.ski === k.id} onClick={() => onSelect(k.id)}>
                  {state.ski === k.id ? "EQUIPPED" : "EQUIP"}
                </button>
              ) : (
                <div className="ar-lockbar">
                  <div className="ar-lockbar__fill" style={{ width: `${prog.frac * 100}%` }} />
                  <span>
                    🔒 {k.unlock.text} — {prog.label}
                  </span>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="ar-custom">
            <div className="ar-custom__row">
              <span>Jacket</span>
              <Swatches list={JACKETS} value={c.jacket} onPick={(v) => onCustom({ jacket: v })} label="Jacket colour" />
            </div>
            <div className="ar-custom__row">
              <span>Pants</span>
              <Swatches list={PANTS} value={c.pants} onPick={(v) => onCustom({ pants: v })} label="Pants colour" />
            </div>
            <div className="ar-custom__row">
              <span>Helmet</span>
              <Swatches list={HELMETS} value={c.helmet} onPick={(v) => onCustom({ helmet: v })} label="Helmet colour" />
            </div>
            <div className="ar-custom__row">
              <span>Goggles</span>
              <div className="ar-seg ar-seg--wrap">
                {Object.entries(GOGGLES).map(([id, g]) => (
                  <button type="button" key={id} className={c.goggles === id ? "is-on" : ""} onClick={() => onCustom({ goggles: id })}>
                    <i className="ar-lens" style={{ background: g.lens }} /> {g.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="ar-custom__row">
              <span>Ski design</span>
              <div className="ar-seg ar-seg--wrap">
                {Object.entries(SKI_DESIGNS).map(([id, name]) => (
                  <button type="button" key={id} className={c.design === id ? "is-on" : ""} onClick={() => onCustom({ design: id })}>
                    {name}
                  </button>
                ))}
              </div>
            </div>
            <p className="ar-note">Saved automatically. Your skier wears it in every race.</p>
          </div>
        )}
      </div>
      <div className="ar-garage__hint">Drag to turn the skier</div>
    </div>
  );
}

export function Statistics({ state, onBack }) {
  const s = state.stats;
  const skis = SKIS.filter((k) => isSkiUnlocked(state, k.id)).length;
  const hours = Math.floor(s.playTime / 3600);
  const mins = Math.floor((s.playTime % 3600) / 60);
  const rows = [
    ["Races finished", s.races],
    ["Rival wins", s.wins],
    ["Gold medals", `${goldCount(state)} / ${TOTAL_LEVELS}`],
    ["All medals", `${medalCount(state)} / ${TOTAL_LEVELS}`],
    ["Distance skied", `${(s.distance / 1000).toFixed(1)} km`],
    ["Top speed", `${Math.round(s.topSpeed * 3.6)} km/h`],
    ["Jumps", s.jumps],
    ["Air time", `${s.airTime.toFixed(1)} s`],
    ["Gates passed", s.gatesPassed],
    ["Gates missed", s.gatesMissed],
    ["Falls", s.falls],
    ["Skis unlocked", `${skis} / ${SKIS.length}`],
    ["Playtime", hours ? `${hours} h ${mins} min` : `${mins} min`],
    ["Free skiing", `${Math.floor(s.freeSkiTime / 60)} min`],
  ];
  const times = Object.entries(state.best)
    .map(([id, b]) => [Number(id), b])
    .filter(([id]) => getCourse(id))
    .sort((a, b) => a[0] - b[0]);
  return (
    <div className="ar-panel ar-stats">
      <div className="ar-panel__head">
        <Back onBack={onBack} />
        <h2>Statistics</h2>
      </div>
      <div className="ar-stats__body">
        <div className="ar-stats__grid">
          {rows.map(([k, v]) => (
            <div key={k} className="ar-stat">
              <b>{v}</b>
              <span>{k}</span>
            </div>
          ))}
        </div>
        <div className="ar-stats__times">
          <h4>Best times</h4>
          {times.length === 0 && <p className="ar-note">Finish a race to set a time.</p>}
          {times.map(([id, b]) => (
            <div key={id} className="ar-kv ar-kv--sub">
              <span>
                <Medal kind={medalOf(state, id)} size={16} /> {id}. {getCourse(id).name}
              </span>
              <b>{fmtTime(b.time)}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Seg({ value, options, onChange }) {
  return (
    <div className="ar-seg">
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
    <label className="ar-set">
      <span>{label}</span>
      <input type="range" min="0" max="1" step="0.05" value={settings[key]} onChange={(e) => onChange({ [key]: Number(e.target.value) })} />
      <em>{Math.round(settings[key] * 100)}</em>
    </label>
  );
  return (
    <div className="ar-panel ar-settings">
      <div className="ar-panel__head">
        <Back onBack={onBack} />
        <h2>Settings</h2>
      </div>
      <div className="ar-settings__body">
        <div className="ar-settings__col">
          <h4>Audio</h4>
          {slider("master", "Master volume")}
          {slider("music", "Music volume")}
          {slider("sfx", "Sound effects")}
          {muted && <div className="ar-note">Sound is muted from the Game Center controls.</div>}
          <h4>Camera</h4>
          <div className="ar-set">
            <span>Distance</span>
            <Seg value={settings.camDist} options={[["near", "Near"], ["normal", "Normal"], ["far", "Far"]]} onChange={(v) => onChange({ camDist: v })} />
          </div>
          {slider("camSens", "Follow sensitivity")}
        </div>
        <div className="ar-settings__col">
          <h4>Display</h4>
          <div className="ar-set">
            <span>Graphics</span>
            <Seg value={settings.graphics} options={[["low", "Low"], ["medium", "Medium"], ["high", "High"]]} onChange={(v) => onChange({ graphics: v })} />
          </div>
          <div className="ar-set">
            <span>Reduced effects</span>
            <Seg value={settings.reducedFx} options={[[false, "Off"], [true, "On"]]} onChange={(v) => onChange({ reducedFx: v })} />
          </div>
          <div className="ar-set">
            <span>Control hints</span>
            <Seg value={settings.hints} options={[[true, "On"], [false, "Off"]]} onChange={(v) => onChange({ hints: v })} />
          </div>
          <div className="ar-set">
            <span>Units</span>
            <Seg value={settings.units} options={[["kmh", "km/h"], ["mph", "mph"]]} onChange={(v) => onChange({ units: v })} />
          </div>
        </div>
      </div>
      <div className="ar-settings__danger">
        {!confirm ? (
          <button type="button" className="ar-btn ar-btn--ghost" onClick={() => setConfirm(true)}>
            Reset progress…
          </button>
        ) : (
          <div className="ar-row">
            <span className="ar-note">Erase all medals, times, unlocks and statistics?</span>
            <button
              type="button"
              className="ar-btn ar-btn--danger"
              onClick={() => {
                onReset();
                setConfirm(false);
              }}
            >
              ERASE
            </button>
            <button type="button" className="ar-btn" onClick={() => setConfirm(false)}>
              CANCEL
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ControlsList({ touch }) {
  const rows = [
    ["W / ↑", "Tuck — less air drag, more speed"],
    ["Shift", "Aggressive race tuck (fastest, hardest to turn)"],
    ["S / ↓", "Snowplough brake"],
    ["A / D · ← →", "Carve left / right"],
    ["Q / E", "Sharper carve left / right (costs speed)"],
    ["Space", "Jump (on the snow only)"],
    ["C", "Camera distance"],
    ["R", "Respawn at the last checkpoint"],
    ["Esc / P", "Pause"],
  ];
  return (
    <div className="ar-controls">
      <h3>Controls</h3>
      <div className="ar-controls__grid">
        {rows.map(([k, v]) => (
          <div key={k} className="ar-controls__row">
            <kbd>{k}</kbd>
            <span>{v}</span>
          </div>
        ))}
      </div>
      {touch && <p className="ar-note">Touch: ◀ ▶ carve and ◀◀ ▶▶ hard carve on the left; TUCK, RACE, BRAKE and JUMP on the right.</p>}
    </div>
  );
}

export function HowToPlay({ touch, onBack }) {
  return (
    <div className="ar-panel ar-howto">
      <div className="ar-panel__head">
        <Back onBack={onBack} />
        <h2>How to Play</h2>
      </div>
      <div className="ar-howto__body">
        <ControlsList touch={touch} />
        <div className="ar-tips">
          <div>
            <b>Gravity is your engine</b> Steep pitches build speed on their own; flats and climbs bleed it. Tuck on the straights — release before the turns.
          </div>
          <div>
            <b>Carving</b> The faster you go, the wider you turn. Q / E carve harder but scrub speed — and at top speed a hard carve can catch an edge.
          </div>
          <div>
            <b>Gates</b> Ski between the two poles of every gate, in order. A missed gate is +{MISS_PENALTY.time} s (Slalom +{MISS_PENALTY.slalom} s). Miss more than a third of them and you're disqualified.
          </div>
          <div>
            <b>Snow</b> Packed snow is fast, powder is slow and grippy, ice is fast but slides and barely brakes, moguls shake you. Brake <i>before</i> the ice.
          </div>
          <div>
            <b>Jumps</b> Kickers and rollers launch you. Keep your skis pointing where you fly — landing sideways is a fall. Space hops on any snow.
          </div>
          <div>
            <b>Medals</b> Time Trial and Slalom: beat the gold / silver / bronze times. Rival Race: finish top three. Any medal unlocks the next race; your best is always kept.
          </div>
        </div>
      </div>
    </div>
  );
}
