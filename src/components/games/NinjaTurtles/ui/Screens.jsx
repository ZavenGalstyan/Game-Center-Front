/**
 * Menus and full-screen panels: main menu, mission list, character select,
 * pause, mission complete, game over, victory, settings, how-to-play.
 */
import { useState } from "react";
import { TURTLES, TURTLE_ORDER, DIFFICULTY } from "../data/turtles.js";
import { MISSIONS, MISSION_BY_ID } from "../data/missions.js";
import { missionUnlocked } from "../engine/save.js";
import { Preview } from "./Preview.jsx";
import { fmtTime } from "./Hud.jsx";

export function nextMission(progress) {
  return MISSIONS.find((m) => !progress.completed.includes(m.id)) || MISSIONS[MISSIONS.length - 1];
}

function Logo() {
  return (
    <div className="tmnt-logo">
      <small>NINJA TURTLES</small>
      <h1>Shadow Strike</h1>
      <em>Four Brothers. One Mission. Save the City.</em>
    </div>
  );
}

export function MainMenu({ progress, onPlay, onMissions, onSettings, onHelp }) {
  const next = nextMission(progress);
  const fresh = progress.completed.length === 0;
  const allDone = progress.completed.includes("boss");
  return (
    <div className="tmnt-screen tmnt-menu">
      <div className="tmnt-menu-art">
        <Preview ids={["raph", "leo", "don", "mikey"]} spread={1.45} turn={false} />
      </div>
      <div className="tmnt-menu-panel">
        <Logo />
        <button type="button" className="tmnt-btn primary" onClick={onPlay}>
          {fresh ? "Play" : allDone ? "Play Again" : "Continue"}
          <small>{allDone ? "Pick your turtle" : `Mission ${MISSIONS.indexOf(next) + 1}: ${next.name}`}</small>
        </button>
        <button type="button" className="tmnt-btn" onClick={onMissions}>
          Missions <small>{progress.completed.length} / {MISSIONS.length} complete</small>
        </button>
        <div className="tmnt-row">
          <button type="button" className="tmnt-btn small" onClick={onHelp}>
            How to play
          </button>
          <button type="button" className="tmnt-btn small" onClick={onSettings}>
            Settings
          </button>
        </div>
        <p className="tmnt-legal">Fan-made prototype. Teenage Mutant Ninja Turtles names and characters belong to their owners — not for public release without authorization. All models, sounds and art here are original.</p>
      </div>
    </div>
  );
}

