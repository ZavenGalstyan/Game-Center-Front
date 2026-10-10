/**
 * Dimension Dash — menu screens: main menu, level select (world selector +
 * level cards with unlock state, best rank / time, red stars), how to play,
 * settings and statistics. All drawn over the live 3D menu stage.
 */
import { useEffect, useState } from "react";
import { WORLDS } from "../data/worlds.js";
import { levelMeta, BUILT, PER_WORLD } from "../data/levels/index.js";
import { isUnlocked, worldProgress, totalRedStars, redStarCount } from "../utils/storage.js";
import { fmtTime, StarIcon, RingIcon } from "./Hud.jsx";
import { sound } from "../audio/sound.js";

const click = (fn) => () => {
  sound.uiClick();
  fn();
};

export function MainMenu({ progress, onPlay, onNav }) {
  const done = Object.keys(progress.completedLevels).length;
  return (
    <div className="dd-screen dd-main">
      <div className="dd-logo">
        <div className="dd-logo__ring" />
        <h1 className="dd-logo__title">
          <span className="dd-logo__a">DIMENSION</span>
          <span className="dd-logo__b">DASH</span>
        </h1>
        <div className="dd-logo__tag">
          RUN <i>•</i> SHIFT <i>•</i> DASH
        </div>
      </div>
      <nav className="dd-main__menu">
        <button type="button" className="dd-mbtn dd-mbtn--play" onClick={click(onPlay)} onMouseEnter={() => sound.uiMove()} autoFocus>
          <span>PLAY</span>
          <small>{done ? `Continue · ${done}/30 cleared` : "Start with Green Shift"}</small>
        </button>
        <button type="button" className="dd-mbtn" onClick={click(() => onNav("levels"))} onMouseEnter={() => sound.uiMove()}>
          LEVEL SELECT
        </button>
        <button type="button" className="dd-mbtn" onClick={click(() => onNav("howto"))} onMouseEnter={() => sound.uiMove()}>
          HOW TO PLAY
        </button>
        <button type="button" className="dd-mbtn" onClick={click(() => onNav("settings"))} onMouseEnter={() => sound.uiMove()}>
          SETTINGS
        </button>
        <button type="button" className="dd-mbtn" onClick={click(() => onNav("stats"))} onMouseEnter={() => sound.uiMove()}>
          STATISTICS
        </button>
      </nav>
      <div className="dd-main__foot">
        <span>
          <RingIcon size={16} /> {progress.totalRings.toLocaleString()}
        </span>
        <span>
          <StarIcon on size={16} /> {totalRedStars(progress)} / 90
        </span>
        <span className="dd-main__legal">Fan-made prototype · not affiliated with or endorsed by SEGA</span>
      </div>
    </div>
  );
}

