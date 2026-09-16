import { useState, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { BALL_SKINS, skinUnlocked } from "../data/skins.js";

function PreviewBall({ skin }) {
  const ref = useRef(null);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 0.6; });
  return (
    <mesh ref={ref} castShadow>
      <sphereGeometry args={[1, 32, 24]} />
      <meshStandardMaterial color={skin.color} emissive={skin.emissive} emissiveIntensity={skin.emissive === "#000000" ? 0 : 0.5} metalness={skin.metalness} roughness={skin.roughness} />
    </mesh>
  );
}

export default function BallsScreen({ progress, totalStars, onSelectSkin, onBack }) {
  const [previewId, setPreviewId] = useState(progress.selectedSkin);
  const previewSkin = BALL_SKINS.find((s) => s.id === previewId) || BALL_SKINS[0];

  return (
    <div className="ba3d-screen ba3d-screen--balls">
      <div className="ba3d-screen__header">
        <button className="ba3d-btn ba3d-btn--small" onClick={onBack}>&larr; MENU</button>
        <h2>BALLS</h2>
        <span className="ba3d-screen__stars">&#9733; {totalStars}</span>
      </div>

      <div className="ba3d-balls">
        <div className="ba3d-balls__preview">
          <Canvas camera={{ position: [0, 0.6, 3.4], fov: 40 }}>
            <ambientLight intensity={0.8} />
            <directionalLight position={[3, 4, 3]} intensity={1.2} castShadow />
            <PreviewBall skin={previewSkin} />
          </Canvas>
          <p className="ba3d-balls__previewname">{previewSkin.name}</p>
        </div>

        <div className="ba3d-balls__list">
          {BALL_SKINS.map((skin) => {
            const unlocked = skinUnlocked(skin, totalStars);
            const selected = progress.selectedSkin === skin.id;
            return (
              <button
                key={skin.id}
                className={`ba3d-skinrow${selected ? " is-selected" : ""}${unlocked ? "" : " is-locked"}`}
                onMouseEnter={() => setPreviewId(skin.id)}
                onFocus={() => setPreviewId(skin.id)}
                onClick={() => {
                  setPreviewId(skin.id);
                  if (unlocked) onSelectSkin(skin.id);
                }}
                disabled={!unlocked}
              >
                <span className="ba3d-skinrow__swatch" style={{ background: skin.color }} />
                <span className="ba3d-skinrow__name">{skin.name}</span>
                {selected && <span className="ba3d-skinrow__tag">EQUIPPED</span>}
                {!unlocked && <span className="ba3d-skinrow__tag ba3d-skinrow__tag--locked">&#9733; {skin.requiredStars}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
