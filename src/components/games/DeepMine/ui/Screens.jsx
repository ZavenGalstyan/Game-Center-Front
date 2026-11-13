/**
 * Menus and overlay screens. All copy is plain English; the Game Center's
 * runtime translator swaps it for Russian when that language is active.
 * Keep sentences as whole text nodes (no inline tags mid-sentence).
 */
import { LEVELS } from "../engine/levels.js";
import { WEAPONS, ENEMIES } from "../engine/sim.js";

const fmtTime = (s) => {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
};

function Title({ small }) {
  return (
    <div className={`dm-title ${small ? "small" : ""}`}>
      <div className="dm-title-top">Deep Mine</div>
      <div className="dm-title-sub">The Forgotten Ones</div>
    </div>
  );
}

export function MainMenu({ progress, onPlay, onContinue, onLevels, onHelp, onSettings }) {
  const started = progress.unlocked > 1 || Object.keys(progress.completed).length > 0;
  return (
    <div className="dm-screen dm-menu">
      <div className="dm-menu-col">
        <Title />
        <p className="dm-tagline">The Deeper You Go, the Darker It Gets.</p>
        <nav className="dm-menu-buttons" aria-label="Main menu">
          <button className="dm-btn primary" onClick={onPlay}>
            {started ? "New Game" : "Play"}
          </button>
          <button className="dm-btn" onClick={onContinue} disabled={!started}>
            Continue
          </button>
          <button className="dm-btn" onClick={onLevels}>
            Level Select
          </button>
          <button className="dm-btn" onClick={onHelp}>
            How to Play
          </button>
          <button className="dm-btn" onClick={onSettings}>
            Settings
          </button>
        </nav>
        {progress.victory && <p className="dm-escaped">You reached the surface. Replay any level from Level Select.</p>}
      </div>
    </div>
  );
}

