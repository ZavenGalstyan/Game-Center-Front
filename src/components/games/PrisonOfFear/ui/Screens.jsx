/**
 * Menus and overlay screens. All copy is plain English; the Game Center's
 * runtime translator swaps it for Russian when that language is active.
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
    <div className={`pf-title ${small ? "small" : ""}`}>
      <div className="pf-title-top">Prison of Fear</div>
      <div className="pf-title-sub">Final Lockdown</div>
    </div>
  );
}

export function MainMenu({ progress, onPlay, onContinue, onLevels, onHelp, onSettings }) {
  const started = progress.unlocked > 1 || Object.keys(progress.completed).length > 0;
  return (
    <div className="pf-screen pf-menu">
      <div className="pf-menu-col">
        <Title />
        <p className="pf-tagline">No Guards. No Mercy. No Escape.</p>
        <nav className="pf-menu-buttons">
          <button className="pf-btn primary" onClick={onPlay}>
            {started ? "New Game" : "Play"}
          </button>
          <button className="pf-btn" onClick={onContinue} disabled={!started}>
            Continue
          </button>
          <button className="pf-btn" onClick={onLevels}>
            Level Select
          </button>
          <button className="pf-btn" onClick={onHelp}>
            How to Play
          </button>
          <button className="pf-btn" onClick={onSettings}>
            Settings
          </button>
        </nav>
        {progress.victory && <p className="pf-escaped">You escaped the prison. Replay any level from Level Select.</p>}
      </div>
    </div>
  );
}

export function LevelSelect({ progress, onPick, onBack }) {
  return (
    <div className="pf-screen pf-dim">
      <div className="pf-panel wide">
        <h2>Level Select</h2>
        <div className="pf-levels">
          {LEVELS.map((L) => {
            const locked = L.id > progress.unlocked;
            const done = progress.completed[L.id];
            return (
              <button key={L.id} className={`pf-level ${locked ? "locked" : ""} ${done ? "done" : ""}`} disabled={locked} onClick={() => onPick(L.id)}>
                <span className="pf-level-num">{L.id}</span>
                <span className="pf-level-name">{L.name}</span>
                <span className="pf-level-state">{locked ? "Locked" : done ? `Best ${fmtTime(done.time)}` : "Ready"}</span>
              </button>
            );
          })}
        </div>
        <div className="pf-row">
          <button className="pf-btn" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

export function Briefing({ level, onStart, onBack }) {
  const L = level;
  return (
    <div className="pf-screen pf-dim">
      <div className="pf-panel">
        <div className="pf-kicker">{`Level ${L.id} of 10`}</div>
        <h2>{L.name}</h2>
        <p className="pf-desc">{L.desc}</p>
        <div className="pf-obj-list">
          <div className="pf-obj-head">Objectives</div>
          <ol>
            {L.steps.map((s, i) => (
              <li key={i}>{s.text}</li>
            ))}
          </ol>
        </div>
        {L.id === 6 && <p className="pf-note">The shotgun is hidden somewhere on this level.</p>}
        {L.id > 6 && <p className="pf-note">You carry the pistol and the shotgun.</p>}
        <div className="pf-row">
          <button className="pf-btn" onClick={onBack}>
            Back
          </button>
          <button className="pf-btn primary" onClick={onStart} autoFocus>
            Start
          </button>
        </div>
        <p className="pf-small">Click to capture the mouse. Press Esc to pause.</p>
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
  ["F", "Punch"],
  ["Q", "Block (hold)"],
  ["E", "Interact"],
  ["Shift", "Sprint"],
  ["1 / 2", "Switch weapons"],
  ["Esc", "Pause"],
];

export function Help({ onBack }) {
  return (
    <div className="pf-screen pf-dim pf-top">
      <div className="pf-panel wide">
        <h2>How to Play</h2>
        <div className="pf-help">
          <section>
            <h3>Controls</h3>
            <dl className="pf-keys">
              {CONTROLS.map(([k, v]) => (
                <div key={k}>
                  <dt>
                    <kbd>{k}</kbd>
                  </dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section>
            <h3>Survival</h3>
            <ul className="pf-tips">
              <li>Complete each objective to unlock the exit door, then press E at the exit.</li>
              <li>Headshots deal extra damage. Aim with right click for better accuracy.</li>
              <li>Punches work even with no ammo. Every third punch in a combo is a heavy blow.</li>
              <li>Hold Q to block. Blocking right before a hit lands stops it completely and staggers the attacker.</li>
              <li>Ammo and medkits are picked up by walking over them.</li>
              <li>Infected prisoners can force ordinary doors open. Security gates hold.</li>
            </ul>
            <h3>Weapons</h3>
            <ul className="pf-tips">
              <li>
                <b>{WEAPONS.pistol.name}</b> — Accurate at range. 12-round magazine.
              </li>
              <li>
                <b>{WEAPONS.shotgun.name}</b> — Devastating up close, knocks enemies back. 6 shells. Found in level 6.
              </li>
            </ul>
            <h3>Enemies</h3>
            <ul className="pf-tips">
              <li>
                <b>{ENEMIES.infected.name}</b> — Slow and weak, but rarely alone.
              </li>
              <li>
                <b>{ENEMIES.creature.name}</b> — Fast and vicious. Keep your distance.
              </li>
              <li>
                <b>{ENEMIES.brute.name}</b> — Huge and slow. Its slam hits hard — step back when it raises its fists.
              </li>
            </ul>
          </section>
        </div>
        <div className="pf-row">
          <button className="pf-btn" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, fmt }) {
  return (
    <label className="pf-set">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="pf-set-val">{fmt ? fmt(value) : value}</span>
    </label>
  );
}
function Choice({ label, value, options, onChange }) {
  return (
    <div className="pf-set">
      <span>{label}</span>
      <div className="pf-seg">
        {options.map(([v, text]) => (
          <button key={v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>
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
    <div className="pf-screen pf-dim pf-top">
      <div className="pf-panel">
        <h2>Settings</h2>
        <Slider label="Volume" value={settings.volume} min={0} max={1} step={0.05} onChange={(v) => setSetting("volume", v)} fmt={pct} />
        <Slider label="Mouse sensitivity" value={settings.sens} min={0.2} max={3} step={0.1} onChange={(v) => setSetting("sens", v)} fmt={(v) => v.toFixed(1)} />
        <Slider label="Brightness" value={settings.brightness} min={0.5} max={1.6} step={0.05} onChange={(v) => setSetting("brightness", v)} fmt={pct} />
        <Choice label="Invert mouse Y" value={settings.invertY} options={[[false, "Off"], [true, "On"]]} onChange={(v) => setSetting("invertY", v)} />
        <Choice label="Graphics quality" value={settings.quality} options={[["low", "Low"], ["medium", "Medium"], ["high", "High"]]} onChange={(v) => setSetting("quality", v)} />
        <Choice label="Difficulty" value={settings.difficulty} options={[["easy", "Easy"], ["normal", "Normal"], ["hard", "Hard"]]} onChange={(v) => setSetting("difficulty", v)} />
        <Choice label="Tutorial hints" value={settings.hints} options={[[true, "On"], [false, "Off"]]} onChange={(v) => setSetting("hints", v)} />
        {inGame && <p className="pf-small">Difficulty changes apply when a level starts.</p>}
        <div className="pf-row">
          {!inGame && (
            <button className="pf-btn danger" onClick={onReset}>
              Reset progress
            </button>
          )}
          <button className="pf-btn primary" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

export function Pause({ level, onResume, onRestart, onHelp, onSettings, onQuit }) {
  return (
    <div className="pf-screen pf-dim">
      <div className="pf-panel narrow">
        <div className="pf-kicker">{`Level ${level.id} · ${level.name}`}</div>
        <h2>Paused</h2>
        <div className="pf-col">
          <button className="pf-btn primary" onClick={onResume} autoFocus>
            Resume
          </button>
          <button className="pf-btn" onClick={onRestart}>
            Restart Level
          </button>
          <button className="pf-btn" onClick={onHelp}>
            How to Play
          </button>
          <button className="pf-btn" onClick={onSettings}>
            Settings
          </button>
          <button className="pf-btn" onClick={onQuit}>
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}

export function GameOver({ level, onRestart, onQuit }) {
  return (
    <div className="pf-screen pf-dead">
      <div className="pf-panel narrow center">
        <h2 className="pf-red">You Died</h2>
        <p className="pf-desc">{`${level.name} claimed another prisoner.`}</p>
        <div className="pf-col">
          <button className="pf-btn primary" onClick={onRestart} autoFocus>
            Restart Level
          </button>
          <button className="pf-btn" onClick={onQuit}>
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}

export function LevelComplete({ r, level, onNext, onReplay, onQuit }) {
  return (
    <div className="pf-screen pf-dim">
      <div className="pf-panel narrow center">
        <div className="pf-kicker">{`Level ${level.id} of 10`}</div>
        <h2 className="pf-green">Level Complete</h2>
        <p className="pf-desc">{level.name}</p>
        <div className="pf-stats">
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
        <div className="pf-col">
          <button className="pf-btn primary" onClick={onNext} autoFocus>
            Next Level
          </button>
          <button className="pf-btn" onClick={onReplay}>
            Replay Level
          </button>
          <button className="pf-btn" onClick={onQuit}>
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
    <div className="pf-screen pf-victory">
      <div className="pf-panel center">
        <Title small />
        <h2 className="pf-green">You Escaped!</h2>
        <p className="pf-desc">The last gate falls behind you. Cold night air, distant sirens — and silence from the prison. You survived the Final Lockdown.</p>
        <div className="pf-stats">
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
        <div className="pf-row">
          <button className="pf-btn" onClick={onLevels}>
            Level Select
          </button>
          <button className="pf-btn primary" onClick={onMenu}>
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}
