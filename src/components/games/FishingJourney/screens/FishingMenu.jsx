/**
 * Fishing Journey — main menu. The first screen shown inside <GamePlayer>;
 * fishing never starts automatically. Sits on a live lake backdrop so it reads
 * as a fishing game at a glance.
 */
import LakeScene from "../components/LakeScene.jsx";
import FishingRod from "../components/FishingRod.jsx";
import Bobber from "../components/Bobber.jsx";
import CoinDisplay from "../components/CoinDisplay.jsx";
import { getLocation } from "../data/locations.js";
import {
  IconRod,
  IconMap,
  IconBook,
  IconSliders,
  IconHook,
  IconFish,
} from "../components/Icons.jsx";

export default function FishingMenu({ progress, quality, onNavigate }) {
  const location = getLocation(progress.currentLocation);

  return (
    <div className="fj-screen fj-menu">
      <div className="fj-menu__bg">
        <LakeScene variant={location.scene} quality={quality}>
          <FishingRod phase="waiting" />
          <Bobber phase="waiting" />
        </LakeScene>
      </div>

      <div className="fj-menu__scrim" />

      <div className="fj-menu__content">
        <div className="fj-menu__coins">
          <CoinDisplay coins={progress.coins} />
        </div>

        <div className="fj-menu__brand">
          <span className="fj-menu__crest" aria-hidden="true">
            <IconFish />
            <IconHook className="fj-menu__crest-hook" />
          </span>
          <h1 className="fj-menu__title">Fishing&nbsp;Journey</h1>
          <p className="fj-menu__subtitle">
            <span>Catch</span>
            <i />
            <span>Upgrade</span>
            <i />
            <span>Explore</span>
          </p>
        </div>

        <nav className="fj-menu__nav">
          <button
            type="button"
            className="fj-btn fj-btn--primary fj-btn--cta fj-menu__play"
            onClick={() => onNavigate("fishing")}
          >
            <span className="fj-menu__play-icon" aria-hidden="true">
              <IconHook />
            </span>
            Play
          </button>

          <div className="fj-menu__grid">
            <button
              type="button"
              className="fj-btn fj-menu__link"
              onClick={() => onNavigate("upgrades")}
            >
              <IconRod className="fj-menu__link-icon" />
              Upgrades
            </button>
            <button
              type="button"
              className="fj-btn fj-menu__link"
              onClick={() => onNavigate("locations")}
            >
              <IconMap className="fj-menu__link-icon" />
              Locations
            </button>
            <button
              type="button"
              className="fj-btn fj-menu__link"
              onClick={() => onNavigate("collection")}
            >
              <IconBook className="fj-menu__link-icon" />
              Collection
            </button>
            <button
              type="button"
              className="fj-btn fj-menu__link"
              onClick={() => onNavigate("settings")}
            >
              <IconSliders className="fj-menu__link-icon" />
              Settings
            </button>
          </div>
        </nav>

        <p className="fj-menu__footer">
          <span className="fj-menu__footer-dot" />
          Now fishing <strong>{location.name}</strong>
        </p>
      </div>
    </div>
  );
}
