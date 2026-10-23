/**
 * DEV-only browser harness (not imported by the game). On a dev page opened
 * with `?srtest=1`, run in the console:
 *   await (await import('/src/components/games/SpiderRoyale/tools/harness.mjs')).setup()
 * Mounts <GamePlayer><GameRenderer name="Spider Royale"> in StrictMode with
 * working Restart / Mute and exposes __y() (yield), __click(text), __sr.
 */
export async function setup({ width = 1200 } = {}) {
  const urls = performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /\.vite\/deps\/(react|react-dom_client)\.js/.test(n));
  const R = await import(urls.find((u) => /deps\/react\.js/.test(u)));
  const RD = await import(urls.find((u) => /react-dom_client/.test(u)));
  const GP = (await import("/src/components/game/GamePlayer.jsx")).default;
  const GR = (await import("/src/components/games/GameRenderer.jsx")).default;
  const React = R.default || R;
  const createRoot = RD.createRoot || RD.default.createRoot;
  document.body.innerHTML = `<div id="h" style="width:${width}px;padding:10px"></div>`;
  const root = createRoot(document.getElementById("h"));
  const st = { muted: true, nonce: 0, game: "Spider Royale" };
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
  while (!window.__sr && performance.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 100));
  window.__y = y;
  window.__click = (text) => {
    const b = [...document.querySelectorAll(".sr button")].find((x) => x.textContent.trim().toLowerCase().startsWith(text.toLowerCase()) && !x.disabled);
    if (b) b.click();
    return !!b;
  };
  return !!window.__sr;
}
