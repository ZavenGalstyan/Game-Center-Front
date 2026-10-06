/**
 * Lost Toy — hazards and pets (visual side; behaviour lives in engine/world.js).
 *
 * Hazards are readable: each telegraphs before it matters (vacuum hum + light
 * + moving head, drip warning ring, sprinkler wind-up, fan streaks).
 * Pets are friendly and playful, never threatening: a cat (walks, sits,
 * looks at the toy, swats at a toy mouse, curls up) and a small dog (trots,
 * sniffs, wags, plays with a ball).
 */
import * as THREE from "three";
import { mat, worldUV, KINDS } from "./materials.js";
import { Parts, mergeParts, rbox, blob, cyl } from "./props.js";

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerpAngle = (a, b, t) => {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return a + d * t;
};

function grp(build) {
  const P = new Parts();
  build(P);
  const g = new THREE.Group();
  for (const m of mergeParts(P, { shadows: true })) {
    m.matrixAutoUpdate = true;
    g.add(m);
  }
  return g;
}
function meshOf(geo, m, kind) {
  if (kind) worldUV(geo, KINDS[kind].density);
  const o = new THREE.Mesh(geo, m);
  o.castShadow = true;
  return o;
}

/* ================================================================== hazards */
export function buildHazard(h, level, quality, { shadows = true } = {}) {
  switch (h.type) {
    case "vacuum":
      return vacuum(h);
    case "water":
      return water(h);
    case "wind":
      return wind(h, quality);
    case "drip":
    case "steam":
      return drip(h);
    case "sprinkler":
      return sprinkler(h);
    case "roller":
      return roller(h);
    case "zone":
      return zone(h);
    case "swing":
      return swing(h);
    default:
      return null;
  }
  void shadows;
}

function vacuum(h) {
  // an upright vacuum: wide nozzle head on the floor, tall body, bag, handle
  const g = new THREE.Group();
  const r = h.r || 1.4;
  const body = grp((P) => {
    P.frame(0, 0, 0);
    P.add(rbox(r * 2.4, 0.9, r * 1.3, 0.25, 2), "plastic", h.color || "#d9473b", { p: [0, 0.55, 0] });
    P.add(rbox(r * 2.5, 0.25, r * 1.4, 0.1, 1), "rubber", "#2a2a2e", { p: [0, 0.14, 0] });
    for (const s of [-1, 1]) P.add(cyl(0.35, 0.35, 0.3, 16), "rubber", "#2a2a2e", { p: [s * r * 1.1, 0.35, -r * 0.5], r: [0, 0, Math.PI / 2] });
    P.add(rbox(1.6, 9, 1.4, 0.4, 2), "plastic", "#f4f0e6", { p: [0, 5.2, -r * 0.3], r: [-0.25, 0, 0] });
    P.add(rbox(2.2, 5, 1.9, 0.6, 3), "fabric", "#8fa6c9", { p: [0, 6.2, -r * 0.65], r: [-0.25, 0, 0] });
    P.add(cyl(0.18, 0.18, 6, 10), "metal", "#c9ccd2", { p: [0, 11.5, -r * 1.6], r: [-0.25, 0, 0] });
  });
  g.add(body);
  const lightMat = new THREE.MeshStandardMaterial({ color: "#ffcf6e", emissive: "#ffb43a", emissiveIntensity: 1.2 });
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), lightMat);
  light.position.set(0, 0.7, r * 0.66);
  g.add(light);
  // a soft suction cone of drifting dust in front (purely visual)
  const coneMat = new THREE.MeshBasicMaterial({ color: "#fff4dc", transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(h.suction ? h.suction * 0.45 : 1, h.suction || 2, 24, 1, true), coneMat);
  cone.rotation.x = -Math.PI / 2;
  cone.position.set(0, 0.6, r * 0.6 + (h.suction || 2) / 2);
  g.add(cone);
  return {
    obj: g,
    update(dt, W, ctx) {
      g.position.set(h.x, h.y, h.z);
      g.rotation.y = h.heading || 0;
      g.visible = true;
      const on = h.on;
      lightMat.emissiveIntensity = on ? 1 + Math.sin(ctx.clock * 9) * 0.4 : 0.1;
      coneMat.opacity = on ? 0.06 + Math.sin(ctx.clock * 6) * 0.02 : 0;
      body.position.y = on && ctx.motion ? Math.sin(ctx.clock * 40) * 0.01 : 0;
    },
    dispose() {
      lightMat.dispose();
      coneMat.dispose();
      light.geometry.dispose();
      cone.geometry.dispose();
    },
  };
}