export function LevelSelect({ progress, onPlay, onBack, initialWorld = 1 }) {
  const [w, setW] = useState(Math.max(1, Math.min(5, initialWorld)));
  const world = WORLDS[w - 1];
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === "Escape") onBack();
      if (e.code === "ArrowRight" && w < 5) setW(w + 1);
      if (e.code === "ArrowLeft" && w > 1) setW(w - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [w, onBack]);
  const levels = [];
  for (let i = 1; i <= PER_WORLD; i++) levels.push(levelMeta((w - 1) * PER_WORLD + i));
  return (
    <div className="dd-screen dd-levels" data-world={world.key}>
      <header className="dd-levels__head">
        <button type="button" className="dd-btn dd-btn--ghost" onClick={click(onBack)}>
          ← Back
        </button>
        <h2>Level Select</h2>
        <span className="dd-levels__total">
          <StarIcon on size={16} /> {totalRedStars(progress)} / 90
        </span>
      </header>
      <div className="dd-worlds">
        {WORLDS.map((wd) => {
          const wp = worldProgress(progress, wd.id);
          return (
            <button
              type="button"
              key={wd.id}
              className={`dd-world${wd.id === w ? " is-on" : ""}${wp.unlocked ? "" : " is-locked"}`}
              style={{ "--a": wd.colors.a, "--b": wd.colors.b }}
              onClick={click(() => setW(wd.id))}
            >
              <span className="dd-world__num">WORLD {wd.id}</span>
              <span className="dd-world__name">{wd.name}</span>
              <span className="dd-world__prog">
                {wp.unlocked ? `${wp.done}/6 · ${wp.stars}★` : "🔒 Locked"}
              </span>
            </button>
          );
        })}
      </div>
      <p className="dd-levels__blurb">{world.blurb}</p>
      <div className="dd-lvgrid">
        {levels.map((m) => {
          const open = isUnlocked(progress, m.id);
          const built = BUILT.includes(m.id);
          const playable = open && built;
          const rank = progress.bestRanks[m.id];
          const time = progress.bestTimes[m.id];
          const stars = progress.redStars[m.id] || [false, false, false];
          return (
            <button
              type="button"
              key={m.id}
              className={`dd-lv${playable ? "" : " is-locked"}${progress.completedLevels[m.id] ? " is-done" : ""}${m.boss ? " is-boss" : ""}`}
              disabled={!playable}
              onClick={playable ? click(() => onPlay(m.id)) : undefined}
              onMouseEnter={() => playable && sound.uiMove()}
              title={!built ? "Not built yet" : !open ? "Clear the previous level to unlock" : ""}
            >
              <span className="dd-lv__num">
                {m.world}-{m.num}
              </span>
              <span className="dd-lv__name">{built ? m.name : "Coming soon"}</span>
              {m.boss ? <span className="dd-lv__boss">BOSS</span> : null}
              {!open ? <span className="dd-lv__lock">🔒</span> : null}
              {open && built ? (
                <>
                  <span className={`dd-lv__rank dd-lv__rank--${rank || "none"}`}>{rank || "–"}</span>
                  <span className="dd-lv__time">{time ? fmtTime(time) : "--'--\"--"}</span>
                  <span className="dd-lv__stars">
                    {stars.map((s, i) => (
                      <StarIcon key={i} on={s} size={15} />
                    ))}
                  </span>
                  {progress.bestScores[m.id] ? <span className="dd-lv__score">{progress.bestScores[m.id].toLocaleString()}</span> : null}
                </>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function HowToPlay({ onBack }) {
  return (
    <div className="dd-panel dd-howto">
      <h2 className="dd-panel__title">How to play</h2>
      <div className="dd-howto__cols">
        <section>
          <h3>
            <span className="dd-chip dd-chip--side">2.5D</span> Classic side view
          </h3>
          <ul>
            <li>
              <kbd>A</kbd> <kbd>D</kbd> run left / right
            </li>
            <li>
              <kbd>Space</kbd> jump (hold for higher)
            </li>
            <li>
              <kbd>S</kbd> crouch · while running: roll
            </li>
            <li>
              <kbd>S</kbd> + tap <kbd>Space</kbd>, release <kbd>S</kbd>: spin dash
            </li>
            <li>
              <kbd>Shift</kbd> sprint to a higher top speed
            </li>
          </ul>
        </section>
        <section>
          <h3>
            <span className="dd-chip dd-chip--third">3D</span> Modern free roam
          </h3>
          <ul>
            <li>
              <kbd>W</kbd>
              <kbd>A</kbd>
              <kbd>S</kbd>
              <kbd>D</kbd> run (relative to the camera)
            </li>
            <li>Mouse: rotate the camera</li>
            <li>
              <kbd>Q</kbd> / right mouse: hold to charge a spin dash
            </li>
            <li>
              <kbd>A</kbd> / <kbd>D</kbd> while grinding: switch rails
            </li>
            <li>
              <kbd>E</kbd> interact (switches)
            </li>
          </ul>
        </section>
        <section>
          <h3>Speed & combat</h3>
          <ul>
            <li>Jump into robots, or roll through them</li>
            <li>
              In the air near a robot: <kbd>Space</kbd>, <kbd>Click</kbd> or <kbd>K</kbd> for a homing attack — chain them!
            </li>
            <li>Rings protect you: a hit scatters them — grab them back</li>
            <li>Loops need speed: use boost pads and downhills</li>
            <li>Glowing gates shift the dimension between 2.5D and 3D</li>
            <li>Find the 3 hidden red star rings in each level</li>
          </ul>
        </section>
      </div>
      <div className="dd-howto__monitors">
        <span style={{ "--c": "#ffd23a" }}>◎ 10 rings</span>
        <span style={{ "--c": "#ff5a3a" }}>» speed shoes</span>
        <span style={{ "--c": "#ffd23a" }}>U ring magnet</span>
        <span style={{ "--c": "#5ad8ff" }}>◈ shield</span>
        <span style={{ "--c": "#ffffff" }}>✦ invincible</span>
        <span style={{ "--c": "#7bff6a" }}>⇑ high jump</span>
      </div>
      <button type="button" className="dd-btn dd-btn--primary" onClick={click(onBack)} autoFocus>
        Got it
      </button>
    </div>
  );
}

function Slider({ label, value, min = 0, max = 1, step = 0.05, onChange, fmt = (v) => `${Math.round(v * 100)}%` }) {
  return (
    <label className="dd-set">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <b>{fmt(value)}</b>
    </label>
  );
}
function Toggle({ label, value, onChange }) {
  return (
    <label className="dd-set dd-set--toggle">
      <span>{label}</span>
      <button type="button" className={`dd-toggle${value ? " is-on" : ""}`} onClick={() => onChange(!value)} aria-pressed={value}>
        <i />
      </button>
    </label>
  );
}

export function SettingsPanel({ settings, muted, onChange, onBack }) {
  return (
    <div className="dd-panel dd-settings">
      <h2 className="dd-panel__title">Settings</h2>
      {muted ? <p className="dd-note">Sound is muted from the Game Center controls.</p> : null}
      <Slider label="Master volume" value={settings.master} onChange={(v) => onChange({ master: v })} />
      <Slider label="Music" value={settings.music} onChange={(v) => onChange({ music: v })} />
      <Slider label="Effects" value={settings.sfx} onChange={(v) => onChange({ sfx: v })} />
      <Slider label="Mouse sensitivity" value={settings.sensitivity} min={0.3} max={2.5} step={0.1} fmt={(v) => `${v.toFixed(1)}×`} onChange={(v) => onChange({ sensitivity: v })} />
      <Slider label="Camera distance" value={settings.camDistance} min={5} max={11} step={0.2} fmt={(v) => `${v.toFixed(1)} m`} onChange={(v) => onChange({ camDistance: v })} />
      <Toggle label="Invert camera Y" value={settings.invertY} onChange={(v) => onChange({ invertY: v })} />
      <Toggle label="Camera auto-follow" value={settings.camAssist} onChange={(v) => onChange({ camAssist: v })} />
      <Toggle label="Reduced motion (less shake)" value={settings.reducedMotion} onChange={(v) => onChange({ reducedMotion: v })} />
      <Toggle label="Show control hints" value={settings.showHints} onChange={(v) => onChange({ showHints: v })} />
      <label className="dd-set">
        <span>Graphics</span>
        <div className="dd-seg">
          {["low", "medium", "high"].map((q) => (
            <button type="button" key={q} className={settings.graphics === q ? "is-on" : ""} onClick={() => onChange({ graphics: q })}>
              {q}
            </button>
          ))}
        </div>
      </label>
      <p className="dd-note">Graphics changes apply from the next level start.</p>
      <button type="button" className="dd-btn dd-btn--primary" onClick={click(onBack)} autoFocus>
        Done
      </button>
    </div>
  );
}

export function StatsScreen({ progress, onBack }) {
  const s = progress.statistics;
  const ranks = { S: 0, A: 0, B: 0, C: 0 };
  for (const r of Object.values(progress.bestRanks)) ranks[r] = (ranks[r] || 0) + 1;
  const rows = [
    ["Levels cleared", `${Object.keys(progress.completedLevels).length} / 30`],
    ["Red star rings", `${totalRedStars(progress)} / 90`],
    ["S / A / B / C ranks", `${ranks.S} / ${ranks.A} / ${ranks.B} / ${ranks.C}`],
    ["Total rings", progress.totalRings.toLocaleString()],
    ["Robots defeated", s.enemies.toLocaleString()],
    ["Homing attacks", s.homing.toLocaleString()],
    ["Spin dashes", s.spinDashes.toLocaleString()],
    ["Loops run", s.loops.toLocaleString()],
    ["Rail grinds", s.grinds.toLocaleString()],
    ["Dimension shifts", s.shifts.toLocaleString()],
    ["Jumps", s.jumps.toLocaleString()],
    ["Hits taken", s.hits.toLocaleString()],
    ["Lives lost", s.deaths.toLocaleString()],
    ["Bosses defeated", s.bossesDefeated.toLocaleString()],
    ["Top speed", `${Math.round(s.topSpeed * 3.6)} km/h`],
    ["Distance run", `${(s.distance / 1000).toFixed(2)} km`],
    ["Time played", fmtTime(s.playTime).replace(/"\d\d$/, "")],
  ];
  return (
    <div className="dd-screen dd-panel-screen">
      <div className="dd-panel dd-stats">
        <h2 className="dd-panel__title">Statistics</h2>
        <dl>
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="dd-stats__best">
          {BUILT.filter((id) => progress.completedLevels[id]).map((id) => {
            const m = levelMeta(id);
            return (
              <div key={id}>
                <span>
                  {m.world}-{m.num} {m.name}
                </span>
                <b>{progress.bestRanks[id] || "–"}</b>
                <span className="dd-mono">{progress.bestTimes[id] ? fmtTime(progress.bestTimes[id]) : "--"}</span>
                <span>{redStarCount(progress, id)}/3★</span>
              </div>
            );
          })}
        </div>
        <button type="button" className="dd-btn dd-btn--primary" onClick={click(onBack)} autoFocus>
          Back
        </button>
      </div>
    </div>
  );
}
