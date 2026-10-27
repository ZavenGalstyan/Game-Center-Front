/**
 * Oceanbound — menus: main menu, how to play, settings, pause, death /
 * recovery and the confirm dialog.
 */
import { useState } from "react";
import { Icon } from "./icons.jsx";

const ago = (ms) => {
  if (!ms) return "";
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
};

export function Logo() {
  return (
    <div className="ob-logo">
      <svg viewBox="0 0 120 60" className="ob-logo__mark" aria-hidden>
        <defs>
          <linearGradient id="obSun" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffd38a" />
            <stop offset="1" stopColor="#ff8a4a" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="34" r="20" fill="url(#obSun)" />
        <path d="M60 10v28M60 12l16 20H60z" fill="#f4ead2" stroke="#3a2a1a" strokeWidth="2" />
        <path d="M34 40h52l-5 6H39z" fill="#b98a55" stroke="#3a2a1a" strokeWidth="2" />
        <path d="M6 48c10-5 18-5 27 0s18 5 27 0 18-5 27 0 18 5 27 0" fill="none" stroke="#5fd4e8" strokeWidth="3" strokeLinecap="round" />
        <path d="M14 55c10-4 18-4 27 0s18 4 27 0 18-4 27 0" fill="none" stroke="#2fa8c8" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <h1>OCEANBOUND</h1>
      <div className="ob-logo__sub">Survival Journey</div>
      <div className="ob-logo__tag">Lost at Sea. Build to Survive.</div>
    </div>
  );
}

