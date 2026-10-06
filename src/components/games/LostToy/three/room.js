/**
 * Lost Toy — the room shell and its atmosphere.
 *
 *   floor (planks / tiles / concrete / carpet), wallpapered walls with a
 *   window hole, baseboards + crown molding (the toy's-eye scale cues),
 *   window frame, glass, sill, a painted outside view (afternoon / day /
 *   overcast / night), doors, ceiling, warm sun shafts with floating dust.
 *   Backyard levels get a sky dome, a grass ground and the house wall instead.
 *
 * Collision for the shell lives in data/kit.js (room / yard); nothing here
 * is solid.
 */
import * as THREE from "three";
import { mat, worldUV, KINDS, glowTexture, shaftTexture, labelTexture } from "./materials.js";
import { Parts, mergeParts, rbox, wallFrame, BUILDERS } from "./props.js";

const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ outside view */
function outsideTexture(kind) {
  return labelTexture(`outside:${kind}`, 1024, 512, (g, w, h) => {
    const sky = {
      afternoon: ["#9cc7e6", "#f6d6a8", "#f7c690"],
      day: ["#7fb8e8", "#bfe0f5", "#e8f4fb"],
      overcast: ["#9aa6b2", "#c4ccd4", "#d9dde2"],
      garden: ["#7fb8e8", "#bfe0f5", "#e8f4fb"],
      night: ["#0d1330", "#1e2a5a", "#33407a"],
    }[kind] || ["#9cc7e6", "#f6d6a8", "#f7c690"];
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, sky[0]);
    gr.addColorStop(0.62, sky[1]);
    gr.addColorStop(1, sky[2]);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    const night = kind === "night";
    if (night) {
      for (let i = 0; i < 140; i++) {
        g.fillStyle = `rgba(255,255,240,${0.3 + ((i * 37) % 10) / 14})`;
        g.fillRect((i * 263) % w, (i * 97) % (h * 0.6), 2, 2);
      }
      g.fillStyle = "#fff6d6";
      g.beginPath();
      g.arc(w * 0.72, h * 0.22, 34, 0, TAU);
      g.fill();
      g.fillStyle = "rgba(255,246,214,0.15)";
      g.beginPath();
      g.arc(w * 0.72, h * 0.22, 70, 0, TAU);
      g.fill();
    } else {
      // sun glow + soft clouds
      const sx = kind === "afternoon" ? w * 0.3 : w * 0.68;
      const sy = kind === "afternoon" ? h * 0.42 : h * 0.18;
      const sg = g.createRadialGradient(sx, sy, 0, sx, sy, 220);
      sg.addColorStop(0, kind === "overcast" ? "rgba(255,255,255,0.4)" : "rgba(255,248,220,1)");
      sg.addColorStop(0.15, kind === "overcast" ? "rgba(255,255,255,0.2)" : "rgba(255,236,190,0.7)");
      sg.addColorStop(1, "rgba(255,236,190,0)");
      g.fillStyle = sg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = kind === "overcast" ? "rgba(235,238,242,0.7)" : "rgba(255,255,255,0.75)";
      for (let i = 0; i < 9; i++) {
        const cx = ((i * 241) % w) + 40;
        const cy = 50 + ((i * 53) % 130);
        for (let k = 0; k < 5; k++) {
          g.beginPath();
          g.ellipse(cx + k * 26 - 50, cy + Math.sin(k * 1.7) * 8, 34, 18, 0, 0, TAU);
          g.fill();
        }
      }
    }
    // distant rooftops + trees + a fence
    const hz = h * 0.66;
    g.fillStyle = night ? "#1a2040" : "#b99a8a";
    for (let i = 0; i < 6; i++) {
      const x = i * 190 + 40;
      g.fillRect(x, hz - 70, 120, 90);
      g.beginPath();
      g.moveTo(x - 14, hz - 70);
      g.lineTo(x + 60, hz - 125);
      g.lineTo(x + 134, hz - 70);
      g.fill();
      if (night) {
        g.fillStyle = "#ffd27a";
        g.fillRect(x + 30, hz - 40, 18, 18);
        g.fillStyle = "#1a2040";
      }
    }
    g.fillStyle = night ? "#121a33" : kind === "overcast" ? "#6f8a70" : "#5f9b52";
    for (let i = 0; i < 14; i++) {
      const x = (i * 83 + 20) % w;
      const r = 40 + ((i * 29) % 40);
      g.beginPath();
      g.arc(x, hz - 10, r, 0, TAU);
      g.arc(x + r * 0.7, hz + 5, r * 0.8, 0, TAU);
      g.fill();
    }
    g.fillStyle = night ? "#0e1428" : "#7d9a5a";
    g.fillRect(0, hz + 20, w, h - hz);
    g.fillStyle = night ? "#232a48" : "#efe3cf";
    for (let x = 0; x < w; x += 26) g.fillRect(x, hz + 2, 16, 56);
    g.fillRect(0, hz + 14, w, 8);
  });
}

