/**
 * Island Conquest — menu screens drawn over the live 3D archipelago:
 * Main Menu, the sea-chart campaign map, the Islands codex, Statistics and
 * Settings. Plain DOM + inline SVG; everything fits the GamePlayer stage
 * without internal page scrolling (long lists scroll inside their panel).
 */
import { useMemo } from "react";
import { LEVELS } from "../data/levels.js";
import { REGIONS, regionOf } from "../data/regions.js";
import { ISLAND_TYPES, FACTION_INFO } from "../engine/constants.js";
import { isUnlocked, totalStars, regionStars, nextLevelId, STAT_KEYS } from "../utils/storage.js";
import { Icon, Stars, Toggle, Segmented, fmtTime } from "./ui.jsx";

/* ================================================================ main menu */
export function MainMenu({ progress, onPlay, onLevels, onIslands, onStats, onSettings }) {
  const next = nextLevelId(progress);
  const L = LEVELS.find((l) => l.id === next) || LEVELS[0];
  return (
    <div className="ic-menu">
      <div className="ic-menu__brand">
        <h1 className="ic-title">
          <span>ISLAND</span>
          <span>CONQUEST</span>
        </h1>
        <p className="ic-tagline">GROW • ATTACK • CONQUER</p>
        <nav className="ic-menu__nav" aria-label="Main menu">
          <button type="button" className="ic-btn ic-btn--primary ic-btn--big" onClick={onPlay}>
            <Icon name="play" size={20} />
            <span className="ic-btn__stack">
              PLAY
              <small>
                Level {L.id} · {L.name}
              </small>
            </span>
          </button>
          <button type="button" className="ic-btn" onClick={onLevels} aria-label="Levels">
            <Icon name="map" size={18} />
            <span className="ic-btn__lbl">LEVELS</span>
          </button>
          <button type="button" className="ic-btn" onClick={onIslands} aria-label="Islands">
            <Icon name="island" size={18} />
            <span className="ic-btn__lbl">ISLANDS</span>
          </button>
          <button type="button" className="ic-btn" onClick={onStats} aria-label="Statistics">
            <Icon name="chart" size={18} />
            <span className="ic-btn__lbl">STATISTICS</span>
          </button>
          <button type="button" className="ic-btn" onClick={onSettings} aria-label="Settings">
            <Icon name="gear" size={18} />
            <span className="ic-btn__lbl">SETTINGS</span>
          </button>
        </nav>
      </div>
      <div className="ic-menu__badge" aria-label="Campaign progress">
        <Icon name="star" size={18} />
        <strong>{totalStars(progress)}</strong>
        <span>/ {LEVELS.length * 3}</span>
      </div>
    </div>
  );
}

