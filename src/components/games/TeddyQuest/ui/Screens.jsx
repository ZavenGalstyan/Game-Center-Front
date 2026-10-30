/**
 * Menus and overlays: Main Menu, World Select, Level Select, Help, Settings,
 * Pause, Level Complete, Game Over and the Final Victory screen.
 */
import { WORLDS, getLevel } from "../data/levels.js";
import { levelUnlocked, totals, LEVEL_COUNT } from "../engine/save.js";
import { fmtTime, CoinIcon, ChestIcon, PawIcon } from "./Hud.jsx";

const FRIEND_LEVELS = new Set([3, 6, 9, 12, 15, 18, 21, 24, 27, 30]);

export function MainMenu({ progress, onPlay, onWorlds, onHelp, onSettings }) {
  const T = totals(progress);
  const next = Math.min(progress.unlocked, LEVEL_COUNT);
  const fresh = T.done === 0;
  return (
    <div className="tq-screen tq-menu">
      <div className="tq-title">
        <div className="tq-title-top">Teddy Quest</div>
        <div className="tq-title-sub">Magical Kingdom</div>
        <div className="tq-tagline">Explore, Jump, and Save the Kingdom!</div>
      </div>
      <div className="tq-menu-btns">
        <button type="button" className="tq-btn big primary" onClick={() => onPlay(next)}>
          {fresh ? "Play" : `Continue · Level ${next}`}
        </button>
        <button type="button" className="tq-btn" onClick={onWorlds}>
          World Select
        </button>
        <div className="tq-row">
          <button type="button" className="tq-btn small" onClick={onHelp}>
            How to Play
          </button>
          <button type="button" className="tq-btn small" onClick={onSettings}>
            Settings
          </button>
        </div>
      </div>
      {!fresh && (
        <div className="tq-totals">
          <span>
            <CoinIcon /> {T.coins}
          </span>
          <span>
            <ChestIcon /> {T.chests}
          </span>
          <span>
            <PawIcon /> {T.friends}/10
          </span>
          <span>★ {T.done}/30</span>
        </div>
      )}
    </div>
  );
}