/* ------------------------------------------------------------------ build */
export function buildRoom(scene, level, theme, quality, { shadows = true } = {}) {
  const group = new THREE.Group();
  group.name = "room";
  scene.add(group);
  const dynamic = [];
  const disposables = [];
  const room = level.room;
  if (!room) return { group, update() {}, dispose() {} };
  if (room.outdoor) return buildYard(scene, group, level, theme, quality, { shadows, dynamic, disposables });

  const { x0, x1, z0, z1, h } = room;
  const P = new Parts();
  const floorKind = { planks: "planks", tiles: "tiles", concrete: "stone", carpet: "fabric" }[room.floor] || "planks";
  const floorColor = room.floorColor || { planks: "#d9a873", tiles: "#ffffff", concrete: "#b9b6b0", carpet: "#9fb5c9" }[room.floor] || "#d9a873";
  P.frame(0, 0, 0);
  P.add(new THREE.BoxGeometry(x1 - x0, 0.5, z1 - z0), floorKind, floorColor, { p: [(x0 + x1) / 2, -0.25, (z0 + z1) / 2], cast: false });

  // walls (with holes for windows on any wall)
  const wallColor = room.wall;
  const wallKind = room.wallKind || "wall";
  const T = 0.4;
  const walls = [
    { wall: "back", a0: x0, a1: x1 },
    { wall: "front", a0: x0, a1: x1 },
    { wall: "left", a0: z0, a1: z1 },
    { wall: "right", a0: z0, a1: z1 },
  ];
  const wins = room.windows || [];
  const doors = room.doors || [];
  for (const W of walls) {
    const holes = [...wins.filter((w) => w.wall === W.wall).map((w) => ({ c: w.c, w: w.w, y0: w.y, y1: w.y + w.h }))];
    // split the wall into vertical strips around each hole
    const cuts = holes.slice().sort((a, b) => a.c - b.c);
    let a = W.a0;
    const strips = [];
    for (const hl of cuts) {
      strips.push({ a0: a, a1: hl.c - hl.w / 2, y0: 0, y1: h });
      strips.push({ a0: hl.c - hl.w / 2, a1: hl.c + hl.w / 2, y0: 0, y1: hl.y0 });
      strips.push({ a0: hl.c - hl.w / 2, a1: hl.c + hl.w / 2, y0: hl.y1, y1: h });
      a = hl.c + hl.w / 2;
    }
    strips.push({ a0: a, a1: W.a1, y0: 0, y1: h });
    for (const s of strips) {
      const len = s.a1 - s.a0;
      if (len <= 0.01 || s.y1 - s.y0 <= 0.01) continue;
      const c = (s.a0 + s.a1) / 2;
      wallFrame(P, W.wall, room, c, 0, 0);
      P.add(new THREE.BoxGeometry(len, s.y1 - s.y0, T), wallKind, wallColor, { p: [0, (s.y0 + s.y1) / 2, -T / 2], cast: false });
    }
    // baseboard + crown molding along the full wall (skipping door openings)
    const dlist = doors.filter((d) => d.wall === W.wall).sort((p, q) => p.c - q.c);
    let b = W.a0;
    const runs = [];
    for (const d of dlist) {
      runs.push([b, d.c - d.w / 2 - 0.6]);
      b = d.c + d.w / 2 + 0.6;
    }
    runs.push([b, W.a1]);
    for (const [r0, r1] of runs) {
      if (r1 - r0 < 0.1) continue;
      wallFrame(P, W.wall, room, (r0 + r1) / 2, 0, 0);
      P.add(rbox(r1 - r0, 1.1, 0.32, 0.06, 1), "woodPaint", room.trim, { p: [0, 0.55, 0.12] });
      P.add(new THREE.BoxGeometry(r1 - r0, 0.12, 0.38), "woodPaint", room.trim, { p: [0, 1.12, 0.14], cast: false });
    }
    wallFrame(P, W.wall, room, (W.a0 + W.a1) / 2, 0, 0);
    P.add(rbox(W.a1 - W.a0, 0.9, 0.5, 0.1, 1), "woodPaint", room.trim, { p: [0, h - 0.45, 0.2], cast: false });
  }
  // ceiling
  P.frame(0, 0, 0);
  P.add(new THREE.BoxGeometry(x1 - x0, 0.4, z1 - z0), "paint", room.ceiling, { p: [(x0 + x1) / 2, h + 0.2, (z0 + z1) / 2], cast: false });

  // windows: frame, mullions, sill, glass, outside view
  const outsideTex = outsideTexture(theme.outside || "afternoon");
  for (const w of wins) {
    wallFrame(P, w.wall, room, w.c, w.y, 0);
    const fw = 0.55;
    P.add(rbox(w.w + fw * 2, fw, 0.9, 0.08, 1), "woodPaint", room.trim, { p: [0, w.h + fw / 2, 0.1] });
    P.add(rbox(fw, w.h + fw * 2, 0.9, 0.08, 1), "woodPaint", room.trim, { p: [-w.w / 2 - fw / 2, w.h / 2, 0.1] });
    P.add(rbox(fw, w.h + fw * 2, 0.9, 0.08, 1), "woodPaint", room.trim, { p: [w.w / 2 + fw / 2, w.h / 2, 0.1] });
    // mullions (a cross) set back in the opening
    P.add(new THREE.BoxGeometry(0.32, w.h, 0.32), "woodPaint", room.trim, { p: [0, w.h / 2, -0.25] });
    P.add(new THREE.BoxGeometry(w.w, 0.32, 0.32), "woodPaint", room.trim, { p: [0, w.h * 0.58, -0.25] });
    // sill (matches the collision box from kit.room)
    const sd = w.sill || 0.9;
    P.add(rbox(w.w + 1.2, 0.35, sd + 0.1, 0.08, 1), "woodPaint", room.trim, { p: [0, -0.175, sd / 2 - 0.05] });
    // glass
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w.w, w.h), new THREE.MeshPhysicalMaterial({ color: "#e8f4ff", transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0, depthWrite: false }));
    disposables.push(glass.geometry, glass.material);
    placeWallObj(glass, w.wall, room, w.c, w.y + w.h / 2, -0.2);
    group.add(glass);
    // outside view far behind the opening (parallax), self-lit
    const vw = w.w * 3.2;
    const vh = vw / 2;
    const view = new THREE.Mesh(new THREE.PlaneGeometry(vw, vh), new THREE.MeshBasicMaterial({ map: outsideTex, fog: false, toneMapped: true }));
    disposables.push(view.geometry, view.material);
    placeWallObj(view, w.wall, room, w.c, w.y + w.h * 0.4, -16);
    group.add(view);
  }
  for (const d of doors) BUILDERS.door(P, { ...d, room, color: d.color || "#f4ebdd" });

  for (const m of mergeParts(P, { shadows })) {
    // the shell only RECEIVES shadows (furniture does the casting)
    m.castShadow = false;
    group.add(m);
  }

  // sun shafts + dust motes in the light
  if (theme.shafts && wins.length && quality !== "low") {
    const sun = new THREE.Vector3(...theme.sun.pos).normalize();
    const dir = sun.clone().multiplyScalar(-1);
    const tex = shaftTexture();
    const smat = new THREE.MeshBasicMaterial({ map: tex, color: theme.night ? "#9fb0ff" : "#ffe2b0", transparent: true, opacity: theme.night ? 0.07 : 0.11, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    disposables.push(smat);
    const shafts = [];
    for (const w of wins) {
      const n = quality === "high" ? 6 : 4;
      for (let i = 0; i < n; i++) {
        const along = w.c - w.w / 2 + ((i + 0.5) / n) * w.w;
        const y = w.y + w.h * (0.3 + ((i * 37) % 10) / 16);
        const start = wallPoint(w.wall, room, along, y, 0.2);
        // length until the ray meets the floor
        const L = Math.min(60, y / Math.max(0.2, -dir.y));
        const geo = new THREE.PlaneGeometry(1.6 + (i % 3) * 0.9, L);
        geo.translate(0, -L / 2, 0);
        disposables.push(geo);
        const m = new THREE.Mesh(geo, smat);
        m.position.copy(start);
        m.renderOrder = 5;
        group.add(m);
        shafts.push({ m, start, ph: i * 1.7 });
      }
    }
    const up = new THREE.Vector3();
    const look = new THREE.Vector3();
    dynamic.push({
      t: 0,
      update(dt, ctx) {
        this.t += dt;
        // billboard each shaft around its own axis (the light direction)
        for (const s of shafts) {
          const cam = ctx.camera.position;
          up.copy(dir).multiplyScalar(-1);
          look.copy(cam).sub(s.start);
          look.addScaledVector(up, -look.dot(up)).normalize();
          const xAxis = new THREE.Vector3().crossVectors(up, look).normalize();
          const zAxis = new THREE.Vector3().crossVectors(xAxis, up).normalize();
          s.m.matrix.makeBasis(xAxis, up, zAxis);
          s.m.matrix.setPosition(s.start);
          s.m.matrixAutoUpdate = false;
          s.m.material.opacity = (theme.night ? 0.06 : 0.1) * (ctx.motion ? 0.85 + Math.sin(this.t * 0.4 + s.ph) * 0.15 : 1);
        }
      },
    });
  }
  const motes = buildMotes(group, level, theme, quality, disposables);
  if (motes) dynamic.push(motes);

  return {
    group,
    update(dt, ctx) {
      for (const d of dynamic) d.update(dt, ctx);
    },
    dispose() {
      scene.remove(group);
      group.traverse((o) => {
        if (o.isMesh && o.geometry) o.geometry.dispose();
      });
      for (const d of disposables) d.dispose && d.dispose();
    },
  };
}

function wallPoint(wall, room, along, y, out) {
  if (wall === "back") return new THREE.Vector3(along, y, room.z0 + out);
  if (wall === "front") return new THREE.Vector3(along, y, room.z1 - out);
  if (wall === "left") return new THREE.Vector3(room.x0 + out, y, along);
  return new THREE.Vector3(room.x1 - out, y, along);
}
function placeWallObj(o, wall, room, along, y, out) {
  o.position.copy(wallPoint(wall, room, along, y, out));
  o.rotation.y = wall === "back" ? 0 : wall === "front" ? Math.PI : wall === "left" ? Math.PI / 2 : -Math.PI / 2;
}

/** floating dust motes drifting in the room light (count by quality) */
function buildMotes(group, level, theme, quality, disposables) {
  const n = quality === "high" ? 520 : quality === "medium" ? 260 : 90;
  const room = level.room;
  const x0 = room.x0;
  const x1 = room.x1;
  const z0 = room.z0;
  const z1 = room.z1;
  const hMax = room.outdoor ? 14 : room.h - 2;
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = x0 + Math.random() * (x1 - x0);
    pos[i * 3 + 1] = 0.5 + Math.random() * hMax;
    pos[i * 3 + 2] = z0 + Math.random() * (z1 - z0);
    seed[i] = Math.random() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ map: glowTexture(), color: theme.night ? "#cfd8ff" : room.outdoor ? "#fff8d0" : "#fff1d0", size: 0.16, sizeAttenuation: true, transparent: true, opacity: theme.night ? 0.55 : 0.7, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  const pts = new THREE.Points(geo, m);
  pts.frustumCulled = false;
  group.add(pts);
  disposables.push(geo, m);
  return {
    t: 0,
    update(dt, ctx) {
      if (!ctx.motion) return;
      this.t += dt;
      const p = geo.attributes.position.array;
      for (let i = 0; i < n; i++) {
        const s = seed[i];
        p[i * 3] += Math.sin(this.t * 0.21 + s) * 0.08 * dt;
        p[i * 3 + 1] += (Math.sin(this.t * 0.17 + s * 1.3) * 0.05 - 0.012) * dt;
        p[i * 3 + 2] += Math.cos(this.t * 0.19 + s * 0.7) * 0.08 * dt;
        if (p[i * 3 + 1] < 0.3) p[i * 3 + 1] = hMax;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

/* ------------------------------------------------------------------ backyard */
function buildYard(scene, group, level, theme, quality, { shadows, dynamic, disposables }) {
  const room = level.room;
  const { x0, x1, z0, z1 } = room;
  const P = new Parts();
  P.frame(0, 0, 0);
  // ground: lawn with a soil border
  P.add(new THREE.BoxGeometry(x1 - x0 + 400, 0.5, z1 - z0 + 400), "grass", "#8cbc5a", { p: [(x0 + x1) / 2, -0.25, (z0 + z1) / 2], cast: false });
  for (const m of mergeParts(P, { shadows })) {
    m.castShadow = false;
    group.add(m);
  }
  // sky dome
  const skyTex = labelTexture(`skydome:${theme.outside}`, 256, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "#6aa9e0");
    gr.addColorStop(0.5, "#a9d4f2");
    gr.addColorStop(1, "#e9f5fb");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
  disposables.push(dome.geometry, dome.material);
  group.add(dome);
  const motes = buildMotes(group, level, theme, quality, disposables);
  if (motes) dynamic.push(motes);
  return {
    group,
    update(dt, ctx) {
      for (const d of dynamic) d.update(dt, ctx);
    },
    dispose() {
      scene.remove(group);
      group.traverse((o) => {
        if (o.isMesh && o.geometry) o.geometry.dispose();
      });
      for (const d of disposables) d.dispose && d.dispose();
    },
  };
}

export { outsideTexture, wallPoint, placeWallObj };
export const _unused = { worldUV, KINDS, mat };
