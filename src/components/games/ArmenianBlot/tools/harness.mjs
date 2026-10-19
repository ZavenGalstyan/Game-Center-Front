/**
 * DEV-only browser harness (not imported by the game). On a dev page opened
 * with `?abtest=1` (add `&nosave=1` to keep localStorage untouched), run:
 *   await (await import('/src/components/games/ArmenianBlot/tools/harness.mjs')).setup()
 * It mounts <GamePlayer><GameRenderer name="Armenian Blot Heritage"> inside
 * React.StrictMode with working Restart / Mute and exposes:
 *   __y() (yield) · __click(text) · __st (mount state) · __ab (game hooks)
 *   __drive(n) — runs n automatic steps (AI turns, collections) without timers
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
  const st = { muted: false, nonce: 0, game: "Armenian Blot Heritage", show: true };
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
  while (!window.__ab && performance.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 100));
  window.__y = y;
  window.__click = (text, scope = ".ab") => {
    const b = [...document.querySelectorAll(`${scope} button`)].find((x) => x.textContent.trim().toLowerCase().includes(text.toLowerCase()) && !x.disabled);
    if (b) b.click();
    return !!b;
  };
  window.__drive = async (n = 1) => {
    let done = 0;
    for (let k = 0; k < n; k++) {
      if (!window.__ab.runNext()) break;
      done++;
      await y(); await y();
    }
    return done;
  };
  return { ok: !!window.__ab };
}
