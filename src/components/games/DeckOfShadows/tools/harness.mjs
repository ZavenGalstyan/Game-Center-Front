/**
 * DEV-only browser harness (not imported by the game). On a dev page opened
 * with `?dostest=1` (add `&nosave=1` to keep saves in memory), run:
 *   await (await import('/src/components/games/DeckOfShadows/tools/harness.mjs')).setup()
 * Mounts <GamePlayer><GameRenderer name="Deck of Shadows: Monster Hunt"> inside
 * React.StrictMode with working Restart / Mute, plus helpers:
 *   __btn(text) · __y() · __lang('en'|'ru') · __wait(cond, ms)
 *   await __fight({maxTurns}) — plays the current battle through the REAL UI with tools/bot.mjs
 */
export async function setup({ silent = true, width = 1100 } = {}) {
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
  const st = { muted: false, nonce: 0, game: "Deck of Shadows: Monster Hunt", show: true };
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
  window.__root = root;
  window.__mount();
  const y = () =>
    new Promise((r) => {
      const c = new MessageChannel();
      c.port1.onmessage = r;
      c.port2.postMessage(0);
    });
  window.__y = y;
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
  await window.__wait(() => window.__dos?.start);
  window.__lang = (l) => i18n.setLanguage(l);
  window.__btn = (text) => {
    const all = [...document.querySelectorAll(".dos button")];
    const b = all.find((x) => x.textContent.trim() === text) || all.find((x) => x.textContent.includes(text));
    b?.click();
    return !!b;
  };
  /** Play the current battle through the real UI (card clicks + End Turn). */
  window.__fight = async ({ maxTurns = 60, skill = 1 } = {}) => {
    const { scoreCard } = await import("./bot.mjs");
    const { canPlay } = await import("../engine/combat.js");
    const D = window.__dos;
    let turns = 0;
    while (turns < maxTurns) {
      await window.__wait(() => !D.busy() && ["battle", "reward", "defeat", "ending"].includes(D.screen()), 60000);
      if (D.screen() !== "battle") break;
      if (D.tut() != null) D.skipTut();
      const S = D.state();
      if (!S || S.phase !== "player") {
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }
      const playable = S.hand.filter((h) => !canPlay(S, h.u));
      let best = null;
      let bv = 0;
      for (const h of playable) {
        const v = scoreCard(S, h) * (skill < 1 ? 1 + (Math.random() - 0.5) * (1 - skill) : 1);
        if (v > bv) {
          bv = v;
          best = h;
        }
      }
      if (best) {
        const el = document.querySelector(`.dos-slot[data-u="${best.u}"] .dos-card`);
        if (!el) {
          await new Promise((r) => setTimeout(r, 60));
          continue;
        }
        el.click();
      } else {
        const end = document.querySelector(".dos-end");
        if (!end || end.disabled) {
          await new Promise((r) => setTimeout(r, 60));
          continue;
        }
        end.click();
        turns++;
      }
      await new Promise((r) => setTimeout(r, 30));
    }
    await window.__wait(() => ["reward", "defeat", "ending"].includes(D.screen()), 30000);
    return { screen: D.screen(), turns, hp: D.state()?.P.hp, ehp: D.state()?.E.hp };
  };
  return !!window.__dos;
}
