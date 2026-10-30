/**
 * Menus and overlays: main menu, level select, how-to-play, pause,
 * level complete, game over and the final victory screen.
 */
import { LEVEL_INFO } from "../data/levels.js";
import { FruitIcon, CrateIcon, Stars, fmtTime } from "./Hud.jsx";

const totalStars = (p) => Object.values(p.stars).reduce((a, b) => a + b, 0);

function SoundToggle({ sound, onToggle }) {
  return (
    <button type="button" className="jd-btn ghost small" onClick={onToggle} aria-pressed={sound}>
      {sound ? "🔊 Sound on" : "🔇 Sound off"}
    </button>
  );
}

export function MainMenu({ progress, onPlay, onLevels, onHelp, onToggleSound }) {
  const next = Math.min(progress.unlocked, 6);
  const started = progress.unlocked > 1 || Object.keys(progress.best).length > 0;
  return (
    <div className="jd-screen jd-menu">
      <div className="jd-title">
        <h1>
          <span className="a">Jungle</span> <span className="b">Dash</span>
        </h1>
        <div className="jd-sub">Island Adventure</div>
        <p className="jd-tag">Jump, Spin, and Conquer the Island!</p>
      </div>
      <div className="jd-menu-btns">
        <button type="button" className="jd-btn big" onClick={() => onPlay(next)} autoFocus>
          ▶ {started ? `Play · Level ${next}` : "Play"}
        </button>
        <button type="button" className="jd-btn" onClick={onLevels}>
          Level Select
        </button>
        <button type="button" className="jd-btn" onClick={onHelp}>
          How to Play
        </button>
        <SoundToggle sound={progress.settings.sound} onToggle={onToggleSound} />
      </div>
      <div className="jd-menu-foot">
        <Stars n={Math.min(3, Math.round(totalStars(progress) / 6))} /> <span>{totalStars(progress)} / 18 stars</span>
        {progress.beaten && <span className="jd-badge">★ Island saved!</span>}
      </div>
    </div>
  );
}

