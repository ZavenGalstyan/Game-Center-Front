/**
 * DEV-only browser harness (not imported by the game). On a dev page opened
 * with `/?sftest=1`, run in the console:
 *   await (await import('/src/components/games/StrikeForce/tools/harness.mjs')).setup()
 * It mounts <GamePlayer><GameRenderer name="Strike Force: Elite Combat">
 * inside React.StrictMode with working Restart / Mute, plus:
 *   __y()              yield one macrotask (MessageChannel)
 *   __key(code, down)  real KeyboardEvents on window
 *   __click(text)      click the first button whose text/aria-label contains `text`
 *   __bot(on)          drive the player with the AI brain (engine/bot.js)
 */
export async function setup({ width = 1280 } = {}) {
  const urls = performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /\.vite\/deps\/(react|react-dom_client)\.js/.test(n));
  const R = await import(urls.find((u) => /deps\/react\.js/.test(u)));
  const RD = await import(urls.find((u) => /react-dom_client/.test(u)));
  const GP = (await import("/src/components/game/GamePlayer.jsx")).default;
  const GR = (await import("/src/components/games/GameRenderer.jsx")).default;
  const React = R.default || R;
  const createRoot = RD.createRoot || RD.default.createRoot;
  document.body.innerHTML = `<div id="h" style="width:${width}px;padding:10px"></div>`;
  const root = createRoot(document.getElementById("h"));
  const st = { muted: false, nonce: 0, game: "Strike Force: Elite Combat", show: true };
  window.__mount = () =>
    root.render(React.createElement(React.StrictMode, null, st.show ? React.createElement(GP, {
      title: st.game, muted: st.muted,
      onToggleMute: () => { st.muted = !st.muted; window.__mount(); },
      onRestart: () => { st.nonce++; window.__mount(); },
    }, React.createElement(GR, { game: { name: st.game }, muted: st.muted, restartNonce: st.nonce })) : null));
  window.__st = st;
  window.__mount();
  const y = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage(0); });
  window.__y = y;
  const t0 = performance.now();
  while (!(window.__sf && window.__sf.world) && performance.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 50));
  window.__key = (code, down = true) => window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, bubbles: true, cancelable: true }));
  window.__click = (text) => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").includes(text) || (x.getAttribute("aria-label") || "").includes(text));
    if (!b) return false;
    b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    b.click();
    return true;
  };
  const { createBrain, thinkBot } = await import("/src/components/games/StrikeForce/engine/bot.js");
  let botOn = false;
  window.__bot = (on = true) => {
    const sf = window.__sf;
    const M = sf.match();
    if (!M) return false;
    const P = M.player;
    if (on && !botOn) {
      P.brain = createBrain(P, M);
      P.brain.reset(P, M);
      const apply = sf.input.apply;
      sf.input.__origApply = apply;
      sf.input.apply = (inp, pl) => {
        thinkBot(pl, M, 1 / 120);
        sf.input.S.yaw = inp.yaw;
        sf.input.S.pitch = inp.pitch;
        inp.respawn = true;
      };
      botOn = true;
    } else if (!on && botOn) {
      P.brain = null;
      sf.input.apply = sf.input.__origApply;
      botOn = false;
    }
    return true;
  };
  return !!window.__sf;
}
