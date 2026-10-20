/**
 * Space Station Escape — procedural station furniture. Each builder returns a
 * Group on its own origin (floor props at y = 0, wall props centred on the
 * given height) facing +z, i.e. into the room. Live screens redraw a small
 * canvas a few times a second; state-driven bits register `ctx.onState`,
 * animated bits `ctx.onFrame`. scene.js disposes everything per sector.
 */
import * as THREE from "three";
import { textCanvas, spaceCanvas, hazardCanvas, makeCanvas } from "./art.js";

const STEEL = "steel", DARK = "dark", CHROME = "chrome";

function box(ctx, g, w, h, d, m, x = 0, y = 0, z = 0, cast = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof m === "string" ? ctx.mat(m) : m);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
function cyl(ctx, g, rt, rb, h, m, x = 0, y = 0, z = 0, seg = 20) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof m === "string" ? ctx.mat(m) : m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
function plane(ctx, g, w, h, mat, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(x, y, z);
  g.add(mesh);
  return mesh;
}
const neon = (ctx, color, k = 2.2) => ctx.mat("#000000", { emissive: color, emissiveIntensity: k, roughness: 0.4 });
const label = (ctx, lines, opts) => {
  const tex = ctx.T(textCanvas(lines, opts));
  return ctx.mat("#ffffff", { map: tex, transparent: true, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0.8 });
};

/** A live screen: `draw(x, w, h, t, state)` repaints the canvas ~8×/s. */
function screen(ctx, g, w, h, draw, { px = 256, x = 0, y = 0, z = 0 } = {}) {
  const [c, k] = makeCanvas(px, Math.round((px * h) / w));
  const tex = ctx.T(c);
  const m = plane(ctx, g, w, h, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), x, y, z);
  let acc = 1;
  ctx.onFrame((t, dt, s) => {
    acc += dt;
    if (acc < 0.12) return;
    acc = 0;
    draw(k, c.width, c.height, t, s);
    tex.needsUpdate = true;
  });
  return m;
}
/* screen painters */
const bg = (k, w, h, col = "#03121e") => {
  k.fillStyle = col;
  k.fillRect(0, 0, w, h);
  k.strokeStyle = "rgba(80,200,255,0.12)";
  for (let y = 0; y < h; y += 4) {
    k.beginPath();
    k.moveTo(0, y);
    k.lineTo(w, y);
    k.stroke();
  }
};
const SCREENS = {
  wave: (k, w, h, t, s) => {
    bg(k, w, h);
    const col = s.f.power ? "#4fe3ff" : "#ff5a5a";
    k.strokeStyle = col;
    k.lineWidth = 2;
    k.beginPath();
    for (let x = 0; x < w; x += 3) k.lineTo(x, h / 2 + Math.sin(x * 0.06 + t * 4) * h * 0.22 * Math.sin(t + x * 0.01));
    k.stroke();
    k.fillStyle = col;
    k.font = "bold 18px monospace";
    k.fillText(s.f.power ? "SYSTEMS NOMINAL" : "ALERT · HULL BREACH", 10, 22);
  },
  text: (k, w, h, t, s) => {
    bg(k, w, h);
    k.fillStyle = s.f.power ? "#7fe6ff" : "#ff8a7a";
    k.font = "14px monospace";
    const lines = ["ARIA v4.2 · HELIOS STATION", "> sector lockdown: ACTIVE", "> o2 reserve: LOW", "> reactor: " + (s.f.power ? "ONLINE" : "IDLE 12%"), "> crew aboard: 1", "> life support: " + (s.f.lifeSupport ? "OK" : "FAILING")];
    const off = Math.floor(t * 2) % lines.length;
    for (let i = 0; i < 6; i++) k.fillText(lines[(i + off) % lines.length], 10, 22 + i * 20);
  },
  radar: (k, w, h, t) => {
    bg(k, w, h);
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.42;
    k.strokeStyle = "rgba(80,220,255,0.5)";
    for (let i = 1; i <= 3; i++) {
      k.beginPath();
      k.arc(cx, cy, (R * i) / 3, 0, Math.PI * 2);
      k.stroke();
    }
    const a = t * 1.5;
    k.strokeStyle = "#5fffd0";
    k.lineWidth = 3;
    k.beginPath();
    k.moveTo(cx, cy);
    k.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    k.stroke();
    k.fillStyle = "#ffcf5a";
    k.fillRect(cx + R * 0.5, cy - R * 0.3, 5, 5);
  },
  bars: (k, w, h, t, s) => {
    bg(k, w, h);
    for (let i = 0; i < 8; i++) {
      const v = 0.3 + 0.6 * Math.abs(Math.sin(t * 0.8 + i * 1.3));
      k.fillStyle = s.f.power ? "#3fb6ff" : "#ff5a5a";
      k.fillRect(10 + i * ((w - 20) / 8), h - 10 - v * (h - 40), (w - 20) / 8 - 6, v * (h - 40));
    }
  },
};

