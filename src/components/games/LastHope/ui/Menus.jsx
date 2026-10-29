/**
 * Last Hope — menus and full-screen states: title, new game, settings, how
 * to play, pause, death / recovery, confirmations, travel transition, ending.
 */
import { useState } from "react";
import { Icon } from "./icons.jsx";
import { LOCATIONS } from "../data/locations/index.js";
import { DIFFS } from "../engine/game.js";

const ago = (ts) => {
  if (!ts) return "";
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};

export function MainMenu({ info, onContinue, onNew, onHow, onSettings, loading }) {
  const [picking, setPicking] = useState(false);
  return (
    <div className="lh-menu" data-ui>
      <div className="lh-logo">
        <span className="lh-logo__top">LAST</span>
        <span className="lh-logo__big">HOPE</span>
        <span className="lh-logo__sub">Zombie Survival</span>
        <span className="lh-logo__tag">Survive the Dead. Rebuild Your World.</span>
      </div>
      {!picking ? (
        <div className="lh-menu__btns">
          {info && (
            <button className="lh-mbtn lh-mbtn--hi" onClick={onContinue} disabled={loading}>
              <b>Continue</b>
              <span>
                Day {info.day} · Level {info.level} · {info.loc} · {ago(info.savedAt)}
              </span>
            </button>
          )}
          <button className={`lh-mbtn${info ? "" : " lh-mbtn--hi"}`} onClick={() => setPicking(true)} disabled={loading}>
            <b>New Game</b>
            <span>{info ? "Start over — your current survivor's save is replaced" : "Begin at the Survivor's Camp"}</span>
          </button>
          <button className="lh-mbtn" onClick={onSettings}>
            <b>Settings</b>
          </button>
          <button className="lh-mbtn" onClick={onHow}>
            <b>How to Play</b>
          </button>
          {loading && <div className="lh-loading">Preparing survivors… </div>}
        </div>
      ) : (
        <div className="lh-menu__btns">
          <div className="lh-menu__h">Choose your difficulty</div>
          {Object.entries(DIFFS).map(([k, d]) => (
            <button key={k} className={`lh-mbtn${k === "normal" ? " lh-mbtn--hi" : ""}`} onClick={() => onNew(k)}>
              <b>{d.label}</b>
              <span>{k === "easy" ? "Slower hunger & thirst, weaker zombies. Explore at your own pace." : k === "normal" ? "The intended balance of scarcity and danger." : "Hungrier, thirstier, and the dead hit much harder."}</span>
            </button>
          ))}
          <button className="lh-mbtn lh-mbtn--ghost" onClick={() => setPicking(false)}>
            Back
          </button>
        </div>
      )}
      <div className="lh-credit">Original game. Characters & animations: Quaternius (CC0).</div>
    </div>
  );
}

