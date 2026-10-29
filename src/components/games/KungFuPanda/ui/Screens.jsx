/**
 * Menus and full-screen panels: main menu, mission list, character select,
 * pause, mission complete, game over, victory, settings, how-to-play.
 */
import { useState } from "react";
import { HEROES, HERO_ORDER } from "../data/heroes.js";
import { MISSIONS, MISSION_BY_ID } from "../data/missions.js";
import { missionUnlocked } from "../engine/save.js";
import { Preview } from "./Preview.jsx";
import { fmtTime } from "./Hud.jsx";

const UNLOCK_BY = Object.fromEntries(MISSIONS.filter((m) => m.reward).map((m) => [m.reward, m]));

export function nextMission(progress) {
  return MISSIONS.find((m) => !progress.completed.includes(m.id)) || MISSIONS[MISSIONS.length - 1];
}

export function MainMenu({ progress, onPlay, onMissions, onSettings, onHelp }) {
  const next = nextMission(progress);
  const fresh = progress.completed.length === 0;
  const allDone = progress.completed.includes("arena");
  return (
    <div className="kfp-screen kfp-menu">
      <div className="kfp-menu-art">
        <Preview ids={["tigress", "monkey", "po", "crane", "viper", "mantis"]} spread={1.35} turn={false} />
      </div>
      <div className="kfp-menu-panel">
        <div className="kfp-logo">
          <small>KUNG FU PANDA</small>
          <h1>Dragon Warrior</h1>
        </div>
        <button type="button" className="kfp-btn primary" onClick={onPlay}>
          {fresh ? "Play" : allDone ? "Play Again" : "Continue"}
          <small>{allDone ? "Pick any mission" : `Mission ${MISSIONS.indexOf(next) + 1}: ${next.name}`}</small>
        </button>
        <button type="button" className="kfp-btn" onClick={onMissions}>
          Missions <small>{progress.completed.length} / {MISSIONS.length} complete</small>
        </button>
        <div className="kfp-row">
          <button type="button" className="kfp-btn small" onClick={onHelp}>
            How to play
          </button>
          <button type="button" className="kfp-btn small" onClick={onSettings}>
            Settings
          </button>
        </div>
        <p className="kfp-legal">Fan-made prototype. Kung Fu Panda names and characters belong to their owners — not for public release without authorization. All models, sounds and art here are original.</p>
      </div>
    </div>
  );
}

