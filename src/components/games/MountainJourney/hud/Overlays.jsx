/**
 * Mountain Journey — overlays: the level intro card (click to begin, which
 * also takes the pointer lock), the pause menu, the level-complete card and
 * the summit ending.
 */
import { useState } from "react";
import { SettingsPanel } from "../screens/Menus.jsx";
import { fmtTime } from "./useTicker.js";
import { WEATHER } from "../data/weather.js";
import { TOTAL_LEVELS } from "../data/levels.js";

export function ClickToBegin({ def, region, onBegin, touch, found }) {
  return (
    <div className="mj-overlay mj-overlay--intro" onClick={onBegin} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onBegin()}>
      <div className="mj-intro" style={{ "--accent": region.accent }}>
        <div className="mj-intro__region">
          {region.name} · Level {def.id}
        </div>
        <h2 className="mj-intro__name">{def.name}</h2>
        <p className="mj-intro__obj">{def.objective}</p>
        <div className="mj-intro__meta">
          <span>{WEATHER[def.weather]?.name}</span>
          <span>·</span>
          <span>{region.altitude + (def.id - region.levels[0]) * 90} m</span>
          <span>·</span>
          <span>Badges {found} / 3</span>
        </div>
        <div className="mj-intro__go">{touch ? "Tap to begin" : "Click to begin"}</div>
        {!touch && <div className="mj-intro__hint">Mouse looks around · Esc pauses</div>}
      </div>
    </div>
  );
}

export function PauseMenu({ def, onResume, onCheckpoint, onRestart, onQuit, onControls, settings, onChangeSettings, muted }) {
  const [tab, setTab] = useState("main");
  return (
    <div className="mj-overlay">
      <div className="mj-card mj-card--pause">
        <div className="mj-card__kicker">Paused · Level {def.id}</div>
        <h2 className="mj-card__title">{def.name}</h2>
        {tab === "main" ? (
          <div className="mj-stack">
            <button type="button" className="mj-btn mj-btn--primary" onClick={onResume}>
              Resume
            </button>
            <button type="button" className="mj-btn" onClick={onCheckpoint}>
              Back to Last Checkpoint
            </button>
            <button type="button" className="mj-btn" onClick={onRestart}>
              Restart Level
            </button>
            <button type="button" className="mj-btn" onClick={() => setTab("settings")}>
              Settings
            </button>
            <button type="button" className="mj-btn" onClick={onControls}>
              Controls
            </button>
            <button type="button" className="mj-btn mj-btn--ghost" onClick={onQuit}>
              Leave to Expedition Map
            </button>
          </div>
        ) : (
          <div>
            <SettingsPanel settings={settings} onChange={onChangeSettings} muted={muted} compact />
            <div className="mj-row">
              <button type="button" className="mj-btn mj-btn--primary" onClick={() => setTab("main")}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function CompleteScreen({ def, region, result, hasNext, onNext, onMap, onReplay }) {
  const { time, badgesTotal, viewpoint, reward } = result;
  return (
    <div className="mj-overlay mj-overlay--complete">
      <div className="mj-card mj-card--complete" style={{ "--accent": region.accent }}>
        <div className="mj-card__kicker">
          {region.name} · Level {def.id}
        </div>
        <h2 className="mj-card__title">Trail Complete</h2>
        <p className="mj-card__sub">{def.name}</p>
        <div className="mj-results">
          <div className="mj-result">
            <span className="mj-result__label">Time</span>
            <span className="mj-result__value">{fmtTime(time)}</span>
            {reward.best && reward.prevBest != null && <span className="mj-result__note">New best!</span>}
            {!reward.best && reward.prevBest != null && <span className="mj-result__note">Best {fmtTime(reward.prevBest)}</span>}
          </div>
          <div className="mj-result">
            <span className="mj-result__label">Badges</span>
            <span className="mj-result__value">
              {[0, 1, 2].map((i) => (
                <span key={i} className={`mj-dot${i < badgesTotal ? " is-on" : ""}`} />
              ))}
            </span>
            <span className="mj-result__note">{badgesTotal} / 3 found</span>
          </div>
          <div className="mj-result">
            <span className="mj-result__label">Viewpoint</span>
            <span className="mj-result__value">{viewpoint ? "◎" : "○"}</span>
            <span className="mj-result__note">{viewpoint ? "Discovered" : "Not yet seen"}</span>
          </div>
        </div>
        {reward.newCosmetics?.length > 0 && (
          <div className="mj-unlock">
            <span className="mj-unlock__label">New for your explorer:</span> {reward.newCosmetics.map((c) => c.name).join(", ")}
          </div>
        )}
        <div className="mj-row">
          {hasNext && (
            <button type="button" className="mj-btn mj-btn--primary" onClick={onNext}>
              Continue the Ascent
            </button>
          )}
          <button type="button" className="mj-btn" onClick={onReplay}>
            Replay
          </button>
          <button type="button" className="mj-btn mj-btn--ghost" onClick={onMap}>
            Expedition Map
          </button>
        </div>
      </div>
    </div>
  );
}

export function SummitEnding({ state, progress, onMap, onMenu }) {
  return (
    <div className="mj-overlay mj-overlay--summit">
      <div className="mj-summit">
        <div className="mj-summit__kicker">3,980 m · The Summit</div>
        <h2 className="mj-summit__title">You reached the top</h2>
        <p className="mj-summit__text">
          From a quiet forest camp to the roof of the range — through rivers and waterfalls, over stone ridges and above the clouds. Take a moment. Look back at the valley. You walked all of it.
        </p>
        <div className="mj-summit__stats">
          <div>
            <b>{progress.levels}</b>
            <span>of {TOTAL_LEVELS} trails</span>
          </div>
          <div>
            <b>{progress.badges}</b>
            <span>badges found</span>
          </div>
          <div>
            <b>{progress.viewpoints}</b>
            <span>viewpoints</span>
          </div>
          <div>
            <b>{(state.stats.distance / 1000).toFixed(1)} km</b>
            <span>walked</span>
          </div>
        </div>
        <div className="mj-row">
          <button type="button" className="mj-btn mj-btn--primary" onClick={onMap}>
            Expedition Map
          </button>
          <button type="button" className="mj-btn mj-btn--ghost" onClick={onMenu}>
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}
