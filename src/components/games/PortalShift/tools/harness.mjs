/**
 * DEV-only browser harness (not imported by the game). On a dev page opened
 * with `?pstest=1` (or without it, for real pointer lock / rAF), run:
 *   await (await import('/src/components/games/PortalShift/tools/harness.mjs')).setup()
 * Mounts <GamePlayer><GameRenderer name="Portal Shift: Dimension Escape">
 * inside React.StrictMode with working Restart / Mute, plus helpers:
 *   __key(code, type) · __tap(code) · __mouse(dx, dy) · __click(button) · __btn(text) · __y()
 *   __lang('en'|'ru') — switch the Game Center language (the real i18n store)
 *   await __route(id, {maxFrames}) — play chamber `id` with its scripted route through the live frame loop
 */
export async function setup({ silent = true, width = 1280 } = {}) {
  if (silent) {
    const { audio } = await import("../audio.js");
    audio.unlock = () => {};
  }
  const urls = performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /\.vite\/deps\/(react|react-dom_client)\.js/.test(n));
  const R = await import(urls.find((u) => /deps\/react\.js/.test(u)));
  const RD = await import(urls.find((u) => /react-dom_client/.test(u)));
  const GP = (await import("/src/components/game/GamePlayer.jsx")).default;
  const GR = (await import("/src/components/games/GameRenderer.jsx")).default;
  const i18n = await import("/src/i18n/i18n.js");
  const React = R.default || R;
  const createRoot = RD.createRoot || RD.default.createRoot;
  document.body.innerHTML = `<div id="h" style="width:${width}px;padding:10px"></div>`;
  const root = createRoot(document.getElementById("h"));
  const st = { muted: false, nonce: 0, game: "Portal Shift: Dimension Escape", show: true };
  window.__mount = () =>
    root.render(
      React.createElement(
        React.StrictMode,
        null,
        st.show
          ? React.createElement(
              GP,
              {
                title: st.game,
                muted: st.muted,
                onToggleMute: () => {
                  st.muted = !st.muted;
                  window.__mount();
                },
                onRestart: () => {
                  st.nonce++;
                  window.__mount();
                },
              },
              React.createElement(GR, { game: { name: st.game }, muted: st.muted, restartNonce: st.nonce })
            )
          : null
      )
    );
  window.__st = st;
  window.__root = root;
  window.__mount();
  const y = () =>
    new Promise((r) => {
      const c = new MessageChannel();
      c.port1.onmessage = r;
      c.port2.postMessage(0);
    });
  const t0 = performance.now();
  while (/pstest/.test(location.search) && !window.__ps?.play && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 100));
  window.__y = y;
  window.__lang = (l) => i18n.setLanguage(l);
  window.__key = (code, type = "keydown") => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
  window.__tap = (code) => {
    window.__key(code);
    window.__ps?.advance(1);
    window.__key(code, "keyup");
  };
  window.__mouse = (dx, dy) => document.dispatchEvent(new MouseEvent("mousemove", { movementX: dx, movementY: dy }));
  window.__click = (button = 0) => document.dispatchEvent(new MouseEvent("mousedown", { button, bubbles: true, cancelable: true }));
  window.__btn = (text) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes(text));
    b?.click();
    return !!b;
  };
  /** play a chamber's scripted route through the live component frame loop */
  window.__route = async (id, { maxFrames = 60 * 120, chunk = 240 } = {}) => {
    const { createBot } = await import("./bot.mjs");
    const { ROUTES } = await import("./routes.mjs");
    window.__ps.play(id);
    await y();
    const bot = createBot(ROUTES[id]);
    window.__ps.setBot(bot);
    let f = 0;
    while (f < maxFrames && !bot.state.done && !bot.state.failed && window.__ps.overlay() !== "complete" && window.__ps.overlay() !== "final") {
      for (let i = 0; i < chunk; i++) window.__ps.advance(1);
      f += chunk;
      await y();
    }
    window.__ps.setBot(null);
    for (let i = 0; i < 70; i++) window.__ps.advance(1);
    await new Promise((r) => setTimeout(r, 1000));
    const ov = window.__ps.overlay();
    return { done: ov === "complete" || ov === "final", failed: bot.state.reason, overlay: ov, frames: f };
  };
  return !!window.__ps;
}
