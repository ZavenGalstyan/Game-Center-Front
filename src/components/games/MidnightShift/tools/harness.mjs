/**
 * DEV-only browser harness (not imported by the game). On a dev page opened
 * with `?mstest=1` (no rAF; window.__ms), run in the console:
 *   await (await import('/src/components/games/MidnightShift/tools/harness.mjs')).setup()
 * Mounts <GamePlayer><GameRenderer name="Midnight Shift: Haunted Factory">
 * inside React.StrictMode with working Restart / Mute. Helpers:
 *   __btn(text) · __q(selector) · __y() (MessageChannel yield) · __key(code)
 *   __bot(opts) → the tools/bot.mjs player bound to the live night
 *   __drive(bot, seconds) — run the night through the real frame loop with the bot
 */
export async function setup({ silent = true, width = 1280 } = {}) {
  if (silent) {
    const { audio } = await import("../audio.js");
    audio.setMuted(true);
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
  const st = { muted: false, nonce: 0, game: "Midnight Shift: Haunted Factory", show: true };
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
  while (/mstest/.test(location.search) && !window.__ms?.start && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 100));
  window.__y = y;
  window.__q = (s) => document.querySelector(s);
  window.__key = (code, type = "keydown") => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
  window.__btn = (text) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes(text) || x.getAttribute("aria-label")?.includes(text));
    b?.click();
    return !!b;
  };
  window.__bot = async (opts) => {
    const { createBot } = await import("./bot.mjs");
    return createBot(window.__ms.game(), opts);
  };
  /** run `seconds` of the live night (real frame loop) with a bot reading the same events the UI does */
  window.__drive = (bot, seconds = 10, dt = 1 / 30) => {
    const g = window.__ms.game();
    const orig = g.takeEvents;
    g.takeEvents = () => {
      const e = orig();
      bot.onEvents(e);
      return e;
    };
    for (let s = 0; s < seconds && window.__ms.screen() === "play"; s += dt) {
      window.__ms.advance(1, dt);
      bot.step(dt);
    }
    g.takeEvents = orig;
    return { phase: g.phase, screen: window.__ms.screen(), t: g.t, power: g.power };
  };
  return !!window.__ms;
}
