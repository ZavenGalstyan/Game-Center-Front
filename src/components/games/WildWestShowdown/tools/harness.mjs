/**
 * DEV-only browser harness (not imported by the game). On a dev page opened
 * with `?wwstest=1` (add `&nosave=1` to keep saves in memory), run:
 *   await (await import('/src/components/games/WildWestShowdown/tools/harness.mjs')).setup()
 * Mounts <GamePlayer><GameRenderer name="Wild West: Card Showdown"> inside
 * React.StrictMode with working Restart / Mute, plus helpers:
 *   __btn(text) · __lang('en'|'ru') · __wait(cond, ms) · __texts() (all visible UI text)
 *   await __autoplay({ hands, style }) — plays the human seat through the REAL
 *   betting buttons (style: 'calling' | 'aggressive' | 'smart')
 */
export async function setup({ silent = true, width = 1200, game = "Wild West: Card Showdown" } = {}) {
  window.__errs = [];
  window.addEventListener("error", (e) => window.__errs.push(String(e.message)));
  window.addEventListener("unhandledrejection", (e) => window.__errs.push(String(e.reason?.stack || e.reason)));
  if (silent) {
    const { audio } = await import("../audio.js");
    audio.unlock = () => {};
  }
  const urls = performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /\.vite\/deps\/(react|react-dom_client)\.js/.test(n));
  const R = await import(urls.find((u) => /deps\/react\.js/.test(u)));
  const RD = await import(urls.find((u) => /react-dom_client/.test(u)));
  const GP = (await import("/src/components/game/GamePlayer.jsx")).default;
  const GR = (await import("/src/components/games/GameRenderer.jsx")).default;
  const i18n = await import("/src/i18n/i18n.js");
  const React = R.default || R;
  const createRoot = RD.createRoot || RD.default.createRoot;
  document.body.innerHTML = `<div id="h" style="width:${width}px;padding:10px"></div>`;
  const root = createRoot(document.getElementById("h"));
  const st = { muted: false, nonce: 0, game, show: true };
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
  window.__wait = async (cond, ms = 30000) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      try {
        if (cond()) return true;
      } catch {
        /* not ready */
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  };
  await window.__wait(() => window.__wws?.start, 60000);
  window.__lang = (l) => i18n.setLanguage(l);
  window.__btn = (text) => {
    const all = [...document.querySelectorAll(".wws button")];
    const b = all.find((x) => x.textContent.trim() === text) || all.find((x) => x.textContent.includes(text));
    b?.click();
    return !!b;
  };
  window.__texts = () => {
    const out = new Set();
    const walk = (n) => {
      if (n.nodeType === 3) {
        const t = n.textContent.trim();
        if (t && n.parentElement && getComputedStyle(n.parentElement).visibility !== "hidden") out.add(t);
      } else if (n.nodeType === 1 && getComputedStyle(n).display !== "none") for (const c of n.childNodes) walk(c);
    };
    const r = document.querySelector(".wws");
    if (r) walk(r);
    return [...out];
  };
  /** Plays the human seat via the real buttons until `hands` hands finished or the match ends. */
  window.__autoplay = async ({ hands = 5, style = "calling", maxMs = 600000 } = {}) => {
    const W = window.__wws;
    const t0 = performance.now();
    const startHand = W.match()?.table.handNo || 0;
    while (performance.now() - t0 < maxMs) {
      const m = W.match();
      if (!m || W.screen() !== "play" || m.done) break;
      if (m.table.handNo - startHand >= hands && m.table.phase === "complete") break;
      const la = W.la();
      if (la) {
        let label;
        if (style === "aggressive" && (la.canBet || la.canRaise) && Math.random() < 0.5) label = ".wws-btn--raise";
        else if (style === "smart") {
          const eq = document.querySelector(".wws-meter__txt")?.textContent;
          const pct = eq ? parseInt(eq, 10) : 50;
          if (pct > 65 && (la.canBet || la.canRaise)) label = ".wws-btn--raise";
          else if (la.canCheck) label = ".wws-actions__row .wws-btn:nth-child(2)";
          else if (pct > 35 || la.toCall <= m.table.blinds.bb) label = ".wws-actions__row .wws-btn:nth-child(2)";
          else label = ".wws-btn--fold";
        } else label = ".wws-actions__row .wws-btn:nth-child(2)";
        const b = document.querySelector(label);
        if (b && !b.disabled) b.click();
        else document.querySelector(".wws-btn--fold")?.click();
        await new Promise((r) => setTimeout(r, 120));
      } else {
        if (document.querySelector(".wws-banner .wws-btn")) W.next();
        await new Promise((r) => setTimeout(r, 80));
      }
    }
    return { hands: (W.match()?.table.handNo || 0) - startHand, screen: W.screen(), done: W.match()?.done, result: W.match()?.result };
  };
  return true;
}
