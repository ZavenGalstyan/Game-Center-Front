/**
 * DEV-only browser harness (not imported by the game). On a dev page opened
 * with `?dmtest=1` (add `&nosave=1` to keep saves in memory), run:
 *   await (await import('/src/components/games/DeepMine/tools/harness.mjs')).setup()
 * Mounts <GamePlayer><GameRenderer name="Deep Mine: The Forgotten Ones"> inside
 * React.StrictMode with working Restart / Mute, plus helpers:
 *   __key(code, type) · __tap(code) · __mouse(dx, dy) · __btn(text) · __y()
 *   __lang('en'|'ru') — switch the Game Center language (the real i18n store)
 *   await __route(id, {render}) — play level `id` with the test bot through the live frame loop
 */
export async function setup({ silent = true, width = 1100 } = {}) {
  if (silent) {
    const { audio } = await import("../audio.js");
    audio.unlock = () => {};
    audio.startMusic = () => {};
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
  const st = { muted: false, nonce: 0, game: "Deep Mine: The Forgotten Ones", show: true };
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
  while (/dmtest/.test(location.search) && !window.__dm?.play && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 100));
  window.__y = y;
  window.__lang = (l) => i18n.setLanguage(l);
  window.__key = (code, type = "keydown") => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
  window.__tap = (code) => {
    window.__key(code);
    window.__dm?.advance(1);
    window.__key(code, "keyup");
  };
  window.__mouse = (dx, dy) => document.querySelector(".dm")?.dispatchEvent(new MouseEvent("mousemove", { movementX: dx, movementY: dy, bubbles: true }));
  window.__btn = (text) => {
    const b = [...document.querySelectorAll(".dm button")].find((x) => x.textContent.trim() === text) || [...document.querySelectorAll(".dm button")].find((x) => x.textContent.includes(text));
    b?.click();
    return !!b;
  };
  /** play a level with the test bot through the live component frame loop */
  window.__route = async (id, { maxFrames = 60 * 600, chunk = 300, render = true, human = false } = {}) => {
    const { createBot } = await import("./bot.mjs");
    window.__dm.setBot(null);
    window.__dm.play(id);
    await y();
    const world = window.__dm.world();
    const realRender = world.render;
    if (!render) world.render = () => {};
    const bot = createBot({ seed: id, human });
    window.__dm.setBot(bot);
    let f = 0, deaths = 0;
    while (f < maxFrames) {
      const ov = window.__dm.overlay();
      if (ov === "complete" || window.__dm.screen() === "victory") break;
      if (ov === "dead") {
        deaths++;
        window.__dm.play(id);
        await y();
        window.__dm.setBot(createBot({ seed: id + deaths }));
      }
      for (let i = 0; i < chunk; i++) {
        window.__dm.advance(1);
        // answer keypads with the level's code (the bot has "read" the notes) and close notes
        const sb = window.__dm.sub();
        if (sb && sb.keypad) window.__dm.kpType(sb.keypad.code);
        else if (sb && sb.note) window.__dm.closeSub();
      }
      f += chunk;
      await y();
      // a keypad shows its result for a moment before closing: wait in real time, not frames
      if (window.__dm.sub()) await new Promise((r) => setTimeout(r, 120));
    }
    window.__dm.setBot(null);
    world.render = realRender;
    for (let i = 0; i < 5; i++) window.__dm.advance(1);
    const S = window.__dm.sim();
    return { overlay: window.__dm.overlay(), screen: window.__dm.screen(), frames: f, deaths, kills: S?.stats.kills, status: S?.status };
  };
  return !!window.__dm;
}
