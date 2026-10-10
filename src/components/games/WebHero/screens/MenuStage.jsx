/**
 * Web Hero — the live 3D menu backdrop: the downtown skyline at golden
 * hour with the hero perched on a skyscraper's edge, a slow cinematic orbit
 * and the city alive below (traffic, pedestrians). Silent except the music.
 */
import { useMemo } from "react";
import GameCanvas from "../three/GameCanvas.jsx";
import { createWorld, cityFor } from "../engine/world.js";
import { DISTRICTS } from "../data/districts.js";

const MENU_SKY = { ...DISTRICTS[0], time: "dusk", sky: { top: "#2a4f9a", mid: "#e89a6a", horizon: "#ffd9a8", fog: "#e8b896", sun: "#ffd9a0" } };

export default function MenuStage({ settingsRef, suit }) {
  const W = useMemo(() => {
    const C = cityFor("downtown");
    // an 84 m roof on the south edge of downtown: the park below, the whole
    // skyline ahead (the widest open view in the district)
    const b = C.roofs.reduce((best, r) => (r.y1 > 80 && r.y1 < 90 && r.x1 - r.x0 > 15 && (!best || r.z0 > best.z0) ? r : best), null) || C.roofIn(4, 5).box;
    const spawn = { x: (b.x0 + b.x1) / 2, y: b.y1, z: b.z0 + 0.6, h: Math.PI };
    return createWorld({ id: 0, district: "downtown", name: "menu", spawn, steps: [{ type: "reach", at: { x: 9999, y: 0, z: 9999 }, label: "" }] });
  }, []);
  return <GameCanvas className="wh-canvas wh-canvas--menu" W={W} district={MENU_SKY} settingsRef={settingsRef} suit={suit} input={null} mode="menu" />;
}