export function Missions({ progress, onPick, onBack }) {
  return (
    <div className="kfp-screen kfp-panel-screen">
      <div className="kfp-panel">
        <h2>Missions</h2>
        <ol className="kfp-missions">
          {MISSIONS.map((m, i) => {
            const open = missionUnlocked(progress, m.id);
            const done = progress.completed.includes(m.id);
            return (
              <li key={m.id} className={`${open ? "" : "locked"} ${done ? "done" : ""}`}>
                <div className="kfp-mnum">{i + 1}</div>
                <div className="kfp-minfo">
                  <b>{m.name}</b>
                  <span>{m.brief}</span>
                  <span className="kfp-mmeta">
                    {done ? `✓ Complete${progress.best[m.id] ? ` · best ${fmtTime(progress.best[m.id])}` : ""}` : open ? "Ready" : "Locked — finish the previous mission"}
                    {m.reward && ` · Reward: ${HEROES[m.reward].name}`}
                  </span>
                </div>
                <button type="button" className="kfp-btn small" disabled={!open} onClick={() => onPick(m.id)}>
                  {done ? "Replay" : "Play"}
                </button>
              </li>
            );
          })}
        </ol>
        <button type="button" className="kfp-btn ghost" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

export function HeroSelect({ progress, missionId, hero, setHero, onStart, onBack }) {
  const M = MISSION_BY_ID[missionId];
  const H = HEROES[hero];
  return (
    <div className="kfp-screen kfp-select">
      <div className="kfp-select-top">
        <button type="button" className="kfp-btn ghost small" onClick={onBack}>
          ‹ Back
        </button>
        <div className="kfp-select-mission">
          <small>Mission {MISSIONS.indexOf(M) + 1}</small>
          <b>{M.name}</b>
        </div>
      </div>
      <div className="kfp-select-body">
        <div className="kfp-select-stage">
          <Preview ids={[hero]} />
          <div className="kfp-select-info">
            <h2>{H.name}</h2>
            <div className="kfp-sub">{H.title}</div>
            <p>{H.blurb}</p>
            <Stat label="Health" v={H.hp / 140} />
            <Stat label="Speed" v={H.speed / 7.2} />
            <Stat label="Power" v={(H.punch.dmg + H.kick.dmg) / 38} />
            <div className="kfp-special">
              <b>Special — {H.special.name}</b>
              <span>{H.special.desc}</span>
            </div>
          </div>
        </div>
        <div className="kfp-roster">
          {HERO_ORDER.map((id) => {
            const h = HEROES[id];
            const open = progress.unlocked.includes(id);
            return (
              <button
                type="button"
                key={id}
                className={`kfp-card ${id === hero ? "sel" : ""} ${open ? "" : "locked"}`}
                onClick={() => open && setHero(id)}
                disabled={!open}
                title={open ? h.name : `Complete "${UNLOCK_BY[id]?.name}" to unlock`}
              >
                <span className="kfp-card-badge" style={{ background: h.color, color: h.accent }}>
                  {h.name[0]}
                </span>
                <b>{h.name}</b>
                <small>{open ? h.special.name : `🔒 ${UNLOCK_BY[id]?.name || ""}`}</small>
              </button>
            );
          })}
        </div>
      </div>
      <div className="kfp-select-bottom">
        <p className="kfp-brief">{M.brief}</p>
        <button type="button" className="kfp-btn primary" onClick={onStart}>
          Start as {H.name}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, v }) {
  return (
    <div className="kfp-stat">
      <span>{label}</span>
      <i>
        <em style={{ width: `${Math.max(8, Math.min(100, v * 100))}%` }} />
      </i>
    </div>
  );
}

export function Pause({ onResume, onRestart, onSettings, onHelp, onQuit, onHero }) {
  return (
    <div className="kfp-overlay">
      <div className="kfp-panel narrow">
        <h2>Paused</h2>
        <button type="button" className="kfp-btn primary" onClick={onResume}>
          Resume
        </button>
        <button type="button" className="kfp-btn" onClick={onRestart}>
          Restart mission
        </button>
        <button type="button" className="kfp-btn" onClick={onHero}>
          Change hero
        </button>
        <div className="kfp-row">
          <button type="button" className="kfp-btn small" onClick={onHelp}>
            Controls
          </button>
          <button type="button" className="kfp-btn small" onClick={onSettings}>
            Settings
          </button>
        </div>
        <button type="button" className="kfp-btn ghost" onClick={onQuit}>
          Quit to menu
        </button>
      </div>
    </div>
  );
}

export function Complete({ info, onNext, onMissions, onMenu, onReplay }) {
  const M = MISSION_BY_ID[info.mission];
  const nextM = MISSIONS[MISSIONS.indexOf(M) + 1];
  const reward = info.newReward ? HEROES[info.newReward] : null;
  return (
    <div className="kfp-overlay">
      <div className="kfp-panel narrow kfp-complete">
        <small className="kfp-kicker">Mission complete</small>
        <h2>{M.name}</h2>
        <div className="kfp-results">
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
        {reward ? (
          <div className="kfp-reward">
            <span className="kfp-card-badge" style={{ background: reward.color, color: reward.accent }}>
              {reward.name[0]}
            </span>
            <div>
              <small>New hero unlocked!</small>
              <b>{reward.name}</b>
              <span>{reward.special.name}</span>
            </div>
          </div>
        ) : (
          info.newBest && <div className="kfp-reward plain">New best time!</div>
        )}
        {nextM && (
          <button type="button" className="kfp-btn primary" onClick={onNext}>
            Next: {nextM.name}
          </button>
        )}
        <div className="kfp-row">
          <button type="button" className="kfp-btn small" onClick={onReplay}>
            Replay
          </button>
          <button type="button" className="kfp-btn small" onClick={onMissions}>
            Missions
          </button>
        </div>
        <button type="button" className="kfp-btn ghost" onClick={onMenu}>
          Main menu
        </button>
      </div>
    </div>
  );
}

export function GameOver({ mission, onRetry, onHero, onMenu }) {
  return (
    <div className="kfp-overlay red">
      <div className="kfp-panel narrow">
        <small className="kfp-kicker">Defeated</small>
        <h2>Get back up!</h2>
        <p className="kfp-center">{mission === "arena" ? "Tip: when the red circle appears, run out of it or dodge as he lands — then strike while he recovers." : "Tip: a red ring under a foe means an attack is coming. Dodge with Shift, and eat dumplings to heal."}</p>
        <button type="button" className="kfp-btn primary" onClick={onRetry}>
          Try again
        </button>
        <button type="button" className="kfp-btn" onClick={onHero}>
          Change hero
        </button>
        <button type="button" className="kfp-btn ghost" onClick={onMenu}>
          Main menu
        </button>
      </div>
    </div>
  );
}

export function Victory({ info, onMenu, onMissions }) {
  return (
    <div className="kfp-overlay gold">
      <div className="kfp-panel kfp-victory">
        <small className="kfp-kicker">Tai Lung is defeated</small>
        <h2>You are the Dragon Warrior!</h2>
        <p className="kfp-center">
          The Valley of Peace is safe. Time: <b>{fmtTime(info.time)}</b> · Damage taken: <b>{info.damage}</b>
        </p>
        <div className="kfp-victory-art">
          <Preview ids={["tigress", "monkey", "po", "crane", "viper", "mantis"]} spread={1.3} turn={false} />
        </div>
        <p className="kfp-center">All six heroes are now unlocked — replay any mission with anyone.</p>
        <div className="kfp-row">
          <button type="button" className="kfp-btn primary" onClick={onMissions}>
            Missions
          </button>
          <button type="button" className="kfp-btn" onClick={onMenu}>
            Main menu
          </button>
        </div>
      </div>
    </div>
  );
}

export function Settings({ settings, setSetting, onReset, onBack }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="kfp-overlay">
      <div className="kfp-panel narrow">
        <h2>Settings</h2>
        <label className="kfp-set">
          <span>Camera sensitivity</span>
          <input type="range" min="0.3" max="2.5" step="0.1" value={settings.sens} onChange={(e) => setSetting("sens", parseFloat(e.target.value))} />
          <b>{settings.sens.toFixed(1)}</b>
        </label>
        <label className="kfp-set">
          <span>Invert camera Y</span>
          <input type="checkbox" checked={settings.invertY} onChange={(e) => setSetting("invertY", e.target.checked)} />
        </label>
        <label className="kfp-set">
          <span>Sound effects</span>
          <input type="checkbox" checked={settings.sound} onChange={(e) => setSetting("sound", e.target.checked)} />
        </label>
        <label className="kfp-set">
          <span>Touch controls</span>
          <select value={settings.touch} onChange={(e) => setSetting("touch", e.target.value)}>
            <option value="auto">Auto</option>
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </label>
        {confirm ? (
          <div className="kfp-row">
            <button
              type="button"
              className="kfp-btn small danger"
              onClick={() => {
                onReset();
                setConfirm(false);
              }}
            >
              Yes, erase progress
            </button>
            <button type="button" className="kfp-btn small" onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="kfp-btn small ghost" onClick={() => setConfirm(true)}>
            Reset progress…
          </button>
        )}
        <button type="button" className="kfp-btn primary" onClick={onBack}>
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
    ["Punch (3-hit combo)", "Left click / J", "PUNCH"],
    ["Kick", "Right click / F", "KICK"],
    ["Special move", "Q", "SPECIAL"],
    ["Dodge roll", "Shift", "DODGE"],
    ["Interact / pick up", "E", "USE"],
    ["Pause", "Esc / P", "II"],
  ];
  return (
    <div className="kfp-overlay">
      <div className="kfp-panel narrow">
        <h2>How to play</h2>
        <table className="kfp-keys">
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
        <p className="kfp-center">Attacks lock on to the nearest foe in front of you. A red ring means an enemy is about to strike — dodge rolls make you briefly untouchable.</p>
        <button type="button" className="kfp-btn primary" onClick={onBack}>
          Got it
        </button>
      </div>
    </div>
  );
}
