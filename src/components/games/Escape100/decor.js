/**
 * Escape 100 — set dressing. Non-interactive furniture and props built from
 * primitives with the room's materials. Each builder returns
 * { group, w, d, place: "wall" | "floor" } — wall pieces stand with their back
 * on z = 0 facing +Z; floor pieces are centred on the origin.
 */
import * as THREE from "three";
import { gearGeo } from "./models.js";
import { canvasPainting } from "./art.js";

function B(w, h, d, m, x, y, z, p, ry = 0) {
  const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  me.position.set(x, y, z);
  me.rotation.y = ry;
  me.castShadow = me.receiveShadow = true;
  p.add(me);
  return me;
}
function C(rt, rb, h, m, x, y, z, p, seg = 14) {
  const me = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  me.position.set(x, y, z);
  me.castShadow = me.receiveShadow = true;
  p.add(me);
  return me;
}
function S(r, m, x, y, z, p) {
  const me = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), m);
  me.position.set(x, y, z);
  me.castShadow = true;
  p.add(me);
  return me;
}
const legs4 = (w, d, h, m, p, y0 = 0, t = 0.05) => {
  for (const [x, z] of [[-w / 2 + t, -d / 2 + t], [w / 2 - t, -d / 2 + t], [-w / 2 + t, d / 2 - t], [w / 2 - t, d / 2 - t]]) B(t, h, t, m, x, y0 + h / 2, z, p);
};

