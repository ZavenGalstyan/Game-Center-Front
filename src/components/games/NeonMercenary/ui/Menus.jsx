/**
 * Main menu, character creator, pause menu, settings and controls.
 */
import { useState } from "react";
import { CONTRACT_BY_ID } from "../data/contracts.js";
import { DISTRICTS } from "../data/districts/index.js";

const fmtTime = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
};

export function MainMenu({ save, onNew, onContinue, onSettings, onControls, boot }) {
  const P = save?.profile;
  const next = P ? (P.story.active ? CONTRACT_BY_ID[P.story.active.id] : CONTRACT_BY_ID[P.story.done.length + 1]) : null;
  return (
    <div className="nm-menu">
      <div className="nm-menu__brand">
        <div className="nm-menu__kicker">A CYBERPUNK ACTION RPG</div>
        <h1 className="nm-title" data-text="NEON MERCENARY">
          NEON <span>MERCENARY</span>
        </h1>
        <div className="nm-menu__tag">TAKE THE CONTRACT. OWN THE NIGHT.</div>
      </div>
      <div className="nm-menu__list">
        {P && (
          <button className="nm-btn nm-btn--primary" onClick={onContinue} disabled={!boot}>
            <span>Continue</span>
            <small>
              Lvl {P.level} · {DISTRICTS[P.district]?.name} · {P.ending ? "Story complete" : next ? `#${next.id} ${next.title}` : ""}
            </small>
          </button>
        )}
        <button className={`nm-btn${P ? "" : " nm-btn--primary"}`} onClick={onNew} disabled={!boot}>
          <span>New Game</span>
          <small>{P ? "Start over (your save is replaced)" : "Begin your first contract"}</small>
        </button>
        <button className="nm-btn" onClick={onSettings}>
          <span>Settings</span>
          <small>Graphics, audio, controls</small>
        </button>
        <button className="nm-btn" onClick={onControls}>
          <span>Controls</span>
          <small>Keyboard & mouse</small>
        </button>
      </div>
      {!boot && <div className="nm-menu__loading">Loading city…</div>}
      {P && (
        <div className="nm-menu__stats">
          {P.story.done.length}/20 contracts · {P.stats.kills} kills · {fmtTime(P.stats.time)} played
        </div>
      )}
      <div className="nm-menu__credit">Characters & animation: Quaternius (CC0) · Everything else made in code</div>
    </div>
  );
}

