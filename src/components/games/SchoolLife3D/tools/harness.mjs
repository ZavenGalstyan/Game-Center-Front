/**
 * DEV-only browser harness (not imported by the game). On a dev page opened
 * with `?sltest=1&nosave=1`, run in the console:
 *   await (await import('/src/components/games/SchoolLife3D/tools/harness.mjs')).setup()
 * It mounts <GamePlayer><GameRenderer name="School Life Simulator 3D"> inside
 * React.StrictMode with working Restart / Mute, and adds helpers that drive
 * the REAL input handlers:
 *   __key(code, type) · __mouse(dx, dy) · __click(button, type) · __y() (yield)
 *   __hold(code, frames) — hold a key while advancing frames
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
  const st = { muted: false, nonce: 0, game: "School Life Simulator 3D", show: true };
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
  while (!window.__sl && performance.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 100));
  window.__y = y;
  window.__key = (code, type = "keydown") => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
  window.__mouse = (dx, dy) => document.dispatchEvent(new MouseEvent("mousemove", { movementX: dx, movementY: dy }));
  window.__click = (button = 0, type = "mousedown") => {
    const el = document.querySelector(".sl");
    el.dispatchEvent(new MouseEvent(type, { button, bubbles: true }));
  };
  window.__hold = (code, frames = 60) => {
    window.__key(code);
    window.__sl.advance(frames);
    window.__key(code, "keyup");
  };
  window.__sl.fit();
  return "ready";
}
