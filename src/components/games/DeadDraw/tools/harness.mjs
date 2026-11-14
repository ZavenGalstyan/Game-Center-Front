/**
 * DEV-only browser harness (not imported by the game). On a dev page opened
 * with `?ddstest=1` (add `&nosave=1` to keep saves in memory), run:
 *   await (await import('/src/components/games/DeadDraw/tools/harness.mjs')).setup()
 * Mounts <GamePlayer><GameRenderer name="Dead Draw: Survival Bunker"> inside
 * React.StrictMode with working Restart / Mute, plus helpers:
 *   __btn(text) · __lang('en'|'ru') · __wait(cond, ms) · __texts() (all visible UI text)
 *   await __day({ pick }) — plays the current day through the REAL UI (card + choice clicks)
 */
export async function setup({ silent = true, width = 1100, game = "Dead Draw: Survival Bunker" } = {}) {
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
  await window.__wait(() => window.__dds?.start, 60000);
  window.__lang = (l) => i18n.setLanguage(l);
  window.__btn = (text) => {
    const all = [...document.querySelectorAll(".dds button")];
    const b = all.find((x) => x.textContent.trim() === text) || all.find((x) => x.textContent.includes(text));
    b?.click();
    return !!b;
  };
  window.__texts = () => {
    const out = new Set();
    const walk = (n) => {
      if (n.nodeType === 3) {
        const t = n.textContent.trim();
        if (t) out.add(t);
      } else if (n.nodeType === 1) {
        const cs = getComputedStyle(n);
        if (cs.display === "none" || cs.visibility === "hidden") return;
        for (const a of ["title", "aria-label", "alt"]) if (n.getAttribute(a)) out.add(n.getAttribute(a));
        for (const c of n.childNodes) walk(c);
      }
    };
    const root2 = document.querySelector(".game-player");
    if (root2) walk(root2);
    return [...out];
  };
  /** Play one day through the real UI: draw, click cards (pick(S) → hand index or -1), end, choose, night, next. */
  window.__day = async ({ pick = null, choice = null } = {}) => {
    const D = window.__dds;
    const idle = () => window.__wait(() => !D.busy, 60000);
    await idle();
    if (D.S.phase === "dawn") {
      if (!window.__btn("Draw cards")) document.querySelector(".dds-dawn .dds-btn")?.click();
      await window.__wait(() => D.S.phase === "play" && document.querySelectorAll(".dds-slot.shown").length === D.S.hand.length, 20000);
    }
    const { cardPlayable } = await import("../engine/game.js");
    for (let k = 0; k < 2 && D.S.phase === "play"; k++) {
      await idle();
      const S = D.S;
      let i = pick ? pick(S) : S.hand.findIndex((id) => cardPlayable(S, id));
      if (i < 0 || S.actions <= 0) break;
      const el = document.querySelectorAll(".dds-slot .dds-card")[i];
      el.click();
      await new Promise((r) => setTimeout(r, 80));
      document.querySelectorAll(".dds-slot .dds-card")[i]?.click();
      await window.__wait(() => D.S.actions < S.actions || D.S.phase !== "play", 60000);
    }
    await idle();
    if (D.S.phase === "play") document.querySelector(".dds-side .dds-btn")?.click();
    await window.__wait(() => D.S.phase !== "play", 60000);
    await window.__wait(() => D.S.phase !== "event" || D.revealed, 60000);
    if (D.S.phase === "event") {
      const btns = [...document.querySelectorAll(".dds-choice:not(:disabled)")];
      const b = (choice != null && btns[choice]) || btns[0];
      b.click();
      await window.__wait(() => D.S.phase !== "event", 15000);
    }
    if (D.S.phase === "aftermath") {
      document.querySelector(".dds-panel.outcome .dds-btn")?.click();
      await window.__wait(() => D.S.phase === "dusk" && !D.busy, 60000);
    }
    const res = { day: D.S.day, phase: D.S.phase, hp: D.S.res.hp };
    if (D.S.phase === "dusk") {
      document.querySelector(".dds-panel.outcome .dds-btn")?.click();
      await window.__wait(() => D.S.phase !== "dusk", 15000);
    }
    return res;
  };
  return !!window.__dds;
}
