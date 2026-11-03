/**
 * DEV-only browser harness (not imported by the game). On a dev page opened
 * with `?c9test=1`, run in the console:
 *   await (await import('/src/components/games/Corridor9/tools/harness.mjs')).setup()
 * Mounts <GamePlayer><GameRenderer name="Corridor 9: Endless Passage">
 * inside React.StrictMode with working Restart / Mute, and adds helpers that
 * drive the REAL input handlers:
 *   __key(code, type) · __tap(code) · __mouse(dx, dy) · __btn(text) · __y()
 *   __bot({decide, sprint}) → step() — the tools/bot.mjs route bot bound to the live game
 *   __drive(bot, frames, stopOnDecision) — feed the bot through the real key handling + frame loop
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
  const React = R.default || R;
  const createRoot = RD.createRoot || RD.default.createRoot;
  document.body.innerHTML = `<div id="h" style="width:${width}px;padding:10px"></div>`;
  const root = createRoot(document.getElementById("h"));
  const st = { muted: false, nonce: 0, game: "Corridor 9: Endless Passage", show: true };
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
  while (/c9test/.test(location.search) && !window.__c9?.start && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 100));
  window.__y = y;
  window.__key = (code, type = "keydown") => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
  window.__tap = (code) => {
    window.__key(code);
    window.__c9.advance(1);
    window.__key(code, "keyup");
  };
  window.__mouse = (dx, dy) => document.dispatchEvent(new MouseEvent("mousemove", { movementX: dx, movementY: dy }));
  window.__btn = (text) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes(text));
    b?.click();
    return !!b;
  };
  window.__bot = async (opts) => {
    const { createBot } = await import("./bot.mjs");
    return createBot(window.__c9.game(), opts);
  };
  /** play `frames` frames driven by a bot through the real key handling + frame loop */
  window.__drive = (bot, frames = 600, stopOnDecision = false) => {
    const g = window.__c9.game();
    const k = window.__c9.keys;
    const n0 = g.history.length;
    for (let i = 0; i < frames && g.state === "play"; i++) {
      const inp = bot.step(1 / 60);
      k.clear();
      if (inp.f) k.add("KeyW");
      if (inp.sprint) k.add("ShiftLeft");
      window.__c9.advance(1);
      if (stopOnDecision && g.history.length > n0) break;
    }
    k.clear();
    return g.state;
  };
  return !!window.__c9;
}