function water(h) {
  const g = new THREE.Group();
  const [w, hh, d] = h.size;
  const m = new THREE.MeshStandardMaterial({ color: h.deep ? "#5b9cc9" : "#9ccbe6", transparent: true, opacity: h.deep ? 0.72 : 0.5, roughness: 0.06, metalness: 0.1, depthWrite: false });
  const surf = new THREE.Mesh(new THREE.PlaneGeometry(w, d, 16, 16), m);
  surf.rotation.x = -Math.PI / 2;
  surf.position.set(h.x, h.y + hh, h.z);
  surf.renderOrder = 3;
  g.add(surf);
  const base = surf.geometry.attributes.position.array.slice();
  if (h.deep) {
    const vol = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), new THREE.MeshStandardMaterial({ color: "#3f7fa8", transparent: true, opacity: 0.35, depthWrite: false }));
    vol.position.set(h.x, h.y + hh / 2, h.z);
    g.add(vol);
  }
  return {
    obj: g,
    update(dt, W, ctx) {
      if (!ctx.motion) return;
      const p = surf.geometry.attributes.position;
      const a = p.array;
      for (let i = 0; i < p.count; i++) {
        const x = base[i * 3];
        const y = base[i * 3 + 1];
        a[i * 3 + 2] = Math.sin(x * 1.3 + ctx.clock * 1.6) * 0.02 + Math.cos(y * 1.1 + ctx.clock * 1.3) * 0.02;
      }
      p.needsUpdate = true;
      surf.geometry.computeVertexNormals();
    },
    dispose() {
      g.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          o.material.dispose();
        }
      });
    },
  };
}

function wind(h, quality) {
  const g = new THREE.Group();
  const [w, hh, d] = h.size;
  let blades = null;
  if (h.look === "fan") {
    // a desk fan at the upwind end of the zone
    const fx = h.fanAt ? h.fanAt[0] : h.x - h.dir[0] * (w / 2 + 1.2);
    const fz = h.fanAt ? h.fanAt[2] : h.z - h.dir[2] * (d / 2 + 1.2);
    const fan = grp((P) => {
      P.frame(0, 0, 0);
      P.add(cyl(1.4, 1.6, 0.4, 24), "plastic", "#f4f0e6", { p: [0, 0.2, 0] });
      P.add(cyl(0.25, 0.25, h.fanY || 3, 10), "plastic", "#f4f0e6", { p: [0, (h.fanY || 3) / 2, 0] });
      P.add(new THREE.TorusGeometry(2.2, 0.08, 6, 40), "metal", "#c9ccd2", { p: [0, h.fanY || 3, 0.2] });
      P.add(new THREE.SphereGeometry(0.7, 16, 12), "plastic", "#7fb5c9", { p: [0, h.fanY || 3, -0.4] });
    });
    fan.position.set(fx, h.fanAt ? h.fanAt[1] : h.y, fz);
    fan.rotation.y = Math.atan2(h.dir[0], h.dir[2]);
    if (h.fanScale) fan.scale.setScalar(h.fanScale);
    g.add(fan);
    blades = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(blob(0.9, 1.9, 0.08, 2.2, 2.2), mat("plastic", "#9fd0ff"));
      b.position.y = 1.0;
      const arm = new THREE.Group();
      arm.rotation.z = (i / 3) * TAU;
      arm.add(b);
      blades.add(arm);
    }
    blades.position.set(0, h.fanY || 3, 0.1);
    fan.add(blades);
  }
  // streaks
  const n = quality === "high" ? 26 : quality === "medium" ? 16 : 8;
  const sm = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
  const sg = new THREE.PlaneGeometry(0.05, 1.6);
  sg.rotateX(Math.PI / 2);
  const streaks = [];
  for (let i = 0; i < n; i++) {
    const s = new THREE.Mesh(sg, sm);
    s.rotation.y = Math.atan2(h.dir[0], h.dir[2]);
    g.add(s);
    streaks.push({ s, u: Math.random(), ox: (Math.random() - 0.5) * w, oy: Math.random() * hh, oz: (Math.random() - 0.5) * d });
  }
  return {
    obj: g,
    update(dt, W, ctx) {
      const on = h.on;
      if (blades) blades.rotation.z -= dt * (on ? 22 : 2);
      sm.opacity = on ? 0.22 : h.warn ? 0.06 : 0;
      for (const st of streaks) {
        st.u = (st.u + dt * (h.force || 3) * 0.25) % 1;
        const along = (st.u - 0.5) * Math.max(w * Math.abs(h.dir[0]), d * Math.abs(h.dir[2]), 2);
        st.s.position.set(h.x + st.ox * Math.abs(h.dir[2]) + h.dir[0] * along, h.y + st.oy, h.z + st.oz * Math.abs(h.dir[0]) + h.dir[2] * along);
        st.s.visible = on || h.warn;
      }
    },
    dispose() {
      sm.dispose();
      sg.dispose();
    },
  };
}

