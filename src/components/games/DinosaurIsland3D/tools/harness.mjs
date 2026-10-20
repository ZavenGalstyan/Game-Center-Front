/**
 * DEV-only browser harness (not imported by the game). On a dev page opened
 * with `?ditest=1`, run in the console:
 *   await (await import('/src/components/games/DinosaurIsland3D/tools/harness.mjs')).setup()
 * It mounts <GamePlayer><GameRenderer name="Dinosaur Island 3D"> inside
 * React.StrictMode with working Restart / Mute, and adds helpers that drive
 * the REAL input handlers:
 *   __key(code, type) · __tap(code) · __mouse(dx, dy) · __click(button, type) · __y() (yield)
 *   __hold(code, frames) — hold a key while advancing frames
 *   __bot() — attach tools/bot.mjs as the input source (whole campaign)
 *   __btn(text) — click the first button whose label contains `text`
 * `silent` stubs out the AudioContext (sound in the automation tab can stall screenshots).
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
  const st = { muted: false, nonce: 0, game: "Dinosaur Island 3D", show: true };
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
  window.__mount();
  const y = () =>
    new Promise((r) => {
      const c = new MessageChannel();
      c.port1.onmessage = r;
      c.port2.postMessage(0);
    });
  const t0 = performance.now();
  while (!window.__di?.startGame && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 100));
  window.__y = y;
  window.__key = (code, type = "keydown") => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
  window.__tap = (code) => {
    window.__key(code);
    window.__di.advance(1);
    window.__key(code, "keyup");
  };
  window.__mouse = (dx, dy) => document.dispatchEvent(new MouseEvent("mousemove", { movementX: dx, movementY: dy }));
  window.__click = (button = 0, type = "mousedown") => {
    const el = document.querySelector(".di");
    el.dispatchEvent(new MouseEvent(type, { button, bubbles: true }));
  };
  window.__hold = (code, frames = 60) => {
    window.__key(code);
    window.__di.advance(frames);
    window.__key(code, "keyup");
  };
  window.__btn = (text) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes(text));
    if (b) b.click();
    return !!b;
  };
  window.__bot = async (opts = {}) => {
    const { createBot } = await import("./bot.mjs");
    const bot = createBot(() => window.__di.sim(), opts);
    window.__di.inputFn.current = () => bot.step();
    return bot;
  };
  window.__di.fit();
  return "ready";
}
