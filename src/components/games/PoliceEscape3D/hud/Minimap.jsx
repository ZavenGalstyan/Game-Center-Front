/**
 * Police Escape 3D — a small heading-up minimap (2D canvas, ~15 fps): the
 * road network around the car, the objective (checkpoint / escape zone,
 * clamped to the rim with an edge marker when off-map), police (flashing),
 * traffic, roadblocks. The road layer is drawn once to an off-screen canvas
 * in world space and blitted rotated every frame.
 */
import { useEffect, useMemo, useRef } from "react";
import { objectiveOf } from "./Hud.jsx";
import { PSTATE } from "../engine/police.js";

const RANGE = 190; // metres from the centre to the rim

export default function Minimap({ run, size = 150 }) {
  const ref = useRef(null);
  const city = run.city;
  const layer = useMemo(() => {
    const B = city.bounds;
    const S = 0.5; // px per metre on the layer
    const c = document.createElement("canvas");
    c.width = Math.ceil((B.x1 - B.x0 + 80) * S);
    c.height = Math.ceil((B.z1 - B.z0 + 80) * S);
    const g = c.getContext("2d");
    g.fillStyle = "#0b0e16";
    g.fillRect(0, 0, c.width, c.height);
    const X = (x) => (x - B.x0 + 40) * S;
    const Z = (z) => (z - B.z0 + 40) * S;
    // blocks
    for (const b of city.blocks) {
      g.fillStyle = b.type === "water" ? "#0f2a44" : b.type === "park" ? "#163020" : "#1a1f2c";
      g.fillRect(X(b.x0), Z(b.z0), (b.x1 - b.x0) * S, (b.z1 - b.z0) * S);
    }
    g.lineCap = "round";
    for (const e of city.edges) {
      const A = city.nodes[e.a];
      const Bn = city.nodes[e.b];
      g.strokeStyle = e.kind === "alley" ? "#3a4256" : e.kind === "drive" ? "#2dff7a" : e.kind === "tunnel" ? "#4a4f60" : "#5c6680";
      g.lineWidth = Math.max(2, e.w * S);
      g.beginPath();
      g.moveTo(X(A.x), Z(A.z));
      g.lineTo(X(Bn.x), Z(Bn.z));
      g.stroke();
    }
    return { c, S, X, Z };
  }, [city]);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return undefined;
    const g = cv.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = size * dpr;
    cv.height = size * dpr;
    let t = 0;
    const draw = () => {
      t++;
      const W = size * dpr;
      const R = W / 2;
      const k = (R / RANGE) * 1; // px per metre on screen
      const p = run.player;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, W, W);
      g.save();
      g.beginPath();
      g.arc(R, R, R - 1, 0, Math.PI * 2);
      g.clip();
      g.fillStyle = "#070910";
      g.fillRect(0, 0, W, W);
      // world → screen: translate to the player, rotate so the heading points up
      g.translate(R, R);
      g.rotate(Math.PI + p.h);
      g.scale(k / layer.S, k / layer.S);
      g.drawImage(layer.c, -layer.X(p.x), -layer.Z(p.z));
      g.setTransform(1, 0, 0, 1, 0, 0);
      const toScreen = (x, z) => {
        const dx = x - p.x;
        const dz = z - p.z;
        const a = Math.PI + p.h;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        return [R + (dx * ca - dz * sa) * k, R + (dx * sa + dz * ca) * k];
      };
      const dot = (x, z, r, col) => {
        const [sx, sy] = toScreen(x, z);
        g.fillStyle = col;
        g.beginPath();
        g.arc(sx, sy, r, 0, Math.PI * 2);
        g.fill();
      };
      for (const tc of run.traffic.cars) if (tc.active) dot(tc.x, tc.z, 1.6 * dpr, "#8a90a0");
      for (const r of run.roadblocks) dot(r.x, r.z, 3 * dpr, "#ff9a1a");
      for (const c of run.police) {
        if (c.state === PSTATE.LOST) continue;
        dot(c.car.x, c.car.z, 3.4 * dpr, c.state === PSTATE.DISABLED ? "#666" : t % 8 < 4 ? "#ff2a3a" : "#2a6aff");
      }
      // objective (clamped to the rim)
      const ob = objectiveOf(run);
      let [ox, oy] = toScreen(ob.x, ob.z);
      const d = Math.hypot(ox - R, oy - R);
      if (d > R - 7) {
        ox = R + ((ox - R) / d) * (R - 7);
        oy = R + ((oy - R) / d) * (R - 7);
      }
      g.fillStyle = ob.kind === "cp" ? "#ffc21a" : run.zoneOpen ? "#2dff7a" : "#ff3a3a";
      g.beginPath();
      g.arc(ox, oy, 4.5 * dpr, 0, Math.PI * 2);
      g.fill();
      // the player: an arrow pointing up
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.moveTo(R, R - 6 * dpr);
      g.lineTo(R + 4.5 * dpr, R + 5 * dpr);
      g.lineTo(R, R + 2.5 * dpr);
      g.lineTo(R - 4.5 * dpr, R + 5 * dpr);
      g.closePath();
      g.fill();
      g.restore();
      g.strokeStyle = "rgba(255,255,255,0.35)";
      g.lineWidth = 2 * dpr;
      g.beginPath();
      g.arc(R, R, R - 1, 0, Math.PI * 2);
      g.stroke();
    };
    draw();
    const id = setInterval(draw, 66);
    return () => clearInterval(id);
  }, [run, layer, size]);
  return <canvas ref={ref} className="pe-minimap" style={{ width: size, height: size }} aria-label="Minimap" />;
}
