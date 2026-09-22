/**
 * Rooftop Sniper — Main Menu: cinematic rooftop-over-Downtown background
 * (three/MenuScene.jsx) with the title, tagline and primary navigation.
 */
import { Canvas } from "@react-three/fiber";
import MenuScene from "../three/MenuScene.jsx";

export default function MainMenu({ onPlay, onMissions, onRifles, onStatistics, onSettings }) {
  return (
    <div className="rs-menu">
      <div className="rs-menu__canvas">
        <Canvas camera={{ fov: 58, near: 0.05, far: 500, position: [0, 0, 1.4] }} dpr={[1, 1.75]}>
          <MenuScene />
        </Canvas>
      </div>
      <div className="rs-menu__veil" />
      <div className="rs-menu__content">
        <div className="rs-menu__titleblock">
          <h1 className="rs-menu__title">ROOFTOP SNIPER</h1>
          <p className="rs-menu__tagline">AIM &bull; FOCUS &bull; SHOOT</p>
        </div>
        <nav className="rs-menu__nav">
          <button type="button" className="rs-btn rs-btn--primary rs-btn--big" onClick={onPlay}>PLAY</button>
          <button type="button" className="rs-btn" onClick={onMissions}>MISSIONS</button>
          <button type="button" className="rs-btn" onClick={onRifles}>RIFLES</button>
          <button type="button" className="rs-btn" onClick={onStatistics}>STATISTICS</button>
          <button type="button" className="rs-btn" onClick={onSettings}>SETTINGS</button>
        </nav>
      </div>
    </div>
  );
}
