/**
 * Cozy Cleanup — Main Menu. A real 3D scene (see three/MenuScene3D.jsx —
 * additive only, doesn't touch gameplay's Scene3D/CameraRig3D/Gameplay3D)
 * behind a small floating glass-panel UI, replacing the old flat 2D
 * before/after illustration. Clicking Play does a brief fade before
 * handing off to the (untouched) existing 3D gameplay screen.
 */
import { useCallback, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import MenuScene3D from "../three/MenuScene3D.jsx";
import { getRoom, TOTAL_LEVELS } from "../data/rooms.js";
import { sfx } from "../engine/sound.js";
import "./MainMenu3D.css";

export default function MainMenu({ state, soundEnabled, onPlay, onRooms, onCollection, onStatistics, onSettings }) {
  const room = getRoom(1);
  // All levels are unlocked (by request), so `unlockedLevel` alone no longer
  // means "next room to play" — Play should still resume at the first room
  // that isn't finished yet, not jump straight to the last one.
  let bestNext = 1;
  for (let id = 1; id <= TOTAL_LEVELS; id++) {
    if (!state.rooms[id]?.completed) { bestNext = id; break; }
    bestNext = id;
  }
  const particleApi = useRef(null);
  const [leaving, setLeaving] = useState(false);
  const graphics = state.settings.graphics;

  const go = (fn) => () => { if (leaving) return; sfx.ui(soundEnabled); fn(); };

  const startPlay = useCallback(() => {
    if (leaving) return;
    sfx.ui(soundEnabled);
    setLeaving(true);
    setTimeout(() => onPlay(bestNext), 480);
  }, [leaving, soundEnabled, onPlay, bestNext]);

  const dpr = graphics === "low" ? [0.75, 1] : graphics === "medium" ? [1, 1.5] : [1, 2];
  const onCreated = useCallback(({ gl }) => {
    gl.shadowMap.enabled = graphics !== "low";
    gl.shadowMap.type = graphics === "high" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.08;
    gl.outputColorSpace = THREE.SRGBColorSpace;
  }, [graphics]);

  return (
    <div className={`cc3d-menu${leaving ? " cc3d-menu--leaving" : ""}`}>
      <div className="cc3d-menu__canvas">
        <Canvas
          dpr={dpr}
          shadows={graphics !== "low"}
          gl={{ antialias: graphics !== "low", powerPreference: "high-performance" }}
          camera={{ fov: 46, near: 0.1, far: 60 }}
          onCreated={onCreated}
        >
          <MenuScene3D room={room} particleApi={particleApi} graphics={graphics} />
        </Canvas>
      </div>

      <div className="cc3d-menu__vignette" aria-hidden="true" />

      <div className="cc3d-menu__panel">
        <h1 className="cc3d-menu__title">Cozy Cleanup</h1>
        <p className="cc3d-menu__subtitle">CLEAN &bull; ORGANIZE &bull; RELAX</p>

        <button type="button" className="cc3d-menu__play" onClick={startPlay}>
          Play
        </button>

        <div className="cc3d-menu__grid">
          <button type="button" className="cc3d-menu__btn" onClick={go(onRooms)}>Rooms</button>
          <button type="button" className="cc3d-menu__btn" onClick={go(onCollection)}>Collection</button>
          <button type="button" className="cc3d-menu__btn" onClick={go(onStatistics)}>Statistics</button>
          <button type="button" className="cc3d-menu__btn" onClick={go(onSettings)}>Settings</button>
        </div>
      </div>
    </div>
  );
}
