/**
 * DEV-only browser harness (not imported by the game). On a dev page opened
 * with `/?lhtest=1` (optionally `&nosave=1`, `&lhtouch=1`), run:
 *   await (await import('/src/components/games/LastHope/tools/harness.mjs')).setup()
 * It mounts <GamePlayer><GameRenderer name="Last Hope: Zombie Survival">
 * inside React.StrictMode with working Restart / Mute, plus:
 *   __key(code, down)  real KeyboardEvents on window
 *   __click(text)      click the first button whose text / aria-label contains `text`
 *   __adv(frames, dt)  window.__lhAdvance
 */
export async function setup({ width = 1280, height = 720 } = {}) {
  const urls = performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /\.vite\/deps\/(react|react-dom_client)\.js/.test(n));
  const R = await import(urls.find((u) => /deps\/react\.js/.test(u)));
  const RD = await import(urls.find((u) => /react-dom_client/.test(u)));
  const GP = (await import("/src/components/game/GamePlayer.jsx")).default;
  const GR = (await import("/src/components/games/GameRenderer.jsx")).default;
  const React = R.default || R;
  const createRoot = RD.createRoot || RD.default.createRoot;
  document.body.innerHTML = `<div id="h" style="width:${width}px;padding:0"></div>`;
  document.body.style.margin = "0";
  const root = createRoot(document.getElementById("h"));
  const st = { muted: false, nonce: 0, game: "Last Hope: Zombie Survival", show: true };
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
              React.createElement(GR, { game: { name: st.game }, muted: st.muted, restartNonce: st.nonce }),
            )
          : null,
      ),
    );
  window.__st = st;
  window.__mount();
  const t0 = performance.now();
  while (!(window.__lh && window.__lhAdvance && window.__lh.newGame) && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 50));
  // stretch the stage to the requested height
  const stage = document.querySelector(".game-player__stage");
  if (stage) stage.style.height = `${height}px`;
  window.__key = (code, down = true) => window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, bubbles: true, cancelable: true }));
  window.__click = (text) => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").includes(text) || (x.getAttribute("aria-label") || "").includes(text));
    if (!b) return false;
    b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    b.click();
    return true;
  };
  window.__adv = (f, dt) => window.__lhAdvance(f, dt);
  return !!window.__lh;
}
