/**
 * Title menu, hero selection, the opening narration, pause, settings and the
 * how-to-play card.
 */
import { useEffect, useState } from "react";
import { HEROES, HERO_IDS } from "../data/heroes.js";
import { SPELLS } from "../data/spells.js";
import { Icon } from "./icons.jsx";

export function MainMenu({ save, ready, onNew, onContinue, onSelect, onHow, onSettings, toast }) {
  const P = save?.profile;
  return (
    <div className="hwa-menu">
      <div className="hwa-menu__title">
        <small>A Wizarding Adventure</small>
        <h1>
          Harry Potter
          <span>Hogwarts Adventures</span>
        </h1>
        <p className="hwa-menu__tag">Master the Magic. Defend Hogwarts.</p>
      </div>
      <div className="hwa-menu__list">
        {P && (
          <button className="hwa-btn hwa-btn--primary" disabled={!ready} onClick={onContinue}>
            Continue
            <small>
              {HEROES[P.hero].short} · Level {P.heroes[P.hero].level} · {Object.values(P.quests).filter((q) => q.state === "done").length}/15 quests
            </small>
          </button>
        )}
        <button className={`hwa-btn${P ? "" : " hwa-btn--primary"}`} disabled={!ready} onClick={onNew}>
          New Game
        </button>
        <button className="hwa-btn" disabled={!ready} onClick={onSelect}>
          Character Selection
        </button>
        <button className="hwa-btn" onClick={onHow}>
          How to Play
        </button>
        <button className="hwa-btn" onClick={onSettings}>
          Settings
        </button>
        {!ready && <div className="hwa-menu__load">Summoning the castle…</div>}
      </div>
      {toast && <div className="hwa-menu__toast">{toast}</div>}
      <div className="hwa-menu__foot">Fan-made prototype · original models, music and writing</div>
    </div>
  );
}

const STAT = (h) => [
  ["Health", h.hp / 140],
  ["Magic", h.mana / 125],
  ["Speed", (h.speed - 0.9) / 0.2],
];
export function HeroSelect({ hero, setHero, onBack, onStart, startLabel = "Begin", levels }) {
  const H = HEROES[hero];
  return (
    <div className="hwa-select">
      <div className="hwa-select__top">
        <button className="hwa-btn hwa-btn--ghost" onClick={onBack}>
          ← Back
        </button>
        <h2>Choose your hero</h2>
        <button className="hwa-btn hwa-btn--primary hwa-select__go" onClick={onStart}>
          {startLabel}
        </button>
      </div>
      <div className="hwa-select__cards">
        {HERO_IDS.map((id) => (
          <button key={id} className={`hwa-hcard hwa-hcard--${HEROES[id].house}${id === hero ? " is-on" : ""}`} onClick={() => setHero(id)}>
            <b>{HEROES[id].short}</b>
            <small>{HEROES[id].role}</small>
            {levels && <em>Lv {levels[id]}</em>}
          </button>
        ))}
      </div>
      <div className="hwa-select__info">
        <h3>{H.name}</h3>
        <p>{H.blurb}</p>
        <div className="hwa-select__stats">
          {STAT(H).map(([k, v]) => (
            <div key={k}>
              <span>{k}</span>
              <i>
                <b style={{ width: `${Math.max(0.15, Math.min(1, v)) * 100}%` }} />
              </i>
            </div>
          ))}
        </div>
        <div className="hwa-select__abil">
          <div>
            <kbd>Q</kbd> <b>{H.q.name}</b> — {H.q.desc}
          </div>
          <div>
            <kbd>R</kbd> <b>{H.r.name}</b> — {H.r.desc}
          </div>
          <div>
            <Icon name="star" size={12} /> <b>{H.passive.name}</b> — {H.passive.desc}
          </div>
        </div>
        <button className="hwa-btn hwa-btn--primary" onClick={onStart}>
          {startLabel}
        </button>
      </div>
    </div>
  );
}

const INTRO = [
  "The castle has stood for a thousand years, and for a thousand years something beneath it has kept it standing.",
  "The Founders called it the Aegis Stone. While it rests, the old wards hold: no army can break the walls, no curse can reach the halls.",
  "Tonight the wards are flickering. Pages are missing from the Library. Lights move in the Forbidden Forest.",
  "And a summons has come from the Headmaster.",
];
export function Intro({ onDone }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => (i < INTRO.length - 1 ? setI(i + 1) : null), 4200);
    return () => clearTimeout(t);
  }, [i]);
  return (
    <div className="hwa-intro" onClick={() => (i < INTRO.length - 1 ? setI(i + 1) : onDone())}>
      <div className="hwa-intro__text">
        {INTRO.slice(0, i + 1).map((t, k) => (
          <p key={k} className={k === i ? "is-new" : ""}>
            {t}
          </p>
        ))}
      </div>
      <button className="hwa-btn hwa-btn--primary" onClick={(e) => (e.stopPropagation(), onDone())}>
        {i < INTRO.length - 1 ? "Skip" : "Enter Hogwarts"}
      </button>
    </div>
  );
}

