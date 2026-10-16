/**
 * DEV-only: render custom camera views of the running game (with ?sltest=1)
 * into one image stored in localStorage('__slshot'), for inspecting
 * characters close up when tab screenshots are unreliable.
 *   const { snap, showChar } = await import('/src/components/games/SchoolLife3D/tools/snap.mjs')
 *   snap([{ pos:[x,y,z], at:[x,y,z], fov }], w, h)
 * View it from a second same-origin tab:
 *   document.body.innerHTML = `<img src="${localStorage.getItem('__slshot')}">`
 */
export function snap(views, w = 320, h = 400) {
  const W = window.__sl.world;
  const cam = W.camera;
  const r = W.renderer;
  const old = { a: cam.aspect, fov: cam.fov, p: cam.position.clone(), q: cam.quaternion.clone() };
  const cols = Math.min(views.length, 5);
  const rows = Math.ceil(views.length / cols);
  const cv = document.createElement("canvas");
  cv.width = w * cols;
  cv.height = h * rows;
  const g = cv.getContext("2d");
  r.setSize(w, h, false);
  views.forEach((v, i) => {
    cam.aspect = w / h;
    cam.fov = v.fov || 30;
    cam.updateProjectionMatrix();
    cam.position.set(...v.pos);
    cam.lookAt(...v.at);
    r.render(W.scene, cam);
    g.drawImage(r.domElement, 0, 0, r.domElement.width, r.domElement.height, (i % cols) * w, Math.floor(i / cols) * h, w, h);
    if (v.label) {
      g.fillStyle = "rgba(0,0,0,0.55)";
      g.fillRect((i % cols) * w, Math.floor(i / cols) * h, w, 22);
      g.fillStyle = "#fff";
      g.font = "13px sans-serif";
      g.fillText(v.label, (i % cols) * w + 6, Math.floor(i / cols) * h + 16);
    }
  });
  cam.aspect = old.a;
  cam.fov = old.fov;
  cam.position.copy(old.p);
  cam.quaternion.copy(old.q);
  cam.updateProjectionMatrix();
  window.__sl.fit();
  const url = cv.toDataURL("image/jpeg", 0.88);
  localStorage.setItem("__slshot", url);
  return url.length;
}
/** Standard views of a character standing at (x, z) facing −z (the creator spot). */
export function charViews(x = 0, z = -21, label = "") {
  const hy = 1.55;
  return [
    { pos: [x, hy, z - 0.55], at: [x, hy, z], fov: 30, label: `${label} face` },
    { pos: [x - 0.55, hy, z - 0.05], at: [x, hy, z], fov: 30, label: "side" },
    { pos: [x, hy + 0.08, z + 0.6], at: [x, hy, z], fov: 30, label: "back" },
    { pos: [x, 0.95, z - 3.2], at: [x, 0.86, z], fov: 34, label: "front" },
    { pos: [x + 3.2, 0.95, z], at: [x, 0.86, z], fov: 34, label: "side" },
  ];
}

/** Put a row of characters (built from looks) in front of the school, posed. */
export async function lineup(looks, { z = -21, gap = 0.75, pose = "idle", t = 2 } = {}) {
  const M = await import("../models.js");
  await M.loadCharacterAssets();
  const W = window.__sl.world;
  (window.__lineup || []).forEach((r) => r.root.removeFromParent());
  window.__lineup = looks.map((l, i) => {
    const rig = M.buildCharacter(l);
    rig.root.position.set((i - (looks.length - 1) / 2) * gap, 0, z);
    rig.root.rotation.y = Math.PI;
    W.scene.add(rig.root);
    const st = l.state || { pose };
    for (let k = 0; k < 40; k++) M.animateRig(rig, { t: t + k / 30, seed: i, speed: 0, ...st, phase: (st.phase || 0) + (st.speed ? 0 : 0) }, 1 / 30);
    if (l.y) rig.root.position.y = l.y;
    rig.root.updateMatrixWorld(true);
    return rig;
  });
  return window.__lineup.length;
}

/** Boot the harness in the creator (no NPCs) — call once per page load. */
export async function boot() {
  if (!window.__sl || !window.__sl.openCreator) {
    const m = await import("./harness.mjs");
    await m.setup();
    await new Promise((r) => setTimeout(r, 50));
  }
  window.__sl.openCreator();
  await new Promise((r) => setTimeout(r, 50));
  window.__sl.advance(5);
}
/** A row of looks rendered from `views(i, x)` (default: head close-ups). */
export async function row(looks, views, { z = -26, gap = 0.8, pose = "idle", w = 300, h = 330 } = {}) {
  await lineup(looks, { z, gap, pose });
  const vs = [];
  looks.forEach((l, i) => {
    const x = (i - (looks.length - 1) / 2) * gap;
    vs.push(...(views ? views(i, x, z, l) : [{ pos: [x, 1.56, z - 0.62], at: [x, 1.56, z], fov: 30, label: l.label || "" }]));
  });
  return snap(vs, w, h);
}
