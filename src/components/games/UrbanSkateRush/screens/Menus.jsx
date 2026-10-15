/**
 * Urban Skate Rush — Menu Screens
 *
 * Main menu, level select, garage, stats, settings, and pause menu.
 */
import { useState, useCallback } from "react";
import { MISSIONS, getMissionsForDistrict } from "../data/missions.js";
import { DISTRICTS, districtById } from "../data/districts.js";
import { BOARDS, boardById, isBoardUnlocked, canPurchaseBoard } from "../data/boards.js";
import { isUnlocked, getTotalStars, getCompletedMissionCount } from "../utils/storage.js";
import { sound } from "../audio/sound.js";

// ============================================================
// Icons
// ============================================================

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function LevelsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

function FreeSkateIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function GarageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="10" width="20" height="4" rx="1" />
      <circle cx="6" cy="14" r="2" />
      <circle cx="18" cy="14" r="2" />
    </svg>
  );
}

function StatsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function StarIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" className={`usr-star${filled ? " usr-star--earned" : ""}`}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

// ============================================================
// Main Menu
// ============================================================

export function MainMenu({ progress, onPlay, onNav }) {
  const handleClick = (action) => {
    sound.sfx.menuClick();
    action();
  };

  return (
    <div className="usr-menu">
      <div className="usr-title">
        <div className="usr-title__name">Urban Skate Rush</div>
        <div className="usr-title__tagline">Skate • Trick • Conquer</div>
      </div>

      <button className="usr-menu-btn usr-menu-btn--primary" onClick={() => handleClick(onPlay)}>
        <PlayIcon />
        Continue
      </button>

      <button className="usr-menu-btn" onClick={() => handleClick(() => onNav("levels"))}>
        <LevelsIcon />
        Levels
      </button>

      <button className="usr-menu-btn" onClick={() => handleClick(() => onNav("free"))}>
        <FreeSkateIcon />
        Free Skate
      </button>

      <button className="usr-menu-btn" onClick={() => handleClick(() => onNav("garage"))}>
        <GarageIcon />
        Garage
      </button>

      <button className="usr-menu-btn" onClick={() => handleClick(() => onNav("stats"))}>
        <StatsIcon />
        Statistics
      </button>

      <button className="usr-menu-btn" onClick={() => handleClick(() => onNav("settings"))}>
        <SettingsIcon />
        Settings
      </button>
    </div>
  );
}

// ============================================================
// Level Select
// ============================================================