export function WorldSelect({ progress, onPick, onBack }) {
  return (
    <div className="tq-screen tq-dim">
      <div className="tq-panel wide">
        <h2>Choose a World</h2>
        <div className="tq-worlds">
          {WORLDS.map((w) => {
            const first = (w.id - 1) * 6 + 1;
            const open = levelUnlocked(progress, first);
            let done = 0;
            for (let i = first; i < first + 6; i++) if (progress.levels[i]) done++;
            return (
              <button key={w.id} type="button" className={`tq-world ${open ? "" : "locked"}`} style={{ "--wc": w.color }} disabled={!open} onClick={() => onPick(w.id)}>
                <span className="tq-world-n">World {w.id}</span>
                <span className="tq-world-name">{w.name}</span>
                <span className="tq-world-blurb">{open ? w.blurb : "Locked — finish the previous world"}</span>
                <span className="tq-world-prog">
                  <i style={{ width: `${(done / 6) * 100}%` }} />
                </span>
                <span className="tq-world-count">{done}/6</span>
              </button>
            );
          })}
        </div>
        <button type="button" className="tq-btn" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

export function LevelSelect({ progress, world, onPlay, onBack }) {
  const W = WORLDS[world - 1];
  const ids = Array.from({ length: 6 }, (_, i) => (world - 1) * 6 + i + 1);
  return (
    <div className="tq-screen tq-dim">
      <div className="tq-panel wide">
        <h2 style={{ color: W.color }}>
          World {W.id} · {W.name}
        </h2>
        <div className="tq-levels">
          {ids.map((id) => {
            const open = levelUnlocked(progress, id);
            const r = progress.levels[id];
            const L = getLevel(id);
            return (
              <button key={id} type="button" className={`tq-lvl ${open ? "" : "locked"} ${r ? "done" : ""}`} disabled={!open} onClick={() => onPlay(id)}>
                <span className="tq-lvl-n">
                  {world}-{id - (world - 1) * 6}
                </span>
                <span className="tq-lvl-name">{open ? L.name : "Locked"}</span>
                {open && (
                  <span className="tq-lvl-stats">
                    {r ? (
                      <>
                        <span>
                          <CoinIcon /> {r.coins}/{r.coinTotal}
                        </span>
                        <span>
                          <ChestIcon on={r.chests >= r.chestTotal} /> {r.chests}/{r.chestTotal}
                        </span>
                        <span>⏱ {fmtTime(r.time)}</span>
                      </>
                    ) : (
                      <span className="tq-new">New!</span>
                    )}
                  </span>
                )}
                {FRIEND_LEVELS.has(id) && open && <span className={`tq-lvl-friend ${r?.friend ? "on" : ""}`}>{id === 30 ? "Boss" : "Rescue"}</span>}
              </button>
            );
          })}
        </div>
        <button type="button" className="tq-btn" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

export function Help({ onBack, touch }) {
  return (
    <div className="tq-screen tq-dim tq-top">
      <div className="tq-panel">
        <h2>How to Play</h2>
        <ul className="tq-help">
          {touch ? (
            <>
              <li>
                <b>Move</b> with the left joystick (push all the way to run)
              </li>
              <li>
                <b>JUMP</b> and <b>ATTACK</b> buttons on the right
              </li>
              <li>
                <b>Drag</b> anywhere else to turn the camera
              </li>
            </>
          ) : (
            <>
              <li>
                <b>WASD / Arrows</b> move · <b>Shift</b> sprint
              </li>
              <li>
                <b>Space</b> jump (hold for a higher jump)
              </li>
              <li>
                <b>Left click / J</b> paw swipe attack
              </li>
              <li>
                <b>Mouse</b> turns the camera (click the game to lock the pointer, or drag) · <b>Q / E</b> also turn it
              </li>
              <li>
                <b>Esc / P</b> pause
              </li>
            </>
          )}
        </ul>
        <ul className="tq-help small">
          <li>Collect golden coins and find the hidden treasure chests.</li>
          <li>Swipe or stomp Grumblebugs and Thornlings. Avoid spikes, fire and pits.</li>
          <li>Touch a flag to set your checkpoint. You have 3 hearts — honey jars heal one.</li>
          <li>Free caged friends (two swipes) to open the exit portal.</li>
        </ul>
        <button type="button" className="tq-btn primary" onClick={onBack}>
          Got it!
        </button>
      </div>
    </div>
  );
}

export function Settings({ settings, onChange, onBack }) {
  const S = settings;
  return (
    <div className="tq-screen tq-dim tq-top">
      <div className="tq-panel">
        <h2>Settings</h2>
        <div className="tq-set">
          <label>
            <span>Sound effects</span>
            <button type="button" className={`tq-toggle ${S.sound ? "on" : ""}`} onClick={() => onChange({ sound: !S.sound })}>
              {S.sound ? "On" : "Off"}
            </button>
          </label>
          <label>
            <span>Music</span>
            <button type="button" className={`tq-toggle ${S.music ? "on" : ""}`} onClick={() => onChange({ music: !S.music })}>
              {S.music ? "On" : "Off"}
            </button>
          </label>
          <label>
            <span>Camera speed</span>
            <input type="range" min="0.3" max="2.5" step="0.1" value={S.sens} onChange={(e) => onChange({ sens: Number(e.target.value) })} />
          </label>
          <label>
            <span>Invert camera Y</span>
            <button type="button" className={`tq-toggle ${S.invertY ? "on" : ""}`} onClick={() => onChange({ invertY: !S.invertY })}>
              {S.invertY ? "On" : "Off"}
            </button>
          </label>
          <label>
            <span>Touch controls</span>
            <select value={S.touch} onChange={(e) => onChange({ touch: e.target.value })}>
              <option value="auto">Auto</option>
              <option value="on">Always</option>
              <option value="off">Never</option>
            </select>
          </label>
        </div>
        <button type="button" className="tq-btn primary" onClick={onBack}>
          Done
        </button>
      </div>
    </div>
  );
}

export function Pause({ onResume, onRestart, onLevels, onMenu, onHelp, onSettings }) {
  return (
    <div className="tq-screen tq-dim">
      <div className="tq-panel narrow">
        <h2>Paused</h2>
        <div className="tq-col">
          <button type="button" className="tq-btn primary" onClick={onResume}>
            Resume
          </button>
          <button type="button" className="tq-btn" onClick={onRestart}>
            Restart Level
          </button>
          <button type="button" className="tq-btn" onClick={onLevels}>
            Level Select
          </button>
          <div className="tq-row">
            <button type="button" className="tq-btn small" onClick={onHelp}>
              Controls
            </button>
            <button type="button" className="tq-btn small" onClick={onSettings}>
              Settings
            </button>
          </div>
          <button type="button" className="tq-btn small ghost" onClick={onMenu}>
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}

export function Complete({ r, best, last, onNext, onReplay, onLevels }) {
  const allCoins = r.coins >= r.coinTotal;
  return (
    <div className="tq-screen tq-dim">
      <div className="tq-panel narrow tq-complete">
        <h2>Level Complete!</h2>
        <div className="tq-res">
          <div className={allCoins ? "gold" : ""}>
            <CoinIcon />
            <b>
              {r.coins}/{r.coinTotal}
            </b>
            {best.coins && <em>best!</em>}
          </div>
          <div className={r.chests >= r.chestTotal ? "gold" : ""}>
            <ChestIcon />
            <b>
              {r.chests}/{r.chestTotal}
            </b>
          </div>
          <div>
            ⏱<b>{fmtTime(r.time)}</b>
            {best.time && <em>best!</em>}
          </div>
          {r.friend !== null && (
            <div className="gold">
              <PawIcon />
              <b>Friend saved</b>
            </div>
          )}
        </div>
        {best.first && <p className="tq-center tq-note">New level unlocked!</p>}
        <div className="tq-col">
          <button type="button" className="tq-btn primary big" onClick={onNext} autoFocus>
            {last ? "Celebrate!" : "Next Level"}
          </button>
          <div className="tq-row">
            <button type="button" className="tq-btn small" onClick={onReplay}>
              Replay
            </button>
            <button type="button" className="tq-btn small" onClick={onLevels}>
              Levels
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GameOver({ onContinue, onRestart, onLevels }) {
  return (
    <div className="tq-screen tq-dim">
      <div className="tq-panel narrow">
        <h2 className="bad">Out of Hearts!</h2>
        <p className="tq-center">Toffee needs a little rest. Try again from the last checkpoint?</p>
        <div className="tq-col">
          <button type="button" className="tq-btn primary" onClick={onContinue} autoFocus>
            Continue from Checkpoint
          </button>
          <button type="button" className="tq-btn" onClick={onRestart}>
            Restart Level
          </button>
          <button type="button" className="tq-btn small ghost" onClick={onLevels}>
            Level Select
          </button>
        </div>
      </div>
    </div>
  );
}

export function Victory({ progress, onMenu, onLevels }) {
  const T = totals(progress);
  return (
    <div className="tq-screen tq-victory">
      <div className="tq-panel narrow">
        <div className="tq-confetti" aria-hidden="true">
          {Array.from({ length: 18 }, (_, i) => (
            <i key={i} style={{ "--i": i }} />
          ))}
        </div>
        <h2>The Kingdom is Saved!</h2>
        <p className="tq-center">
          Baron Bristlesnout is defeated and Queen Honeypaw is free. Toffee the bear is the hero of the Magical Kingdom!
        </p>
        <div className="tq-res">
          <div>
            <CoinIcon />
            <b>{T.coins}</b> coins
          </div>
          <div>
            <ChestIcon />
            <b>{T.chests}</b> chests
          </div>
          <div>
            <PawIcon />
            <b>{T.friends}/10</b> friends
          </div>
        </div>
        <div className="tq-col">
          <button type="button" className="tq-btn primary" onClick={onLevels}>
            Replay Levels
          </button>
          <button type="button" className="tq-btn small ghost" onClick={onMenu}>
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}