/* ================================================================ campaign map */
// ten anchorages per region, wandering left → right across the chart
const NODES = [
  [90, 395],
  [190, 300],
  [305, 355],
  [395, 235],
  [505, 300],
  [595, 180],
  [705, 245],
  [790, 360],
  [880, 265],
  [925, 140],
];
function routePath(pts) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2;
    d += ` Q${mx + (i % 2 ? -30 : 30)},${(y0 + y1) / 2 + (i % 2 ? 40 : -40)} ${x1},${y1}`;
  }
  return d;
}
function blob(cx, cy, r, seed) {
  let d = "";
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + 0.12 * Math.sin(a * 2 + seed) + 0.07 * Math.sin(a * 3 + seed * 2);
    const x = cx + Math.cos(a) * r * k;
    const y = cy + Math.sin(a) * r * k * 0.82;
    d += i ? ` L${x.toFixed(1)},${y.toFixed(1)}` : `M${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return d + "Z";
}

const AI_NAME = { easy: "Cautious", normal: "Seasoned", hard: "Ruthless" };
function aiLabel(L) {
  const lv = L.ai.red || L.ai.purple ? [L.ai.red, L.ai.purple].filter(Boolean).map((a) => a.level) : [L.ai.level];
  return lv.map((x) => AI_NAME[x] || x).join(" + ");
}

export function LevelsScreen({ progress, region, selected, onRegion, onSelect, onPlay, onBack }) {
  const R = regionOf(region);
  const levels = LEVELS.filter((l) => l.region === region);
  const sel = levels.find((l) => l.id === selected) || null;
  const current = nextLevelId(progress);
  const path = useMemo(() => routePath(NODES), []);
  const firstLocked = levels.findIndex((l) => !isUnlocked(progress, l.id));
  const regionOpen = (r) => LEVELS.some((l) => l.region === r && isUnlocked(progress, l.id));
  return (
    <div className="ic-screen ic-levels" style={{ "--ic-region": R.accent }}>
      <header className="ic-head">
        <button type="button" className="ic-iconbtn" onClick={onBack} aria-label="Back">
          <Icon name="back" />
        </button>
        <h2 className="ic-h2">CAMPAIGN</h2>
        <span className="ic-head__stars">
          <Icon name="star" size={16} />
          {totalStars(progress)} / {LEVELS.length * 3}
        </span>
      </header>
      <div className="ic-tabs" role="tablist" aria-label="Regions">
        {REGIONS.map((r) => {
          const open = regionOpen(r.id);
          return (
            <button key={r.id} type="button" role="tab" aria-selected={r.id === region} className={`ic-tab${r.id === region ? " is-on" : ""}${open ? "" : " is-locked"}`} style={{ "--ic-tab": r.accent }} onClick={() => onRegion(r.id)}>
              <span className="ic-tab__name">{r.name}</span>
              <span className="ic-tab__stars">
                {open ? (
                  <>
                    <Icon name="star" size={12} />
                    {regionStars(progress, r.id)}/30
                  </>
                ) : (
                  <Icon name="lock" size={12} />
                )}
              </span>
            </button>
          );
        })}
      </div>
      <div className="ic-levels__body">
        <div className="ic-chart">
          <svg viewBox="0 0 1000 520" preserveAspectRatio="xMidYMid meet" className="ic-chart__svg" role="group" aria-label={`${R.name} levels`}>
            <defs>
              <pattern id="ic-wave" width="60" height="26" patternUnits="userSpaceOnUse">
                <path d="M4 14q8-7 16 0t16 0" fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth="2" strokeLinecap="round" />
              </pattern>
              <radialGradient id="ic-sea" cx="50%" cy="45%" r="70%">
                <stop offset="0" stopColor="rgba(60,170,210,0.28)" />
                <stop offset="1" stopColor="rgba(8,30,60,0.0)" />
              </radialGradient>
            </defs>
            <rect x="0" y="0" width="1000" height="520" fill="url(#ic-sea)" />
            <rect x="0" y="0" width="1000" height="520" fill="url(#ic-wave)" />
            {/* compass rose */}
            <g transform="translate(905 445)" opacity="0.55">
              <circle r="34" fill="none" stroke="#f3e6c4" strokeWidth="2" />
              <path d="M0 -44 L7 0 L0 44 L-7 0Z" fill="#f3e6c4" />
              <path d="M-44 0 L0 -7 L44 0 L0 7Z" fill="#f3e6c4" opacity="0.6" />
              <text y="-50" textAnchor="middle" fontSize="16" fill="#f3e6c4" fontWeight="800">
                N
              </text>
            </g>
            <path d={path} fill="none" stroke="rgba(255,248,225,0.55)" strokeWidth="4" strokeDasharray="2 14" strokeLinecap="round" />
            {levels.map((l, i) => {
              const [x, y] = NODES[i];
              const open = isUnlocked(progress, l.id);
              const stars = progress.levelStars[l.id] || 0;
              const on = sel && sel.id === l.id;
              const big = i === 9;
              return (
                <g
                  key={l.id}
                  className={`ic-node${open ? "" : " is-locked"}${on ? " is-sel" : ""}${l.id === current ? " is-current" : ""}`}
                  transform={`translate(${x} ${y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Level ${l.id}, ${l.name}${open ? `, ${stars} stars` : ", locked"}`}
                  onClick={() => onSelect(l.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(l.id);
                    }
                  }}
                >
                  <circle r={big ? 58 : 48} fill="transparent" />
                  <path d={blob(0, 6, big ? 46 : 38, l.id)} fill="rgba(240,226,180,0.9)" />
                  <path d={blob(0, 2, big ? 38 : 31, l.id + 3)} fill={open ? R.accent : "#6e7f8c"} className="ic-node__land" />
                  <path d={blob(-6, -2, big ? 18 : 14, l.id + 5)} fill="rgba(255,255,255,0.18)" />
                  {open ? (
                    <text y="11" textAnchor="middle" className="ic-node__num">
                      {l.id}
                    </text>
                  ) : (
                    <g transform="translate(-11 -12)">
                      <rect x="3" y="10" width="16" height="12" rx="3" fill="#fff" opacity="0.85" />
                      <path d="M6 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="#fff" strokeWidth="3" opacity="0.85" />
                    </g>
                  )}
                  {open && (
                    <g transform={`translate(0 ${big ? 60 : 52})`}>
                      {[0, 1, 2].map((s) => (
                        <path key={s} transform={`translate(${(s - 1) * 22 - 10} -10) scale(0.85)`} d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z" fill={s < stars ? "#ffd25c" : "rgba(255,255,255,0.25)"} />
                      ))}
                    </g>
                  )}
                  {l.id === current && open && (
                    <g className="ic-node__boat" transform="translate(40 -40)">
                      <path d="M-18 6h36l-7 10h-22z" fill="#7a4a2a" />
                      <path d="M0 -24v30M0 -22l15 18H0z" fill="#fff" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
                      <path d="M0 -24l-10 4 10 3z" fill={FACTION_INFO.player.color} />
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
          {firstLocked === 0 && <div className="ic-chart__locked">Win the last level of the previous region to sail here.</div>}
        </div>
        <aside className="ic-detail" aria-live="polite">
          {sel ? (
            <>
              <small className="ic-detail__kicker">
                {R.name.toUpperCase()} · LEVEL {sel.id}
              </small>
              <h3 className="ic-detail__name">{sel.name}</h3>
              <ul className="ic-detail__facts">
                <li>
                  <Icon name="island" size={16} />
                  {sel.islands.length} islands
                </li>
                <li>
                  <Icon name="flag" size={16} />
                  {aiLabel(sel)} commander{sel.ai.red && sel.ai.purple ? "s" : ""}
                </li>
                <li>
                  <Icon name="clock" size={16} />
                  3★ under {fmtTime(sel.stars[1])} · 2★ under {fmtTime(sel.stars[0])}
                </li>
              </ul>
              {isUnlocked(progress, sel.id) ? (
                <>
                  <div className="ic-detail__best">
                    Best <Stars n={progress.levelStars[sel.id] || 0} size={18} />
                  </div>
                  <button type="button" className="ic-btn ic-btn--primary ic-btn--big" onClick={() => onPlay(sel.id)}>
                    <Icon name="play" size={18} />
                    SET SAIL
                  </button>
                </>
              ) : (
                <p className="ic-detail__lock">
                  <Icon name="lock" size={16} />
                  Win level {sel.id - 1} to unlock
                </p>
              )}
            </>
          ) : (
            <>
              <small className="ic-detail__kicker">{R.name.toUpperCase()}</small>
              <h3 className="ic-detail__name">{R.name}</h3>
              <p className="ic-detail__blurb">{R.blurb}</p>
              <p className="ic-detail__tip">Choose an island on the chart.</p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ================================================================ islands codex */
export const CODEX = [
  { type: "small", text: "A modest outpost. Cheap to take, slow to grow." },
  { type: "medium", text: "A village island — the backbone of every empire." },
  { type: "large", text: "A walled town on high cliffs. Strong steady production." },
  { type: "farm", text: "Rich farmland feeds a bigger army: the fastest production in the archipelago." },
  { type: "fort", text: "Stone walls make every defender count as 1.5 attackers. Produces slowly." },
  { type: "port", text: "Fleets launched from a Port sail 40% faster — perfect for quick strikes and rescues." },
  { type: "capital", text: "A royal stronghold: high production, a large garrison and walls (defenders ×1.25)." },
];
export const firstLevelWith = (type) => LEVELS.find((l) => l.islands.some((i) => i.type === type))?.id ?? 1;

export function IslandsScreen({ progress, type, onType, onBack }) {
  const info = CODEX.find((c) => c.type === type) || CODEX[0];
  const T = ISLAND_TYPES[info.type];
  const unlocked = (t) => progress.unlockedLevel >= firstLevelWith(t);
  const open = unlocked(info.type);
  return (
    <div className="ic-screen ic-codex">
      <header className="ic-head">
        <button type="button" className="ic-iconbtn" onClick={onBack} aria-label="Back">
          <Icon name="back" />
        </button>
        <h2 className="ic-h2">ISLANDS</h2>
        <span />
      </header>
      <div className="ic-codex__body">
        <div className="ic-codex__stage" aria-hidden="true" />
        <aside className="ic-panel ic-codex__panel">
          <div className="ic-codex__list" role="tablist" aria-label="Island types">
            {CODEX.map((c) => {
              const u = unlocked(c.type);
              return (
                <button key={c.type} type="button" role="tab" aria-selected={c.type === info.type} className={`ic-codex__item${c.type === info.type ? " is-on" : ""}${u ? "" : " is-locked"}`} onClick={() => onType(c.type)}>
                  {u ? ISLAND_TYPES[c.type].name : "???"}
                  {!u && <Icon name="lock" size={12} />}
                </button>
              );
            })}
          </div>
          <h3 className="ic-detail__name">{open ? T.name : "Undiscovered"}</h3>
          {open ? (
            <>
              <p className="ic-detail__blurb">{info.text}</p>
              <dl className="ic-codex__stats">
                <div>
                  <dt>Production</dt>
                  <dd>1 troop / {(1 / T.rate).toFixed(2).replace(/0$/, "")} s</dd>
                </div>
                <div>
                  <dt>Garrison cap</dt>
                  <dd>{T.cap}</dd>
                </div>
                <div>
                  <dt>Defense</dt>
                  <dd>{T.defense > 1 ? `×${T.defense}` : "—"}</dd>
                </div>
                <div>
                  <dt>Fleet speed</dt>
                  <dd>{T.travel > 1 ? `+${Math.round((T.travel - 1) * 100)}%` : "—"}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="ic-detail__lock">
              <Icon name="lock" size={16} />
              First seen in level {firstLevelWith(info.type)}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ================================================================ statistics */
const STAT_LABEL = {
  levelsPlayed: "Levels played",
  levelsWon: "Levels won",
  levelsLost: "Levels lost",
  islandsCaptured: "Islands captured",
  islandsLost: "Islands lost",
  troopsGenerated: "Troops generated",
  troopsSent: "Troops sent",
  troopsLost: "Troops lost",
  enemyDefeated: "Enemy troops defeated",
  neutralCaptured: "Neutral islands taken",
  enemyCaptured: "Enemy islands taken",
  reinforcements: "Reinforcements sent",
  largestArmy: "Largest army sent",
  fastestVictory: "Fastest victory",
  perfectVictories: "Perfect victories",
  playTime: "Total play time",
};

export function StatsScreen({ progress, onBack }) {
  const s = progress.statistics;
  const val = (k) => (k === "fastestVictory" ? (s[k] ? fmtTime(s[k]) : "—") : k === "playTime" ? fmtTime(s[k]) : s[k].toLocaleString());
  return (
    <div className="ic-screen ic-stats">
      <header className="ic-head">
        <button type="button" className="ic-iconbtn" onClick={onBack} aria-label="Back">
          <Icon name="back" />
        </button>
        <h2 className="ic-h2">STATISTICS</h2>
        <span className="ic-head__stars">
          <Icon name="star" size={16} />
          {totalStars(progress)} stars
        </span>
      </header>
      <div className="ic-panel ic-stats__grid">
        {STAT_KEYS.map((k) => (
          <div key={k} className="ic-stat">
            <span className="ic-stat__v">{val(k)}</span>
            <span className="ic-stat__k">{STAT_LABEL[k]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================ settings */
export function SettingsScreen({ settings, onChange, onBack, inGame }) {
  const set = (k) => (v) => onChange({ ...settings, [k]: v });
  return (
    <div className={`ic-screen ic-settings${inGame ? " is-ingame" : ""}`}>
      <header className="ic-head">
        <button type="button" className="ic-iconbtn" onClick={onBack} aria-label="Back">
          <Icon name="back" />
        </button>
        <h2 className="ic-h2">SETTINGS</h2>
        <span />
      </header>
      <div className="ic-panel ic-settings__grid">
        <Toggle label="Sound" value={settings.sound} onChange={set("sound")} />
        <Toggle label="Music" value={settings.music} onChange={set("music")} />
        <Segmented
          label="Graphics"
          value={settings.graphics}
          options={[
            ["low", "Low"],
            ["medium", "Medium"],
            ["high", "High"],
          ]}
          onChange={set("graphics")}
        />
        <Segmented
          label="Water"
          value={settings.water}
          options={[
            ["low", "Low"],
            ["medium", "Medium"],
            ["high", "High"],
          ]}
          onChange={set("water")}
        />
        <Toggle label="Particles" value={settings.particles} onChange={set("particles")} />
        <Toggle label="Shadows" value={settings.shadows} onChange={set("shadows")} />
        <Toggle label="Camera motion" value={settings.cameraMotion} onChange={set("cameraMotion")} />
        <Toggle label="Reduced motion" hint="Calmer camera and effects" value={settings.reducedMotion} onChange={set("reducedMotion")} />
        <Segmented
          label="Default speed"
          value={settings.speed}
          options={[
            [1, "1×"],
            [2, "2×"],
          ]}
          onChange={set("speed")}
        />
      </div>
    </div>
  );
}
