/**
 * Lumberjack Life — menu screens, all inside the GamePlayer stage:
 *   MainMenu (live 3D forest showcase behind it), Regions, Equipment
 *   (workshop: tools / vehicles / sawmill, with a 3D character preview),
 *   Statistics, SettingsPanel, ControlsHelp.
 */
import { useMemo, useState } from "react";
import WorldCanvas from "../three/WorldCanvas.jsx";
import PreviewCanvas from "../three/PreviewCanvas.jsx";
import { createWorld } from "../engine/world.js";
import { REGIONS, regionById } from "../data/regions.js";
import { SPECIES, speciesById } from "../data/species.js";
import { TOOLS, VEHICLES, UPGRADES, toolById } from "../data/equipment.js";
import {
  buyTool, selectTool, buyVehicle, buyUpgrade, unlockRegion, regionUnlockState, regionCompletion, favouriteTool, favouriteSpecies, currentOrder,
} from "../engine/career.js";
import { sound } from "../audio/sound.js";

const money = (n) => `$${Math.round(n).toLocaleString()}`;
const click = (fn) => () => {
  sound.uiClick();
  fn();
};

function Header({ title, onBack, right = null }) {
  return (
    <div className="ll-head">
      <button type="button" className="ll-back" onClick={click(onBack)} onMouseEnter={() => sound.uiHover()}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        Back
      </button>
      <h2 className="ll-head__title">{title}</h2>
      <div className="ll-head__right">{right}</div>
    </div>
  );
}

