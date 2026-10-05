/**
 * Train Commander — menu screens (DOM over the live 3D scene).
 * The 3D train keeps rolling behind the main menu; Routes shows a railway
 * campaign map; the Train screen frames the 3D train in a garage orbit.
 */
import { useMemo, useRef } from "react";
import { ROUTES, getRoute, finaleLabel } from "../data/routes.js";
import { REGIONS, regionOf } from "../data/regions.js";
import { MODULES, MODULE_IDS, stat } from "../data/modules.js";
import { ENEMIES, BOSSES } from "../data/enemies.js";
import { LIVERIES } from "../data/cosmetics.js";
import { isUnlocked, totalStars, regionStars, nextRouteId, favoriteModule } from "../utils/storage.js";
import { Icon, ModuleIcon, EnemyIcon, Stars, Toggle, Segmented, fmtTime, fmtKm } from "./ui.jsx";

/* ================================================================ main menu */
export function MainMenu({ progress, onPlay, onRoutes, onTrain, onStats, onSettings }) {
  const next = getRoute(nextRouteId(progress));
  const stars = totalStars(progress);
  return (
    <div className="tc-menu">
      <div className="tc-menu__brand">
        <div className="tc-logo" aria-label="Train Commander">
          <span className="tc-logo__small">ARMORED RAIL</span>
          <h1>
            TRAIN
            <br />
            COMMANDER
          </h1>
          <span className="tc-logo__tag">BUILD • DEFEND • KEEP MOVING</span>
        </div>
        <nav className="tc-menu__nav" aria-label="Main menu">
          <button type="button" className="tc-btn tc-btn--hero" onClick={onPlay} autoFocus>
            <Icon name="play" size={18} />
            <span>
              PLAY
              <small>
                Route {next.id} · {next.name}
              </small>
            </span>
          </button>
          <button type="button" className="tc-btn" onClick={onRoutes}>
            <Icon name="map" size={18} /> ROUTES
          </button>
          <button type="button" className="tc-btn" onClick={onTrain}>
            <Icon name="train" size={18} /> TRAIN
          </button>
          <div className="tc-menu__row">
            <button type="button" className="tc-btn" onClick={onStats}>
              <Icon name="stats" size={18} /> STATISTICS
            </button>
            <button type="button" className="tc-btn" onClick={onSettings}>
              <Icon name="gear" size={18} /> SETTINGS
            </button>
          </div>
        </nav>
      </div>
      <div className="tc-menu__badge" aria-label={`${stars} of 90 stars`}>
        <Icon name="star" size={16} />
        <strong>{stars}</strong>
        <span>/ 90</span>
      </div>
    </div>
  );
}

/* ================================================================ routes map */
const MAP_W = 1000;
const MAP_H = 540;
const NODES = (() => {
  // a serpentine line: each region a column band, 6 stations zig-zagging down/up
  const out = [];
  for (const r of ROUTES) {
    const reg = r.region - 1;
    const i = (r.id - 1) % 6;
    const colX = 40 + reg * 192;
    const down = reg % 2 === 0;
    const k = down ? i : 5 - i;
    const x = colX + 30 + (k % 2 ? 98 : 22) + (i === 0 || i === 5 ? 20 : 0);
    const y = 92 + k * 82;
    out.push({ id: r.id, x, y });
  }
  return out;
})();

function trackPath() {
  let d = "";
  NODES.forEach((n, i) => {
    if (i === 0) d += `M ${n.x} ${n.y}`;
    else {
      const p = NODES[i - 1];
      const mx = (p.x + n.x) / 2;
      d += ` C ${mx} ${p.y}, ${mx} ${n.y}, ${n.x} ${n.y}`;
    }
  });
  return d;
}
const TRACK = trackPath();

