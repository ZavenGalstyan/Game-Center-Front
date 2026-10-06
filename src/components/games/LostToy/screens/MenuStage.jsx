/**
 * Lost Toy — the cinematic 3D backdrop behind every menu screen: the menu
 * bedroom at golden hour, Pip sitting on a book swinging its feet and
 * looking up at the giant room, a slow low camera drift. Mounted once for all
 * menu screens; the Toy screen moves the camera in close and swaps the look
 * live.
 */
import { useEffect, useMemo, useRef } from "react";
import GameCanvas from "../three/GameCanvas.jsx";
import { createWorld } from "../engine/world.js";
import { menuLevel } from "../data/menuLevel.js";
import { worldById } from "../data/worlds.js";

const NO_INPUT = { frame: () => ({ ax: 0, ay: 0, edges: {} }), consumeLook: () => [0, 0], lookDX: 0, lookDY: 0 };

export default function MenuStage({ settingsRef, cosmetic, view }) {
  const theme = worldById(1);
  const W = useMemo(() => createWorld(menuLevel()), []);
  const rRef = useRef(null);
  const cosRef = useRef(cosmetic);
  useEffect(() => {
    const r = rRef.current;
    if (r && cosRef.current !== cosmetic) r.setCosmetic(cosmetic);
    cosRef.current = cosmetic;
  }, [cosmetic]);
  useEffect(() => {
    if (rRef.current) rRef.current.setMenuView(view);
  }, [view]);
  const q = settingsRef.current.graphics;
  return (
    <GameCanvas
      key={q}
      className="lt-canvas lt-canvas--menu"
      W={W}
      theme={{ ...theme, sun: { ...theme.sun, pos: [-30, 30, -70], intensity: 3.3, color: "#ffc98a" }, exposure: 1.02 }}
      settingsRef={settingsRef}
      cosmetic={cosRef.current}
      touch={false}
      input={NO_INPUT}
      mode="menu"
      dom={{}}
      onReady={(r) => {
        rRef.current = r;
        if (r) {
          r.setMenuView(view);
          if (cosRef.current !== cosmetic) r.setCosmetic(cosmetic);
        }
      }}
    />
  );
}
