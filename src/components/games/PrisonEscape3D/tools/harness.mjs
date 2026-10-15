/**
 * DEV-only browser harness (not imported by the game). On a dev page opened
 * with `?petest=1&nosave=1`, run in the console:
 *   await (await import('/src/components/games/PrisonEscape3D/tools/harness.mjs')).setup()
 * It mounts <GamePlayer><GameRenderer name="Prison Escape 3D"> (the game isn't
 * in the backend yet) inside React.StrictMode and adds helpers that drive the
 * REAL input handlers:
 *   __key(code, type) · __mouse(dx, dy) · __E() · __aim(key) · __y()
 *   __drive(scriptName | tasks, {maxFrames}) — runs the route bot through the
 *   live component (keys + look go through the same refs the mouse/keyboard use).
 * `silent` stubs out the AudioContext (sound in the automation tab can stall
 * screenshots).
 */
export async function setup({ silent = true, width = 1200 } = {}) {
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
  const st = { muted: false, nonce: 0, game: "Prison Escape 3D" };
  window.__mount = () =>
    root.render(React.createElement(React.StrictMode, null, React.createElement(GP, {
      title: "Prison Escape 3D", muted: st.muted,
      onToggleMute: () => { st.muted = !st.muted; window.__mount(); },
      onRestart: () => { st.nonce++; window.__mount(); },
    }, React.createElement(GR, { game: { name: st.game }, muted: st.muted, restartNonce: st.nonce }))));
  window.__st = st;
  window.__mount();
  const y = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage(0); });
  const t0 = performance.now();
  while (!window.__pe && performance.now() - t0 < 15000) await new Promise((r) => setTimeout(r, 100));
  window.__y = y;
  window.__key = (code, type = "keydown") => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  window.__mouse = (dx, dy) => document.dispatchEvent(new MouseEvent("mousemove", { movementX: dx, movementY: dy }));
  window.__E = () => {
    window.__key("KeyE");
    window.__pe.advance(1);
    window.__key("KeyE", "keyup");
    window.__pe.advance(2);
  };
  const { createBot, SCRIPTS } = await import("./bot.mjs");
  const { yawTo } = await import("../sim.js");
  window.__aim = (key) => {
    const g = window.__pe.game();
    const it = g.interactables().find((i) => i.key === key);
    if (!it) return "missing " + key;
    const p = g.player;
    window.__pe.look.yaw = yawTo(p.x, p.z, it.x, it.z);
    window.__pe.look.pitch = Math.atan2(it.y - g.eyeHeight(), Math.hypot(it.x - p.x, it.z - p.z));
    window.__pe.advance(20);
    return [window.__pe.target()?.key, document.querySelector(".pe-prompt span")?.textContent];
  };
  /** Drives the bot through the live component; returns a summary. */
  window.__drive = async (script, { maxFrames = 60 * 60 * 12, stopAt = null } = {}) => {
    const g = window.__pe.game();
    const tasks = typeof script === "string" ? SCRIPTS[script] : script;
    const bot = createBot(g, tasks, { log: (l) => console.log("[bot]", l) });
    const K = window.__pe.keys;
    let caught = 0;
    for (let i = 0; i < maxFrames && !bot.state.done; i++) {
      const input = bot.frame(1 / 60);
      window.__pe.look.yaw = g.player.yaw;
      window.__pe.look.pitch = g.player.pitch || 0;
      for (const [k, code] of [["f", "KeyW"], ["b", "KeyS"], ["l", "KeyA"], ["r", "KeyD"], ["sprint", "ShiftLeft"]]) {
        if (input[k]) K.add(code);
        else K.delete(code);
      }
      if (g.channel) K.add("KeyE"); // hold E through hold-interactions, like a player
      else K.delete("KeyE");
      // the component reads panels from React state; the bot answered them in-sim, so close any that opened
      if (window.__pe.panel && window.__pe.panel.type !== "restart") window.__pe.closePanel?.(true);
      const before = g.timesCaught;
      window.__pe.advance(1);
      if (g.timesCaught > before) caught++;
      if (stopAt && stopAt(g)) break;
      if (i % 240 === 0) await y();
    }
    K.clear();
    return { done: bot.state.done, failed: bot.state.failed, mission: g.mission, caught, ended: !!g.ended, pos: [g.player.x.toFixed(1), g.player.z.toFixed(1)] };
  };
  window.__pe.fit();
  return "ready";
}
