/**
 * DEV-only browser harness (not imported by the game). On a dev page opened
 * with `?e100test=1`, run in the console:
 *   await (await import('/src/components/games/Escape100/tools/harness.mjs')).setup()
 * Mounts <GamePlayer><GameRenderer name="Escape 100: Mystery Doors"> in StrictMode with
 * working Restart / Mute and exposes __y() (yield), __click(text), __e100.
 */
export async function setup({ width = 1200 } = {}) {
  const urls = performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /\.vite\/deps\/(react|react-dom_client)\.js/.test(n));
  const R = await import(urls.find((u) => /deps\/react\.js/.test(u)));
  const RD = await import(urls.find((u) => /react-dom_client/.test(u)));
  const GP = (await import("/src/components/game/GamePlayer.jsx")).default;
  const GR = (await import("/src/components/games/GameRenderer.jsx")).default;
  const React = R.default || R;
  const createRoot = RD.createRoot || RD.default.createRoot;
  document.body.innerHTML = `<div id="h" style="width:${width}px;padding:10px"></div>`; document.body.style.margin = "0";
  const root = createRoot(document.getElementById("h"));
  const st = { muted: true, nonce: 0, game: "Escape 100: Mystery Doors" };
  window.__mount = () =>
    root.render(React.createElement(React.StrictMode, null, React.createElement(GP, {
      title: st.game, muted: st.muted,
      onToggleMute: () => { st.muted = !st.muted; window.__mount(); },
      onRestart: () => { st.nonce++; window.__mount(); },
    }, React.createElement(GR, { game: { name: st.game }, muted: st.muted, restartNonce: st.nonce }))));
  window.__st = st;
  window.__mount();
  const y = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage(0); });
  const t0 = performance.now();
  while (!window.__e100 && performance.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 100));
  window.__y = y;
  window.__click = (text) => {
    const b = [...document.querySelectorAll(".e100 button")].find((x) => x.textContent.trim().toLowerCase().startsWith(text.toLowerCase()) && !x.disabled);
    if (b) b.click();
    return !!b;
  };
  return !!window.__e100;
}

/**
 * Plays a level's reference solution through the REAL UI: canvas clicks at the
 * projected screen position of each object (raycast picking), inventory and
 * keypad/wires buttons in the DOM. Resolves { ok, step, why, overlay }.
 */
