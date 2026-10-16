/**
 * DEV-only browser harness (not imported by the game). On a dev page opened
 * with `?twtest=1&nosave=1`, run in the console:
 *   await (await import('/src/components/games/TankWarfare3D/tools/harness.mjs')).setup()
 * It mounts <GamePlayer><GameRenderer name="Tank Warfare 3D"> (the game isn't
 * in the backend yet) inside React.StrictMode with working Restart / Mute, and
 * adds helpers that drive the REAL input handlers:
 *   __key(code, type) · __mouse(dx, dy) · __click(button, type) · __y()
 *   __bot() → attaches the test pilot (tools/bot.mjs); __botStep() presses the
 *   same keys / mouse buttons the player would and steers the camera so the
 *   screen-centre aim ray lands on the bot's aim point.
 * `silent` stubs out the AudioContext unlock (sound in an automation tab can stall).
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
  const st = { muted: false, nonce: 0, game: "Tank Warfare 3D", show: true };
  window.__mount = () =>
    root.render(React.createElement(React.StrictMode, null, st.show ? React.createElement(GP, {
      title: st.game, muted: st.muted,
      onToggleMute: () => { st.muted = !st.muted; window.__mount(); },
      onRestart: () => { st.nonce++; window.__mount(); },
    }, React.createElement(GR, { game: { name: st.game }, muted: st.muted, restartNonce: st.nonce })) : null));
  window.__st = st;
  window.__mount();
  const y = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage(0); });
  const t0 = performance.now();
  while (!window.__tw && !document.querySelector(".tw-menu") && performance.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 100));
  window.__y = y;
  window.__key = (code, type = "keydown") => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  window.__mouse = (dx, dy) => document.dispatchEvent(new MouseEvent("mousemove", { movementX: dx, movementY: dy }));
  window.__click = (button = 0, type = "mousedown") => {
    const el = document.querySelector(".tw");
    if (type === "mousedown") el.dispatchEvent(new MouseEvent("mousedown", { button, bubbles: true }));
    else window.dispatchEvent(new MouseEvent("mouseup", { button, bubbles: true }));
  };
  const { createBot } = await import("./bot.mjs");
  /** Bot through the live component: keys + mouse buttons via the real handlers; camera aimed at the bot's target. */
  window.__bot = () => {
    const sim = window.__tw.sim();
    const bot = createBot(sim);
    const held = new Set();
    window.__botStep = () => {
      const s = window.__tw.sim();
      if (s !== sim) return false;
      const inp = bot(1 / 60);
      const p = s.player;
      const want = new Set();
      if (inp.throttle > 0.3) want.add("KeyW");
      if (inp.throttle < -0.3) want.add("KeyS");
      if (inp.steer > 0.3) want.add("KeyD");
      if (inp.steer < -0.3) want.add("KeyA");
      if (inp.boost) want.add("ShiftLeft");
      for (const k of held) if (!want.has(k)) { window.__key(k, "keyup"); held.delete(k); }
      for (const k of want) if (!held.has(k)) { window.__key(k); held.add(k); }
      if (inp.ammo) { const code = { ap: "Digit1", he: "Digit2", smoke: "Digit3" }[inp.ammo]; window.__key(code); window.__key(code, "keyup"); }
      if (inp.repair) { window.__key("KeyR"); window.__key("KeyR", "keyup"); }
      // point the camera so its centre ray passes over the aim point (chase cam pivot sits above the tank)
      if (inp.aim) {
        const c = window.__tw.cam;
        const cam = window.__tw.world.camera.position;
        const dx = inp.aim.x - cam.x;
        const dz = inp.aim.z - cam.z;
        c.yaw = Math.atan2(dx, dz);
        c.pitch = Math.max(-0.55, Math.min(0.38, Math.atan2(inp.aim.y - cam.y, Math.hypot(dx, dz))));
      }
      const m = window.__tw.mouse;
      if (inp.fire && !m.fire) window.__click(0);
      if (!inp.fire && m.fire) window.__click(0, "mouseup");
      void p;
      return true;
    };
    return "bot attached";
  };
  window.__tw?.fit();
  return "ready";
}
