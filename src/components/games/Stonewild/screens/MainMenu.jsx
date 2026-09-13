/**
 * Stonewild — main menu. The live voxel diorama fills the background; the
 * logo and actions sit on a soft veiled panel over it (same composition as
 * Parking Master's menu).
 */

import MenuScene from "../game/MenuScene.jsx";

export default function MainMenu({ worldCount, onPlay, onWorlds, onSettings, onStats }) {
  return (
    <div className="sw-screen sw-menu">
      <div className="sw-menu__scene">
        <MenuScene />
      </div>
      <div className="sw-menu__veil" />

      <div className="sw-menu__body">
        <div className="sw-menu__brand">
          <h1 className="sw-menu__title">STONEWILD</h1>
          <p className="sw-menu__subtitle">Build &bull; Explore &bull; Survive</p>
        </div>

        <div className="sw-menu__actions">
          <button type="button" className="sw-btn sw-btn--primary sw-btn--lg" onClick={onPlay}>
            Play
          </button>
          <button type="button" className="sw-btn sw-btn--lg" onClick={onWorlds}>
            Worlds{worldCount ? ` (${worldCount})` : ""}
          </button>
          <button type="button" className="sw-btn sw-btn--lg" onClick={onStats}>
            Statistics
          </button>
          <button type="button" className="sw-btn sw-btn--lg" onClick={onSettings}>
            Settings
          </button>
        </div>
      </div>
    </div>
  );
}
