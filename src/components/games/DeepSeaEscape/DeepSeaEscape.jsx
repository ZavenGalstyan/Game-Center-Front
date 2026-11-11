/**
 * Deep Sea Escape: Abyss Facility — a first-person 3D escape-room adventure
 * with RPG progression, underwater shooter combat and oxygen management
 * across 20 levels of a damaged research facility on the ocean floor.
 *
 * One requestAnimationFrame loop steps the simulation (engine/sim.js) in
 * ≤1/60 s slices and draws it with plain Three.js (render/world.js); sound is
 * procedural WebAudio (audio.js). React renders only menus, overlays and a
 * HUD whose values are pushed when they change — walking and looking never
 * re-render React.
 *
 * All visible text is English source text: the Game Center's runtime
 * translator (i18n/gameTranslator.js + i18n/games/DeepSeaEscape.json) swaps it
 * for Russian in place when the site language is Russian, and back again.
 * Sentences are kept whole in single text nodes so they translate as a unit.
 *
 * Controls: WASD move / swim · mouse look (Pointer Lock) · LMB shoot · RMB
 * aim · R reload · E interact · Shift sprint / swim faster · Space jump /
 * swim up · Ctrl or C swim down · 1–4 / wheel weapons · F Shock Pulse · Q
 * medkit · I inventory · H hint · Esc pause. `restartSignal` (Game Center
 * Restart) restarts the level; `muted` silences audio. DEV hook: `?dsetest=1`
 * fakes pointer lock, disables rAF and exposes window.__dse (tools/harness.mjs).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./DeepSeaEscape.css";
import { createSim, defaultLoadout } from "./engine/sim.js";
import { getLevel, LEVELS, LEVEL_COUNT } from "./engine/levels.js";
import { ZONES, WEAPONS, WEAPON_ORDER, WEAPON_LEVEL, UPGRADES, UPGRADE_ORDER, MODS, MOD_DESC, ENEMIES, RELICS, RELIC_ORDER, ABILITY, statsFor } from "./engine/constants.js";
import { ITEMS, COLORS, COLOR_NAMES } from "./engine/items.js";
import { createWorld } from "./render/world.js";
import { audio } from "./audio.js";
import { loadProgress, saveProgress, recordCompletion, hasProgress, loadSettings, saveSettings, emptyProgress, addXp, addRelic, buyUpgrade, buyMod, refundUpgrades, rankFor } from "./progress.js";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("dsetest");
const TOUCH = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(pointer: fine)").matches;
const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight", "Space", "ControlLeft", "ControlRight", "KeyC"]);
const STEP = 1 / 60;

const fmt = (s) => {
  s = Math.max(0, s || 0);
  const m = Math.floor(s / 60);
  const r = Math.floor(s - m * 60);
  return `${m}:${r < 10 ? "0" : ""}${r}`;
};
const pad2 = (n) => String(n).padStart(2, "0");

const DIR_LABEL = { n: "North", e: "East", s: "South", w: "West", ne: "North-east", nw: "North-west", se: "South-east", sw: "South-west" };
const DIR_ANGLE = { n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315 };
const BOARD_DIR = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

/* ------------------------------------------------------------------ icons */
const Arrow = ({ dir }) => (
  <svg viewBox="0 0 40 40" className="dse-arrow" aria-hidden="true" style={{ transform: `rotate(${DIR_ANGLE[dir] || 0}deg)` }}>
    <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="2" />
    <path d="M20 5 L29 20 L23 20 L23 33 L17 33 L17 20 L11 20 Z" fill="currentColor" />
  </svg>
);
const Logo = ({ className = "dse-logo" }) => (
  <svg viewBox="0 0 100 100" aria-hidden="true" className={className}>
    <defs>
      <radialGradient id="dseg" cx="50%" cy="35%" r="70%">
        <stop offset="0%" stopColor="#d8fbff" />
        <stop offset="55%" stopColor="#3ad8ff" />
        <stop offset="100%" stopColor="#0a3a5a" />
      </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="47" fill="#02101a" stroke="url(#dseg)" strokeWidth="4" />
    {/* a diving helmet porthole with bubbles */}
    <circle cx="50" cy="54" r="24" fill="none" stroke="url(#dseg)" strokeWidth="6" />
    <circle cx="50" cy="54" r="15" fill="url(#dseg)" opacity="0.35" />
    {[0, 1, 2, 3].map((i) => (
      <circle key={i} cx={50 + (i % 2 ? 5 : -4)} cy={26 - i * 6} r={3.6 - i * 0.6} fill="none" stroke="#bff4ff" strokeWidth="2" />
    ))}
    {[-1, 1].map((s) => (
      <rect key={s} x={50 + s * 29 - 3} y="48" width="6" height="12" rx="2" fill="url(#dseg)" />
    ))}
  </svg>
);
const LockIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="dse-ico">
    <path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" strokeWidth="2" />
    <rect x="5" y="10" width="14" height="10" rx="2" fill="currentColor" />
  </svg>
);
const ITEM_ICON = {
  card: "M2 5h16v10H2zm2 2v2h4V7zm0 5v1h12v-1z",
  fuse: "M7 3h6v2h-1v10h1v2H7v-2h1V5H7zm2 3v8h2V6z",
  battery: "M7 2h6v2h2v15H5V4h2zm1 6v8h4V8z",
  filter: "M4 4h12v3H4zm1 4h10v4H5zm-1 5h12v3H4z",
  valve: "M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm0 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm-1 1h2v8H9zM6 9h8v2H6z",
  part: "M9 1h2l.6 2.6 2-1.2 1.5 1.5-1.2 2L17 9v2l-2.6.6 1.2 2-1.5 1.5-2-1.2L11 17H9l-.6-2.6-2 1.2-1.5-1.5 1.2-2L3 11V9l2.6-.6-1.2-2 1.5-1.5 2 1.2zm1 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  sample: "M8 1h4v2h-1v11a1 1 0 0 1-2 0V3H8zm1 7v6h2V8z",
  reflector: "M10 1l7 9-7 9-7-9z",
  heal: "M3 5h14v11H3zm6 2v3H6v2h3v3h2v-3h3v-2h-3V7z",
  o2: "M8 1h4v2h1a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h1zm-1 8v6h6V9z",
  note: "M4 2h12v16H4zm2 3v1h8V5zm0 3v1h8V8zm0 3v1h6v-1z",
  armor: "M10 1l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V4z",
  ammo: "M3 7h14v9H3zm2-3h4v3H5zm6 0h4v3h-4z",
};
const RELIC_ICON = {
  pearl: "M10 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm-2 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  crystal: "M10 1l5 7-5 11-5-11z",
  coral: "M9 19v-6L5 9V4h2v4l2 2V2h2v8l2-2V4h2v5l-4 4v6z",
  lens: "M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm0 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  weave: "M2 6c4-4 6 4 10 0s6 4 6 4-2 4-6 0-6 4-10 0zm0 6c4-4 6 4 10 0s6 4 6 4-2 4-6 0-6 4-10 0z",
  med: "M3 5h14v11H3zm6 2v3H6v2h3v3h2v-3h3v-2h-3V7z",
  chip: "M6 6h8v8H6zM3 7h2v1H3zm0 3h2v1H3zm0 3h2v1H3zm12-6h2v1h-2zm0 3h2v1h-2zm0 3h2v1h-2zM7 3h1v2H7zm3 0h1v2h-1zm3 0h1v2h-1zM7 15h1v2H7zm3 0h1v2h-1zm3 0h1v2h-1z",
  scale: "M10 1c5 3 7 8 6 13l-6 5-6-5C3 9 5 4 10 1zm0 5c-2 2-3 4-3 7l3 2 3-2c0-3-1-5-3-7z",
};
function RelicIcon({ id, className = "dse-relic__glyph" }) {
  const r = RELICS[id];
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      <path d={RELIC_ICON[r.icon]} fillRule="evenodd" fill="currentColor" />
    </svg>
  );
}
function ItemIcon({ id }) {
  const it = ITEMS[id];
  if (!it) return null;
  if (it.kind === "relic") return <RelicIcon id={id} className="dse-icon dse-icon--relic" />;
  const d = id.endsWith("Card") ? ITEM_ICON.card : ITEM_ICON[id] || ITEM_ICON[it.kind] || ITEM_ICON.card;
  return (
    <svg viewBox="0 0 20 20" className="dse-icon" aria-hidden="true">
      <path d={d} fillRule="evenodd" fill={it.color} />
    </svg>
  );
}
const ShockIcon = ({ className }) => (
  <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
    <path d="M11 1L4 11h5l-1 8 7-10h-5z" fill="currentColor" />
  </svg>
);

/* ------------------------------------------------------------------ panels */
function Controls() {
  return (
    <dl className="dse-keys">
      <dt>W A S D</dt>
      <dd>Move / swim</dd>
      <dt>Mouse</dt>
      <dd>Look around (look up or down while swimming forward to steer)</dd>
      <dt>Left click</dt>
      <dd>Shoot</dd>
      <dt>Right click</dt>
      <dd>Aim</dd>
      <dt>R</dt>
      <dd>Reload</dd>
      <dt>E</dt>
      <dd>Interact / collect</dd>
      <dt>Shift</dt>
      <dd>Sprint / swim faster</dd>
      <dt>Space</dt>
      <dd>Jump / swim up</dd>
      <dt>Ctrl or C</dt>
      <dd>Swim down</dd>
      <dt>1 – 4</dt>
      <dd>Switch weapons (mouse wheel too)</dd>
      <dt>F</dt>
      <dd>Shock Pulse (ability)</dd>
      <dt>Q</dt>
      <dd>Use a medkit</dd>
      <dt>I</dt>
      <dd>Inventory</dd>
      <dt>H</dt>
      <dd>Show a hint</dd>
      <dt>Esc</dt>
      <dd>Pause and release the mouse</dd>
    </dl>
  );
}

