/**
 * Rooftop Dash — the cinematic 3D backdrop behind every menu screen: one
 * dressed rooftop at golden hour (or the player's furthest district), the
 * runner idling / stretching at the edge, a slow camera drift. Mounted once
 * for all menu screens; the Runner screen just moves the camera closer and
 * swaps the outfit live.
 */
import { useEffect, useMemo, useRef } from "react";
import GameCanvas from "../three/GameCanvas.jsx";
import { createWorld } from "../engine/world.js";
import { menuLevel } from "../data/menuLevel.js";
import { worldById } from "../data/worlds.js";

const NO_INPUT = { frame: () => ({ ax: 0, ay: 0, edges: {} }), consumeLook: () => [0, 0], lookDX: 0, lookDY: 0 };

export default function MenuStage({ worldId, settingsRef, outfit, trail, view }) {
  const theme = worldById(worldId);
  const W = useMemo(() => createWorld(menuLevel(worldId)), [worldId]);
  const rRef = useRef(null);
  const outfitRef = useRef(outfit);
  useEffect(() => {
    const r = rRef.current;
    if (r && outfitRef.current !== outfit) r.setOutfit(outfit);
    outfitRef.current = outfit;
  }, [outfit]);
  useEffect(() => {
    if (rRef.current) rRef.current.setMenuView(view);
  }, [view]);
  const q = settingsRef.current.graphics;
  return (
    <GameCanvas
      key={`${worldId}:${q}`}
      className="rd-canvas rd-canvas--menu"
      W={W}
      theme={theme}
      settingsRef={settingsRef}
      outfit={outfitRef.current}
      trail={trail}
      touch={false}
      input={NO_INPUT}
      mode="menu"
      dom={{}}
      onReady={(r) => {
        rRef.current = r;
        if (r) {
          r.setMenuView(view);
          if (outfitRef.current !== outfit) r.setOutfit(outfit);
        }
      }}
    />
  );
}
