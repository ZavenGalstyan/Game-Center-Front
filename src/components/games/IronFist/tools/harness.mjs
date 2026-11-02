/**
 * DEV-only browser harness (not imported by the game). On a dev page opened
 * with `?ifatest=1` (+`&nosave=1` keeps saves in memory), run:
 *   await (await import('/src/components/games/IronFist/tools/harness.mjs')).setup()
 * Mounts <GamePlayer><GameRenderer name="Iron Fist: Arena Champions"> in
 * React.StrictMode with working Restart / Mute and adds:
 *   __key(code, type) · __btn(text) · __st (mount state) · __mount()
 * The game exposes window.__ifa (world, match, session, keyboard, screen,
 * arcade(id, fighter), vs(a, b, arena), menu(), pause(v)…). In test mode the
 * world has no rAF loop: call __ifa.world.advance(frames, dt) to simulate+render.
 */
export async function setup({ width = 1280, silent = true } = {}) {
  if (silent) {
    const { audio } = await import("../audio.js");
    audio.unlock = () => {};
    audio.say = () => {};
  }
  const urls = performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /\.vite\/deps\/(react|react-dom_client)\.js/.test(n));
  const R = await import(urls.find((u) => /deps\/react\.js/.test(u)));
  const RD = await import(urls.find((u) => /react-dom_client/.test(u)));
  const GP = (await import("/src/components/game/GamePlayer.jsx")).default;
  const GR = (await import("/src/components/games/GameRenderer.jsx")).default;
  const React = R.default || R;
  const createRoot = RD.createRoot || RD.default.createRoot;
  document.body.innerHTML = `<div id="h" style="width:${width}px;padding:10px"></div><textarea id="comment" style="position:fixed;bottom:0;left:0;width:200px;height:40px"></textarea>`;
  const root = createRoot(document.getElementById("h"));
  const st = { muted: false, nonce: 0, game: "Iron Fist: Arena Champions", show: true };
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
  window.__key = (code, type = "keydown", target = window) => {
    const e = new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e.defaultPrevented;
  };
  window.__btn = (text) => {
    const b = [...document.querySelectorAll(".ifa button")].find((x) => x.textContent.trim().toLowerCase().includes(text.toLowerCase()));
    if (b) b.click();
    return !!b;
  };
  const t0 = performance.now();
  while (window.__ifa?.screen !== "menu" && performance.now() - t0 < 60000) await new Promise((r) => setTimeout(r, 100));
  window.__ifa?.world.advance(2);
  return window.__ifa?.screen;
}
