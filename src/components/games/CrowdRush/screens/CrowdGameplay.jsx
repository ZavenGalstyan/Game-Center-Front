/**
 * Crowd Rush — the play screen. A thin shell around <CrowdScene> (which owns the
 * canvas, engine, HUD and pause menu). Kept separate so the run mounts/unmounts
 * cleanly with `runKey` and the parent stays screen-routing only.
 */

import CrowdScene from "../game/CrowdScene.jsx";

export default function CrowdGameplay({ level, world, colorHex, settings, runKey, touch, onResult, onQuit }) {
  return (
    <div className="cr-screen cr-play">
      <CrowdScene
        level={level}
        world={world}
        colorHex={colorHex}
        settings={settings}
        runKey={runKey}
        touch={touch}
        onResult={onResult}
        onQuit={onQuit}
      />
    </div>
  );
}