function drip(h) {
  const g = new THREE.Group();
  const top = h.y + (h.h || 4);
  const dropMat = new THREE.MeshStandardMaterial({ color: h.type === "steam" ? "#ffffff" : "#9fd6ff", transparent: true, opacity: 0.85, roughness: 0.05 });
  const drop = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), dropMat);
  drop.scale.set(1, 1.4, 1);
  g.add(drop);
  const ringMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry((h.r || 0.6) * 0.85, h.r || 0.6, 28), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(h.x, h.y + 0.03, h.z);
  g.add(ring);
  let wasOn = false;
  return {
    obj: g,
    splash: false,
    update(dt, W, ctx) {
      // the drop forms during the warning, falls as the hazard turns on
      const per = h.period || 3;
      const ph = ((((ctx.clock + (h.phase || 0) * per) % per) + per) % per) / per;
      const onFrac = h.onFrac == null ? 0.4 : h.onFrac;
      const warnFrac = h.warnFrac == null ? 0.2 : h.warnFrac;
      const ws = 1 - onFrac - warnFrac;
      if (ph < ws) {
        drop.visible = false;
      } else if (ph < 1 - onFrac) {
        drop.visible = true;
        const k = (ph - ws) / warnFrac;
        drop.position.set(h.x, top - 0.1, h.z);
        drop.scale.setScalar(0.3 + k * 0.7);
      } else {
        drop.visible = true;
        const k = (ph - (1 - onFrac)) / onFrac;
        drop.position.set(h.x, top - (top - h.y) * Math.min(1, k * 2.2), h.z);
        drop.scale.set(1, 1.6, 1);
        if (k > 0.45) drop.visible = false;
      }
      ringMat.opacity = h.warn ? 0.5 + Math.sin(ctx.clock * 14) * 0.2 : h.on ? 0.35 : 0;
      this.splash = h.on && !wasOn;
      wasOn = h.on;
    },
    dispose() {
      dropMat.dispose();
      ringMat.dispose();
      drop.geometry.dispose();
      ring.geometry.dispose();
    },
  };
}