function Range({ label, value, onChange, min = 0, max = 1, step = 0.05, fmt = (v) => `${Math.round(v * 100)}%` }) {
  return (
    <label className="lh-set">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
      <em>{fmt(value)}</em>
    </label>
  );
}
function Seg({ label, value, options, onChange }) {
  return (
    <div className="lh-set">
      <span>{label}</span>
      <div className="lh-seg">
        {options.map(([v, n]) => (
          <button key={v} className={value === v ? "is-on" : ""} onClick={() => onChange(v)}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Settings({ s, set, onBack, onFullscreen }) {
  return (
    <div className="lh-panel lh-panel--narrow" data-ui data-scroll>
      <div className="lh-panel__head">
        <div className="lh-title">Settings</div>
        <button className="lh-x" onClick={onBack} aria-label="Back">
          ✕
        </button>
      </div>
      <div className="lh-sets">
        <Seg label="Graphics" value={s.quality} options={[["auto", "Auto"], ["low", "Low"], ["medium", "Medium"], ["high", "High"]]} onChange={(v) => set({ quality: v })} />
        <Range label="Camera distance" value={s.zoom} min={12} max={30} step={1} fmt={(v) => `${v} m`} onChange={(v) => set({ zoom: v })} />
        <Range label="Master volume" value={s.master} onChange={(v) => set({ master: v })} />
        <Range label="Music" value={s.music} onChange={(v) => set({ music: v })} />
        <Range label="Effects" value={s.sfx} onChange={(v) => set({ sfx: v })} />
        <Range label="Ambience" value={s.amb} onChange={(v) => set({ amb: v })} />
        <Seg label="Aim assist" value={s.aimAssist ? "on" : "off"} options={[["on", "On"], ["off", "Off"]]} onChange={(v) => set({ aimAssist: v === "on" })} />
        <Seg label="Damage numbers" value={s.damageNumbers ? "on" : "off"} options={[["on", "On"], ["off", "Off"]]} onChange={(v) => set({ damageNumbers: v === "on" })} />
        <Seg label="FPS counter" value={s.showFps ? "on" : "off"} options={[["on", "On"], ["off", "Off"]]} onChange={(v) => set({ showFps: v === "on" })} />
        <button className="lh-mbtn" onClick={onFullscreen}>
          <b>Toggle fullscreen</b>
        </button>
      </div>
    </div>
  );
}

export function HowTo({ onBack, touch }) {
  return (
    <div className="lh-panel lh-panel--narrow" data-ui>
      <div className="lh-panel__head">
        <div className="lh-title">How to Play</div>
        <button className="lh-x" onClick={onBack} aria-label="Back">
          ✕
        </button>
      </div>
      <div className="lh-how" data-scroll>
        <div className="lh-how__keys">
          {touch ? (
            <>
              <p>
                <b>Left side</b> drag to move
              </p>
              <p>
                <b>Attack</b> hold — locks onto the nearest threat
              </p>
              <p>
                <b>E</b> interact: loot, chop, mine, open doors, travel
              </p>
              <p>
                <b>⚡</b> toggle sprint (costs stamina)
              </p>
              <p>
                <b>Bag / Hammer / Map</b> inventory · build · world map
              </p>
            </>
          ) : (
            <>
              <p>
                <kbd>W</kbd>
                <kbd>A</kbd>
                <kbd>S</kbd>
                <kbd>D</kbd> move · <kbd>Shift</kbd> sprint
              </p>
              <p>
                <kbd>Mouse</kbd> aim · <kbd>Left click</kbd> attack / swing
              </p>
              <p>
                <kbd>E</kbd> interact: loot, chop, mine, open doors, travel
              </p>
              <p>
                <kbd>I</kbd> inventory & crafting · <kbd>C</kbd> crafting · <kbd>B</kbd> build · <kbd>M</kbd> map
              </p>
              <p>
                <kbd>1</kbd>–<kbd>5</kbd> quick slots · <kbd>R</kbd> rotate piece · <kbd>Esc</kbd> pause / close · <kbd>Wheel</kbd> zoom
              </p>
            </>
          )}
        </div>
        <h4>Survive</h4>
        <p>Health, hunger, thirst and stamina all matter. Eat and drink before the bars run dry — starving and dehydration drain your health. Health regenerates when you're fed and watered, faster beside a campfire or bedroll.</p>
        <h4>Gather & craft</h4>
        <p>Punch trees and pick up branches and stones to start. Craft a Stone Axe and Pickaxe (Inventory → Crafting) to harvest three times faster. Interacting with a tree or rock automatically pulls the right tool into your hand.</p>
        <h4>Build your camp</h4>
        <p>At the Survivor's Camp press B. Walls and doors snap to grid edges, everything else to cells. A Campfire cooks meat and boils water; a Workbench unlocks better gear; a Chest keeps items safe even when you die. From the second night on, the dead raid your camp — they will tear through the weakest wall to reach you.</p>
        <h4>Fight smart</h4>
        <p>Every zombie attack is telegraphed: a red ring fills under it. Step back before it fills. Runners are fast, armored zombies shrug off blades (blunt weapons work better), toxic zombies spit from range and leave poison clouds when they die. Guns are loud — every shot draws the dead.</p>
        <h4>Explore</h4>
        <p>Walk to a location's exit (green on the minimap) and press E to open the world map. Objectives unlock the Suburb, the Industrial Yard and finally SITE 9. If you die, your backpack stays where you fell — go back and recover it.</p>
      </div>
    </div>
  );
}

export function Pause({ onResume, onSettings, onHow, onQuit, stats }) {
  return (
    <div className="lh-modal" data-ui>
      <div className="lh-modal__card">
        <div className="lh-title">Paused</div>
        <div className="lh-pstats">
          <span>
            Day <b>{stats.day}</b>
          </span>
          <span>
            Level <b>{stats.level}</b>
          </span>
          <span>
            Kills <b>{stats.kills}</b>
          </span>
          <span>
            Objectives <b>{stats.done}/41</b>
          </span>
        </div>
        <button className="lh-mbtn lh-mbtn--hi" onClick={onResume}>
          <b>Resume</b>
        </button>
        <button className="lh-mbtn" onClick={onSettings}>
          <b>Settings</b>
        </button>
        <button className="lh-mbtn" onClick={onHow}>
          <b>How to Play</b>
        </button>
        <button className="lh-mbtn lh-mbtn--ghost" onClick={onQuit}>
          <b>Save & quit to menu</b>
        </button>
      </div>
    </div>
  );
}

const CAUSE = { zombie: "Overwhelmed by the dead", hunger: "Starved", thirst: "Died of thirst", toxic: "Poisoned", explosion: "Caught in an explosion" };
export function Death({ cause, deadT, hasBag, loc, onRespawn }) {
  return (
    <div className="lh-death" data-ui>
      <div className="lh-death__card" style={{ opacity: Math.min(1, deadT / 1.2) }}>
        <Icon id="skull" size={64} />
        <h2>You Died</h2>
        <p className="lh-death__c">{CAUSE[cause] || "You fell"}</p>
        <p>{hasBag ? `Your backpack lies where you fell in ${LOCATIONS[loc]?.name}. Go back and recover it — equipped gear and your stash stay with you.` : "Your equipped gear stays with you, slightly worn."}</p>
        <button className="lh-mbtn lh-mbtn--hi" disabled={deadT < 1.2} onClick={onRespawn}>
          <b>Respawn at camp</b>
        </button>
      </div>
    </div>
  );
}

export function Confirm({ title, text, ok, onOk, onCancel }) {
  return (
    <div className="lh-modal" data-ui>
      <div className="lh-modal__card">
        <div className="lh-title">{title}</div>
        <p>{text}</p>
        <div className="lh-row">
          <button className="lh-mbtn" onClick={onCancel}>
            <b>Cancel</b>
          </button>
          <button className="lh-mbtn lh-mbtn--danger" onClick={onOk}>
            <b>{ok}</b>
          </button>
        </div>
      </div>
    </div>
  );
}

export function Travel({ to, phase }) {
  const L = LOCATIONS[to];
  return (
    <div className={`lh-travel lh-travel--${phase}`}>
      <div>
        <span>Travelling to</span>
        <b>{L?.name}</b>
        <i />
      </div>
    </div>
  );
}

export function Ending({ onClose, stats }) {
  return (
    <div className="lh-modal lh-modal--end" data-ui>
      <div className="lh-modal__card">
        <span className="lh-end__sub">The Warden is dead</span>
        <div className="lh-title lh-title--big">Last Hope</div>
        <p>SITE 9 falls silent. Whatever they were building down there, it ends with you. The world is still broken — but now it's yours to rebuild.</p>
        <div className="lh-pstats">
          <span>
            Days survived <b>{stats.day}</b>
          </span>
          <span>
            Zombies put down <b>{stats.kills}</b>
          </span>
          <span>
            Deaths <b>{stats.deaths}</b>
          </span>
        </div>
        <button className="lh-mbtn lh-mbtn--hi" onClick={onClose}>
          <b>Keep surviving</b>
        </button>
      </div>
    </div>
  );
}
