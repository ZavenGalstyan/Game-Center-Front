/**
 * Doll clothing. Each outfit is built from revolved shells that hug the
 * torso profile (bodices), flare (skirts, pleated or tiered), or puff
 * (sleeves, bloomers), plus collars, aprons, straps and bows.
 *
 * Returns { group, meshes, buttons:[{p,n}], surfaces:{where: surf(a,y)},
 *           tears:{where:{a0,y0,a1,y1}}, hemY, covers:{torso, armTo, legAbove} }
 * so the model knows which skin is hidden and where tears and buttons go.
 */
import * as THREE from "three";
import { revolve, profile, tube, addGrime, V3 } from "./geo.js";
import { surfaceMat, mat } from "./materials.js";
import { fabricTex } from "./textures.js";
import { FABRIC_COLORS } from "../data/dolls.js";
import { torsoPoints, radiusAt, waistY as waistOf } from "../engine/plan.js";
import { buildButton } from "./parts.js";

const D = THREE.DoubleSide;

/** A revolved garment shell with an analytic surface function. */
function shell(pts, { segs = 48, rFn = null, squash = 1, a0 = 0, a1 = Math.PI * 2, m, steps = 4, part = "outfit" }) {
  const rings = profile(pts, steps);
  const geo = revolve(rings, { segs, a0, a1, squash, rFn: rFn ? (a, ring, t, r) => rFn(a, ring.y, r) : null });
  addGrime(geo);
  const mesh = new THREE.Mesh(geo, m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.part = part;
  mesh.userData.grime = true;
  const ys = rings.map((q) => q.y);
  const rs = rings.map((q) => [q.r, q.y]);
  const P = (a, y) => {
    let r = radiusAt(rs, y);
    if (rFn) r = rFn(a, y, r);
    return V3(Math.sin(a) * r, y, Math.cos(a) * r * squash);
  };
  const surf = (a, y, lift = 0) => {
    const p = P(a, y);
    const da = P(a + 0.01, y).sub(P(a - 0.01, y));
    const dy = P(a, y + 0.004).sub(P(a, y - 0.004));
    const n = new THREE.Vector3().crossVectors(da, dy).normalize();
    // outward (away from the axis)
    if (n.x * p.x + n.z * p.z < 0) n.negate();
    return { p: p.addScaledVector(n, lift), n };
  };
  return { mesh, surf, y0: Math.min(...ys), y1: Math.max(...ys) };
}

const pleat = (n, amp) => (a, y, r, t = 1) => r * (1 + amp * Math.sin(a * n) * t);

export function buildOutfit(plan, look, { arms = null, seed = 1 } = {}) {
  const group = new THREE.Group();
  group.name = "outfit";
  const meshes = [];
  const buttons = [];
  const surfaces = {};
  const tears = {};
  const covers = { torso: true, armTo: 0, legAbove: Infinity, shoulders: false };
  const hex = FABRIC_COLORS[look.dressColor]?.hex || "#f4ead2";
  const acc = FABRIC_COLORS[look.accent]?.hex || "#ffffff";
  const style = look.outfit;
  const T = torsoPoints(plan);
  const sq = T.squash;
  const wY = waistOf(plan);
  const add = (s) => {
    group.add(s.mesh);
    meshes.push(s.mesh);
    return s;
  };
  const fab = (h, k = "cotton", kind = "fabric") => surfaceMat(kind, h, { map: fabricTex(k), side: D });
  const trim = (h, k = "lace") => surfaceMat("fabric", h, { map: fabricTex(k), side: D, grime: false });
  const deco = (o) => {
    o.castShadow = true;
    group.add(o);
    return o;
  };

  if (style === "none" || style === "bare") {
    covers.torso = plan.kind !== "teddy" ? true : false;
    return { group, meshes, buttons, surfaces, tears, hemY: Infinity, covers, dispose: () => disposeGroup(group) };
  }

  const bodiceTo = (top, off = 0.0055, k = "cotton", h = hex, kind = "fabric", bottom = wY - 0.006) => {
    const pts = [];
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const y = bottom + ((top - bottom) * i) / n;
      pts.push([radiusAt(T.pts, y) + off, y]);
    }
    return add(shell(pts, { squash: sq, m: fab(h, k, kind), steps: 2 }));
  };

  const puff = (scale = 1, h = hex, k = "cotton") => {
    for (const side of [-1, 1]) {
      const g = new THREE.Mesh(new THREE.SphereGeometry(plan.armR0 * 2.0 * scale, 20, 14), fab(h, k));
      g.scale.set(1.05, 0.9, 1);
      g.position.set(side * (plan.shoulderX + plan.armR0 * 0.25), plan.shoulderY - plan.armR0 * 0.9, 0);
      addGrime(g.geometry);
      g.userData.part = "outfit";
      g.userData.grime = true;
      deco(g);
      meshes.push(g);
      // gathered rim
      const rim = new THREE.Mesh(new THREE.TorusGeometry(plan.armR0 * 1.45 * scale, plan.armR0 * 0.22, 8, 20), trim(acc, "lace"));
      rim.position.set(side * (plan.shoulderX + plan.armR0 * 0.45), plan.shoulderY - plan.armR0 * 2.25 * scale, 0);
      rim.rotation.set(Math.PI / 2, 0, side * 0.25);
      deco(rim);
    }
    covers.shoulders = true;
    covers.armTo = Math.max(covers.armTo, 0.22 * scale);
  };

  const longSleeves = (to = 0.55, h = hex) => {
    if (!arms) return;
    for (const side of [-1, 1]) {
      const curve = arms[side < 0 ? "R" : "L"];
      const pts = curve.points.filter((_, i, a) => i / (a.length - 1) <= to + 0.001);
      const g = tube(pts, (t) => curve.radius(t * to) + 0.007 + 0.004 * Math.sin(t * Math.PI), { radial: 14, tubular: 14, capStart: false, capEnd: false });
      addGrime(g);
      const m = new THREE.Mesh(g, fab(h));
      m.userData.part = "outfit";
      m.userData.grime = true;
      deco(m);
      meshes.push(m);
      const end = pts[pts.length - 1];
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(curve.radius(to) + 0.008, 0.0045, 6, 18), trim("#ffffff"));
      cuff.position.copy(end);
      cuff.lookAt(end.clone().add(curve.dirAt(to)));
      deco(cuff);
    }
    covers.armTo = Math.max(covers.armTo, to);
  };

  const collar = (h = "#ffffff", scallop = 14, big = 1) => {
    const y0 = plan.shoulderY + 0.006;
    const pts = [[radiusAt(T.pts, plan.shoulderY - 0.03 * big) + 0.012, plan.shoulderY - 0.03 * big], [plan.neckR * 1.5 + 0.006, y0]];
    const s = shell(pts, { squash: sq, m: trim(h), steps: 2, rFn: (a, y, r) => r * (1 + 0.06 * Math.max(0, Math.sin(a * scallop)) * (y < y0 - 0.01 ? 1 : 0)) });
    deco(s.mesh);
  };

  const skirt = ({ hem, R, pl = 16, amp = 0.05, k = "cotton", h = hex, kind = "fabric", bell = 0.5, frill = true, top = wY + 0.004, where = "skirt" }) => {
    const r0 = radiusAt(T.pts, top) + 0.007;
    const hipR = plan.hipR * 1.12 + 0.008;
    const L = top - hem;
    const pts = [[R, hem], [R * (0.97 - bell * 0.1), hem + L * 0.25], [Math.max(hipR, R * (0.75 - bell * 0.2)), hem + L * 0.6], [hipR, top - L * 0.18], [r0, top]];
    const s = add(shell(pts, { squash: 0.92, m: fab(h, k, kind), segs: 64, rFn: (a, y, r) => r * (1 + amp * Math.sin(a * pl) * Math.min(1, (top - y) / L) ** 1.2) }));
    surfaces[where] = s.surf;
    surfaces[where + "Back"] = s.surf;
    tears[where] = { a0: 0.42, y0: top - L * 0.32, a1: 0.3, y1: top - L * 0.72 };
    tears[where + "Back"] = { a0: Math.PI + 0.3, y0: top - L * 0.3, a1: Math.PI + 0.45, y1: top - L * 0.7 };
    if (frill) {
      const fr = shell([[R * 1.07, hem - 0.012], [R * 1.01, hem + 0.012]], { squash: 0.92, m: trim("#ffffff"), segs: 96, steps: 2, rFn: (a, y, r) => r * (1 + 0.03 * Math.sin(a * 48)) });
      deco(fr.mesh);
    }
    covers.legAbove = Math.min(covers.legAbove, hem + 0.004);
    return s;
  };

  const bodiceSurf = (b) => {
    surfaces.bodice = b.surf;
    const top = b.y1;
    tears.bodice = { a0: -0.55, y0: top - 0.012, a1: -0.32, y1: wY + 0.012 };
  };

  const frontButtons = (n, yTop, yBot, surf, size = 0.009) => {
    for (let i = 0; i < n; i++) {
      const y = n === 1 ? (yTop + yBot) / 2 : yTop + ((yBot - yTop) * i) / (n - 1);
      const { p, n: nn } = surf(0, y, 0.003);
      buttons.push({ p, n: nn, size });
    }
  };

  /* ----------------------------------------------------------- styles */
  const kneeY = plan.hipY - plan.legLen * 0.42;
  const human = plan.kind !== "teddy";
  if (style === "victorian") {
    const b = bodiceTo(plan.shoulderY + 0.003);
    bodiceSurf(b);
    skirt({ hem: 0.03, R: plan.hipR * 2.1, pl: 18, amp: 0.045 });
    puff(1.05);
    longSleeves(0.62);
    collar("#ffffff", 16, 1.2);
    frontButtons(3, plan.shoulderY - 0.035, wY + 0.018, b.surf);
    // sash bow at the back
    const bow = new THREE.Group();
    const bm = trim(acc, "velvet");
    for (const sx of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.007, 8, 16), bm);
      l.position.set(sx * 0.022, 0, 0);
      l.scale.set(1, 0.6, 0.6);
      bow.add(l);
      const tail = new THREE.Mesh(tube([V3(0, 0, 0), V3(sx * 0.012, -0.04, -0.004), V3(sx * 0.02, -0.08, -0.01)], 0.007, { radial: 5, tubular: 8, flat: 0.3 }), bm);
      bow.add(tail);
    }
    bow.position.set(0, wY + 0.004, -radiusAt(T.pts, wY) * sq - 0.014);
    deco(bow);
    const sash = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 40), bm);
    sash.scale.set(radiusAt(T.pts, wY) + 0.009, (radiusAt(T.pts, wY) + 0.009) * sq, 0.09);
    sash.rotation.x = Math.PI / 2;
    sash.position.y = wY + 0.004;
    deco(sash);
  } else if (style === "sundress") {
    const b = bodiceTo(plan.shoulderY - 0.022);
    bodiceSurf(b);
    skirt({ hem: kneeY + plan.legLen * 0.06, R: plan.hipR * 1.75, pl: 10, amp: 0.07, bell: 0.2 });
    for (const sx of [-1, 1]) {
      const sp = b.surf(sx * 0.45, plan.shoulderY - 0.024, 0.002).p;
      const bp = b.surf(Math.PI - sx * 0.45, plan.shoulderY - 0.024, 0.002).p;
      const top = V3(sx * (plan.chestR * 0.62), plan.shoulderY + 0.012, 0);
      deco(new THREE.Mesh(tube([sp, top, bp], 0.0035, { radial: 6, tubular: 10, flat: 0.4 }), trim(acc, "cotton")));
    }
  } else if (style === "ballgown") {
    const b = bodiceTo(plan.shoulderY - 0.016, 0.006, "cotton", hex, "satin");
    bodiceSurf(b);
    const R = plan.hipR * 2.9;
    skirt({ hem: 0.012, R, pl: 12, amp: 0.04, kind: "satin", bell: 1.2 });
    // tulle overskirt tier with scalloped edge
    const top = wY + 0.004;
    const tier = shell([[R * 0.98, 0.18], [R * 0.82, 0.3], [plan.hipR * 1.4, top - 0.05], [radiusAt(T.pts, top) + 0.011, top]], { squash: 0.92, m: surfaceMat("fabric", "#ffffff", { map: fabricTex("lace"), side: D, grime: false }), segs: 72, rFn: (a, y, r) => r * (1 + 0.05 * Math.abs(Math.sin(a * 7)) * (y < 0.24 ? 1 : 0)) });
    tier.mesh.material.transparent = true;
    tier.mesh.material.opacity = 0.32;
    tier.mesh.material.depthWrite = false;
    deco(tier.mesh);
    // off-shoulder ruffle
    const ruf = new THREE.Mesh(new THREE.TorusGeometry(1, 0.16, 8, 48), trim("#ffffff"));
    ruf.scale.set(plan.shoulderX + plan.armR0 * 0.8, (plan.shoulderX + plan.armR0 * 0.8) * sq, 0.06);
    ruf.rotation.x = Math.PI / 2;
    ruf.position.y = plan.shoulderY - 0.02;
    deco(ruf);
    covers.armTo = 0.12;
    const sash = new THREE.Mesh(new THREE.TorusGeometry(1, 0.1, 6, 40), trim(acc, "velvet"));
    sash.scale.set(radiusAt(T.pts, wY) + 0.009, (radiusAt(T.pts, wY) + 0.009) * sq, 0.08);
    sash.rotation.x = Math.PI / 2;
    sash.position.y = wY + 0.004;
    deco(sash);
  } else if (style === "sailor") {
    const b = bodiceTo(plan.shoulderY + 0.003);
    bodiceSurf(b);
    skirt({ hem: kneeY + plan.legLen * 0.04, R: plan.hipR * 1.6, pl: 22, amp: 0.035, bell: 0.15, frill: false });
    puff(0.85);
    // square sailor collar on the back + navy trim
    const navy = FABRIC_COLORS.navy.hex;
    const coll = shell([[radiusAt(T.pts, plan.shoulderY - 0.06) + 0.012, plan.shoulderY - 0.06], [plan.neckR * 1.6 + 0.006, plan.shoulderY + 0.006]], { squash: sq, m: trim(navy, "cotton"), a0: Math.PI * 0.55, a1: Math.PI * 1.45, steps: 2 });
    deco(coll.mesh);
    const tie = new THREE.Group();
    const tm = trim(acc === "#ffffff" ? FABRIC_COLORS.red.hex : acc, "satin");
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), tm);
    tie.add(knot);
    for (const sx of [-1, 1]) tie.add(new THREE.Mesh(tube([V3(0, 0, 0), V3(sx * 0.01, -0.025, 0.003), V3(sx * 0.016, -0.05, 0.0)], 0.0065, { radial: 5, tubular: 8, flat: 0.3 }), tm));
    const tp = b.surf(0, plan.shoulderY - 0.022, 0.004).p;
    tie.position.copy(tp);
    deco(tie);
    frontButtons(2, wY + 0.045, wY + 0.018, b.surf);
  } else if (style === "pinafore") {
    const b = bodiceTo(plan.shoulderY + 0.003);
    bodiceSurf(b);
    const s = skirt({ hem: kneeY, R: plan.hipR * 1.7, pl: 14, amp: 0.05, bell: 0.3 });
    puff(0.9);
    collar("#ffffff", 10, 0.8);
    // apron: open front panel over the skirt + bib
    const top = wY + 0.004;
    const L = top - kneeY;
    const ap = shell([[plan.hipR * 1.7 * 1.03, kneeY + 0.02], [plan.hipR * 1.25 + 0.012, top - L * 0.4], [radiusAt(T.pts, top) + 0.012, top]], { squash: 0.93, m: trim("#fbfaf6", "lace"), a0: -0.85, a1: 0.85, segs: 24, steps: 2 });
    deco(ap.mesh);
    const bib = shell([[radiusAt(T.pts, top) + 0.011, top], [radiusAt(T.pts, plan.shoulderY - 0.03) + 0.0085, plan.shoulderY - 0.03]], { squash: sq, m: trim("#fbfaf6", "lace"), a0: -0.55, a1: 0.55, segs: 12, steps: 2 });
    deco(bib.mesh);
    for (const sx of [-1, 1]) {
      const f = b.surf(sx * 0.45, plan.shoulderY - 0.032, 0.006).p;
      const bk = b.surf(Math.PI - sx * 0.5, wY + 0.03, 0.006).p;
      deco(new THREE.Mesh(tube([f, V3(sx * plan.chestR * 0.6, plan.shoulderY + 0.012, 0), bk], 0.0045, { radial: 6, tubular: 12, flat: 0.3 }), trim("#fbfaf6", "cotton")));
      const bs = b.surf(sx * 0.42, plan.shoulderY - 0.04, 0.008);
      buttons.push({ p: bs.p, n: bs.n, size: 0.0075 });
    }
    void s;
  } else if (style === "patchwork") {
    const b = bodiceTo(plan.shoulderY + 0.003, 0.0055, "patch");
    bodiceSurf(b);
    skirt({ hem: kneeY - plan.legLen * 0.04, R: plan.hipR * 1.65, pl: 9, amp: 0.06, k: "patch", bell: 0.25 });
    puff(0.9, hex, "patch");
    collar("#ffffff", 12, 0.9);
    frontButtons(3, plan.shoulderY - 0.03, wY + 0.016, b.surf);
  } else if (style === "romper") {
    const b = bodiceTo(plan.shoulderY + 0.003, 0.006, "knit");
    bodiceSurf(b);
    const bot = plan.hipY - plan.legLen * 0.2;
    const top = wY + 0.004;
    const bl = add(shell([[plan.hipR * 1.15, bot], [plan.hipR * 1.38, bot + (top - bot) * 0.35], [plan.hipR * 1.3, bot + (top - bot) * 0.75], [radiusAt(T.pts, top) + 0.0065, top]], { squash: 0.88, m: fab(hex, "knit"), rFn: (a, y, r) => r * (1 + 0.02 * Math.sin(a * 10)) }));
    surfaces.skirt = bl.surf;
    surfaces.skirtBack = bl.surf;
    tears.skirt = { a0: 0.55, y0: top - (top - bot) * 0.25, a1: 0.38, y1: bot + (top - bot) * 0.3 };
    tears.skirtBack = { a0: Math.PI + 0.3, y0: top - (top - bot) * 0.25, a1: Math.PI + 0.45, y1: bot + (top - bot) * 0.3 };
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 36), trim("#ffffff", "knit"));
    cuff.scale.set(plan.hipR * 1.15, plan.hipR * 1.15 * 0.88, 0.1);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = bot;
    deco(cuff);
    puff(0.95, hex, "knit");
    collar("#ffffff", 8, 0.7);
    frontButtons(3, plan.shoulderY - 0.03, wY + 0.012, b.surf, 0.0085);
    covers.legAbove = bot + 0.004;
  } else if (style === "tunic" || style === "overalls") {
    const shirtHex = style === "overalls" ? acc : hex;
    const b = bodiceTo(plan.shoulderY + 0.003, 0.006, "cotton", shirtHex, "fabric", plan.hipY - 0.012);
    bodiceSurf(b);
    puff(0.8, shirtHex);
    const bot = plan.hipY - plan.legLen * 0.24;
    const top = wY - 0.004;
    const shortsHex = style === "overalls" ? "#5a77b0" : acc;
    const sh = add(shell([[plan.hipR * 1.18, bot], [plan.hipR * 1.3, bot + (top - bot) * 0.4], [radiusAt(T.pts, top) + 0.011, top]], { squash: 0.86, m: fab(shortsHex, style === "overalls" ? "denim" : "cotton") }));
    surfaces.skirt = sh.surf;
    surfaces.skirtBack = sh.surf;
    tears.skirt = { a0: 0.55, y0: top - (top - bot) * 0.2, a1: 0.4, y1: bot + (top - bot) * 0.25 };
    tears.skirtBack = { a0: Math.PI + 0.3, y0: top - (top - bot) * 0.2, a1: Math.PI + 0.45, y1: bot + (top - bot) * 0.25 };
    covers.legAbove = bot + 0.004;
    if (style === "overalls") {
      const bib = shell([[radiusAt(T.pts, top) + 0.012, top], [radiusAt(T.pts, plan.shoulderY - 0.035) + 0.01, plan.shoulderY - 0.035]], { squash: sq, m: fab("#5a77b0", "denim"), a0: -0.6, a1: 0.6, segs: 12, steps: 2 });
      deco(bib.mesh);
      for (const sx of [-1, 1]) {
        const f = b.surf(sx * 0.5, plan.shoulderY - 0.036, 0.008).p;
        const bk = b.surf(Math.PI - sx * 0.4, top + 0.01, 0.008).p;
        deco(new THREE.Mesh(tube([f, V3(sx * plan.chestR * 0.6, plan.shoulderY + 0.013, 0), bk], 0.0045, { radial: 6, tubular: 12, flat: 0.35 }), trim("#5a77b0", "denim")));
        const bs = b.surf(sx * 0.48, plan.shoulderY - 0.042, 0.01);
        buttons.push({ p: bs.p, n: bs.n, size: 0.0075 });
      }
    } else {
      const belt = new THREE.Mesh(new THREE.TorusGeometry(1, 0.1, 6, 40), mat("#5b3a26", { roughness: 0.5 }));
      const br = radiusAt(T.pts, wY) + 0.011;
      belt.scale.set(br, br * sq, 0.07);
      belt.rotation.x = Math.PI / 2;
      belt.position.y = wY;
      deco(belt);
      const buckle = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0025, 6, 4), new THREE.MeshStandardMaterial({ color: "#d9b25a", metalness: 1, roughness: 0.25 }));
      buckle.position.set(0, wY, br * sq + 0.003);
      buckle.rotation.z = Math.PI / 4;
      deco(buckle);
      frontButtons(2, plan.shoulderY - 0.03, wY + 0.03, b.surf);
    }
  } else if (style === "vest" || style === "sweater") {
    // teddy garments over the plush body
    const knit = style === "sweater";
    const a0 = knit ? 0 : 0.45;
    const a1 = knit ? Math.PI * 2 : Math.PI * 2 - 0.45;
    const pts = [];
    for (let i = 0; i <= 7; i++) {
      const y = 0.11 + (0.37 - 0.11) * (i / 7);
      pts.push([radiusAt(T.pts, y) + 0.008, y]);
    }
    const v = add(shell(pts, { squash: T.squash, m: fab(hex, knit ? "knit" : "velvet", knit ? "fabric" : "velvet"), a0, a1, segs: 56, steps: 2 }));
    surfaces.skirt = v.surf;
    surfaces.skirtBack = v.surf;
    surfaces.bodice = v.surf;
    tears.skirt = { a0: 1.1, y0: 0.3, a1: 1.25, y1: 0.16 };
    tears.skirtBack = { a0: Math.PI + 0.3, y0: 0.3, a1: Math.PI + 0.45, y1: 0.16 };
    tears.bodice = tears.skirt;
    if (knit) {
      const hem = new THREE.Mesh(new THREE.TorusGeometry(1, 0.07, 8, 40), trim(hex, "knit"));
      const hr0 = radiusAt(T.pts, 0.11) + 0.009;
      hem.scale.set(hr0, hr0 * T.squash, 0.12);
      hem.rotation.x = Math.PI / 2;
      hem.position.y = 0.11;
      deco(hem);
      const neck = new THREE.Mesh(new THREE.TorusGeometry(1, 0.22, 10, 32), trim(hex, "knit"));
      neck.scale.set(0.078, 0.078 * T.squash, 0.06);
      neck.rotation.x = Math.PI / 2;
      neck.position.y = 0.395;
      deco(neck);
      frontButtons(2, 0.33, 0.24, (a, y, l) => v.surf(a + 0.0, y, l));
    } else {
      const edge = 0.5;
      for (let i = 0; i < 3; i++) {
        const y = 0.31 - i * 0.065;
        const s = v.surf(edge, y, 0.003);
        buttons.push({ p: s.p, n: s.n, size: 0.012 });
      }
    }
    covers.torso = false;
    covers.vest = { a0, a1, y0: 0.11, y1: 0.37 };
  }

  // Buttons are built by the model so missing ones can be left out.
  return {
    group,
    meshes,
    buttons,
    surfaces,
    tears,
    hemY: covers.legAbove,
    covers,
    style,
    isHuman: human,
    dispose: () => disposeGroup(group),
  };
}

export function disposeGroup(g) {
  g.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) m.dispose();
    }
  });
}

export { buildButton };