function HowTo({ onBack }) {
  return (
    <div className="dse-panel dse-howto" role="dialog" aria-label="How to Play">
      <h2>How to Play</h2>
      <div className="dse-howto__cols">
        <section>
          <h3>Your goal</h3>
          <p>Every sector of the Abyss Facility is sealed. Solve its puzzles, survive its mutants and reach the lift — until you board the escape submarine and reach the surface.</p>
          <h3>Escape puzzles</h3>
          <ul>
            <li>Read notes, terminals, signs and schematics — they hold codes, colours, directions and pressure readings.</li>
            <li>Security keypads need a four-digit code. Some codes are split across several rooms.</li>
            <li>Restore power: fit power cells and fuses, start generators and throw breakers.</li>
            <li>Open valves in the right order, set pressure gauges to safe readings and turn antenna dishes.</li>
            <li>Reroute pipe junction boards so the flow reaches every outlet. Drained chambers open sealed bulkheads.</li>
            <li>Turn reflectors to guide lasers into receivers. Push cargo crates onto heavy pressure pads.</li>
            <li>Keycards open security doors. Loose maintenance hatches hide secrets.</li>
          </ul>
        </section>
        <section>
          <h3>Oxygen and swimming</h3>
          <ul>
            <li>Flooded sections are held back by glowing containment fields — swim straight through them.</li>
            <li>Your oxygen drains only while your head is underwater. Surface where the water stops below the ceiling to breathe.</li>
            <li>Refill at oxygen stations or grab oxygen tanks. At zero oxygen you start to drown.</li>
          </ul>
          <h3>Combat</h3>
          <ul>
            <li>Security Pistol: accurate, unlimited reserve. Harpoon Launcher: heavy, staggers, extra damage underwater.</li>
            <li>Pulse Rifle: automatic energy fire, overloads drones. Abyss Cannon: piercing beam that bursts on impact.</li>
            <li>Some conduits can only be charged by the Pulse Rifle or the Abyss Cannon. Shock Pulse (F) stuns everything around you.</li>
            <li>Armor absorbs part of every hit. Press Q to use a medkit. You return to the last checkpoint if you fall.</li>
          </ul>
          <h3>Progression</h3>
          <ul>
            <li>Mutants, puzzles and finished levels give XP. Every rank gives an upgrade point for your suit or your weapons.</li>
            <li>Eight research artifacts are hidden in the facility. Each one grants a permanent bonus.</li>
          </ul>
        </section>
        <section>
          <h3>Controls</h3>
          <Controls />
          <p className="dse-dim">Click the view to capture the mouse. A keyboard and mouse are required.</p>
        </section>
      </div>
      <button type="button" className="dse-btn dse-btn--primary" onClick={onBack}>
        Back
      </button>
    </div>
  );
}

