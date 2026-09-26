import MenuScene from "./MenuScene.jsx";

export default function MainMenu({ skin, onPlay, onWorlds, onBalls, onStats, onSettings }) {
  return (
    <div className="ba3d-menu">
      <div className="ba3d-menu__scene"><MenuScene skin={skin} /></div>
      <div className="ba3d-menu__overlay">
        <div className="ba3d-menu__title-wrap">
          <h1 className="ba3d-menu__title">BALL ADVENTURE 3D</h1>
          <p className="ba3d-menu__subtitle">ROLL &bull; BALANCE &bull; EXPLORE</p>
        </div>
        <nav className="ba3d-menu__nav">
          <button className="ba3d-btn ba3d-btn--primary ba3d-btn--big" onClick={onPlay}>PLAY</button>
          <button className="ba3d-btn" onClick={onWorlds}>WORLDS</button>
          <button className="ba3d-btn" onClick={onBalls}>BALLS</button>
          <button className="ba3d-btn" onClick={onStats}>STATISTICS</button>
          <button className="ba3d-btn" onClick={onSettings}>SETTINGS</button>
        </nav>
      </div>
    </div>
  );
}
