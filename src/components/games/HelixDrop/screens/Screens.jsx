/** Helix Drop — menus and overlays (HTML over the live 3D tower). */
import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { LEVELS, levelsOfWorld } from "../data/levels.js";
import { WORLDS } from "../data/worlds.js";
import { SKINS, unlockText } from "../data/skins.js";
import { isUnlocked, levelsDone, totalStars, skinUnlocked } from "../utils/storage.js";
import { ballTexture } from "../three/textures.js";
import { frameloop, glTest } from "../three/testHooks.js";

/* ------------------------------------------------------------------ icons */
const P = {
  pause: (
    <>
      <rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
    </>
  ),
  play: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />,
  star: <path d="M12 2.6l2.8 6 6.5.7-4.9 4.4 1.4 6.5L12 16.9l-5.8 3.3 1.4-6.5-4.9-4.4 6.5-.7z" fill="currentColor" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.4" fill="currentColor" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
    </>
  ),
  back: <path d="M14.5 5.5L8 12l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />,
  right: <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />,
  retry: <path d="M19 12a7 7 0 1 1-2.05-4.95M19 4.5V9h-4.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />,
  tower: (
    <>
      <rect x="10.5" y="2" width="3" height="20" rx="1" fill="currentColor" />
      <path d="M4 7h7M13 7h7M4 12h3M17 12h3M4 17h9M15 17h5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
  down: <path d="M12 3v15M6 12l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />,
  ball: (
    <>
      <circle cx="12" cy="12" r="8.5" fill="currentColor" />
      <path d="M3.8 11.2c5 1.8 11.4 1.8 16.4 0" fill="none" stroke="rgba(0,0,0,.35)" strokeWidth="2" />
    </>
  ),
  chart: (
    <>
      <rect x="4" y="12" width="4" height="8" rx="1" fill="currentColor" />
      <rect x="10" y="7" width="4" height="13" rx="1" fill="currentColor" />
      <rect x="16" y="3.5" width="4" height="16.5" rx="1" fill="currentColor" />
    </>
  ),
  gear: <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm7.9 4.6l1.8 1.4-2 3.4-2.2-.8c-.6.5-1.2.8-1.9 1.1L15.2 21h-4l-.4-2.4c-.7-.3-1.3-.6-1.9-1.1l-2.2.8-2-3.4 1.8-1.4a7.5 7.5 0 0 1 0-2.2L4.7 9.9l2-3.4 2.2.8c.6-.5 1.2-.8 1.9-1.1L11.2 3h4l.4 2.4c.7.3 1.3.6 1.9 1.1l2.2-.8 2 3.4-1.8 1.4c.1.7.1 1.5 0 2.2z" fill="currentColor" transform="translate(-1.2 0)" />,
  flame: <path d="M12 2c1 4 5 5.5 5 11a5 5 0 0 1-10 0c0-2.5 1.2-4 2.4-5.2C9.5 10.5 11 11 11 11s-1-4 1-9z" fill="currentColor" />,
};
export function Icon({ name, className = "" }) {
  return (
    <svg className={`hd-icon ${className}`} viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false">
      {P[name]}
    </svg>
  );
}

