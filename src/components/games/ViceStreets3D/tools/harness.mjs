/**
 * DEV-only browser harness (not imported by the game). On a dev page opened
 * with `?vstest=1&nosave=1`, run in the console:
 *   await (await import('/src/components/games/HulkOpenWorld3D/tools/harness.mjs')).setup()
 * It mounts <GamePlayer><GameRenderer name="Vice Streets 3D"> inside
 * React.StrictMode with working Restart / Mute, and exposes helpers that drive
 * the REAL input handlers: __key(code, type) · __mouse(dx, dy) · __click(button, type).
 * `silent` stubs the AudioContext unlock (sound in an automation tab can stall).
 */
export async function setup({ silent = true, width = 1280 } = {}) {
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
  const st = { muted: false, nonce: 0, game: "Vice Streets 3D", show: true };
  window.__mount = () =>
    root.render(React.createElement(React.StrictMode, null, st.show ? React.createElement(GP, {
      title: st.game, muted: st.muted,
      onToggleMute: () => { st.muted = !st.muted; window.__mount(); },
      onRestart: () => { st.nonce++; window.__mount(); },
    }, React.createElement(GR, { game: { name: st.game }, muted: st.muted, restartNonce: st.nonce })) : null));
  window.__st = st;
  window.__mount();
  const t0 = performance.now();
  while (!window.__vs && !document.querySelector(".vs-menu") && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 100));
  window.__key = (code, type = "keydown") => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  window.__mouse = (dx, dy) => document.dispatchEvent(new MouseEvent("mousemove", { movementX: dx, movementY: dy }));
  window.__click = (button = 0, type = "mousedown") => {
    const el = document.querySelector(".vs");
    if (type === "mousedown") el.dispatchEvent(new MouseEvent("mousedown", { button, bubbles: true }));
    else window.dispatchEvent(new MouseEvent("mouseup", { button, bubbles: true }));
  };
  return window.__vs ? "ready" : document.querySelector(".vs-menu") ? "ready (no test hooks)" : "not mounted";
}
