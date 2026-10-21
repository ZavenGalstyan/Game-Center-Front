/**
 * DEV-only browser harness (not imported by the game). On a dev page opened
 * with `?m6test=1&nosave=1`, run:
 *   await (await import('/src/components/games/Motel6LastGuest/tools/harness.mjs')).setup()
 * Mounts <GamePlayer><GameRenderer name="Motel 6: Last Guest"> in StrictMode
 * with working Restart / Mute, then adds:
 *   __y() yield · __btn(text) click a button by label · __key(code, type)
 *   __play(policy) drive the CURRENT night through the real UI handlers
 *   (policy: "perfect" | "acceptAll"), returns when the night ends.
 */
export async function setup({ silent = true, width = 1280 } = {}) {
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
  const st = { muted: false, nonce: 0, game: "Motel 6: Last Guest" };
  window.__mount = () =>
    root.render(
      React.createElement(React.StrictMode, null,
        React.createElement(GP, {
          title: st.game, muted: st.muted,
          onToggleMute: () => { st.muted = !st.muted; window.__mount(); },
          onRestart: () => { st.nonce++; window.__mount(); },
        }, React.createElement(GR, { game: { name: st.game }, muted: st.muted, restartNonce: st.nonce }))));
  window.__st = st;
  window.__mount();
  const y = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage(0); });
  const t0 = performance.now();
  while (!window.__m6?.newGame && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 100));
  window.__y = y;
  window.__key = (code, type = "keydown") => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
  window.__btn = (text) => {
    const b = [...document.querySelectorAll(".m6 button")].find((x) => x.textContent.includes(text) && !x.disabled);
    if (b) b.click();
    return !!b;
  };
  /** Play the current night through the UI handlers. */
  window.__play = async (policy = "perfect", { evidence = true, final = "reject" } = {}) => {
    Object.assign(run, { policy, evidence, final });
    const M = window.__m6;
    const log = [];
    // software-GL headless Chrome is slow: skip drawing while fast-forwarding
    const draw = M.world.render;
    M.world.render = () => {};
    try { return await run(M, log); } finally { M.world.render = draw; }
  };
  const run = async (M, log) => {
    const policy = run.policy, evidence = run.evidence, final = run.final;
    for (let guard = 0; guard < 600; guard++) {
      await y(); await y();
      const s = M.gs();
      if (!s) break;
      if (M.screen() !== "game" || s.phase === "summary" || s.phase === "failed" || s.phase === "ended") break;
      if (s.phase === "intro") { M.beginShift(); continue; }
      const st = M.step();
      const c = M.call();
      if (c) { c.idx < 0 ? M.answerCall() : M.nextLine(); continue; }
      if (!st) continue;
      if (st.t === "note") { M.closeNote(); continue; }
      if (st.t === "fx") { M.advance(5); await new Promise((r) => setTimeout(r, 1300)); continue; }
      if (st.t === "task") {
        if (st.flag === "power") M.doInteract("breaker");
        else M.doInteract("door5");
        continue;
      }
      const e = M.enc();
      if (!e) continue;
      if (e.phase === "waiting") {
        if (evidence) {
          for (const p of ["drawer", "brochures", "photo", "key5", "diary"]) if (M.E.propVisible(s, p)) { M.doInteract(p); await y(); M.setDoc(null); await y(); }
          if (M.E.propVisible(M.gs(), "lockbox")) { M.doInteract("lockbox"); await y(); M.tryCode("1031"); await y(); M.setDoc(null); }
          if (M.gs().flags["n:door13"] && !M.gs().evidence.includes("c_tape")) { M.openCCTV(); await y(); M.switchCam(2); await y(); M.advance(2); M.doCapture(); await y(); M.setDoc(null); M.exitCCTV(); }
        }
        M.callGuest(); continue;
      }
      if (e.phase === "arriving") { M.advance(20, 0.05); continue; }
      if (e.phase === "leaving" || e.phase === "finale") { M.advance(20, 0.05); continue; }
      if (e.phase === "talk") {
        const g = M.GUESTS[e.id];
        M.toggleId(); await y(); M.togglePanel("terminal"); await y();
        for (const q of ["purpose", "dob", "word", "code"]) M.ask(q);
        if (e.final) {
          if (evidence) { M.openCCTV(); await y(); M.switchCam(0); await y(); M.advance(2); M.doCapture(); await y(); M.setDoc(null); M.exitCCTV(); await y(); }
          const crit = M.E.criticalCount(M.gs());
          M.finalDecision(final === "name" && crit === 7 ? "name" : final);
          log.push({ final, crit });
          await new Promise((r) => setTimeout(r, 5000));
          break;
        }
        const v = M.E.checkGuest(g, s.night);
        const d = policy === "acceptAll" ? "accept" : v.length ? "reject" : "accept";
        M.decide(d, v[0]?.rule || null);
        log.push(`${g.id}:${d}`);
        continue;
      }
    }
    return log;
  };
  return "ok";
}