/* ------------------------------------------------------------------ menu */
export function MainMenu({ progress, onPlay, onLevels, onEndless, onBalls, onStats, onSettings }) {
  return (
    <div className="hd-menu">
      <div className="hd-menu__head">
        <h1 className="hd-title">
          <span>HELIX</span>
          <span>DROP</span>
        </h1>
        <p className="hd-sub">ROTATE • DROP • SMASH</p>
      </div>
      <div className="hd-menu__actions">
        <button type="button" className="hd-btn hd-btn--primary hd-btn--play" onClick={onPlay}>
          <Icon name="play" /> PLAY
        </button>
        <div className="hd-menu__grid">
          <button type="button" className="hd-btn" onClick={onLevels}>
            <Icon name="tower" /> LEVELS
          </button>
          <button type="button" className="hd-btn" onClick={onEndless}>
            <Icon name="down" /> ENDLESS
          </button>
          <button type="button" className="hd-btn" onClick={onBalls}>
            <Icon name="ball" /> BALLS
          </button>
          <button type="button" className="hd-btn" onClick={onStats}>
            <Icon name="chart" /> STATISTICS
          </button>
          <button type="button" className="hd-btn hd-menu__wide" onClick={onSettings}>
            <Icon name="gear" /> SETTINGS
          </button>
        </div>
        <p className="hd-menu__meta">
          <span>
            <Icon name="tower" /> {levelsDone(progress)}/{LEVELS.length}
          </span>
          <span>
            <Icon name="star" /> {totalStars(progress)}/{LEVELS.length * 3}
          </span>
          {progress.stats.bestDepth > 0 && (
            <span>
              <Icon name="down" /> {progress.stats.bestDepth}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- level select */
export function LevelSelect({ progress, world, onWorld, onPick, onBack }) {
  const W = WORLDS[world - 1];
  const levels = levelsOfWorld(world);
  return (
    <div className="hd-levels" style={{ "--hd-w": W.accent }}>
      <div className="hd-levels__tower">
        <button type="button" className="hd-btn hd-btn--ghost hd-back" onClick={onBack}>
          <Icon name="back" /> BACK
        </button>
        {/* the worlds stack DOWN the tower, like the descent itself */}
        <div className="hd-bands" role="tablist" aria-label="Worlds">
          {WORLDS.map((w) => {
            const ls = levelsOfWorld(w.id);
            const open = ls.length > 0 && isUnlocked(progress, ls[0].id);
            const s = ls.reduce((a, L) => a + (progress.levels[L.id]?.stars || 0), 0);
            return (
              <button
                key={w.id}
                type="button"
                role="tab"
                aria-selected={w.id === world}
                className={`hd-band${w.id === world ? " is-on" : ""}${open ? "" : " is-locked"}`}
                style={{ "--c": w.accent, "--c2": w.sky[0] }}
                onClick={() => onWorld(w.id)}
              >
                <i>{w.id}</i>
                <span>{w.name}</span>
                <small>{open ? <><Icon name="star" /> {s}/{ls.length * 3}</> : <Icon name="lock" />}</small>
              </button>
            );
          })}
        </div>
      </div>
      <div className="hd-levels__main">
        <header className="hd-levels__head">
          <span>WORLD {W.id}</span>
          <h2>{W.name}</h2>
          <p>{W.blurb}</p>
        </header>
        <div className="hd-path">
          {levels.map((L, i) => {
            const open = isUnlocked(progress, L.id);
            const rec = progress.levels[L.id];
            // nodes spiral DOWN: left/right alternation like a helix seen from the side
            const x = 50 + Math.sin(i * 1.15) * 36;
            const y = 4 + i * 9.6;
            return (
              <button
                key={L.id}
                type="button"
                className={`hd-node${open ? "" : " is-locked"}${rec ? " is-done" : ""}${open && !rec ? " is-next" : ""}`}
                style={{ left: `${x}%`, top: `${y}%` }}
                onClick={() => open && onPick(L.id)}
                disabled={!open}
                aria-label={`Level ${L.id} ${L.name}${open ? "" : " locked"}`}
                title={L.name}
              >
                <span className="hd-node__disc">{open ? L.id : <Icon name="lock" />}</span>
                {rec && (
                  <span className="hd-node__stars">
                    {[0, 1, 2].map((k) => (
                      <Icon key={k} name="star" className={k < rec.stars ? "is-on" : ""} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
          {levels.length === 0 && <p className="hd-path__empty">COMING SOON</p>}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- balls */
function PreviewBall({ skin, x, y, selected, locked }) {
  const ref = useRef();
  const tex = useMemo(() => ballTexture(skin.base, skin.band, skin.dots), [skin]);
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const t = clock.elapsedTime;
    m.rotation.y = t * (selected ? 0.9 : 0.25) + x;
    m.rotation.x = 0.35;
    const b = selected ? Math.abs(Math.sin(t * 3.2)) * 0.28 : 0;
    m.position.set(x, y + b, 0);
    const sq = selected && b < 0.03 ? 0.9 : 1;
    m.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.42, 40, 28]} />
      <meshPhysicalMaterial map={tex} roughness={0.22} clearcoat={1} clearcoatRoughness={0.1} color={locked ? "#555a66" : "#ffffff"} />
    </mesh>
  );
}

export function Balls({ progress, onSelect, onBack }) {
  return (
    <div className="hd-screen">
      <div className="hd-panel hd-sheet">
        <header className="hd-sheet__head">
          <button type="button" className="hd-iconbtn" aria-label="Back" onClick={onBack}>
            <Icon name="back" />
          </button>
          <h2>BALLS</h2>
          <span className="hd-sheet__note">SAME PHYSICS · NEW LOOK</span>
        </header>
        <div className="hd-balls">
          {/* one shared WebGL canvas renders all eight real 3D balls */}
          <div className="hd-balls__canvas" aria-hidden="true">
            <Canvas frameloop={frameloop} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true, ...glTest }} orthographic camera={{ zoom: 1, position: [0, 0, 600], near: 1, far: 2000 }}>
              <BallGrid progress={progress} />
            </Canvas>
          </div>
          <div className="hd-balls__grid">
            {SKINS.map((s) => {
              const open = skinUnlocked(progress, s);
              const on = progress.selectedBall === s.id;
              return (
                <button key={s.id} type="button" className={`hd-ball${on ? " is-on" : ""}${open ? "" : " is-locked"}`} onClick={() => open && onSelect(s.id)} disabled={!open} aria-pressed={on}>
                  <strong>{s.name}</strong>
                  <small>{on ? "SELECTED" : open ? "SELECT" : unlockText(s.unlock)}</small>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function BallGrid({ progress }) {
  // fit an orthographic grid to the canvas: 4×2 (landscape) or 2×4 (portrait), matching the CSS grid
  const group = useRef();
  const { size } = useThree();
  const cols = size.width >= size.height ? 4 : 2;
  useFrame(({ camera, size }) => {
    camera.left = -size.width / 2;
    camera.right = size.width / 2;
    camera.top = size.height / 2;
    camera.bottom = -size.height / 2;
    const rowsN = Math.ceil(SKINS.length / cols);
    const cell = Math.min(size.width / cols, size.height / rowsN);
    group.current.scale.setScalar(cell * 0.75);
    camera.updateProjectionMatrix();
    group.current.userData.cw = size.width / cols / (cell * 0.75);
    group.current.userData.ch = size.height / rowsN / (cell * 0.75);
  });
  const rows = Math.ceil(SKINS.length / cols);
  return (
    <group ref={group}>
      <hemisphereLight args={["#ffffff", "#445", 1.2]} />
      <directionalLight position={[3, 4, 5]} intensity={2} />
      {SKINS.map((s, i) => (
        <GridCell key={s.id} i={i} cols={cols} rows={rows} group={group} skin={s} selected={progress.selectedBall === s.id} locked={!skinUnlocked(progress, s)} />
      ))}
    </group>
  );
}

function GridCell({ i, cols, rows, group, skin, selected, locked }) {
  const ref = useRef();
  useFrame(() => {
    const g = group.current;
    if (!g || !ref.current) return;
    const cw = g.userData.cw || 1.4;
    const ch = g.userData.ch || 1.4;
    const c = i % cols;
    const r = Math.floor(i / cols);
    ref.current.position.set((c - (cols - 1) / 2) * cw, ((rows - 1) / 2 - r) * ch + ch * 0.14, 0);
  });
  return (
    <group ref={ref}>
      <PreviewBall skin={skin} x={0} y={0} selected={selected} locked={locked} />
    </group>
  );
}

/* ------------------------------------------------------------- stats */
function fmtTime(ms) {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h ? `${h}H ${m % 60}M` : `${m}M ${Math.floor((ms % 60000) / 1000)}S`;
}

export function Statistics({ progress, onBack }) {
  const s = progress.stats;
  const hero = [
    ["tower", "LEVELS COMPLETED", `${levelsDone(progress)}/${LEVELS.length}`],
    ["star", "STARS EARNED", `${totalStars(progress)}/${LEVELS.length * 3}`],
    ["down", "BEST ENDLESS DEPTH", s.bestDepth],
  ];
  const rows = [
    ["TOTAL DROPS", s.drops],
    ["TOTAL FLOORS PASSED", s.floors],
    ["TOTAL BOUNCES", s.bounces],
    ["TOTAL SMASHES", s.smashes],
    ["PLATFORMS DESTROYED", s.destroyed],
    ["BEST DROP STREAK", `×${s.bestStreak}`],
    ["TOTAL FAILS", s.fails],
    ["ENDLESS RUNS", s.endlessRuns],
    ["TOTAL PLAY TIME", fmtTime(s.playMs)],
  ];
  return (
    <div className="hd-screen">
      <div className="hd-panel hd-sheet">
        <header className="hd-sheet__head">
          <button type="button" className="hd-iconbtn" aria-label="Back" onClick={onBack}>
            <Icon name="back" />
          </button>
          <h2>STATISTICS</h2>
        </header>
        <div className="hd-stats__hero">
          {hero.map(([icon, label, v]) => (
            <div key={label} className="hd-stats__big">
              <Icon name={icon} />
              <strong>{v}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <ul className="hd-stats__list">
          {rows.map(([k, v]) => (
            <li key={k}>
              <span>{k}</span>
              <i />
              <b>{v}</b>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ settings */
function Switch({ label, hint, on, onChange }) {
  return (
    <li className="hd-set">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <button type="button" role="switch" aria-checked={on} className={`hd-switch${on ? " is-on" : ""}`} onClick={() => onChange(!on)}>
        <i />
      </button>
    </li>
  );
}
function Seg({ label, hint, value, options, onChange }) {
  return (
    <li className="hd-set">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <div className="hd-seg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o} type="button" role="radio" aria-checked={value === o} className={value === o ? "is-on" : ""} onClick={() => onChange(o)}>
            {o.toUpperCase()}
          </button>
        ))}
      </div>
    </li>
  );
}
export function Settings({ settings, onChange, onBack }) {
  return (
    <div className="hd-screen">
      <div className="hd-panel hd-sheet hd-sheet--narrow">
        <header className="hd-sheet__head">
          <button type="button" className="hd-iconbtn" aria-label="Back" onClick={onBack}>
            <Icon name="back" />
          </button>
          <h2>SETTINGS</h2>
        </header>
        <ul className="hd-settings">
          <Switch label="SOUND" on={settings.sound} onChange={(v) => onChange({ sound: v })} />
          <Switch label="MUSIC" on={settings.music} onChange={(v) => onChange({ music: v })} />
          <Seg label="DRAG SENSITIVITY" value={settings.sens} options={["low", "medium", "high"]} onChange={(v) => onChange({ sens: v })} />
          <Seg label="GRAPHICS" hint="Visuals only — physics never changes" value={settings.graphics} options={["low", "medium", "high"]} onChange={(v) => onChange({ graphics: v })} />
          <Switch label="SHADOWS" on={settings.shadows} onChange={(v) => onChange({ shadows: v })} />
          <Switch label="PARTICLES" on={settings.particles} onChange={(v) => onChange({ particles: v })} />
          <Switch label="CAMERA SHAKE" on={settings.shake} onChange={(v) => onChange({ shake: v })} />
          <Switch label="REDUCED MOTION" hint="Calmer shake, parallax and effects" on={settings.reducedMotion} onChange={(v) => onChange({ reducedMotion: v })} />
          <Switch label="CONTROL HELP" on={settings.controlHelp} onChange={(v) => onChange({ controlHelp: v })} />
        </ul>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- results */
export function LevelComplete({ level, result, canNext, onNext, onReplay, onLevels }) {
  const { r, stars, record, fails, prevStars } = result;
  return (
    <div className="hd-result-wrap">
      <div className="hd-panel hd-result">
        <p className="hd-result__kicker">LEVEL {String(level.id).padStart(2, "0")} · {level.name}</p>
        <h2 className="hd-result__title">LEVEL COMPLETE</h2>
        <div className="hd-result__stars">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`hd-bigstar${i < stars ? " is-on" : ""}`} style={{ animationDelay: `${120 + i * 140}ms` }}>
              <Icon name="star" />
            </span>
          ))}
        </div>
        {stars > prevStars && prevStars > 0 && <p className="hd-result__badge">NEW STAR RECORD</p>}
        <dl className="hd-result__stats">
          <div>
            <dt>TIME</dt>
            <dd className={r.time <= level.targetTime ? "is-good" : ""}>{r.time.toFixed(1)}s</dd>
          </div>
          <div>
            <dt>MAX DROP</dt>
            <dd className={r.maxStreak >= level.streakGoal ? "is-good" : ""}>×{r.maxStreak}</dd>
          </div>
          <div>
            <dt>SMASHES</dt>
            <dd>{r.smashes}</dd>
          </div>
          <div>
            <dt>FAILS</dt>
            <dd>{fails}</dd>
          </div>
        </dl>
        <p className="hd-result__req">
          ★★ under {level.targetTime}s · ★★★ also a DROP ×{level.streakGoal} · best {record?.bestTime?.toFixed(1)}s
        </p>
        <div className="hd-result__actions">
          {canNext ? (
            <button type="button" className="hd-btn hd-btn--primary" onClick={onNext}>
              NEXT LEVEL <Icon name="right" />
            </button>
          ) : (
            <p className="hd-result__end">{level.id === 50 ? "YOU REACHED THE BOTTOM OF EVERY TOWER" : "MORE TOWERS COMING"}</p>
          )}
          <div className="hd-result__row">
            <button type="button" className="hd-btn" onClick={onReplay}>
              <Icon name="retry" /> REPLAY
            </button>
            <button type="button" className="hd-btn" onClick={onLevels}>
              LEVELS
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LevelFailed({ result, onRetry, onLevels }) {
  return (
    <div className="hd-result-wrap">
      <div className="hd-panel hd-result hd-result--fail">
        <h2 className="hd-result__title">DANGER!</h2>
        <p className="hd-result__sub">Striped spiked platforms end the run — unless you're SMASHING. Drop through 3 floors in a row to smash anything.</p>
        {result.r.mode !== "endless" && <p className="hd-result__prog">REACHED <b>{Math.round(result.r.progress * 100)}%</b></p>}
        <div className="hd-result__actions">
          <button type="button" className="hd-btn hd-btn--primary" onClick={onRetry} autoFocus>
            <Icon name="retry" /> RETRY
          </button>
          <button type="button" className="hd-btn hd-btn--ghost" onClick={onLevels}>
            LEVELS
          </button>
        </div>
        <p className="hd-result__key">SPACE / ENTER TO RETRY</p>
      </div>
    </div>
  );
}

export function EndlessOver({ result, onRetry, onMenu }) {
  const { r, best, newBest } = result;
  return (
    <div className="hd-result-wrap">
      <div className={`hd-panel hd-result${newBest ? " is-best" : ""}`}>
        <p className="hd-result__kicker">ENDLESS</p>
        {newBest && r.depth > 0 && <p className="hd-result__badge">NEW BEST DEPTH</p>}
        <div className="hd-result__big">
          {r.depth}
          <small>FLOORS</small>
        </div>
        <dl className="hd-result__stats">
          <div>
            <dt>BEST</dt>
            <dd>{best}</dd>
          </div>
          <div>
            <dt>MAX DROP</dt>
            <dd>×{r.maxStreak}</dd>
          </div>
          <div>
            <dt>SMASHES</dt>
            <dd>{r.smashes}</dd>
          </div>
          <div>
            <dt>TIME</dt>
            <dd>{r.time.toFixed(0)}s</dd>
          </div>
        </dl>
        <div className="hd-result__actions">
          <button type="button" className="hd-btn hd-btn--primary" onClick={onRetry}>
            <Icon name="retry" /> AGAIN
          </button>
          <button type="button" className="hd-btn hd-btn--ghost" onClick={onMenu}>
            MAIN MENU
          </button>
        </div>
      </div>
    </div>
  );
}

void THREE;