function sprinkler(h) {
  const g = new THREE.Group();
  const head = grp((P) => {
    P.frame(0, 0, 0);
    P.add(cyl(0.7, 0.9, 0.5, 18), "plastic", "#4f8a5b", { p: [0, 0.25, 0] });
    P.add(cyl(0.18, 0.18, 1.4, 10), "metal", "#c9ccd2", { p: [0, 1.0, 0] });
  });
  head.position.set(h.pos[0], h.pos[1], h.pos[2]);
  g.add(head);
  const arm = new THREE.Group();
  arm.position.set(h.pos[0], h.pos[1] + 1.7, h.pos[2]);
  const nozzle = new THREE.Mesh(cyl(0.12, 0.12, 1.6, 8), mat("metal", "#c9ccd2"));
  nozzle.rotation.z = Math.PI / 2;
  arm.add(nozzle);
  g.add(arm);
  const jetMat = new THREE.MeshBasicMaterial({ color: "#cfeaff", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const jet = new THREE.Mesh(new THREE.ConeGeometry(h.r || 1.2, (h.h || 3) + 1, 18, 1, true), jetMat);
  jet.position.set(h.x, h.y + ((h.h || 3) + 1) / 2, h.z);
  jet.rotation.x = Math.PI;
  g.add(jet);
  return {
    obj: g,
    update(dt, W, ctx) {
      arm.rotation.y += dt * (h.on ? 6 : h.warn ? 2 : 0.3);
      jetMat.opacity = h.on ? 0.3 : h.warn ? 0.08 : 0;
    },
    dispose() {
      jetMat.dispose();
      jet.geometry.dispose();
      nozzle.geometry.dispose();
    },
  };
}

function roller(h) {
  const g = new THREE.Group();
  const r = h.r || 0.6;
  let body;
  if (h.look === "can") body = meshOf(cyl(r, r, r * 2.4, 24), mat("metal", h.color || "#d9473b"), "metal");
  else if (h.look === "tire") body = meshOf(new THREE.TorusGeometry(r * 0.72, r * 0.32, 14, 28), mat("rubber", "#2a2a2e"));
  else if (h.look === "orange") body = meshOf(new THREE.SphereGeometry(r, 24, 16), mat("felt", "#f2a03a"), "felt");
  else body = meshOf(new THREE.SphereGeometry(r, 24, 16), mat("plastic", h.color || "#4fb3a8"), "plastic");
  const spin = new THREE.Group();
  spin.add(body);
  if (h.look === "can" || h.look === "tire") body.rotation.x = Math.PI / 2;
  g.add(spin);
  let roll = 0;
  return {
    obj: g,
    update(dt, W) {
      g.position.set(h.x, h.y + r, h.z);
      const sp = Math.hypot(h.vx || 0, h.vz || 0);
      if (sp > 0.01) g.rotation.y = Math.atan2(h.vx, h.vz);
      roll += (sp / r) * dt;
      spin.rotation.x = roll;
      void W;
    },
    dispose() {
      body.geometry.dispose();
    },
  };
}

function swing(h) {
  // a heavy plumb bob (or a little work lamp) swinging on a cord from a hook
  const g = new THREE.Group();
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.06, 8, 16), mat("metal", "#c9ccd2"));
  hook.position.set(h.pos[0], h.pos[1], h.pos[2]);
  g.add(hook);
  const cordMat = mat("matte", "#e9e2d6");
  const cord = new THREE.Mesh(cyl(0.04, 0.04, 1, 6), cordMat);
  g.add(cord);
  const r = h.r || 0.6;
  let bob;
  if (h.look === "lamp") {
    bob = new THREE.Group();
    const shade = new THREE.Mesh(new THREE.ConeGeometry(r, r * 1.3, 20, 1, true), mat("metal", "#e8a33a", { side: THREE.DoubleSide }));
    bob.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(r * 0.4, 12, 8), mat("glow", "#fff1c9"));
    bulb.position.y = -r * 0.4;
    bob.add(bulb);
  } else {
    bob = new THREE.Mesh(new THREE.ConeGeometry(r, r * 2.2, 18), mat("metal", "#e0b04a"));
    bob.rotation.x = Math.PI;
  }
  g.add(bob);
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  return {
    obj: g,
    update() {
      bob.position.set(h.x, h.y, h.z);
      const px = h.pos[0];
      const py = h.pos[1];
      const pz = h.pos[2];
      v.set(h.x - px, h.y - py, h.z - pz);
      const L = v.length();
      cord.scale.set(1, L, 1);
      cord.position.set((h.x + px) / 2, (h.y + py) / 2, (h.z + pz) / 2);
      cord.quaternion.setFromUnitVectors(up, v.normalize().multiplyScalar(-1).negate());
      bob.rotation.z = h.axis === "z" ? 0 : h.angle || 0;
      bob.rotation.x = h.axis === "z" ? Math.PI - (h.angle || 0) : Math.PI;
      if (h.look === "lamp") bob.rotation.x = h.axis === "z" ? -(h.angle || 0) : 0;
    },
    dispose() {
      g.traverse((o) => {
        if (o.isMesh && o.geometry) o.geometry.dispose();
      });
    },
  };
}