export function LevelSelect({ progress, onPick, onBack }) {
  return (
    <div className="jd-screen jd-levels">
      <div className="jd-panel wide">
        <div className="jd-panel-head">
          <h2>Choose a Level</h2>
          <span className="jd-muted">{totalStars(progress)} / 18 ★</span>
        </div>
        <div className="jd-level-grid">
          {LEVEL_INFO.map((L) => {
            const locked = L.id > progress.unlocked;
            return (
              <button type="button" key={L.id} className={`jd-lcard ${locked ? "locked" : ""}`} style={{ "--lc": L.color }} disabled={locked} onClick={() => onPick(L.id)}>
                <span className="jd-lnum">{L.id}</span>
                <span className="jd-lname">{L.name}</span>
                <span className="jd-lblurb">{locked ? "🔒 Finish the previous level to unlock" : L.blurb}</span>
                <span className="jd-lfoot">
                  <Stars n={progress.stars[L.id] || 0} />
                  <span>{progress.best[L.id] ? `Best ${progress.best[L.id].toLocaleString()}` : locked ? "" : "New!"}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="jd-row">
          <button type="button" className="jd-btn ghost" onClick={onBack}>
            ← Back
          </button>
        </div>
      </div>
    </div>
  );
}

export function Help({ onBack }) {
  return (
    <div className="jd-screen jd-dim">
      <div className="jd-panel">
        <h2>How to Play</h2>
        <div className="jd-help">
          <div>
            <h3>Desktop</h3>
            <ul>
              <li>
                <kbd>W A S D</kbd> / <kbd>Arrows</kbd> move
              </li>
              <li>
                <kbd>Space</kbd> jump — hold for higher
              </li>
              <li>
                <kbd>Left click</kbd> / <kbd>J</kbd> spin attack
              </li>
              <li>
                <kbd>Esc</kbd> pause
              </li>
            </ul>
            <h3>Mobile</h3>
            <ul>
              <li>Drag on the left side to move</li>
              <li>JUMP and SPIN buttons on the right</li>
            </ul>
          </div>
          <div>
            <h3>Tips</h3>
            <ul>
              <li>Spin to smash crates <CrateIcon /> and knock out enemies.</li>
              <li>Jump on crates and most enemies to bounce off them.</li>
              <li>Blue crates are springs — hold Space to bounce higher.</li>
              <li>
                Collect golden fruit <FruitIcon size="1.1em" /> for points. A pink crate restores health.
              </li>
              <li>Purple thornbacks are spiky — never jump on them, spin twice!</li>
              <li>Touch a totem to set a checkpoint. Falling costs one heart.</li>
              <li>★ Finish · ★ 80% fruit · ★ every crate.</li>
            </ul>
          </div>
        </div>
        <div className="jd-row">
          <button type="button" className="jd-btn" onClick={onBack} autoFocus>
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}

export function Pause({ sound, onResume, onRestart, onLevels, onMenu, onHelp, onToggleSound }) {
  return (
    <div className="jd-screen jd-dim">
      <div className="jd-panel narrow">
        <h2>Paused</h2>
        <div className="jd-col">
          <button type="button" className="jd-btn big" onClick={onResume} autoFocus>
            ▶ Resume
          </button>
          <button type="button" className="jd-btn" onClick={onRestart}>
            ↻ Restart Level
          </button>
          <button type="button" className="jd-btn" onClick={onLevels}>
            Level Select
          </button>
          <button type="button" className="jd-btn" onClick={onHelp}>
            How to Play
          </button>
          <button type="button" className="jd-btn ghost" onClick={onMenu}>
            Main Menu
          </button>
          <SoundToggle sound={sound} onToggle={onToggleSound} />
        </div>
      </div>
    </div>
  );
}

export function Complete({ r, newBest, last, onNext, onReplay, onLevels }) {
  const rows = [
    [<FruitIcon key="f" size="1.1em" />, "Fruit", `${r.fruits} / ${r.fruitTotal}`],
    [<CrateIcon key="c" />, "Crates", `${r.crates} / ${r.crateTotal}`],
    ["⚔", "Enemies", r.kills],
    ...(r.secretTotal ? [["✦", "Secrets", `${r.secrets} / ${r.secretTotal}`]] : []),
    ["⏱", "Time", fmtTime(r.time)],
  ];
  return (
    <div className="jd-screen jd-dim">
      <div className="jd-panel narrow jd-complete">
        <h2>Level Complete!</h2>
        <Stars n={r.stars} big />
        <div className="jd-stats">
          {rows.map(([ic, k, v]) => (
            <div key={k}>
              <span className="ic">{ic}</span>
              <span>{k}</span>
              <b>{v}</b>
            </div>
          ))}
        </div>
        <div className="jd-breakdown">
          <div>
            <span>Collected</span>
            <b>{r.base.toLocaleString()}</b>
          </div>
          <div>
            <span>Level clear</span>
            <b>+{r.finish.toLocaleString()}</b>
          </div>
          <div>
            <span>Time bonus</span>
            <b>+{r.timeBonus.toLocaleString()}</b>
          </div>
          {r.flawless > 0 && (
            <div>
              <span>No damage!</span>
              <b>+{r.flawless.toLocaleString()}</b>
            </div>
          )}
          <div className="total">
            <span>Score</span>
            <b>{r.score.toLocaleString()}</b>
          </div>
        </div>
        {newBest && <div className="jd-newbest">New best score!</div>}
        <div className="jd-col">
          <button type="button" className="jd-btn big" onClick={onNext} autoFocus>
            {last ? "★ Finish" : "Next Level ▶"}
          </button>
          <div className="jd-row">
            <button type="button" className="jd-btn" onClick={onReplay}>
              ↻ Replay
            </button>
            <button type="button" className="jd-btn ghost" onClick={onLevels}>
              Level Select
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GameOver({ onContinue, onRestart, onLevels }) {
  return (
    <div className="jd-screen jd-dim red">
      <div className="jd-panel narrow">
        <h2 className="jd-over">Game Over</h2>
        <p className="jd-center jd-muted">Mango ran out of hearts!</p>
        <div className="jd-col">
          <button type="button" className="jd-btn big" onClick={onContinue} autoFocus>
            Continue from Checkpoint
          </button>
          <button type="button" className="jd-btn" onClick={onRestart}>
            ↻ Restart Level
          </button>
          <button type="button" className="jd-btn ghost" onClick={onLevels}>
            Level Select
          </button>
        </div>
      </div>
    </div>
  );
}

export function Victory({ progress, r, onLevels, onMenu }) {
  const total = Object.values(progress.best).reduce((a, b) => a + b, 0);
  return (
    <div className="jd-screen jd-victory">
      <div className="jd-panel narrow">
        <div className="jd-confetti" aria-hidden="true">
          {Array.from({ length: 18 }, (_, i) => (
            <i key={i} style={{ "--i": i }} />
          ))}
        </div>
        <h2>Island Saved!</h2>
        <p className="jd-center">Mossjaw is calm again and the jungle is safe. Mango, you're a hero!</p>
        <div className="jd-breakdown">
          {r && (
            <div>
              <span>Fortress score</span>
              <b>{r.score.toLocaleString()}</b>
            </div>
          )}
          <div className="total">
            <span>Best total (all levels)</span>
            <b>{total.toLocaleString()}</b>
          </div>
          <div>
            <span>Stars</span>
            <b>{totalStars(progress)} / 18</b>
          </div>
        </div>
        <div className="jd-col">
          <button type="button" className="jd-btn big" onClick={onLevels} autoFocus>
            Level Select
          </button>
          <button type="button" className="jd-btn ghost" onClick={onMenu}>
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}
