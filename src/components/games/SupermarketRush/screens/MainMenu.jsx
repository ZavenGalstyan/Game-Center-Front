/**
 * Supermarket Rush — main menu. A real 3D supermarket behind a light UI —
 * no full-screen panel covering the scene.
 */
import { Canvas } from "@react-three/fiber";
import MenuScene from "../three/MenuScene.jsx";

export default function MainMenu({ state, onPlay, onLevels, onUpgrades, onStatistics, onSettings }) {
  return (
    <div className="sr-menu">
      <div className="sr-menu__canvas">
        <Canvas dpr={[1, 1.5]} shadows camera={{ fov: 55, near: 0.1, far: 40 }}>
          <MenuScene />
        </Canvas>
      </div>
      <div className="sr-menu__veil" />
      <div className="sr-menu__content">
        <div className="sr-menu__title-block">
          <h1 className="sr-menu__title">SUPERMARKET RUSH</h1>
          <p className="sr-menu__subtitle">STOCK · SERVE · GROW</p>
        </div>
        <div className="sr-menu__buttons">
          <button type="button" className="sr-btn sr-btn--primary sr-btn--big" onClick={onPlay}>PLAY</button>
          <button type="button" className="sr-btn" onClick={onLevels}>LEVELS</button>
          <button type="button" className="sr-btn" onClick={onUpgrades}>UPGRADES</button>
          <button type="button" className="sr-btn" onClick={onStatistics}>STATISTICS</button>
          <button type="button" className="sr-btn" onClick={onSettings}>SETTINGS</button>
        </div>
        <div className="sr-menu__wallet">${state.money}</div>
      </div>
    </div>
  );
}
