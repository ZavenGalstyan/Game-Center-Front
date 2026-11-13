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
    <div className={`cf-title ${small ? "small" : ""}`}>
      <div className="cf-title-top">Carnival of Fear</div>
      <div className="cf-title-sub">Clown Hunt</div>
    </div>
  );
}

export function MainMenu({ progress, onPlay, onContinue, onLevels, onHelp, onSettings }) {
  const started = progress.unlocked > 1 || Object.keys(progress.completed).length > 0;
  return (
    <div className="cf-screen cf-menu">
      <div className="cf-menu-col">
        <Title />
        <p className="cf-tagline">The Show Is Over. The Nightmare Begins.</p>
        <nav className="cf-menu-buttons" aria-label="Main menu">
          <button className="cf-btn primary" onClick={onPlay}>
            {started ? "New Game" : "Play"}
          </button>
          <button className="cf-btn" onClick={onContinue} disabled={!started}>
            Continue
          </button>
          <button className="cf-btn" onClick={onLevels}>
            Level Select
          </button>
          <button className="cf-btn" onClick={onHelp}>
            How to Play
          </button>
          <button className="cf-btn" onClick={onSettings}>
            Settings
          </button>
        </nav>
        {progress.victory && <p className="cf-escaped">You escaped the carnival. Replay any level from Level Select.</p>}
      </div>
    </div>
  );
}

