/**
 * DEV-only browser harness (not imported by the game). On a dev page opened
 * with `?drwtest=1&nosave=1`, run in the console:
 *   await (await import('/src/components/games/DollRepairWorkshop/tools/harness.mjs')).setup()
 * It mounts <GamePlayer><GameRenderer name="Doll Repair Workshop"> inside
 * React.StrictMode with working Restart / Mute and exposes:
 *   __y() (yield) · __click(text) (click a button by its label) · __drw (game hooks)
 *   __ptr(type, x, y, button) — real PointerEvents on the stage at NDC x,y
 * `silent` stubs out the AudioContext.
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
  const st = { muted: false, nonce: 0, game: "Doll Repair Workshop", show: true };
  window.__mount = () =>
    root.render(React.createElement(React.StrictMode, null, st.show ? React.createElement(GP, {
      title: st.game, muted: st.muted,
      onToggleMute: () => { st.muted = !st.muted; window.__mount(); },
      onRestart: () => { st.nonce++; window.__mount(); },
    }, React.createElement(GR, { game: { name: st.game }, muted: st.muted, restartNonce: st.nonce })) : null));
  window.__st = st;
  window.__mount();
  const y = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage(0); });
  const t0 = performance.now();
  while (!window.__drw && performance.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 100));
  window.__y = y;
  window.__click = (text) => {
    const b = [...document.querySelectorAll(".drw button")].find((x) => x.textContent.trim().toLowerCase().includes(text.toLowerCase()) && !x.disabled);
    if (b) b.click();
    return !!b;
  };
  window.__ptr = (type, x, y2, button = 0) => {
    const el = document.querySelector(".drw-stage");
    const r = el.getBoundingClientRect();
    const cx = r.left + ((x + 1) / 2) * r.width;
    const cy = r.top + ((1 - y2) / 2) * r.height;
    el.dispatchEvent(new PointerEvent(type, { clientX: cx, clientY: cy, button, buttons: type === "pointerup" ? 0 : 1, pointerId: 1, bubbles: true, pointerType: "mouse" }));
  };
  /** Snapshot of the game (canvas + HUD via SVG foreignObject) into localStorage('__drwshot'). */
  window.__snap = async (hud = true) => {
    window.__drw.advance(1);
    const root = document.querySelector(".drw");
    const r = root.getBoundingClientRect();
    const canvas = root.querySelector("canvas");
    const data = canvas.toDataURL("image/jpeg", 0.85);
    let out = data;
    if (hud) {
      let css = "";
      for (const sh of document.styleSheets) {
        try {
          for (const rule of sh.cssRules) if (rule.cssText.includes(".drw")) css += rule.cssText + "\n";
        } catch { /* cross-origin */ }
      }
      const clone = root.cloneNode(true);
      const img = document.createElement("img");
      img.src = data;
      img.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
      const stage = clone.querySelector(".drw-stage");
      stage.innerHTML = "";
      stage.appendChild(img);
      clone.style.width = r.width + "px";
      clone.style.height = r.height + "px";
      const xml = new XMLSerializer().serializeToString(clone);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${r.width}" height="${r.height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${r.width}px;height:${r.height}px"><style>${css}</style>${xml}</div></foreignObject></svg>`;
      const im = new Image();
      await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); });
      const c = document.createElement("canvas");
      c.width = r.width;
      c.height = r.height;
      c.getContext("2d").drawImage(im, 0, 0);
      out = c.toDataURL("image/jpeg", 0.85);
    }
    localStorage.setItem("__drwshot", out);
    return out.length;
  };
  window.dispatchEvent(new Event("resize"));
  window.__drw.fit();
  return "ready";
}