/* ================================================================ main menu */
export function MainMenu({ progress, onContinue, onNew, onNav, settings }) {
  const region = regionById(progress.currentRegion);
  const live = useMemo(() => ({ paused: false, hud: null }), []);
  const world = useMemo(() => createWorld({ region, progress: { ...progress, sawmillUpgrades: progress.sawmillUpgrades }, snapshot: null, seed: 4242 }), [region.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [confirm, setConfirm] = useState(false);
  const order = currentOrder(progress, region.id);
  const items = [
    progress.started && { id: "continue", label: "Continue", sub: `${region.name} · ${order.name}`, primary: true, on: onContinue },
    { id: "new", label: "New Game", sub: progress.started ? "Start a fresh career" : "Begin as a small lumberjack", primary: !progress.started, on: () => (progress.started ? setConfirm(true) : onNew()) },
    { id: "regions", label: "Regions", sub: `${progress.unlockedRegions.length}/5 unlocked`, on: () => onNav("regions") },
    { id: "equipment", label: "Equipment", sub: toolById(progress.selectedTool).name, on: () => onNav("equipment") },
    { id: "stats", label: "Statistics", sub: `${progress.statistics.treesCut} trees felled`, on: () => onNav("stats") },
    { id: "settings", label: "Settings", sub: `Graphics: ${settings.graphics}`, on: () => onNav("settings") },
  ].filter(Boolean);
  const showcaseSettings = useMemo(() => ({ ...settings, graphics: settings.graphics === "high" ? "medium" : settings.graphics }), [settings]);
  return (
    <div className="ll-screen ll-menu">
      <WorldCanvas world={world} live={live} settings={showcaseSettings} progress={progress} showcase className="ll-canvas ll-canvas--menu" />
      <div className="ll-menu__shade" />
      <div className="ll-menu__col">
        <div className="ll-logo">
          <svg viewBox="0 0 64 64" className="ll-logo__mark" aria-hidden="true">
            <circle cx="32" cy="32" r="30" fill="#2f4a2a" />
            <path d="M32 9 18 33h8l-10 15h32L38 33h8z" fill="#7fb24f" />
            <rect x="29" y="46" width="6" height="9" rx="1" fill="#7a5234" />
            <path d="M44 14 50 44" stroke="#e8d5b0" strokeWidth="3" strokeLinecap="round" />
            <path d="M41 12c5-3 10-2 13 2-4 3-9 3-12 1z" fill="#c9ced3" />
          </svg>
          <div>
            <div className="ll-logo__title">LUMBERJACK</div>
            <div className="ll-logo__title ll-logo__title--life">LIFE</div>
          </div>
        </div>
        <nav className="ll-menu__nav">
          {items.map((it) => (
            <button key={it.id} type="button" className={`ll-mbtn${it.primary ? " ll-mbtn--primary" : ""}`} onClick={click(it.on)} onMouseEnter={() => sound.uiHover()}>
              <span className="ll-mbtn__label">{it.label}</span>
              <span className="ll-mbtn__sub">{it.sub}</span>
            </button>
          ))}
        </nav>
        <div className="ll-menu__foot">
          <span><b>{money(progress.money)}</b></span>
          <span>Level {progress.level}</span>
          <span>{progress.completedOrders.length} orders</span>
        </div>
      </div>
      {confirm && (
        <div className="ll-modal" role="dialog" aria-modal="true">
          <div className="ll-modal__card">
            <div className="ll-modal__title">Start a new career?</div>
            <p>Your money, tools, vehicles, regions and statistics will be reset. Settings are kept.</p>
            <div className="ll-modal__row">
              <button type="button" className="ll-btn" onClick={click(() => setConfirm(false))}>Cancel</button>
              <button type="button" className="ll-btn ll-btn--danger" onClick={click(() => { setConfirm(false); onNew(); })}>Start over</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================ regions */
function RegionArt({ region, locked }) {
  const L = region.light;
  const sp = region.species.map(([id]) => speciesById(id));
  const leaf = (s) => ((region.leafTint && region.leafTint[s.id]) || s.leaves)[0];
  const conifer = (s) => ["pine", "fir", "spruce"].includes(s.form);
  const trees = [];
  for (let i = 0; i < 11; i++) {
    const s = sp[i % sp.length];
    const x = 8 + i * 9 + ((i * 37) % 7);
    const h = 26 + ((i * 53) % 14);
    trees.push({ x, h, c: leaf(s), con: conifer(s), y: 92 - (i % 3) * 4 });
  }
  const id = `g-${region.id}`;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className={`ll-rart${locked ? " is-locked" : ""}`} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={L.skyTop} />
          <stop offset="1" stopColor={L.skyHorizon} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${id})`} />
      <circle cx={70 + Math.cos(L.sunAzim) * 12} cy={30 - L.sunElev * 14} r="6" fill={L.sun} opacity="0.85" />
      <path d="M0 62 14 40 26 55 40 30 55 52 68 36 82 54 100 38V100H0z" fill={region.mountains} opacity="0.8" />
      {region.snowy && <path d="M36 35 40 30 44 36 41 34zM64 40 68 36 72 41 68 39z" fill="#fff" />}
      <path d="M0 74 Q25 62 50 72 T100 68V100H0z" fill={region.ground.grass[2]} />
      {trees.map((t, i) => (t.con ? (
        <g key={i}>
          <rect x={t.x - 0.8} y={t.y - 5} width="1.6" height="6" fill="#4a3322" />
          <path d={`M${t.x} ${t.y - t.h} L${t.x - 6} ${t.y - 4} L${t.x + 6} ${t.y - 4}z`} fill={t.c} />
          {region.snowy && <path d={`M${t.x} ${t.y - t.h} L${t.x - 2.4} ${t.y - t.h + 7} L${t.x + 2.4} ${t.y - t.h + 7}z`} fill="#fff" opacity="0.9" />}
        </g>
      ) : (
        <g key={i}>
          <rect x={t.x - 0.9} y={t.y - 9} width="1.8" height="10" fill={region.id === "greenwood" && i % 2 === 0 ? "#e9e4d8" : "#5b4636"} />
          <ellipse cx={t.x} cy={t.y - t.h * 0.62} rx={6.5} ry={t.h * 0.42} fill={t.c} />
          <ellipse cx={t.x - 2} cy={t.y - t.h * 0.72} rx={3.2} ry={t.h * 0.22} fill="#fff" opacity="0.12" />
        </g>
      )))}
      <path d="M0 90 Q30 84 60 90 T100 88V100H0z" fill={region.ground.grass[0]} />
      {region.weather === "snow" && Array.from({ length: 30 }, (_, i) => <circle key={i} cx={(i * 37) % 100} cy={(i * 53) % 90} r="0.6" fill="#fff" opacity="0.9" />)}
      {region.weather === "leaves" && Array.from({ length: 14 }, (_, i) => <ellipse key={i} cx={(i * 41) % 100} cy={(i * 29) % 80} rx="1" ry="0.5" fill="#e0873a" />)}
      {region.weather === "gold" && Array.from({ length: 18 }, (_, i) => <circle key={i} cx={(i * 43) % 100} cy={(i * 31) % 80} r="0.5" fill="#ffe08a" />)}
    </svg>
  );
}

export function Regions({ progress, updateProgress, onTravel, onBack }) {
  return (
    <div className="ll-screen ll-panel">
      <Header title="Regions" onBack={onBack} right={<span className="ll-pill">{money(progress.money)}</span>} />
      <div className="ll-regions">
        {REGIONS.map((r, i) => {
          const st = regionUnlockState(progress, r);
          const comp = regionCompletion(progress, r);
          const here = progress.currentRegion === r.id;
          return (
            <div key={r.id} className={`ll-rcard${st.owned ? "" : " is-locked"}${here ? " is-here" : ""}`}>
              <div className="ll-rcard__art">
                <RegionArt region={r} locked={!st.owned} />
                <span className="ll-rcard__num">{i + 1}</span>
                {!st.owned && (
                  <span className="ll-rcard__lock">
                    <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="9" width="12" height="9" rx="2" fill="currentColor" /><path d="M7 9V6a3 3 0 0 1 6 0v3" stroke="currentColor" strokeWidth="2" fill="none" /></svg>
                  </span>
                )}
              </div>
              <div className="ll-rcard__body">
                <div className="ll-rcard__name">{r.name}</div>
                <div className="ll-rcard__tag">{r.tagline}</div>
                <div className="ll-rcard__trees">{r.species.map(([id]) => SPECIES[id].name).join(" · ")}</div>
                {st.owned ? (
                  <>
                    <div className="ll-rcard__prog"><span style={{ width: `${Math.round(comp * 100)}%` }} /></div>
                    <div className="ll-rcard__meta">{Math.round(comp * 100)}% of contracts</div>
                    <button type="button" className={`ll-btn ${here ? "" : "ll-btn--primary"}`} onClick={click(() => onTravel(r.id))}>{here ? "Play here" : "Travel"}</button>
                  </>
                ) : (
                  <>
                    <div className="ll-rcard__req">
                      <span className={st.ordersOk ? "ok" : ""}>{r.unlock.orders} orders done ({progress.completedOrders.length})</span>
                      <span className={st.moneyOk ? "ok" : ""}>{money(r.unlock.price)}</span>
                    </div>
                    <button
                      type="button"
                      className="ll-btn ll-btn--primary"
                      disabled={!st.canBuy}
                      onClick={click(() => {
                        updateProgress((p) => {
                          const res = unlockRegion(p, r.id);
                          if (res.ok) sound.unlock();
                          return res.progress;
                        });
                      })}
                    >
                      Unlock
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================ equipment / workshop */
function Stat({ label, value, max }) {
  return (
    <div className="ll-stat">
      <span className="ll-stat__label">{label}</span>
      <span className="ll-stat__bar"><span style={{ width: `${Math.round(Math.min(1, value / max) * 100)}%` }} /></span>
    </div>
  );
}

export function Equipment({ progress, updateProgress, onBack, inGame = false }) {
  const [tab, setTab] = useState("tools");
  const [focus, setFocus] = useState(progress.selectedTool);
  const sel = toolById(focus);
  const buy = (fn) => updateProgress((p) => {
    const r = fn(p);
    if (r.ok) sound.coin();
    else sound.denied();
    return r.progress;
  });
  const tierSpecies = (tier) => Object.values(SPECIES).filter((s) => s.minTier === tier).map((s) => s.name);
  return (
    <div className={`ll-screen ll-panel ll-workshop${inGame ? " ll-workshop--overlay" : ""}`}>
      <Header title="Workshop" onBack={onBack} right={<span className="ll-pill">{money(progress.money)}</span>} />
      <div className="ll-tabs">
        {[["tools", "Tools"], ["vehicles", "Vehicles"], ["mill", "Sawmill"]].map(([id, label]) => (
          <button key={id} type="button" className={`ll-tab${tab === id ? " is-on" : ""}`} onClick={click(() => setTab(id))}>{label}</button>
        ))}
      </div>
      {tab === "tools" && (
        <div className="ll-workshop__grid">
          <div className="ll-preview">
            <PreviewCanvas toolId={focus} />
            <div className="ll-preview__info">
              <div className="ll-preview__name">{sel.name}</div>
              <div className="ll-preview__blurb">{sel.blurb}</div>
              {sel.kind === "axe" ? (
                <>
                  <Stat label="Damage" value={sel.damage} max={40} />
                  <Stat label="Swing speed" value={1 / sel.swing} max={1 / 0.66} />
                  <Stat label="Reach" value={sel.reach} max={1.5} />
                </>
              ) : (
                <>
                  <Stat label="Cutting power" value={sel.dps} max={112} />
                  <Stat label="Bar length" value={sel.bar} max={0.6} />
                </>
              )}
              {tierSpecies(sel.tier).length > 0 && <div className="ll-preview__unlocks">Fells: {tierSpecies(sel.tier).join(", ")}</div>}
            </div>
          </div>
          <div className="ll-list">
            {TOOLS.map((t) => {
              const owned = progress.unlockedTools.includes(t.id);
              const active = progress.selectedTool === t.id;
              return (
                <div key={t.id} className={`ll-item${focus === t.id ? " is-focus" : ""}${active ? " is-active" : ""}`} onMouseEnter={() => setFocus(t.id)} onClick={() => setFocus(t.id)}>
                  <span className="ll-item__swatch" style={{ background: t.kind === "axe" ? `linear-gradient(135deg, ${t.look.head}, ${t.look.edge})` : `linear-gradient(135deg, ${t.look.body}, ${t.look.accent})` }} />
                  <span className="ll-item__text">
                    <span className="ll-item__name">{t.name}</span>
                    <span className="ll-item__sub">{t.kind === "axe" ? `Axe · tier ${t.tier}` : `Chainsaw · tier ${t.tier}`}</span>
                  </span>
                  {active ? (
                    <span className="ll-item__tag">Equipped</span>
                  ) : owned ? (
                    <button type="button" className="ll-btn ll-btn--small" onClick={(e) => { e.stopPropagation(); sound.uiClick(); updateProgress((p) => selectTool(p, t.id)); }}>Equip</button>
                  ) : (
                    <button type="button" className="ll-btn ll-btn--small ll-btn--primary" disabled={progress.money < t.price} onClick={(e) => { e.stopPropagation(); buy((p) => buyTool(p, t.id)); }}>{money(t.price)}</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {tab === "vehicles" && (
        <div className="ll-cards">
          {VEHICLES.map((v) => {
            const owned = progress.unlockedVehicles.includes(v.id);
            return (
              <div key={v.id} className={`ll-card${owned ? " is-owned" : ""}`}>
                <div className="ll-card__icon" style={{ background: v.look ? v.look.body : "#9c7348" }}>
                  <svg viewBox="0 0 48 28" aria-hidden="true">
                    {v.kind === "cart" ? (
                      <><rect x="6" y="8" width="30" height="8" rx="1" fill="#f3e3c2" /><circle cx="21" cy="20" r="6" fill="#2a2622" /><path d="M36 12h10" stroke="#f3e3c2" strokeWidth="2" /></>
                    ) : v.kind === "truck" ? (
                      <><rect x="2" y="10" width="30" height="8" fill="#f3e3c2" /><rect x="32" y="4" width="12" height="14" rx="2" fill="#f3e3c2" /><circle cx="10" cy="21" r="4" fill="#222" /><circle cx="22" cy="21" r="4" fill="#222" /><circle cx="38" cy="21" r="4" fill="#222" /></>
                    ) : (
                      <><rect x="16" y="9" width="20" height="8" fill="#f3e3c2" /><rect x="8" y="3" width="10" height="12" rx="1" fill="none" stroke="#f3e3c2" strokeWidth="2" /><circle cx="13" cy="19" r="7" fill="#222" /><circle cx="32" cy="21" r="4.5" fill="#222" /></>
                    )}
                  </svg>
                </div>
                <div className="ll-card__name">{v.name}</div>
                <div className="ll-card__sub">{v.blurb}</div>
                <div className="ll-card__meta">Carries {v.capacity} logs{v.speed ? ` · ${Math.round(v.speed * 3.6)} km/h` : ""}</div>
                {owned ? (
                  <span className="ll-item__tag">Owned · at the yard</span>
                ) : v.kind === "cart" ? (
                  <span className="ll-card__lockline">{v.unlock}</span>
                ) : (
                  <button type="button" className="ll-btn ll-btn--primary" disabled={progress.money < v.price} onClick={click(() => buy((p) => buyVehicle(p, v.id)))}>{money(v.price)}</button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {tab === "mill" && (
        <div className="ll-cards">
          {UPGRADES.map((u) => {
            const lvl = progress.sawmillUpgrades[u.id] || 0;
            const maxed = lvl >= u.prices.length;
            return (
              <div key={u.id} className="ll-card">
                <div className="ll-card__name">{u.name}</div>
                <div className="ll-card__sub">{u.blurb}</div>
                <div className="ll-pips">{u.levels.map((_, i) => <span key={i} className={i <= lvl ? "on" : ""} />)}</div>
                <div className="ll-card__meta">{u.fmt(u.levels[lvl])}{!maxed ? ` → ${u.fmt(u.levels[lvl + 1])}` : " · max"}</div>
                {maxed ? <span className="ll-item__tag">Maxed</span> : (
                  <button type="button" className="ll-btn ll-btn--primary" disabled={progress.money < u.prices[lvl]} onClick={click(() => buy((p) => buyUpgrade(p, u.id)))}>{money(u.prices[lvl])}</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ================================================================ statistics */
export function Statistics({ progress, onBack }) {
  const s = progress.statistics;
  const km = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);
  const time = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h ? `${h}h ${m}m` : `${m}m ${Math.floor(sec % 60)}s`;
  };
  const tiles = [
    ["Trees cut", s.treesCut],
    ["Axe swings", s.axeSwings],
    ["Chainsaw time", time(s.chainsawTime)],
    ["Logs collected", s.logsCollected],
    ["Logs transported", s.logsTransported],
    ["Planks produced", s.planksProduced],
    ["Orders completed", s.ordersCompleted],
    ["Money earned", money(s.moneyEarned)],
    ["Distance walked", km(s.distanceWalked)],
    ["Distance driven", km(s.distanceDriven)],
    ["Favourite tool", favouriteTool(s)],
    ["Most cut species", favouriteSpecies(s)],
    ["Regions unlocked", `${progress.unlockedRegions.length} / 5`],
    ["Total play time", time(s.playTime)],
  ];
  return (
    <div className="ll-screen ll-panel">
      <Header title="Statistics" onBack={onBack} />
      <div className="ll-stats">
        {tiles.map(([k, v]) => (
          <div key={k} className="ll-tile">
            <div className="ll-tile__v">{typeof v === "number" ? v.toLocaleString() : v}</div>
            <div className="ll-tile__k">{k}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================ settings */
function Slider({ label, value, onChange, min = 0, max = 1, step = 0.05, fmt = (v) => `${Math.round(v * 100)}%` }) {
  return (
    <label className="ll-set">
      <span className="ll-set__label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="ll-set__val">{fmt(value)}</span>
    </label>
  );
}
function Toggle({ label, value, onChange, hint }) {
  return (
    <label className="ll-set ll-set--toggle">
      <span className="ll-set__label">{label}{hint && <em>{hint}</em>}</span>
      <button type="button" className={`ll-switch${value ? " is-on" : ""}`} onClick={() => { sound.uiClick(); onChange(!value); }} aria-pressed={value}><span /></button>
    </label>
  );
}

export function SettingsPanel({ settings, muted, onChange, onBack }) {
  const s = settings;
  return (
    <div className="ll-screen ll-panel">
      <Header title="Settings" onBack={onBack} />
      <div className="ll-settings">
        <section>
          <h3>Audio {muted && <em className="ll-muted">Muted by the Game Center</em>}</h3>
          <Slider label="Master sound" value={s.master} onChange={(v) => onChange({ master: v })} />
          <Slider label="Music" value={s.music} onChange={(v) => onChange({ music: v })} />
          <Slider label="Sound effects" value={s.sfx} onChange={(v) => onChange({ sfx: v })} />
        </section>
        <section>
          <h3>Graphics</h3>
          <div className="ll-set">
            <span className="ll-set__label">Quality</span>
            <div className="ll-seg">
              {["low", "medium", "high"].map((q) => (
                <button key={q} type="button" className={s.graphics === q ? "is-on" : ""} onClick={() => { sound.uiClick(); onChange({ graphics: q }); }}>{q}</button>
              ))}
            </div>
          </div>
          <Toggle label="Shadows" value={s.shadows} onChange={(v) => onChange({ shadows: v })} hint={s.graphics === "low" ? "off on Low" : null} />
          <Toggle label="Particles" value={s.particles} onChange={(v) => onChange({ particles: v })} />
        </section>
        <section>
          <h3>Camera &amp; comfort</h3>
          <Slider label="Camera sensitivity" value={s.sensitivity} min={0.3} max={2.5} step={0.05} fmt={(v) => `${v.toFixed(2)}×`} onChange={(v) => onChange({ sensitivity: v })} />
          <Toggle label="Invert vertical look" value={s.invertY} onChange={(v) => onChange({ invertY: v })} />
          <Toggle label="Camera shake" value={s.cameraShake} onChange={(v) => onChange({ cameraShake: v })} />
          <Toggle label="Reduced motion" value={s.reducedMotion} onChange={(v) => onChange({ reducedMotion: v })} />
          <Toggle label="Control hints" value={s.controlHelp} onChange={(v) => onChange({ controlHelp: v })} />
        </section>
      </div>
    </div>
  );
}

export function ControlsHelp({ onBack }) {
  const rows = [
    ["W A S D", "Move (arrows too)"],
    ["Mouse", "Look around (click the game to capture the mouse; or hold right button)"],
    ["Shift", "Sprint"],
    ["Left click", "Swing the axe · hold for the chainsaw"],
    ["E", "Pick up / drop / place a log · load the cart · pull the cart · order board · sell"],
    ["F", "Get in / out of a vehicle"],
    ["W / S · A / D", "Drive: throttle / reverse · steer"],
    ["Space", "Brake (driving)"],
    ["Q", "Switch between your axe and chainsaw"],
    ["Esc / P", "Pause"],
  ];
  return (
    <div className="ll-screen ll-panel">
      <Header title="Controls" onBack={onBack} />
      <div className="ll-controls">
        {rows.map(([k, v]) => (
          <div key={k} className="ll-controls__row"><kbd>{k}</kbd><span>{v}</span></div>
        ))}
        <p className="ll-controls__tip">Tip: stand beside a tree, face it and click — the axe bites when it reaches the bark. Chop the marks on a fallen trunk to cut it into logs, then carry them to the sawmill's log deck.</p>
      </div>
    </div>
  );
}
