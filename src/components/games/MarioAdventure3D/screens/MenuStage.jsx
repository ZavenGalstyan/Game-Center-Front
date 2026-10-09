/**
 * Mario Adventure 3D — the live 3D backdrop behind every menu: the showcase
 * island with Mario running laps, coins spinning, clouds drifting and a slow
 * orbiting camera. One world, created once while menus are open.
 */
import { useMemo } from "react";
import GameCanvas from "../three/GameCanvas.jsx";
import { createWorld } from "../engine/world.js";
import { menuLevel, menuAutopilot } from "../data/menuLevel.js";
import { WORLDS } from "../data/worlds.js";

export default function MenuStage({ settingsRef }) {
  const W = useMemo(() => createWorld(menuLevel(), { menu: true }), []);
  const pilot = useMemo(() => menuAutopilot(), []);
  return <GameCanvas className="ma-canvas ma-canvas--menu" W={W} world={WORLDS[0]} settingsRef={settingsRef} input={null} mode="menu" autopilot={pilot} />;
}