export function MainMenu({ info, onContinue, onNew, onHow, onSettings }) {
  const [confirm, setConfirm] = useState(false);
  const [diff, setDiff] = useState("normal");
  return (
    <div className="ob-menu" data-ui>
      <Logo />
      <div className="ob-menu__btns">
        {info && (
          <button type="button" className="ob-btn ob-btn--big" onClick={onContinue}>
            <span>Continue</span>
            <small>
              Day {info.day} · {info.cells} foundations · {ago(info.savedAt)}
            </small>
          </button>
        )}
        <button type="button" className={`ob-btn ob-btn--big${info ? " ob-btn--ghost" : ""}`} onClick={() => setConfirm(true)}>
          <span>New Game</span>
          <small>A tiny raft, a hook and the open sea</small>
        </button>
        <div className="ob-menu__row">
          <button type="button" className="ob-btn ob-btn--ghost" onClick={onHow}>
            How to Play
          </button>
          <button type="button" className="ob-btn ob-btn--ghost" onClick={onSettings}>
            Settings
          </button>
        </div>
      </div>
      {confirm && (
        <div className="ob-dialog" data-ui>
          <div className="ob-dialog__card">
            <h3>Start a new journey</h3>
            {info && <p className="ob-dialog__warn">This replaces your current raft (Day {info.day}). The previous save is kept as a backup.</p>}
            <div className="ob-seg">
              {[
                ["easy", "Calm Seas", "Slower hunger & thirst"],
                ["normal", "Castaway", "The intended challenge"],
                ["hard", "Storm Born", "Hungrier, thirstier"],
              ].map(([k, t, d]) => (
                <button type="button" key={k} className={`ob-seg__b${diff === k ? " is-on" : ""}`} onClick={() => setDiff(k)}>
                  <b>{t}</b>
                  <small>{d}</small>
                </button>
              ))}
            </div>
            <div className="ob-dialog__acts">
              <button type="button" className="ob-btn ob-btn--ghost" onClick={() => setConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="ob-btn" onClick={() => onNew(diff)}>
                Set Sail
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="ob-menu__foot">An original survival game · progress saves on this device</div>
    </div>
  );
}

export function HowTo({ onBack, touch }) {
  return (
    <div className="ob-sheet" data-ui>
      <div className="ob-sheet__card" data-scroll>
        <h2>How to Play</h2>
        <div className="ob-how">
          <section>
            <h4>Survive</h4>
            <ul>
              <li>Watch <b>health, hunger, thirst</b> and <b>stamina</b> (bottom left). Hunger or thirst at zero drains health.</li>
              <li>Fill a <b>cup</b> from the sea, pour it into a <b>purifier</b>, collect fresh water and drink.</li>
              <li>Catch fish with a <b>rod</b>: hold to cast, click when the bobber dips. Cook on a <b>grill</b>.</li>
              <li>Underwater your <b>oxygen</b> runs out — surface in time.</li>
            </ul>
          </section>
          <section>
            <h4>Gather & build</h4>
            <ul>
              <li>Hold <b>use</b> with the hook to charge, release to throw, hold again to reel debris in.</li>
              <li>Open the inventory to <b>craft</b> — recipes use real materials; objectives unlock more.</li>
              <li>Equip the <b>hammer</b> and press <b>B</b> to choose pieces. Foundations must touch the raft.</li>
              <li>Collection nets on outer edges catch debris as you drift. Sails steer, anchors hold.</li>
            </ul>
          </section>
          <section>
            <h4>Explore</h4>
            <ul>
              <li><b>Palm</b> islands: wood, leaves, coconuts. <b>Rocky</b>: stone, clay, metal ore. <b>Jungle</b>: bamboo, vines, mangoes.</li>
              <li>The compass shows islands, your raft and anything you lost. Ruins hide crates and logbook pages.</li>
              <li>The <b>shark</b> warns before it strikes. Spear it to drive it off; repair bites with the hammer (E).</li>
              <li>If you die you wake on the raft — your materials wait in a satchel where you fell.</li>
            </ul>
          </section>
          <section className="ob-keys">
            <h4>{touch ? "Touch controls" : "Controls"}</h4>
            {touch ? (
              <ul>
                <li>Left side: drag to move · Right side: drag to look</li>
                <li>Use / Jump / E / Run (Dive in water) buttons on the right</li>
                <li>Top-right: inventory, build menu, pause · tap the hotbar to equip</li>
              </ul>
            ) : (
              <div className="ob-keygrid">
                {[
                  ["W A S D", "Move"],
                  ["Mouse", "Look"],
                  ["Space", "Jump · swim up · climb aboard"],
                  ["Shift", "Sprint"],
                  ["C / Ctrl", "Dive"],
                  ["E", "Interact"],
                  ["LMB", "Use tool"],
                  ["RMB / X", "Remove piece (hammer)"],
                  ["R", "Rotate piece · turn sail"],
                  ["1–8 / wheel", "Hotbar"],
                  ["Tab", "Inventory & crafting"],
                  ["B", "Build menu"],
                  ["Esc", "Pause"],
                ].map(([k, d]) => (
                  <div key={k}>
                    <kbd>{k}</kbd>
                    <span>{d}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
        <div className="ob-sheet__acts">
          <button type="button" className="ob-btn" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

function Range({ label, v, min, max, step, fmt, onChange }) {
  return (
    <label className="ob-range">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => onChange(+e.target.value)} />
      <b>{fmt ? fmt(v) : v}</b>
    </label>
  );
}
function Toggle({ label, v, onChange }) {
  return (
    <button type="button" className={`ob-toggle${v ? " is-on" : ""}`} onClick={() => onChange(!v)}>
      <span>{label}</span>
      <i />
    </button>
  );
}
export function Settings({ s, set, onBack, onFullscreen }) {
  const pct = (v) => `${Math.round(v * 100)}%`;
  return (
    <div className="ob-sheet" data-ui>
      <div className="ob-sheet__card" data-scroll>
        <h2>Settings</h2>
        <div className="ob-set">
          <section>
            <h4>Graphics</h4>
            <div className="ob-seg">
              {[
                ["auto", "Auto"],
                ["low", "Low"],
                ["medium", "Medium"],
                ["high", "High"],
              ].map(([k, t]) => (
                <button type="button" key={k} className={`ob-seg__b${s.quality === k ? " is-on" : ""}`} onClick={() => set({ quality: k })}>
                  <b>{t}</b>
                </button>
              ))}
            </div>
            <Range label="Field of view" v={s.fov} min={55} max={95} step={1} fmt={(v) => `${v}°`} onChange={(fov) => set({ fov })} />
            <Toggle label="Head bob" v={s.bob} onChange={(bob) => set({ bob })} />
            <Toggle label="Show FPS" v={s.showFps} onChange={(showFps) => set({ showFps })} />
            {onFullscreen && (
              <button type="button" className="ob-btn ob-btn--ghost ob-btn--sm" onClick={onFullscreen}>
                Toggle fullscreen
              </button>
            )}
          </section>
          <section>
            <h4>Audio</h4>
            <Range label="Master" v={s.master} min={0} max={1} step={0.05} fmt={pct} onChange={(master) => set({ master })} />
            <Range label="Music" v={s.music} min={0} max={1} step={0.05} fmt={pct} onChange={(music) => set({ music })} />
            <Range label="Effects" v={s.sfx} min={0} max={1} step={0.05} fmt={pct} onChange={(sfx) => set({ sfx })} />
            <Range label="Ambience" v={s.amb} min={0} max={1} step={0.05} fmt={pct} onChange={(amb) => set({ amb })} />
          </section>
          <section>
            <h4>Controls</h4>
            <Range label="Mouse sensitivity" v={s.sens} min={0.3} max={2.5} step={0.05} fmt={(v) => v.toFixed(2)} onChange={(sens) => set({ sens })} />
            <Range label="Touch sensitivity" v={s.touchSens} min={0.3} max={2.5} step={0.05} fmt={(v) => v.toFixed(2)} onChange={(touchSens) => set({ touchSens })} />
            <Toggle label="Invert look" v={s.invert} onChange={(invert) => set({ invert })} />
          </section>
        </div>
        <div className="ob-sheet__acts">
          <button type="button" className="ob-btn" onClick={onBack}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export function Pause({ onResume, onSettings, onHow, onQuit, onLog, pages, stats }) {
  return (
    <div className="ob-sheet ob-sheet--pause" data-ui>
      <div className="ob-pause">
        <h2>Paused</h2>
        <div className="ob-pause__stats">
          <span>Day {stats.day}</span>
          <span>{stats.cells} foundations</span>
          <span>{Math.round(stats.dist)} m drifted</span>
        </div>
        <button type="button" className="ob-btn ob-btn--big" onClick={onResume}>
          Resume
        </button>
        <button type="button" className="ob-btn ob-btn--ghost" onClick={onSettings}>
          Settings
        </button>
        <button type="button" className="ob-btn ob-btn--ghost" onClick={onHow}>
          How to Play
        </button>
        {pages > 0 && (
          <button type="button" className="ob-btn ob-btn--ghost" onClick={onLog}>
            <Icon id="book" size={16} /> Logbook ({pages}/5)
          </button>
        )}
        <button type="button" className="ob-btn ob-btn--ghost" onClick={onQuit}>
          Save & Quit to Menu
        </button>
      </div>
    </div>
  );
}

const CAUSES = {
  shark: "The shark dragged you under.",
  drown: "You ran out of air beneath the waves.",
  hunger: "Hunger finally took its toll.",
  thirst: "Without fresh water, the sun won.",
  fall: "That was a long way down.",
  food: "Something you ate disagreed with you.",
};
export function Death({ dead, onRespawn, hasSatchel }) {
  const ready = dead.t > 1.6;
  return (
    <div className="ob-death" data-ui>
      <div className="ob-death__card">
        <small>You were lost to the sea</small>
        <h2>Washed Away</h2>
        <p>{CAUSES[dead.cause] || "The ocean is unforgiving."}</p>
        {hasSatchel && <p className="ob-death__note">Your materials sank into a satchel where you fell — follow the compass to recover them. Tools stay with you.</p>}
        <button type="button" className="ob-btn ob-btn--big" disabled={!ready} onClick={onRespawn}>
          Wake up on the raft
        </button>
      </div>
    </div>
  );
}

export function Confirm({ title, text, ok, onOk, onCancel }) {
  return (
    <div className="ob-dialog" data-ui>
      <div className="ob-dialog__card">
        <h3>{title}</h3>
        <p>{text}</p>
        <div className="ob-dialog__acts">
          <button type="button" className="ob-btn ob-btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="ob-btn" onClick={onOk}>
            {ok}
          </button>
        </div>
      </div>
    </div>
  );
}