function RegionArt({ region }) {
  const x = 40 + (region - 1) * 192;
  const R = regionOf(region);
  const art = {
    1: (
      <g opacity="0.55">
        <path d={`M${x} 520 q40 -60 80 0 q50 -80 110 0 v40 h-190z`} fill="#4f9a3a" />
        <circle cx={x + 150} cy={470} r="16" fill="#3f8a35" />
        <rect x={x + 147} y={480} width="6" height="22" fill="#7a5434" />
      </g>
    ),
    2: (
      <g opacity="0.55">
        <path d={`M${x + 10} 530 v-60 h60 v60z M${x + 100} 530 v-90 h70 v90z`} fill="#b86a3e" />
        <path d={`M${x + 120} 530 v-30 q0 -20 10 -20 t10 20 v30`} fill="#5f8a45" />
      </g>
    ),
    3: (
      <g opacity="0.6">
        <path d={`M${x} 540 l60 -110 l60 110z M${x + 80} 540 l55 -80 l55 80z`} fill="#8ea3b8" />
        <path d={`M${x + 45} 458 l15 -28 l15 28z`} fill="#ffffff" />
      </g>
    ),
    4: (
      <g opacity="0.6">
        <path d={`M${x + 20} 540 v-50 l8 -10 v60 M${x + 70} 540 v-70 h30 v70`} stroke="#5c566a" strokeWidth="6" fill="#4a4452" />
        <path d={`M${x + 140} 540 l10 -40 l10 40z`} fill="#6cf2ff" />
      </g>
    ),
    5: (
      <g opacity="0.6">
        <rect x={x + 10} y={470} width="80" height="70" fill="#6b5e55" />
        <rect x={x + 70} y={430} width="10" height="40" fill="#5a4a40" />
        <path d={`M${x + 110} 540 v-80 h20 v-10 h20 v10 h20 v80z`} fill="#5c5864" />
      </g>
    ),
  }[region];
  return (
    <g>
      <rect x={x} y={20} width={180} height={MAP_H - 30} rx="18" fill={R.sky} opacity="0.16" />
      <rect x={x} y={20} width={180} height={MAP_H - 30} rx="18" fill="none" stroke={R.accent} strokeOpacity="0.35" strokeWidth="2" />
      {art}
    </g>
  );
}

