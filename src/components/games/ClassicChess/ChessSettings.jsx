import { BOARD_THEMES, GRAPHICS_LEVELS } from "./settings.js";

/**
 * Classic Chess settings screen — replaces the menu inside the same GamePlayer
 * window. Changes are pushed up immediately (parent persists to localStorage).
 */

/** 4×4 checkerboard preview for a board theme. */
function MiniBoard({ light, dark }) {
  return (
    <span
      className="chess__mini-board"
      style={{ "--sq-light": light, "--sq-dark": dark }}
      aria-hidden="true"
    >
      {Array.from({ length: 16 }, (_, i) => {
        const isDark = (Math.floor(i / 4) + (i % 4)) % 2 === 1;
        return (
          <span
            key={i}
            className={`chess__mini-sq chess__mini-sq--${isDark ? "d" : "l"}`}
          />
        );
      })}
    </span>
  );
}

export default function ChessSettings({ settings, onChange, onBack }) {
  return (
    <div className="chess__screen chess__screen--settings">
      <div className="chess__center">
        <header className="chess__settings-head">
          <h2 className="chess__logo chess__logo--sm">Settings</h2>
          <p className="chess__tagline">Customize your chess experience.</p>
        </header>

        <div className="chess__settings">
          <section className="chess__card">
            <div className="chess__card-head">
              <h3 className="chess__card-title">Graphics Quality</h3>
              <p className="chess__card-hint">Adjust visual effects and detail</p>
            </div>
            <div className="chess__segment" role="group" aria-label="Graphics quality">
              {GRAPHICS_LEVELS.map((level) => (
                <button
                  key={level.id}
                  type="button"
                  className={
                    "chess__segment-btn" +
                    (settings.graphicsQuality === level.id
                      ? " chess__segment-btn--active"
                      : "")
                  }
                  aria-pressed={settings.graphicsQuality === level.id}
                  onClick={() => onChange({ graphicsQuality: level.id })}
                >
                  {level.name}
                </button>
              ))}
            </div>
          </section>

          <section className="chess__card">
            <div className="chess__card-head">
              <h3 className="chess__card-title">Board Theme</h3>
              <p className="chess__card-hint">Choose the style of your chess board</p>
            </div>
            <div className="chess__themes" role="group" aria-label="Board theme">
              {BOARD_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  className={
                    "chess__theme" +
                    (settings.boardTheme === theme.id
                      ? " chess__theme--active"
                      : "")
                  }
                  aria-pressed={settings.boardTheme === theme.id}
                  onClick={() => onChange({ boardTheme: theme.id })}
                >
                  <MiniBoard light={theme.light} dark={theme.dark} />
                  <span className="chess__theme-name">{theme.name}</span>
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="chess__menu-list chess__menu-list--footer">
          <button
            type="button"
            className="chess__btn chess__btn--secondary chess__btn--sm chess__btn--back"
            onClick={onBack}
          >
            <span aria-hidden="true">←</span> Back
          </button>
        </div>
      </div>
    </div>
  );
}
