/**
 * Dimension Dash — the live 3D menu backdrop: Green Shift auto-played by the
 * route bot (loops, shift gates, rails and all), with the real camera
 * transitions. Effects are silent in menu mode; only the menu music plays.
 */
import { useMemo } from "react";
import GameCanvas from "../three/GameCanvas.jsx";
import { createWorld } from "../engine/world.js";
import { levelById } from "../data/levels/index.js";
import { worldById } from "../data/worlds.js";

export default function MenuStage({ settingsRef }) {
  const W = useMemo(() => createWorld(levelById(1)), []);
  return <GameCanvas className="dd-canvas dd-canvas--menu" W={W} world={worldById(1)} settingsRef={settingsRef} input={null} mode="menu" />;
}