export function PauseMenu({ onResume, onSave, saved, onSettings, onHow, onQuit, onPanel }) {
  return (
    <div className="hwa-modal">
      <div className="hwa-panel hwa-panel--narrow">
        <h2 className="hwa-panel__h">Paused</h2>
        <div className="hwa-menu__list">
          <button className="hwa-btn hwa-btn--primary" onClick={onResume}>
            Resume
          </button>
          <button className="hwa-btn" onClick={onSave}>
            {saved ? "Saved ✓" : "Save game"}
          </button>
          <div className="hwa-row">
            <button className="hwa-btn hwa-btn--sm" onClick={() => onPanel("inventory")}>
              Inventory
            </button>
            <button className="hwa-btn hwa-btn--sm" onClick={() => onPanel("spells")}>
              Spellbook
            </button>
            <button className="hwa-btn hwa-btn--sm" onClick={() => onPanel("journal")}>
              Journal
            </button>
            <button className="hwa-btn hwa-btn--sm" onClick={() => onPanel("map")}>
              Map
            </button>
          </div>
          <button className="hwa-btn" onClick={onSettings}>
            Settings
          </button>
          <button className="hwa-btn" onClick={onHow}>
            How to Play
          </button>
          <button className="hwa-btn hwa-btn--ghost" onClick={onQuit}>
            Save &amp; quit to title
          </button>
        </div>
      </div>
    </div>
  );
}

export function Settings({ s, set, onClose, onReset, inGame }) {
  const [confirm, setConfirm] = useState(false);
  const range = (k, label, min, max, step) => (
    <label className="hwa-set">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={s[k]} onChange={(e) => set(k, Number(e.target.value))} />
      <em>{Math.round(s[k] * 100)}%</em>
    </label>
  );
  const toggle = (k, label) => (
    <label className="hwa-set hwa-set--t">
      <span>{label}</span>
      <input type="checkbox" checked={!!s[k]} onChange={(e) => set(k, e.target.checked)} />
    </label>
  );
  return (
    <div className="hwa-modal">
      <div className="hwa-panel">
        <h2 className="hwa-panel__h">Settings</h2>
        <div className="hwa-set">
          <span>Graphics</span>
          <div className="hwa-seg">
            {["auto", "low", "medium", "high"].map((q) => (
              <button key={q} className={s.quality === q ? "on" : ""} onClick={() => set("quality", q)}>
                {q}
              </button>
            ))}
          </div>
        </div>
        {toggle("autoQuality", "Lower graphics automatically if the game stutters")}
        {range("master", "Master volume", 0, 1, 0.05)}
        {range("music", "Music", 0, 1, 0.05)}
        {range("sfx", "Effects", 0, 1, 0.05)}
        {range("sens", "Camera sensitivity", 0.3, 2, 0.05)}
        {toggle("invertY", "Invert camera Y")}
        {toggle("shake", "Screen shake")}
        {toggle("hints", "Tutorial hints")}
        <div className="hwa-set">
          <span>Touch controls</span>
          <div className="hwa-seg">
            {["auto", "on", "off"].map((q) => (
              <button key={q} className={s.touch === q ? "on" : ""} onClick={() => set("touch", q)}>
                {q}
              </button>
            ))}
          </div>
        </div>
        {!inGame && (
          <div className="hwa-set">
            <span>Saved game</span>
            {confirm ? (
              <button className="hwa-btn hwa-btn--sm hwa-btn--danger" onClick={() => (onReset(), setConfirm(false))}>
                Really delete?
              </button>
            ) : (
              <button className="hwa-btn hwa-btn--sm" onClick={() => setConfirm(true)}>
                Delete save
              </button>
            )}
          </div>
        )}
        <button className="hwa-btn hwa-btn--primary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

export function HowToPlay({ onClose, touch }) {
  const rows = touch
    ? [
        ["Left side", "Move (drag)"],
        ["Right side", "Look around (drag)"],
        ["Wand button", "Cast the selected spell (hold to keep casting)"],
        ["Spell strip", "Tap a spell to select it"],
        ["Shield", "Protego — tap as a spell arrives to reflect it"],
        ["Q / R", "Your hero's signature spells"],
        ["Roll", "Dodge (untouchable for a moment)"],
        ["Hand", "Talk / use"],
      ]
    : [
        ["W A S D", "Move · Shift sprint"],
        ["Mouse", "Look around (click the game to capture the mouse)"],
        ["Left click", "Cast the selected spell — hold to keep casting bolts"],
        ["Right click", "Aim (precise targeting)"],
        ["1 – 9 / wheel", "Select a spell"],
        ["F", "Protego — raise it as a spell lands to reflect it"],
        ["Q / R", "Signature spells"],
        ["Space", "Dodge-roll"],
        ["E", "Talk / interact"],
        ["L", "Lumos (wand-light: reveals hidden marks)"],
        ["H / G", "Wiggenweld (health) / Invigoration (magic)"],
        ["I · K · C · J · M", "Inventory · Spellbook · Character · Journal · Map"],
        ["Esc", "Pause"],
      ];
  return (
    <div className="hwa-modal">
      <div className="hwa-panel">
        <h2 className="hwa-panel__h">How to Play</h2>
        <div className="hwa-how">
          {rows.map(([k, v]) => (
            <div key={k}>
              <kbd>{k}</kbd>
              <span>{v}</span>
            </div>
          ))}
        </div>
        <div className="hwa-how__tips">
          <p>
            <b>Spells solve puzzles.</b> Target spells — {["levioso", "accio", "alohomora", "reparo"].map((s) => SPELLS[s].name).join(", ")} — only work on things they can affect; a coloured ring marks every valid target near you when one of them is selected.
          </p>
          <p>
            <b>Combos.</b> Hit a levitated foe for double damage; set a stunned foe on fire for a Blaze; stun a disarmed duellist to pin them longer. Expelliarmus breaks enemy shields.
          </p>
          <p>
            <b>Danger.</b> Wands glow before a spell is cast; red shapes on the ground mark where a blow will land. Shield the spells, roll out of the shapes.
          </p>
        </div>
        <button className="hwa-btn hwa-btn--primary" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