function zone(h) {
  const g = new THREE.Group();
  if (h.look === "paint") {
    // the spill itself is a static prop; here just a soft glint that pulses
    const m = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.15, depthWrite: false });
    const glint = new THREE.Mesh(new THREE.PlaneGeometry(h.size[0] * 0.5, h.size[2] * 0.3), m);
    glint.rotation.x = -Math.PI / 2;
    glint.position.set(h.x - h.size[0] * 0.1, h.y + 0.08, h.z - h.size[2] * 0.15);
    g.add(glint);
    return {
      obj: g,
      update(dt, W, ctx) {
        m.opacity = 0.1 + Math.sin(ctx.clock * 2) * 0.05;
      },
      dispose() {
        m.dispose();
        glint.geometry.dispose();
      },
    };
  }
  const [w, , d] = h.size;
  const m = new THREE.MeshBasicMaterial({ color: h.color || "#ff6a3a", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const ring = new THREE.Mesh(new THREE.RingGeometry(Math.min(w, d) * 0.3, Math.min(w, d) * 0.48, 40), m);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(h.x, h.y + 0.04, h.z);
  g.add(ring);
  return {
    obj: g,
    update(dt, W, ctx) {
      m.opacity = h.on ? 0.75 + Math.sin(ctx.clock * 8) * 0.15 : h.warn ? 0.3 + Math.sin(ctx.clock * 16) * 0.2 : 0.06;
    },
    dispose() {
      m.dispose();
      ring.geometry.dispose();
    },
  };
}

/* ================================================================== pets */
export function buildPet(p, { shadows = true } = {}) {
  return p.type === "dog" ? dog(p, shadows) : cat(p, shadows);
}

function legSet(root, fur, positions, len, r) {
  const legs = [];
  for (const [x, z] of positions) {
    const hip = new THREE.Group();
    hip.position.set(x, len, z);
    const leg = meshOf(cyl(r, r * 0.85, len, 10), fur, "felt");
    leg.position.y = -len / 2;
    hip.add(leg);
    const paw = meshOf(blob(r * 2.4, r * 1.3, r * 2.8, 2.2, 2.2), fur, "felt");
    paw.position.set(0, -len + r * 0.5, r * 0.4);
    hip.add(paw);
    root.add(hip);
    legs.push(hip);
  }
  return legs;
}

function cat(p, shadows) {
  const fur = mat("felt", p.color || "#e3a565");
  const furLight = mat("felt", p.color2 || "#f6e3c8");
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const legH = 1.5;
  const torso = meshOf(blob(2.0, 1.8, 4.4, 2.2, 2.4), fur, "felt");
  torso.position.set(0, legH + 0.75, 0);
  body.add(torso);
  const belly = meshOf(blob(1.5, 1.0, 3.2, 2.2, 2.2), furLight, "felt");
  belly.position.set(0, legH + 0.35, 0.1);
  body.add(belly);
  // tabby stripes
  for (let i = 0; i < 4; i++) {
    const st = meshOf(blob(2.04, 0.35, 0.32, 2.2, 2.2), mat("felt", p.stripe || "#c98142"), null);
    st.position.set(0, legH + 1.3, -1.2 + i * 0.75);
    body.add(st);
  }
  const legs = legSet(body, fur, [
    [0.6, 1.4],
    [-0.6, 1.4],
    [0.6, -1.4],
    [-0.6, -1.4],
  ], legH, 0.26);
  const neck = new THREE.Group();
  neck.position.set(0, legH + 1.35, 2.0);
  body.add(neck);
  const head = new THREE.Group();
  head.position.set(0, 0.6, 0.4);
  neck.add(head);
  head.add(meshOf(blob(1.7, 1.45, 1.5, 2.2, 2.2), fur, "felt"));
  const muzzle = meshOf(blob(0.8, 0.5, 0.5, 2.2, 2.2), furLight, "felt");
  muzzle.position.set(0, -0.3, 0.65);
  head.add(muzzle);
  const nose = meshOf(new THREE.SphereGeometry(0.1, 8, 6), mat("glossy", "#e58a8a"));
  nose.position.set(0, -0.15, 0.88);
  head.add(nose);
  const eyes = [];
  for (const s of [-1, 1]) {
    const ear = meshOf(new THREE.ConeGeometry(0.35, 0.7, 4), fur);
    ear.position.set(s * 0.5, 0.75, -0.05);
    ear.rotation.set(-0.1, 0, s * -0.25);
    head.add(ear);
    const inner = meshOf(new THREE.ConeGeometry(0.2, 0.45, 4), mat("felt", "#f2b2b2"));
    inner.position.set(s * 0.5, 0.7, 0.05);
    inner.rotation.set(-0.1, 0, s * -0.25);
    head.add(inner);
    const eye = meshOf(blob(0.28, 0.32, 0.12, 2, 2), mat("glossy", "#6fae4a"));
    eye.position.set(s * 0.38, 0.12, 0.7);
    head.add(eye);
    const pupil = meshOf(blob(0.08, 0.24, 0.05, 2, 2), mat("glossy", "#1d2230"));
    pupil.position.set(s * 0.38, 0.12, 0.76);
    head.add(pupil);
    eyes.push(eye, pupil);
    for (const k of [-1, 1]) {
      const wh = new THREE.Mesh(cyl(0.012, 0.012, 1.0, 4), mat("matte", "#ffffff"));
      wh.rotation.z = Math.PI / 2 + k * 0.12;
      wh.position.set(s * 0.6, -0.28 + k * 0.06, 0.7);
      head.add(wh);
    }
  }
  // tail: a chain of segments that swishes
  const tail = [];
  let parent = body;
  let pos = new THREE.Vector3(0, legH + 1.1, -2.1);
  for (let i = 0; i < 7; i++) {
    const seg = new THREE.Group();
    seg.position.copy(pos);
    const m = meshOf(cyl(0.22 - i * 0.015, 0.24 - i * 0.015, 0.55, 8), i === 6 ? furLight : fur, "felt");
    m.position.y = 0.27;
    seg.add(m);
    parent.add(seg);
    tail.push(seg);
    parent = seg;
    pos = new THREE.Vector3(0, 0.52, 0);
  }
  tail[0].rotation.x = -0.9;
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = shadows;
  });
  return petRig(p, g, body, head, neck, legs, tail, legH, "cat");
}