export async function solveUI(id, { slow = 1 } = {}) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms * slow));
  const G = new Proxy({}, { get: (_, k) => window.__e100[k] }); // hooks are re-created every render
  G.play(id);
  await sleep(700);
  const L = G.L();
  const cv = document.querySelector(".e100-canvas");
  const pt = (x, y, type) => cv.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true, pointerType: "mouse", isPrimary: true }));
  const clickAt = (p) => (pt(p.x, p.y, "pointerdown"), pt(p.x, p.y, "pointerup"));
  const dom = (sel) => {
    const b = document.querySelector(sel);
    if (!b) throw new Error(`missing ${sel}`);
    b.click();
  };
  const closeOverlay = async () => {
    for (let k = 0; k < 3 && G.overlay(); k++) {
      const x = document.querySelector(".e100-panel .e100-x");
      if (x) x.click();
      await sleep(120);
    }
  };
  /** focus the camera on an object, then click it (or one of its parts) on the canvas */
  const clickObj = async (oid, part) => {
    G.world().focusOn(oid);
    await sleep(900);
    let p = G.world().project(oid, part);
    if (!p) throw new Error(`cannot project ${oid} (world room ${G.world().roomId}, level ${G.L()?.id}, mode ${G.world().mode}, screen ${G.screen()})`);
    const hit = G.world().pickAt(p.x, p.y);
    if (!hit || hit.oid !== oid || (part && hit.part !== part)) {
      // try a few nearby points (the centre can fall in a gap)
      let found = null;
      for (const [dx, dy] of [[0, -12], [0, 12], [-12, 0], [12, 0], [0, -24], [0, 24], [-20, -20], [20, 20]]) {
        const h = G.world().pickAt(p.x + dx, p.y + dy);
        if (h && h.oid === oid && (!part || h.part === part)) {
          found = { x: p.x + dx, y: p.y + dy };
          break;
        }
      }
      if (!found) throw new Error(`click on ${oid}${part ? "/" + part : ""} hits ${hit ? hit.oid + "/" + hit.part : "nothing"}`);
      p = found;
    }
    clickAt(p);
    await sleep(250);
  };
  const steps = L.solution;
  for (const [i, a] of steps.entries()) {
    try {
      const o = a.id ? L.objects.find((x) => x.id === a.id) : null;
      switch (a.a) {
        case "click":
          await clickObj(a.id);
          if (o.kind === "clue") await closeOverlay();
          break;
        case "take": {
          // tap the item itself if it's visible; tapping the open container reaches for its first item
          const first = G.gs().obj[a.id].contents[0] === a.item;
          try {
            await clickObj(a.id, "item:" + a.item);
          } catch (e) {
            if (!first) throw e;
            await clickObj(a.id);
          }
          if (!G.gs().inv.includes(a.item)) throw new Error(`did not get ${a.item}`);
          break;
        }
        case "use":
          dom(`.e100-item[data-item="${a.item}"]`);
          await sleep(150);
          await clickObj(a.id);
          break;
        case "combine":
          dom(`.e100-item[data-item="${a.x}"]`);
          await sleep(120);
          dom(`.e100-item[data-item="${a.y}"]`);
          await sleep(200);
          break;
        case "inspect":
          dom(`.e100-item[data-item="${a.item}"]`);
          await sleep(120);
          dom(`.e100-item[data-item="${a.item}"]`);
          await sleep(400);
          if (G.overlay() !== "inspect") throw new Error("inspect overlay did not open");
          await closeOverlay();
          break;
        case "code": {
          await clickObj(a.id);
          if (G.overlay() !== "keypad") throw new Error("keypad did not open");
          const sep = o.glyphs === "symbols" || o.glyphs === "colors" ? "," : "";
          const keys = sep ? a.v.split(",") : a.v.split("");
          for (const k of keys) {
            dom(`.e100-keypad [data-key="${k}"]`);
            await sleep(60);
          }
          dom(`.e100-keypad [data-key="ok"]`);
          await sleep(600);
          break;
        }
        case "press":
          await clickObj(a.id, a.b);
          break;
        case "rotate":
          await clickObj(a.id, "cell:" + a.cell);
          break;
        case "wire": {
          await clickObj(a.id);
          if (G.overlay() !== "wires") throw new Error("wires did not open");
          for (const [l, r] of Object.entries(a.map)) {
            dom(`.e100-wires [data-wire="${l}"]`);
            await sleep(60);
            dom(`.e100-wires [data-term="${r}"]`);
            await sleep(60);
          }
          dom(`.e100-wires [data-key="ok"]`);
          await sleep(400);
          break;
        }
        case "turn": {
          for (let k = 0; k < o.faces.length && G.gs().obj[a.id].value !== a.to; k++) await clickObj(a.id);
          if (G.gs().obj[a.id].value !== a.to) throw new Error(`dial ${a.id} did not reach ${a.to}`);
          break;
        }
        case "wait":
          await sleep(a.s * 1000);
          break;
        default:
          throw new Error(`unknown step ${a.a}`);
      }
      if (G.overlay() === "reader") await closeOverlay();
    } catch (e) {
      return { ok: false, step: i, action: a, why: e.message, overlay: G.overlay() };
    }
  }
  // exit sequence → victory overlay
  for (let k = 0; k < 40 && G.overlay() !== "win" && G.overlay() !== "final"; k++) await sleep(150);
  const gsEnd = G.gs();
  return { ok: G.overlay() === "win" || G.overlay() === "final", overlay: G.overlay(), won: gsEnd?.won, done: !!G.prog().done[id], state: gsEnd?.won ? undefined : JSON.stringify({ obj: gsEnd?.obj, inv: gsEnd?.inv }).slice(0, 600) };
}
