/**
 * Biohazard Escape: Project X — first-person 3D escape-room shooter with RPG
 * progression across 25 levels of an infected underground research facility.
 *
 * One requestAnimationFrame loop steps the simulation (engine/sim.js) in
 * ≤1/60 s slices and draws it with plain Three.js (render/world.js); sound is
 * procedural WebAudio (audio.js). React renders only menus, overlays and a
 * HUD whose values are pushed when they change — walking and looking never
 * re-render React.
 *
 * All visible text is English source text: the Game Center's runtime
 * translator (i18n/gameTranslator.js + i18n/games/BiohazardEscape.json) swaps
 * it for Russian in place when the site language is Russian, and back again.
 * Sentences are kept whole in single text nodes so they translate as a unit.
 *
 * Controls: WASD move · mouse look (Pointer Lock) · LMB fire · RMB aim · R
 * reload · E interact · Shift sprint · Space jump · 1–4 / wheel weapons · Q
 * medkit · I inventory · H hint · Esc pause. `restartSignal` (Game Center
 * Restart) restarts the level; `muted` silences audio. DEV hook: `?bhztest=1`
 * fakes pointer lock, disables rAF and exposes window.__bhz (tools/harness.mjs).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./BiohazardEscape.css";
import { createSim, defaultLoadout } from "./engine/sim.js";
import { getLevel, LEVELS, LEVEL_COUNT } from "./engine/levels.js";
import { ZONES, WEAPONS, WEAPON_ORDER, UPGRADES, UPGRADE_ORDER, ENEMIES, statsFor } from "./engine/constants.js";
import { ITEMS } from "./engine/items.js";
import { SYMBOLS, COLORS, COLOR_NAMES } from "./engine/symbols.js";
import { createWorld } from "./render/world.js";
import { audio } from "./audio.js";
import { loadProgress, saveProgress, recordCompletion, hasProgress, loadSettings, saveSettings, emptyProgress, addXp, buyUpgrade, refundUpgrades, rankFor } from "./progress.js";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("bhztest");
const TOUCH = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(pointer: fine)").matches;
const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight", "Space"]);
const STEP = 1 / 60;

const fmt = (s) => {
  s = Math.max(0, s || 0);
  const m = Math.floor(s / 60);
  const r = Math.floor(s - m * 60);
  return `${m}:${r < 10 ? "0" : ""}${r}`;
};
const pad2 = (n) => String(n).padStart(2, "0");

/* ------------------------------------------------------------------ icons */
function Sym({ id, className = "bhz-sym" }) {
  const g = SYMBOLS[id];
  if (!g) return null;
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <path d={g.d} fillRule="evenodd" fill="currentColor" />
    </svg>
  );
}
const Logo = ({ className = "bhz-logo" }) => (
  <svg viewBox="0 0 100 100" aria-hidden="true" className={className}>
    <defs>
      <radialGradient id="bhzg" cx="50%" cy="45%" r="60%">
        <stop offset="0%" stopColor="#d6ff7a" />
        <stop offset="60%" stopColor="#5fe03a" />
        <stop offset="100%" stopColor="#1f6a10" />
      </radialGradient>
    </defs>
    <path d={SYMBOLS.biohazard.d} fillRule="evenodd" fill="url(#bhzg)" stroke="#0a2a06" strokeWidth="1.5" />
  </svg>
);
const LockIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="bhz-ico">
    <path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" strokeWidth="2" />
    <rect x="5" y="10" width="14" height="10" rx="2" fill="currentColor" />
  </svg>
);
const ITEM_ICON = {
  key: "M3 8h14v8H3zM6 11h4v2H6z",
  fuse: "M8 2h4v3h-4zM7 5h6v10H7zM8 15h4v3H8z",
  circuit: "M2 5h16v10H2zM5 8h2v2H5zM9 8h2v2H9zM13 8h2v2h-2zM5 12h10v1H5z",
  sample: "M8 2h4v2h-1v10a1 1 0 0 1-2 0V4H8z",
  prism: "M10 2l6 8-6 8-6-8z",
  note: "M4 2h9l3 3v13H4zM6 7h8v1H6zM6 10h8v1H6zM6 13h6v1H6z",
  heal: "M2 5h16v11H2zM9 7h2v3h3v2h-3v3H9v-3H6v-2h3z",
};
function ItemIcon({ id }) {
  const it = ITEMS[id];
  if (!it) return null;
  const d = id.startsWith("card") ? ITEM_ICON.key : ITEM_ICON[id] || ITEM_ICON[it.kind] || ITEM_ICON.key;
  return (
    <svg viewBox="0 0 20 20" className="bhz-icon" aria-hidden="true">
      <path d={d} fillRule="evenodd" fill={it.color} />
    </svg>
  );
}

