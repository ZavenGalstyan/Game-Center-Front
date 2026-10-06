/**
 * Rooftop Dash — menu screens. They sit over the live 3D rooftop scene
 * (MenuStage keeps one canvas mounted across all of them), so every screen is
 * a compact overlay panel — never a page. No internal scrolling: sizes use
 * container units of the GamePlayer stage.
 */
import { useMemo, useState } from "react";
import { WORLDS } from "../data/worlds.js";
import { LEVELS } from "../data/levels/index.js";
import { OUTFITS } from "../three/runner.js";
import { TRAILS } from "../three/effects.js";
import { formatTime } from "../three/gameRenderer.js";
import { isUnlocked, starCount, totalStars, completedCount, LEVEL_COUNT } from "../utils/storage.js";
import { sound } from "../audio/sound.js";
import { IconStar, IconLock, IconPlay, IconBack, IconGear, IconChart, IconRunner, IconMap, IconTimer, IconCheck, IconFlag } from "./icons.jsx";

const click = () => sound.uiClick();
const hover = () => sound.uiHover();

export function Btn({ children, kind = "", onClick, disabled, title, className = "" }) {
  return (
    <button
      type="button"
      className={`rd-btn ${kind ? `rd-btn--${kind}` : ""} ${className}`}
      onClick={(e) => {
        if (disabled) return;
        click();
        onClick && onClick(e);
      }}
      onMouseEnter={hover}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

function Stars({ n, of = 3, size = "" }) {
  return (
    <span className={`rd-stars ${size}`}>
      {Array.from({ length: of }, (_, i) => (
        <IconStar key={i} filled={i < n} className={i < n ? "on" : "off"} />
      ))}
    </span>
  );
}

function Header({ title, onBack, right }) {
  return (
    <div className="rd-head">
      <Btn kind="icon" onClick={onBack} title="Back">
        <IconBack />
      </Btn>
      <div className="rd-head__title">{title}</div>
      <div className="rd-head__right">{right}</div>
    </div>
  );
}

const bestWorldOf = (p) => {
  let w = 1;
  for (const L of LEVELS) if (p.completed[L.id]) w = Math.max(w, L.world);
  return WORLDS.find((x) => x.id === w) || WORLDS[0];
};

/* ======================================================================== main menu */
export function MainMenu({ progress, onPlay, onNav }) {
  const stars = totalStars(progress);
  const done = completedCount(progress);
  const started = done > 0;
  const bw = bestWorldOf(progress);
  return (
    <div className="rd-menu">
      <div className="rd-menu__brand">
        <div className="rd-logo">
          <span className="rd-logo__a">ROOFTOP</span>
          <span className="rd-logo__b">DASH</span>
        </div>
        <div className="rd-tagline">RUN • JUMP • OWN THE ROOFTOPS</div>
      </div>
      <div className="rd-menu__actions">
        <Btn kind="primary" className="rd-btn--xl" onClick={onPlay}>
          <IconPlay />
          {started ? "Continue" : "Play"}
          {started && <span className="rd-btn__sub">Level {progress.lastLevel}</span>}
        </Btn>
        <div className="rd-menu__grid">
          <Btn onClick={() => onNav("levels")}>
            <IconMap />
            Levels
          </Btn>
          <Btn onClick={() => onNav("runner")}>
            <IconRunner />
            Runner
          </Btn>
          <Btn onClick={() => onNav("stats")}>
            <IconChart />
            Statistics
          </Btn>
          <Btn onClick={() => onNav("settings")}>
            <IconGear />
            Settings
          </Btn>
        </div>
      </div>
      <div className="rd-menu__progress">
        <div className="rd-chip">
          <IconStar /> <b>{stars}</b>
          <span>/ {LEVEL_COUNT * 3}</span>
        </div>
        <div className="rd-chip">
          <IconFlag /> <b>{done}</b>
          <span>/ {LEVEL_COUNT} levels</span>
        </div>
        <div className="rd-chip rd-chip--world" style={{ "--wc": bw.accent }}>
          <span className="rd-dot" />
          {bw.name}
        </div>
      </div>
    </div>
  );
}

/* ======================================================================== level select */
// node positions (percent of the map box) — a path climbing across the district skyline
const NODE_POS = [
  [7, 78],
  [17, 60],
  [27, 74],
  [37, 52],
  [47, 66],
  [56, 42],
  [65, 58],
  [74, 34],
  [83, 50],
  [92, 26],
];

function skylineRects(seed) {
  let s = seed * 9301 + 49297;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const out = [];
  let x = 0;
  while (x < 100) {
    const w = 3 + r() * 6;
    const h = 18 + r() * 52 + (x / 100) * 22;
    out.push([x, 100 - h, w, h, r()]);
    x += w + r() * 1.2;
  }
  return out;
}

export function LevelSelect({ progress, onPlay, onBack, initialWorld }) {
  const [world, setWorld] = useState(initialWorld || (LEVELS.find((l) => l.id === progress.lastLevel)?.world ?? 1));
  const W = WORLDS.find((w) => w.id === world) || WORLDS[0];
  const ids = Array.from({ length: 10 }, (_, i) => (world - 1) * 10 + i + 1);
  const firstOpen = ids.find((id) => isUnlocked(progress, id) && !progress.completed[id]) || ids[0];
  const [sel, setSel] = useState(progress.lastLevel && ids.includes(progress.lastLevel) ? progress.lastLevel : firstOpen);
  const selId = ids.includes(sel) ? sel : ids[0];
  const L = LEVELS.find((l) => l.id === selId);
  const unlocked = isUnlocked(progress, selId) && !!L;
  const worldOpen = isUnlocked(progress, ids[0]);
  const rects = useMemo(() => skylineRects(world), [world]);
  const worldStars = ids.reduce((n, id) => n + starCount(progress, id), 0);

  return (
    <div className="rd-panel rd-levels" style={{ "--wc": W.accent, "--sky1": W.sky.top, "--sky2": W.sky.horizon }}>
      <Header
        title="Levels"
        onBack={onBack}
        right={
          <div className="rd-chip">
            <IconStar /> <b>{totalStars(progress)}</b>
            <span>/ 150</span>
          </div>
        }
      />
      <div className="rd-tabs">
        {WORLDS.map((w) => {
          const open = isUnlocked(progress, (w.id - 1) * 10 + 1);
          return (
            <button
              type="button"
              key={w.id}
              className={`rd-tab ${w.id === world ? "is-on" : ""} ${open ? "" : "is-locked"}`}
              style={{ "--wc": w.accent }}
              onMouseEnter={hover}
              onClick={() => {
                click();
                setWorld(w.id);
                const first = (w.id - 1) * 10 + 1;
                setSel(Array.from({ length: 10 }, (_, i) => first + i).find((id) => isUnlocked(progress, id) && !progress.completed[id]) || first);
              }}
            >
              <span className="rd-tab__n">{w.id}</span>
              <span className="rd-tab__name">{w.name}</span>
              {!open && <IconLock className="rd-tab__lock" />}
            </button>
          );
        })}
      </div>
      <div className="rd-levels__body">
        <div className={`rd-map ${worldOpen ? "" : "is-locked"}`}>
          <svg className="rd-map__sky" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <defs>
              <linearGradient id={`rdsky${world}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={W.sky.top} />
                <stop offset="0.75" stopColor={W.sky.horizon} />
              </linearGradient>
            </defs>
            <rect width="100" height="100" fill={`url(#rdsky${world})`} />
            {rects.map(([x, y, w, h, k], i) => (
              <rect key={i} x={x} y={y} width={w} height={h} fill={k < 0.5 ? "rgba(12,16,32,0.55)" : "rgba(12,16,32,0.72)"} />
            ))}
            <polyline points={NODE_POS.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.6" strokeDasharray="1.2 1.2" vectorEffect="non-scaling-stroke" />
          </svg>
          {ids.map((id, i) => {
            const exists = LEVELS.some((l) => l.id === id);
            const open = exists && isUnlocked(progress, id);
            const n = starCount(progress, id);
            const best = progress.best[id];
            return (
              <button
                type="button"
                key={id}
                className={`rd-node ${id === selId ? "is-sel" : ""} ${open ? "" : "is-locked"} ${progress.completed[id] ? "is-done" : ""}`}
                style={{ left: `${NODE_POS[i][0]}%`, top: `${NODE_POS[i][1]}%` }}
                onMouseEnter={hover}
                onClick={() => {
                  click();
                  setSel(id);
                }}
                onDoubleClick={() => open && onPlay(id)}
                aria-label={`Level ${id}${open ? "" : " (locked)"}`}
              >
                <span className="rd-node__n">{open ? id : <IconLock />}</span>
                {open && <Stars n={n} size="rd-stars--xs" />}
                {open && best > 0 && <span className="rd-node__t">{formatTime(best)}</span>}
              </button>
            );
          })}
          {!worldOpen && (
            <div className="rd-map__lock">
              <IconLock />
              <div>Clear level {ids[0] - 1} to open {W.name}</div>
            </div>
          )}
        </div>
        <div className="rd-detail">
          <div className="rd-detail__world" style={{ color: W.accent }}>
            {W.name}
          </div>
          <div className="rd-detail__num">LEVEL {selId}</div>
          <div className="rd-detail__name">{L ? L.name : "Under construction"}</div>
          <div className="rd-detail__rows">
            <div>
              <IconTimer />
              <span>Best</span>
              <b>{progress.best[selId] > 0 ? formatTime(progress.best[selId]) : "—"}</b>
            </div>
            <div>
              <IconFlag />
              <span>Target</span>
              <b>{L ? formatTime(L.targetTime) : "—"}</b>
              {progress.target[selId] && <IconCheck className="rd-ok" />}
            </div>
            <div>
              <IconStar />
              <span>Stars</span>
              <Stars n={starCount(progress, selId)} />
            </div>
          </div>
          <div className="rd-detail__blurb">{W.blurb}</div>
          <Btn kind="primary" className="rd-btn--wide" disabled={!unlocked} onClick={() => onPlay(selId)}>
            {unlocked ? (
              <>
                <IconPlay /> Play
              </>
            ) : (
              <>
                <IconLock /> {L ? `Clear level ${selId - 1}` : "Coming soon"}
              </>
            )}
          </Btn>
          <div className="rd-detail__foot">
            District stars <b>{worldStars}</b> / 30
          </div>
        </div>
      </div>
    </div>
  );
}

/* ======================================================================== runner (cosmetics) */
export function RunnerScreen({ progress, onSelect, onBack }) {
  const stars = totalStars(progress);
  const sel = progress.cosmetics;
  return (
    <div className="rd-panel rd-runner">
      <Header
        title="Runner"
        onBack={onBack}
        right={
          <div className="rd-chip">
            <IconStar /> <b>{stars}</b>
          </div>
        }
      />
      <div className="rd-runner__body">
        <div className="rd-runner__col">
          <div className="rd-sub">Outfits</div>
          <div className="rd-swatches">
            {OUTFITS.map((o) => {
              const open = stars >= o.stars;
              return (
                <button
                  type="button"
                  key={o.id}
                  className={`rd-swatch ${sel.outfit === o.id ? "is-on" : ""} ${open ? "" : "is-locked"}`}
                  onMouseEnter={hover}
                  onClick={() => {
                    if (!open) return sound.denied();
                    click();
                    onSelect({ outfit: o.id });
                  }}
                >
                  <span className="rd-swatch__chip" style={{ background: `linear-gradient(135deg, ${o.hoodie} 0 55%, ${o.pants} 55% 80%, ${o.sole} 80%)` }} />
                  <span className="rd-swatch__name">{o.name}</span>
                  <span className="rd-swatch__req">
                    {open ? (
                      sel.outfit === o.id ? (
                        <IconCheck />
                      ) : null
                    ) : (
                      <>
                        <IconLock /> {o.stars}
                        <IconStar />
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="rd-runner__col rd-runner__col--narrow">
          <div className="rd-sub">Dash trail</div>
          <div className="rd-swatches rd-swatches--one">
            {TRAILS.map((t) => {
              const open = stars >= t.stars;
              return (
                <button
                  type="button"
                  key={t.id}
                  className={`rd-swatch ${sel.trail === t.id ? "is-on" : ""} ${open ? "" : "is-locked"}`}
                  onMouseEnter={hover}
                  onClick={() => {
                    if (!open) return sound.denied();
                    click();
                    onSelect({ trail: t.id });
                  }}
                >
                  <span className="rd-swatch__chip rd-swatch__chip--trail" style={{ background: `linear-gradient(90deg, transparent, ${t.color2}, ${t.color})` }} />
                  <span className="rd-swatch__name">{t.name}</span>
                  <span className="rd-swatch__req">
                    {open ? (
                      sel.trail === t.id ? (
                        <IconCheck />
                      ) : null
                    ) : (
                      <>
                        <IconLock /> {t.stars}
                        <IconStar />
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="rd-note">Cosmetic only — unlocked by collecting stars.</div>
        </div>
      </div>
    </div>
  );
}

/* ======================================================================== statistics */
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);
const fmtPlay = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${Math.floor(s % 60)}s`;
};
export function StatsScreen({ progress, onBack }) {
  const st = progress.stats;
  const tiles = [
    ["Levels completed", `${completedCount(progress)} / ${LEVEL_COUNT}`],
    ["Total stars", `${totalStars(progress)} / 150`],
    ["Perfect levels", st.perfectLevels],
    ["Total runs", st.runs],
    ["Falls", st.falls],
    ["Jumps", st.jumps],
    ["Vaults", st.vaults],
    ["Slides", st.slides],
    ["Wall runs", st.wallRuns],
    ["Wall jumps", st.wallJumps],
    ["Dashes", st.dashes],
    ["Ledge climbs", st.ledges],
    ["Checkpoints", st.checkpoints],
    ["Distance run", fmtDist(st.distance)],
    ["Longest flow", st.longestFlow ? `x${st.longestFlow}` : "—"],
    ["Fastest level", progress.fastest ? `L${progress.fastest.id} · ${formatTime(progress.fastest.time)}` : "—"],
    ["Play time", fmtPlay(st.playTime)],
  ];
  return (
    <div className="rd-panel rd-stats">
      <Header title="Statistics" onBack={onBack} />
      <div className="rd-stats__body">
        <div className="rd-tiles">
          {tiles.map(([k, v]) => (
            <div className="rd-tile" key={k}>
              <div className="rd-tile__v">{v}</div>
              <div className="rd-tile__k">{k}</div>
            </div>
          ))}
        </div>
        <div className="rd-bests">
          <div className="rd-sub">Best times</div>
          {WORLDS.map((w) => (
            <div className="rd-bests__row" key={w.id}>
              <span className="rd-bests__w" style={{ color: w.accent }}>
                {w.id}
              </span>
              {Array.from({ length: 10 }, (_, i) => {
                const id = (w.id - 1) * 10 + i + 1;
                const b = progress.best[id];
                return (
                  <span key={id} className={`rd-bests__c ${b > 0 ? "has" : ""}`} title={`Level ${id}`}>
                    {b > 0 ? formatTime(b).replace(/^0:/, "") : "·"}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ======================================================================== settings */
function Seg({ value, options, onChange }) {
  return (
    <div className="rd-seg">
      {options.map(([v, label]) => (
        <button
          type="button"
          key={v}
          className={value === v ? "is-on" : ""}
          onMouseEnter={hover}
          onClick={() => {
            click();
            onChange(v);
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
function Toggle({ value, onChange }) {
  return (
    <button
      type="button"
      className={`rd-toggle ${value ? "is-on" : ""}`}
      role="switch"
      aria-checked={value}
      onClick={() => {
        click();
        onChange(!value);
      }}
    >
      <span />
    </button>
  );
}
function Slider({ value, min = 0, max = 1, step = 0.01, onChange, fmt = (v) => `${Math.round(v * 100)}` }) {
  return (
    <div className="rd-slider">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span>{fmt(value)}</span>
    </div>
  );
}

export function SettingsPanel({ settings, muted, onChange, onBack, inGame = false }) {
  const S = settings;
  const row = (label, ctl, hint) => (
    <div className="rd-set">
      <div className="rd-set__l">
        {label}
        {hint && <small>{hint}</small>}
      </div>
      <div className="rd-set__c">{ctl}</div>
    </div>
  );
  return (
    <div className={`rd-panel rd-settings ${inGame ? "rd-panel--ingame" : ""}`}>
      <Header title="Settings" onBack={onBack} right={muted ? <div className="rd-chip rd-chip--warn">Muted by Game Center</div> : null} />
      <div className="rd-settings__body">
        <div className="rd-settings__col">
          <div className="rd-sub">Sound</div>
          {row("Master", <Slider value={S.master} onChange={(v) => onChange({ master: v })} />)}
          {row("Music", <Slider value={S.music} onChange={(v) => onChange({ music: v })} />)}
          {row("Effects", <Slider value={S.sfx} onChange={(v) => onChange({ sfx: v })} />)}
          <div className="rd-sub">Graphics</div>
          {row("Quality", <Seg value={S.graphics} options={[["low", "Low"], ["medium", "Medium"], ["high", "High"]]} onChange={(v) => onChange({ graphics: v })} />, inGame ? "applies instantly" : null)}
          {row("Field of view", <Slider value={S.fov} min={62} max={86} step={1} fmt={(v) => `${Math.round(v)}°`} onChange={(v) => onChange({ fov: v })} />)}
        </div>
        <div className="rd-settings__col">
          <div className="rd-sub">Camera & comfort</div>
          {row("Sensitivity", <Slider value={S.sensitivity} min={0.2} max={3} step={0.05} fmt={(v) => `${v.toFixed(2)}×`} onChange={(v) => onChange({ sensitivity: v })} />)}
          {row("Invert Y", <Toggle value={S.invertY} onChange={(v) => onChange({ invertY: v })} />)}
          {row("Camera shake", <Seg value={S.cameraShake} options={[["off", "Off"], ["low", "Low"], ["normal", "Normal"]]} onChange={(v) => onChange({ cameraShake: v })} />)}
          {row("Motion effects", <Toggle value={S.motion} onChange={(v) => onChange({ motion: v })} />, "FOV, speed lines, trail")}
          {row("Reduced motion", <Toggle value={S.reducedMotion} onChange={(v) => onChange({ reducedMotion: v })} />)}
          {row("Control help", <Toggle value={S.controlHelp} onChange={(v) => onChange({ controlHelp: v })} />)}
          {row("Parkour assist", <Toggle value={S.assist} onChange={(v) => onChange({ assist: v })} />, inGame ? "applies when the level restarts" : "more forgiving timing")}
        </div>
      </div>
    </div>
  );
}

/* ======================================================================== controls help */
export function ControlsHelp({ onBack, touch }) {
  const rows = touch
    ? [
        ["Left stick", "Move — push fully to sprint"],
        ["Drag right side", "Camera"],
        ["JUMP", "Jump · hold for higher · on a wall: wall jump"],
        ["DASH", "Short burst — once per jump"],
        ["SLIDE", "Slide under low pipes while running"],
        ["Automatic", "Vault low obstacles · wall run painted walls · grab ledges"],
      ]
    : [
        ["W A S D", "Move (camera-relative)"],
        ["Mouse", "Camera"],
        ["Shift", "Sprint"],
        ["Space", "Jump · hold for higher · on a wall: wall jump"],
        ["E", "Dash — once per jump, refreshed on landing"],
        ["C / Ctrl", "Slide while running"],
        ["Esc / P", "Pause"],
        ["Automatic", "Vault low obstacles · wall run painted walls · grab ledges"],
      ];
  return (
    <div className="rd-panel rd-controls">
      <Header title="Controls" onBack={onBack} />
      <div className="rd-controls__list">
        {rows.map(([k, v]) => (
          <div className="rd-controls__row" key={k}>
            <kbd>{k}</kbd>
            <span>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export { Stars };
