/**
 * DEV-only browser harness (not imported by the game). On a dev page opened
 * with `/?fftest=1` (+`&nosave=1` keeps progress in memory, `&ffmanual=1`
 * stops the rAF loop so `__ff.advance(frames)` drives time), run:
 *   await (await import('/src/components/games/FeatherFury/tools/harness.mjs')).setup()
 * Mounts <GamePlayer><GameRenderer name="Feather Fury: Island Siege"> in
 * React.StrictMode with working Restart / Mute and adds:
 *   __ptr(type, sx, sy)       real PointerEvent on the stage (CSS px in the stage)
 *   __screenOf(x, y)          world → stage px
 *   __drag(shot)              aims and releases with real pointer events ({a, p} as in solve.mjs)
 *   __replay(id)              plays the stored tools/solutions.json shots through the engine API
 *   __verify(id)              proves the level winnable in this browser's own physics
 *   __btn(text) · __key(code) · __st (mount state) · __mount()
 * The game itself exposes window.__ff (see FeatherFury.jsx).
 */
export async function setup({ width = 1280 } = {}) {
  const urls = performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /\.vite\/deps\/(react|react-dom_client)\.js/.test(n));
  const R = await import(urls.find((u) => /deps\/react\.js/.test(u)));
  const RD = await import(urls.find((u) => /react-dom_client/.test(u)));
  const GP = (await import("/src/components/game/GamePlayer.jsx")).default;
  const GR = (await import("/src/components/games/GameRenderer.jsx")).default;
  const React = R.default || R;
  const createRoot = RD.createRoot || RD.default.createRoot;
  document.body.innerHTML = `<div id="h" style="width:${width}px;padding:10px"></div>`;
  const root = createRoot(document.getElementById("h"));
  const st = { muted: true, nonce: 0, game: "Feather Fury: Island Siege", show: true };
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
  window.__ptr = (type, sx, sy, id = 1) => {
    const stage = document.querySelector(".ff-stage");
    const r = stage.getBoundingClientRect();
    stage.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: r.left + sx, clientY: r.top + sy, bubbles: true, cancelable: true, button: 0, pointerType: "touch", isPrimary: true }));
  };
  window.__screenOf = (x, y) => {
    const v = window.__ff.view;
    return { x: (x - v.camX) * v.zoom, y: (y - v.camY) * v.zoom };
  };
  window.__drag = ({ a, p }) => {
    const { SLING, MAX_PULL } = window.__ffConst;
    const s0 = window.__screenOf(SLING.x, SLING.y);
    const px = -Math.cos((a * Math.PI) / 180) * p * MAX_PULL, py = Math.sin((a * Math.PI) / 180) * p * MAX_PULL;
    const s1 = window.__screenOf(SLING.x + px, SLING.y + py);
    window.__ptr("pointerdown", s0.x, s0.y);
    for (let i = 1; i <= 5; i++) window.__ptr("pointermove", s0.x + ((s1.x - s0.x) * i) / 5, s0.y + ((s1.y - s0.y) * i) / 5);
    window.__ptr("pointerup", s1.x, s1.y);
  };
  window.__ffConst = await import("../engine/game.js");
  window.__replay = async (id) => {
    const sol = (await (await fetch("/src/components/games/FeatherFury/tools/solutions.json")).json())[id];
    const E = window.__ffConst;
    window.__ff.play(id);
    const g = window.__ff.game();
    g.__replay = true;
    for (const s of sol.shots) {
      const pull = { x: -Math.cos((s.a * Math.PI) / 180) * s.p * E.MAX_PULL, y: Math.sin((s.a * Math.PI) / 180) * s.p * E.MAX_PULL };
      E.launch(g, pull);
      for (let i = 0; i < 900 && g.state === "flying"; i++) {
        if (i === s.tap) E.triggerAbility(g);
        E.step(g);
      }
      E.runUntilIdle(g);
    }
    return { state: g.state, score: g.score, stars: g.result?.stars, expected: sol };
  };
  /**
   * Winnability in THIS browser's physics: replays the stored solution through
   * the engine; if the JS engine's last-bit Math.cos/sin differences made the
   * collapse play out differently and the level isn't won, it searches the
   * remaining birds greedily (same grid as tools/solve.mjs) until it wins.
   */
  window.__verify = async (id) => {
    const { play } = await import("./replay.mjs");
    const { LEVELS } = await import("../data/levels.js");
    const sol = (await (await fetch("/src/components/games/FeatherFury/tools/solutions.json")).json())[id];
    const def = LEVELS[id - 1];
    let shots = sol.shots.slice();
    let r = play(def, shots);
    if (r.won) return { id, won: true, exact: r.score === sol.score, shots: shots.length };
    // drop shots after the one that left birds unused, then search on
    while (shots.length < def.birds.length) {
      let best = null;
      for (let a = -6; a <= 75; a += 3) {
        for (const p of [0.5, 0.6, 0.7, 0.8, 0.88, 0.94, 1]) {
          const base = { a, p, tap: -1 };
          const c = [{ ...base, r: play(def, [...shots, base]) }];
          if (def.birds[shots.length] !== "red" && c[0].r.touch > 4) {
            for (const d of [3, 8, 15, 25]) if (c[0].r.touch - d > 3) c.push({ a, p, tap: c[0].r.touch - d, r: play(def, [...shots, { a, p, tap: c[0].r.touch - d }]) });
          }
          for (const x of c) if (!best || x.r.won > best.r.won || (x.r.won === best.r.won && (x.r.kills > best.r.kills || (x.r.kills === best.r.kills && x.r.score > best.r.score)))) best = x;
        }
        await new Promise((res) => setTimeout(res, 0));
      }
      shots = [...shots, { a: best.a, p: best.p, tap: best.tap }];
      r = best.r;
      if (r.won) break;
    }
    return { id, won: r.won, exact: false, shots: shots.length, birds: def.birds.length, score: r.score };
  };
  const t0 = performance.now();
  while (!window.__ff && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 50));
  return window.__ff?.screen();
}
