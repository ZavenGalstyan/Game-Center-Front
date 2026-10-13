/**
 * DEV-only browser harness (not imported by the game). On a dev page opened
 * with `?zootest=1&nosave=1`, run in the console:
 *   await (await import('/src/components/games/ZooSimulator3D/tools/harness.mjs')).setup()
 * It mounts <GamePlayer><GameRenderer name="Zoo Simulator 3D"> (the game isn't
 * in the backend yet) and adds helpers that drive the REAL input handlers:
 *   __key(code, type) · __mouse(dx, dy) · __walk(x, z) · __aim(key) · __E() · __y()
 * `silent` stubs out the AudioContext (sound in the automation tab can stall
 * screenshots).
 */
export async function setup({ silent = true, width = 1200 } = {}) {
  if (silent) {
    const { audio } = await import("../audio.js");
    audio.unlock = () => {};
    window.__au = audio;
  }
  const urls = performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /\.vite\/deps\/(react|react-dom_client)\.js/.test(n));
  const R = await import(urls.find((u) => /deps\/react\.js/.test(u)));
  const RD = await import(urls.find((u) => /react-dom_client/.test(u)));
  const GP = (await import("/src/components/game/GamePlayer.jsx")).default;
  const GR = (await import("/src/components/games/GameRenderer.jsx")).default;
  const React = R.default || R;
  const createRoot = RD.createRoot || RD.default.createRoot;
  document.body.innerHTML = `<div id="h" style="width:${width}px;padding:10px"></div>`;
  const root = createRoot(document.getElementById("h"));
  const st = { muted: false, nonce: 0, game: "Zoo Simulator 3D" }; // set __st.game + __mount() to swap games
  window.__mount = () =>
    root.render(React.createElement(React.StrictMode, null, React.createElement(GP, {
      title: "Zoo", muted: st.muted,
      onToggleMute: () => { st.muted = !st.muted; window.__mount(); },
      onRestart: () => { st.nonce++; window.__mount(); },
    }, React.createElement(GR, { game: { name: st.game }, muted: st.muted, restartNonce: st.nonce }))));
  window.__st = st;
  window.__mount();
  const y = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage(0); });
  const t0 = performance.now();
  while (!window.__zoo && performance.now() - t0 < 15000) await new Promise((r) => setTimeout(r, 100));
  window.__y = y;
  window.__key = (code, type = "keydown") => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  window.__mouse = (dx, dy) => document.dispatchEvent(new MouseEvent("mousemove", { movementX: dx, movementY: dy }));
  window.__walk = async (x, z, max = 40, sprint = true) => {
    const p = window.__zoo.zoo().player;
    for (let i = 0; i < max * 60; i++) {
      const dx = x - p.x;
      const dz = z - p.z;
      if (Math.hypot(dx, dz) < 0.35) break;
      window.__zoo.look.yaw = Math.atan2(-dx, -dz);
      window.__zoo.look.pitch = -0.2;
      window.__key("KeyW");
      if (sprint) window.__key("ShiftLeft");
      window.__zoo.advance(1);
      if (i % 120 === 0) await y();
    }
    window.__key("KeyW", "keyup");
    window.__key("ShiftLeft", "keyup");
    window.__zoo.advance(20);
    return [+p.x.toFixed(2), +p.z.toFixed(2)];
  };
  window.__aim = (key) => {
    const z = window.__zoo.zoo();
    const it = z.interactables().find((i) => i.key === key);
    if (!it) return "missing " + key;
    const p = z.player;
    const dx = it.x - p.x;
    const dz = it.z - p.z;
    window.__zoo.look.yaw = Math.atan2(-dx, -dz);
    window.__zoo.look.pitch = Math.atan2(it.y - 1.65, Math.hypot(dx, dz));
    window.__zoo.advance(30);
    return [window.__zoo.target()?.key, document.querySelector(".zoo-prompt span")?.textContent];
  };
  window.__E = () => {
    window.__key("KeyE");
    window.__key("KeyE", "keyup");
    window.__zoo.advance(3);
  };
  window.__zoo.fit();
  return "ready";
}
