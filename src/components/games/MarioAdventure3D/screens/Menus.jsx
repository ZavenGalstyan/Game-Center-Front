/**
 * Mario Adventure 3D — menu screens drawn over the animated 3D backdrop:
 * main menu, world select (five kingdoms → six levels each), statistics,
 * settings and controls. Everything is sized in container units so it fits
 * the 16:9 GamePlayer stage without scrolling.
 */
import { useState } from "react";
import { WORLDS, LEVELS_PER_WORLD } from "../data/worlds.js";
import { levelById, BUILT_COUNT } from "../data/levels/index.js";
import { isUnlocked, starCount, totalStars, worldProgress } from "../utils/storage.js";
import { Star, Lock, Coin, Key } from "./icons.jsx";
import { fmtTime } from "./Hud.jsx";
import { sound } from "../audio/sound.js";

const click = () => sound.uiClick();

export function MainMenu({ progress, onPlay, onNav }) {
  const stars = totalStars(progress);
  const done = Object.keys(progress.completedLevels).length;
  return (
    <div className="ma-menu">
      <div className="ma-title">
        <h1 className="ma-title__main">
          <span className="ma-title__mario">MARIO</span>
          <span className="ma-title__adv">
            ADVENTURE <span className="ma-title__3d">3D</span>
          </span>
        </h1>
        <div className="ma-title__tag">RUN • JUMP • EXPLORE</div>
      </div>
      <nav className="ma-menu__btns">
        <button
          type="button"
          className="ma-btn ma-btn--primary ma-btn--play"
          onClick={() => {
            click();
            onPlay();
          }}
          autoFocus
        >
          {done ? "CONTINUE" : "PLAY"}
        </button>
        {[
          ["worlds", "WORLD SELECT"],
          ["stats", "STATISTICS"],
          ["settings", "SETTINGS"],
          ["controls", "CONTROLS"],
        ].map(([k, label]) => (
          <button
            key={k}
            type="button"
            className="ma-btn"
            onClick={() => {
              click();
              onNav(k);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="ma-menu__foot">
        <span className="ma-pill">
          <Star /> {stars} / 90
        </span>
        <span className="ma-pill">
          <Coin /> {progress.totalCoins}
        </span>
        <span className="ma-pill">
          {done} / 30 levels
        </span>
      </div>
      <div className="ma-disclaimer">Personal fan-made prototype · not affiliated with or endorsed by Nintendo</div>
    </div>
  );
}

export function WorldSelect({ progress, onPlay, onBack, initialWorld = 1 }) {
  const [sel, setSel] = useState(() => {
    const w = Math.max(1, Math.min(5, initialWorld));
    return worldProgress(progress, w).unlocked ? w : 1;
  });
  const W = WORLDS[sel - 1];
  return (
    <div className="ma-screen ma-worlds">
      <header className="ma-screen__head">
        <button type="button" className="ma-btn ma-btn--small ma-btn--ghost" onClick={onBack}>
          ← Back
        </button>
        <h2>World Select</h2>
        <span className="ma-pill">
          <Star /> {totalStars(progress)} / 90
        </span>
      </header>
      <div className="ma-worlds__row">
        {WORLDS.map((w) => {
          const wp = worldProgress(progress, w.id);
          const locked = !wp.unlocked;
          return (
            <button
              key={w.id}
              type="button"
              className={`ma-world${sel === w.id ? " is-sel" : ""}${locked ? " is-locked" : ""}${wp.done === wp.total ? " is-done" : ""}`}
              style={{ "--c1": w.card[0], "--c2": w.card[1] }}
              onClick={() => {
                if (locked) {
                  sound.denied();
                  return;
                }
                sound.uiMove();
                setSel(w.id);
              }}
              aria-pressed={sel === w.id}
              aria-label={`${w.name}${locked ? " (locked)" : ""}`}
            >
              <span className="ma-world__art" data-world={w.key} />
              <span className="ma-world__num">World {w.id}</span>
              <span className="ma-world__name">{w.name}</span>
              {locked ? (
                <span className="ma-world__lock">
                  <Lock /> Locked
                </span>
              ) : (
                <span className="ma-world__prog">
                  <span>
                    {wp.done}/{wp.total}
                  </span>
                  <span>
                    <Star /> {wp.stars}/{wp.maxStars}
                  </span>
                </span>
              )}
              <span className="ma-world__bar">
                <span style={{ width: `${(wp.done / wp.total) * 100}%` }} />
              </span>
            </button>
          );
        })}
      </div>
      <div className="ma-levels" style={{ "--c1": W.card[0], "--c2": W.card[1] }}>
        <div className="ma-levels__head">
          <strong>{W.name}</strong>
          <span>{W.blurb}</span>
        </div>
        <div className="ma-levels__grid">
          {Array.from({ length: LEVELS_PER_WORLD }).map((_, i) => {
            const id = (sel - 1) * LEVELS_PER_WORLD + i + 1;
            const lv = id <= BUILT_COUNT ? levelById(id) : null;
            const open = !!lv && isUnlocked(progress, id);
            const sc = starCount(progress, id);
            const st = progress.stars[id] || {};
            const boss = i === LEVELS_PER_WORLD - 1;
            return (
              <button
                key={id}
                type="button"
                className={`ma-level${open ? "" : " is-locked"}${progress.completedLevels[id] ? " is-done" : ""}${boss ? " is-boss" : ""}`}
                onClick={() => {
                  if (!open) {
                    sound.denied();
                    return;
                  }
                  click();
                  onPlay(id);
                }}
                aria-label={lv ? `Level ${sel}-${i + 1} ${lv.name}${open ? `, ${sc} stars` : " (locked)"}` : "Coming soon"}
              >
                <span className="ma-level__code">
                  {sel}-{i + 1}
                  {boss ? <em>BOSS</em> : null}
                </span>
                <span className="ma-level__name">{lv ? lv.name : "Coming soon"}</span>
                {open ? (
                  <span className="ma-level__stars">
                    <Star on={!!st.clear} />
                    <Star on={!!st.coins} />
                    <Star on={!!st.hidden} />
                  </span>
                ) : (
                  <span className="ma-level__lock">
                    <Lock />
                  </span>
                )}
                {progress.bestTimes[id] ? <span className="ma-level__time">{fmtTime(progress.bestTimes[id])}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function StatsScreen({ progress, onBack }) {
  const s = progress.statistics;
  const rows = [
    ["Levels completed", `${Object.keys(progress.completedLevels).length} / 30`],
    ["Stars collected", `${totalStars(progress)} / 90`],
    ["Total coins", progress.totalCoins],
    ["Bosses defeated", `${s.bossesDefeated} / 5`],
    ["Enemies stomped", s.stomps],
    ["Enemies defeated", s.enemies],
    ["Jumps", s.jumps],
    ["Power-ups used", s.powerups],
    ["Secrets found", s.secrets],
    ["Blocks hit", s.blocks],
    ["Hits taken", s.hits],
    ["Falls", s.falls],
    ["Game overs", s.deaths],
    ["Levels played", s.levelsPlayed],
    ["Distance run", `${(s.distance / 1000).toFixed(2)} km`],
    ["Play time", fmtLong(s.playTime)],
  ];
  return (
    <div className="ma-screen ma-panel-screen">
      <div className="ma-card ma-card--wide">
        <header className="ma-screen__head">
          <button type="button" className="ma-btn ma-btn--small ma-btn--ghost" onClick={onBack}>
            ← Back
          </button>
          <h2>Statistics</h2>
          <span />
        </header>
        <div className="ma-stats">
          {rows.map(([k, v]) => (
            <div key={k} className="ma-stat">
              <span>{k}</span>
              <strong>{v}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function fmtLong(t) {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  return h ? `${h}h ${m}m` : `${m}m ${s}s`;
}

export function SettingsPanel({ settings, muted, onChange, onBack }) {
  const slider = (key, label, min, max, step, fmt) => (
    <label className="ma-set">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={settings[key]} onChange={(e) => onChange({ [key]: Number(e.target.value) })} />
      <em>{fmt ? fmt(settings[key]) : `${Math.round(settings[key] * 100)}%`}</em>
    </label>
  );
  const toggle = (key, label) => (
    <label className="ma-set ma-set--toggle">
      <span>{label}</span>
      <button type="button" className={`ma-switch${settings[key] ? " is-on" : ""}`} onClick={() => onChange({ [key]: !settings[key] })} aria-pressed={!!settings[key]}>
        <i />
      </button>
    </label>
  );
  return (
    <div className="ma-card ma-card--wide ma-settings">
      <header className="ma-screen__head">
        <button type="button" className="ma-btn ma-btn--small ma-btn--ghost" onClick={onBack}>
          ← Back
        </button>
        <h2>Settings</h2>
        <span />
      </header>
      {muted ? <div className="ma-note">Sound is muted by the Game Center Mute button.</div> : null}
      <div className="ma-settings__grid">
        <div>
          <h3>Audio</h3>
          {slider("master", "Master", 0, 1, 0.05)}
          {slider("music", "Music", 0, 1, 0.05)}
          {slider("sfx", "Effects", 0, 1, 0.05)}
          <h3>Graphics</h3>
          <div className="ma-set">
            <span>Quality</span>
            <div className="ma-seg">
              {["low", "medium", "high"].map((q) => (
                <button key={q} type="button" className={settings.graphics === q ? "is-on" : ""} onClick={() => onChange({ graphics: q })}>
                  {q}
                </button>
              ))}
            </div>
          </div>
          <div className="ma-note ma-note--small">Quality applies when the next level loads.</div>
        </div>
        <div>
          <h3>Camera</h3>
          {slider("sensitivity", "Mouse speed", 0.2, 3, 0.1, (v) => `${v.toFixed(1)}×`)}
          {slider("camDistance", "Follow distance", 4.6, 11, 0.2, (v) => `${v.toFixed(1)} m`)}
          {toggle("invertY", "Invert vertical")}
          {toggle("camAssist", "Auto-follow assist")}
          <h3>Comfort</h3>
          {toggle("reducedMotion", "Reduced motion")}
          {toggle("showHints", "Show control hints")}
        </div>
      </div>
    </div>
  );
}

export function ControlsHelp({ onBack }) {
  const rows = [
    [["W", "A", "S", "D"], "Run in any direction (relative to the camera)"],
    [["Mouse"], "Orbit the camera around Mario (click the game to capture the mouse)"],
    [["Wheel"], "Camera distance"],
    [["Space"], "Jump — hold for higher"],
    [["Space", "Space"], "Double jump (press again in mid-air)"],
    [["Shift"], "Sprint"],
    [["E"], "Interact — enter warp pipes, read signs"],
    [["Esc"], "Pause"],
  ];
  return (
    <div className="ma-card ma-card--wide">
      <header className="ma-screen__head">
        <button type="button" className="ma-btn ma-btn--small ma-btn--ghost" onClick={onBack}>
          ← Back
        </button>
        <h2>Controls</h2>
        <span />
      </header>
      <div className="ma-controls">
        {rows.map(([keys, text]) => (
          <div key={text} className="ma-controls__row">
            <span className="ma-controls__keys">
              {keys.map((k, i) => (
                <Key key={i} wide={k.length > 1}>
                  {k}
                </Key>
              ))}
            </span>
            <span>{text}</span>
          </div>
        ))}
      </div>
      <div className="ma-tips">
        <strong>Tips</strong> Land on enemies' heads to stomp them — touching them from the side hurts. Spike Shells need two stomps and can't be stomped while spinning. Hit <b>?</b> blocks from below. Warp pipes hide secret areas, and every level has a hidden star.
      </div>
    </div>
  );
}
