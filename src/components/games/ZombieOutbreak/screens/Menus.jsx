/**
 * Zombie Outbreak — menu screens: main menu, stage select (infected-zone
 * map), weapon select / loadout, statistics, settings and controls.
 */
import { useMemo, useState } from "react";
import MenuScene from "../three/MenuScene.jsx";
import WeaponPreview from "../three/WeaponPreview.jsx";
import { SettingsFields } from "./SettingsFields.jsx";
import { ControlsTable } from "../hud/Overlays.jsx";
import { ZONES, zoneOf } from "../data/zones.js";
import { getStage, TOTAL_STAGES } from "../data/stages.js";
import { WEAPONS, WEAPON_ORDER, weaponRatings } from "../data/weapons.js";
import { ZOMBIES, ENEMY_INFO, enemyDef } from "../data/enemies.js";
import { totalStars, unlockProgress } from "../engine/progression.js";

const fmt = (n) => Math.round(n).toLocaleString("en-US");

function Stars({ n, size = "" }) {
  return (
    <span className={`zo-minis ${size}`} aria-label={`${n} of 3 stars`}>
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= n ? "on" : ""}>
          ★
        </i>
      ))}
    </span>
  );
}

function ScreenHead({ title, kicker, onBack, right }) {
  return (
    <div className="zo-head">
      <button type="button" className="zo-back" onClick={onBack}>
        ‹ BACK
      </button>
      <div className="zo-head__titles">
        {kicker && <div className="zo-head__kicker">{kicker}</div>}
        <h2 className="zo-head__title">{title}</h2>
      </div>
      <div className="zo-head__right">{right}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ main menu */

export function MainMenu({ state, onPlay, onNav, onAnyClick }) {
  const next = Math.min(state.unlocked, TOTAL_STAGES);
  const fresh = Object.keys(state.completed).length === 0;
  const stars = totalStars(state);
  return (
    <div className="zo-menu" onPointerDown={onAnyClick}>
      <MenuScene />
      <div className="zo-menu__veil" />
      <div className="zo-menu__content">
        <div className="zo-logo">
          <span className="zo-logo__bio" aria-hidden="true">☣</span>
          <h1 className="zo-logo__title">
            ZOMBIE
            <br />
            OUTBREAK
          </h1>
          <div className="zo-logo__tag">AIM • SHOOT • SURVIVE</div>
        </div>
        <nav className="zo-menu__nav">
          <button type="button" className="zo-mbtn zo-mbtn--primary" onClick={() => onPlay(next)}>
            <span>{fresh ? "PLAY" : "CONTINUE"}</span>
            <small>
              Stage {next} · {getStage(next)?.name || "—"}
            </small>
          </button>
          <button type="button" className="zo-mbtn" onClick={() => onNav("stages")}>
            <span>STAGES</span>
            <small>
              {Object.keys(state.completed).length}/{TOTAL_STAGES} cleared · {stars}★
            </small>
          </button>
          <button type="button" className="zo-mbtn" onClick={() => onNav("weapons")}>
            <span>WEAPONS</span>
            <small>
              {state.weapons.length}/{WEAPON_ORDER.length} unlocked
              {state.weapons.some((w) => !state.seen.includes(w)) && <em className="zo-new">NEW</em>}
            </small>
          </button>
          <div className="zo-menu__row">
            <button type="button" className="zo-mbtn zo-mbtn--small" onClick={() => onNav("stats")}>
              STATISTICS
            </button>
            <button type="button" className="zo-mbtn zo-mbtn--small" onClick={() => onNav("settings")}>
              SETTINGS
            </button>
            <button type="button" className="zo-mbtn zo-mbtn--small" onClick={() => onNav("controls")}>
              CONTROLS
            </button>
          </div>
        </nav>
      </div>
      <div className="zo-menu__foot">Best score {fmt(state.stats.bestScore)} · {fmt(state.stats.kills)} zombies eliminated</div>
    </div>
  );
}

/* ------------------------------------------------------------------ stage select */

function threats(stage) {
  const s = new Set();
  for (const w of stage.waves) for (const [t] of w.groups) s.add(t);
  return [...s];
}

// Node positions (in a 600×340 map box) for the six stages of a zone.
const NODE_POS = [
  [70, 270],
  [170, 175],
  [290, 235],
  [380, 120],
  [480, 200],
  [545, 80],
];

export function StageSelect({ state, initial, onPick, onBack }) {
  const startStage = Math.min(initial || state.unlocked, TOTAL_STAGES);
  const [zoneIdx, setZoneIdx] = useState(ZONES.indexOf(zoneOf(startStage)));
  const [sel, setSel] = useState(startStage);
  const zone = ZONES[zoneIdx];
  const stage = getStage(sel);
  const unlocked = sel <= state.unlocked && !!stage;
  const boss = stage?.waves.find((w) => w.boss);
  return (
    <div className="zo-screen zo-screen--stages">
      <ScreenHead title="INFECTED ZONES" kicker="STAGE SELECT" onBack={onBack} right={<span className="zo-head__stars">{totalStars(state)} ★</span>} />
      <div className="zo-stages">
        <div className="zo-zones">
          {ZONES.map((z, i) => {
            const open = z.first <= state.unlocked;
            const cleared = Array.from({ length: 6 }, (_, k) => z.first + k).filter((id) => state.completed[id]).length;
            const st = Array.from({ length: 6 }, (_, k) => state.stars[z.first + k] || 0).reduce((a, b) => a + b, 0);
            return (
              <button
                key={z.id}
                type="button"
                className={`zo-zone${i === zoneIdx ? " zo-zone--on" : ""}${open ? "" : " zo-zone--locked"}`}
                style={{ "--zc": z.color }}
                onClick={() => {
                  setZoneIdx(i);
                  setSel(Math.min(Math.max(z.first, Math.min(state.unlocked, z.first + 5)), z.first + 5));
                }}
              >
                <span className="zo-zone__code">{z.code}</span>
                <span className="zo-zone__name">{z.name}</span>
                <span className="zo-zone__prog">{open ? `${cleared}/6 · ${st}★` : "LOCKED"}</span>
              </button>
            );
          })}
        </div>
        <div className="zo-map" style={{ "--zc": zone.color }}>
          <div className={`zo-map__bg zo-map__bg--${zone.id}`} />
          <svg className="zo-map__svg" viewBox="0 0 600 340" preserveAspectRatio="xMidYMid meet">
            <path
              d={`M ${NODE_POS.map(([x, y]) => `${x} ${y}`).join(" L ")}`}
              className="zo-map__path"
            />
            {NODE_POS.map(([x, y], k) => {
              const id = zone.first + k;
              const s = getStage(id);
              const open = id <= state.unlocked && !!s;
              const isBoss = s?.waves.some((w) => w.boss);
              const on = sel === id;
              return (
                <g key={id} className={`zo-node${open ? "" : " zo-node--locked"}${on ? " zo-node--on" : ""}${state.completed[id] ? " zo-node--done" : ""}`} transform={`translate(${x} ${y})`} onClick={() => setSel(id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setSel(id)}>
                  <circle r={isBoss ? 25 : 19} className="zo-node__ring" />
                  <circle r={isBoss ? 18 : 13} className="zo-node__core" />
                  <text className="zo-node__num" y="5">
                    {open ? id : "🔒"}
                  </text>
                  {isBoss && (
                    <text className="zo-node__boss" y="-32">
                      BOSS
                    </text>
                  )}
                  {open && (
                    <text className="zo-node__stars" y={isBoss ? 44 : 38}>
                      {"★".repeat(state.stars[id] || 0)}
                      {"☆".repeat(3 - (state.stars[id] || 0))}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          <div className="zo-map__label">
            {zone.code} · {zone.name.toUpperCase()}
            <small>{zone.blurb}</small>
          </div>
        </div>
        <div className="zo-detail">
          {stage ? (
            <>
              <div className="zo-detail__kicker">STAGE {stage.id}</div>
              <h3 className="zo-detail__title">{stage.name}</h3>
              <p className="zo-detail__brief">{stage.brief}</p>
              <div className="zo-detail__facts">
                <div>
                  <span>Waves</span>
                  <b>{stage.waves.length}</b>
                </div>
                <div>
                  <span>Best</span>
                  <b>{state.best[stage.id] ? fmt(state.best[stage.id]) : "—"}</b>
                </div>
                <div>
                  <span>Stars</span>
                  <b>
                    <Stars n={state.stars[stage.id] || 0} />
                  </b>
                </div>
              </div>
              <div className="zo-detail__threats">
                {threats(stage).map((t) => (
                  <span key={t} className={`zo-chip zo-chip--${t}`} title={ENEMY_INFO[t]}>
                    {ZOMBIES[t]?.name}
                  </span>
                ))}
                {boss && <span className="zo-chip zo-chip--boss">{enemyDef(boss.boss).name}</span>}
              </div>
              <div className="zo-detail__rules">
                ★★ finish with {stage.stars?.hp ?? 50}+ health · ★★★ and {Math.round((stage.stars?.acc ?? 0.4) * 100)}%+ accuracy
              </div>
              <button type="button" className="zo-btn zo-btn--primary zo-btn--wide" disabled={!unlocked} onClick={() => onPick(stage.id)}>
                {unlocked ? "CHOOSE LOADOUT & DEPLOY" : `CLEAR STAGE ${stage.id - 1} TO UNLOCK`}
              </button>
            </>
          ) : (
            <div className="zo-detail__empty">Stage {sel} is locked.</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ weapon select */

function StatBar({ label, value, text }) {
  return (
    <div className="zo-stat">
      <span className="zo-stat__label">{label}</span>
      <div className="zo-stat__track">
        <div className="zo-stat__fill" style={{ transform: `scaleX(${value})` }} />
      </div>
      <span className="zo-stat__val">{text}</span>
    </div>
  );
}

export function WeaponSelect({ state, stageId, onLoadout, onDeploy, onBack }) {
  const [sel, setSel] = useState(state.loadout[0] || "pistol");
  const w = WEAPONS[sel];
  const owned = state.weapons.includes(sel);
  const r = useMemo(() => weaponRatings(w), [w]);
  const inLoadout = state.loadout.includes(sel);
  const toggle = () => {
    if (!owned) return;
    if (inLoadout) {
      if (state.loadout.length > 1) onLoadout(state.loadout.filter((x) => x !== sel));
    } else if (state.loadout.length < 3) onLoadout([...state.loadout, sel]);
    else onLoadout([...state.loadout.slice(0, 2), sel]);
  };
  const stage = stageId ? getStage(stageId) : null;
  return (
    <div className="zo-screen zo-screen--weapons">
      <ScreenHead title={stage ? "LOADOUT" : "ARMORY"} kicker={stage ? `STAGE ${stage.id} · ${stage.name.toUpperCase()}` : "WEAPON SELECT"} onBack={onBack} />
      <div className="zo-armory">
        <div className="zo-wlist">
          {WEAPON_ORDER.map((id) => {
            const d = WEAPONS[id];
            const has = state.weapons.includes(id);
            const slot = state.loadout.indexOf(id);
            return (
              <button key={id} type="button" className={`zo-wcard${sel === id ? " zo-wcard--on" : ""}${has ? "" : " zo-wcard--locked"}`} onClick={() => setSel(id)}>
                <span className="zo-wcard__kind">{d.kind}</span>
                <span className="zo-wcard__name">{d.name}</span>
                {has ? slot >= 0 ? <span className="zo-wcard__slot">SLOT {slot + 1}</span> : !state.seen.includes(id) ? <span className="zo-new">NEW</span> : null : <span className="zo-wcard__lock">🔒</span>}
              </button>
            );
          })}
        </div>
        <div className="zo-wview">
          <WeaponPreview id={sel} locked={!owned} />
          <div className="zo-wview__name">
            <span>{w.kind}</span>
            {w.name}
          </div>
          <p className="zo-wview__blurb">{w.blurb}</p>
        </div>
        <div className="zo-wstats">
          <StatBar label="Damage" value={r.damage} text={w.pellets > 1 ? `${w.damage}×${w.pellets}` : w.splash ? `${w.damage}+${w.splash.damage}` : w.damage} />
          <StatBar label="Fire rate" value={r.fireRate} text={`${w.rpm} rpm`} />
          <StatBar label="Accuracy" value={r.accuracy} text={`${Math.round(r.accuracy * 100)}`} />
          <StatBar label="Magazine" value={r.capacity} text={w.mag} />
          <div className="zo-wstats__misc">
            <span>
              Reload <b>{w.reloadMode === "shell" ? `${w.reload}s / shell` : `${w.reload}s`}</b>
            </span>
            <span>
              Mode <b>{w.mode === "auto" ? "Automatic" : "Semi-auto"}</b>
            </span>
            {w.pierce > 0 && (
              <span>
                <b>Pierces</b> one target
              </span>
            )}
            {w.splash && (
              <span>
                <b>Explodes</b> on impact
              </span>
            )}
          </div>
          {!owned ? (
            <div className="zo-wlock">
              <div className="zo-wlock__title">LOCKED</div>
              <div>{w.unlock.text}</div>
              <div className="zo-wlock__bar">
                <div style={{ transform: `scaleX(${unlockProgress(state, sel)})` }} />
              </div>
            </div>
          ) : (
            <button type="button" className={`zo-btn zo-btn--wide${inLoadout ? "" : " zo-btn--primary"}`} onClick={toggle} disabled={inLoadout && state.loadout.length <= 1}>
              {inLoadout ? (state.loadout.length <= 1 ? "EQUIPPED (LAST SLOT)" : "REMOVE FROM LOADOUT") : state.loadout.length < 3 ? "EQUIP" : "EQUIP (REPLACES SLOT 3)"}
            </button>
          )}
          <div className="zo-loadout">
            <div className="zo-loadout__head">LOADOUT · keys 1 / 2 / 3</div>
            {[0, 1, 2].map((i) => {
              const id = state.loadout[i];
              return (
                <div key={i} className={`zo-lslot${id ? "" : " zo-lslot--empty"}`} onClick={() => id && setSel(id)}>
                  <b>{i + 1}</b>
                  {id ? WEAPONS[id].name : "Empty"}
                </div>
              );
            })}
          </div>
          {stage && (
            <button type="button" className="zo-btn zo-btn--primary zo-btn--wide zo-btn--deploy" onClick={onDeploy}>
              DEPLOY ›
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ statistics */

export function Statistics({ state, onBack }) {
  const s = state.stats;
  const acc = s.shots ? s.hits / s.shots : 0;
  const t = s.time;
  const rows = [
    ["Stages completed", `${s.stagesCompleted} / ${TOTAL_STAGES}`],
    ["Total stars", `${totalStars(state)} / ${TOTAL_STAGES * 3}`],
    ["Waves survived", fmt(s.waves)],
    ["Zombies eliminated", fmt(s.kills)],
    ["Headshots", fmt(s.headshots)],
    ["Shots fired", fmt(s.shots)],
    ["Accuracy", `${Math.round(acc * 100)}%`],
    ["Bosses defeated", fmt(s.bosses)],
    ["Weapons unlocked", `${state.weapons.length} / ${WEAPON_ORDER.length}`],
    ["Total survival time", `${Math.floor(t / 3600)}h ${Math.floor((t % 3600) / 60)}m ${Math.floor(t % 60)}s`],
    ["Best score", fmt(s.bestScore)],
    ["Deaths", fmt(s.deaths)],
  ];
  return (
    <div className="zo-screen">
      <ScreenHead title="STATISTICS" kicker="SURVIVOR RECORD" onBack={onBack} />
      <div className="zo-statgrid">
        {rows.map(([k, v]) => (
          <div key={k} className="zo-statcell">
            <span>{k}</span>
            <b>{v}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SettingsScreen({ settings, onChange, muted, onBack, onReset }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="zo-screen">
      <ScreenHead title="SETTINGS" onBack={onBack} />
      <div className="zo-scroll">
        <SettingsFields settings={settings} onChange={onChange} muted={muted} />
        <div className="zo-danger">
          {confirm ? (
            <>
              <span>Erase all progress, stars and unlocks?</span>
              <button type="button" className="zo-btn zo-btn--danger" onClick={onReset}>
                ERASE
              </button>
              <button type="button" className="zo-btn" onClick={() => setConfirm(false)}>
                CANCEL
              </button>
            </>
          ) : (
            <button type="button" className="zo-btn zo-btn--dim" onClick={() => setConfirm(true)}>
              RESET PROGRESS…
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ControlsScreen({ onBack }) {
  return (
    <div className="zo-screen">
      <ScreenHead title="CONTROLS" onBack={onBack} />
      <div className="zo-scroll zo-scroll--center">
        <ControlsTable />
        <p className="zo-hint">Click the game view to capture the mouse. Esc releases it and pauses. Mute, Restart and Fullscreen are in the Game Center bar above the game.</p>
      </div>
    </div>
  );
}