export function makeDecor(kit, theme, rnd) {
  const wood = kit.wood(), metal = kit.metal(), dark = kit.dark();
  const D = {
    /* ---------- prison ---------- */
    bunk(g) {
      const m = kit.metal("#3a3836", 0.6);
      for (const y of [0.45, 1.35]) {
        B(1.9, 0.06, 0.8, m, 0, y, 0.4, g);
        B(1.85, 0.14, 0.75, kit.std("#6a6858", 0.95), 0, y + 0.1, 0.4, g);
      }
      for (const x of [-0.92, 0.92]) for (const z of [0.04, 0.76]) B(0.05, 1.8, 0.05, m, x, 0.9, z, g);
      B(0.5, 0.12, 0.35, kit.std("#d8d4c4", 0.95), -0.65, 1.52, 0.4, g);
      return { w: 1.95, d: 0.8, place: "wall" };
    },
    bucket(g) {
      C(0.16, 0.13, 0.32, kit.metal("#6a6a62", 0.5), 0, 0.16, 0, g);
      return { w: 0.35, d: 0.35, place: "floor" };
    },
    chains(g) {
      const m = kit.metal("#4a4642", 0.6);
      for (const x of [-0.25, 0.25]) {
        B(0.08, 0.08, 0.06, m, x, 2.1, 0.03, g);
        for (let i = 0; i < 9; i++) {
          const t = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 6, 10), m);
          t.position.set(x, 2.05 - i * 0.06, 0.06);
          t.rotation.y = i % 2 ? Math.PI / 2 : 0;
          g.add(t);
        }
        const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.014, 6, 14), m);
        cuff.position.set(x, 1.48, 0.06);
        g.add(cuff);
      }
      return { w: 0.7, d: 0.1, place: "wall" };
    },
    barsWindow(g) {
      B(0.8, 0.5, 0.05, kit.glow("#9ab8d8", 0.7), 0, 2.4, 0.01, g);
      const m = kit.metal("#2a2826", 0.6);
      for (let i = 0; i < 6; i++) C(0.015, 0.015, 0.5, m, -0.33 + i * 0.13, 2.4, 0.05, g, 6);
      B(0.9, 0.06, 0.12, kit.std("#4a4640", 0.95), 0, 2.14, 0.06, g);
      return { w: 0.9, d: 0.12, place: "wall", light: [0, 2.3, 0.6, "#8ab0e0", 3] };
    },
    graffitiTally(g) {
      const m = kit.std("#d8d0c0", 0.95);
      for (let k = 0; k < 4; k++)
        for (let i = 0; i < 4; i++) B(0.012, 0.16, 0.004, m, -0.3 + k * 0.17 + i * 0.03, 1.6, 0.003, g);
      for (let k = 0; k < 4; k++) {
        const s = B(0.16, 0.012, 0.004, m, -0.255 + k * 0.17, 1.6, 0.004, g);
        s.rotation.z = 0.6;
      }
      return { w: 0.75, d: 0.01, place: "wall" };
    },
    stool(g) {
      C(0.2, 0.2, 0.05, wood, 0, 0.47, 0, g);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const l = B(0.04, 0.47, 0.04, wood, Math.cos(a) * 0.13, 0.23, Math.sin(a) * 0.13, g);
        l.rotation.z = Math.cos(a) * 0.12;
      }
      return { w: 0.45, d: 0.45, place: "floor" };
    },
    tray(g) {
      B(0.4, 0.02, 0.3, kit.metal("#9aa0a6"), 0, 0.01, 0, g);
      return { w: 0.4, d: 0.3, place: "floor" };
    },
    pipeRun(g) {
      const m = kit.metal(theme.metal, 0.5);
      for (const y of [2.7, 2.95]) {
        const p = C(0.06, 0.06, 2.0, m, 0, y, 0.12, g, 10);
        p.rotation.z = Math.PI / 2;
        for (const x of [-0.8, 0.8]) B(0.06, 0.18, 0.16, kit.dark(), x, y, 0.06, g);
      }
      const v = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.015, 6, 14), kit.std("#c0302a", 0.5));
      v.position.set(0.3, 2.7, 0.22);
      g.add(v);
      return { w: 2.0, d: 0.2, place: "wall" };
    },
    table(g) {
      B(1.4, 0.06, 0.9, wood, 0, 0.75, 0, g);
      legs4(1.4, 0.9, 0.72, wood, g, 0, 0.07);
      return { w: 1.4, d: 0.9, place: "floor" };
    },
    bench(g) {
      B(1.4, 0.05, 0.35, wood, 0, 0.45, 0, g);
      legs4(1.4, 0.35, 0.43, wood, g, 0, 0.06);
      return { w: 1.4, d: 0.35, place: "floor" };
    },
    desk(g) {
      B(1.4, 0.06, 0.7, wood, 0, 0.76, 0.35, g);
      B(0.55, 0.7, 0.66, wood, 0.42, 0.37, 0.35, g);
      B(0.05, 0.73, 0.66, wood, -0.67, 0.37, 0.35, g);
      B(1.3, 0.5, 0.02, wood, 0, 0.45, 0.04, g);
      return { w: 1.4, d: 0.7, place: "wall" };
    },
    lockers(g) {
      for (let i = 0; i < 3; i++) {
        B(0.45, 1.9, 0.5, kit.std("#5a6a5a", 0.5, 0.5), -0.47 + i * 0.47, 0.95, 0.25, g);
        for (let k = 0; k < 4; k++) B(0.25, 0.015, 0.01, kit.dark(), -0.47 + i * 0.47, 1.6 + k * 0.04, 0.505, g);
        B(0.03, 0.12, 0.02, metal, -0.3 + i * 0.47, 1.0, 0.51, g);
      }
      return { w: 1.45, d: 0.5, place: "wall" };
    },
    gurney(g) {
      B(1.8, 0.1, 0.7, kit.std("#d8dcd8", 0.8), 0, 0.8, 0.4, g);
      legs4(1.8, 0.7, 0.75, kit.metal("#aaa"), g, 0, 0.04);
      B(0.4, 0.1, 0.5, kit.std("#f0f0f0", 0.95), -0.65, 0.9, 0.4, g);
      return { w: 1.85, d: 0.75, place: "wall" };
    },
    pew(g) {
      B(1.6, 0.06, 0.45, wood, 0, 0.45, 0, g);
      B(1.6, 0.6, 0.06, wood, 0, 0.75, -0.2, g);
      for (const x of [-0.78, 0.78]) B(0.06, 0.9, 0.45, wood, x, 0.45, 0, g);
      return { w: 1.6, d: 0.5, place: "floor" };
    },
    /* ---------- mansion ---------- */
    fireplace(g) {
      const st = kit.std("#8a7a6a", 0.9);
      B(1.6, 1.3, 0.45, st, 0, 0.65, 0.22, g);
      B(1.8, 0.1, 0.55, kit.std("#5a4030", 0.7), 0, 1.32, 0.27, g);
      B(0.9, 0.8, 0.3, kit.std("#120a06", 1), 0, 0.42, 0.32, g);
      for (let i = 0; i < 3; i++) {
        const l = C(0.05, 0.05, 0.5, kit.std("#3a2412", 0.9), -0.15 + i * 0.15, 0.12, 0.32, g, 8);
        l.rotation.z = Math.PI / 2;
        l.rotation.y = i * 0.4;
      }
      const fire = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 8), kit.glow("#ff7a20", 2.5));
      fire.position.set(0, 0.35, 0.34);
      g.add(fire);
      return { w: 1.8, d: 0.55, place: "wall", light: [0, 0.6, 0.8, "#ff8a30", 6], flicker: fire };
    },
    bookshelf(g) {
      B(1.2, 2.2, 0.38, wood, 0, 1.1, 0.19, g);
      B(1.1, 2.1, 0.3, kit.std("#1a100a", 0.9), 0, 1.1, 0.2, g);
      const cols = ["#7a2a2a", "#2a4a7a", "#2a6a3a", "#6a5a2a", "#4a2a5a", "#8a6a3a", "#3a3a3a"];
      for (let sh = 0; sh < 5; sh++) {
        B(1.1, 0.03, 0.32, wood, 0, 0.2 + sh * 0.42, 0.2, g);
        let x = -0.5;
        while (x < 0.48) {
          const w = 0.035 + rnd() * 0.04, h = 0.26 + rnd() * 0.1;
          B(w, h, 0.22, kit.std(cols[Math.floor(rnd() * cols.length)], 0.8), x + w / 2, 0.2 + sh * 0.42 + 0.015 + h / 2, 0.22, g);
          x += w + 0.005;
        }
      }
      return { w: 1.2, d: 0.4, place: "wall" };
    },
    armchair(g) {
      const f = kit.std(theme.key === "hotel" ? "#3a4a3a" : "#6a1a24", 0.9);
      B(0.8, 0.4, 0.75, f, 0, 0.3, 0, g);
      B(0.8, 0.6, 0.15, f, 0, 0.75, -0.3, g);
      for (const x of [-0.37, 0.37]) B(0.12, 0.3, 0.7, f, x, 0.6, 0.02, g);
      return { w: 0.85, d: 0.8, place: "floor" };
    },
    grandClock(g) {
      B(0.5, 2.1, 0.32, wood, 0, 1.05, 0.16, g);
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.17, 28), kit.std("#efe6cf", 0.6));
      face.position.set(0, 1.75, 0.33);
      g.add(face);
      const hand = B(0.012, 0.13, 0.005, kit.dark(), 0, 1.8, 0.335, g);
      hand.rotation.z = 0.8;
      const pend = new THREE.Group();
      pend.position.set(0, 1.4, 0.3);
      B(0.01, 0.5, 0.01, metal, 0, -0.25, 0, pend);
      C(0.07, 0.07, 0.02, metal, 0, -0.52, 0, pend).rotation.x = Math.PI / 2;
      g.add(pend);
      return { w: 0.55, d: 0.35, place: "wall", swing: pend };
    },
    sideTable(g) {
      C(0.28, 0.28, 0.04, wood, 0, 0.65, 0, g, 20);
      C(0.04, 0.06, 0.63, wood, 0, 0.32, 0, g, 8);
      C(0.18, 0.2, 0.03, wood, 0, 0.015, 0, g, 16);
      C(0.07, 0.1, 0.22, kit.std("#2a5a7a", 0.3, 0.1), 0, 0.78, 0, g);
      return { w: 0.6, d: 0.6, place: "floor" };
    },
    painting(g) {
      const frame = kit.std("#7a5a22", 0.4, 0.5);
      B(0.95, 0.75, 0.05, frame, 0, 1.7, 0.025, g);
      const cv = canvasPainting({ seed: Math.floor(rnd() * 99), palette: [["#2c3e50", "#c0392b", "#e6b35a", "#5d8a4e"], ["#1e2a3a", "#e0a040", "#8a6a9a", "#3a5a3a"], ["#3a2a1a", "#d0c080", "#a05030", "#506030"]][Math.floor(rnd() * 3)] });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.62), new THREE.MeshStandardMaterial({ map: kit.tex(cv), roughness: 0.7 }));
      p.position.set(0, 1.7, 0.052);
      g.add(p);
      return { w: 1.0, d: 0.06, place: "wall" };
    },
    candelabra(g) {
      C(0.12, 0.15, 0.04, metal, 0, 0.02, 0, g);
      C(0.025, 0.025, 1.3, metal, 0, 0.67, 0, g, 8);
      for (const x of [-0.18, 0, 0.18]) {
        C(0.022, 0.022, 0.15, kit.std("#efe8d8", 0.9), x, 1.42, 0, g, 8);
        const f = S(0.025, kit.glow("#ffb050", 3), x, 1.53, 0, g);
        f.scale.y = 1.6;
      }
      B(0.4, 0.02, 0.02, metal, 0, 1.33, 0, g);
      return { w: 0.45, d: 0.3, place: "floor", light: [0, 1.6, 0, "#ffb060", 2.5] };
    },
    plant(g) {
      C(0.18, 0.14, 0.35, kit.std("#7a4a2a", 0.8), 0, 0.17, 0, g);
      for (let i = 0; i < 7; i++) {
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), kit.std("#2a5a2a", 0.8));
        l.scale.set(0.4, 1.4, 0.15);
        l.position.set(Math.cos(i) * 0.1, 0.55, Math.sin(i) * 0.1);
        l.rotation.set(Math.sin(i * 3) * 0.6, i, Math.cos(i * 2) * 0.6);
        l.castShadow = true;
        g.add(l);
      }
      return { w: 0.45, d: 0.45, place: "floor" };
    },
    /* ---------- lab ---------- */
    labBench(g) {
      B(1.8, 0.06, 0.7, kit.std("#2a2e32", 0.4, 0.2), 0, 0.92, 0.35, g);
      B(1.75, 0.88, 0.66, kit.std("#d8dcde", 0.5), 0, 0.44, 0.35, g);
      const glass = kit.std("#cfefff", 0.05, 0.1, { transparent: true, opacity: 0.4 });
      for (let i = 0; i < 4; i++) {
        C(0.04, 0.05, 0.18, glass, -0.6 + i * 0.35, 1.04, 0.35, g);
        C(0.035, 0.045, 0.08, kit.glow(["#3aff8a", "#3a8aff", "#ff3a8a", "#ffd23a"][i], 0.8), -0.6 + i * 0.35, 0.99, 0.35, g);
      }
      return { w: 1.85, d: 0.72, place: "wall" };
    },
    tank(g) {
      C(0.4, 0.4, 0.15, metal, 0, 0.075, 0, g, 24);
      const glass = C(0.36, 0.36, 1.6, kit.std("#9ae8d8", 0.05, 0.1, { transparent: true, opacity: 0.3 }), 0, 0.95, 0, g, 24);
      glass.castShadow = false;
      C(0.34, 0.34, 1.3, kit.glow("#2ad0a0", 0.35), 0, 0.85, 0, g, 24).material.transparent = true;
      C(0.4, 0.4, 0.15, metal, 0, 1.82, 0, g, 24);
      return { w: 0.85, d: 0.85, place: "floor", light: [0, 1, 0, "#3affd0", 2] };
    },
    shelfBottles(g) {
      for (const y of [0.9, 1.4, 1.9]) B(1.0, 0.03, 0.3, metal, 0, y, 0.15, g);
      for (const x of [-0.48, 0.48]) B(0.03, 1.2, 0.3, metal, x, 1.4, 0.15, g);
      for (let i = 0; i < 12; i++) {
        const y = [0.9, 1.4, 1.9][i % 3];
        C(0.035, 0.04, 0.16, kit.std(["#3a8aff", "#ff6a3a", "#5ad05a", "#d0d0d0"][i % 4], 0.2, 0, { transparent: true, opacity: 0.8 }), -0.38 + Math.floor(i / 3) * 0.25, y + 0.1, 0.15, g, 8);
      }
      return { w: 1.0, d: 0.32, place: "wall" };
    },
    computer(g) {
      B(1.2, 0.05, 0.6, kit.std("#3a4248", 0.5, 0.4), 0, 0.75, 0.3, g);
      legs4(1.2, 0.6, 0.72, kit.metal("#777"), g, 0, 0.04);
      B(0.55, 0.36, 0.05, kit.dark(), 0, 1.0, 0.15, g);
      B(0.5, 0.31, 0.01, kit.glow("#2a6aff", 0.6), 0, 1.0, 0.18, g);
      B(0.45, 0.02, 0.15, kit.std("#222"), 0, 0.79, 0.4, g);
      return { w: 1.2, d: 0.6, place: "wall" };
    },
    hazardBin(g) {
      C(0.25, 0.25, 0.6, kit.std("#e8b520", 0.5), 0, 0.3, 0, g, 16);
      C(0.26, 0.26, 0.05, kit.std("#222", 0.5), 0, 0.62, 0, g, 16);
      return { w: 0.55, d: 0.55, place: "floor" };
    },
    whiteboard(g) {
      B(1.4, 0.9, 0.03, kit.std("#f0f2f2", 0.3), 0, 1.6, 0.02, g);
      B(1.45, 0.95, 0.02, metal, 0, 1.6, 0.005, g);
      for (let i = 0; i < 5; i++) B(0.3 + rnd() * 0.6, 0.015, 0.005, kit.std(["#2a4aa0", "#c03030", "#222"][i % 3], 0.5), -0.2 + rnd() * 0.3, 1.85 - i * 0.12, 0.04, g);
      return { w: 1.45, d: 0.05, place: "wall" };
    },
    centrifuge(g) {
      B(0.6, 0.9, 0.6, kit.std("#e0e4e6", 0.5), 0, 0.45, 0, g);
      C(0.25, 0.25, 0.05, kit.dark(), 0, 0.91, 0, g, 24);
      B(0.3, 0.06, 0.01, kit.glow("#3aff8a", 0.8), 0, 0.75, 0.305, g);
      return { w: 0.62, d: 0.62, place: "floor" };
    },
    /* ---------- temple ---------- */
    pillar(g) {
      const st = kit.std("#a8905e", 0.95);
      B(0.7, 0.2, 0.7, st, 0, 0.1, 0, g);
      C(0.26, 0.28, 2.9, st, 0, 1.65, 0, g, 16);
      B(0.7, 0.2, 0.7, st, 0, 3.2, 0, g);
      return { w: 0.75, d: 0.75, place: "floor" };
    },
    statue(g) {
      const st = kit.std("#9a8a6a", 0.9);
      B(0.6, 0.5, 0.6, st, 0, 0.25, 0, g);
      C(0.16, 0.22, 1.0, st, 0, 1.0, 0, g, 12);
      S(0.17, st, 0, 1.68, 0, g);
      for (const x of [-0.26, 0.26]) {
        const a = C(0.06, 0.06, 0.7, st, x, 1.15, 0.05, g, 8);
        a.rotation.z = x > 0 ? -0.2 : 0.2;
      }
      return { w: 0.7, d: 0.7, place: "floor" };
    },
    urn(g) {
      const m = kit.std("#9a5a2a", 0.8);
      const u = S(0.25, m, 0, 0.35, 0, g);
      u.scale.y = 1.3;
      C(0.12, 0.18, 0.18, m, 0, 0.72, 0, g, 14);
      C(0.15, 0.12, 0.08, m, 0, 0.04, 0, g, 14);
      return { w: 0.55, d: 0.55, place: "floor" };
    },
    brazier(g) {
      C(0.3, 0.12, 0.25, kit.metal("#6a4a2a", 0.5), 0, 0.85, 0, g, 16);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const l = B(0.04, 0.8, 0.04, kit.metal("#4a3a2a"), Math.cos(a) * 0.14, 0.4, Math.sin(a) * 0.14, g);
        l.rotation.z = Math.cos(a) * 0.15;
      }
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.45, 8), kit.glow("#ff8a20", 2.5));
      f.position.y = 1.15;
      g.add(f);
      return { w: 0.65, d: 0.65, place: "floor", light: [0, 1.3, 0, "#ff8a30", 5], flicker: f };
    },
    rubble(g) {
      for (let i = 0; i < 7; i++) {
        const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.08 + rnd() * 0.12, 0), kit.std("#8a7a5a", 0.95));
        r.position.set((rnd() - 0.5) * 0.7, 0.06, (rnd() - 0.5) * 0.5);
        r.rotation.set(rnd() * 3, rnd() * 3, 0);
        r.castShadow = true;
        g.add(r);
      }
      return { w: 0.8, d: 0.6, place: "floor" };
    },
    vines(g) {
      const m = kit.std("#2a5a22", 0.9);
      for (let i = 0; i < 18; i++) {
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), m);
        l.scale.set(1, 0.6, 0.25);
        l.position.set((rnd() - 0.5) * 0.9, 1.5 + rnd() * 1.7, 0.03);
        g.add(l);
      }
      return { w: 1.0, d: 0.06, place: "wall" };
    },
    /* ---------- bunker ---------- */
    generator(g) {
      B(1.1, 0.8, 0.6, kit.std("#4a5a3a", 0.6, 0.4), 0, 0.4, 0.3, g);
      B(0.3, 0.2, 0.02, kit.glow("#ffb02a", 0.6), -0.3, 0.6, 0.61, g);
      for (let i = 0; i < 6; i++) B(0.02, 0.5, 0.02, kit.dark(), 0.1 + i * 0.07, 0.4, 0.61, g);
      return { w: 1.15, d: 0.62, place: "wall" };
    },
    crates(g) {
      const m = kit.std("#6a6a3a", 0.85);
      B(0.7, 0.6, 0.6, m, -0.2, 0.3, 0.3, g);
      B(0.6, 0.5, 0.55, m, 0.45, 0.25, 0.3, g);
      B(0.55, 0.45, 0.5, m, 0.0, 0.83, 0.3, g).rotation.y = 0.2;
      return { w: 1.4, d: 0.65, place: "wall" };
    },
    radio(g) {
      B(1.0, 0.05, 0.5, wood, 0, 0.75, 0.25, g);
      legs4(1.0, 0.5, 0.72, wood, g, 0, 0.05);
      B(0.5, 0.3, 0.3, kit.std("#3a4a3a", 0.6, 0.3), 0, 0.93, 0.2, g);
      for (let i = 0; i < 3; i++) C(0.03, 0.03, 0.02, kit.std("#ddd"), -0.12 + i * 0.12, 0.93, 0.36, g, 10).rotation.x = Math.PI / 2;
      C(0.005, 0.005, 0.6, kit.metal("#aaa"), 0.2, 1.38, 0.15, g, 4);
      return { w: 1.0, d: 0.5, place: "wall" };
    },
    mapTable(g) {
      B(1.4, 0.05, 1.0, wood, 0, 0.85, 0, g);
      legs4(1.4, 1.0, 0.83, wood, g, 0, 0.06);
      B(1.2, 0.005, 0.8, kit.std("#c8b888", 0.9), 0, 0.88, 0, g);
      return { w: 1.4, d: 1.0, place: "floor" };
    },
    sandbags(g) {
      const m = kit.std("#8a7a5a", 0.95);
      for (let r = 0; r < 3; r++)
        for (let i = 0; i < 4 - r; i++) {
          const s = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 6), m);
          s.scale.set(1.3, 0.55, 0.8);
          s.position.set(-0.4 + i * 0.28 + r * 0.14, 0.11 + r * 0.2, 0.2);
          s.castShadow = true;
          g.add(s);
        }
      return { w: 1.2, d: 0.4, place: "wall" };
    },
    fireExt(g) {
      C(0.08, 0.08, 0.5, kit.std("#c0201a", 0.4), 0, 0.85, 0.12, g, 12);
      B(0.2, 0.25, 0.02, kit.std("#e8e0d0", 0.6), 0, 1.4, 0.01, g);
      return { w: 0.3, d: 0.2, place: "wall" };
    },
    /* ---------- hotel ---------- */
    bed(g) {
      B(1.5, 0.4, 2.0, wood, 0, 0.2, 1.0, g);
      B(1.45, 0.2, 1.9, kit.std("#e8e2d8", 0.9), 0, 0.5, 1.0, g);
      B(1.5, 0.21, 1.2, kit.std("#6a1a2a", 0.9), 0, 0.51, 1.35, g);
      B(1.5, 1.1, 0.08, wood, 0, 0.55, 0.04, g);
      for (const x of [-0.4, 0.4]) B(0.5, 0.12, 0.3, kit.std("#f4f0e8", 0.95), x, 0.66, 0.3, g);
      return { w: 1.55, d: 2.0, place: "wall" };
    },
    vanity(g) {
      B(1.0, 0.75, 0.45, wood, 0, 0.375, 0.22, g);
      const mir = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), kit.std("#cfdde2", 0.05, 0.95));
      mir.position.set(0, 1.35, 0.02);
      g.add(mir);
      B(0.78, 0.98, 0.02, kit.metal("#b8954a", 0.3), 0, 1.35, 0.008, g);
      return { w: 1.0, d: 0.46, place: "wall" };
    },
    luggage(g) {
      B(0.6, 0.4, 0.22, kit.std("#6a3a1e", 0.6), 0, 0.2, 0, g);
      B(0.5, 0.3, 0.2, kit.std("#2a3a5a", 0.6), 0.1, 0.55, 0, g).rotation.y = 0.3;
      return { w: 0.65, d: 0.3, place: "floor" };
    },
    lamp(g) {
      C(0.12, 0.15, 0.04, metal, 0, 0.02, 0, g);
      C(0.02, 0.02, 1.4, metal, 0, 0.72, 0, g, 8);
      const sh = C(0.12, 0.22, 0.3, kit.std("#e8d8b0", 0.9, 0, { emissive: "#ffcf90", emissiveIntensity: 0.6 }), 0, 1.5, 0, g, 16);
      sh.castShadow = false;
      return { w: 0.45, d: 0.45, place: "floor", light: [0, 1.45, 0, "#ffcf90", 3] };
    },
    elevatorDoor(g) {
      B(1.3, 2.3, 0.08, kit.metal("#b8954a", 0.3), 0, 1.15, 0.04, g);
      B(0.02, 2.2, 0.09, kit.dark(), 0, 1.15, 0.045, g);
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 6, 20, Math.PI), kit.metal("#b8954a", 0.3));
      arc.position.set(0, 2.45, 0.05);
      g.add(arc);
      return { w: 1.4, d: 0.1, place: "wall" };
    },
    /* ---------- factory ---------- */
    bigGear(g) {
      const gm = new THREE.Mesh(gearGeo(0.7, 24, 0.12, 0.15), kit.metal(theme.metal, 0.4));
      gm.position.set(0, 1.6, 0.12);
      gm.castShadow = true;
      g.add(gm);
      return { w: 1.5, d: 0.2, place: "wall", spin: gm };
    },
    boiler(g) {
      const m = kit.metal("#8a5a2a", 0.45);
      C(0.5, 0.5, 1.8, m, 0, 0.95, 0.5, g, 20);
      S(0.5, m, 0, 1.85, 0.5, g).scale.y = 0.4;
      for (const y of [0.4, 1.0, 1.6]) C(0.52, 0.52, 0.05, kit.metal("#6a4a2a"), 0, y, 0.5, g, 20);
      const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20), kit.std("#efe6cf", 0.5));
      gauge.position.set(0, 1.3, 1.01);
      g.add(gauge);
      return { w: 1.05, d: 1.0, place: "wall" };
    },
    conveyor(g) {
      B(2.0, 0.08, 0.6, kit.std("#2a2a2a", 0.9), 0, 0.75, 0.3, g);
      for (let i = 0; i < 9; i++) C(0.05, 0.05, 0.6, metal, -0.9 + i * 0.225, 0.7, 0.3, g, 8).rotation.x = Math.PI / 2;
      legs4(2.0, 0.6, 0.7, metal, g, 0, 0.06);
      B(0.3, 0.25, 0.3, kit.std("#8a6a3a", 0.85), 0.4, 0.92, 0.3, g);
      return { w: 2.0, d: 0.6, place: "wall" };
    },
    toolRack(g) {
      B(1.2, 0.9, 0.03, kit.std("#7a6a4a", 0.9), 0, 1.5, 0.015, g);
      for (let i = 0; i < 5; i++) {
        B(0.03, 0.35, 0.03, kit.metal("#999"), -0.45 + i * 0.22, 1.55, 0.05, g).rotation.z = (rnd() - 0.5) * 0.4;
        B(0.08, 0.08, 0.05, kit.std(["#c0302a", "#2a4aa0", "#e8b520"][i % 3], 0.5), -0.45 + i * 0.22, 1.35, 0.06, g);
      }
      return { w: 1.2, d: 0.08, place: "wall" };
    },
    gaugePanel(g) {
      B(1.0, 0.6, 0.06, kit.metal(theme.metal, 0.5), 0, 1.5, 0.03, g);
      for (let i = 0; i < 3; i++) {
        const f = new THREE.Mesh(new THREE.CircleGeometry(0.11, 20), kit.std("#efe6cf", 0.5));
        f.position.set(-0.3 + i * 0.3, 1.5, 0.065);
        g.add(f);
        const n = B(0.01, 0.09, 0.005, kit.std("#c0302a"), -0.3 + i * 0.3, 1.52, 0.07, g);
        n.rotation.z = (rnd() - 0.5) * 2;
      }
      return { w: 1.0, d: 0.08, place: "wall" };
    },
    barrels(g) {
      for (const [x, z] of [[-0.3, 0], [0.3, 0.05], [0, -0.45]]) {
        C(0.28, 0.28, 0.85, kit.std(["#3a5a7a", "#8a3a2a", "#4a6a3a"][Math.floor(rnd() * 3)], 0.5, 0.4), x, 0.425, z, g, 16);
        for (const y of [0.15, 0.7]) C(0.29, 0.29, 0.04, kit.metal("#555"), x, y, z, g, 16);
      }
      return { w: 1.2, d: 1.0, place: "floor" };
    },
    /* ---------- space ---------- */
    porthole(g) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.08, 10, 36), kit.metal("#aab4c0", 0.3));
      ring.position.set(0, 1.7, 0.06);
      g.add(ring);
      const win = new THREE.Mesh(new THREE.CircleGeometry(0.47, 36), new THREE.MeshBasicMaterial({ map: kit.starTex() }));
      win.position.set(0, 1.7, 0.03);
      g.add(win);
      const planet = S(0.18, kit.glow("#3a6aff", 0.6), 0.18, 1.6, 0.0, g);
      planet.scale.z = 0.1;
      return { w: 1.2, d: 0.15, place: "wall", light: [0, 1.7, 0.6, "#8ab8ff", 2] };
    },
    consoleDesk(g) {
      const m = kit.std("#c4cad2", 0.4, 0.5);
      B(1.6, 0.9, 0.5, m, 0, 0.45, 0.25, g);
      const top = B(1.6, 0.05, 0.6, kit.std("#2a3038", 0.4, 0.4), 0, 0.95, 0.3, g);
      top.rotation.x = -0.25;
      for (let i = 0; i < 8; i++) B(0.08, 0.03, 0.06, kit.glow(["#3affd0", "#ff3a6a", "#ffd23a", "#3a8aff"][i % 4], 1.4), -0.6 + i * 0.17, 0.99, 0.35, g);
      B(1.2, 0.5, 0.03, kit.glow("#1a4a7a", 0.8), 0, 1.4, 0.05, g);
      return { w: 1.6, d: 0.6, place: "wall" };
    },
    cryoPod(g) {
      const m = kit.std("#d0d6dc", 0.3, 0.6);
      B(0.8, 2.0, 0.6, m, 0, 1.0, 0.3, g);
      const glass = B(0.6, 1.5, 0.05, kit.std("#9ae8ff", 0.05, 0.1, { transparent: true, opacity: 0.35, emissive: "#3ab8ff", emissiveIntensity: 0.3 }), 0, 1.1, 0.62, g);
      glass.castShadow = false;
      B(0.6, 0.06, 0.02, kit.glow("#3affd0", 1.5), 0, 1.95, 0.61, g);
      return { w: 0.85, d: 0.65, place: "wall", light: [0, 1.2, 0.9, "#6ad8ff", 1.6] };
    },
    robotArm(g) {
      const m = kit.std("#e8a020", 0.4, 0.5);
      C(0.25, 0.3, 0.2, kit.dark(), 0, 0.1, 0, g);
      const a1 = B(0.12, 0.9, 0.12, m, 0, 0.6, 0, g);
      a1.rotation.z = 0.3;
      const a2 = B(0.1, 0.7, 0.1, m, 0.38, 1.15, 0, g);
      a2.rotation.z = -0.9;
      S(0.08, kit.dark(), 0.13, 1.03, 0, g);
      return { w: 0.8, d: 0.6, place: "floor" };
    },
    cables(g) {
      for (let i = 0; i < 4; i++) {
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.6 + i * 0.1, 3.3, 0.05), new THREE.Vector3(-0.2 + i * 0.12, 2.2 - i * 0.1, 0.12), new THREE.Vector3(0.5 + i * 0.05, 3.3, 0.05)]);
        const t = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.02, 6), kit.std(["#222", "#c03a2a", "#2a4aa0", "#e8b520"][i], 0.6));
        g.add(t);
      }
      return { w: 1.3, d: 0.15, place: "wall" };
    },
    holoTable(g) {
      C(0.5, 0.55, 0.85, kit.std("#c4cad2", 0.4, 0.5), 0, 0.425, 0, g, 24);
      const holo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 1), kit.std("#3affd0", 0.3, 0, { emissive: "#3affd0", emissiveIntensity: 1, wireframe: true }));
      holo.position.y = 1.25;
      g.add(holo);
      return { w: 1.1, d: 1.1, place: "floor", spin: holo, light: [0, 1.3, 0, "#3affd0", 2] };
    },
    storageRack(g) {
      const m = kit.std("#aab4c0", 0.4, 0.6);
      for (const y of [0.4, 1.0, 1.6]) B(1.0, 0.04, 0.45, m, 0, y, 0.22, g);
      for (const x of [-0.48, 0.48]) B(0.04, 1.9, 0.45, m, x, 0.95, 0.22, g);
      for (let i = 0; i < 5; i++) B(0.28, 0.22, 0.3, kit.std(["#e8a020", "#c4cad2", "#3a4a5a"][i % 3], 0.5, 0.3), -0.3 + (i % 3) * 0.3, [0.53, 1.13, 1.73][i % 3], 0.22, g);
      return { w: 1.0, d: 0.45, place: "wall" };
    },
    /* ---------- dimension ---------- */
    floatCubes(g) {
      const cubes = [];
      for (let i = 0; i < 5; i++) {
        const c = B(0.15 + rnd() * 0.25, 0.15 + rnd() * 0.25, 0.15 + rnd() * 0.25, kit.std(["#e8e4ff", "#7a5aff", "#2a1a5a"][i % 3], 0.4, 0.2), (rnd() - 0.5) * 1.2, 0.8 + rnd() * 1.6, (rnd() - 0.5) * 1.0, g);
        c.userData.base = c.position.y;
        c.userData.ph = rnd() * 6;
        cubes.push(c);
      }
      return { w: 1.2, d: 1.0, place: "floor", bob: cubes };
    },
    impossible(g) {
      const m = kit.std("#c8b8ff", 0.4);
      B(1.2, 0.12, 0.12, m, 0, 0.8, 0.3, g);
      B(0.12, 1.2, 0.12, m, 0.54, 1.34, 0.3, g);
      B(0.12, 0.12, 1.0, m, -0.54, 0.8, 0.8, g);
      B(1.2, 0.12, 0.12, m, 0, 1.88, 0.3, g);
      return { w: 1.3, d: 0.5, place: "wall" };
    },
    portalRing(g) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 10, 40), kit.glow("#b46aff", 1.5));
      r.position.set(0, 1.4, 0.1);
      g.add(r);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.5, 40), kit.std("#2a0a5a", 0.2, 0, { emissive: "#5a2aaa", emissiveIntensity: 0.8 }));
      disc.position.set(0, 1.4, 0.09);
      g.add(disc);
      return { w: 1.3, d: 0.2, place: "wall", spin: r, light: [0, 1.4, 0.5, "#b46aff", 3] };
    },
    stairsVoid(g) {
      const m = kit.std("#e8e4ff", 0.5);
      for (let i = 0; i < 6; i++) B(0.6, 0.12, 0.3, m, 0, 0.2 + i * 0.3, 0.2 + i * 0.05, g).rotation.y = i * 0.25;
      return { w: 0.8, d: 0.6, place: "wall" };
    },
    crystal(g) {
      const m = kit.std("#c9a2ff", 0.1, 0, { emissive: "#8a4aff", emissiveIntensity: 0.6, transparent: true, opacity: 0.85 });
      for (let i = 0; i < 5; i++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.08 + rnd() * 0.06, 0.4 + rnd() * 0.5, 6), m);
        c.position.set((rnd() - 0.5) * 0.4, 0.25, (rnd() - 0.5) * 0.4);
        c.rotation.set((rnd() - 0.5) * 0.6, 0, (rnd() - 0.5) * 0.6);
        g.add(c);
      }
      return { w: 0.55, d: 0.55, place: "floor", light: [0, 0.5, 0, "#a06aff", 1.6] };
    },
  };
  return D;
}