export function Missions({ progress, onPick, onBack }) {
  return (
    <div className="tmnt-screen tmnt-panel-screen">
      <div className="tmnt-panel">
        <h2>Missions</h2>
        <ol className="tmnt-missions">
          {MISSIONS.map((m, i) => {
            const open = missionUnlocked(progress, m.id);
            const done = progress.completed.includes(m.id);
            return (
              <li key={m.id} className={`${open ? "" : "locked"} ${done ? "done" : ""}`}>
                <div className="tmnt-mnum">{i + 1}</div>
                <div className="tmnt-minfo">
                  <b>{m.name}</b>
                  <span>{m.brief}</span>
                  <span className="tmnt-mmeta">{done ? `✓ Complete${progress.best[m.id] ? ` · best ${fmtTime(progress.best[m.id])}` : ""}` : open ? "Ready" : "Locked — finish the previous mission"}</span>
                </div>
                <button type="button" className="tmnt-btn small" disabled={!open} onClick={() => onPick(m.id)}>
                  {done ? "Replay" : "Play"}
                </button>
              </li>
            );
          })}
        </ol>
        {progress.champions.length > 0 && (
          <p className="tmnt-center tmnt-champs">
            Shredder defeated by:{" "}
            {progress.champions.map((id) => (
              <b key={id} style={{ color: TURTLES[id].mask }}>
                {TURTLES[id].name}{" "}
              </b>
            ))}
          </p>
        )}
        <button type="button" className="tmnt-btn ghost" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

export function TurtleSelect({ progress, missionId, hero, setHero, difficulty, setDifficulty, onStart, onBack }) {
  const M = MISSION_BY_ID[missionId];
  const H = TURTLES[hero];
  const diffs = Object.keys(DIFFICULTY).filter((d) => d !== "hard" || progress.hardUnlocked);
  return (
    <div className="tmnt-screen tmnt-select" style={{ "--mask": H.mask }}>
      <div className="tmnt-select-top">
        <button type="button" className="tmnt-btn ghost small" onClick={onBack}>
          ‹ Back
        </button>
        <div className="tmnt-select-mission">
          <small>Mission {MISSIONS.indexOf(M) + 1}</small>
          <b>{M.name}</b>
        </div>
      </div>
      <div className="tmnt-select-body">
        <div className="tmnt-select-stage">
          <Preview ids={[hero]} />
          <div className="tmnt-select-info">
            <h2>{H.name}</h2>
            <div className="tmnt-sub">
              {H.title} · {H.weapon}
            </div>
            <p>{H.blurb}</p>
            <Stat label="Health" v={H.hp / 140} />
            <Stat label="Speed" v={H.speed / 6.8} />
            <Stat label="Power" v={(H.light.dmg + H.heavy.dmg) / 46} />
            <Stat label="Reach" v={H.light.range / 2.9} />
            <div className="tmnt-special">
              <b>Special — {H.special.name}</b>
              <span>{H.special.desc}</span>
            </div>
            {progress.champions.includes(hero) && <div className="tmnt-champ-badge">★ Defeated the Shredder</div>}
          </div>
        </div>
        <div className="tmnt-roster">
          {TURTLE_ORDER.map((id) => {
            const h = TURTLES[id];
            return (
              <button type="button" key={id} className={`tmnt-card ${id === hero ? "sel" : ""}`} style={{ "--mask": h.mask }} onClick={() => setHero(id)}>
                <span className="tmnt-card-badge">{h.name[0]}</span>
                <b>{h.name}</b>
                <small>{h.weapon}</small>
              </button>
            );
          })}
        </div>
      </div>
      <div className="tmnt-select-bottom">
        <p className="tmnt-brief">{M.brief}</p>
        <div className="tmnt-diff" role="radiogroup" aria-label="Difficulty">
          {diffs.map((d) => (
            <button type="button" key={d} role="radio" aria-checked={difficulty === d} className={difficulty === d ? "on" : ""} onClick={() => setDifficulty(d)}>
              {DIFFICULTY[d].name}
            </button>
          ))}
        </div>
        <button type="button" className="tmnt-btn primary" onClick={onStart}>
          Start as {H.name}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, v }) {
  return (
    <div className="tmnt-stat">
      <span>{label}</span>
      <i>
        <em style={{ width: `${Math.max(8, Math.min(100, v * 100))}%` }} />
      </i>
    </div>
  );
}

export function Pause({ onResume, onRestart, onSettings, onHelp, onQuit, onHero }) {
  return (
    <div className="tmnt-overlay">
      <div className="tmnt-panel narrow">
        <h2>Paused</h2>
        <button type="button" className="tmnt-btn primary" onClick={onResume}>
          Resume
        </button>
        <button type="button" className="tmnt-btn" onClick={onRestart}>
          Restart mission
        </button>
        <button type="button" className="tmnt-btn" onClick={onHero}>
          Change turtle
        </button>
        <div className="tmnt-row">
          <button type="button" className="tmnt-btn small" onClick={onHelp}>
            Controls
          </button>
          <button type="button" className="tmnt-btn small" onClick={onSettings}>
            Settings
          </button>
        </div>
        <button type="button" className="tmnt-btn ghost" onClick={onQuit}>
          Quit to menu
        </button>
      </div>
    </div>
  );
}

export function Complete({ info, onNext, onMissions, onMenu, onReplay }) {
  const M = MISSION_BY_ID[info.mission];
  const nextM = MISSIONS[MISSIONS.indexOf(M) + 1];
  return (
    <div className="tmnt-overlay">
      <div className="tmnt-panel narrow tmnt-complete">
        <small className="tmnt-kicker">Mission complete</small>
        <h2>{M.name}</h2>
        <div className="tmnt-results">
          <div>
            <b>{fmtTime(info.time)}</b>
            <span>Time</span>
          </div>
          <div>
            <b>{info.kills}</b>
            <span>Foes defeated</span>
          </div>
          <div>
            <b>{info.damage}</b>
            <span>Damage taken</span>
          </div>
        </div>
        {info.newBest && <div className="tmnt-reward plain">New best time!</div>}
        {nextM && (
          <div className="tmnt-reward plain">
            Unlocked: Mission {MISSIONS.indexOf(nextM) + 1} — {nextM.name}
          </div>
        )}
        {nextM && (
          <button type="button" className="tmnt-btn primary" onClick={onNext}>
            Next: {nextM.name}
          </button>
        )}
        <div className="tmnt-row">
          <button type="button" className="tmnt-btn small" onClick={onReplay}>
            Replay
          </button>
          <button type="button" className="tmnt-btn small" onClick={onMissions}>
            Missions
          </button>
        </div>
        <button type="button" className="tmnt-btn ghost" onClick={onMenu}>
          Main menu
        </button>
      </div>
    </div>
  );
}

export function GameOver({ mission, onRetry, onHero, onMenu }) {
  return (
    <div className="tmnt-overlay red">
      <div className="tmnt-panel narrow">
        <small className="tmnt-kicker">Shell-shocked</small>
        <h2>Get back up!</h2>
        <p className="tmnt-center">
          {mission === "boss"
            ? "Tip: when a red lane appears, the Shredder is about to dash — step out of it or roll, then punish him while he catches his breath."
            : "Tip: a red ring under a foe means an attack is coming. Shell-roll with Shift, and grab pizza to heal."}
        </p>
        <button type="button" className="tmnt-btn primary" onClick={onRetry}>
          Try again
        </button>
        <button type="button" className="tmnt-btn" onClick={onHero}>
          Change turtle
        </button>
        <button type="button" className="tmnt-btn ghost" onClick={onMenu}>
          Main menu
        </button>
      </div>
    </div>
  );
}

export function Victory({ info, hardNew, onMenu, onMissions }) {
  const H = TURTLES[info.hero];
  return (
    <div className="tmnt-overlay gold">
      <div className="tmnt-panel tmnt-victory">
        <small className="tmnt-kicker">The Shredder is defeated</small>
        <h2>Cowabunga!</h2>
        <p className="tmnt-center">
          {H.name} saved the city. Time: <b>{fmtTime(info.time)}</b> · Damage taken: <b>{info.damage}</b>
        </p>
        <div className="tmnt-victory-art">
          <Preview ids={["raph", "leo", "don", "mikey"]} spread={1.35} turn={false} pose="victory" />
        </div>
        <p className="tmnt-center">{hardNew ? "Unlocked: Hard difficulty — and a champion badge for " + H.name + "." : "Champion badge earned for " + H.name + ". Try another brother, or Hard mode!"}</p>
        <div className="tmnt-row">
          <button type="button" className="tmnt-btn primary" onClick={onMissions}>
            Missions
          </button>
          <button type="button" className="tmnt-btn" onClick={onMenu}>
            Main menu
          </button>
        </div>
      </div>
    </div>
  );
}

export function Settings({ settings, hardUnlocked, setSetting, onReset, onBack }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="tmnt-overlay">
      <div className="tmnt-panel narrow">
        <h2>Settings</h2>
        <label className="tmnt-set">
          <span>Difficulty</span>
          <select value={settings.difficulty} onChange={(e) => setSetting("difficulty", e.target.value)}>
            <option value="easy">Easy</option>
            <option value="normal">Normal</option>
            <option value="hard" disabled={!hardUnlocked}>
              Hard{hardUnlocked ? "" : " (beat the Shredder)"}
            </option>
          </select>
        </label>
        <label className="tmnt-set">
          <span>Camera sensitivity</span>
          <input type="range" min="0.3" max="2.5" step="0.1" value={settings.sens} onChange={(e) => setSetting("sens", parseFloat(e.target.value))} />
          <b>{settings.sens.toFixed(1)}</b>
        </label>
        <label className="tmnt-set">
          <span>Invert camera Y</span>
          <input type="checkbox" checked={settings.invertY} onChange={(e) => setSetting("invertY", e.target.checked)} />
        </label>
        <label className="tmnt-set">
          <span>Sound effects</span>
          <input type="checkbox" checked={settings.sound} onChange={(e) => setSetting("sound", e.target.checked)} />
        </label>
        <label className="tmnt-set">
          <span>Touch controls</span>
          <select value={settings.touch} onChange={(e) => setSetting("touch", e.target.value)}>
            <option value="auto">Auto</option>
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </label>
        {confirm ? (
          <div className="tmnt-row">
            <button
              type="button"
              className="tmnt-btn small danger"
              onClick={() => {
                onReset();
                setConfirm(false);
              }}
            >
              Yes, erase progress
            </button>
            <button type="button" className="tmnt-btn small" onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="tmnt-btn small ghost" onClick={() => setConfirm(true)}>
            Reset progress…
          </button>
        )}
        <button type="button" className="tmnt-btn primary" onClick={onBack}>
          Done
        </button>
      </div>
    </div>
  );
}

export function Help({ onBack }) {
  const rows = [
    ["Move", "W A S D", "Left stick"],
    ["Camera", "Mouse (click the game first)", "Drag right side"],
    ["Jump", "Space", "JUMP"],
    ["Light attack (3-hit combo)", "Left click / J", "ATTACK"],
    ["Heavy attack", "Right click / F", "HEAVY"],
    ["Special move", "Q", "SPECIAL"],
    ["Shell-roll dodge", "Shift", "DODGE"],
    ["Interact / eat pizza", "E", "USE"],
    ["Pause", "Esc / P", "II"],
  ];
  return (
    <div className="tmnt-overlay">
      <div className="tmnt-panel narrow">
        <h2>How to play</h2>
        <table className="tmnt-keys">
          <thead>
            <tr>
              <th />
              <th>Keyboard</th>
              <th>Touch</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([a, k, t]) => (
              <tr key={a}>
                <td>{a}</td>
                <td>
                  <kbd>{k}</kbd>
                </td>
                <td>{t}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="tmnt-center">Attacks lock on to the nearest foe in front of you. A red ring means a foe is about to strike — the shell roll makes you briefly untouchable. Elites shrug off light hits: use heavies, combo finishers and specials.</p>
        <button type="button" className="tmnt-btn primary" onClick={onBack}>
          Got it
        </button>
      </div>
    </div>
  );
}
