/**
 * Zombie Outbreak — gameplay overlays: briefing / click to play, pause,
 * game over and stage complete. All of them are shown with the pointer
 * released so their buttons are clickable.
 */
import { useEffect, useState } from "react";
import { WEAPONS } from "../data/weapons.js";
import { ENEMY_INFO, ZOMBIES, enemyDef } from "../data/enemies.js";
import { getArena } from "../data/arenas/index.js";
import { SettingsFields } from "../screens/SettingsFields.jsx";

const pct = (v) => `${Math.round(v * 100)}%`;
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function threatsOf(stage) {
  const set = new Set();
  for (const w of stage.waves) for (const [t] of w.groups) set.add(t);
  return [...set];
}

export function ClickToPlay({ stage, onBegin, touch }) {
  const arena = getArena(stage.arena);
  const boss = stage.waves.find((w) => w.boss);
  if (touch) {
    return (
      <div className="zo-overlay zo-overlay--brief">
        <div className="zo-brief">
          <h2 className="zo-brief__title">KEYBOARD &amp; MOUSE</h2>
          <p className="zo-brief__text">Zombie Outbreak is a first-person shooter built for a keyboard and mouse. Touch controls aren't supported yet — open it on a computer to play.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="zo-overlay zo-overlay--brief" onClick={onBegin} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onBegin()}>
      <div className="zo-brief">
        <div className="zo-brief__zone">
          {arena.name.toUpperCase()} · STAGE {stage.id}
        </div>
        <h2 className="zo-brief__title">{stage.name}</h2>
        <p className="zo-brief__text">{stage.brief}</p>
        <div className="zo-brief__meta">
          <span>{stage.waves.length} WAVES</span>
          {threatsOf(stage).map((t) => (
            <span key={t} className={`zo-chip zo-chip--${t}`} title={ENEMY_INFO[t]}>
              {ZOMBIES[t]?.name || t}
            </span>
          ))}
          {boss && <span className="zo-chip zo-chip--boss">BOSS: {enemyDef(boss.boss).name.replace("THE ", "")}</span>}
        </div>
        <div className="zo-brief__cta">{touch ? "TAP TO PLAY" : "CLICK TO PLAY"}</div>
        <div className="zo-brief__keys">
          <span>
            <kbd>Mouse</kbd> aim
          </span>
          <span>
            <kbd>LMB</kbd> shoot
          </span>
          <span>
            <kbd>RMB</kbd> aim down sights
          </span>
          <span>
            <kbd>Esc</kbd> pause
          </span>
        </div>
      </div>
    </div>
  );
}

export function PauseMenu({ onResume, onRestart, onQuit, onStageSelect, settings, onChangeSettings, muted }) {
  const [tab, setTab] = useState("main");
  return (
    <div className="zo-overlay zo-overlay--pause">
      <div className="zo-panel zo-panel--pause">
        <div className="zo-panel__kicker">GAME PAUSED</div>
        {tab === "main" && (
          <div className="zo-stack">
            <button type="button" className="zo-btn zo-btn--primary" onClick={onResume} autoFocus>
              RESUME
            </button>
            <button type="button" className="zo-btn" onClick={onRestart}>
              RESTART STAGE
            </button>
            <button type="button" className="zo-btn" onClick={() => setTab("settings")}>
              SETTINGS
            </button>
            <button type="button" className="zo-btn" onClick={() => setTab("controls")}>
              CONTROLS
            </button>
            <button type="button" className="zo-btn" onClick={onStageSelect}>
              STAGE SELECT
            </button>
            <button type="button" className="zo-btn zo-btn--dim" onClick={onQuit}>
              MAIN MENU
            </button>
            <p className="zo-hint">Click RESUME to grab the mouse again.</p>
          </div>
        )}
        {tab === "settings" && (
          <div className="zo-pause-settings">
            <SettingsFields settings={settings} onChange={onChangeSettings} muted={muted} compact />
            <button type="button" className="zo-btn" onClick={() => setTab("main")}>
              BACK
            </button>
          </div>
        )}
        {tab === "controls" && (
          <div>
            <ControlsTable />
            <button type="button" className="zo-btn" onClick={() => setTab("main")}>
              BACK
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export const CONTROLS = [
  ["W A S D", "Move"],
  ["Mouse", "Aim / look"],
  ["Left Click", "Shoot"],
  ["Right Click", "Aim down sights"],
  ["R", "Reload"],
  ["Shift", "Sprint"],
  ["Space", "Jump"],
  ["1 / 2 / 3", "Switch weapons (or mouse wheel)"],
  ["E", "Interact / pick up"],
  ["Esc / P", "Pause"],
];

export function ControlsTable() {
  return (
    <div className="zo-controls">
      {CONTROLS.map(([k, v]) => (
        <div key={k} className="zo-controls__row">
          <kbd>{k}</kbd>
          <span>{v}</span>
        </div>
      ))}
    </div>
  );
}

export function GameOver({ result, onRetry, onStageSelect, onMenu }) {
  return (
    <div className="zo-overlay zo-overlay--dead">
      <div className="zo-dead">
        <h2 className="zo-dead__title">YOU DIED</h2>
        <div className="zo-dead__sub">
          Survived {result.waves} of {result.totalWaves} waves · {result.kills} zombies eliminated
        </div>
        <div className="zo-dead__tip">{tipFor(result)}</div>
        <div className="zo-row">
          <button type="button" className="zo-btn zo-btn--primary" onClick={onRetry} autoFocus>
            RETRY
          </button>
          <button type="button" className="zo-btn" onClick={onStageSelect}>
            STAGE SELECT
          </button>
          <button type="button" className="zo-btn zo-btn--dim" onClick={onMenu}>
            MAIN MENU
          </button>
        </div>
      </div>
    </div>
  );
}

function tipFor(r) {
  if (r.accuracy < 0.25) return "Tip: hold Right Click to aim down sights — it tightens your spread a lot.";
  if (r.byType?.bomber === undefined && r.kills > 20) return "Tip: keep moving and back away while you reload.";
  return [
    "Tip: headshots deal triple damage to regular zombies.",
    "Tip: shoot Bombers early — their blast hurts other zombies too.",
    "Tip: health and ammo respawn at their spots between waves.",
    "Tip: you can jump over a boss shockwave.",
  ][Math.floor(Math.random() * 4)];
}

export function StageComplete({ result, info, stage, hasNext, onNext, onRetry, onMenu }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const ids = [1, 2, 3].map((n) => setTimeout(() => setShown(n), 350 + n * 380));
    return () => ids.forEach(clearTimeout);
  }, []);
  const rows = [
    ["Waves survived", `${result.waves} / ${result.totalWaves}`],
    ["Zombies eliminated", result.kills],
    ["Headshots", result.headshots],
    ["Accuracy", pct(result.accuracy)],
    ["Health left", `${result.hp}`],
    ["Time", fmtTime(result.time)],
  ];
  const s = stage.stars || { hp: 50, acc: 0.4 };
  return (
    <div className="zo-overlay zo-overlay--win">
      <div className="zo-panel zo-panel--result">
        <div className="zo-panel__kicker">STAGE {stage.id} · {stage.name.toUpperCase()}</div>
        <h2 className="zo-result__title">STAGE COMPLETE</h2>
        <div className="zo-stars" aria-label={`${result.stars} of 3 stars`}>
          {[1, 2, 3].map((n) => (
            <span key={n} className={`zo-star${n <= result.stars && n <= shown ? " zo-star--on" : ""}`}>
              ★
            </span>
          ))}
        </div>
        <div className="zo-star-rules">
          <span className={result.stars >= 1 ? "ok" : ""}>★ Clear the stage</span>
          <span className={result.stars >= 2 ? "ok" : ""}>★★ End with {s.hp}+ health</span>
          <span className={result.stars >= 3 ? "ok" : ""}>★★★ …and {Math.round(s.acc * 100)}%+ accuracy</span>
        </div>
        <div className="zo-result__grid">
          {rows.map(([k, v]) => (
            <div key={k} className="zo-result__cell">
              <span>{k}</span>
              <b>{v}</b>
            </div>
          ))}
        </div>
        <div className="zo-result__score">
          SCORE <b>{result.score.toLocaleString("en-US")}</b>
          {info?.best != null && result.score >= info.best && <span className="zo-badge">NEW BEST</span>}
        </div>
        {(info?.newWeapons?.length > 0 || info?.newStage) && (
          <div className="zo-unlocks">
            {info.newWeapons.map((w) => (
              <div key={w} className="zo-unlock">
                <span className="zo-unlock__tag">NEW WEAPON</span>
                {WEAPONS[w].name} <small>{WEAPONS[w].kind}</small>
              </div>
            ))}
            {info.newStage && (
              <div className="zo-unlock">
                <span className="zo-unlock__tag">UNLOCKED</span>Stage {info.newStage}
              </div>
            )}
          </div>
        )}
        <div className="zo-row">
          {hasNext && (
            <button type="button" className="zo-btn zo-btn--primary" onClick={onNext} autoFocus>
              NEXT STAGE
            </button>
          )}
          <button type="button" className={`zo-btn${hasNext ? "" : " zo-btn--primary"}`} onClick={onRetry}>
            RETRY
          </button>
          <button type="button" className="zo-btn zo-btn--dim" onClick={onMenu}>
            MAIN MENU
          </button>
        </div>
      </div>
    </div>
  );
}
