/**
 * Web Hero — menu screens over the live 3D skyline:
 *   MainMenu · MissionSelect (5 district cards → 6 missions each) ·
 *   Upgrades (XP upgrades + Hero-Token suits) · HowToPlay · SettingsPanel
 */
import { useState } from "react";
import { DISTRICTS } from "../data/districts.js";
import { missionMeta, MISSION_COUNT, PER_DISTRICT } from "../data/missions.js";
import { SUITS } from "../data/suits.js";
import { UPGRADES, UPGRADE_IDS, ABILITY_UNLOCK, ABILITIES } from "../engine/config.js";
import { isUnlocked, isCompleted, tokenCount, completedCount } from "../utils/storage.js";
import { sound } from "../audio/sound.js";

const click = (fn) => () => {
  sound.uiClick();
  fn();
};

export function MainMenu({ progress, onPlay, onNav }) {
  const done = completedCount(progress);
  const tokens = tokenCount(progress);
  return (
    <div className="wh-screen wh-main">
      <div className="wh-title">
        <div className="wh-title__web">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <line key={i} x1="50" y1="50" x2={50 + Math.cos((i / 8) * Math.PI * 2) * 48} y2={50 + Math.sin((i / 8) * Math.PI * 2) * 48} />
            ))}
            {[14, 26, 38].map((r) => (
              <polygon key={r} points={[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `${50 + Math.cos((i / 8) * Math.PI * 2) * r},${50 + Math.sin((i / 8) * Math.PI * 2) * r}`).join(" ")} />
            ))}
          </svg>
        </div>
        <h1 className="wh-title__main">WEB HERO</h1>
        <div className="wh-title__sub">CITY DEFENDER</div>
        <div className="wh-title__tag">SWING • FIGHT • SAVE</div>
      </div>
      <nav className="wh-main__nav">
        <button type="button" className="wh-btn wh-btn--primary wh-btn--big" onClick={click(onPlay)} onMouseEnter={() => sound.uiMove()}>
          {done ? "CONTINUE" : "PLAY"}
        </button>
        {[
          ["missions", "MISSION SELECT"],
          ["upgrades", "UPGRADES"],
          ["howto", "HOW TO PLAY"],
          ["settings", "SETTINGS"],
        ].map(([k, label]) => (
          <button key={k} type="button" className="wh-btn" onClick={click(() => onNav(k))} onMouseEnter={() => sound.uiMove()}>
            {label}
          </button>
        ))}
      </nav>
      <div className="wh-main__stats">
        <span>
          <b>{done}</b>/{MISSION_COUNT} missions
        </span>
        <span>
          <b>{tokens}</b>/90 hero tokens
        </span>
        <span>
          <b>{progress.xp.toLocaleString()}</b> XP
        </span>
      </div>
    </div>
  );
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function MissionSelect({ progress, onPlay, onBack, initialDistrict = 1 }) {
  const [dist, setDist] = useState(initialDistrict);
  const D = DISTRICTS[dist - 1];
  const first = (dist - 1) * PER_DISTRICT + 1;
  const ids = Array.from({ length: PER_DISTRICT }, (_, i) => first + i);
  return (
    <div className="wh-screen wh-select">
      <div className="wh-select__head">
        <button type="button" className="wh-btn wh-btn--ghost" onClick={click(onBack)}>
          ◂ Back
        </button>
        <h2>MISSION SELECT</h2>
      </div>
      <div className="wh-districts">
        {DISTRICTS.map((d) => {
          const f = (d.id - 1) * PER_DISTRICT + 1;
          const open = isUnlocked(progress, f);
          let n = 0;
          for (let i = 0; i < PER_DISTRICT; i++) if (isCompleted(progress, f + i)) n++;
          return (
            <button
              key={d.id}
              type="button"
              className={`wh-district wh-district--${d.key}${dist === d.id ? " is-active" : ""}${open ? "" : " is-locked"}`}
              style={{ "--da": d.colors.a, "--db": d.colors.b, "--sky1": d.sky.top, "--sky2": d.sky.horizon }}
              onClick={click(() => setDist(d.id))}
            >
              <div className="wh-district__sky">
                <div className="wh-district__skyline" />
              </div>
              <div className="wh-district__body">
                <div className="wh-district__num">DISTRICT {d.id}</div>
                <div className="wh-district__name">{d.name}</div>
                <div className="wh-district__prog">
                  <div style={{ width: `${(n / PER_DISTRICT) * 100}%` }} />
                </div>
                <div className="wh-district__meta">{open ? `${n}/${PER_DISTRICT} complete` : "🔒 Locked"}</div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="wh-missions" style={{ "--da": D.colors.a }}>
        <p className="wh-missions__blurb">{D.blurb}</p>
        <div className="wh-missions__grid">
          {ids.map((id) => {
            const m = missionMeta(id);
            const open = isUnlocked(progress, id);
            const c = progress.completed[id];
            const playable = open && m.built;
            return (
              <button key={id} type="button" className={`wh-mission${playable ? "" : " is-locked"}${c ? " is-done" : ""}${m.boss ? " is-boss" : ""}`} disabled={!playable} onClick={click(() => onPlay(id))}>
                <div className="wh-mission__top">
                  <span className="wh-mission__id">{id}</span>
                  {m.boss ? <span className="wh-mission__tag">BOSS</span> : null}
                  {c ? <span className={`wh-grade-chip wh-grade-chip--${c.grade}`}>{c.grade}</span> : null}
                </div>
                <div className="wh-mission__nm">{open ? m.name : "Locked"}</div>
                <div className="wh-mission__info">
                  {!open ? "Complete the previous mission" : !m.built ? "Coming soon" : c ? `Best ${c.score.toLocaleString()} · ${fmt(c.time)}` : "Not played yet"}
                </div>
                {c ? (
                  <div className="wh-mission__tokens">
                    {c.tokens.map((g, i) => (
                      <span key={i} className={`wh-token${g ? " is-got" : ""}`} />
                    ))}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function Upgrades({ progress, onBuy, onSuit, onBack }) {
  const tokens = tokenCount(progress);
  return (
    <div className="wh-screen wh-upg">
      <div className="wh-select__head">
        <button type="button" className="wh-btn wh-btn--ghost" onClick={click(onBack)}>
          ◂ Back
        </button>
        <h2>UPGRADES</h2>
        <div className="wh-upg__xp">
          <b>{progress.xp.toLocaleString()}</b> XP available
        </div>
      </div>
      <div className="wh-upg__cols">
        <section className="wh-panel">
          <h3>Hero skills</h3>
          <div className="wh-upg__list">
            {UPGRADE_IDS.map((id) => {
              const U = UPGRADES[id];
              const lvl = progress.upgrades[id] || 0;
              const maxed = lvl >= U.max;
              const cost = maxed ? 0 : U.cost[lvl];
              const can = !maxed && progress.xp >= cost;
              return (
                <div key={id} className="wh-upg__row">
                  <div>
                    <div className="wh-upg__name">{U.name}</div>
                    <div className="wh-upg__desc">{U.desc}</div>
                    <div className="wh-pips">
                      {Array.from({ length: U.max }, (_, i) => (
                        <span key={i} className={i < lvl ? "is-on" : ""} />
                      ))}
                    </div>
                  </div>
                  <button type="button" className={`wh-btn ${can ? "wh-btn--primary" : ""}`} disabled={!can} onClick={click(() => onBuy(id))}>
                    {maxed ? "MAX" : `${cost.toLocaleString()} XP`}
                  </button>
                </div>
              );
            })}
          </div>
          <h3>Web abilities</h3>
          <div className="wh-upg__abil">
            {Object.entries(ABILITY_UNLOCK).map(([k, m]) => {
              const on = m <= 1 || !!progress.completed[m - 1];
              return (
                <div key={k} className={`wh-upg__ab${on ? " is-on" : ""}`}>
                  <b>{ABILITIES[k].name}</b>
                  <span>{on ? `Key ${ABILITIES[k].key} · ${ABILITIES[k].cd}s cooldown` : `Unlocks after Mission ${m - 1}`}</span>
                </div>
              );
            })}
          </div>
        </section>
        <section className="wh-panel">
          <h3>
            Suits <small>{tokens}/90 Hero Tokens</small>
          </h3>
          <div className="wh-suits">
            {SUITS.map((s) => {
              const open = tokens >= s.need;
              const on = progress.suit === s.id;
              return (
                <button key={s.id} type="button" className={`wh-suit${on ? " is-on" : ""}${open ? "" : " is-locked"}`} disabled={!open} onClick={click(() => onSuit(s.id))} style={{ "--s1": s.base, "--s2": s.accent, "--s3": s.dark }}>
                  <div className="wh-suit__swatch">
                    <span />
                  </div>
                  <div className="wh-suit__name">{s.name}</div>
                  <div className="wh-suit__need">{on ? "Equipped" : open ? s.blurb : `🔒 ${s.need} tokens`}</div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

const CONTROLS = [
  ["W A S D", "Move (camera-relative)"],
  ["Mouse", "Rotate the camera"],
  ["Space", "Jump · press again in the air to double jump"],
  ["Shift", "Sprint · sprint along a wall in the air to wall-run"],
  ["Q (hold)", "Web swing — attaches to a real building; release to let go and keep your momentum"],
  ["Left click", "Light attack (punch combos)"],
  ["F", "Heavy attack · finisher on a weakened enemy"],
  ["Right click", "Web shot — slows; three hits web-trap an enemy"],
  ["Ctrl / C", "Dodge — dodge as an attack lands for a PERFECT dodge + counter"],
  ["E (hold)", "Interact · rescue civilians · disable devices"],
  ["R", "Web Storm (when Hero Energy is full)"],
  ["1 – 5", "Web Trap · Web Pull · Web Strike · Web Shield · Web Burst"],
  ["Esc / P", "Pause"],
];
const COMBOS = [
  ["LMB → LMB → LMB", "Punch, punch, spinning kick"],
  ["LMB → F", "Heavy punch (breaks shields)"],
  ["F → F → jump + LMB", "Kick, launcher, aerial strike"],
  ["2 (Web Pull) → LMB → LMB", "Pull punch, pull kick"],
  ["Perfect dodge → LMB", "Counter attack"],
];

export function HowToPlay({ onBack }) {
  return (
    <div className="wh-panel wh-panel--wide">
      <h2>HOW TO PLAY</h2>
      <div className="wh-howto">
        <div>
          <h3>Controls</h3>
          <dl className="wh-keys">
            {CONTROLS.map(([k, v]) => (
              <div key={k}>
                <dt>
                  <kbd>{k}</kbd>
                </dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h3>Combos</h3>
          <dl className="wh-keys">
            {COMBOS.map(([k, v]) => (
              <div key={k}>
                <dt>
                  <kbd>{k}</kbd>
                </dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <h3>Tips</h3>
          <ul className="wh-tips">
            <li>A ring glows under an enemy before it strikes — red means dodge now.</li>
            <li>Swing low through the arc to build speed, release near the top to fly.</li>
            <li>Shield guards block from the front: heavy attacks, Web Pull or hit them from behind.</li>
            <li>Webbed drones drop out of the sky. Bosses only take damage when their weak point glows.</li>
            <li>Three Hero Tokens hide in every mission — they unlock new suits.</li>
          </ul>
        </div>
      </div>
      <button type="button" className="wh-btn wh-btn--primary" onClick={click(onBack)}>
        Back
      </button>
    </div>
  );
}

export function SettingsPanel({ settings, muted, onChange, onBack }) {
  const slider = (key, label, min = 0, max = 1, step = 0.05) => (
    <label className="wh-set">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={settings[key]} onChange={(e) => onChange({ [key]: Number(e.target.value) })} />
      <b>{max <= 1 ? Math.round(settings[key] * 100) : settings[key].toFixed(1)}</b>
    </label>
  );
  const toggle = (key, label) => (
    <label className="wh-set wh-set--toggle">
      <span>{label}</span>
      <input type="checkbox" checked={!!settings[key]} onChange={(e) => onChange({ [key]: e.target.checked })} />
    </label>
  );
  return (
    <div className="wh-panel wh-panel--settings">
      <h2>SETTINGS</h2>
      {muted ? <p className="wh-note">Sound is muted by the Game Center's Mute button.</p> : null}
      <div className="wh-sets">
        <h3>Audio</h3>
        {slider("master", "Master volume")}
        {slider("music", "Music")}
        {slider("sfx", "Effects")}
        <h3>Camera</h3>
        {slider("sensitivity", "Mouse sensitivity", 0.3, 2.5, 0.1)}
        {slider("camDistance", "Camera distance", 4.5, 9, 0.5)}
        {toggle("invertY", "Invert Y")}
        {toggle("camAssist", "Camera assist (follows swings)")}
        <h3>Graphics</h3>
        <label className="wh-set">
          <span>Quality</span>
          <select value={settings.graphics} onChange={(e) => onChange({ graphics: e.target.value })}>
            <option value="low">Low (no shadows)</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        {toggle("reducedMotion", "Reduced motion (less shake, no trails)")}
        {toggle("showHints", "Show tutorial hints")}
      </div>
      <p className="wh-note">Quality changes apply to the next mission you start.</p>
      <button type="button" className="wh-btn wh-btn--primary" onClick={click(onBack)}>
        Done
      </button>
    </div>
  );
}
