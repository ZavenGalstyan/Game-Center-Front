// DEV-only: see viewer.html
import * as THREE from "three";
import { createWorld } from "../render/world.js";
const P = new URLSearchParams(location.search);
const el = document.getElementById("s");
const world = createWorld(el, { quality: P.get("q") || "high", manual: true, preserve: true });
world.resize(el.clientWidth, el.clientHeight);
const y = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage(0); });
window.__v = {
  world, THREE,
  ready: world.load(P.get("env") || "graveyard", P.get("mon") || "skeleton", { menu: P.has("menu") }).then(() => { world.advance(30); return true; }),
  adv: (n = 1, dt = 1 / 60) => world.advance(n, dt),
  act: (k) => world.monster().act(k),
  hit: (p = 1) => world.monster().hit(p, 1),
  die: () => world.monster().die(),
  stage: (n) => world.monster().setStage(n),
  cam(pos, look) { world.step(0); world.camera.position.set(...pos); world.camera.lookAt(...look); world.render(); },
  async run(sec, dt = 1 / 30) { const n = Math.round(sec / dt); for (let i = 0; i < n; i++) { world.step(dt); if (i % 10 === 0) await y(); } world.render(); },
  y,
};