/* ------------------------------------------------------------------ panels */
function Controls() {
  return (
    <dl className="bhz-keys">
      <dt>W A S D</dt>
      <dd>Move</dd>
      <dt>Mouse</dt>
      <dd>Look around</dd>
      <dt>Left click</dt>
      <dd>Shoot</dd>
      <dt>Right click</dt>
      <dd>Aim</dd>
      <dt>R</dt>
      <dd>Reload</dd>
      <dt>E</dt>
      <dd>Interact / collect</dd>
      <dt>Shift</dt>
      <dd>Sprint</dd>
      <dt>Space</dt>
      <dd>Jump</dd>
      <dt>1 – 4</dt>
      <dd>Switch weapons (mouse wheel too)</dd>
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
    <div className="bhz-panel bhz-howto" role="dialog" aria-label="How to Play">
      <h2>How to Play</h2>
      <div className="bhz-howto__cols">
        <section>
          <h3>Your goal</h3>
          <p>Every sector of the facility is sealed. Solve its security puzzles, survive the mutants and reach the lift to move deeper — and finally out.</p>
          <h3>Escape puzzles</h3>
          <ul>
            <li>Read notes, monitors and whiteboards — they hold codes, colours and orders.</li>
            <li>Keypads need four-digit codes. Some codes are split across several rooms.</li>
            <li>Generators must be fuelled with fuses and often started in the right order.</li>
            <li>Color and symbol panels cycle with each press. Match the clue.</li>
            <li>Rotate prisms to guide energy beams into receivers.</li>
            <li>Terminals switch off laser grids — some need repairs or power first.</li>
            <li>Loose vent covers hide secret passages.</li>
          </ul>
        </section>
        <section>
          <h3>Combat</h3>
          <ul>
            <li>Head shots deal extra damage. Aim with the right mouse button for accuracy.</li>
            <li>Armored guards resist bullets. The Ion Lance ignores armor.</li>
            <li>Red barrels explode. Acid, gas and lasers hurt you.</li>
            <li>Armor absorbs part of every hit. Press Q to use a medkit.</li>
            <li>If you die, you return to the last checkpoint with full health.</li>
          </ul>
          <h3>Progression</h3>
          <ul>
            <li>Kills, solved puzzles and finished levels give XP. Every rank gives an upgrade point.</li>
            <li>Spend points on Vitality, Body Armor, Firepower and Reflexes.</li>
          </ul>
        </section>
        <section>
          <h3>Controls</h3>
          <Controls />
          <p className="bhz-dim">Click the view to capture the mouse. A keyboard and mouse are required.</p>
        </section>
      </div>
      <button type="button" className="bhz-btn bhz-btn--primary" onClick={onBack}>
        Back
      </button>
    </div>
  );
}