/* --------------------------------------------------------------- props */
export const PROPS = {
  spaceWindow(ctx, o = {}) {
    const g = new THREE.Group();
    const w = o.w || 3, h = o.h || 1.6;
    const tex = ctx.T(spaceCanvas(o.earth !== false, Math.round(w * 10)));
    tex.wrapS = THREE.RepeatWrapping;
    const view = plane(ctx, g, w, h, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), 0, 0, 0.01);
    ctx.onFrame((t) => (tex.offset.x = t * 0.002));
    void view;
    const fr = ctx.mat(STEEL);
    box(ctx, g, w + 0.3, 0.16, 0.22, fr, 0, h / 2 + 0.08, 0.06);
    box(ctx, g, w + 0.3, 0.16, 0.22, fr, 0, -h / 2 - 0.08, 0.06);
    box(ctx, g, 0.16, h, 0.22, fr, -w / 2 - 0.08, 0, 0.06);
    box(ctx, g, 0.16, h, 0.22, fr, w / 2 + 0.08, 0, 0.06);
    for (let i = 1; i < Math.round(w / 1.3); i++) box(ctx, g, 0.06, h, 0.08, fr, -w / 2 + (i * w) / Math.round(w / 1.3), 0, 0.04);
    box(ctx, g, w + 0.2, 0.03, 0.03, neon(ctx, "#3fb6ff"), 0, -h / 2 - 0.18, 0.16, false);
    return g;
  },
  console(ctx, o = {}) {
    const g = new THREE.Group();
    const w = o.narrow ? 1.4 : 2.6;
    box(ctx, g, w, 0.8, 0.7, STEEL, 0, 0.4, 0);
    const top = box(ctx, g, w + 0.1, 0.08, 0.8, DARK, 0, 0.88, 0.04);
    top.rotation.x = 0.12;
    box(ctx, g, w, 0.03, 0.03, neon(ctx, "#3fb6ff"), 0, 0.82, 0.36, false);
    // keyboard + buttons
    box(ctx, g, w * 0.5, 0.02, 0.2, "#111820", 0, 0.94, 0.15);
    for (let i = 0; i < 8; i++) box(ctx, g, 0.05, 0.02, 0.05, neon(ctx, ["#ff4a5a", "#ffcf3a", "#4fff9a", "#3fb6ff"][i % 4], 1.6), -w * 0.42 + i * 0.07, 0.94, 0.25, false);
    // monitors
    const n = o.narrow ? 1 : 3;
    const kinds = ["text", "wave", "radar"];
    for (let i = 0; i < n; i++) {
      const sx = n === 1 ? 0 : (i - 1) * 0.86;
      const mon = new THREE.Group();
      mon.position.set(sx, 1.32, -0.12);
      mon.rotation.y = n === 1 ? 0 : -(i - 1) * 0.25;
      g.add(mon);
      box(ctx, mon, 0.8, 0.52, 0.05, DARK, 0, 0, 0);
      screen(ctx, mon, 0.72, 0.44, SCREENS[kinds[i % 3]], { z: 0.028 });
      box(ctx, mon, 0.06, 0.4, 0.06, STEEL, 0, -0.42, -0.04);
    }
    if (o.label) plane(ctx, g, 0.9, 0.16, label(ctx, [o.label], { w: 512, h: 96, size: 56, color: "#9fe0ff" }), 0, 0.55, 0.356);
    return g;
  },
  photo(ctx) {
    const g = new THREE.Group();
    const [c, k] = makeCanvas(160, 200);
    k.fillStyle = "#e9e2d0";
    k.fillRect(0, 0, 160, 200);
    k.fillStyle = "#1d2a40";
    k.fillRect(10, 10, 140, 150);
    k.fillStyle = "#e08a3a";
    k.beginPath();
    k.ellipse(80, 100, 34, 30, 0, 0, Math.PI * 2);
    k.fill();
    k.beginPath();
    k.moveTo(54, 80);
    k.lineTo(60, 52);
    k.lineTo(72, 74);
    k.moveTo(106, 80);
    k.lineTo(100, 52);
    k.lineTo(88, 74);
    k.fill();
    k.strokeStyle = "rgba(200,230,255,0.8)";
    k.lineWidth = 3;
    k.beginPath();
    k.arc(80, 98, 50, 0, Math.PI * 2);
    k.stroke();
    k.fillStyle = "#222";
    k.font = "bold 20px sans-serif";
    k.textAlign = "center";
    k.fillText("ORBIT", 80, 188);
    const p = plane(ctx, g, 0.16, 0.2, ctx.mat("#ffffff", { map: ctx.T(c), roughness: 0.6 }), 0, 0.1, 0);
    p.rotation.x = -0.2;
    box(ctx, g, 0.18, 0.22, 0.015, CHROME, 0, 0.1, -0.012).rotation.x = -0.2;
    return g;
  },
  sticky(ctx) {
    const g = new THREE.Group();
    plane(ctx, g, 0.16, 0.16, ctx.mat("#ffffff", { map: ctx.T(textCanvas(["PASSWORD =", "cat + deck #"], { w: 160, h: 160, bg: "#ffe45a", color: "#333", size: 20, font: "cursive" })), roughness: 0.9 }), 0, 0, 0.005);
    return g;
  },
  chair(ctx) {
    const g = new THREE.Group();
    cyl(ctx, g, 0.05, 0.05, 0.45, CHROME, 0, 0.22, 0, 10);
    cyl(ctx, g, 0.32, 0.36, 0.05, DARK, 0, 0.03, 0, 5);
    const seat = ctx.mat("#2a3a52", { roughness: 0.6 });
    box(ctx, g, 0.62, 0.12, 0.6, seat, 0, 0.5, 0);
    box(ctx, g, 0.62, 0.8, 0.12, seat, 0, 0.95, 0.27);
    box(ctx, g, 0.08, 0.2, 0.5, STEEL, -0.34, 0.66, 0);
    box(ctx, g, 0.08, 0.2, 0.5, STEEL, 0.34, 0.66, 0);
    box(ctx, g, 0.16, 0.02, 0.22, neon(ctx, "#3fb6ff", 1.2), -0.34, 0.77, -0.05, false); // datapad
    return g;
  },
  sign(ctx, o = {}) {
    const g = new THREE.Group();
    const lines = o.lines || ["SIGN"];
    const colors = o.colors ? ["#e6f4ff", "#ffffff"] : null;
    box(ctx, g, 1.5, 0.6, 0.04, DARK, 0, 0, 0);
    plane(ctx, g, 1.4, 0.52, label(ctx, lines, { w: 768, h: 288, size: 58, colors }), 0, 0, 0.025);
    if (o.colors) ["#ff4a4a", "#ffb02a", "#4fff7a", "#3fa8ff"].forEach((c, i) => box(ctx, g, 0.22, 0.06, 0.02, neon(ctx, c, 2.5), -0.45 + i * 0.3, -0.36, 0.03, false));
    return g;
  },
  locker(ctx, o = {}) {
    const g = new THREE.Group();
    const col = ctx.mat(o.color || "#3a4a5e", { metalness: 0.6, roughness: 0.45 });
    box(ctx, g, 0.8, 2.1, 0.5, col, 0, 1.05, 0);
    box(ctx, g, 0.02, 1.9, 0.02, DARK, 0, 1.05, 0.26, false);
    for (const y of [1.7, 1.75, 1.8]) box(ctx, g, 0.6, 0.02, 0.01, DARK, 0, y, 0.255, false);
    box(ctx, g, 0.04, 0.04, 0.02, neon(ctx, "#4fff9a", 1.5), 0.3, 1.1, 0.26, false);
    return g;
  },
  o2Rack(ctx, o = {}) {
    const g = new THREE.Group();
    box(ctx, g, 0.7, 0.9, 0.12, STEEL, 0, 0, 0.06);
    const cans = [];
    for (const x of [-0.18, 0.18]) {
      const c = cyl(ctx, g, 0.09, 0.09, 0.6, ctx.mat("#2a8fd0", { metalness: 0.5, roughness: 0.3 }), x, 0, 0.2, 16);
      cyl(ctx, g, 0.04, 0.05, 0.1, CHROME, x, 0.35, 0.2, 10);
      cans.push(c);
    }
    cans[0].visible = false; // the other bay is already empty
    plane(ctx, g, 0.5, 0.12, label(ctx, ["O₂ EMERGENCY"], { w: 512, h: 120, size: 60, color: "#7fe0ff" }), 0, -0.38, 0.13);
    ctx.onState((s) => (cans[1].visible = !s.f[o.flag]));
    return g;
  },
  holo(ctx) {
    const g = new THREE.Group();
    cyl(ctx, g, 0.35, 0.42, 0.7, STEEL, 0, 0.35, 0, 24);
    cyl(ctx, g, 0.3, 0.3, 0.02, neon(ctx, "#3fb6ff", 2.5), 0, 0.71, 0, 24);
    const hm = new THREE.MeshBasicMaterial({ color: "#5fd0ff", wireframe: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    const st = new THREE.Group();
    st.position.y = 1.25;
    g.add(st);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 6, 24), hm);
    ring.rotation.x = Math.PI / 2;
    st.add(ring);
    st.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8), hm));
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.02, 0.18), hm);
    st.add(panel);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 24, 1, true), new THREE.MeshBasicMaterial({ color: "#3fb6ff", transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    cone.position.y = 1.15;
    cone.rotation.x = Math.PI;
    g.add(cone);
    ctx.onFrame((t) => {
      st.rotation.y = t * 0.5;
      st.position.y = 1.25 + Math.sin(t * 1.3) * 0.03;
      hm.opacity = 0.45 + Math.sin(t * 7) * 0.08;
    });
    return g;
  },
  door(ctx, o = {}) {
    const g = new THREE.Group();
    const w = 1.5, h = 2.5;
    const fr = ctx.mat("#4a5260", { metalness: 0.7, roughness: 0.35 });
    box(ctx, g, w + 0.5, 0.35, 0.3, fr, 0, h + 0.17, 0.06);
    box(ctx, g, 0.25, h, 0.3, fr, -w / 2 - 0.12, h / 2, 0.06);
    box(ctx, g, 0.25, h, 0.3, fr, w / 2 + 0.12, h / 2, 0.06);
    box(ctx, g, w, h, 0.02, "#05070a", 0, h / 2, -0.04, false);
    const strip = neon(ctx, "#ff3a3a", 2);
    box(ctx, g, 0.04, h, 0.04, strip, -w / 2 - 0.25, h / 2, 0.2, false);
    box(ctx, g, 0.04, h, 0.04, strip, w / 2 + 0.25, h / 2, 0.2, false);
    const hz = ctx.mat("#ffffff", { map: ctx.T(hazardCanvas()), roughness: 0.6 });
    const leaves = [-1, 1].map((side) => {
      const l = new THREE.Group();
      g.add(l);
      box(ctx, l, w / 2, h, 0.08, ctx.mat("#6a7484", { metalness: 0.65, roughness: 0.35 }), (side * w) / 4, h / 2, 0);
      plane(ctx, l, w / 2 - 0.1, 0.18, hz, (side * w) / 4, 0.3, 0.045);
      box(ctx, l, 0.22, 0.5, 0.02, ctx.mat("#0d1824", { metalness: 0.9, roughness: 0.1 }), (side * w) / 4, 1.7, 0.045, false);
      return { l, side };
    });
    if (o.quarantine) plane(ctx, g, 1.0, 0.3, label(ctx, ["☣ QUARANTINE"], { w: 512, h: 150, size: 64, color: "#ffd23a" }), 0, 1.25, 0.06).userData.quarantine = true;
    if (o.keycard) {
      box(ctx, g, 0.14, 0.24, 0.05, DARK, w / 2 + 0.12, 1.25, 0.23);
      box(ctx, g, 0.06, 0.03, 0.02, neon(ctx, "#ff3a5a", 2.5), w / 2 + 0.12, 1.32, 0.26, false);
    }
    plane(ctx, g, w, 0.24, label(ctx, [o.label || "SECTOR"], { w: 768, h: 120, size: 64, color: "#cfe9ff" }), 0, h + 0.17, 0.215);
    const quar = g.children.find((m) => m.userData.quarantine);
    let a = 0;
    ctx.onFrame((t, dt, s) => {
      const unlocked = o.openFlag && s.f[o.openFlag];
      a += ((unlocked ? 1 : 0) - a) * Math.min(1, dt * 3);
      leaves.forEach(({ l, side }) => (l.position.x = side * a * (w / 2 - 0.05)));
      const ready = unlocked || (o.readyFlag && s.f[o.readyFlag]);
      strip.emissive.set(ready ? "#3fff8a" : "#ff3a3a");
      strip.emissiveIntensity = ready ? 2 : 1.4 + Math.sin(t * 4) * 0.6;
      if (quar) quar.visible = !(o.readyFlag && s.f[o.readyFlag]);
    });
    return g;
  },
  pipes(ctx) {
    const g = new THREE.Group();
    const m = ctx.mat("#59606b", { metalness: 0.75, roughness: 0.4 });
    for (const [y, r] of [[3.15, 0.09], [2.9, 0.06], [0.25, 0.07]]) {
      const p = cyl(ctx, g, r, r, 8.6, m, 0, y, 0.18, 12);
      p.rotation.z = Math.PI / 2;
      for (let i = -3; i <= 3; i++) cyl(ctx, g, r + 0.02, r + 0.02, 0.06, DARK, i * 1.3, y, 0.18, 12).rotation.z = Math.PI / 2;
    }
    return g;
  },
  reactor(ctx) {
    const g = new THREE.Group();
    cyl(ctx, g, 1.0, 1.15, 0.4, STEEL, 0, 0.2, 0, 32);
    cyl(ctx, g, 0.9, 1.0, 0.3, STEEL, 0, 3.45, 0, 32);
    const coreMat = ctx.mat("#0a2a40", { emissive: "#1e8fff", emissiveIntensity: 1.2, transparent: true, opacity: 0.85, roughness: 0.1 });
    const core = cyl(ctx, g, 0.45, 0.45, 2.9, coreMat, 0, 1.85, 0, 32);
    core.castShadow = false;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 2.9, 32, 1, true), ctx.mat("#9fd8ff", { transparent: true, opacity: 0.18, metalness: 0.9, roughness: 0.05, side: THREE.DoubleSide }));
    glass.position.y = 1.85;
    g.add(glass);
    const rings = [];
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.05, 8, 32), ctx.mat("#4a5260", { metalness: 0.8, roughness: 0.3 }));
      r.rotation.x = Math.PI / 2;
      r.position.y = 0.6 + i * 0.85;
      g.add(r);
      rings.push(r);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      cyl(ctx, g, 0.08, 0.08, 3.1, ctx.mat("#59606b", { metalness: 0.75 }), Math.cos(a) * 0.95, 1.85, Math.sin(a) * 0.95, 10);
    }
    ctx.onFrame((t, dt, s) => {
      const on = s.f.power ? 1 : 0.25;
      coreMat.emissiveIntensity = (1.6 + Math.sin(t * 3) * 0.4) * on + 0.3;
      core.rotation.y = t * (s.f.power ? 2 : 0.3);
      rings.forEach((r, i) => (r.position.y = 0.6 + i * 0.85 + Math.sin(t * 2 + i) * (s.f.power ? 0.04 : 0)));
    });
    return g;
  },
  junction(ctx) {
    const g = new THREE.Group();
    box(ctx, g, 1.2, 1.0, 0.25, ctx.mat("#4a5260", { metalness: 0.7, roughness: 0.4 }), 0, 0, 0.12);
    const cover = new THREE.Group();
    cover.position.set(-0.58, 0, 0.26);
    g.add(cover);
    box(ctx, cover, 1.14, 0.94, 0.04, ctx.mat("#6a7484", { metalness: 0.6, roughness: 0.4 }), 0.57, 0, 0);
    plane(ctx, cover, 0.8, 0.16, ctx.mat("#ffffff", { map: ctx.T(hazardCanvas()) }), 0.57, -0.32, 0.025);
    plane(ctx, cover, 0.8, 0.2, label(ctx, ["⚡ MAIN BUS"], { w: 512, h: 120, size: 62, color: "#ffd23a" }), 0.57, 0.25, 0.025);
    for (const [x, y] of [[0.08, 0.4], [1.06, 0.4], [0.08, -0.4], [1.06, -0.4]]) cyl(ctx, cover, 0.025, 0.025, 0.03, CHROME, x, y, 0.02, 6).rotation.x = Math.PI / 2;
    const inside = new THREE.Group();
    g.add(inside);
    for (let i = 0; i < 12; i++) box(ctx, inside, 0.16, 0.16, 0.03, neon(ctx, i % 3 ? "#ffb23a" : "#3fb6ff", 1), -0.42 + (i % 4) * 0.28, 0.3 - Math.floor(i / 4) * 0.28, 0.25, false);
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: "#fff2a0", transparent: true, blending: THREE.AdditiveBlending }));
    spark.position.set(0.5, 0.48, 0.3);
    g.add(spark);
    // cables to the floor
    for (const x of [-0.4, 0, 0.4]) cyl(ctx, g, 0.04, 0.04, 1.0, "#1a1d22", x, -1.0, 0.1, 8);
    let a = 0;
    ctx.onFrame((t, dt, s) => {
      a += ((s.f.panelOpen ? 1 : 0) - a) * Math.min(1, dt * 3);
      cover.rotation.y = -a * 1.9;
      spark.visible = !s.f.power && Math.sin(t * 13) > 0.6 && Math.sin(t * 2.3) > 0;
      spark.scale.setScalar(0.5 + Math.random());
    });
    return g;
  },
  workbench(ctx) {
    const g = new THREE.Group();
    box(ctx, g, 1.8, 0.08, 0.7, STEEL, 0, 0.9, 0);
    for (const [x, z] of [[-0.82, -0.28], [0.82, -0.28], [-0.82, 0.28], [0.82, 0.28]]) box(ctx, g, 0.06, 0.9, 0.06, DARK, x, 0.45, z);
    box(ctx, g, 1.7, 0.04, 0.6, DARK, 0, 0.3, 0);
    // toolbox
    box(ctx, g, 0.6, 0.28, 0.32, ctx.mat("#c4302a", { metalness: 0.4, roughness: 0.5 }), 0.3, 1.08, 0.05);
    box(ctx, g, 0.3, 0.04, 0.04, DARK, 0.3, 1.26, 0.05);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 6, 16), ctx.mat("#d0302a", { metalness: 0.5 }));
    wheel.position.set(-0.4, 0.96, 0.1);
    wheel.rotation.x = Math.PI / 2;
    g.add(wheel);
    ctx.onState((s) => (wheel.visible = !s.f.got_wheel));
    box(ctx, g, 0.3, 0.03, 0.06, CHROME, -0.1, 0.955, 0.2).rotation.y = 0.5;
    return g;
  },
  terminalStand(ctx, o = {}) {
    const g = new THREE.Group();
    cyl(ctx, g, 0.08, 0.2, 1.1, STEEL, 0, 0.55, 0, 12);
    const head = new THREE.Group();
    head.position.set(0, 1.25, 0);
    head.rotation.x = -0.35;
    g.add(head);
    box(ctx, head, 0.62, 0.42, 0.06, DARK, 0, 0, 0);
    screen(ctx, head, 0.56, 0.36, SCREENS.text, { z: 0.032 });
    box(ctx, g, 0.5, 0.02, 0.02, neon(ctx, o.tint || "#3fb6ff", 2), 0, 1.0, 0.1, false);
    return g;
  },
  screenWall(ctx) {
    const g = new THREE.Group();
    box(ctx, g, 1.7, 0.9, 0.06, DARK, 0, 0, 0.03);
    screen(ctx, g, 1.6, 0.8, (k, w, h, t, s) => {
      bg(k, w, h);
      k.font = "bold 22px monospace";
      k.fillStyle = s.f.power ? "#5fffb0" : "#ff5a5a";
      k.fillText("MAIN BUS: " + (s.f.power ? "ONLINE" : "FAULT"), 14, 34);
      k.fillStyle = "#9fdcff";
      k.fillText("LIGHTS  " + (s.f.power ? "■■■■■■" : "□□□□□□"), 14, 74);
      k.fillText("DOORS   " + (s.f.power ? "■■■■■■" : "□□□□□□"), 14, 108);
      if (!s.f.power && Math.sin(t * 6) > 0) {
        k.fillStyle = "#ff3a3a";
        k.fillText("⚠ REROUTE JUNCTION", 14, 146);
      }
    }, { px: 320, z: 0.065 });
    return g;
  },
  crates(ctx) {
    const g = new THREE.Group();
    const m = ctx.mat("#4a5a3a", { metalness: 0.3, roughness: 0.7 });
    box(ctx, g, 0.8, 0.8, 0.8, m, 0, 0.4, 0).rotation.y = 0.2;
    box(ctx, g, 0.6, 0.6, 0.6, m, 0.1, 1.1, 0.05).rotation.y = -0.3;
    return g;
  },
  bioMonitor(ctx) {
    const g = new THREE.Group();
    box(ctx, g, 2.3, 1.0, 0.06, DARK, 0, 0, 0.03);
    const P = [["OKAFOR", "■"], ["ITO", "▲"], ["KOWALSKI", "◆"], ["REYES", "●"]];
    screen(ctx, g, 2.2, 0.9, (k, w, h, t) => {
      bg(k, w, h, "#021712");
      P.forEach(([n, sym], i) => {
        const x = 12 + i * (w / 4);
        k.strokeStyle = "rgba(80,255,200,0.4)";
        k.strokeRect(x, 10, w / 4 - 20, h - 20);
        k.fillStyle = "#5fffc8";
        k.font = "bold 46px sans-serif";
        k.fillText(sym, x + 10, 64);
        k.font = "bold 17px monospace";
        k.fillText(n, x + 10, 100);
        k.strokeStyle = "#ff5a7a";
        k.beginPath();
        for (let j = 0; j < w / 4 - 30; j += 3) {
          const p = (j + t * 60 + i * 30) % 50;
          k.lineTo(x + 10 + j, h - 40 - (p < 4 ? 20 * (2 - p) : 0) * 0.5);
        }
        k.stroke();
      });
    }, { px: 640, z: 0.065 });
    return g;
  },
  specimenCabinet(ctx) {
    const g = new THREE.Group();
    box(ctx, g, 1.1, 2.0, 0.5, ctx.mat("#dfe6ec", { metalness: 0.3, roughness: 0.3 }), 0, 1.0, 0);
    const doorG = new THREE.Group();
    doorG.position.set(-0.53, 1.05, 0.26);
    g.add(doorG);
    box(ctx, doorG, 1.0, 1.6, 0.03, ctx.mat("#9fd8ff", { transparent: true, opacity: 0.3, metalness: 0.8, roughness: 0.05 }), 0.5, 0, 0, false);
    for (let i = 0; i < 3; i++) box(ctx, g, 0.96, 0.02, 0.44, CHROME, 0, 0.5 + i * 0.5, 0);
    for (let i = 0; i < 6; i++) cyl(ctx, g, 0.04, 0.04, 0.16, ctx.mat(["#5fffc8", "#ffcf3a", "#ff5a7a"][i % 3], { emissive: ["#1a8a6a", "#8a6a10", "#8a1a3a"][i % 3], emissiveIntensity: 0.8, transparent: true, opacity: 0.8 }), -0.35 + (i % 3) * 0.3, 1.09 + Math.floor(i / 3) * 0.5, 0, 10);
    const card = box(ctx, g, 0.2, 0.01, 0.12, neon(ctx, "#ff5a7a", 1.2), 0, 0.52, 0.05, false);
    box(ctx, g, 0.3, 0.22, 0.04, DARK, 0.3, 1.9, 0.26);
    const lamp = box(ctx, g, 0.06, 0.04, 0.02, neon(ctx, "#ff3a3a", 2.5), 0.3, 1.9, 0.29, false);
    let a = 0;
    ctx.onFrame((t, dt, s) => {
      a += ((s.solved.symbols ? 1 : 0) - a) * Math.min(1, dt * 2.5);
      doorG.rotation.y = -a * 1.8;
      card.visible = !s.solved.symbols;
      lamp.material.emissive.set(s.solved.symbols ? "#3fff8a" : "#ff3a3a");
    });
    return g;
  },
  medBed(ctx) {
    const g = new THREE.Group();
    box(ctx, g, 0.9, 0.5, 2.0, ctx.mat("#dfe6ec", { metalness: 0.3, roughness: 0.4 }), 0, 0.35, 0);
    box(ctx, g, 0.86, 0.12, 1.9, ctx.mat("#9fc6d8", { roughness: 0.8 }), 0, 0.66, 0);
    box(ctx, g, 0.6, 0.1, 0.35, "#f0f4f6", 0, 0.76, -0.7);
    cyl(ctx, g, 0.03, 0.03, 1.6, CHROME, 0.5, 0.8, -0.9, 8);
    box(ctx, g, 0.35, 0.25, 0.04, DARK, 0.5, 1.55, -0.9);
    return g;
  },
  sideTable(ctx) {
    const g = new THREE.Group();
    box(ctx, g, 0.6, 0.04, 0.45, CHROME, 0, 0.73, 0);
    cyl(ctx, g, 0.03, 0.03, 0.72, STEEL, 0, 0.36, 0, 8);
    cyl(ctx, g, 0.22, 0.24, 0.03, STEEL, 0, 0.015, 0, 12);
    return g;
  },
  recorder(ctx) {
    const g = new THREE.Group();
    box(ctx, g, 0.16, 0.05, 0.1, DARK, 0, 0.025, 0);
    const led = box(ctx, g, 0.025, 0.012, 0.025, neon(ctx, "#ff3a3a", 2.5), 0.05, 0.055, 0.02, false);
    ctx.onFrame((t) => (led.visible = Math.sin(t * 5) > 0));
    return g;
  },
  supplyCart(ctx) {
    const g = new THREE.Group();
    for (const y of [0.2, 0.55, 0.9]) box(ctx, g, 0.8, 0.04, 0.5, CHROME, 0, y, 0);
    for (const [x, z] of [[-0.38, -0.23], [0.38, -0.23], [-0.38, 0.23], [0.38, 0.23]]) cyl(ctx, g, 0.015, 0.015, 0.9, STEEL, x, 0.5, z, 6);
    box(ctx, g, 0.3, 0.12, 0.2, "#f0f4f6", -0.15, 0.98, 0);
    const can = cyl(ctx, g, 0.07, 0.07, 0.4, ctx.mat("#2a8fd0", { metalness: 0.5, roughness: 0.3 }), 0.2, 0.77, 0, 14);
    can.rotation.z = Math.PI / 2;
    ctx.onState((s) => (can.visible = !s.f.got_o2B));
    return g;
  },
  valveBank(ctx) {
    const g = new THREE.Group();
    const pipe = ctx.mat("#59606b", { metalness: 0.75, roughness: 0.4 });
    box(ctx, g, 3.4, 2.2, 0.15, ctx.mat("#2c3a38", { metalness: 0.5 }), 0, 1.4, 0.08);
    const wheels = [];
    const needles = [];
    [-1.1, 0, 1.1].forEach((x, i) => {
      cyl(ctx, g, 0.1, 0.1, 2.3, pipe, x, 1.25, 0.32, 12);
      const v = new THREE.Group();
      v.position.set(x, 1.0, 0.45);
      g.add(v);
      cyl(ctx, v, 0.14, 0.14, 0.2, DARK, 0, 0, 0, 12).rotation.x = Math.PI / 2;
      const wheel = new THREE.Group();
      wheel.position.z = 0.14;
      v.add(wheel);
      const wm = ctx.mat("#d0302a", { metalness: 0.5, roughness: 0.4 });
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 8, 24), wm);
      wheel.add(rim);
      for (let k = 0; k < 3; k++) {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.03, 0.03), wm);
        sp.rotation.z = (k * Math.PI) / 3;
        wheel.add(sp);
      }
      wheels.push(wheel);
      // gauge
      const gg = new THREE.Group();
      gg.position.set(x, 1.95, 0.3);
      g.add(gg);
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), ctx.mat("#e8eef2", { roughness: 0.5 }));
      gg.add(face);
      const mark = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.19, 24, 1, 0.3, 0.5), neon(ctx, "#3fff8a", 1.5));
      mark.position.z = 0.002;
      gg.add(mark);
      const n = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.17, 0.01), ctx.mat("#c4302a"));
      n.geometry.translate(0, 0.08, 0);
      n.position.z = 0.01;
      gg.add(n);
      needles.push(n);
      plane(ctx, g, 0.3, 0.12, label(ctx, ["ABC"[i]], { w: 128, h: 64, size: 50, color: "#ffffff" }), x, 0.62, 0.4);
    });
    plane(ctx, g, 1.6, 0.2, label(ctx, ["PRESSURE CONTROL"], { w: 768, h: 100, size: 58, color: "#9fffcf" }), 0, 2.35, 0.17);
    ctx.onFrame((t, dt, s) => {
      wheels[1].visible = Boolean(s.f.wheelIn);
      needles.forEach((n, i) => {
        const target = s.solved.pressure ? 0.4 : -1.4 + Math.sin(t * (2 + i) + i) * 0.5;
        n.rotation.z += (-target - n.rotation.z) * Math.min(1, dt * 4);
      });
      if (s.solved.pressure) wheels.forEach((w, i) => (w.rotation.z += dt * (0.2 + i * 0.05)));
    });
    return g;
  },
  tanks(ctx) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 0.6;
      cyl(ctx, g, 0.26, 0.26, 2.0, ctx.mat(i === 1 ? "#d8dde2" : "#2a8fd0", { metalness: 0.5, roughness: 0.3 }), x, 1.0, 0, 24);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), ctx.mat(STEEL));
      cap.position.set(x, 2.0, 0);
      g.add(cap);
      box(ctx, g, 0.3, 0.1, 0.02, neon(ctx, "#5fffb0", 1.2), x, 1.3, 0.26, false);
    }
    return g;
  },
  clipboard(ctx) {
    const g = new THREE.Group();
    box(ctx, g, 0.4, 0.55, 0.02, "#5a4a3a", 0, 0, 0.01);
    plane(ctx, g, 0.34, 0.44, ctx.mat("#ffffff", { map: ctx.T(textCanvas(["BALANCE", "PROCEDURE", "A · B · C", "→ green", "marks"], { w: 256, h: 320, bg: "#f2f2ea", color: "#223", size: 30 })) }), 0, -0.03, 0.025);
    box(ctx, g, 0.14, 0.05, 0.03, CHROME, 0, 0.27, 0.03);
    return g;
  },
  lowCabinet(ctx) {
    const g = new THREE.Group();
    box(ctx, g, 1.2, 0.9, 0.5, STEEL, 0, 0.45, 0);
    box(ctx, g, 1.0, 0.02, 0.02, neon(ctx, "#5fffb0", 1.5), 0, 0.7, 0.26, false);
    return g;
  },
  tablet(ctx) {
    const g = new THREE.Group();
    const t = new THREE.Group();
    t.rotation.x = -Math.PI / 2 + 0.3;
    t.position.y = 0.05;
    g.add(t);
    box(ctx, t, 0.3, 0.2, 0.015, DARK, 0, 0, 0);
    screen(ctx, t, 0.27, 0.17, SCREENS.text, { px: 192, z: 0.009 });
    return g;
  },
  hydro(ctx) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      box(ctx, g, 0.9, 0.05, 0.5, CHROME, 0, 0.4 + i * 0.6, 0);
      box(ctx, g, 0.85, 0.02, 0.02, neon(ctx, "#c45aff", 2), 0, 0.95 + i * 0.6, 0.2, false);
      for (let k = 0; k < 4; k++) {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), ctx.mat("#3a9a4a", { roughness: 0.8 }));
        leaf.position.set(-0.3 + k * 0.2, 0.5 + i * 0.6, 0);
        leaf.scale.y = 0.7;
        g.add(leaf);
      }
    }
    for (const x of [-0.45, 0.45]) box(ctx, g, 0.04, 1.8, 0.04, STEEL, x, 0.9, 0.22);
    return g;
  },
  cameraWall(ctx) {
    const g = new THREE.Group();
    box(ctx, g, 2.3, 1.1, 0.06, DARK, 0, 0, 0.03);
    for (let i = 0; i < 6; i++) {
      const x = -0.74 + (i % 3) * 0.74, y = 0.26 - Math.floor(i / 3) * 0.52;
      screen(ctx, g, 0.68, 0.46, (k, w, h, t, s) => {
        k.fillStyle = "#0a0f14";
        k.fillRect(0, 0, w, h);
        k.strokeStyle = "rgba(160,190,210,0.35)";
        k.beginPath();
        k.moveTo(0, h);
        k.lineTo(w * 0.35, h * 0.45);
        k.lineTo(w * 0.65, h * 0.45);
        k.lineTo(w, h);
        k.stroke();
        k.strokeRect(w * 0.35, h * 0.2, w * 0.3, h * 0.25);
        if (i === 4) {
          k.fillStyle = s.f.cellIn ? "#5fffb0" : "#cfd8e0";
          k.beginPath();
          k.ellipse(w / 2, h * 0.6, w * 0.14, h * 0.18, 0, 0, Math.PI * 2);
          k.fill();
        }
        for (let n = 0; n < 120; n++) {
          k.fillStyle = `rgba(255,255,255,${Math.random() * 0.08})`;
          k.fillRect(Math.random() * w, Math.random() * h, 2, 2);
        }
        k.fillStyle = Math.sin(t * 3 + i) > 0 ? "#ff3a3a" : "#5a1010";
        k.beginPath();
        k.arc(w - 10, 10, 4, 0, Math.PI * 2);
        k.fill();
        k.fillStyle = "#cfd8e0";
        k.font = "12px monospace";
        k.fillText(["CMD", "ENG", "MED", "LIFE", "POD BAY", "HALL"][i], 6, 14);
      }, { px: 192, x, y, z: 0.065 });
    }
    return g;
  },
  laserDoor(ctx, o = {}) {
    const g = PROPS.door(ctx, { ...o, label: "POD BAY", openFlag: "door_podbay", readyFlag: "lasersOff" });
    const beams = new THREE.Group();
    g.add(beams);
    const bm = new THREE.MeshBasicMaterial({ color: "#ff2a3a", transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.9, 6), bm);
      b.rotation.z = Math.PI / 2 + (i % 2 ? 0.35 : -0.35);
      b.position.set(0, 0.35 + i * 0.36, 0.45);
      beams.add(b);
    }
    for (const x of [-0.95, 0.95]) box(ctx, g, 0.1, 2.3, 0.1, DARK, x, 1.2, 0.45);
    ctx.onFrame((t, dt, s) => {
      beams.visible = !s.f.lasersOff;
      bm.opacity = 0.7 + Math.sin(t * 20) * 0.15;
    });
    return g;
  },
  pod(ctx) {
    const g = new THREE.Group();
    // cradle
    box(ctx, g, 2.6, 0.3, 2.0, DARK, 0, 0.15, 0);
    for (const x of [-1.1, 1.1]) box(ctx, g, 0.2, 1.4, 0.3, STEEL, x, 0.9, 0);
    const pod = new THREE.Group();
    pod.position.y = 1.35;
    g.add(pod);
    const hull = ctx.mat("#e6ecf2", { metalness: 0.5, roughness: 0.3 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.8, 1.2, 8, 24), hull);
    body.rotation.z = Math.PI / 2;
    body.castShadow = true;
    pod.add(body);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 0.12, 24, 1, true), ctx.mat("#ff8a2a", { emissive: "#5a2a00" }));
    stripe.rotation.z = Math.PI / 2;
    stripe.position.x = 0.35;
    pod.add(stripe);
    const win = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 12), ctx.mat("#0d1824", { metalness: 0.9, roughness: 0.05, emissive: "#0a2a40" }));
    win.position.set(-0.6, 0.25, 0.6);
    win.scale.set(1, 0.7, 0.4);
    pod.add(win);
    const hatch = new THREE.Group();
    hatch.position.set(0.25, 0, 0.8);
    pod.add(hatch);
    const hm = box(ctx, hatch, 0.7, 0.9, 0.06, hull, 0.35, 0, 0);
    void hm;
    const glow = box(ctx, pod, 0.6, 0.8, 0.02, neon(ctx, "#5fffb0", 0), 0.6, 0, 0.77, false);
    const thr = cyl(ctx, pod, 0.3, 0.4, 0.3, DARK, 1.55, 0, 0, 16);
    thr.rotation.z = Math.PI / 2;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.0, 16, 1, true), new THREE.MeshBasicMaterial({ color: "#7fd8ff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    flame.rotation.z = -Math.PI / 2;
    flame.position.x = 2.2;
    pod.add(flame);
    const lights = [];
    for (let i = 0; i < 4; i++) lights.push(box(ctx, g, 0.08, 0.08, 0.04, neon(ctx, "#ff3a3a", 2), -0.9 + i * 0.6, 0.31, 1.0, false));
    let a = 0;
    let k = 0; // seconds since launch
    ctx.onFrame((t, dt, s) => {
      a += ((s.f.cellIn ? 1 : 0) - a) * Math.min(1, dt * 2);
      hatch.rotation.y = a * 1.6;
      glow.material.emissiveIntensity = a * 1.5;
      lights.forEach((l, i) => l.material.emissive.set(s.f.cellIn ? (Math.floor(t * 4) % 4 === i ? "#5fffb0" : "#1a5a3a") : "#ff3a3a"));
      if (s.solved.launch) {
        k += dt;
        hatch.rotation.y = 0;
        flame.material.opacity = Math.min(1, k * 2) * (0.7 + Math.random() * 0.3);
        flame.scale.y = 1 + Math.random() * 0.5;
        pod.position.y = 1.35 + Math.max(0, k - 0.8) ** 2 * 1.8;
        pod.position.z = -(Math.max(0, k - 0.8) ** 2) * 3;
      }
    });
    return g;
  },
  hazard(ctx) {
    const g = new THREE.Group();
    const t = ctx.T(hazardCanvas());
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(6, 1);
    const m = plane(ctx, g, 4.5, 0.25, ctx.mat("#ffffff", { map: t, roughness: 0.7 }));
    m.rotation.x = -Math.PI / 2;
    return g;
  },
};