export function LevelSelect({ progress, onPick, onBack }) {
  return (
    <div className="cf-screen cf-dim">
      <div className="cf-panel wide">
        <h2>Level Select</h2>
        <div className="cf-levels">
          {LEVELS.map((L) => {
            const locked = L.id > progress.unlocked;
            const done = progress.completed[L.id];
            return (
              <button key={L.id} className={`cf-level ${locked ? "locked" : ""} ${done ? "done" : ""}`} disabled={locked} onClick={() => onPick(L.id)} aria-label={locked ? `Level ${L.id}, locked` : `Level ${L.id}: ${L.name}`}>
                <span className="cf-level-num">{L.id}</span>
                <span className="cf-level-name">{L.name}</span>
                <span className="cf-level-state">{locked ? "Locked" : done ? `Best ${fmtTime(done.time)}` : "Ready"}</span>
              </button>
            );
          })}
        </div>
        <div className="cf-row">
          <button className="cf-btn" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

const WEAPON_NOTE = {
  1: "Find the pistol at the ticket table before the clowns find you.",
  5: "The shotgun is locked in the animal cage on this level.",
  8: "The Carnival Blaster waits in the operator's booth.",
};

export function Briefing({ level, onStart, onBack }) {
  const L = level;
  const enemies = [...new Set(L.map.join("").split("").filter((ch) => "cjaK".includes(ch)))].map((ch) => ({ c: "clown", j: "jester", a: "armored", K: "king" })[ch]);
  return (
    <div className="cf-screen cf-dim">
      <div className="cf-panel">
        <div className="cf-kicker">{`Level ${L.id} of 10`}</div>
        <h2>{L.name}</h2>
        <p className="cf-desc">{L.desc}</p>
        <div className="cf-obj-list">
          <div className="cf-obj-head">Objectives</div>
          <ol>
            {L.steps.map((s, i) => (
              <li key={i}>{s.text}</li>
            ))}
          </ol>
        </div>
        {enemies.length > 0 && (
          <div className="cf-chips" aria-label="Enemies">
            {enemies.map((t) => (
              <span key={t} className={`cf-chip ${t}`}>
                {ENEMIES[t].name}
              </span>
            ))}
          </div>
        )}
        {WEAPON_NOTE[L.id] && <p className="cf-note">{WEAPON_NOTE[L.id]}</p>}
        {L.id > 8 && <p className="cf-note">You carry the pistol, the shotgun and the Carnival Blaster.</p>}
        {L.id > 5 && L.id <= 8 && <p className="cf-note">You carry the pistol and the shotgun.</p>}
        <div className="cf-row">
          <button className="cf-btn" onClick={onBack}>
            Back
          </button>
          <button className="cf-btn primary" onClick={onStart} autoFocus>
            Start
          </button>
        </div>
        <p className="cf-small">Click the game to capture the mouse. Press Esc to pause.</p>
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
  ["Shift", "Sprint"],
  ["Space", "Jump"],
  ["E", "Interact"],
  ["1 – 3", "Switch weapons"],
  ["Esc", "Pause / Release mouse"],
];

export function Help({ onBack }) {
  return (
    <div className="cf-screen cf-dim cf-top">
      <div className="cf-panel wide">
        <h2>How to Play</h2>
        <div className="cf-help">
          <section>
            <h3>Controls</h3>
            <dl className="cf-keys">
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
            <ul className="cf-tips">
              <li>Complete each objective to unlock the exit gate, then press E at the exit.</li>
              <li>Headshots deal extra damage. Hold right click to aim more accurately.</li>
              <li>Ammo, energy cells and medkits are picked up by walking over them. Fallen clowns sometimes drop supplies.</li>
              <li>Sparking floors flash yellow before they switch on. Wait, or jump across.</li>
              <li>Fortune machines give one free gift each. Press E to use them.</li>
            </ul>
          </section>
          <section>
            <h3>Weapons</h3>
            <ul className="cf-tips">
              <li>{`${WEAPONS.pistol.name} — accurate at range, 12 rounds.`}</li>
              <li>{`${WEAPONS.shotgun.name} — devastating up close, knocks clowns back, 6 shells. Found in level 5.`}</li>
              <li>{`${WEAPONS.blaster.name} — automatic energy weapon, 30 cells, melts armor. Found in level 8.`}</li>
            </ul>
            <h3>Enemies</h3>
            <ul className="cf-tips">
              <li>{`${ENEMIES.clown.name} — slow, but hits hard up close. Keep your distance.`}</li>
              <li>{`${ENEMIES.jester.name} — fast and fragile. Dodges when you aim at it.`}</li>
              <li>{`${ENEMIES.armored.name} — slow and tough. Body armor soaks bullets, so aim for the head.`}</li>
              <li>{`${ENEMIES.king.name} — the final boss. Jump over his shockwaves, run from his bombs and sidestep his charge.`}</li>
            </ul>
          </section>
        </div>
        <div className="cf-row">
          <button className="cf-btn" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, fmt }) {
  return (
    <label className="cf-set">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
      <span className="cf-set-val">{fmt ? fmt(value) : value}</span>
    </label>
  );
}
function Choice({ label, value, options, onChange }) {
  return (
    <div className="cf-set" role="group" aria-label={label}>
      <span>{label}</span>
      <div className="cf-seg">
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
    <div className="cf-screen cf-dim cf-top">
      <div className="cf-panel">
        <h2>Settings</h2>
        <Slider label="Sound volume" value={settings.volume} min={0} max={1} step={0.05} onChange={(v) => setSetting("volume", v)} fmt={pct} />
        <Slider label="Music volume" value={settings.music} min={0} max={1} step={0.05} onChange={(v) => setSetting("music", v)} fmt={pct} />
        <Slider label="Mouse sensitivity" value={settings.sens} min={0.2} max={3} step={0.1} onChange={(v) => setSetting("sens", v)} fmt={(v) => v.toFixed(1)} />
        <Slider label="Brightness" value={settings.brightness} min={0.5} max={1.6} step={0.05} onChange={(v) => setSetting("brightness", v)} fmt={pct} />
        <Choice label="Invert mouse Y" value={settings.invertY} options={[[false, "Off"], [true, "On"]]} onChange={(v) => setSetting("invertY", v)} />
        <Choice label="Graphics quality" value={settings.quality} options={[["low", "Low"], ["medium", "Medium"], ["high", "High"]]} onChange={(v) => setSetting("quality", v)} />
        <Choice label="Difficulty" value={settings.difficulty} options={[["easy", "Easy"], ["normal", "Normal"], ["hard", "Hard"]]} onChange={(v) => setSetting("difficulty", v)} />
        <Choice label="Tutorial hints" value={settings.hints} options={[[true, "On"], [false, "Off"]]} onChange={(v) => setSetting("hints", v)} />
        {inGame && <p className="cf-small">Difficulty changes apply when a level starts.</p>}
        <p className="cf-small">The Mute button below the game silences everything.</p>
        <div className="cf-row">
          {!inGame && (
            <button className="cf-btn danger" onClick={onReset}>
              Reset progress
            </button>
          )}
          <button className="cf-btn primary" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

export function Pause({ level, onResume, onRestart, onHelp, onSettings, onQuit }) {
  return (
    <div className="cf-screen cf-dim">
      <div className="cf-panel narrow">
        <div className="cf-kicker">{`Level ${level.id} · ${level.name}`}</div>
        <h2>Paused</h2>
        <div className="cf-col">
          <button className="cf-btn primary" onClick={onResume} autoFocus>
            Resume
          </button>
          <button className="cf-btn" onClick={onRestart}>
            Restart Level
          </button>
          <button className="cf-btn" onClick={onHelp}>
            How to Play
          </button>
          <button className="cf-btn" onClick={onSettings}>
            Settings
          </button>
          <button className="cf-btn" onClick={onQuit}>
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}

export function GameOver({ level, onRestart, onQuit }) {
  return (
    <div className="cf-screen cf-dead">
      <div className="cf-panel narrow center">
        <h2 className="cf-red">Game Over</h2>
        <p className="cf-desc">The clowns have claimed another guest.</p>
        <p className="cf-small">{`Level ${level.id} · ${level.name}`}</p>
        <div className="cf-col">
          <button className="cf-btn primary" onClick={onRestart} autoFocus>
            Restart Level
          </button>
          <button className="cf-btn" onClick={onQuit}>
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}

export function LevelComplete({ r, level, onNext, onReplay, onQuit }) {
  return (
    <div className="cf-screen cf-dim">
      <div className="cf-panel narrow center">
        <div className="cf-kicker">{`Level ${level.id} of 10`}</div>
        <h2 className="cf-gold">Level Complete</h2>
        <p className="cf-desc">{level.name}</p>
        <div className="cf-stats">
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
        <p className="cf-small">{`Level ${Math.min(10, level.id + 1)} unlocked.`}</p>
        <div className="cf-col">
          <button className="cf-btn primary" onClick={onNext} autoFocus>
            Next Level
          </button>
          <button className="cf-btn" onClick={onReplay}>
            Replay Level
          </button>
          <button className="cf-btn" onClick={onQuit}>
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
    <div className="cf-screen cf-victory">
      <div className="cf-confetti" aria-hidden="true">
        {Array.from({ length: 28 }, (_, i) => (
          <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.45}s`, animationDuration: `${3 + (i % 5) * 0.6}s` }} />
        ))}
      </div>
      <div className="cf-panel center">
        <Title small />
        <h2 className="cf-gold">You Escaped the Carnival!</h2>
        <p className="cf-desc">The Clown King's crown rolls across the sawdust. The music winds down, the lights go dark one by one, and the gates swing open into the cold night air. The show is finally over.</p>
        <div className="cf-stats">
          <div>
            <span>Levels</span>
            <b>{`${Object.keys(progress.completed).length} / 10`}</b>
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
        <div className="cf-row">
          <button className="cf-btn" onClick={onLevels}>
            Level Select
          </button>
          <button className="cf-btn primary" onClick={onMenu} autoFocus>
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}
