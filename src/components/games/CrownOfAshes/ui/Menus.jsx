/**
 * Title screen, hero selection, story intro, pause, settings and controls.
 */
import { useState } from "react";
import { HEROES, ABILITIES } from "../data/heroes.js";
import { QUESTS } from "../data/quests.js";
import { Icon } from "./icons.jsx";

const HERO_ICON = { knight: "shield", archer: "bow", mage: "staff", rogue: "dagger" };
export { HERO_ICON };

function fmtTime(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function MainMenu({ save, ready, onNew, onContinue, onSettings, onControls, toast }) {
  const P = save?.profile;
  const tracked = P?.tracked && QUESTS[P.tracked]?.name;
  return (
    <div className="coa-menu">
      <div className="coa-menu__title">
        <div className="coa-menu__crown">
          <Icon name="crown" size={44} />
        </div>
        <h1>
          Crown of Ashes
          <span>Kingdoms at War</span>
        </h1>
        <p className="coa-menu__tag">Forge Your Destiny. Claim the Crown.</p>
      </div>
      <div className="coa-menu__buttons">
        {P && (
          <button className="coa-btn coa-btn--primary" disabled={!ready} onClick={onContinue}>
            Continue
            <small>
              {HEROES[P.hero].name} · Level {P.level} · {fmtTime(P.stats.time || 0)}
              {tracked ? ` · ${tracked}` : ""}
            </small>
          </button>
        )}
        <button className={`coa-btn${P ? "" : " coa-btn--primary"}`} disabled={!ready} onClick={onNew}>
          New Game
          {P && <small>Starts a new campaign (your current save is replaced when you begin)</small>}
        </button>
        <button className="coa-btn" onClick={onSettings}>
          Settings
        </button>
        <button className="coa-btn" onClick={onControls}>
          Controls
        </button>
        {!ready && <div className="coa-menu__loading">Gathering the realm…</div>}
      </div>
      {toast && <div className="coa-menu__toast">{toast}</div>}
      <div className="coa-menu__foot">An original single-player fantasy RPG · characters: CC0 Quaternius base models, armour and creatures built in code</div>
    </div>
  );
}

export function HeroSelect({ hero, body, setHero, setBody, onBack, onStart }) {
  const H = HEROES[hero];
  const bodies = Object.keys(H.look);
  const stat = (k, max) => Math.round((H.base[k] / max) * 100);
  return (
    <div className="coa-select">
      <div className="coa-select__list">
        <h2>Choose your hero</h2>
        {Object.values(HEROES).map((h) => (
          <button key={h.id} className={`coa-herocard${h.id === hero ? " is-on" : ""}`} onClick={() => setHero(h.id)}>
            <Icon name={HERO_ICON[h.id]} size={30} />
            <div>
              <b>{h.name}</b>
              <small>{h.tag}</small>
            </div>
          </button>
        ))}
      </div>
      <div className="coa-select__detail">
        <h3>{H.name}</h3>
        <p className="coa-select__blurb">{H.blurb}</p>
        <div className="coa-select__stats">
          {[
            ["Health", stat("hp", 170)],
            ["Stamina", stat("st", 140)],
            ["Power", stat("atk", 18)],
            ["Armour", stat("armor", 30)],
            ["Speed", Math.round(H.base.speed * 85)],
          ].map(([l, v]) => (
            <div key={l} className="coa-statbar">
              <span>{l}</span>
              <i>
                <b style={{ width: `${v}%` }} />
              </i>
            </div>
          ))}
          <div className="coa-statbar">
            <span>{H.resource.name}</span>
            <i>
              <b style={{ width: "100%", background: H.resource.color }} />
            </i>
          </div>
        </div>
        <div className="coa-select__cols">
          <div>
            <h4>Strengths</h4>
            <ul>
              {H.strengths.map((s) => (
                <li key={s}>+ {s}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Weaknesses</h4>
            <ul>
              {H.weaknesses.map((s) => (
                <li key={s} className="is-neg">
                  − {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <h4>Abilities</h4>
        <div className="coa-select__abil">
          {["q", "r", "f"].map((k) => {
            const A = ABILITIES[H.abilities[k]];
            return (
              <div key={k} title={A.desc}>
                <Icon name={A.icon} size={20} />
                <span>
                  <kbd>{A.key}</kbd> {A.name}
                  {k === "f" ? " (skill tree)" : ""}
                </span>
              </div>
            );
          })}
        </div>
        {bodies.length > 1 && (
          <div className="coa-select__body">
            Appearance:
            {bodies.map((b) => (
              <button key={b} className={`coa-chip${b === body ? " is-on" : ""}`} onClick={() => setBody(b)}>
                {b === "m" ? "Masculine" : "Feminine"}
              </button>
            ))}
          </div>
        )}
        <div className="coa-select__go">
          <button className="coa-btn" onClick={onBack}>
            Back
          </button>
          <button className="coa-btn coa-btn--primary" onClick={onStart}>
            Begin the journey
          </button>
        </div>
      </div>
    </div>
  );
}

const INTRO = [
  "King Aldric of Valdren is dead — found cold in his bed at Wintermere Hold.",
  "His daughter, Princess Aveline, vanished the same night.",
  "The Crown of Ashes, forged when the first king made peace with the dragon of Cinderpeak, sits without a Heartstone, and the realm splits three ways.",
  "The Northern Wardens hold the castle. The Ember Court's fire-mages claim an ancient pact. The Free Marches want no crown at all.",
  "And in the ruins of Ashfall, something wearing the colours of ash is gathering an army.",
  "You come down the west road toward Thornwick… and see smoke.",
];
export function Intro({ onDone }) {
  const [i, setI] = useState(0);
  const next = () => (i < INTRO.length - 1 ? setI(i + 1) : onDone());
  return (
    <div className="coa-intro" onClick={next}>
      <div className="coa-intro__text" key={i}>
        {INTRO[i]}
      </div>
      <div className="coa-intro__hint">
        Click to continue · <button onClick={(e) => (e.stopPropagation(), onDone())}>Skip</button>
      </div>
    </div>
  );
}

export function PauseMenu({ onResume, onSave, saved, onSettings, onControls, onQuit }) {
  return (
    <div className="coa-modal">
      <div className="coa-panel coa-pause">
        <h2>Paused</h2>
        <button className="coa-btn coa-btn--primary" onClick={onResume}>
          Resume
        </button>
        <button className="coa-btn" onClick={onSave}>
          {saved ? "Saved ✓" : "Save game"}
        </button>
        <button className="coa-btn" onClick={onSettings}>
          Settings
        </button>
        <button className="coa-btn" onClick={onControls}>
          Controls
        </button>
        <button className="coa-btn" onClick={onQuit}>
          Save & quit to title
        </button>
      </div>
    </div>
  );
}

export function Settings({ s, set, onClose, onReset, inGame }) {
  const row = (label, ctl) => (
    <label className="coa-set__row">
      <span>{label}</span>
      {ctl}
    </label>
  );
  const range = (k, min, max, step) => <input type="range" min={min} max={max} step={step} value={s[k]} onChange={(e) => set(k, Number(e.target.value))} />;
  return (
    <div className="coa-modal">
      <div className="coa-panel coa-set">
        <h2>Settings</h2>
        {row(
          "Graphics quality",
          <select value={s.quality} onChange={(e) => set("quality", e.target.value)}>
            <option value="low">Low (fast)</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        )}
        {row("Auto-lower quality if slow", <input type="checkbox" checked={s.autoQuality} onChange={(e) => set("autoQuality", e.target.checked)} />)}
        {row("Mouse sensitivity", range("sens", 0.3, 2.5, 0.05))}
        {row("Invert look Y", <input type="checkbox" checked={s.invertY} onChange={(e) => set("invertY", e.target.checked)} />)}
        {row("Master volume", range("master", 0, 1, 0.05))}
        {row("Music", range("music", 0, 1, 0.05))}
        {row("Effects", range("sfx", 0, 1, 0.05))}
        {row("Camera shake", <input type="checkbox" checked={s.shake} onChange={(e) => set("shake", e.target.checked)} />)}
        {row("Tutorial hints", <input type="checkbox" checked={s.hints} onChange={(e) => set("hints", e.target.checked)} />)}
        {row("Objective markers", <input type="checkbox" checked={s.markers} onChange={(e) => set("markers", e.target.checked)} />)}
        {row(
          "Touch controls",
          <select value={s.touch} onChange={(e) => set("touch", e.target.value)}>
            <option value="auto">Automatic</option>
            <option value="on">Always on</option>
            <option value="off">Off</option>
          </select>
        )}
        <div className="coa-set__foot">
          {!inGame && (
            <button className="coa-btn coa-btn--danger" onClick={onReset}>
              Delete saved campaign
            </button>
          )}
          <button className="coa-btn coa-btn--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export function Controls({ onClose }) {
  const rows = [
    ["W A S D", "Move"],
    ["Mouse", "Look (click the game to capture the mouse)"],
    ["Shift", "Sprint"],
    ["Space", "Jump · dodge-roll while fighting or blocking"],
    ["V / C", "Dodge-roll"],
    ["Left click", "Attack — hold for a heavy attack, full bow draw or a fireball"],
    ["Right click", "Block (Knight) · parry (Rogue) · ember ward (Mage) · aim (Archer)"],
    ["Q / R / F", "Class abilities (F unlocks in the skill tree)"],
    ["1 / 2", "Healing draught / Ember tonic"],
    ["E", "Talk · interact · loot"],
    ["I", "Inventory & equipment"],
    ["K", "Skills"],
    ["J", "Journal"],
    ["M", "World map & fast travel"],
    ["Mouse wheel", "Camera distance"],
    ["Esc", "Pause"],
  ];
  return (
    <div className="coa-modal">
      <div className="coa-panel coa-controls">
        <h2>Controls</h2>
        <table>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td>
                  <kbd>{k}</kbd>
                </td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="coa-dim">On touch screens: left thumb moves, drag the right side to look, and use the on-screen buttons.</p>
        <button className="coa-btn coa-btn--primary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
