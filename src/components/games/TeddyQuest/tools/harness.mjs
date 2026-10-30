/**
 * DEV-only browser harness (not imported by the game). On a dev page opened
 * with `?tqtest=1` (+`&nosave=1` keeps saves in memory), run:
 *   await (await import('/src/components/games/TeddyQuest/tools/harness.mjs')).setup()
 * Mounts <GamePlayer><GameRenderer name="Teddy Quest: Magical Kingdom"> in
 * React.StrictMode with working Restart / Mute and adds:
 *   __key(code, type) · __btn(text) · __st (mount state) · __remount()
 * The game itself exposes window.__tq (see TeddyQuest.jsx).
 */
export async function setup({ width = 1280, silent = true } = {}) {
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
  const st = { muted: false, nonce: 0, game: "Teddy Quest: Magical Kingdom", show: true };
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
  window.__key = (code, type = "keydown") => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
  window.__btn = (text) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes(text) && !x.disabled);
    if (b) b.click();
    return !!b;
  };
  const t0 = performance.now();
  while (!window.__tq && performance.now() - t0 < 60000) await new Promise((r) => setTimeout(r, 50));
  return window.__tq?.screen();
}
