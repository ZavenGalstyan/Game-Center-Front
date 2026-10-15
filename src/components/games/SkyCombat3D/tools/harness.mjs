/**
 * DEV-only browser harness (not imported by the game). On a dev page opened
 * with `?sctest=1&nosave=1`, run in the console:
 *   await (await import('/src/components/games/SkyCombat3D/tools/harness.mjs')).setup()
 * It mounts <GamePlayer><GameRenderer name="Sky Combat 3D"> (the game isn't in
 * the backend yet) inside React.StrictMode with working Restart / Mute, and
 * adds helpers that drive the REAL input handlers:
 *   __key(code, type) · __mouse(dx, dy) · __click(button, type) · __y()
 *   __bot() → attaches the test pilot (tools/bot.mjs) which presses the same
 *   keys / mouse buttons / aim the player would (see __botStep).
 * `silent` stubs out the AudioContext (sound in the automation tab can stall screenshots).
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
  const st = { muted: false, nonce: 0, game: "Sky Combat 3D", show: true };
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
  while (!window.__sc && performance.now() - t0 < 15000) await new Promise((r) => setTimeout(r, 100));
  window.__y = y;
  window.__key = (code, type = "keydown") => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  window.__mouse = (dx, dy) => document.dispatchEvent(new MouseEvent("mousemove", { movementX: dx, movementY: dy }));
  window.__click = (button = 0, type = "mousedown") => {
    const el = document.querySelector(".sc");
    if (type === "mousedown") el.dispatchEvent(new MouseEvent("mousedown", { button, bubbles: true }));
    else window.dispatchEvent(new MouseEvent("mouseup", { button, bubbles: true }));
  };
  const { createBot } = await import("./bot.mjs");
  /** Bot through the live component: aim via the mouse-aim angles, buttons via real handlers. */
  window.__bot = () => {
    const sim = window.__sc.sim();
    const bot = createBot(sim);
    const held = new Set();
    window.__botStep = () => {
      const s = window.__sc.sim();
      if (s !== sim) return false;
      const inp = bot(1 / 60);
      const m = window.__sc.mouse;
      m.yaw = Math.atan2(inp.aim.x, -inp.aim.z);
      m.pitch = Math.asin(Math.max(-1, Math.min(1, inp.aim.y)));
      const p = s.player;
      const want = new Set();
      if (inp.throttle > p.throttle + 0.03) want.add("ShiftLeft");
      if (inp.throttle < p.throttle - 0.03) want.add("ControlLeft");
      for (const k of held) if (!want.has(k)) { window.__key(k, "keyup"); held.delete(k); }
      for (const k of want) if (!held.has(k)) { window.__key(k); held.add(k); }
      if (inp.fire && !m.fire) window.__click(0);
      if (!inp.fire && m.fire) window.__click(0, "mouseup");
      if (inp.lock) window.__click(2);
      for (const [f, code] of [["missile", "Space"], ["bomb", "KeyB"], ["flare", "KeyF"]]) if (inp[f]) { window.__key(code); window.__key(code, "keyup"); }
      return true;
    };
    return "bot attached";
  };
  window.__sc.fit();
  return "ready";
}