function dog(p, shadows) {
  const fur = mat("felt", p.color || "#c98d5a");
  const furLight = mat("felt", p.color2 || "#f4e3c8");
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const legH = 2.0;
  const torso = meshOf(blob(2.6, 2.3, 5.2, 2.2, 2.3), fur, "felt");
  torso.position.set(0, legH + 1.0, 0);
  body.add(torso);
  const chest = meshOf(blob(2.0, 1.6, 1.6, 2.2, 2.2), furLight, "felt");
  chest.position.set(0, legH + 0.8, 2.0);
  body.add(chest);
  const legs = legSet(body, fur, [
    [0.8, 1.7],
    [-0.8, 1.7],
    [0.8, -1.7],
    [-0.8, -1.7],
  ], legH, 0.36);
  const neck = new THREE.Group();
  neck.position.set(0, legH + 1.9, 2.3);
  body.add(neck);
  const head = new THREE.Group();
  head.position.set(0, 0.7, 0.5);
  neck.add(head);
  head.add(meshOf(blob(2.0, 1.8, 1.9, 2.2, 2.2), fur, "felt"));
  const snout = meshOf(blob(1.1, 0.8, 1.3, 2.2, 2.2), furLight, "felt");
  snout.position.set(0, -0.35, 1.0);
  head.add(snout);
  const nose = meshOf(blob(0.4, 0.3, 0.3, 2, 2), mat("glossy", "#2a1d17"));
  nose.position.set(0, -0.2, 1.65);
  head.add(nose);
  const tongue = meshOf(blob(0.35, 0.08, 0.5, 2, 2), mat("felt", "#e8747a"));
  tongue.position.set(0, -0.72, 1.3);
  head.add(tongue);
  const ears = [];
  for (const s of [-1, 1]) {
    const earP = new THREE.Group();
    earP.position.set(s * 0.85, 0.55, -0.1);
    const ear = meshOf(blob(0.5, 1.5, 0.9, 2.2, 2.2), mat("felt", p.ear || "#8a5a3a"), "felt");
    ear.position.y = -0.6;
    earP.add(ear);
    earP.rotation.z = s * 0.2;
    head.add(earP);
    ears.push(earP);
    const eye = meshOf(new THREE.SphereGeometry(0.18, 12, 8), mat("glossy", "#1d2230"));
    eye.position.set(s * 0.45, 0.2, 0.85);
    head.add(eye);
  }
  const collar = meshOf(new THREE.TorusGeometry(0.95, 0.12, 8, 20), mat("felt", "#d9473b"));
  collar.rotation.x = Math.PI / 2 - 0.3;
  collar.position.set(0, 0.0, 0.1);
  neck.add(collar);
  const tag = meshOf(cyl(0.18, 0.18, 0.05, 12), mat("metal", "#e0b04a"));
  tag.rotation.x = Math.PI / 2;
  tag.position.set(0, -0.5, 0.9);
  neck.add(tag);
  const tail = [];
  let parent = body;
  let pos = new THREE.Vector3(0, legH + 1.6, -2.5);
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Group();
    seg.position.copy(pos);
    const m = meshOf(cyl(0.18, 0.24, 0.6, 8), fur, "felt");
    m.position.y = 0.3;
    seg.add(m);
    parent.add(seg);
    tail.push(seg);
    parent = seg;
    pos = new THREE.Vector3(0, 0.55, 0);
  }
  tail[0].rotation.x = -0.6;
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = shadows;
  });
  const rig = petRig(p, g, body, head, neck, legs, tail, legH, "dog");
  rig.ears = ears;
  return rig;
}