function Settings({ settings, onChange, onBack, onReset }) {
  const Toggle = ({ k, label }) => (
    <div className="dse-field">
      <span>{label}</span>
      <button type="button" className={`dse-toggle${settings[k] ? " is-on" : ""}`} aria-pressed={!!settings[k]} aria-label={label} onClick={() => onChange({ [k]: !settings[k] })}>
        {settings[k] ? "On" : "Off"}
      </button>
    </div>
  );
  return (
    <div className="dse-panel dse-settings" role="dialog" aria-label="Settings">
      <h2>Settings</h2>
      <label className="dse-field">
        <span>Mouse sensitivity</span>
        <input type="range" min="0.2" max="3" step="0.05" value={settings.sens} aria-label="Mouse sensitivity" onChange={(e) => onChange({ sens: Number(e.target.value) })} />
        <output>{settings.sens.toFixed(2)}</output>
      </label>
      <label className="dse-field">
        <span>Field of view</span>
        <input type="range" min="60" max="100" step="1" value={settings.fov} aria-label="Field of view" onChange={(e) => onChange({ fov: Number(e.target.value) })} />
        <output>{settings.fov}°</output>
      </label>
      <label className="dse-field">
        <span>Volume</span>
        <input type="range" min="0" max="1" step="0.05" value={settings.volume} aria-label="Volume" onChange={(e) => onChange({ volume: Number(e.target.value) })} />
        <output>{Math.round(settings.volume * 100)}%</output>
      </label>
      <Toggle k="invertY" label="Invert vertical look" />
      <div className="dse-field">
        <span>Sound</span>
        <button type="button" className={`dse-toggle${!settings.mute ? " is-on" : ""}`} aria-pressed={!settings.mute} aria-label="Sound" onClick={() => onChange({ mute: !settings.mute })}>
          {settings.mute ? "Off" : "On"}
        </button>
      </div>
      <Toggle k="hints" label="Tutorial tips" />
      <div className="dse-field">
        <span>Graphics</span>
        <div className="dse-seg" role="group" aria-label="Graphics">
          <button type="button" className={settings.quality === "high" ? "is-on" : ""} aria-pressed={settings.quality === "high"} onClick={() => onChange({ quality: "high" })}>
            High
          </button>
          <button type="button" className={settings.quality === "low" ? "is-on" : ""} aria-pressed={settings.quality === "low"} onClick={() => onChange({ quality: "low" })}>
            Fast
          </button>
        </div>
      </div>
      <div className="dse-settings__foot">
        {onReset && (
          <button type="button" className="dse-btn dse-btn--danger" onClick={onReset}>
            Reset progress
          </button>
        )}
        <button type="button" className="dse-btn dse-btn--primary" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

function Confirm({ title, text, yes, no, onYes, onNo }) {
  return (
    <div className="dse-screen dse-screen--dim">
      <div className="dse-panel dse-confirm" role="alertdialog" aria-label={title}>
        <h2>{title}</h2>
        <p>{text}</p>
        <div className="dse-row">
          <button type="button" className="dse-btn dse-btn--danger" onClick={onYes}>
            {yes}
          </button>
          <button type="button" className="dse-btn dse-btn--primary" onClick={onNo}>
            {no}
          </button>
        </div>
      </div>
    </div>
  );
}

function XpBar({ progress, compact = false }) {
  const r = rankFor(progress.xp);
  return (
    <div className={`dse-xp${compact ? " is-compact" : ""}`}>
      <div className="dse-xp__top">
        <span className="dse-xp__rank">{`Rank ${r.rank}`}</span>
        <span className="dse-xp__num">{`${r.into} / ${r.need} XP`}</span>
      </div>
      <div className="dse-xp__bar" role="progressbar" aria-label="Experience" aria-valuemin={0} aria-valuemax={r.need} aria-valuenow={r.into}>
        <i style={{ width: `${(r.into / r.need) * 100}%` }} />
      </div>
      {progress.points > 0 && <div className="dse-xp__pts">{`${progress.points} upgrade points available`}</div>}
    </div>
  );
}

function Artifacts({ relics }) {
  return (
    <div className="dse-relics" aria-label="Artifacts">
      {RELIC_ORDER.map((k) => {
        const r = RELICS[k];
        const got = relics.includes(k);
        return (
          <div key={k} className={`dse-relic${got ? " is-got" : ""}`} style={{ "--rc": r.color }}>
            <RelicIcon id={k} />
            <div>
              <div className="dse-relic__name">{got ? r.name : "Undiscovered artifact"}</div>
              <div className="dse-dim dse-small">{got ? r.desc : "Hidden somewhere in the facility."}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Pips({ n, max }) {
  return (
    <div className="dse-up__pips" aria-label={`${n} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={i < n ? "is-on" : ""} />
      ))}
    </div>
  );
}

function Upgrades({ progress, onBuy, onBuyMod, onRefund, onBack }) {
  const mods = progress.mods || {};
  const st = statsFor(progress.up, progress.relics, mods);
  const value = {
    vitality: `${st.maxHp} health`,
    armor: `${st.maxArmor} armor`,
    lungs: `${st.maxO2} s oxygen`,
    power: `+${Math.round((st.dmgMul - 1) * 100)}% damage`,
    agility: `+${Math.round((st.speedMul - 1) * 100)}% speed`,
  };
  const spent = Object.values(progress.up).reduce((a, b) => a + b, 0) + Object.values(mods).reduce((a, b) => a + b, 0);
  const owned = (w) => progress.unlocked > WEAPON_LEVEL[w] || !!progress.done[WEAPON_LEVEL[w]];
  return (
    <div className="dse-panel dse-upgrades" role="dialog" aria-label="Upgrades">
      <div className="dse-upgrades__head">
        <h2>Upgrades</h2>
        <XpBar progress={progress} />
      </div>
      <h3 className="dse-upgrades__sub">Diving suit</h3>
      <div className="dse-upgrades__grid">
        {UPGRADE_ORDER.map((k) => {
          const u = UPGRADES[k];
          const lvl = progress.up[k] || 0;
          const maxed = lvl >= u.max;
          return (
            <div key={k} className={`dse-up dse-up--${k}`}>
              <div className="dse-up__name">{u.name}</div>
              <div className="dse-up__desc">{u.desc}</div>
              <Pips n={lvl} max={u.max} />
              <div className="dse-up__val">{value[k]}</div>
              <button type="button" className="dse-btn dse-btn--primary" disabled={maxed || progress.points <= 0} onClick={() => onBuy(k)}>
                {maxed ? "Maxed" : "Upgrade"}
              </button>
            </div>
          );
        })}
      </div>
      <h3 className="dse-upgrades__sub">Weapon modifications</h3>
      <p className="dse-dim dse-small dse-upgrades__note">{MOD_DESC}</p>
      <div className="dse-upgrades__grid dse-upgrades__grid--mods">
        {WEAPON_ORDER.map((w) => {
          const lvl = mods[w] || 0;
          const maxed = lvl >= MODS[w].max;
          const has = owned(w);
          const m = st.mod[w];
          return (
            <div key={w} className={`dse-up dse-up--mod${has ? "" : " is-locked"}`}>
              <div className="dse-up__name">{has ? WEAPONS[w].name : "Unknown weapon"}</div>
              <div className="dse-up__desc">{has ? `Damage ${Math.round(WEAPONS[w].dmg * m.dmg)} · Magazine ${Math.round(WEAPONS[w].mag * m.mag)}` : `Found in level ${WEAPON_LEVEL[w]}.`}</div>
              <Pips n={lvl} max={MODS[w].max} />
              <button type="button" className="dse-btn dse-btn--primary" disabled={!has || maxed || progress.points <= 0} onClick={() => onBuyMod(w)}>
                {maxed ? "Maxed" : "Modify"}
              </button>
            </div>
          );
        })}
      </div>
      <h3 className="dse-upgrades__sub">{`Research artifacts · ${progress.relics.length} / ${RELIC_ORDER.length}`}</h3>
      <Artifacts relics={progress.relics} />
      <p className="dse-dim dse-small">Earn XP by defeating mutants, solving puzzles and finishing levels. Each new rank grants one upgrade point.</p>
      <div className="dse-row">
        <button type="button" className="dse-btn dse-btn--ghost" disabled={spent === 0} onClick={onRefund}>
          Refund all points
        </button>
        <button type="button" className="dse-btn dse-btn--primary" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

function LevelSelect({ progress, onPlay, onBack }) {
  return (
    <div className="dse-panel dse-levels" role="dialog" aria-label="Level Select">
      <div className="dse-levels__head">
        <h2>Level Select</h2>
        <span className="dse-dim">{`${Object.keys(progress.done).length} / ${LEVEL_COUNT} levels complete`}</span>
      </div>
      <div className="dse-levels__scroll">
        {ZONES.map((z) => (
          <section key={z.id} className="dse-zone" style={{ "--acc": z.accent }}>
            <h3>{z.name}</h3>
            <div className="dse-levels__grid">
              {LEVELS.filter((l) => l.zone === z.id).map((l) => {
                const locked = l.id > progress.unlocked;
                const done = progress.done[l.id];
                const boss = l.ents.some((e) => e.t === "enemy" && ENEMIES[e.kind].boss);
                return (
                  <button
                    key={l.id}
                    type="button"
                    className={`dse-lvl${locked ? " is-locked" : ""}${done ? " is-done" : ""}${boss ? " is-boss" : ""}`}
                    disabled={locked}
                    onClick={() => onPlay(l.id)}
                    aria-label={locked ? `Level ${l.id}, locked` : `Level ${l.id}: ${l.name}`}
                  >
                    <span className="dse-lvl__no">{pad2(l.id)}</span>
                    <span className="dse-lvl__name">{locked ? "Locked" : l.name}</span>
                    <span className="dse-lvl__meta">{locked ? <LockIcon /> : done ? <span>{`Best ${fmt(done.time)}`}</span> : boss ? <span>Boss</span> : <span>New</span>}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <button type="button" className="dse-btn dse-btn--primary" onClick={onBack}>
        Back
      </button>
    </div>
  );
}

function CluePanel({ clue, onClose }) {
  return (
    <div className="dse-screen dse-screen--dim">
      <div className="dse-panel dse-clue" role="dialog" aria-label={clue.title}>
        <h2>{clue.title}</h2>
        <p className="dse-clue__text">{clue.text}</p>
        {clue.digits?.length > 0 && (
          <div className="dse-clue__row dse-clue__digits" aria-label="Code">
            {clue.digits.map((d, i) => (
              <span key={i} className={`dse-digit${d === "?" ? " is-unknown" : ""}`}>
                {d}
              </span>
            ))}
          </div>
        )}
        {clue.colors?.length > 0 && (
          <div className="dse-clue__row">
            {clue.colors.map((c, i) => (
              <figure key={`${c}${i}`}>
                <span className="dse-swatch" style={{ background: COLORS[c], color: COLORS[c] }} />
                <figcaption>{`${i + 1}. ${COLOR_NAMES[c]}`}</figcaption>
              </figure>
            ))}
          </div>
        )}
        {clue.dirs?.length > 0 && (
          <div className="dse-clue__row">
            {clue.dirs.map((d, i) => (
              <figure key={`${d}${i}`}>
                <Arrow dir={d} />
                <figcaption>{DIR_LABEL[d]}</figcaption>
              </figure>
            ))}
          </div>
        )}
        {clue.gauges?.length > 0 && (
          <div className="dse-clue__row">
            {clue.gauges.map(([g, v]) => (
              <figure key={g} className="dse-gauge">
                <span className="dse-gauge__val">{v}</span>
                <figcaption>{`Gauge ${g}`}</figcaption>
              </figure>
            ))}
          </div>
        )}
        <button type="button" className="dse-btn dse-btn--primary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

/** Security keypad: type four digits and confirm. */
function Keypad({ onSubmit, onClose }) {
  const [code, setCode] = useState("");
  const [state, setState] = useState("idle"); // idle | bad | ok
  const codeRef = useRef("");
  const lockRef = useRef(false);
  const press = useCallback((d) => {
    if (lockRef.current || codeRef.current.length >= 4) return;
    audio.play("beep");
    setState("idle");
    codeRef.current += d;
    setCode(codeRef.current);
  }, []);
  const undo = useCallback(() => {
    codeRef.current = codeRef.current.slice(0, -1);
    setCode(codeRef.current);
    setState("idle");
  }, []);
  const enter = useCallback(() => {
    if (lockRef.current || codeRef.current.length < 4) return;
    const ok = onSubmit(codeRef.current);
    setState(ok ? "ok" : "bad");
    if (!ok) {
      codeRef.current = "";
      setCode("");
    } else lockRef.current = true;
  }, [onSubmit]);
  useEffect(() => {
    const down = (e) => {
      const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
      if (m) {
        e.preventDefault();
        press(m[1]);
      } else if (e.code === "Backspace") {
        e.preventDefault();
        undo();
      } else if (e.code === "Enter" || e.code === "NumpadEnter") {
        e.preventDefault();
        enter();
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [press, enter, undo]);
  return (
    <div className="dse-screen dse-screen--dim">
      <div className={`dse-panel dse-keypad is-${state}`} role="dialog" aria-label="Security Keypad">
        <h2>Security Keypad</h2>
        <div className="dse-keypad__display" aria-live="polite">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`dse-keypad__slot${code[i] ? " is-set" : ""}`}>
              {code[i] ?? ""}
            </span>
          ))}
        </div>
        <div className="dse-keypad__status">{state === "bad" ? "Access denied." : state === "ok" ? "Access granted." : "Enter the four-digit code."}</div>
        <div className="dse-keypad__grid">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button key={d} type="button" className="dse-kbtn" onClick={() => press(d)}>
              {d}
            </button>
          ))}
          <button type="button" className="dse-kbtn dse-kbtn--fn" onClick={undo} disabled={!code.length} aria-label="Erase">
            ⌫
          </button>
          <button type="button" className="dse-kbtn" onClick={() => press("0")}>
            0
          </button>
          <button type="button" className="dse-kbtn dse-kbtn--ok" onClick={enter} disabled={code.length < 4} aria-label="Confirm">
            ✓
          </button>
        </div>
        <button type="button" className="dse-btn dse-btn--ghost" onClick={onClose}>
          Step away
        </button>
      </div>
    </div>
  );
}

/** One pipe piece drawn as SVG: its openings toward the cell edges, wet pieces glow. */
function PipePiece({ open, wet, kind }) {
  return (
    <svg viewBox="0 0 60 60" className="dse-pipe__svg" aria-hidden="true">
      {open.map((d) => {
        const [dx, dy] = BOARD_DIR[d];
        return <line key={d} x1="30" y1="30" x2={30 + dx * 30} y2={30 + dy * 30} className="dse-pipe__tube" />;
      })}
      {open.map((d) => {
        const [dx, dy] = BOARD_DIR[d];
        return <line key={`w${d}`} x1="30" y1="30" x2={30 + dx * 30} y2={30 + dy * 30} className={`dse-pipe__flow${wet ? " is-wet" : ""}`} />;
      })}
      {kind === "S" && <circle cx="30" cy="30" r="13" className="dse-pipe__src" />}
      {kind === "E" && <rect x="17" y="17" width="26" height="26" rx="5" className={`dse-pipe__out${wet ? " is-wet" : ""}`} />}
      {kind !== "S" && kind !== "E" && <circle cx="30" cy="30" r="6.5" className="dse-pipe__joint" />}
    </svg>
  );
}

/** Pipe junction board: click a piece to rotate it until the flow reaches every outlet. */
function PipeBoard({ sim, boardId, onTurn, onClose }) {
  const [, force] = useState(0);
  const b = sim.boards[boardId];
  if (!b) return null;
  const outs = b.cells.filter((c) => c.ch === "E");
  const reached = outs.filter((c) => b.lit.has(c.y * b.w + c.x)).length;
  return (
    <div className="dse-screen dse-screen--dim">
      <div className={`dse-panel dse-pipes${b.solved ? " is-ok" : ""}`} role="dialog" aria-label="Pipe Junction Board">
        <h2>Pipe Junction Board</h2>
        <p className="dse-dim dse-small">Click a pipe section to rotate it. Route the flow from the source to every outlet.</p>
        <div className="dse-pipes__grid" style={{ gridTemplateColumns: `repeat(${b.w}, 1fr)` }}>
          {b.cells.map((c, i) => {
            const fixed = !"ILT".includes(c.ch);
            return (
              <button
                key={i}
                type="button"
                className={`dse-pipe${fixed ? " is-fixed" : ""}`}
                disabled={fixed || b.solved}
                aria-label={c.ch === "S" ? "Source" : c.ch === "E" ? "Outlet" : c.ch === "X" ? "Cross junction" : "Rotate pipe section"}
                onClick={() => {
                  onTurn(i);
                  force((n) => n + 1);
                }}
              >
                <PipePiece open={sim.pipeOpen(c)} wet={b.lit.has(i)} kind={c.ch} />
              </button>
            );
          })}
        </div>
        <div className="dse-pipes__status">{b.solved ? "Flow restored!" : `Outlets reached: ${reached} of ${outs.length}`}</div>
        <button type="button" className="dse-btn dse-btn--primary" onClick={onClose}>
          {b.solved ? "Done" : "Step away"}
        </button>
      </div>
    </div>
  );
}

function Inventory({ sim, relics, onRead, onHeal, onClose }) {
  const p = sim.player;
  const keys = sim.inv.filter((x) => ITEMS[x.item].kind !== "note");
  const notes = sim.inv.filter((x) => ITEMS[x.item].kind === "note");
  return (
    <div className="dse-screen dse-screen--dim">
      <div className="dse-panel dse-inv" role="dialog" aria-label="Inventory">
        <h2>Inventory</h2>
        <div className="dse-inv__cols">
          <section>
            <h3>Items</h3>
            {keys.length === 0 && notes.length === 0 ? <p className="dse-dim">You carry no keycards or equipment parts.</p> : null}
            <ul className="dse-inv__list">
              {keys.map((x, i) => (
                <li key={`${x.item}${i}`}>
                  <ItemIcon id={x.item} />
                  <div>
                    <div className="dse-inv__name">{ITEMS[x.item].name}</div>
                    <div className="dse-dim dse-small">{ITEMS[x.item].desc}</div>
                  </div>
                </li>
              ))}
              {notes.map((x, i) => (
                <li key={`n${i}`}>
                  <ItemIcon id="note" />
                  <div>
                    <div className="dse-inv__name">{sim.L.clues?.[x.clue]?.title || ITEMS.note.name}</div>
                    <div className="dse-dim dse-small">{ITEMS.note.desc}</div>
                  </div>
                  <button type="button" className="dse-btn" onClick={() => onRead(x.clue)}>
                    Read
                  </button>
                </li>
              ))}
              <li>
                <ItemIcon id="medkit" />
                <div>
                  <div className="dse-inv__name">{`Medkits × ${p.medkits}`}</div>
                  <div className="dse-dim dse-small">{ITEMS.medkit.desc}</div>
                </div>
                <button type="button" className="dse-btn" disabled={p.medkits <= 0 || p.hp >= p.maxHp} onClick={onHeal}>
                  Use
                </button>
              </li>
              <li>
                <ItemIcon id="o2tank" />
                <div>
                  <div className="dse-inv__name">{`Oxygen ${Math.ceil(p.o2)} / ${p.maxO2} s`}</div>
                  <div className="dse-dim dse-small">Oxygen drains only underwater. Surface, use an oxygen station or grab a tank to refill.</div>
                </div>
              </li>
            </ul>
            <h3>Research artifacts</h3>
            {relics.length === 0 ? (
              <p className="dse-dim">No artifacts found yet. Look behind maintenance hatches and in sealed cases.</p>
            ) : (
              <ul className="dse-inv__list">
                {relics.map((k) => (
                  <li key={k}>
                    <ItemIcon id={k} />
                    <div>
                      <div className="dse-inv__name">{RELICS[k].name}</div>
                      <div className="dse-dim dse-small">{RELICS[k].desc}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3>Weapons</h3>
            <ul className="dse-inv__list">
              {WEAPON_ORDER.map((w) => {
                const def = WEAPONS[w];
                const owned = p.weapons.includes(w);
                const m = sim.stats.mod?.[w] || { dmg: 1, mag: 1 };
                return (
                  <li key={w} className={owned ? "" : "is-missing"}>
                    <span className="dse-inv__slot">{def.slot}</span>
                    <div>
                      <div className="dse-inv__name">{owned ? def.name : "Not found yet"}</div>
                      {owned && <div className="dse-dim dse-small">{def.desc}</div>}
                      {owned && (
                        <div className="dse-inv__stats">
                          <span>{`Damage ${Math.round(def.dmg * sim.stats.dmgMul * m.dmg)}`}</span>
                          <span>{`Rate ${Math.round(60 / (def.rate * sim.stats.rateMul))}/min`}</span>
                          <span>{`Magazine ${Math.round(def.mag * m.mag)}`}</span>
                          <span>{def.ammo ? `Ammo ${p.mags[w]} + ${p.ammo[def.ammo]}` : `Ammo ${p.mags[w]} + ∞`}</span>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
              <li className={p.ability ? "" : "is-missing"}>
                <span className="dse-inv__slot">F</span>
                <div>
                  <div className="dse-inv__name">{p.ability ? "Shock Pulse" : "Ability not unlocked yet"}</div>
                  <div className="dse-dim dse-small">{p.ability ? `An electric burst stuns and damages every enemy within ${ABILITY.radius} m. Drones take extra damage. Cooldown ${Math.round(sim.stats.abilityCd)} s.` : `Unlocks at level ${ABILITY.level}.`}</div>
                </div>
              </li>
            </ul>
          </section>
        </div>
        <button type="button" className="dse-btn dse-btn--primary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

const DEATH_TEXT = {
  melee: "The mutants tore through your suit.",
  charge: "You were crushed by a charging mutant.",
  shock: "The live cables electrocuted you.",
  laser: "You were caught in the laser grid.",
  toxic: "The toxic leak filled your lungs.",
  blast: "You were caught in a gas canister explosion.",
  steam: "Scalding steam overwhelmed you.",
  fire: "An acid bolt burned through your suit.",
  drown: "Your oxygen ran out.",
  collapse: "The facility imploded with you inside.",
  hit: "You did not survive.",
};
/* ------------------------------------------------------------------ main */
export default function DeepSeaEscape({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const flashRef = useRef(null);
  const hitRef = useRef(null);
  const dmgRef = useRef(null);
  const worldRef = useRef(null);
  const simRef = useRef(null);
  const menuSimRef = useRef(null);
  const keys = useRef(new Set());
  const mouse = useRef({ fire: false, aim: false, pressT: -1, x: 0, y: 0 });
  const queued = useRef({ use: false, reload: false, jump: false, heal: false, ability: false, slot: 0, cycle: 0 });
  const lockedRef = useRef(false);
  const screenRef = useRef("menu");
  const overlayRef = useRef(null);
  const levelRef = useRef(1);
  const frame = useRef(() => {});
  const timers = useRef(new Set());
  const hudKey = useRef("");
  const settingsRef = useRef(loadSettings());
  const stepRef = useRef(0);
  const tickRef = useRef(0);
  const botRef = useRef(null);
  const clockRef = useRef(0);
  const levelXp = useRef(0);
  const keypadRef = useRef(null);
  const pipesRef = useRef(null);
  const underRef = useRef(false);

  const [screen, setScreenState] = useState("menu"); // menu | levels | upgrades | howto | settings | loading | play
  const [overlay, setOverlayState] = useState(null);
  const [settings, setSettings] = useState(settingsRef.current);
  const [progress, setProgress] = useState(loadProgress);
  const [level, setLevel] = useState(1);
  const [locked, setLocked] = useState(false);
  const [lockHint, setLockHint] = useState(false);
  const [noGL, setNoGL] = useState(false);
  const [hud, setHud] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [intro, setIntro] = useState(null);
  const [result, setResult] = useState(null);
  const [returnTo, setReturnTo] = useState("menu");
  const [clue, setClue] = useState(null);
  const [hintN, setHintN] = useState(1);
  const [death, setDeath] = useState(null);

  const setScreen = useCallback((s) => {
    screenRef.current = s;
    setScreenState(s);
  }, []);
  const setOverlay = useCallback((o) => {
    overlayRef.current = o;
    setOverlayState(o);
  }, []);
  const later = useCallback((fn, ms) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
    return id;
  }, []);
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
  }, []);
  const toast = useCallback(
    (text, kind = "") => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.filter((x) => x.text !== text).slice(-2), { id, text, kind }]);
      later(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "long" ? 5600 : 3000);
    },
    [later],
  );
  const flash = useCallback((cls) => {
    const el = flashRef.current;
    if (!el) return;
    el.className = "dse-flash";
    void el.offsetWidth;
    el.className = `dse-flash is-${cls}`;
  }, []);
  const pulse = useCallback((ref, cls) => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }, []);

  const progressRef = useRef(progress);
  progressRef.current = progress;
  const commitProgress = useCallback((p) => {
    progressRef.current = p;
    setProgress(p);
    saveProgress(p);
  }, []);

  /* ------------------------------------------------------------ pointer lock */
  const requestLock = useCallback(() => {
    if (TEST) {
      lockedRef.current = true;
      setLocked(true);
      if (overlayRef.current === "paused") setOverlay(null);
      return;
    }
    const el = rootRef.current;
    if (!el || document.pointerLockElement === el) return;
    try {
      const r = el.requestPointerLock?.();
      if (r && typeof r.catch === "function") r.catch(() => setLockHint(true));
    } catch {
      setLockHint(true);
    }
  }, [setOverlay]);
  const releaseLock = useCallback(() => {
    mouse.current.fire = mouse.current.aim = false;
    if (TEST) {
      lockedRef.current = false;
      setLocked(false);
      return;
    }
    try {
      if (document.pointerLockElement === rootRef.current) document.exitPointerLock?.();
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    const onChange = () => {
      const l = document.pointerLockElement === rootRef.current;
      lockedRef.current = l;
      setLocked(l);
      keys.current.clear();
      mouse.current.fire = mouse.current.aim = false;
      if (l) {
        setLockHint(false);
        if (overlayRef.current === "paused") setOverlay(null);
      } else if (screenRef.current === "play" && !overlayRef.current && simRef.current?.state === "play") {
        setOverlay("paused");
      }
    };
    const onErr = () => setLockHint(true);
    document.addEventListener("pointerlockchange", onChange);
    document.addEventListener("pointerlockerror", onErr);
    return () => {
      document.removeEventListener("pointerlockchange", onChange);
      document.removeEventListener("pointerlockerror", onErr);
      if (document.pointerLockElement === rootRef.current) document.exitPointerLock?.();
    };
  }, [setOverlay]);

  /* ------------------------------------------------------------ flow */
  const showMenuScene = useCallback(() => {
    const world = worldRef.current;
    if (!world) return;
    const L = getLevel(5);
    const s = createSim(L);
    s.player.x = 5.0;
    s.player.z = 5.0;
    s.player.pitch = 0.05;
    s.player.cur = null;
    menuSimRef.current = s;
    world.setLevel(L, s);
  }, []);

  const applyStats = useCallback((s, up, relics) => {
    if (!s) return;
    const st = statsFor(up, relics, progressRef.current.mods);
    const p = s.player;
    const dh = st.maxHp - p.maxHp;
    const dO = st.maxO2 - p.maxO2;
    Object.assign(s.stats, st);
    p.maxHp = st.maxHp;
    p.maxArmor = st.maxArmor;
    p.maxO2 = st.maxO2;
    if (dO > 0) p.o2 += dO;
    p.o2 = Math.min(p.o2, p.maxO2);
    if (dh > 0) p.hp += dh;
    p.hp = Math.min(p.hp, p.maxHp);
    p.armor = Math.min(p.armor, p.maxArmor);
  }, []);

  const newSim = useCallback((id) => createSim(getLevel(id), { stats: statsFor(progressRef.current.up, progressRef.current.relics, progressRef.current.mods), loadout: defaultLoadout(id) }), []);

  const startLevel = useCallback(
    (id) => {
      const world = worldRef.current;
      if (!world) return;
      clearTimers();
      audio.unlock();
      audio.setAlarm(false);
      const L = getLevel(id);
      levelRef.current = id;
      setLevel(id);
      setResult(null);
      setToasts([]);
      setClue(null);
      setDeath(null);
      setHintN(1);
      setOverlay(null);
      keys.current.clear();
      mouse.current = { fire: false, aim: false, pressT: -1, x: 0, y: 0 };
      queued.current = { use: false, reload: false, jump: false, heal: false, ability: false, slot: 0, cycle: 0 };
      levelXp.current = 0;
      setScreen("loading");
      requestLock();
      const begin = () => {
        const s = newSim(id);
        simRef.current = s;
        world.setLevel(L, s);
        hudKey.current = "";
        setHud(null);
        setScreen("play");
        setIntro({ id, key: Date.now() });
        later(() => setIntro(null), 4800);
        if (L.tip && settingsRef.current.hints) later(() => toast(L.tip, "long"), 1400);
        const fresh = WEAPON_ORDER.find((w) => id === WEAPON_LEVEL[w] + 1);
        if (fresh) later(() => toast(`Your arsenal now includes the ${WEAPONS[fresh].name}. Press ${WEAPONS[fresh].slot} to equip it.`), 6200);
        commitProgress({ ...progressRef.current, last: id });
      };
      if (TEST) begin();
      else later(begin, 450);
    },
    [clearTimers, commitProgress, later, newSim, requestLock, setOverlay, setScreen, toast],
  );
  const restartLevel = useCallback(() => {
    if (screenRef.current !== "play") return;
    const L = getLevel(levelRef.current);
    const s = newSim(levelRef.current);
    simRef.current = s;
    worldRef.current?.setLevel(L, s);
    hudKey.current = "";
    levelXp.current = 0;
    audio.setAlarm(false);
    setOverlay(null);
    setClue(null);
    setDeath(null);
    setToasts([]);
    keys.current.clear();
    flash("restart");
    requestLock();
  }, [flash, newSim, requestLock, setOverlay]);
  const respawn = useCallback(() => {
    const s = simRef.current;
    if (!s || s.state !== "dead") return;
    s.respawn();
    setDeath(null);
    setOverlay(null);
    flash("restart");
    audio.play("checkpoint");
    requestLock();
  }, [flash, requestLock, setOverlay]);

  const leaveLevel = useCallback(
    (to) => {
      clearTimers();
      releaseLock();
      audio.setAlarm(false);
      simRef.current = null;
      setOverlay(null);
      setIntro(null);
      setToasts([]);
      setClue(null);
      setDeath(null);
      setScreen(to);
      showMenuScene();
    },
    [clearTimers, releaseLock, setOverlay, setScreen, showMenuScene],
  );
  const toMenu = useCallback(() => leaveLevel("menu"), [leaveLevel]);
  const toLevels = useCallback(() => leaveLevel("levels"), [leaveLevel]);
  const toUpgrades = useCallback(() => {
    setReturnTo("menu");
    leaveLevel("upgrades");
  }, [leaveLevel]);

  const pause = useCallback(() => {
    if (screenRef.current !== "play" || overlayRef.current || simRef.current?.state !== "play") return;
    setOverlay("paused");
    releaseLock();
  }, [releaseLock, setOverlay]);
  const resume = useCallback(() => {
    setOverlay(null);
    setClue(null);
    keypadRef.current = null;
    pipesRef.current = null;
    requestLock();
  }, [requestLock, setOverlay]);
  const openOverlay = useCallback(
    (o) => {
      if (screenRef.current !== "play" || simRef.current?.state !== "play") return;
      keys.current.clear();
      setOverlay(o);
      releaseLock();
    },
    [releaseLock, setOverlay],
  );

  const complete = useCallback(() => {
    const s = simRef.current;
    if (!s) return;
    const id = levelRef.current;
    const { progress: next, best, prev, first } = recordCompletion(progressRef.current, id, s.t, s.counters.kills);
    commitProgress(next);
    setResult({ id, time: s.t, kills: s.counters.kills, total: s.enemies.filter((e) => !e.summoned).length, deaths: s.counters.deaths, secrets: s.counters.secrets, xp: levelXp.current, best, prev: prev?.time ?? null, first, acc: s.counters.shots ? Math.round((s.counters.hits / s.counters.shots) * 100) : 0 });
    releaseLock();
    audio.setAlarm(false);
    if (id === LEVEL_COUNT) {
      audio.play("victory");
      setOverlay("final");
    } else setOverlay("complete");
  }, [commitProgress, releaseLock, setOverlay]);

  /* ------------------------------------------------------------ sim events → audio / HUD */
  const handleEvents = useCallback(
    (s) => {
      const evs = s.events;
      if (!evs.length) return;
      s.events = [];
      const world = worldRef.current;
      const name = (id) => ITEMS[id]?.name || id;
      for (const e of evs) {
        world?.fx(e, s);
        switch (e.type) {
          case "shot":
            audio.play(e.weapon);
            if (e.hit) {
              pulse(hitRef, e.killed ? "is-kill" : e.crit ? "is-crit" : "is-hit");
              audio.play("hitmark");
            }
            mouse.current.pressT = -1;
            break;
          case "burst":
            audio.play("burst");
            break;
          case "dry":
            audio.play("dry");
            break;
          case "reload":
            audio.play("reload");
            break;
          case "reloaded":
            audio.play("reloaded");
            break;
          case "switch":
            if (e.weapon) audio.play("switch");
            else audio.play("click");
            if (e.id && e.hidden) toast("The maintenance hatch swings open — something is hidden here!", "good");
            break;
          case "impact":
            if (e.kind === "flesh") audio.play("flesh");
            else if (e.kind === "armor" || e.kind === "metal") audio.play("armorHit");
            break;
          case "jump":
            audio.play("jump");
            break;
          case "land":
            audio.play("land");
            break;
          case "pickup": {
            const it = ITEMS[e.item];
            if (it.kind === "ammo") {
              audio.play("ammo");
              toast(`${it.name} collected.`);
            } else if (it.kind === "key") {
              audio.play("card");
              toast(`${it.name} added to your inventory.`, "good");
            } else if (it.kind === "heal") {
              audio.play("pickup");
              toast("Medkit collected. Press Q to use it.");
            } else if (it.kind === "armor") {
              audio.play("pickup");
              toast("Armor plate: armor restored.");
            } else if (it.kind === "o2") {
              audio.play("o2Refill");
              toast("Oxygen tank: oxygen refilled.", "good");
            } else if (it.kind === "note") audio.play("pickup");
            break;
          }
          case "relic": {
            audio.play("relic");
            const next = addRelic(progressRef.current, e.relic);
            progressRef.current = next;
            setProgress(next);
            applyStats(s, next.up, next.relics);
            toast(`Artifact found: ${RELICS[e.relic].name}! ${RELICS[e.relic].desc}`, "level");
            break;
          }
          case "weaponGot":
            audio.play("weapon");
            toast(e.fresh ? `New weapon: ${name(e.item)}! Press ${WEAPONS[e.weapon].slot} to equip it.` : `${name(e.item)} charges collected.`, "good");
            break;
          case "open":
            audio.play(e.kind === "vault" || e.kind === "safe" ? "door" : "click");
            break;
          case "empty":
            toast("Nothing useful inside.");
            break;
          case "unlock":
            audio.play("codeOk");
            toast(`Access granted — ${name(e.item)} used.`, "good");
            break;
          case "needItem":
            audio.play("deny");
            toast(`Locked. You need: ${name(e.item)}.`, "bad");
            break;
          case "sealed":
            audio.play("deny");
            toast("Sealed. Solve this sector's puzzle to open it.", "bad");
            break;
          case "noPower":
            audio.play("deny");
            toast("No power. Something else must happen first.", "bad");
            break;
          case "keypad":
            if (botRef.current) break;
            audio.play("beep");
            keypadRef.current = e.id;
            keys.current.clear();
            setOverlay("keypad");
            releaseLock();
            break;
          case "codeOk":
            audio.play("solve");
            toast("Access granted — the code is accepted!", "good");
            break;
          case "pipes":
            if (botRef.current) break;
            audio.play("beep");
            pipesRef.current = e.board;
            keys.current.clear();
            setOverlay("pipes");
            releaseLock();
            break;
          case "pipeTurn":
            audio.play("valve");
            break;
          case "locked":
            audio.play("deny");
            toast("Locked electronically. Something else must happen first.", "bad");
            break;
          case "dive":
            audio.play("dive");
            break;
          case "wade":
            audio.play("wade");
            break;
          case "submerge":
            audio.setUnderwater(true);
            break;
          case "surface":
            audio.setUnderwater(false);
            audio.play(e.low ? "surface" : "bubbles");
            break;
          case "o2Low":
            audio.play("o2Low");
            flash("o2");
            toast("Oxygen low! Surface, find an oxygen station or grab a tank.", "bad");
            break;
          case "o2Refill":
            if (e.station) {
              audio.play("o2Refill");
              toast("Oxygen fully refilled.", "good");
            }
            break;
          case "drain":
            audio.play("drain");
            toast("The chamber is draining…", "good");
            break;
          case "drained":
            audio.play("doorClose");
            break;
          case "codeBad":
            audio.play("codeBad");
            break;
          case "panel":
            audio.play("panel");
            break;
          case "statueTurn":
            audio.play("rotate");
            break;
          case "push":
            audio.play("push");
            break;
          case "blocked":
            audio.play("deny");
            toast("The crate won't budge in that direction.", "bad");
            break;
          case "reset":
            audio.play("push");
            toast(e.moved ? "The cargo crates slide back to their marked spots." : "The cargo crates are already in place.");
            break;
          case "plate":
            audio.play("plate");
            break;
          case "solve":
            audio.play("solve");
            toast(
              e.kind === "seq" ? "Sequence complete — the valves hold!" : e.kind === "socket" ? "System restored!" : e.kind === "statue" ? "The dishes are aligned!" : e.kind === "pipes" ? "Flow restored through the junction!" : "Readings stable — the lock releases!",
              "good",
            );
            break;
          case "read": {
            const c = s.L.clues?.[e.clue];
            if (c && !botRef.current) {
              audio.play("pickup");
              setClue(c);
              keys.current.clear();
              setOverlay("clue");
              releaseLock();
            }
            break;
          }
          case "access":
            audio.play("codeOk");
            toast(e.msg || "Command accepted.", "good");
            break;
          case "repair":
            audio.play("solve");
            toast("Repaired. Use it again to activate it.", "good");
            break;
          case "place":
            audio.play("click");
            if (e.count > 1 && e.have < e.count) toast(`Installed: ${e.have} of ${e.count}.`);
            else if (e.item === "battery") toast("Power cell inserted. Now start it.", "good");
            else if (e.item === "reflector") toast("Beam reflector mounted.", "good");
            break;
          case "genOn":
            audio.play(s.byId[e.id]?.kind === "valve" ? "valve" : "gen");
            break;
          case "overload":
            audio.play("overload");
            flash("curse");
            toast("Wrong order — steam vents and the sequence resets!", "bad");
            break;
          case "rotate":
            audio.play("rotate");
            break;
          case "beamOn":
            audio.play("beam");
            toast("The laser hits the receiver!", "good");
            break;
          case "needWeapon":
            audio.play("deny");
            toast(e.by === "cannon" ? "Only the Abyss Cannon can wake this conduit." : "Only the Pulse Rifle can charge this conduit.", "bad");
            break;
          case "nodeCharged":
            audio.play("beam");
            toast(e.by === "cannon" ? "The abyss conduit awakens!" : "The energy conduit is charged!", "good");
            break;
          case "nodeDeflect":
            audio.play("armorHit");
            break;
          case "doorOpen":
            audio.play("door");
            if (e.secret) toast("A hidden compartment opens!", "good");
            break;
          case "doorClose":
            audio.play("doorClose");
            break;
          case "alert":
            audio.play(ENEMIES[e.kind]?.boss ? "growlBig" : ENEMIES[e.kind]?.move === "air" ? "drone" : "alert");
            break;
          case "wake":
            audio.play(ENEMIES[e.kind]?.boss ? "growlBig" : "rattle");
            if (ENEMIES[e.kind]?.boss) toast(`${ENEMIES[e.kind].name} awakens!`, "bad");
            break;
          case "attack":
            audio.play("attack");
            break;
          case "whiff":
            audio.play("whiff");
            break;
          case "roar":
            audio.play("growlBig");
            break;
          case "crash":
            audio.play("crash");
            break;
          case "spit":
          case "windup":
            audio.play("spit");
            break;
          case "splash":
            audio.play("splash");
            break;
          case "summon":
            audio.play("growlBig");
            toast("It is calling more mutants!", "bad");
            break;
          case "deflect":
            audio.play("armorHit");
            break;
          case "shieldUp":
            audio.play("overload");
            toast("A shield protects it! Solve the arena's puzzle to break it.", "bad");
            break;
          case "kill":
            audio.play("kill");
            if (e.boss) toast(`${ENEMIES[e.kind].name} is destroyed!`, "good");
            break;
          case "drop":
            toast("Something fell to the floor!", "good");
            break;
          case "explode":
            audio.play("explode");
            break;
          case "laserHit":
            audio.play(e.steam ? "valve" : "laser");
            break;
          case "spikeHit":
            audio.play("zap");
            break;
          case "ability":
            audio.play("ability");
            flash("ability");
            break;
          case "abilityFail":
            audio.play("deny");
            toast(e.locked ? `Shock Pulse unlocks at level ${ABILITY.level}.` : `Shock Pulse recharges in ${Math.ceil(e.left)} s.`);
            break;
          case "hurt":
            audio.play("hurt");
            flash(e.kind === "toxic" ? "acid" : e.kind === "drown" ? "o2" : "hurt");
            if (e.dir !== null && e.dir !== undefined && dmgRef.current) {
              dmgRef.current.style.setProperty("--a", `${-e.dir}rad`);
              pulse(dmgRef, "is-on");
            }
            break;
          case "heal":
            audio.play("heal");
            toast("You use a medkit.", "good");
            break;
          case "healFail":
            audio.play("deny");
            toast(e.none ? "No medkits left." : "Your health is already full.");
            break;
          case "death":
            audio.play("death");
            audio.setUnderwater(false);
            audio.setAlarm(false);
            flash("death");
            later(() => {
              if (simRef.current === s && s.state === "dead") {
                setDeath({ reason: DEATH_TEXT[e.kind] || DEATH_TEXT.hit });
                setOverlay("dead");
                releaseLock();
              }
            }, 1400);
            break;
          case "respawn":
            if (s.escape) audio.setAlarm(true);
            break;
          case "checkpoint":
            audio.play("checkpoint");
            toast("Checkpoint reached.", "good");
            break;
          case "trigger":
            if (e.cp) toast("Checkpoint reached.", "good");
            break;
          case "escapeStart":
            audio.play("siren");
            audio.setAlarm(true);
            flash("alarm");
            toast("THE FACILITY IS IMPLODING! Get to the escape submarine!", "long");
            break;
          case "xp": {
            levelXp.current += e.amount;
            const { progress: next, gained } = addXp(progressRef.current, e.amount);
            progressRef.current = next;
            setProgress(next);
            if (gained > 0) {
              audio.play("levelUp");
              toast(`Rank up! You reached rank ${next.rank}. Upgrade point earned.`, "level");
            }
            break;
          }
          case "complete":
            audio.play("complete");
            flash("complete");
            later(complete, 900);
            break;
          default:
            break;
        }
      }
    },
    [applyStats, complete, flash, later, pulse, releaseLock, setOverlay, toast],
  );

  /* ------------------------------------------------------------ world + loop */
  useEffect(() => {
    const stage = stageRef.current;
    let world;
    try {
      world = createWorld(stage, { preserve: TEST });
    } catch (err) {
      console.error("Deep Sea Escape: WebGL unavailable", err);
      setNoGL(true);
      return undefined;
    }
    worldRef.current = world;
    world.setFov(settingsRef.current.fov);
    world.setQuality(settingsRef.current.quality);
    const fit = () => {
      const r = stage.getBoundingClientRect();
      world.resize(Math.round(r.width), Math.round(r.height));
    };
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    window.addEventListener("resize", fit);
    fit();
    showMenuScene();
    let raf = 0,
      last = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      frame.current(dt);
    };
    if (!TEST) raf = requestAnimationFrame(loop);
    const tset = timers.current;
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", fit);
      tset.forEach(clearTimeout);
      tset.clear();
      world.dispose();
      worldRef.current = null;
      simRef.current = null;
      menuSimRef.current = null;
    };
  }, [showMenuScene]);

  frame.current = (dt) => {
    const world = worldRef.current;
    if (!world) return;
    clockRef.current += dt;
    if (screenRef.current === "play") {
      const s = simRef.current;
      if (!s) return world.render(null, dt);
      const running = !overlayRef.current && s.state !== "complete" && (lockedRef.current || botRef.current || s.state === "dead");
      if (running) {
        const k = keys.current;
        const n = Math.max(1, Math.ceil(dt / STEP - 1e-6));
        const h = dt / n;
        const sens = settingsRef.current.sens * 0.0022;
        for (let i = 0; i < n; i++) {
          let input;
          if (botRef.current) input = botRef.current(s);
          else {
            const m = mouse.current;
            input = {
              mz: (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0),
              mx: (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0),
              run: k.has("ShiftLeft") || k.has("ShiftRight"),
              up: k.has("Space"),
              down: k.has("ControlLeft") || k.has("ControlRight") || k.has("KeyC"),
              fire: m.fire,
              firePress: m.pressT >= 0 && clockRef.current - m.pressT < 0.25,
              aim: m.aim,
            };
            if (i === 0) {
              const q = queued.current;
              input.lookX = m.x * sens;
              input.lookY = m.y * sens * (settingsRef.current.invertY ? -1 : 1);
              m.x = m.y = 0;
              input.use = q.use;
              input.reload = q.reload;
              input.jump = q.jump || k.has("Space");
              input.heal = q.heal;
              input.ability = q.ability;
              input.slot = q.slot || 0;
              input.cycle = q.cycle || 0;
              queued.current = { use: false, reload: false, jump: false, heal: false, ability: false, slot: 0, cycle: 0 };
            }
          }
          s.update(h, input);
          handleEvents(s);
          if (s.state === "complete" || overlayRef.current) break;
        }
        const p = s.player;
        if (p.speed > 1 && p.ground && s.state === "play") {
          const stepN = Math.floor(p.bob / Math.PI);
          if (stepN !== stepRef.current) {
            stepRef.current = stepN;
            const t = s.tileAt(...s.playerCell());
            audio.play(t && t.wl > 0.2 ? "stepWet" : "step");
          }
        }
        if (s.escape && s.state === "play") {
          const sec = Math.ceil(s.escape.left);
          if (sec !== tickRef.current) {
            tickRef.current = sec;
            if (sec <= 10) audio.play("tick");
          }
        }
      } else if (s.events.length) handleEvents(s);
      const uw = !!world.isUnderwater?.();
      if (uw !== underRef.current) {
        underRef.current = uw;
        rootRef.current?.classList.toggle("is-underwater", uw);
      }
      pushHud(s);
      world.render(s, running ? dt : dt * 0.25, { hideWeapon: !!overlayRef.current && overlayRef.current !== "paused" });
    } else {
      const ms = menuSimRef.current;
      if (ms) {
        ms.t += dt;
        ms.player.yaw = -1.75 + Math.sin(ms.t * 0.09) * 0.55;
        ms.player.bob = 0;
        world.render(ms, dt);
      } else world.render(null, dt);
    }
  };

  /** HUD values → React, only when something visible changed. */
  function pushHud(s) {
    const p = s.player;
    const w = p.cur ? WEAPONS[p.cur] : null;
    const boss = s.enemies.find((e) => e.boss && !e.dead && e.state !== "dormant");
    const f = s.focus;
    const v = {
      hp: Math.ceil(p.hp),
      maxHp: p.maxHp,
      armor: Math.ceil(p.armor),
      maxArmor: p.maxArmor,
      med: p.medkits,
      cur: p.cur,
      mag: p.cur ? p.mags[p.cur] : 0,
      reserve: w?.ammo ? p.ammo[w.ammo] : -1,
      reloading: p.reloadT > 0,
      weapons: p.weapons.join(","),
      aim: p.aim > 0.5,
      focus: f ? `${f.verb}|${f.name}|${f.locked ? 1 : 0}` : "",
      inv: s.inv.map((x) => x.item).join(","),
      escape: s.escape && s.state !== "complete" ? Math.max(0, Math.ceil(s.escape.left)) : -1,
      ability: p.ability ? Math.ceil(p.abilityT) : -1,
      boss: boss ? `${boss.kind}|${Math.ceil((boss.hp / boss.max) * 100)}|${s.isShielded(boss) ? 1 : 0}` : "",
      low: p.hp < p.maxHp * 0.3,
      o2: Math.ceil(p.o2),
      maxO2: p.maxO2,
      under: p.under,
      o2low: p.under && p.o2 < p.maxO2 * 0.3,
    };
    const key = JSON.stringify(v);
    if (key !== hudKey.current) {
      hudKey.current = key;
      setHud(v);
    }
  }

  /* ------------------------------------------------------------ input */
  const actions = useRef({});
  actions.current = { pause, resume, openOverlay, respawn };
  useEffect(() => {
    const down = (e) => {
      if (screenRef.current !== "play") return;
      const ov = overlayRef.current;
      if (ov) {
        if ((ov === "inventory" && e.code === "KeyI") || (ov === "clue" && (e.code === "KeyE" || e.code === "Space")) || (ov === "hint" && e.code === "KeyH")) {
          e.preventDefault();
          actions.current.resume();
        } else if (e.code === "Escape" && (ov === "keypad" || ov === "pipes")) actions.current.resume();
        else if (e.code === "Escape" && TEST && ["paused", "clue", "inventory", "hint"].includes(ov)) actions.current.resume();
        else if (ov === "dead" && (e.code === "Enter" || e.code === "Space")) {
          e.preventDefault();
          actions.current.respawn();
        }
        return;
      }
      if (MOVE_KEYS.has(e.code)) {
        e.preventDefault();
        keys.current.add(e.code);
      }
      if (e.repeat) return;
      const q = queued.current;
      if (e.code === "KeyE") {
        e.preventDefault();
        q.use = true;
      } else if (e.code === "KeyR") {
        e.preventDefault();
        q.reload = true;
      } else if (e.code === "Space") {
        e.preventDefault();
        q.jump = true;
      } else if (e.code === "KeyQ") {
        e.preventDefault();
        q.heal = true;
      } else if (e.code === "KeyF") {
        e.preventDefault();
        q.ability = true;
      } else if (/^Digit[1-4]$/.test(e.code)) {
        e.preventDefault();
        q.slot = Number(e.code.slice(5));
      } else if (e.code === "KeyI" || e.code === "Tab") {
        e.preventDefault();
        actions.current.openOverlay("inventory");
      } else if (e.code === "KeyH") {
        e.preventDefault();
        actions.current.openOverlay("hint");
      } else if (e.code === "Escape" && (TEST || !document.pointerLockElement)) actions.current.pause();
    };
    const up = (e) => keys.current.delete(e.code);
    const move = (e) => {
      if (!lockedRef.current || screenRef.current !== "play" || overlayRef.current) return;
      mouse.current.x += Math.max(-300, Math.min(300, e.movementX || 0));
      mouse.current.y += Math.max(-300, Math.min(300, e.movementY || 0));
    };
    const mdown = (e) => {
      if (!lockedRef.current || screenRef.current !== "play" || overlayRef.current) return;
      if (e.button === 0) {
        mouse.current.fire = true;
        mouse.current.pressT = clockRef.current;
      } else if (e.button === 2) mouse.current.aim = true;
      e.preventDefault();
    };
    const mup = (e) => {
      if (e.button === 0) mouse.current.fire = false;
      else if (e.button === 2) mouse.current.aim = false;
    };
    const blur = () => {
      keys.current.clear();
      mouse.current.fire = mouse.current.aim = false;
    };
    const vis = () => {
      if (document.hidden && !TEST) actions.current.pause();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    document.addEventListener("mousemove", move);
    document.addEventListener("mousedown", mdown);
    document.addEventListener("mouseup", mup);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", vis);
    const root = rootRef.current;
    const ctx = (e) => e.preventDefault();
    const wheel = (e) => {
      if (screenRef.current !== "play") return;
      e.preventDefault();
      if (lockedRef.current && !overlayRef.current) queued.current.cycle = e.deltaY > 0 ? 1 : -1;
    };
    root?.addEventListener("contextmenu", ctx);
    root?.addEventListener("wheel", wheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mousedown", mdown);
      document.removeEventListener("mouseup", mup);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", vis);
      root?.removeEventListener("contextmenu", ctx);
      root?.removeEventListener("wheel", wheel);
    };
  }, []);

  /* ------------------------------------------------------------ settings / sound */
  const changeSettings = useCallback((patch) => {
    const next = { ...settingsRef.current, ...patch };
    const qualityChanged = patch.quality && patch.quality !== settingsRef.current.quality;
    settingsRef.current = next;
    setSettings(next);
    saveSettings(next);
    const w = worldRef.current;
    w?.setFov(next.fov);
    w?.setQuality(next.quality);
    audio.setVolume(next.volume);
    if (qualityChanged && w) {
      const s = screenRef.current === "play" ? simRef.current : menuSimRef.current;
      if (s) w.setLevel(s.L, s);
    }
  }, []);
  useEffect(() => audio.setMuted(muted || settings.mute), [muted, settings.mute]);
  useEffect(() => audio.setVolume(settings.volume), [settings.volume]);
  useEffect(() => () => audio.dispose(), []);

  const onBuy = useCallback(
    (k) => {
      const next = buyUpgrade(progressRef.current, k);
      if (next === progressRef.current) return;
      audio.play("levelUp");
      commitProgress(next);
      applyStats(simRef.current, next.up, next.relics);
    },
    [applyStats, commitProgress],
  );
  const onBuyMod = useCallback(
    (w) => {
      const next = buyMod(progressRef.current, w);
      if (next === progressRef.current) return;
      audio.play("levelUp");
      commitProgress(next);
      applyStats(simRef.current, next.up, next.relics);
    },
    [applyStats, commitProgress],
  );
  const onRefund = useCallback(() => {
    const next = refundUpgrades(progressRef.current);
    commitProgress(next);
    applyStats(simRef.current, next.up, next.relics);
  }, [applyStats, commitProgress]);

  /* ------------------------------------------------------------ Game Center restart button */
  const firstRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === firstRestart.current) return;
    firstRestart.current = restartSignal;
    if (screenRef.current === "play") restartLevel();
  }, [restartSignal, restartLevel]);

  /* ------------------------------------------------------------ test hook */
  useEffect(() => {
    if (!TEST) return undefined;
    window.__dse = {
      sim: () => simRef.current,
      world: () => worldRef.current,
      screen: () => screenRef.current,
      overlay: () => overlayRef.current,
      locked: () => lockedRef.current,
      level: () => levelRef.current,
      progress: () => progressRef.current,
      setProgress: commitProgress,
      advance(n = 1, dt = 1 / 60) {
        for (let i = 0; i < n; i++) frame.current(dt);
      },
      keys: keys.current,
      mouse: mouse.current,
      queued: () => queued.current,
      use: () => (queued.current.use = true),
      setBot: (b) => (botRef.current = b),
      play: startLevel,
      restart: restartLevel,
      respawn,
      toMenu,
      pause,
      resume,
      setScreen,
      fit() {
        const r = stageRef.current.getBoundingClientRect();
        worldRef.current?.resize(Math.round(r.width), Math.round(r.height));
      },
    };
    return () => {
      delete window.__dse;
    };
  }, [commitProgress, startLevel, restartLevel, respawn, toMenu, pause, resume, setScreen]);

  /* ------------------------------------------------------------ render */
  const L = getLevel(level);
  const zone = ZONES[L?.zone ?? 0];
  const inPlay = screen === "play";
  const canContinue = hasProgress(progress);
  const continueId = Math.max(1, Math.min(progress.last, progress.unlocked));
  const doneCount = Object.keys(progress.done).length;
  const h = hud;
  const bossInfo = h?.boss ? h.boss.split("|") : null;

  return (
    <div
      ref={rootRef}
      className={`dse dse--${screen}${overlay ? " has-overlay" : ""}${h?.aim ? " is-aiming" : ""}`}
      style={{ "--acc": zone.accent }}
      onClick={(e) => {
        if (e.target.closest?.("button, input, label, a")) return;
        if (screenRef.current === "play" && !overlayRef.current && !lockedRef.current) requestLock();
      }}
    >
      <div ref={stageRef} className="dse-stage" aria-hidden="true" />
      <div className="dse-vignette" />
      {h?.low && inPlay && <div className="dse-lowhp" />}
      <div ref={flashRef} className="dse-flash" />

      {/* ------------------------------------------------ HUD */}
      {inPlay && L && h && (
        <div className={`dse-hud${overlay ? " is-dim" : ""}`}>
          <div className="dse-hud__level">
            <div className="dse-hud__title">
              <span className="dse-hud__no">{pad2(level)}</span>
              <span className="dse-hud__name">{L.name}</span>
            </div>
            <div className="dse-hud__obj">
              <span className="dse-hud__label">Objective</span>
              <span>{L.objective}</span>
            </div>
          </div>
          <div className="dse-hud__xp">
            <XpBar progress={progress} compact />
          </div>
          {bossInfo && (
            <div className={`dse-boss${bossInfo[2] === "1" ? " is-shielded" : ""}`} role="status" aria-label="Boss health">
              <div className="dse-boss__name">
                <span>{ENEMIES[bossInfo[0]].name}</span>
                {bossInfo[2] === "1" && <span className="dse-boss__shield">Shielded</span>}
              </div>
              <div className="dse-boss__bar">
                <i style={{ width: `${bossInfo[1]}%` }} />
              </div>
            </div>
          )}
          {h.escape >= 0 && (
            <div className={`dse-escape${h.escape <= 15 ? " is-urgent" : ""}`} role="timer" aria-label="Collapse countdown">
              <span className="dse-hud__label">Facility implosion in</span>
              <span className="dse-escape__time">{fmt(h.escape)}</span>
            </div>
          )}
          <div className="dse-vitals">
            <div className="dse-vital dse-vital--hp" aria-label="Health">
              <span className="dse-vital__ico">+</span>
              <div className="dse-vital__bar">
                <i style={{ width: `${(h.hp / h.maxHp) * 100}%` }} />
              </div>
              <span className="dse-vital__num">{h.hp}</span>
            </div>
            <div className="dse-vital dse-vital--ar" aria-label="Armor">
              <span className="dse-vital__ico">◆</span>
              <div className="dse-vital__bar">
                <i style={{ width: `${(h.armor / h.maxArmor) * 100}%` }} />
              </div>
              <span className="dse-vital__num">{h.armor}</span>
            </div>
            {(h.under || h.o2 < h.maxO2) && (
              <div className={`dse-vital dse-vital--o2${h.o2low ? " is-low" : ""}`} aria-label="Oxygen">
                <span className="dse-vital__ico">O₂</span>
                <div className="dse-vital__bar">
                  <i style={{ width: `${(h.o2 / h.maxO2) * 100}%` }} />
                </div>
                <span className="dse-vital__num">{`${h.o2} s`}</span>
              </div>
            )}
            <div className="dse-med" aria-label="Medkits">
              <ItemIcon id="medkit" />
              <span>{`× ${h.med}`}</span>
              <kbd>Q</kbd>
            </div>
            {h.ability >= 0 && (
              <div className={`dse-ability${h.ability === 0 ? " is-ready" : ""}`} aria-label="Shock Pulse">
                <ShockIcon className="dse-ability__ico" />
                <span>{h.ability === 0 ? "Ready" : `${h.ability} s`}</span>
                <kbd>F</kbd>
              </div>
            )}
          </div>
          <div className="dse-weapon" aria-label="Weapon">
            {h.cur ? (
              <>
                <div className="dse-weapon__name">{WEAPONS[h.cur].name}</div>
                <div className={`dse-weapon__ammo${h.mag === 0 ? " is-empty" : ""}`}>
                  <span className="dse-weapon__mag">{h.mag}</span>
                  <span className="dse-weapon__res">{h.reserve < 0 ? "/ ∞" : `/ ${h.reserve}`}</span>
                </div>
                {h.reloading ? <div className="dse-weapon__state">Reloading…</div> : h.mag === 0 ? <div className="dse-weapon__state is-bad">Press R to reload</div> : null}
              </>
            ) : (
              <div className="dse-weapon__name dse-dim">Unarmed — find a weapon</div>
            )}
            <div className="dse-slots">
              {WEAPON_ORDER.map((w) => (
                <span key={w} className={`dse-slot${h.weapons.includes(w) ? " is-owned" : ""}${h.cur === w ? " is-cur" : ""}`}>
                  {WEAPONS[w].slot}
                </span>
              ))}
            </div>
          </div>
          {h.inv && (
            <div className="dse-hud__bag" aria-label="Inventory">
              {h.inv.split(",").map((id, i) => (
                <span key={`${id}${i}`} className="dse-hud__item" title={ITEMS[id].name} aria-label={ITEMS[id].name}>
                  <ItemIcon id={id} />
                </span>
              ))}
            </div>
          )}
          <div className="dse-cross" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
          <div ref={hitRef} className="dse-hitmark" aria-hidden="true" />
          <div ref={dmgRef} className="dse-dmg" aria-hidden="true" />
          {h.focus && (
            <div className={`dse-prompt${h.focus.endsWith("|1") ? " is-locked" : ""}`}>
              {h.focus.endsWith("|1") ? <LockIcon /> : <kbd>E</kbd>}
              <span className="dse-prompt__verb">{h.focus.split("|")[0]}</span>
              <span className="dse-prompt__name">{h.focus.split("|")[1]}</span>
            </div>
          )}
          <div className="dse-hud__keys">
            <span>
              <kbd>I</kbd> Inventory
            </span>
            <span>
              <kbd>H</kbd> Hint
            </span>
            <span>
              <kbd>Esc</kbd> Pause
            </span>
          </div>
          <div className="dse-toasts" aria-live="polite">
            {toasts.map((t) => (
              <div key={t.id} className={`dse-toast${t.kind ? ` is-${t.kind}` : ""}`}>
                {t.text}
              </div>
            ))}
          </div>
          {intro && (
            <div key={intro.key} className="dse-intro">
              <div className="dse-intro__zone">{zone.name}</div>
              <div className="dse-intro__no">{`Level ${intro.id}`}</div>
              <div className="dse-intro__name">{L.name}</div>
              <div className="dse-intro__obj">{L.objective}</div>
            </div>
          )}
          {!locked && !overlay && simRef.current?.state === "play" && <div className="dse-clickhint">Click to capture the mouse and play</div>}
        </div>
      )}

      {/* ------------------------------------------------ menus */}
      {screen === "menu" && (
        <div className="dse-screen dse-menu">
          <div className="dse-menu__brand">
            <Logo />
            <div>
              <div className="dse-menu__eyebrow">Escape Room · RPG · Shooter</div>
              <h1 className="dse-menu__title">Deep Sea Escape</h1>
              <div className="dse-menu__sub">Abyss Facility</div>
            </div>
          </div>
          <p className="dse-menu__tag">Beneath the Surface. Beyond Survival.</p>
          <div className="dse-menu__actions">
            <button type="button" className="dse-btn dse-btn--primary dse-btn--big" disabled={noGL} onClick={() => startLevel(1)}>
              Play
            </button>
            {canContinue && (
              <button type="button" className="dse-btn dse-btn--big" disabled={noGL} onClick={() => startLevel(continueId)}>
                <span>Continue</span>
                <span className="dse-btn__sub">{`Level ${continueId}`}</span>
              </button>
            )}
            <button type="button" className="dse-btn" disabled={noGL} onClick={() => setScreen("levels")}>
              Level Select
            </button>
            <button
              type="button"
              className="dse-btn"
              onClick={() => {
                setReturnTo("menu");
                setScreen("upgrades");
              }}
            >
              <span>Upgrades</span>
              {progress.points > 0 && <span className="dse-badge-dot">{progress.points}</span>}
            </button>
            <button type="button" className="dse-btn" onClick={() => setScreen("howto")}>
              How to Play
            </button>
            <button
              type="button"
              className="dse-btn"
              onClick={() => {
                setReturnTo("menu");
                setScreen("settings");
              }}
            >
              Settings
            </button>
          </div>
          <div className="dse-menu__foot">
            <span>{`${doneCount} / ${LEVEL_COUNT} levels complete`}</span>
            <span>{`Rank ${progress.rank}`}</span>
            <span>{`Artifacts ${progress.relics.length} / ${RELIC_ORDER.length}`}</span>
            {TOUCH && <span className="dse-warn">This game needs a keyboard and mouse.</span>}
            {noGL && <span className="dse-warn">3D graphics are not available in this browser.</span>}
          </div>
        </div>
      )}
      {screen === "levels" && (
        <div className="dse-screen dse-screen--dim">
          <LevelSelect progress={progress} onPlay={startLevel} onBack={() => setScreen("menu")} />
        </div>
      )}
      {screen === "upgrades" && (
        <div className="dse-screen dse-screen--dim">
          <Upgrades progress={progress} onBuy={onBuy} onBuyMod={onBuyMod} onRefund={onRefund} onBack={() => setScreen(returnTo === "levels" ? "levels" : "menu")} />
        </div>
      )}
      {screen === "howto" && (
        <div className="dse-screen dse-screen--dim">
          <HowTo onBack={() => setScreen("menu")} />
        </div>
      )}
      {screen === "settings" && !overlay && (
        <div className="dse-screen dse-screen--dim">
          <Settings settings={settings} onChange={changeSettings} onBack={() => setScreen(returnTo)} onReset={() => setOverlay("confirmReset")} />
        </div>
      )}
      {screen === "loading" && (
        <div className="dse-screen dse-loading" role="status" aria-label="Loading">
          <Logo />
          <div className="dse-loading__text">Pressurizing the airlock…</div>
          <div className="dse-dim">{`Level ${level} · ${L?.name}`}</div>
        </div>
      )}

      {/* ------------------------------------------------ overlays */}
      {overlay === "paused" && (
        <div className="dse-screen dse-screen--dim">
          <div className="dse-panel dse-pause" role="dialog" aria-label="Paused">
            <div className="dse-eyebrow">{`Level ${level} · ${L?.name}`}</div>
            <h2>Paused</h2>
            <p className="dse-dim">{L?.objective}</p>
            <button type="button" className="dse-btn dse-btn--primary" onClick={resume}>
              Resume
            </button>
            {lockHint && <p className="dse-dim dse-small">Click Resume again to capture the mouse.</p>}
            <div className="dse-row">
              <button type="button" className="dse-btn" onClick={restartLevel}>
                Restart Level
              </button>
              <button type="button" className="dse-btn" onClick={() => setOverlay("upgrades")}>
                <span>Upgrades</span>
                {progress.points > 0 && <span className="dse-badge-dot">{progress.points}</span>}
              </button>
            </div>
            <div className="dse-row">
              <button type="button" className="dse-btn dse-btn--ghost" onClick={() => setOverlay("hint")}>
                Show Hint
              </button>
              <button type="button" className="dse-btn dse-btn--ghost" onClick={() => setOverlay("inventory")}>
                Inventory
              </button>
            </div>
            <div className="dse-row">
              <button type="button" className="dse-btn dse-btn--ghost" onClick={() => setOverlay("howto")}>
                How to Play
              </button>
              <button type="button" className="dse-btn dse-btn--ghost" onClick={() => setOverlay("settings")}>
                Settings
              </button>
            </div>
            <button type="button" className="dse-btn dse-btn--ghost" onClick={() => setOverlay("confirmLeave")}>
              Exit to Menu
            </button>
          </div>
        </div>
      )}
      {overlay === "hint" && L && (
        <div className="dse-screen dse-screen--dim">
          <div className="dse-panel dse-hint" role="dialog" aria-label="Hint">
            <div className="dse-eyebrow">{`Level ${level} · ${L.name}`}</div>
            <h2>Hint</h2>
            <p>{L.hints[0]}</p>
            {hintN > 1 && <p className="dse-hint__more">{L.hints[1]}</p>}
            {hintN < 2 && (
              <button type="button" className="dse-btn" onClick={() => setHintN(2)}>
                Show Another Hint
              </button>
            )}
            <button type="button" className="dse-btn dse-btn--primary" onClick={resume}>
              Back to the Facility
            </button>
          </div>
        </div>
      )}
      {overlay === "clue" && clue && <CluePanel clue={clue} onClose={resume} />}
      {overlay === "keypad" && keypadRef.current && simRef.current && (
        <Keypad
          key={keypadRef.current}
          onSubmit={(code) => {
            const s = simRef.current;
            const id = keypadRef.current;
            const ok = !!s?.enterCode(id, code);
            if (s) handleEvents(s);
            if (ok) later(resume, 800);
            return ok;
          }}
          onClose={resume}
        />
      )}
      {overlay === "pipes" && pipesRef.current && simRef.current && (
        <PipeBoard
          key={pipesRef.current}
          sim={simRef.current}
          boardId={pipesRef.current}
          onTurn={(i) => {
            const s = simRef.current;
            const solved = s?.rotatePipe(pipesRef.current, i);
            if (s) handleEvents(s);
            if (solved) later(resume, 1100);
          }}
          onClose={resume}
        />
      )}
      {overlay === "inventory" && simRef.current && (
        <Inventory
          sim={simRef.current}
          relics={progress.relics}
          onRead={(id) => {
            const c = simRef.current?.L.clues?.[id];
            if (!c) return;
            audio.play("beep");
            setClue(c);
            setOverlay("clue");
          }}
          onHeal={() => {
            queued.current.heal = true;
            resume();
          }}
          onClose={resume}
        />
      )}
      {overlay === "upgrades" && (
        <div className="dse-screen dse-screen--dim">
          <Upgrades progress={progress} onBuy={onBuy} onBuyMod={onBuyMod} onRefund={onRefund} onBack={() => setOverlay(simRef.current?.state === "complete" ? (levelRef.current === LEVEL_COUNT ? "final" : "complete") : "paused")} />
        </div>
      )}
      {overlay === "howto" && (
        <div className="dse-screen dse-screen--dim">
          <HowTo onBack={() => setOverlay("paused")} />
        </div>
      )}
      {overlay === "settings" && (
        <div className="dse-screen dse-screen--dim">
          <Settings settings={settings} onChange={changeSettings} onBack={() => setOverlay(screenRef.current === "play" ? "paused" : null)} />
        </div>
      )}
      {overlay === "dead" && death && (
        <div className="dse-screen dse-screen--dead">
          <div className="dse-panel dse-death" role="alertdialog" aria-label="You Died">
            <h2>You Died</h2>
            <p>{death.reason}</p>
            <button type="button" className="dse-btn dse-btn--primary dse-btn--big" onClick={respawn}>
              Restart from Checkpoint
            </button>
            <div className="dse-row">
              <button type="button" className="dse-btn" onClick={restartLevel}>
                Restart Level
              </button>
              <button type="button" className="dse-btn" onClick={toUpgrades}>
                Upgrades
              </button>
              <button type="button" className="dse-btn dse-btn--ghost" onClick={toMenu}>
                Exit to Menu
              </button>
            </div>
          </div>
        </div>
      )}
      {overlay === "confirmLeave" && (
        <Confirm
          title="Leave this level?"
          text="Your progress inside this level will be lost. XP you earned and completed levels are kept."
          yes="Leave"
          no="Stay"
          onYes={toMenu}
          onNo={() => setOverlay("paused")}
        />
      )}
      {overlay === "confirmReset" && (
        <Confirm
          title="Reset all progress?"
          text="Every level except the first will be locked again, and your XP, rank and upgrades will be erased."
          yes="Reset"
          no="Cancel"
          onYes={() => {
            const p = emptyProgress();
            commitProgress(p);
            setOverlay(null);
          }}
          onNo={() => setOverlay(null)}
        />
      )}
      {overlay === "complete" && result && (
        <div className="dse-screen dse-screen--dim">
          <div className="dse-panel dse-done" role="dialog" aria-label="Level Complete">
            <div className="dse-eyebrow">{`Level ${result.id} · ${getLevel(result.id).name}`}</div>
            <h2>Level Complete</h2>
            <div className="dse-stats">
              <div>
                <span className="dse-stats__label">Time</span>
                <span className="dse-stats__val">{fmt(result.time)}</span>
              </div>
              <div>
                <span className="dse-stats__label">Mutants defeated</span>
                <span className="dse-stats__val">{`${result.kills}`}</span>
              </div>
              <div>
                <span className="dse-stats__label">Accuracy</span>
                <span className="dse-stats__val">{`${result.acc}%`}</span>
              </div>
              <div>
                <span className="dse-stats__label">XP earned</span>
                <span className="dse-stats__val">{`+${result.xp}`}</span>
              </div>
            </div>
            {result.best && result.prev !== null && <div className="dse-badge">New best time!</div>}
            <XpBar progress={progress} />
            <p className="dse-dim">{`Level ${result.id + 1} is now unlocked.`}</p>
            <button type="button" className="dse-btn dse-btn--primary dse-btn--big" onClick={() => startLevel(result.id + 1)}>
              Next Level
            </button>
            <div className="dse-row">
              <button type="button" className="dse-btn" onClick={() => setOverlay("upgrades")}>
                <span>Upgrades</span>
                {progress.points > 0 && <span className="dse-badge-dot">{progress.points}</span>}
              </button>
              <button type="button" className="dse-btn" onClick={() => startLevel(result.id)}>
                Replay
              </button>
              <button type="button" className="dse-btn" onClick={toLevels}>
                Level Select
              </button>
            </div>
          </div>
        </div>
      )}
      {overlay === "final" && result && (
        <div className="dse-screen dse-final">
          <div className="dse-final__sky" aria-hidden="true" />
          <div className="dse-panel dse-done dse-done--final" role="dialog" aria-label="Victory">
            <Logo />
            <div className="dse-eyebrow">All 20 levels complete</div>
            <h2>You Reached the Surface</h2>
            <p>The escape submarine tears free of the docking clamps as the Abyss Facility implodes beneath you. The Leviathan is dead and its experiments are buried in the dark. Hours later the hull breaks the surface, and through the porthole you see the first sunrise in weeks.</p>
            <div className="dse-stats">
              <div>
                <span className="dse-stats__label">Final escape</span>
                <span className="dse-stats__val">{fmt(result.time)}</span>
              </div>
              <div>
                <span className="dse-stats__label">Total best time</span>
                <span className="dse-stats__val">{fmt(Object.values(progress.done).reduce((a, d) => a + d.time, 0))}</span>
              </div>
              <div>
                <span className="dse-stats__label">Rank</span>
                <span className="dse-stats__val">{progress.rank}</span>
              </div>
              <div>
                <span className="dse-stats__label">Artifacts</span>
                <span className="dse-stats__val">{`${progress.relics.length} / ${RELIC_ORDER.length}`}</span>
              </div>
            </div>
            <div className="dse-row">
              <button type="button" className="dse-btn dse-btn--primary" onClick={toLevels}>
                Level Select
              </button>
              <button type="button" className="dse-btn" onClick={toMenu}>
                Main Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
