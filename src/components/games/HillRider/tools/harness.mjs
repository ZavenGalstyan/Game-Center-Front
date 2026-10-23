/**
 * DEV-only browser harness (not imported by the game). On a dev page opened
 * with `?hltest=1` (add `&hltouch=1` for the pedals), run in the console:
 *   await (await import('/src/components/games/HillRider/tools/harness.mjs')).setup()
 * Mounts <GamePlayer><GameRenderer name="Hill Rider"> in StrictMode with
 * working Restart / Mute and exposes __y() (yield), __click(text), __key(code, down),
 * __pedal(name, down) (real PointerEvents), __bot(on) and __hl.
 */
export async function setup({ width = 1200 } = {}) {
  const urls = performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /\.vite\/deps\/(react|react-dom_client)\.js/.test(n));
  const R = await import(urls.find((u) => /deps\/react\.js/.test(u)));
  const RD = await import(urls.find((u) => /react-dom_client/.test(u)));
  const GP = (await import("/src/components/game/GamePlayer.jsx")).default;
  const GR = (await import("/src/components/games/GameRenderer.jsx")).default;
  const { botInput } = await import("/src/components/games/HillRider/tools/bot.mjs");
  const React = R.default || R;
  const createRoot = RD.createRoot || RD.default.createRoot;
  document.body.innerHTML = `<div id="h" style="width:${width}px;padding:10px"></div>`;
  const root = createRoot(document.getElementById("h"));
  const st = { muted: true, nonce: 0, game: "Hill Rider" };
  window.__mount = () =>
    root.render(React.createElement(React.StrictMode, null, React.createElement(GP, {
      title: st.game, muted: st.muted,
      onToggleMute: () => { st.muted = !st.muted; window.__mount(); },
      onRestart: () => { st.nonce++; window.__mount(); },
    }, React.createElement(GR, { game: { name: st.game }, muted: st.muted, restartNonce: st.nonce }))));
  window.__st = st;
  window.__mount();
  const y = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage(0); });
  const t0 = performance.now();
  while (!window.__hl && performance.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 100));
  window.__y = y;
  window.__click = (text) => {
    const b = [...document.querySelectorAll(".hr button")].find((x) => x.textContent.trim().toLowerCase().startsWith(text.toLowerCase()) && !x.disabled);
    if (b) b.click();
    return !!b;
  };
  window.__key = (code, down = true) => window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, key: code, bubbles: true, cancelable: true }));
  window.__pedal = (name, down = true) => {
    const el = document.querySelector(`.hr-pedal--${name}`);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent(down ? "pointerdown" : "pointerup", { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 3, pointerType: "touch", bubbles: true, cancelable: true }));
    return true;
  };
  window.__bot = (on = true) => (window.__hl.driver = on ? (w) => { const i = botInput(w); return { kGas: !!i.gas, kBrake: !!i.brake }; } : null);
  return !!window.__hl;
}