function Settings({ settings, onChange, onBack, onReset }) {
  const Toggle = ({ k, label }) => (
    <div className="bhz-field">
      <span>{label}</span>
      <button type="button" className={`bhz-toggle${settings[k] ? " is-on" : ""}`} aria-pressed={!!settings[k]} aria-label={label} onClick={() => onChange({ [k]: !settings[k] })}>
        {settings[k] ? "On" : "Off"}
      </button>
    </div>
  );
  return (
    <div className="bhz-panel bhz-settings" role="dialog" aria-label="Settings">
      <h2>Settings</h2>
      <label className="bhz-field">
        <span>Mouse sensitivity</span>
        <input type="range" min="0.2" max="3" step="0.05" value={settings.sens} aria-label="Mouse sensitivity" onChange={(e) => onChange({ sens: Number(e.target.value) })} />
        <output>{settings.sens.toFixed(2)}</output>
      </label>
      <label className="bhz-field">
        <span>Field of view</span>
        <input type="range" min="60" max="100" step="1" value={settings.fov} aria-label="Field of view" onChange={(e) => onChange({ fov: Number(e.target.value) })} />
        <output>{settings.fov}°</output>
      </label>
      <label className="bhz-field">
        <span>Volume</span>
        <input type="range" min="0" max="1" step="0.05" value={settings.volume} aria-label="Volume" onChange={(e) => onChange({ volume: Number(e.target.value) })} />
        <output>{Math.round(settings.volume * 100)}%</output>
      </label>
      <Toggle k="invertY" label="Invert vertical look" />
      <div className="bhz-field">
        <span>Sound</span>
        <button type="button" className={`bhz-toggle${!settings.mute ? " is-on" : ""}`} aria-pressed={!settings.mute} aria-label="Sound" onClick={() => onChange({ mute: !settings.mute })}>
          {settings.mute ? "Off" : "On"}
        </button>
      </div>
      <Toggle k="hints" label="Tutorial tips" />
      <div className="bhz-field">
        <span>Graphics</span>
        <div className="bhz-seg" role="group" aria-label="Graphics">
          <button type="button" className={settings.quality === "high" ? "is-on" : ""} aria-pressed={settings.quality === "high"} onClick={() => onChange({ quality: "high" })}>
            High
          </button>
          <button type="button" className={settings.quality === "low" ? "is-on" : ""} aria-pressed={settings.quality === "low"} onClick={() => onChange({ quality: "low" })}>
            Fast
          </button>
        </div>
      </div>
      <div className="bhz-settings__foot">
        {onReset && (
          <button type="button" className="bhz-btn bhz-btn--danger" onClick={onReset}>
            Reset progress
          </button>
        )}
        <button type="button" className="bhz-btn bhz-btn--primary" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

function Confirm({ title, text, yes, no, onYes, onNo }) {
  return (
    <div className="bhz-screen bhz-screen--dim">
      <div className="bhz-panel bhz-confirm" role="alertdialog" aria-label={title}>
        <h2>{title}</h2>
        <p>{text}</p>
        <div className="bhz-row">
          <button type="button" className="bhz-btn bhz-btn--danger" onClick={onYes}>
            {yes}
          </button>
          <button type="button" className="bhz-btn bhz-btn--primary" onClick={onNo}>
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
    <div className={`bhz-xp${compact ? " is-compact" : ""}`}>
      <div className="bhz-xp__top">
        <span className="bhz-xp__rank">{`Rank ${r.rank}`}</span>
        <span className="bhz-xp__num">{`${r.into} / ${r.need} XP`}</span>
      </div>
      <div className="bhz-xp__bar" role="progressbar" aria-label="Experience" aria-valuemin={0} aria-valuemax={r.need} aria-valuenow={r.into}>
        <i style={{ width: `${(r.into / r.need) * 100}%` }} />
      </div>
      {progress.points > 0 && <div className="bhz-xp__pts">{`${progress.points} upgrade points available`}</div>}
    </div>
  );
}

function Upgrades({ progress, onBuy, onRefund, onBack }) {
  const st = statsFor(progress.up);
  const value = {
    vitality: `${st.maxHp} health`,
    armor: `${st.maxArmor} armor`,
    firepower: `+${Math.round((st.dmgMul - 1) * 100)}% damage`,
    reflexes: `+${Math.round((st.speedMul - 1) * 100)}% speed`,
  };
  const spent = Object.values(progress.up).reduce((a, b) => a + b, 0);
  return (
    <div className="bhz-panel bhz-upgrades" role="dialog" aria-label="Upgrades">
      <div className="bhz-upgrades__head">
        <h2>Upgrades</h2>
        <XpBar progress={progress} />
      </div>
      <div className="bhz-upgrades__grid">
        {UPGRADE_ORDER.map((k) => {
          const u = UPGRADES[k];
          const lvl = progress.up[k] || 0;
          const maxed = lvl >= u.max;
          return (
            <div key={k} className={`bhz-up bhz-up--${k}`}>
              <div className="bhz-up__name">{u.name}</div>
              <div className="bhz-up__desc">{u.desc}</div>
              <div className="bhz-up__pips" aria-label={`${lvl} of ${u.max}`}>
                {Array.from({ length: u.max }, (_, i) => (
                  <i key={i} className={i < lvl ? "is-on" : ""} />
                ))}
              </div>
              <div className="bhz-up__val">{value[k]}</div>
              <button type="button" className="bhz-btn bhz-btn--primary" disabled={maxed || progress.points <= 0} onClick={() => onBuy(k)}>
                {maxed ? "Maxed" : "Upgrade"}
              </button>
            </div>
          );
        })}
      </div>
      <p className="bhz-dim bhz-small">Earn XP by defeating mutants, solving puzzles and finishing levels. Each new rank grants one upgrade point.</p>
      <div className="bhz-row">
        <button type="button" className="bhz-btn bhz-btn--ghost" disabled={spent === 0} onClick={onRefund}>
          Refund all points
        </button>
        <button type="button" className="bhz-btn bhz-btn--primary" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

function LevelSelect({ progress, onPlay, onBack }) {
  return (
    <div className="bhz-panel bhz-levels" role="dialog" aria-label="Level Select">
      <div className="bhz-levels__head">
        <h2>Level Select</h2>
        <span className="bhz-dim">{`${Object.keys(progress.done).length} / ${LEVEL_COUNT} levels complete`}</span>
      </div>
      <div className="bhz-levels__scroll">
        {ZONES.map((z) => (
          <section key={z.id} className="bhz-zone" style={{ "--acc": z.accent }}>
            <h3>{z.name}</h3>
            <div className="bhz-levels__grid">
              {LEVELS.filter((l) => l.zone === z.id).map((l) => {
                const locked = l.id > progress.unlocked;
                const done = progress.done[l.id];
                const boss = l.ents.some((e) => e.t === "enemy" && ENEMIES[e.kind].boss);
                return (
                  <button
                    key={l.id}
                    type="button"
                    className={`bhz-lvl${locked ? " is-locked" : ""}${done ? " is-done" : ""}${boss ? " is-boss" : ""}`}
                    disabled={locked}
                    onClick={() => onPlay(l.id)}
                    aria-label={locked ? `Level ${l.id}, locked` : `Level ${l.id}: ${l.name}`}
                  >
                    <span className="bhz-lvl__no">{pad2(l.id)}</span>
                    <span className="bhz-lvl__name">{locked ? "Locked" : l.name}</span>
                    <span className="bhz-lvl__meta">{locked ? <LockIcon /> : done ? <span>{`Best ${fmt(done.time)}`}</span> : boss ? <span>Boss</span> : <span>New</span>}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <button type="button" className="bhz-btn bhz-btn--primary" onClick={onBack}>
        Back
      </button>
    </div>
  );
}

function CluePanel({ clue, onClose }) {
  return (
    <div className="bhz-screen bhz-screen--dim">
      <div className="bhz-panel bhz-clue" role="dialog" aria-label={clue.title}>
        <h2>{clue.title}</h2>
        <p className="bhz-clue__text">{clue.text}</p>
        {clue.swatches?.length > 0 && (
          <div className="bhz-clue__row">
            {clue.swatches.map((c, i) => (
              <figure key={`${c}${i}`}>
                <span className="bhz-swatch" style={{ background: COLORS[c] }} />
                <figcaption>{COLOR_NAMES[c]}</figcaption>
              </figure>
            ))}
          </div>
        )}
        {clue.symbols?.length > 0 && (
          <div className="bhz-clue__row">
            {clue.symbols.map((s, i) => (
              <figure key={`${s}${i}`}>
                <Sym id={s} />
                <figcaption>{SYMBOLS[s].name}</figcaption>
              </figure>
            ))}
          </div>
        )}
        {clue.breakers?.length > 0 && (
          <div className="bhz-clue__row">
            {clue.breakers.map((on, i) => (
              <figure key={i} className={`bhz-breaker${on ? " is-up" : ""}`}>
                <span className="bhz-breaker__slot">
                  <i />
                </span>
                <figcaption>{on ? `${i + 1} · Up` : `${i + 1} · Down`}</figcaption>
              </figure>
            ))}
          </div>
        )}
        <button type="button" className="bhz-btn bhz-btn--primary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function Keypad({ onSubmit, onClose }) {
  const [code, setCode] = useState("");
  const [state, setState] = useState("idle"); // idle | bad | ok
  const codeRef = useRef("");
  const lockRef = useRef(false);
  const press = useCallback(
    (d) => {
      if (lockRef.current) return;
      audio.play("beep");
      if (state !== "idle") setState("idle");
      const next = (codeRef.current + d).slice(0, 4);
      codeRef.current = next;
      setCode(next);
    },
    [state],
  );
  const clear = () => {
    codeRef.current = "";
    setCode("");
    setState("idle");
  };
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
      if (/^Digit\d$|^Numpad\d$/.test(e.code)) {
        e.preventDefault();
        press(e.code.slice(-1));
      } else if (e.code === "Backspace") {
        e.preventDefault();
        codeRef.current = codeRef.current.slice(0, -1);
        setCode(codeRef.current);
      } else if (e.code === "Enter" || e.code === "NumpadEnter") {
        e.preventDefault();
        enter();
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [press, enter]);
  return (
    <div className="bhz-screen bhz-screen--dim">
      <div className={`bhz-panel bhz-keypad is-${state}`} role="dialog" aria-label="Keypad">
        <h2>Keypad</h2>
        <div className="bhz-keypad__screen" aria-live="polite">
          <span className="bhz-keypad__digits">{(code + "____").slice(0, 4).split("").join(" ")}</span>
          <span className="bhz-keypad__status">{state === "bad" ? "Access denied" : state === "ok" ? "Access granted" : "Enter code"}</span>
        </div>
        <div className="bhz-keypad__grid">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button key={d} type="button" className="bhz-key" onClick={() => press(d)}>
              {d}
            </button>
          ))}
          <button type="button" className="bhz-key bhz-key--fn" onClick={clear} aria-label="Clear">
            C
          </button>
          <button type="button" className="bhz-key" onClick={() => press("0")}>
            0
          </button>
          <button type="button" className="bhz-key bhz-key--ok" onClick={enter} aria-label="Enter">
            OK
          </button>
        </div>
        <button type="button" className="bhz-btn bhz-btn--ghost" onClick={onClose}>
          Step away
        </button>
      </div>
    </div>
  );
}

function Inventory({ sim, onRead, onHeal, onClose }) {
  const p = sim.player;
  const keys = sim.inv.filter((x) => ITEMS[x.item].kind !== "note");
  const notes = sim.inv.filter((x) => ITEMS[x.item].kind === "note");
  return (
    <div className="bhz-screen bhz-screen--dim">
      <div className="bhz-panel bhz-inv" role="dialog" aria-label="Inventory">
        <h2>Inventory</h2>
        <div className="bhz-inv__cols">
          <section>
            <h3>Items</h3>
            {keys.length === 0 && notes.length === 0 ? <p className="bhz-dim">No key items.</p> : null}
            <ul className="bhz-inv__list">
              {keys.map((x, i) => (
                <li key={`${x.item}${i}`}>
                  <ItemIcon id={x.item} />
                  <div>
                    <div className="bhz-inv__name">{ITEMS[x.item].name}</div>
                    <div className="bhz-dim bhz-small">{ITEMS[x.item].desc}</div>
                  </div>
                </li>
              ))}
              {notes.map((x, i) => (
                <li key={`n${i}`}>
                  <ItemIcon id="note" />
                  <div>
                    <div className="bhz-inv__name">{sim.L.clues?.[x.clue]?.title || ITEMS.note.name}</div>
                    <div className="bhz-dim bhz-small">{ITEMS.note.desc}</div>
                  </div>
                  <button type="button" className="bhz-btn" onClick={() => onRead(x.clue)}>
                    Read
                  </button>
                </li>
              ))}
              <li>
                <ItemIcon id="medkit" />
                <div>
                  <div className="bhz-inv__name">{`Medkits × ${p.medkits}`}</div>
                  <div className="bhz-dim bhz-small">{ITEMS.medkit.desc}</div>
                </div>
                <button type="button" className="bhz-btn" disabled={p.medkits <= 0 || p.hp >= p.maxHp} onClick={onHeal}>
                  Use
                </button>
              </li>
            </ul>
          </section>
          <section>
            <h3>Weapons</h3>
            <ul className="bhz-inv__list">
              {WEAPON_ORDER.map((w) => {
                const def = WEAPONS[w];
                const owned = p.weapons.includes(w);
                return (
                  <li key={w} className={owned ? "" : "is-missing"}>
                    <span className="bhz-inv__slot">{def.slot}</span>
                    <div>
                      <div className="bhz-inv__name">{owned ? def.name : "Not found yet"}</div>
                      {owned && <div className="bhz-dim bhz-small">{def.desc}</div>}
                      {owned && (
                        <div className="bhz-inv__stats">
                          <span>{`Damage ${Math.round(def.dmg * def.pellets * sim.stats.dmgMul)}`}</span>
                          <span>{`Rate ${Math.round(60 / def.rate)}/min`}</span>
                          <span>{`Magazine ${def.mag}`}</span>
                          <span>{def.ammo ? `Ammo ${p.mags[w]} + ${p.ammo[def.ammo]}` : `Ammo ${p.mags[w]} + ∞`}</span>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
        <button type="button" className="bhz-btn bhz-btn--primary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

const DEATH_TEXT = {
  melee: "The mutants tore you apart.",
  charge: "You were crushed by a charging mutant.",
  acid: "The acid ate through your suit.",
  laser: "The security lasers cut you down.",
  gas: "The toxic gas filled your lungs.",
  blast: "You were caught in the explosion.",
  shock: "The generator overload electrocuted you.",
  meltdown: "The facility self-destructed with you inside.",
  hit: "You did not survive.",
};

/* ------------------------------------------------------------------ main */
export default function BiohazardEscape({ restartSignal = 0, muted = false }) {
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
  const queued = useRef({ use: false, reload: false, jump: false, heal: false, slot: 0, cycle: 0 });
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
    el.className = "bhz-flash";
    void el.offsetWidth;
    el.className = `bhz-flash is-${cls}`;
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
    const L = getLevel(9);
    const s = createSim(L);
    s.player.x = 4.9;
    s.player.z = 12.4;
    s.player.pitch = 0.02;
    s.player.cur = null;
    menuSimRef.current = s;
    world.setLevel(L, s);
  }, []);

  const applyStats = useCallback((s, up) => {
    if (!s) return;
    const st = statsFor(up);
    const p = s.player;
    const dh = st.maxHp - p.maxHp;
    Object.assign(s.stats, st);
    p.maxHp = st.maxHp;
    p.maxArmor = st.maxArmor;
    if (dh > 0) p.hp += dh;
    p.hp = Math.min(p.hp, p.maxHp);
    p.armor = Math.min(p.armor, p.maxArmor);
  }, []);

  const newSim = useCallback((id) => createSim(getLevel(id), { stats: statsFor(progressRef.current.up), loadout: defaultLoadout(id) }), []);

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
      queued.current = { use: false, reload: false, jump: false, heal: false, slot: 0, cycle: 0 };
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
            if (e.id) {
              if (e.hidden) toast("The vent cover comes loose — a hidden passage!", "good");
            }
            break;
          case "impact":
            if (e.kind === "flesh") audio.play("flesh");
            else if (e.kind === "armor") audio.play("armorHit");
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
              toast("Armor restored.");
            } else if (it.kind === "note") audio.play("pickup");
            break;
          }
          case "weaponGot":
            audio.play("weapon");
            toast(e.fresh ? `New weapon: ${name(e.item)}! Press ${WEAPONS[e.weapon].slot} to equip it.` : `${name(e.item)} ammo collected.`, "good");
            break;
          case "open":
            audio.play("click");
            break;
          case "empty":
            toast("Empty.");
            break;
          case "unlock":
            audio.play("codeOk");
            toast(`Access granted — ${name(e.item)} accepted.`, "good");
            break;
          case "needItem":
            audio.play("deny");
            toast(`Access denied. You need: ${name(e.item)}.`, "bad");
            break;
          case "sealed":
            audio.play("deny");
            toast("Sealed. Solve this area's security puzzle to open it.", "bad");
            break;
          case "noPower":
            audio.play("deny");
            toast("No power. Restore power to use this.", "bad");
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
            audio.play("codeOk");
            toast("Code accepted.", "good");
            break;
          case "codeBad":
            audio.play("codeBad");
            break;
          case "panel":
            audio.play("panel");
            break;
          case "solve":
            audio.play("solve");
            toast(e.kind === "seq" ? "Sequence complete — systems online!" : e.kind === "socket" ? "Analysis complete!" : "Lock released!", "good");
            break;
          case "read": {
            const c = s.L.clues?.[e.clue];
            if (c && !botRef.current) {
              audio.play("beep");
              setClue(c);
              keys.current.clear();
              setOverlay("clue");
              releaseLock();
            }
            break;
          }
          case "access":
            audio.play("codeOk");
            toast("Override accepted.", "good");
            break;
          case "repair":
            audio.play("solve");
            toast("Terminal repaired. Use it again to access it.", "good");
            break;
          case "place":
            audio.play("click");
            if (e.item === "sample" && e.have < e.count) toast(`Samples inserted: ${e.have} of ${e.count}.`);
            else if (e.item === "fuse") toast("Fuse inserted. Now start the generator.", "good");
            else if (e.item === "prism") toast("Prism mounted.", "good");
            break;
          case "genOn":
            audio.play("gen");
            break;
          case "overload":
            audio.play("overload");
            flash("shock");
            toast("Wrong order — the breakers tripped and every generator shut down!", "bad");
            break;
          case "rotate":
            audio.play("rotate");
            break;
          case "beamOn":
            audio.play("beam");
            toast("The receiver locks onto the beam!", "good");
            break;
          case "needIon":
            audio.play("deny");
            toast(s.player.weapons.includes("ion") ? "Shoot it with the Ion Lance to charge it." : "Only an energy weapon can charge this.", "bad");
            break;
          case "nodeCharged":
            audio.play("beam");
            toast(e.kind === "tube" ? "Feeding tube destroyed!" : e.kind === "pylon" ? "Ion pylon overloaded!" : "Ion node charged!", "good");
            break;
          case "nodeDeflect":
            audio.play("armorHit");
            break;
          case "doorOpen":
            audio.play("door");
            if (e.secret) toast("A hidden passage opens!", "good");
            break;
          case "doorClose":
            audio.play("doorClose");
            break;
          case "alert":
            audio.play(ENEMIES[e.kind]?.boss ? "growlBig" : "alert");
            break;
          case "wake":
            audio.play(ENEMIES[e.kind]?.boss ? "growlBig" : "alert");
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
            toast("It is calling more of them!", "bad");
            break;
          case "deflect":
            audio.play("armorHit");
            break;
          case "shieldUp":
            audio.play("overload");
            toast("Its shield is back up! Find a way to break it.", "bad");
            break;
          case "kill":
            audio.play("kill");
            if (e.boss) toast(`${ENEMIES[e.kind].name} is dead!`, "good");
            break;
          case "drop":
            toast("It dropped something!", "good");
            break;
          case "explode":
            audio.play("explode");
            break;
          case "laserHit":
            audio.play("laser");
            break;
          case "hurt":
            audio.play("hurt");
            flash(e.kind === "acid" || e.kind === "gas" ? "acid" : "hurt");
            if (e.dir !== null && e.dir !== undefined && dmgRef.current) {
              dmgRef.current.style.setProperty("--a", `${-e.dir}rad`);
              pulse(dmgRef, "is-on");
            }
            break;
          case "heal":
            audio.play("heal");
            toast("Medkit used.", "good");
            break;
          case "healFail":
            audio.play("deny");
            toast(e.none ? "No medkits left." : "Your health is already full.");
            break;
          case "death":
            audio.play("death");
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
            toast("SELF-DESTRUCT ACTIVATED! Reach the evacuation lift!", "long");
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
    [complete, flash, later, pulse, releaseLock, setOverlay, toast],
  );

  /* ------------------------------------------------------------ world + loop */
  useEffect(() => {
    const stage = stageRef.current;
    let world;
    try {
      world = createWorld(stage, { preserve: TEST });
    } catch (err) {
      console.error("Biohazard Escape: WebGL unavailable", err);
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
              input.slot = q.slot || 0;
              input.cycle = q.cycle || 0;
              queued.current = { use: false, reload: false, jump: false, heal: false, slot: 0, cycle: 0 };
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
            audio.play("step");
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
      escape: s.escape ? Math.max(0, Math.ceil(s.escape.left)) : -1,
      boss: boss ? `${boss.kind}|${Math.ceil((boss.hp / boss.max) * 100)}|${s.isShielded(boss) ? 1 : 0}` : "",
      low: p.hp < p.maxHp * 0.3,
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
        } else if (e.code === "Escape" && ov === "keypad") actions.current.resume();
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
        q.jump = true;
      } else if (e.code === "KeyQ") {
        e.preventDefault();
        q.heal = true;
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
      applyStats(simRef.current, next.up);
    },
    [applyStats, commitProgress],
  );
  const onRefund = useCallback(() => {
    const next = refundUpgrades(progressRef.current);
    commitProgress(next);
    applyStats(simRef.current, next.up);
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
    window.__bhz = {
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
      delete window.__bhz;
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
      className={`bhz bhz--${screen}${overlay ? " has-overlay" : ""}${h?.aim ? " is-aiming" : ""}`}
      style={{ "--acc": zone.accent }}
      onClick={(e) => {
        if (e.target.closest?.("button, input, label, a")) return;
        if (screenRef.current === "play" && !overlayRef.current && !lockedRef.current) requestLock();
      }}
    >
      <div ref={stageRef} className="bhz-stage" aria-hidden="true" />
      <div className="bhz-vignette" />
      {h?.low && inPlay && <div className="bhz-lowhp" />}
      <div ref={flashRef} className="bhz-flash" />

      {/* ------------------------------------------------ HUD */}
      {inPlay && L && h && (
        <div className={`bhz-hud${overlay ? " is-dim" : ""}`}>
          <div className="bhz-hud__level">
            <div className="bhz-hud__title">
              <span className="bhz-hud__no">{pad2(level)}</span>
              <span className="bhz-hud__name">{L.name}</span>
            </div>
            <div className="bhz-hud__obj">
              <span className="bhz-hud__label">Objective</span>
              <span>{L.objective}</span>
            </div>
          </div>
          <div className="bhz-hud__xp">
            <XpBar progress={progress} compact />
          </div>
          {bossInfo && (
            <div className={`bhz-boss${bossInfo[2] === "1" ? " is-shielded" : ""}`} role="status" aria-label="Boss health">
              <div className="bhz-boss__name">
                <span>{ENEMIES[bossInfo[0]].name}</span>
                {bossInfo[2] === "1" && <span className="bhz-boss__shield">Shielded</span>}
              </div>
              <div className="bhz-boss__bar">
                <i style={{ width: `${bossInfo[1]}%` }} />
              </div>
            </div>
          )}
          {h.escape >= 0 && (
            <div className={`bhz-escape${h.escape <= 15 ? " is-urgent" : ""}`} role="timer" aria-label="Self-destruct countdown">
              <span className="bhz-hud__label">Self-destruct in</span>
              <span className="bhz-escape__time">{fmt(h.escape)}</span>
            </div>
          )}
          <div className="bhz-vitals">
            <div className="bhz-vital bhz-vital--hp" aria-label="Health">
              <span className="bhz-vital__ico">+</span>
              <div className="bhz-vital__bar">
                <i style={{ width: `${(h.hp / h.maxHp) * 100}%` }} />
              </div>
              <span className="bhz-vital__num">{h.hp}</span>
            </div>
            <div className="bhz-vital bhz-vital--ar" aria-label="Armor">
              <span className="bhz-vital__ico">◆</span>
              <div className="bhz-vital__bar">
                <i style={{ width: `${(h.armor / h.maxArmor) * 100}%` }} />
              </div>
              <span className="bhz-vital__num">{h.armor}</span>
            </div>
            <div className="bhz-med" aria-label="Medkits">
              <ItemIcon id="medkit" />
              <span>{`× ${h.med}`}</span>
              <kbd>Q</kbd>
            </div>
          </div>
          <div className="bhz-weapon" aria-label="Weapon">
            {h.cur ? (
              <>
                <div className="bhz-weapon__name">{WEAPONS[h.cur].name}</div>
                <div className={`bhz-weapon__ammo${h.mag === 0 ? " is-empty" : ""}`}>
                  <span className="bhz-weapon__mag">{h.mag}</span>
                  <span className="bhz-weapon__res">{h.reserve < 0 ? "/ ∞" : `/ ${h.reserve}`}</span>
                </div>
                {h.reloading ? <div className="bhz-weapon__state">Reloading…</div> : h.mag === 0 ? <div className="bhz-weapon__state is-bad">Press R to reload</div> : null}
              </>
            ) : (
              <div className="bhz-weapon__name bhz-dim">Unarmed</div>
            )}
            <div className="bhz-slots">
              {WEAPON_ORDER.map((w) => (
                <span key={w} className={`bhz-slot${h.weapons.includes(w) ? " is-owned" : ""}${h.cur === w ? " is-cur" : ""}`}>
                  {WEAPONS[w].slot}
                </span>
              ))}
            </div>
          </div>
          {h.inv && (
            <div className="bhz-hud__bag" aria-label="Inventory">
              {h.inv.split(",").map((id, i) => (
                <span key={`${id}${i}`} className="bhz-hud__item" title={ITEMS[id].name} aria-label={ITEMS[id].name}>
                  <ItemIcon id={id} />
                </span>
              ))}
            </div>
          )}
          <div className="bhz-cross" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
          <div ref={hitRef} className="bhz-hitmark" aria-hidden="true" />
          <div ref={dmgRef} className="bhz-dmg" aria-hidden="true" />
          {h.focus && (
            <div className={`bhz-prompt${h.focus.endsWith("|1") ? " is-locked" : ""}`}>
              {h.focus.endsWith("|1") ? <LockIcon /> : <kbd>E</kbd>}
              <span className="bhz-prompt__verb">{h.focus.split("|")[0]}</span>
              <span className="bhz-prompt__name">{h.focus.split("|")[1]}</span>
            </div>
          )}
          <div className="bhz-hud__keys">
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
          <div className="bhz-toasts" aria-live="polite">
            {toasts.map((t) => (
              <div key={t.id} className={`bhz-toast${t.kind ? ` is-${t.kind}` : ""}`}>
                {t.text}
              </div>
            ))}
          </div>
          {intro && (
            <div key={intro.key} className="bhz-intro">
              <div className="bhz-intro__zone">{zone.name}</div>
              <div className="bhz-intro__no">{`Level ${intro.id}`}</div>
              <div className="bhz-intro__name">{L.name}</div>
              <div className="bhz-intro__obj">{L.objective}</div>
            </div>
          )}
          {!locked && !overlay && simRef.current?.state === "play" && <div className="bhz-clickhint">Click to capture the mouse and play</div>}
        </div>
      )}

      {/* ------------------------------------------------ menus */}
      {screen === "menu" && (
        <div className="bhz-screen bhz-menu">
          <div className="bhz-menu__brand">
            <Logo />
            <div>
              <div className="bhz-menu__eyebrow">Escape Room · RPG · Shooter</div>
              <h1 className="bhz-menu__title">Biohazard Escape</h1>
              <div className="bhz-menu__sub">Project X</div>
            </div>
          </div>
          <p className="bhz-menu__tag">Survive the Infection. Uncover the Truth. Escape Alive.</p>
          <div className="bhz-menu__actions">
            <button type="button" className="bhz-btn bhz-btn--primary bhz-btn--big" disabled={noGL} onClick={() => startLevel(1)}>
              Play
            </button>
            {canContinue && (
              <button type="button" className="bhz-btn bhz-btn--big" disabled={noGL} onClick={() => startLevel(continueId)}>
                <span>Continue</span>
                <span className="bhz-btn__sub">{`Level ${continueId}`}</span>
              </button>
            )}
            <button type="button" className="bhz-btn" disabled={noGL} onClick={() => setScreen("levels")}>
              Level Select
            </button>
            <button
              type="button"
              className="bhz-btn"
              onClick={() => {
                setReturnTo("menu");
                setScreen("upgrades");
              }}
            >
              <span>Upgrades</span>
              {progress.points > 0 && <span className="bhz-badge-dot">{progress.points}</span>}
            </button>
            <button type="button" className="bhz-btn" onClick={() => setScreen("howto")}>
              How to Play
            </button>
            <button
              type="button"
              className="bhz-btn"
              onClick={() => {
                setReturnTo("menu");
                setScreen("settings");
              }}
            >
              Settings
            </button>
          </div>
          <div className="bhz-menu__foot">
            <span>{`${doneCount} / ${LEVEL_COUNT} levels complete`}</span>
            <span>{`Rank ${progress.rank}`}</span>
            {TOUCH && <span className="bhz-warn">This game needs a keyboard and mouse.</span>}
            {noGL && <span className="bhz-warn">3D graphics are not available in this browser.</span>}
          </div>
        </div>
      )}
      {screen === "levels" && (
        <div className="bhz-screen bhz-screen--dim">
          <LevelSelect progress={progress} onPlay={startLevel} onBack={() => setScreen("menu")} />
        </div>
      )}
      {screen === "upgrades" && (
        <div className="bhz-screen bhz-screen--dim">
          <Upgrades progress={progress} onBuy={onBuy} onRefund={onRefund} onBack={() => setScreen(returnTo === "levels" ? "levels" : "menu")} />
        </div>
      )}
      {screen === "howto" && (
        <div className="bhz-screen bhz-screen--dim">
          <HowTo onBack={() => setScreen("menu")} />
        </div>
      )}
      {screen === "settings" && !overlay && (
        <div className="bhz-screen bhz-screen--dim">
          <Settings settings={settings} onChange={changeSettings} onBack={() => setScreen(returnTo)} onReset={() => setOverlay("confirmReset")} />
        </div>
      )}
      {screen === "loading" && (
        <div className="bhz-screen bhz-loading" role="status" aria-label="Loading">
          <Logo />
          <div className="bhz-loading__text">Unsealing the sector…</div>
          <div className="bhz-dim">{`Level ${level} · ${L?.name}`}</div>
        </div>
      )}

      {/* ------------------------------------------------ overlays */}
      {overlay === "paused" && (
        <div className="bhz-screen bhz-screen--dim">
          <div className="bhz-panel bhz-pause" role="dialog" aria-label="Paused">
            <div className="bhz-eyebrow">{`Level ${level} · ${L?.name}`}</div>
            <h2>Paused</h2>
            <p className="bhz-dim">{L?.objective}</p>
            <button type="button" className="bhz-btn bhz-btn--primary" onClick={resume}>
              Resume
            </button>
            {lockHint && <p className="bhz-dim bhz-small">Click Resume again to capture the mouse.</p>}
            <div className="bhz-row">
              <button type="button" className="bhz-btn" onClick={restartLevel}>
                Restart Level
              </button>
              <button type="button" className="bhz-btn" onClick={() => setOverlay("upgrades")}>
                <span>Upgrades</span>
                {progress.points > 0 && <span className="bhz-badge-dot">{progress.points}</span>}
              </button>
            </div>
            <div className="bhz-row">
              <button type="button" className="bhz-btn bhz-btn--ghost" onClick={() => setOverlay("hint")}>
                Show Hint
              </button>
              <button type="button" className="bhz-btn bhz-btn--ghost" onClick={() => setOverlay("inventory")}>
                Inventory
              </button>
            </div>
            <div className="bhz-row">
              <button type="button" className="bhz-btn bhz-btn--ghost" onClick={() => setOverlay("howto")}>
                How to Play
              </button>
              <button type="button" className="bhz-btn bhz-btn--ghost" onClick={() => setOverlay("settings")}>
                Settings
              </button>
            </div>
            <button type="button" className="bhz-btn bhz-btn--ghost" onClick={() => setOverlay("confirmLeave")}>
              Exit to Menu
            </button>
          </div>
        </div>
      )}
      {overlay === "hint" && L && (
        <div className="bhz-screen bhz-screen--dim">
          <div className="bhz-panel bhz-hint" role="dialog" aria-label="Hint">
            <div className="bhz-eyebrow">{`Level ${level} · ${L.name}`}</div>
            <h2>Hint</h2>
            <p>{L.hints[0]}</p>
            {hintN > 1 && <p className="bhz-hint__more">{L.hints[1]}</p>}
            {hintN < 2 && (
              <button type="button" className="bhz-btn" onClick={() => setHintN(2)}>
                Show Another Hint
              </button>
            )}
            <button type="button" className="bhz-btn bhz-btn--primary" onClick={resume}>
              Back to the Facility
            </button>
          </div>
        </div>
      )}
      {overlay === "clue" && clue && <CluePanel clue={clue} onClose={resume} />}
      {overlay === "keypad" && keypadRef.current && (
        <Keypad
          key={keypadRef.current}
          onSubmit={(code) => {
            const s = simRef.current;
            const id = keypadRef.current;
            const ok = !!s?.enterCode(id, code);
            if (s) handleEvents(s);
            if (ok) later(resume, 700);
            return ok;
          }}
          onClose={resume}
        />
      )}
      {overlay === "inventory" && simRef.current && (
        <Inventory
          sim={simRef.current}
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
        <div className="bhz-screen bhz-screen--dim">
          <Upgrades progress={progress} onBuy={onBuy} onRefund={onRefund} onBack={() => setOverlay(simRef.current?.state === "complete" ? (levelRef.current === LEVEL_COUNT ? "final" : "complete") : "paused")} />
        </div>
      )}
      {overlay === "howto" && (
        <div className="bhz-screen bhz-screen--dim">
          <HowTo onBack={() => setOverlay("paused")} />
        </div>
      )}
      {overlay === "settings" && (
        <div className="bhz-screen bhz-screen--dim">
          <Settings settings={settings} onChange={changeSettings} onBack={() => setOverlay(screenRef.current === "play" ? "paused" : null)} />
        </div>
      )}
      {overlay === "dead" && death && (
        <div className="bhz-screen bhz-screen--dead">
          <div className="bhz-panel bhz-death" role="alertdialog" aria-label="You Died">
            <h2>You Died</h2>
            <p>{death.reason}</p>
            <button type="button" className="bhz-btn bhz-btn--primary bhz-btn--big" onClick={respawn}>
              Restart from Checkpoint
            </button>
            <div className="bhz-row">
              <button type="button" className="bhz-btn" onClick={restartLevel}>
                Restart Level
              </button>
              <button type="button" className="bhz-btn" onClick={toUpgrades}>
                Upgrades
              </button>
              <button type="button" className="bhz-btn bhz-btn--ghost" onClick={toMenu}>
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
        <div className="bhz-screen bhz-screen--dim">
          <div className="bhz-panel bhz-done" role="dialog" aria-label="Level Complete">
            <div className="bhz-eyebrow">{`Level ${result.id} · ${getLevel(result.id).name}`}</div>
            <h2>Level Complete</h2>
            <div className="bhz-stats">
              <div>
                <span className="bhz-stats__label">Time</span>
                <span className="bhz-stats__val">{fmt(result.time)}</span>
              </div>
              <div>
                <span className="bhz-stats__label">Kills</span>
                <span className="bhz-stats__val">{`${result.kills}`}</span>
              </div>
              <div>
                <span className="bhz-stats__label">Accuracy</span>
                <span className="bhz-stats__val">{`${result.acc}%`}</span>
              </div>
              <div>
                <span className="bhz-stats__label">XP earned</span>
                <span className="bhz-stats__val">{`+${result.xp}`}</span>
              </div>
            </div>
            {result.best && result.prev !== null && <div className="bhz-badge">New best time!</div>}
            <XpBar progress={progress} />
            <p className="bhz-dim">{`Level ${result.id + 1} is now unlocked.`}</p>
            <button type="button" className="bhz-btn bhz-btn--primary bhz-btn--big" onClick={() => startLevel(result.id + 1)}>
              Next Level
            </button>
            <div className="bhz-row">
              <button type="button" className="bhz-btn" onClick={() => setOverlay("upgrades")}>
                <span>Upgrades</span>
                {progress.points > 0 && <span className="bhz-badge-dot">{progress.points}</span>}
              </button>
              <button type="button" className="bhz-btn" onClick={() => startLevel(result.id)}>
                Replay
              </button>
              <button type="button" className="bhz-btn" onClick={toLevels}>
                Level Select
              </button>
            </div>
          </div>
        </div>
      )}
      {overlay === "final" && result && (
        <div className="bhz-screen bhz-final">
          <div className="bhz-final__sky" aria-hidden="true" />
          <div className="bhz-panel bhz-done bhz-done--final" role="dialog" aria-label="Victory">
            <Logo />
            <div className="bhz-eyebrow">All 25 levels complete</div>
            <h2>You Escaped</h2>
            <p>The evacuation lift breaks the surface as the facility collapses beneath you. Project X is ash, its research buried with it — and you are the only witness who knows the truth. Dawn has never looked so bright.</p>
            <div className="bhz-stats">
              <div>
                <span className="bhz-stats__label">Final escape</span>
                <span className="bhz-stats__val">{fmt(result.time)}</span>
              </div>
              <div>
                <span className="bhz-stats__label">Total best time</span>
                <span className="bhz-stats__val">{fmt(Object.values(progress.done).reduce((a, d) => a + d.time, 0))}</span>
              </div>
              <div>
                <span className="bhz-stats__label">Rank</span>
                <span className="bhz-stats__val">{progress.rank}</span>
              </div>
            </div>
            <div className="bhz-row">
              <button type="button" className="bhz-btn bhz-btn--primary" onClick={toLevels}>
                Level Select
              </button>
              <button type="button" className="bhz-btn" onClick={toMenu}>
                Main Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