export function RoutesScreen({ progress, selected, onSelect, onPlay, onBack }) {
  const sel = getRoute(selected) || getRoute(nextRouteId(progress));
  const R = regionOf(sel.region);
  const unlocked = isUnlocked(progress, sel.id);
  const fin = sel.events.find((e) => e.type === "final");
  const introEnemy = sel.intro || (sel.id === 1 ? "raider" : null);
  const newModule = sel.id <= 4 ? sel.modules.find((m) => !getRoute(Math.max(1, sel.id - 1)).modules.includes(m)) : null;
  return (
    <div className="tc-screen tc-routes">
      <header className="tc-screen__head">
        <button type="button" className="tc-iconbtn" onClick={onBack} aria-label="Back">
          <Icon name="back" />
        </button>
        <h2>ROUTES</h2>
        <span className="tc-screen__meta">
          <Icon name="star" size={15} /> {totalStars(progress)} / 90
        </span>
      </header>
      <div className="tc-routes__body">
        <div className="tc-map" role="listbox" aria-label="Railway campaign map">
          <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="xMidYMid meet">
            {REGIONS.map((r) => (
              <RegionArt key={r.id} region={r.id} />
            ))}
            {REGIONS.map((r) => (
              <text key={`t${r.id}`} x={40 + (r.id - 1) * 192 + 90} y={50} textAnchor="middle" className="tc-map__region">
                {r.name.toUpperCase()}
                <tspan x={40 + (r.id - 1) * 192 + 90} dy="18" className="tc-map__rstars">
                  ★ {regionStars(progress, r.id)}/18
                </tspan>
              </text>
            ))}
            <path d={TRACK} className="tc-map__bed" />
            <path d={TRACK} className="tc-map__rail" />
            <path d={TRACK} className="tc-map__ties" />
            {NODES.map((n) => {
              const r = getRoute(n.id);
              const open = isUnlocked(progress, n.id);
              const st = progress.routeStars[n.id] || 0;
              const f = finaleLabel(r);
              return (
                <g
                  key={n.id}
                  className={`tc-node${open ? "" : " is-locked"}${sel.id === n.id ? " is-sel" : ""}${st ? " is-done" : ""}`}
                  transform={`translate(${n.x} ${n.y})`}
                  role="option"
                  aria-selected={sel.id === n.id}
                  aria-label={`Route ${n.id}, ${r.name}${open ? `, ${st} stars` : ", locked"}`}
                  tabIndex={0}
                  onClick={() => onSelect(n.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open ? onPlay(n.id) : onSelect(n.id))}
                >
                  <circle r="30" className="tc-node__hit" />
                  <rect x="-22" y="-17" width="44" height="34" rx="8" className="tc-node__plate" />
                  {f === "Boss" && <path d="M-9 -27 l4 5 5 -7 5 7 4 -5 -2 9 h-14z" className="tc-node__boss" />}
                  {open ? (
                    <text y="6" textAnchor="middle" className="tc-node__num">
                      {n.id}
                    </text>
                  ) : (
                    <path d="M-6 -1 h12 v10 h-12z M-4 -1 v-4 a4 4 0 0 1 8 0 v4" className="tc-node__lock" />
                  )}
                  {open && (
                    <g transform="translate(0 28)">
                      {[0, 1, 2].map((i) => (
                        <path key={i} transform={`translate(${(i - 1) * 12} 0) scale(0.42)`} d="M0 -12 l3.5 7.4 8.1 .9 -6 5.5 1.6 8 -7.2 -4 -7.2 4 1.6 -8 -6 -5.5 8.1 -.9z" className={i < st ? "tc-node__star is-on" : "tc-node__star"} />
                      ))}
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
        <aside className="tc-routecard" style={{ "--rc": R.accent }}>
          <small className="tc-routecard__kicker">
            {R.name.toUpperCase()} · ROUTE {sel.id}
          </small>
          <h3>{sel.name}</h3>
          <p className="tc-routecard__line">
            {sel.from} <Icon name="rail" size={14} /> {sel.to}
          </p>
          <div className="tc-routecard__chips">
            <span>
              <Icon name="train" size={14} /> {sel.wagons} wagons
            </span>
            <span>
              <Icon name="scrap" size={14} /> {sel.startScrap}
            </span>
            <span>
              <Icon name="clock" size={14} /> {sel.time === "night" ? "Night" : sel.time === "sunset" ? "Sunset" : sel.time === "morning" ? "Morning" : sel.time === "dusk" ? "Dusk" : "Day"}
              {sel.weather !== "clear" ? ` · ${sel.weather[0].toUpperCase()}${sel.weather.slice(1)}` : ""}
            </span>
          </div>
          <div className="tc-routecard__threat">
            {fin && fin.boss ? (
              <>
                <EnemyIcon type={fin.boss} size={34} />
                <div>
                  <strong>{BOSSES[fin.boss].title}: {BOSSES[fin.boss].name}</strong>
                  <span>{BOSSES[fin.boss].blurb}</span>
                </div>
              </>
            ) : (
              <>
                <Icon name="warn" size={26} />
                <div>
                  <strong>FINAL ASSAULT</strong>
                  <span>A heavy mixed attack guards the last stretch.</span>
                </div>
              </>
            )}
          </div>
          {(introEnemy || newModule) && (
            <div className="tc-routecard__new">
              {introEnemy && (
                <span>
                  <EnemyIcon type={introEnemy} size={22} /> New enemy: {ENEMIES[introEnemy].name}
                </span>
              )}
              {newModule && (
                <span>
                  <ModuleIcon type={newModule} size={22} /> New module: {MODULES[newModule].name}
                </span>
              )}
            </div>
          )}
          <div className="tc-routecard__foot">
            <Stars n={progress.routeStars[sel.id] || 0} size={20} />
            <button type="button" className="tc-btn tc-btn--primary" disabled={!unlocked} onClick={() => onPlay(sel.id)}>
              {unlocked ? (
                <>
                  <Icon name="play" size={16} /> {progress.routeStars[sel.id] ? "REPLAY" : "DEPART"}
                </>
              ) : (
                <>
                  <Icon name="lock" size={16} /> CLEAR ROUTE {sel.id - 1}
                </>
              )}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ================================================================ train screen */
export function TrainScreen({ progress, module, onModule, livery, onLivery, onBack, garage }) {
  const M = MODULES[module];
  const drag = useRef(null);
  const unlockedMods = progress.unlockedModules;
  const rows = M.id === "repair" ? [["Repair rate", (l) => `${stat("repair", "repairRate", l)} HP/s`], ["Reach", (l) => `±${stat("repair", "reach", l)} car`]] : [["Damage", (l) => stat(M.id, "damage", l)], ["Fire rate", (l) => `${stat(M.id, "attackSpeed", l)}/s`], ["Range", (l) => stat(M.id, "range", l)], ...(M.id === "cannon" ? [["Splash", (l) => stat("cannon", "splashRadius", l)]] : [])];
  const special = { gunner: "Fast tracers — best against riders and scouts.", cannon: "Splash damage — hits every enemy in the blast once. Shreds armour.", lancer: "Longest reach. Targets shooters and big threats first.", repair: "Welds the most damaged neighbouring car. Revives wrecked wagons." }[M.id];
  return (
    <div className="tc-screen tc-garage">
      <header className="tc-screen__head">
        <button type="button" className="tc-iconbtn" onClick={onBack} aria-label="Back">
          <Icon name="back" />
        </button>
        <h2>TRAIN</h2>
        <span className="tc-screen__meta">
          <Icon name="rotate" size={15} /> drag to rotate
        </span>
      </header>
      <div
        className="tc-garage__drag"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY };
          garage.drag = true;
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          garage.yaw -= (e.clientX - drag.current.x) * 0.008;
          garage.pitch = Math.max(-0.4, Math.min(1, garage.pitch - (e.clientY - drag.current.y) * 0.004));
          drag.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={() => {
          drag.current = null;
          garage.drag = false;
        }}
        onPointerCancel={() => {
          drag.current = null;
          garage.drag = false;
        }}
        aria-hidden="true"
      />
      <aside className="tc-garage__panel">
        <section>
          <h3>MODULES</h3>
          <div className="tc-garage__mods" role="tablist">
            {MODULE_IDS.map((id) => {
              const locked = !unlockedMods.includes(id);
              return (
                <button key={id} type="button" role="tab" aria-selected={module === id} className={`tc-modtab${module === id ? " is-on" : ""}${locked ? " is-locked" : ""}`} onClick={() => onModule(id)}>
                  <ModuleIcon type={id} size={28} />
                  <span>{MODULES[id].short}</span>
                  {locked && <Icon name="lock" size={12} />}
                </button>
              );
            })}
          </div>
          <div className="tc-modinfo">
            <strong>{M.name.toUpperCase()}</strong>
            <span className="tc-modinfo__role">{M.role}</span>
            <p>{M.blurb}</p>
            <table className="tc-stats tc-stats--wide">
              <thead>
                <tr>
                  <th />
                  <th>LV1</th>
                  <th>LV2</th>
                  <th>LV3</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([k, f]) => (
                  <tr key={k}>
                    <th>{k}</th>
                    <td>{f(1)}</td>
                    <td>{f(2)}</td>
                    <td>{f(3)}</td>
                  </tr>
                ))}
                <tr>
                  <th>Cost</th>
                  <td>{M.cost}</td>
                  <td>+{M.upgradeCost[0]}</td>
                  <td>+{M.upgradeCost[1]}</td>
                </tr>
              </tbody>
            </table>
            <p className="tc-modinfo__special">{special}</p>
            {!unlockedMods.includes(M.id) && <p className="tc-modinfo__lock">Unlocks on route {M.id === "cannon" ? "1 (second station)" : M.id === "lancer" ? 3 : 4}.</p>}
          </div>
        </section>
        <section>
          <h3>LIVERY</h3>
          <div className="tc-liveries">
            {LIVERIES.map((l) => {
              const have = progress.cosmetics.includes(l.id);
              return (
                <button key={l.id} type="button" className={`tc-livery${livery === l.id ? " is-on" : ""}${have ? "" : " is-locked"}`} disabled={!have} onClick={() => onLivery(l.id)} title={have ? l.name : `Clear route ${l.unlock.route} to unlock`} aria-pressed={livery === l.id}>
                  <span className="tc-livery__sw" style={{ background: `linear-gradient(135deg, ${l.body} 0 55%, ${l.trim} 55% 70%, ${l.dark} 70%)` }} />
                  <span className="tc-livery__name">{have ? l.name : `Route ${l.unlock.route}`}</span>
                  {!have && <Icon name="lock" size={12} />}
                </button>
              );
            })}
          </div>
        </section>
      </aside>
    </div>
  );
}

/* ================================================================ stats */
export function StatsScreen({ progress, onBack }) {
  const s = progress.statistics;
  const fav = favoriteModule(s);
  const items = useMemo(
    () => [
      ["Routes played", s.routesPlayed],
      ["Routes completed", s.routesCompleted],
      ["Routes failed", s.routesFailed],
      ["Stars earned", `${totalStars(progress)} / 90`],
      ["Distance travelled", fmtKm(s.distance)],
      ["Enemies defeated", s.enemiesDefeated],
      ["Vehicles destroyed", s.vehiclesDestroyed],
      ["Bosses defeated", s.bossesDefeated],
      ["Scrap earned", s.scrapEarned],
      ["Scrap spent", s.scrapSpent],
      ["Modules built", s.modulesBuilt],
      ["Modules upgraded", s.modulesUpgraded],
      ["Emergency repairs", s.repairs],
      ["Wagons lost", s.wagonsLost],
      ["Perfect routes", s.perfectRoutes],
      ["Favourite module", fav ? MODULES[fav].name : "—"],
      ["Total play time", fmtTime(s.playTime)],
    ],
    [s, fav, progress]
  );
  return (
    <div className="tc-screen tc-statsscr">
      <header className="tc-screen__head">
        <button type="button" className="tc-iconbtn" onClick={onBack} aria-label="Back">
          <Icon name="back" />
        </button>
        <h2>STATISTICS</h2>
      </header>
      <div className="tc-statgrid">
        {items.map(([k, v]) => (
          <div key={k} className="tc-stat">
            <span>{k}</span>
            <strong>{v}</strong>
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
    <div className={`tc-screen tc-settings${inGame ? " is-ingame" : ""}`}>
      <header className="tc-screen__head">
        <button type="button" className="tc-iconbtn" onClick={onBack} aria-label="Back">
          <Icon name="back" />
        </button>
        <h2>SETTINGS</h2>
      </header>
      <div className="tc-settings__grid">
        <section>
          <h3>AUDIO</h3>
          <Toggle label="Sound" value={settings.sound} onChange={set("sound")} />
          <Toggle label="Music" value={settings.music} onChange={set("music")} />
          <h3>GAMEPLAY</h3>
          <Segmented label="Default game speed" value={settings.speed} options={[[1, "1x"], [2, "2x"]]} onChange={set("speed")} />
          <Toggle label="Damage numbers" value={settings.damageNumbers} onChange={set("damageNumbers")} />
        </section>
        <section>
          <h3>GRAPHICS</h3>
          <Segmented label="Quality" value={settings.graphics} options={[["low", "LOW"], ["medium", "MEDIUM"], ["high", "HIGH"]]} onChange={set("graphics")} />
          <Toggle label="Particles" value={settings.particles} onChange={set("particles")} />
          <Toggle label="Shadows" value={settings.shadows} onChange={set("shadows")} hint={settings.graphics === "low" ? "off on LOW" : null} />
          <Toggle label="Camera motion" value={settings.cameraMotion} onChange={set("cameraMotion")} />
          <Toggle label="Camera shake" value={settings.cameraShake} onChange={set("cameraShake")} />
          <Toggle label="Reduced motion" value={settings.reducedMotion} onChange={set("reducedMotion")} />
        </section>
      </div>
    </div>
  );
}