export function LevelSelect({ progress, onPick, onBack }) {
  return (
    <div className="dm-screen dm-dim">
      <div className="dm-panel wide">
        <h2>Level Select</h2>
        <div className="dm-levels">
          {LEVELS.map((L) => {
            const locked = L.id > progress.unlocked;
            const done = progress.completed[L.id];
            return (
              <button key={L.id} className={`dm-level ${locked ? "locked" : ""} ${done ? "done" : ""}`} disabled={locked} onClick={() => onPick(L.id)} aria-label={locked ? `Level ${L.id}, locked` : `Level ${L.id}: ${L.name}`}>
                <span className="dm-level-num">{L.id}</span>
                <span className="dm-level-name">{L.name}</span>
                <span className="dm-level-state">{locked ? "Locked" : done ? `Best ${fmtTime(done.time)}` : "Ready"}</span>
              </button>
            );
          })}
        </div>
        <div className="dm-row">
          <button className="dm-btn" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

const WEAPON_NOTE = {
  1: "You start with nothing but a flashlight. The foreman's pistol is in his office.",
  5: "The pump shotgun is locked in the storage cage on this level.",
  10: "The experimental flare gun is sealed in the laboratory vault.",
};
const ENEMY_CH = { m: "miner", c: "crawler", B: "brute" };

export function Briefing({ level, onStart, onBack }) {
  const L = level;
  const enemies = [...new Set(L.map.join("").split("").filter((ch) => ENEMY_CH[ch]))].map((ch) => ENEMY_CH[ch]);
  for (const st of L.steps) for (const wv of st.waves || []) for (const t of wv) if (!enemies.includes(t)) enemies.push(t);
  return (
    <div className="dm-screen dm-dim">
      <div className="dm-panel">
        <div className="dm-kicker">{`Level ${L.id} of 12`}</div>
        <h2>{L.name}</h2>
        <p className="dm-desc">{L.desc}</p>
        <div className="dm-obj-list">
          <div className="dm-obj-head">Objectives</div>
          <ol>
            {L.steps.map((s, i) => (
              <li key={i}>{s.text}</li>
            ))}
          </ol>
        </div>
        {enemies.length > 0 && (
          <div className="dm-chips" aria-label="Enemies">
            {enemies.map((t) => (
              <span key={t} className={`dm-chip ${t}`}>
                {L.id === 12 && t === "brute" ? "The Forgotten King" : ENEMIES[t].name}
              </span>
            ))}
          </div>
        )}
        {WEAPON_NOTE[L.id] && <p className="dm-note">{WEAPON_NOTE[L.id]}</p>}
        {L.id > 10 && <p className="dm-note">You carry the mining pistol, the pump shotgun and the flare gun.</p>}
        {L.id > 5 && L.id <= 10 && <p className="dm-note">You carry the mining pistol and the pump shotgun.</p>}
        <div className="dm-row">
          <button className="dm-btn" onClick={onBack}>
            Back
          </button>
          <button className="dm-btn primary" onClick={onStart} autoFocus>
            Start
          </button>
        </div>
        <p className="dm-small">Click the game to capture the mouse. Press Esc to pause.</p>
      </div>
    </div>
  );
}

const CONTROLS = [
  ["W A S D", "Move"],
  ["Mouse", "Look around"],
  ["Left Click", "Shoot"],
  ["Right Click", "Aim"],
  ["R", "Reload"],
  ["F", "Flashlight on / off"],
  ["E", "Interact"],
  ["Shift", "Sprint"],
  ["Space", "Jump"],
  ["1 – 3", "Switch weapons"],
  ["Esc", "Pause / Release mouse"],
];

export function Help({ onBack }) {
  return (
    <div className="dm-screen dm-dim dm-top">
      <div className="dm-panel wide">
        <h2>How to Play</h2>
        <div className="dm-help">
          <section>
            <h3>Controls</h3>
            <dl className="dm-keys">
              {CONTROLS.map(([k, v]) => (
                <div key={k}>
                  <dt>
                    <kbd>{k}</kbd>
                  </dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <h3>Survival</h3>
            <ul className="dm-tips">
              <li>Complete each objective to unseal the exit, then press E at the exit.</li>
              <li>Your flashlight drains its battery while it is on. An empty battery only dims it — pick up batteries to restore full light.</li>
              <li>Headshots deal extra damage. Hold right click to aim more accurately.</li>
              <li>Ammo, batteries, keys and medkits are picked up by walking over them. Fallen creatures sometimes drop supplies.</li>
            </ul>
          </section>
          <section>
            <h3>Puzzles</h3>
            <ul className="dm-tips">
              <li>Read the workers' notes with E. They hold codes, orders and hints.</li>
              <li>Keys open locked mine gates. Generators need fuel cans before they start.</li>
              <li>Coloured levers must be pulled in the right order — a wrong lever resets the panel.</li>
              <li>Mine carts roll along their rails when you push them with E.</li>
              <li>Cracked rock with light behind it can be shot until it collapses.</li>
            </ul>
            <h3>Weapons</h3>
            <ul className="dm-tips">
              <li>{`${WEAPONS.pistol.name} — reliable at any range, 10 rounds.`}</li>
              <li>{`${WEAPONS.shotgun.name} — devastating up close, 6 shells. Found in level 5.`}</li>
              <li>{`${WEAPONS.flare.name} — heavy shot that leaves a burning flare. Lights the dark and scorches anything nearby. Found in level 10.`}</li>
            </ul>
            <h3>Enemies</h3>
            <ul className="dm-tips">
              <li>{`${ENEMIES.miner.name} — slow and weak, but hits hard up close.`}</li>
              <li>{`${ENEMIES.crawler.name} — fast and fragile. Comes out of the side tunnels.`}</li>
              <li>{`${ENEMIES.brute.name} — huge and tough. Jump its shockwaves, dodge thrown rocks and sidestep its charge.`}</li>
            </ul>
          </section>
        </div>
        <div className="dm-row">
          <button className="dm-btn" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, fmt }) {
  return (
    <label className="dm-set">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
      <span className="dm-set-val">{fmt ? fmt(value) : value}</span>
    </label>
  );
}
function Choice({ label, value, options, onChange }) {
  return (
    <div className="dm-set" role="group" aria-label={label}>
      <span>{label}</span>
      <div className="dm-seg">
        {options.map(([v, text]) => (
          <button key={String(v)} className={value === v ? "on" : ""} onClick={() => onChange(v)} aria-pressed={value === v}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Settings({ settings, setSetting, onReset, onBack, inGame }) {
  const pct = (v) => `${Math.round(v * 100)}%`;
  return (
    <div className="dm-screen dm-dim dm-top">
      <div className="dm-panel">
        <h2>Settings</h2>
        <Slider label="Sound volume" value={settings.volume} min={0} max={1} step={0.05} onChange={(v) => setSetting("volume", v)} fmt={pct} />
        <Slider label="Ambience volume" value={settings.music} min={0} max={1} step={0.05} onChange={(v) => setSetting("music", v)} fmt={pct} />
        <Slider label="Mouse sensitivity" value={settings.sens} min={0.2} max={3} step={0.1} onChange={(v) => setSetting("sens", v)} fmt={(v) => v.toFixed(1)} />
        <Slider label="Brightness" value={settings.brightness} min={0.5} max={1.6} step={0.05} onChange={(v) => setSetting("brightness", v)} fmt={pct} />
        <Choice label="Invert mouse Y" value={settings.invertY} options={[[false, "Off"], [true, "On"]]} onChange={(v) => setSetting("invertY", v)} />
        <Choice label="Graphics quality" value={settings.quality} options={[["low", "Low"], ["medium", "Medium"], ["high", "High"]]} onChange={(v) => setSetting("quality", v)} />
        <Choice label="Difficulty" value={settings.difficulty} options={[["easy", "Easy"], ["normal", "Normal"], ["hard", "Hard"]]} onChange={(v) => setSetting("difficulty", v)} />
        <Choice label="Tutorial hints" value={settings.hints} options={[[true, "On"], [false, "Off"]]} onChange={(v) => setSetting("hints", v)} />
        {inGame && <p className="dm-small">Difficulty changes apply when a level starts.</p>}
        <p className="dm-small">The Mute button below the game silences everything.</p>
        <div className="dm-row">
          {!inGame && (
            <button className="dm-btn danger" onClick={onReset}>
              Reset progress
            </button>
          )}
          <button className="dm-btn primary" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

export function Pause({ level, onResume, onRestart, onHelp, onSettings, onQuit }) {
  return (
    <div className="dm-screen dm-dim">
      <div className="dm-panel narrow">
        <div className="dm-kicker">{`Level ${level.id} · ${level.name}`}</div>
        <h2>Paused</h2>
        <div className="dm-col">
          <button className="dm-btn primary" onClick={onResume} autoFocus>
            Resume
          </button>
          <button className="dm-btn" onClick={onRestart}>
            Restart Level
          </button>
          <button className="dm-btn" onClick={onHelp}>
            How to Play
          </button>
          <button className="dm-btn" onClick={onSettings}>
            Settings
          </button>
          <button className="dm-btn" onClick={onQuit}>
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}

export function GameOver({ level, onRestart, onQuit }) {
  return (
    <div className="dm-screen dm-dead">
      <div className="dm-panel narrow center">
        <h2 className="dm-red">Game Over</h2>
        <p className="dm-desc">The mine claims another soul.</p>
        <p className="dm-small">{`Level ${level.id} · ${level.name}`}</p>
        <div className="dm-col">
          <button className="dm-btn primary" onClick={onRestart} autoFocus>
            Restart Level
          </button>
          <button className="dm-btn" onClick={onQuit}>
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}

export function LevelComplete({ r, level, onNext, onReplay, onQuit }) {
  return (
    <div className="dm-screen dm-dim">
      <div className="dm-panel narrow center">
        <div className="dm-kicker">{`Level ${level.id} of 12`}</div>
        <h2 className="dm-gold">Level Complete</h2>
        <p className="dm-desc">{level.name}</p>
        <div className="dm-stats">
          <div>
            <span>Time</span>
            <b>{fmtTime(r.time)}</b>
          </div>
          <div>
            <span>Kills</span>
            <b>{r.kills}</b>
          </div>
          <div>
            <span>Accuracy</span>
            <b>{`${r.accuracy}%`}</b>
          </div>
          <div>
            <span>Damage taken</span>
            <b>{r.dmgTaken}</b>
          </div>
        </div>
        <p className="dm-small">{`Level ${Math.min(12, level.id + 1)} unlocked.`}</p>
        <div className="dm-col">
          <button className="dm-btn primary" onClick={onNext} autoFocus>
            Next Level
          </button>
          <button className="dm-btn" onClick={onReplay}>
            Replay Level
          </button>
          <button className="dm-btn" onClick={onQuit}>
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}

export function Victory({ progress, onMenu, onLevels }) {
  const total = Object.values(progress.completed).reduce((a, c) => a + c.time, 0);
  const kills = Object.values(progress.completed).reduce((a, c) => a + c.kills, 0);
  return (
    <div className="dm-screen dm-victory">
      <div className="dm-confetti" aria-hidden="true">
        {Array.from({ length: 28 }, (_, i) => (
          <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.45}s`, animationDuration: `${3 + (i % 5) * 0.6}s` }} />
        ))}
      </div>
      <div className="dm-panel center">
        <Title small />
        <h2 className="dm-gold">You Reached the Surface!</h2>
        <p className="dm-desc">The cage rattles up through a thousand metres of rock and stops in grey morning light. Behind you the shaft falls silent. The forgotten ones will stay forgotten — but you will remember them.</p>
        <div className="dm-stats">
          <div>
            <span>Levels</span>
            <b>{`${Object.keys(progress.completed).length} / 12`}</b>
          </div>
          <div>
            <span>Total time</span>
            <b>{fmtTime(total)}</b>
          </div>
          <div>
            <span>Kills</span>
            <b>{kills}</b>
          </div>
        </div>
        <div className="dm-row">
          <button className="dm-btn" onClick={onLevels}>
            Level Select
          </button>
          <button className="dm-btn primary" onClick={onMenu} autoFocus>
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}

/** a worker's note, read with E */
export function NoteView({ note, onClose }) {
  return (
    <div className="dm-screen dm-dim dm-top" role="dialog" aria-label="Note">
      <div className="dm-note-paper">
        <div className="dm-kicker">Worker's note</div>
        <h2>{note.title}</h2>
        <p className="dm-note-text">{note.text}</p>
        <div className="dm-row">
          <button className="dm-btn primary" onClick={onClose} autoFocus>
            Close
          </button>
        </div>
        <p className="dm-small">Press E or Esc to close.</p>
      </div>
    </div>
  );
}

/** wall keypad: four digits, typed or clicked */
export function Keypad({ entry, status, onDigit, onClear, onEnter, onClose }) {
  const shown = (entry + "____").slice(0, 4).split("").join(" ");
  return (
    <div className="dm-screen dm-dim dm-top" role="dialog" aria-label="Keypad">
      <div className="dm-keypad">
        <div className="dm-kicker">Security keypad</div>
        <div className={`dm-kp-display ${status}`} aria-live="polite">
          {status === "fail" ? "Wrong code" : status === "ok" ? "Code accepted" : shown}
        </div>
        <div className="dm-kp-grid">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button key={d} className="dm-kp-key" onClick={() => onDigit(d)}>
              {d}
            </button>
          ))}
          <button className="dm-kp-key alt" onClick={onClear} aria-label="Clear">
            C
          </button>
          <button className="dm-kp-key" onClick={() => onDigit("0")}>
            0
          </button>
          <button className="dm-kp-key ok" onClick={onEnter} aria-label="Enter code">
            OK
          </button>
        </div>
        <div className="dm-row">
          <button className="dm-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="dm-small">Type the digits or click the keys. Enter confirms, Esc closes.</p>
      </div>
    </div>
  );
}
