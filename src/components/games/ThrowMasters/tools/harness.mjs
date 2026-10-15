/**
 * DEV-only browser harness (not imported by the game). On a dev page opened
 * with `?tmtest=1`, run in the console:
 *   await (await import('/src/components/games/ThrowMasters/tools/harness.mjs')).setup()
 * It mounts <GamePlayer><GameRenderer name="Throw Masters"> (the game isn't in
 * the backend yet) inside React.StrictMode with working Restart / Mute, plus:
 *   __y()                      yield one macrotask (MessageChannel)
 *   __drag(x0, y0, x1, y1)     real PointerEvents on the game root (world coords)
 *   __click(text)              click the first button whose text contains `text`
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
  const st = { muted: false, nonce: 0, game: "Throw Masters", show: true };
  window.__mount = () =>
    root.render(React.createElement(React.StrictMode, null, st.show ? React.createElement(GP, {
      title: st.game, muted: st.muted,
      onToggleMute: () => { st.muted = !st.muted; window.__mount(); },
      onRestart: () => { st.nonce++; window.__mount(); },
    }, React.createElement(GR, { game: { name: st.game }, muted: st.muted, restartNonce: st.nonce })) : null));
  window.__st = st;
  window.__mount();
  const y = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage(0); });
  window.__y = y;
  const t0 = performance.now();
  while (!window.__tm && performance.now() - t0 < 15000) await new Promise((r) => setTimeout(r, 50));
  window.__tm.fit();
  const toScreen = (x, y) => {
    const v = window.__tm.view;
    const b = window.__tm.battle();
    const cam = b ? b.cam : { x: 800, y: 450, zoom: 1 };
    const sc = v.s * cam.zoom;
    const r = document.querySelector(".tm").getBoundingClientRect();
    return { x: r.left + v.w / 2 + (x - cam.x) * sc, y: r.top + v.h / 2 + (y - cam.y) * sc };
  };
  window.__toScreen = toScreen;
  window.__drag = async (x0, y0, x1, y1, steps = 6) => {
    const el = document.querySelector(".tm");
    const a = toScreen(x0, y0);
    const b = toScreen(x1, y1);
    const ev = (type, p) => el.dispatchEvent(new PointerEvent(type, { clientX: p.x, clientY: p.y, pointerId: 1, pointerType: "mouse", button: 0, bubbles: true }));
    ev("pointerdown", a);
    for (let i = 1; i <= steps; i++) {
      ev("pointermove", { x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps });
      await y();
    }
    ev("pointerup", b);
    await y();
  };
  const { solveShot } = await import("../ai.js");
  const { MAX_DRAG } = await import("../battle.js");
  /** Aim the current human fighter with the solver and throw via a real drag (pull-back style). */
  window.__autoThrow = async (err = 0) => {
    const b = window.__tm.battle();
    if (!b || !b.canAim()) return "not aiming";
    const f = b.current;
    const enemy = b.fighters.find((o) => o !== f);
    let a;
    let p;
    if (enemy) {
      const s = solveShot(b.world, f, enemy, f.weapon).best;
      a = s.a;
      p = s.p;
    } else {
      const tg = b.world.targets.find((t) => t && t.alive);
      const fake = { side: 9, x: tg.x, y: tg.y + 14, dir: -1, k: 0.28, dead: false };
      const s = solveShot({ ...b.world, fighters: [fake], targets: null }, f, fake, f.weapon).best;
      a = s.a;
      p = s.p;
    }
    a += err * (Math.random() - 0.5) * 2;
    const rad = (a * Math.PI) / 180;
    const len = p * MAX_DRAG;
    const sx = f.x;
    const sy = f.y - 100;
    const pull = b.settings.aim === "pull" ? -1 : 1;
    await window.__drag(sx, sy, sx + pull * Math.cos(rad) * f.dir * len, sy - pull * Math.sin(rad) * len);
    return { a, p, aim: [f.aimAngle, f.aimPower] };
  };
  window.__click = async (text) => {
    const btn = [...document.querySelectorAll(".game-player button, .tm button")].find((b) => b.textContent.includes(text) && !b.disabled);
    if (!btn) return `no button "${text}"`;
    btn.click();
    await y();
    await y();
    return "ok";
  };
  return "ready";
}
