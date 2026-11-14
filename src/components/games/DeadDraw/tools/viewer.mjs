// DEV-only: see viewer.html
import { createWorld } from "../render/world.js";
const P = new URLSearchParams(location.search);
const el = document.getElementById("s");
const world = createWorld(el, { quality: P.get("q") || "high", preserve: true });
world.resize(el.clientWidth, el.clientHeight);
window.__v = {
  world,
  ready: world.load((p) => (window.__p = p)).then((ok) => { world.focus(P.get("focus") || "room", 0.01); return ok; }),
  cue: (n) => world.cue(n),
  focus: (n) => world.focus(n, 0.01),
  dbg: () => world.debug,
};
