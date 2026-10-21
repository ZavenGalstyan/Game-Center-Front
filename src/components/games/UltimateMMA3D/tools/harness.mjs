/**
 * DEV-only browser harness (not imported by the game). On a dev page opened
 * with `?umctest=1` (+`&nosave=1` keeps saves in memory), run:
 *   await (await import('/src/components/games/UltimateMMA3D/tools/harness.mjs')).setup()
 * Mounts <GamePlayer><GameRenderer name="Ultimate MMA Championship 3D"> in
 * React.StrictMode with working Restart / Mute and adds:
 *   __key(code, type) · __tap(code) · __btn(text) · __y() (yield) · __st (mount state)
 * Audio is stubbed out unless setup({ silent: false }).
 * The game exposes window.__umc (advance(frames, dt), match(), world(), …).
 */
export async function setup({ width = 1280, silent = true } = {}) {
  if (silent) {
    // tests run silently: no AudioContext is ever created
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
  const st = { muted: false, nonce: 0, game: "Ultimate MMA Championship 3D", show: true };
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
  window.__y = y;
  window.__key = (code, type = "keydown") => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
  window.__tap = (code) => {
    window.__key(code);
    window.__umc.advance(1);
    window.__key(code, "keyup");
  };
  window.__btn = (text) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes(text));
    if (b) b.click();
    return !!b;
  };
  const t0 = performance.now();
  while (window.__umc?.screen() !== "menu" && performance.now() - t0 < 30000) {
    window.__umc?.advance(1);
    await new Promise((r) => setTimeout(r, 50));
  }
  return window.__umc?.screen();
}
