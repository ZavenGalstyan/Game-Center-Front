/**
 * DEV-only browser harness (not imported by the game). On a dev page opened
 * with `?dsetest=1` (or without it, for real pointer lock / rAF), run:
 *   await (await import('/src/components/games/DeepSeaEscape/tools/harness.mjs')).setup()
 * Mounts <GamePlayer><GameRenderer name="Deep Sea Escape: Abyss Facility"> inside
 * React.StrictMode with working Restart / Mute, plus helpers:
 *   __key(code, type) · __tap(code) · __mouse(dx, dy) · __btn(text) · __y()
 *   __lang('en'|'ru') — switch the Game Center language (the real i18n store)
 *   await __route(id) — play level `id` with its scripted route through the live frame loop
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
  const st = { muted: false, nonce: 0, game: "Deep Sea Escape: Abyss Facility", show: true };
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
              React.createElement(GR, { game: { name: st.game }, muted: st.muted, restartNonce: st.nonce }),
            )
          : null,
      ),
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
  while (/dsetest/.test(location.search) && !window.__dse?.play && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 100));
  window.__y = y;
  window.__lang = (l) => i18n.setLanguage(l);
  window.__key = (code, type = "keydown") => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
  window.__tap = (code) => {
    window.__key(code);
    window.__dse?.advance(1);
    window.__key(code, "keyup");
  };
  window.__mouse = (dx, dy) => document.dispatchEvent(new MouseEvent("mousemove", { movementX: dx, movementY: dy }));
  window.__btn = (text) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes(text));
    b?.click();
    return !!b;
  };
  /** play a level's scripted route through the live component frame loop */
  window.__route = async (id, { maxFrames = 60 * 240, chunk = 240, render = true } = {}) => {
    const { createBot } = await import("./bot.mjs");
    window.__dse.setBot(null);
    const { ROUTES } = await import("./routes.mjs");
    window.__dse.play(id);
    await y();
    const world = window.__dse.world();
    const realRender = world.render;
    if (!render) world.render = () => {};
    const bot = createBot(ROUTES[id]);
    window.__dse.setBot(bot);
    let f = 0;
    const done = () => ["complete", "final"].includes(window.__dse.overlay()) || window.__dse.sim()?.state === "complete";
    while (f < maxFrames && !bot.state.done && !bot.state.failed && !done()) {
      // clue panels pause the game exactly as for a player: close them
      if (["clue", "keypad", "pipes"].includes(window.__dse.overlay())) window.__dse.resume();
      if (window.__dse.overlay() === "dead") window.__dse.respawn();
      for (let i = 0; i < chunk; i++) window.__dse.advance(1);
      f += chunk;
      await y();
    }
    window.__dse.setBot(null);
    for (let i = 0; i < 70; i++) window.__dse.advance(1);
    await new Promise((r) => setTimeout(r, 1000));
    world.render = realRender;
    const ov = window.__dse.overlay();
    return { done: ov === "complete" || ov === "final", failed: bot.state.reason, overlay: ov, frames: f, deaths: window.__dse.sim()?.counters.deaths, kills: window.__dse.sim()?.counters.kills };
  };
  return !!window.__dse;
}
