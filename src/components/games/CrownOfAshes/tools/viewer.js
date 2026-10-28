/**
 * DEV scene viewer (not imported by the game): renders the world from a
 * camera given in the URL, for screenshots and visual checks.
 *   /src/components/games/CrownOfAshes/tools/viewer.html?x=0&y=20&z=200&lx=0&ly=8&lz=150&hour=10&q=medium
 * window.__view(params) re-renders; window.__ready flips true after warm-up.
 */
import { createWorld } from "../render/world.js";

const P = Object.fromEntries(new URLSearchParams(location.search));
const num = (k, d) => (P[k] != null ? Number(P[k]) : d);
const host = document.getElementById("v");
const world = createWorld(host, { quality: P.q || "medium", test: true });
world.resize(host.clientWidth, host.clientHeight);
let view = {};
function setView(p = {}) {
  const g = (k, d) => (p[k] != null ? Number(p[k]) : num(k, d));
  const T = world.W.col;
  const gy = g("gy", NaN);
  const gly = g("gly", NaN);
  const cy = Number.isNaN(gy) ? g("y", 22) : T.ground(g("x", 0), g("z", 215)) + gy;
  const ly = Number.isNaN(gly) ? g("ly", 8) : T.ground(g("lx", 0), g("lz", 150)) + gly;
  view = {
    mode: "free",
    cam: { x: g("x", 0), y: cy, z: g("z", 215), lx: g("lx", 0), ly, lz: g("lz", 150), fov: g("fov", 60) },
    hour: g("hour", 10),
    weather: { kind: p.weather || P.weather || null, amt: g("wamt", 0.8), storm: g("storm", 0) },
    interior: (p.interior ?? P.interior) === "1",
    focus: { x: g("lx", 0), y: ly, z: g("lz", 150) },
    stateFor: () => ({ open: true, lit: true }),
  };
}
setView();
let frames = 0;
window.__ready = false;
window.__view = (p) => {
  setView(p);
  for (let i = 0; i < 4; i++) world.frame(1 / 30, view);
  return true;
};
function loop() {
  world.frame(1 / 60, view);
  if (++frames === 8) window.__ready = true;
  requestAnimationFrame(loop);
}
loop();
window.__world = world;