const ACCENTS = ["#19f0ff", "#ff2bd6", "#a64dff", "#4dff9a", "#ffb02e", "#ff3b5c"];
const HAIRS = {
  m: [
    ["Hair_SimpleParted", "Parted"],
    ["Hair_Buzzed", "Buzzed"],
    ["Hair_Long", "Long"],
    ["Hair_Beard", "Beard"],
  ],
  f: [
    ["Hair_Long", "Long"],
    ["Hair_Buns", "Buns"],
    ["Hair_BuzzedFemale", "Buzzed"],
  ],
};
export function Creator({ look, setLook, onStart, onBack }) {
  return (
    <div className="nm-creator">
      <div className="nm-panel nm-creator__panel">
        <h2 className="nm-h2">Create your Operative</h2>
        <p className="nm-dim">Freelance mercenary, Neon Market. Rent overdue. Reputation: none — yet.</p>
        <label className="nm-field">
          <span>Body</span>
          <div className="nm-seg">
            {[
              ["m", "Masculine"],
              ["f", "Feminine"],
            ].map(([v, l]) => (
              <button key={v} className={look.body === v ? "on" : ""} onClick={() => setLook({ ...look, body: v, hair: HAIRS[v][0][0] })}>
                {l}
              </button>
            ))}
          </div>
        </label>
        <label className="nm-field">
          <span>Skin</span>
          <div className="nm-seg">
            {[
              ["light", "Light"],
              ["dark", "Dark"],
            ].map(([v, l]) => (
              <button key={v} className={look.skin === v ? "on" : ""} onClick={() => setLook({ ...look, skin: v })}>
                {l}
              </button>
            ))}
          </div>
        </label>
        <label className="nm-field">
          <span>Hair</span>
          <div className="nm-seg">
            {HAIRS[look.body].map(([v, l]) => (
              <button key={v} className={look.hair === v ? "on" : ""} onClick={() => setLook({ ...look, hair: v })}>
                {l}
              </button>
            ))}
          </div>
        </label>
        <label className="nm-field">
          <span>Neon accent</span>
          <div className="nm-swatches">
            {ACCENTS.map((c) => (
              <button key={c} className={look.accent === c ? "on" : ""} style={{ "--c": c }} onClick={() => setLook({ ...look, accent: c })} aria-label={c} />
            ))}
          </div>
        </label>
        <div className="nm-row nm-row--end">
          <button className="nm-btn nm-btn--ghost" onClick={onBack}>
            Back
          </button>
          <button className="nm-btn nm-btn--primary" onClick={onStart}>
            <span>Wake up</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function PauseMenu({ onResume, onOpen, onSave, onQuit, onAbandon, activeTitle, saved }) {
  return (
    <div className="nm-modal">
      <div className="nm-panel nm-pause">
        <h2 className="nm-h2">Paused</h2>
        <div className="nm-pause__list">
          <button className="nm-btn nm-btn--primary" onClick={onResume}>
            <span>Resume</span>
          </button>
          <button className="nm-btn" onClick={() => onOpen("inventory")}>
            <span>Inventory & Character</span>
            <small>Tab</small>
          </button>
          <button className="nm-btn" onClick={() => onOpen("journal")}>
            <span>Quest Journal</span>
            <small>J</small>
          </button>
          <button className="nm-btn" onClick={() => onOpen("map")}>
            <span>District Map</span>
            <small>M</small>
          </button>
          <button className="nm-btn" onClick={() => onOpen("settings")}>
            <span>Settings</span>
          </button>
          <button className="nm-btn" onClick={onSave}>
            <span>Save Game</span>
            <small>{saved ? "Saved ✓" : "Checkpoint progress is also saved automatically"}</small>
          </button>
          {activeTitle && (
            <button className="nm-btn nm-btn--danger" onClick={onAbandon}>
              <span>Abandon contract</span>
              <small>{activeTitle} — re-accept it at any Contract Terminal</small>
            </button>
          )}
          <button className="nm-btn nm-btn--ghost" onClick={onQuit}>
            <span>Save & quit to menu</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function Settings({ settings, setSetting, onClose, onReset, inGame }) {
  const [confirm, setConfirm] = useState(false);
  const slider = (k, label, min = 0, max = 1, step = 0.05) => (
    <label className="nm-field">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={settings[k]} onChange={(e) => setSetting(k, +e.target.value)} />
      <em>{k === "sens" ? `${settings[k].toFixed(2)}×` : `${Math.round(settings[k] * 100)}%`}</em>
    </label>
  );
  return (
    <div className="nm-modal">
      <div className="nm-panel nm-settings">
        <h2 className="nm-h2">Settings</h2>
        <label className="nm-field">
          <span>Graphics quality</span>
          <div className="nm-seg">
            {["low", "medium", "high"].map((q) => (
              <button key={q} className={settings.quality === q ? "on" : ""} onClick={() => setSetting("quality", q)}>
                {q[0].toUpperCase() + q.slice(1)}
              </button>
            ))}
          </div>
        </label>
        <p className="nm-dim nm-small">Low: no shadows or bloom, lighter rain. Medium: soft shadows + bloom. High: sharper shadows, MSAA, colour grading, denser weather.</p>
        {slider("sens", "Mouse sensitivity", 0.2, 3, 0.05)}
        <label className="nm-field">
          <span>Invert mouse Y</span>
          <div className="nm-seg">
            {[false, true].map((v) => (
              <button key={String(v)} className={settings.invertY === v ? "on" : ""} onClick={() => setSetting("invertY", v)}>
                {v ? "On" : "Off"}
              </button>
            ))}
          </div>
        </label>
        {slider("master", "Master volume")}
        {slider("music", "Music")}
        {slider("sfx", "Effects")}
        <label className="nm-field">
          <span>Tutorial hints</span>
          <div className="nm-seg">
            {[true, false].map((v) => (
              <button key={String(v)} className={settings.showHints === v ? "on" : ""} onClick={() => setSetting("showHints", v)}>
                {v ? "On" : "Off"}
              </button>
            ))}
          </div>
        </label>
        <div className="nm-row nm-row--end">
          {!inGame && (
            <button className={`nm-btn nm-btn--danger${confirm ? " nm-btn--confirm" : ""}`} onClick={() => (confirm ? (onReset(), setConfirm(false)) : setConfirm(true))}>
              <span>{confirm ? "Really delete all progress?" : "Reset progress"}</span>
            </button>
          )}
          <button className="nm-btn nm-btn--primary" onClick={onClose}>
            <span>Done</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export const CONTROLS = [
  ["W A S D", "Move"],
  ["Mouse", "Look / aim camera"],
  ["Left mouse", "Fire / slash"],
  ["Right mouse", "Aim down sights"],
  ["Shift", "Sprint (uses stamina)"],
  ["Space", "Jump"],
  ["Ctrl", "Crouch (standing still) · Dodge roll (moving)"],
  ["C / V", "Crouch / dodge (alternates for Ctrl)"],
  ["E", "Interact (hold for long actions)"],
  ["R", "Reload"],
  ["Q", "Cybernetic ability"],
  ["F", "Quick melee (strike from behind = silent takedown)"],
  ["1 2 3 / wheel", "Switch weapons"],
  ["H", "Use a MedKit"],
  ["Tab", "Inventory, character, skills, cyberware"],
  ["J", "Quest journal"],
  ["M", "District map"],
  ["Esc", "Pause"],
];
export function Controls({ onClose }) {
  return (
    <div className="nm-modal">
      <div className="nm-panel nm-controls">
        <h2 className="nm-h2">Controls</h2>
        <div className="nm-controls__grid">
          {CONTROLS.map(([k, v]) => (
            <div key={k} className="nm-controls__row">
              <kbd>{k}</kbd>
              <span>{v}</span>
            </div>
          ))}
        </div>
        <p className="nm-dim nm-small">Click the game to capture the mouse. In fullscreen, browser shortcuts like Ctrl+W are locked so crouch-walking is safe.</p>
        <div className="nm-row nm-row--end">
          <button className="nm-btn nm-btn--primary" onClick={onClose}>
            <span>Got it</span>
          </button>
        </div>
      </div>
    </div>
  );
}