function petRig(p, g, body, head, neck, legs, tail, legH, kind) {
  let yaw = 0;
  let gait = 0;
  let sitK = 0;
  let headYaw = 0;
  let t = 0;
  const rig = {
    obj: g,
    update(dt, W, ctx) {
      t += dt;
      const pet = W.pets[p.i != null ? p.i : 0] || W.pets.find((q) => q.keys === p.keys);
      if (!pet) return;
      const c = pet.cur;
      g.position.set(c.x, 0, c.z);
      // the pet's floor height (cats can sit on furniture)
      const k = pet.keys[c.keyIndex];
      g.position.y = (k && k.y) || 0;
      yaw = lerpAngle(yaw, c.yaw, Math.min(1, dt * 6));
      g.rotation.y = yaw;
      const moving = c.speed > 0.1;
      gait += dt * c.speed * (kind === "cat" ? 1.2 : 1.0);
      const sit = c.state === "sit" || c.state === "sleep" ? 1 : 0;
      sitK += (sit - sitK) * Math.min(1, dt * 4);
      // legs
      for (let i = 0; i < legs.length; i++) {
        const ph = gait * 2.2 + (i === 0 || i === 3 ? 0 : Math.PI);
        legs[i].rotation.x = moving ? Math.sin(ph) * 0.6 : 0;
      }
      // sitting: hind legs fold, body tilts up
      body.rotation.x = -sitK * 0.45;
      body.position.y = -sitK * legH * 0.45 + (moving && ctx.motion ? Math.abs(Math.sin(gait * 2.2)) * 0.08 : 0);
      if (c.state === "sleep") {
        body.rotation.x = 0;
        body.position.y = -legH * 0.85 + Math.sin(t * 1.2) * 0.04;
      }
      // look at the toy when close (curious, not hostile)
      const wantHead = c.state === "look" || c.state === "approach" || c.state === "sit" || c.state === "play" ? clamp(lerpAngle(0, pet.lookYaw - yaw, 1), -1.0, 1.0) : 0;
      headYaw += (wantHead - headYaw) * Math.min(1, dt * 4);
      head.rotation.y = pet.dist < 12 ? headYaw : headYaw * 0.3;
      head.rotation.x = c.state === "sleep" ? 0.6 : c.state === "play" ? 0.35 + Math.sin(t * 8) * 0.15 : c.state === "approach" ? 0.25 : 0;
      neck.rotation.x = c.state === "play" && kind === "cat" ? 0.2 : 0;
      // play: a front paw swats (cat) / bouncy bow (dog)
      if (c.state === "play") {
        if (kind === "cat") legs[0].rotation.x = -0.9 + Math.sin(t * 10) * 0.6;
        else body.rotation.x = 0.2 + Math.sin(t * 6) * 0.08;
      }
      // tail
      const wag = kind === "dog" ? (moving || c.state === "play" || c.state === "look" ? 9 : 3) : moving ? 2 : 1.2;
      const amp = kind === "dog" ? 0.5 : 0.25;
      for (let i = 0; i < tail.length; i++) {
        tail[i].rotation.z = Math.sin(t * wag - i * 0.5) * amp * (ctx.motion ? 1 : 0.3);
        if (i > 0) tail[i].rotation.x = kind === "cat" ? 0.25 : 0.15;
      }
      if (rig.ears) for (const e of rig.ears) e.rotation.x = moving ? Math.sin(gait * 4.4) * 0.15 : 0;
    },
    dispose() {
      g.traverse((o) => {
        if (o.isMesh && o.geometry) o.geometry.dispose();
      });
    },
  };
  return rig;
}

export const _unusedA = { clamp, lerpAngle };