export function LevelSelect({ progress, onPlay, onBack }) {
  const handleMissionClick = (id) => {
    if (!isUnlocked(progress, id)) return;
    sound.sfx.menuClick();
    onPlay(id);
  };

  return (
    <div className="usr-menu">
      <button className="usr-back-btn" onClick={() => { sound.sfx.menuClick(); onBack(); }}>
        <BackIcon />
        Back
      </button>

      <div className="usr-levels">
        <div className="usr-levels__title">Levels</div>

        {DISTRICTS.map((district) => {
          const missions = getMissionsForDistrict(district.id);

          return (
            <div key={district.id} className="usr-district">
              <div className="usr-district__name" style={{ borderColor: district.color }}>
                {district.name}
              </div>

              <div className="usr-missions">
                {missions.map((mission) => {
                  const unlocked = isUnlocked(progress, mission.id);
                  const completed = progress.completed[mission.id];
                  const stars = completed?.stars || 0;

                  return (
                    <button
                      key={mission.id}
                      className="usr-mission-btn"
                      disabled={!unlocked}
                      title={unlocked ? mission.objective : "Finish the previous level to unlock"}
                      onClick={() => handleMissionClick(mission.id)}
                    >
                      <div className="usr-mission-btn__num">
                        {unlocked ? mission.id : <LockIcon />}
                      </div>
                      <div className="usr-mission-btn__name">{mission.name}</div>
                      <div className="usr-mission-btn__goal">{mission.objective}</div>
                      <div className="usr-mission-btn__stars">
                        <StarIcon filled={stars >= 1} />
                        <StarIcon filled={stars >= 2} />
                        <StarIcon filled={stars >= 3} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Free Skate Select
// ============================================================

export function FreeSkateSelect({ progress, onPlay, onBack }) {
  const handleDistrictClick = (id) => {
    if (!progress.unlockedDistricts.includes(id)) return;
    sound.sfx.menuClick();
    onPlay(id);
  };

  return (
    <div className="usr-menu">
      <button className="usr-back-btn" onClick={() => { sound.sfx.menuClick(); onBack(); }}>
        <BackIcon />
        Back
      </button>

      <div className="usr-levels">
        <div className="usr-levels__title">Free Skate</div>

        <div className="usr-missions">
          {DISTRICTS.map((district) => {
            const unlocked = progress.unlockedDistricts.includes(district.id);

            return (
              <button
                key={district.id}
                className="usr-mission-btn"
                disabled={!unlocked}
                onClick={() => handleDistrictClick(district.id)}
                style={{ borderColor: unlocked ? district.color : undefined }}
              >
                <div className="usr-mission-btn__num" style={{ color: district.color }}>
                  {unlocked ? district.id : <LockIcon />}
                </div>
                <div className="usr-mission-btn__name">{district.name}</div>
                <div style={{ fontSize: "0.625rem", color: "#666" }}>
                  {district.difficulty}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Garage Screen
// ============================================================

export function GarageScreen({ progress, onSelectBoard, onSelectOutfit, onBack }) {
  const [tab, setTab] = useState("boards");

  return (
    <div className="usr-menu">
      <button className="usr-back-btn" onClick={() => { sound.sfx.menuClick(); onBack(); }}>
        <BackIcon />
        Back
      </button>

      <div className="usr-garage">
        <div className="usr-garage__title">Garage</div>

        <div className="usr-garage__tabs">
          <button
            className={`usr-garage__tab${tab === "boards" ? " usr-garage__tab--active" : ""}`}
            onClick={() => setTab("boards")}
          >
            Boards
          </button>
          <button
            className={`usr-garage__tab${tab === "outfits" ? " usr-garage__tab--active" : ""}`}
            onClick={() => setTab("outfits")}
          >
            Outfits
          </button>
        </div>

        {tab === "boards" && (
          <div className="usr-boards">
            {BOARDS.map((board) => {
              const unlocked = isBoardUnlocked(progress, board.id);
              const selected = progress.selectedBoard === board.id;

              return (
                <div
                  key={board.id}
                  className={`usr-board-card${selected ? " usr-board-card--selected" : ""}${!unlocked ? " usr-board-card--locked" : ""}`}
                  onClick={() => {
                    if (unlocked && !selected) {
                      sound.sfx.menuClick();
                      onSelectBoard(board.id);
                    }
                  }}
                >
                  <div className="usr-board-card__preview">
                    {/* 3D board preview would go here */}
                    <div style={{
                      width: 100,
                      height: 30,
                      background: `#${board.colors.deck.toString(16).padStart(6, "0")}`,
                      borderRadius: 4,
                      boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
                    }} />
                  </div>

                  <div className="usr-board-card__name">
                    {!unlocked && <LockIcon />} {board.name}
                  </div>

                  <div className="usr-board-card__desc">
                    {unlocked ? board.description : `Unlock: ${board.price} coins`}
                  </div>

                  <div className="usr-board-card__stats">
                    {Object.entries(board.stats).map(([stat, value]) => (
                      <div key={stat} className="usr-board-stat">
                        <span>{stat.charAt(0).toUpperCase()}</span>
                        <div className="usr-board-stat__bar">
                          <div
                            className="usr-board-stat__fill"
                            style={{ width: `${(value / 5) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "outfits" && (
          <div style={{ textAlign: "center", color: "#888", padding: "2rem" }}>
            Outfit customization coming soon!
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Stats Screen
// ============================================================

export function StatsScreen({ progress, onBack }) {
  const totalStars = getTotalStars(progress);
  const completedMissions = getCompletedMissionCount(progress);

  return (
    <div className="usr-menu">
      <button className="usr-back-btn" onClick={() => { sound.sfx.menuClick(); onBack(); }}>
        <BackIcon />
        Back
      </button>

      <div className="usr-stats">
        <div className="usr-stats__title">Statistics</div>

        <div className="usr-stats__grid">
          <div className="usr-stat-card">
            <div className="usr-stat-card__label">Levels Completed</div>
            <div className="usr-stat-card__value">{completedMissions} / 30</div>
          </div>

          <div className="usr-stat-card">
            <div className="usr-stat-card__label">Total Stars</div>
            <div className="usr-stat-card__value">{totalStars} / 90</div>
          </div>

          <div className="usr-stat-card">
            <div className="usr-stat-card__label">Total Score</div>
            <div className="usr-stat-card__value">{progress.totalScore.toLocaleString()}</div>
          </div>

          <div className="usr-stat-card">
            <div className="usr-stat-card__label">Best Combo</div>
            <div className="usr-stat-card__value">{progress.bestCombo.toLocaleString()}</div>
          </div>

          <div className="usr-stat-card">
            <div className="usr-stat-card__label">Coins</div>
            <div className="usr-stat-card__value">{progress.coins.toLocaleString()}</div>
          </div>

          <div className="usr-stat-card">
            <div className="usr-stat-card__label">Total Tricks</div>
            <div className="usr-stat-card__value">{progress.totalTricks.toLocaleString()}</div>
          </div>

          <div className="usr-stat-card">
            <div className="usr-stat-card__label">Grind Distance</div>
            <div className="usr-stat-card__value">{Math.floor(progress.totalGrindDistance)}m</div>
          </div>

          <div className="usr-stat-card">
            <div className="usr-stat-card__label">Play Time</div>
            <div className="usr-stat-card__value">
              {Math.floor(progress.playTime / 3600)}h {Math.floor((progress.playTime % 3600) / 60)}m
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Settings Panel
// ============================================================

export function SettingsPanel({ settings, muted, onChange, onBack }) {
  const handleSlider = (key, value) => {
    onChange({ [key]: value });
  };

  const handleToggle = (key) => {
    onChange({ [key]: !settings[key] });
  };

  return (
    <div className="usr-menu">
      <button className="usr-back-btn" onClick={() => { sound.sfx.menuClick(); onBack(); }}>
        <BackIcon />
        Back
      </button>

      <div className="usr-settings">
        <div className="usr-settings__title">Settings</div>

        <div className="usr-settings__group">
          <div className="usr-settings__label">
            <span>Master Volume</span>
            <span className="usr-settings__value">{Math.round(settings.master * 100)}%</span>
          </div>
          <input
            type="range"
            className="usr-settings__slider"
            min="0"
            max="1"
            step="0.05"
            value={settings.master}
            onChange={(e) => handleSlider("master", parseFloat(e.target.value))}
          />
        </div>

        <div className="usr-settings__group">
          <div className="usr-settings__label">
            <span>Music Volume</span>
            <span className="usr-settings__value">{Math.round(settings.music * 100)}%</span>
          </div>
          <input
            type="range"
            className="usr-settings__slider"
            min="0"
            max="1"
            step="0.05"
            value={settings.music}
            onChange={(e) => handleSlider("music", parseFloat(e.target.value))}
          />
        </div>

        <div className="usr-settings__group">
          <div className="usr-settings__label">
            <span>SFX Volume</span>
            <span className="usr-settings__value">{Math.round(settings.sfx * 100)}%</span>
          </div>
          <input
            type="range"
            className="usr-settings__slider"
            min="0"
            max="1"
            step="0.05"
            value={settings.sfx}
            onChange={(e) => handleSlider("sfx", parseFloat(e.target.value))}
          />
        </div>

        <div className="usr-settings__group">
          <div className="usr-settings__label">
            <span>Camera Sensitivity</span>
            <span className="usr-settings__value">{Math.round(settings.cameraSensitivity * 100)}%</span>
          </div>
          <input
            type="range"
            className="usr-settings__slider"
            min="0.1"
            max="2"
            step="0.1"
            value={settings.cameraSensitivity}
            onChange={(e) => handleSlider("cameraSensitivity", parseFloat(e.target.value))}
          />
        </div>

        <div className="usr-settings__toggle">
          <span>Show Controls Hints</span>
          <div
            className={`usr-settings__toggle-switch${settings.showControls ? " usr-settings__toggle-switch--on" : ""}`}
            onClick={() => handleToggle("showControls")}
          />
        </div>

        <div className="usr-settings__toggle">
          <span>Reduced Motion</span>
          <div
            className={`usr-settings__toggle-switch${settings.reducedMotion ? " usr-settings__toggle-switch--on" : ""}`}
            onClick={() => handleToggle("reducedMotion")}
          />
        </div>

        <div className="usr-settings__group" style={{ marginTop: "1rem" }}>
          <div className="usr-settings__label">
            <span>Graphics Quality</span>
            <span className="usr-settings__value">{settings.graphics}</span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
            {["low", "medium", "high"].map((quality) => (
              <button
                key={quality}
                className={`usr-garage__tab${settings.graphics === quality ? " usr-garage__tab--active" : ""}`}
                onClick={() => onChange({ graphics: quality })}
              >
                {quality.charAt(0).toUpperCase() + quality.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Pause Menu
// ============================================================

export function PauseMenu({ onResume, onRestart, onSettings, onExit }) {
  return (
    <div className="usr-pause">
      <div className="usr-pause__title">Paused</div>

      <button className="usr-menu-btn usr-menu-btn--primary" onClick={() => { sound.sfx.menuClick(); onResume(); }}>
        Resume
      </button>

      <button className="usr-menu-btn" onClick={() => { sound.sfx.menuClick(); onRestart(); }}>
        Restart Level
      </button>

      <button className="usr-menu-btn" onClick={() => { sound.sfx.menuClick(); onSettings(); }}>
        Settings
      </button>

      <button className="usr-menu-btn" onClick={() => { sound.sfx.menuClick(); onExit(); }}>
        Exit to Menu
      </button>
    </div>
  );
}

// ============================================================
// Mission Complete
// ============================================================

export function MissionComplete({ mission, score, stars, time = 0, par = 0, coins, onNext, onRetry, onExit, hasNext }) {
  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  return (
    <div className="usr-complete">
      <div className="usr-complete__title">Level Complete!</div>
      <div className="usr-complete__mission">Level {mission.id} · {mission.name}</div>

      <div className="usr-complete__stars">
        <svg viewBox="0 0 24 24" fill={stars >= 1 ? "#f7c331" : "#333"} className={`usr-complete__star${stars >= 1 ? " usr-complete__star--earned" : ""}`}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
        <svg viewBox="0 0 24 24" fill={stars >= 2 ? "#f7c331" : "#333"} className={`usr-complete__star${stars >= 2 ? " usr-complete__star--earned" : ""}`}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
        <svg viewBox="0 0 24 24" fill={stars >= 3 ? "#f7c331" : "#333"} className={`usr-complete__star${stars >= 3 ? " usr-complete__star--earned" : ""}`}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      </div>
      {stars < 3 && par > 0 && <div className="usr-complete__par">Finish under {fmt(par)} for 3 stars</div>}

      <div className="usr-complete__stats">
        <div className="usr-complete__stat">
          <div className="usr-complete__stat-label">Score</div>
          <div className="usr-complete__stat-value">{score.toLocaleString()}</div>
        </div>
        <div className="usr-complete__stat">
          <div className="usr-complete__stat-label">Time</div>
          <div className="usr-complete__stat-value">{fmt(time)}</div>
        </div>
        <div className="usr-complete__stat">
          <div className="usr-complete__stat-label">Coins</div>
          <div className="usr-complete__stat-value">+{coins}</div>
        </div>
      </div>

      <div className="usr-complete__buttons">
        {hasNext && (
          <button className="usr-menu-btn usr-menu-btn--primary" onClick={() => { sound.sfx.menuClick(); onNext(); }}>
            Next Level
          </button>
        )}
        <button className="usr-menu-btn" onClick={() => { sound.sfx.menuClick(); onRetry(); }}>
          Retry
        </button>
        <button className="usr-menu-btn" onClick={() => { sound.sfx.menuClick(); onExit(); }}>
          Menu
        </button>
      </div>
    </div>
  );
}
