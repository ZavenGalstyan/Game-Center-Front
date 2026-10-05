/**
 * Train Commander — the armoured train (the visual hero).
 *
 * Every car is built in its own local frame: +X forward, y = 0 on the rail
 * head, centred on the car's middle (engine car.x). Static bodywork is merged
 * per livery and cached; moving parts (wheels, coupling rods, bogies) are
 * separate meshes the renderer animates from the distance travelled — wheel
 * angle = distance / radius, so they always roll at exactly train speed.
 *
 * Each car gets its own clone of the paint material so damage can darken one
 * car without touching the others (≤ 7 cars, cheap).
 */
import * as THREE from "three";
import { T, paint, merge, box, cyl, cylX, cylZ, sph, dome, torus, prism, rivetsX, rivetsY, mirrorZ, cached, vcMat, stdMat, basicMat } from "./geo.js";
import { emblemTexture, blobTexture } from "./textures.js";
import { LOCO_LEN, WAGON_LEN, MOUNT_Y } from "../engine/constants.js";

export const GAUGE = 0.75; // rail half-gauge (z of each rail)

/* ================================================================ materials */
function paintMat(pal) {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.32, flatShading: false });
}
const metalMat = () => vcMat("tc-metal", { roughness: 0.38, metalness: 0.72, flatShading: false });
const glassMat = (pal) => stdMat(`tc-glass-${pal.id}`, { color: "#1b2533", emissive: pal.glass, emissiveIntensity: 0.55, roughness: 0.2, metalness: 0.4 });
const lampMat = () => stdMat("tc-lamp", { color: "#fff6d8", emissive: "#ffe7a3", emissiveIntensity: 2.4 });

/* ================================================================ wheels */
/** a spoked wheel facing ±Z, centred on its axle (rim colour, tyre steel) */
function wheelGeo(r, rimCol, steel, spokes = 8, counterweight = false) {
  return cached(`wheel-${r}-${rimCol}-${spokes}-${counterweight}`, () => {
    const parts = [];
    const w = 0.12;
    parts.push(paint(cylZ(r, w, 22), steel)); // tyre
    parts.push(paint(T(cylZ(r * 0.86, w + 0.02, 22)), rimCol)); // rim face
    parts.push(paint(T(cylZ(r * 0.74, w + 0.05, 22)), "#1a1a1e")); // dark gap between spokes
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      parts.push(paint(T(box(r * 0.72, 0.06, w + 0.07), Math.cos(a) * r * 0.37, Math.sin(a) * r * 0.37, 0, 0, 0, a), rimCol));
    }
    parts.push(paint(cylZ(r * 0.2, w + 0.12, 12), rimCol));
    parts.push(paint(cylZ(r * 0.1, w + 0.18, 8), steel));
    if (counterweight) parts.push(paint(T(box(r * 0.55, r * 0.3, w + 0.08), 0, -r * 0.5, 0), rimCol));
    // flange
    parts.push(paint(T(cylZ(r + 0.05, 0.03, 22), 0, 0, -w / 2 + 0.02), steel));
    return merge(parts);
  });
}

/* ================================================================ loco */
const L = LOCO_LEN / 2; // 3.3

function locoBody(pal) {
  return cached(`loco-body-${pal.id}`, () => {
    const P = [];
    const body = pal.body;
    const dark = pal.dark;
    const trim = pal.trim;
    const metal = pal.metal;
    const add = (g, c, j = 0.05) => P.push(paint(g, c, j, P.length + 1));
    // frame + buffer beams
    add(T(box(L * 2 - 0.1, 0.32, 1.32), 0, 0.86, 0), dark);
    add(T(box(0.22, 0.5, 2.3), L + 0.02, 0.88, 0), "#b8342c"); // front buffer beam (red)
    add(T(box(0.22, 0.44, 2.2), -L + 0.05, 0.86, 0), dark);
    for (const z of [-0.78, 0.78]) {
      add(T(cylX(0.13, 0.32), L + 0.26, 0.9, z), metal);
      add(T(cylX(0.2, 0.06), L + 0.42, 0.9, z), metal);
    }
    // armoured cowcatcher (plow): a wedge prism, ribbed
    const plow = prism([[0, 0], [0.75, 0], [0, 0.72]], 2.15);
    add(T(plow, L + 0.12, 0.1, 0), "#3b3f45", 0.08);
    for (let k = -2; k <= 2; k++) add(T(box(0.62, 0.05, 0.08), L + 0.42, 0.42 - Math.abs(k) * 0, k * 0.42, 0, 0, -0.76), "#5a5f66");
    // running boards
    for (const s of [-1, 1]) {
      add(T(box(L * 2 - 0.5, 0.08, 0.42), -0.1, 1.16, s * 1.05), dark);
      add(T(box(L * 2 - 0.5, 0.05, 0.05), -0.1, 1.2, s * 1.27), trim);
    }
    // cylinders (steam chests) + valve covers
    for (const s of [-1, 1]) {
      add(T(cylX(0.27, 0.85, 16), 2.0, 0.78, s * 1.0), metal);
      add(T(cylX(0.3, 0.06, 16), 2.45, 0.78, s * 1.0), trim);
      add(T(cylX(0.3, 0.06, 16), 1.55, 0.78, s * 1.0), trim);
      add(T(box(0.6, 0.18, 0.22), 2.0, 1.04, s * 1.0), dark);
    }
    // boiler + bands
    add(T(cylX(0.74, 3.9, 26), 1.0, 1.86, 0), body, 0.02);
    for (const x of [-0.6, 0.4, 1.4, 2.4]) add(T(cylX(0.765, 0.09, 26), x, 1.86, 0), trim);
    // smokebox + armoured front face
    add(T(cylX(0.78, 0.5, 26), 3.05, 1.86, 0), "#2b2f35", 0.03);
    add(T(cylX(0.66, 0.08, 8), 3.32, 1.86, 0, Math.PI / 8), "#3c4148");
    add(T(cylX(0.5, 0.06, 8), 3.37, 1.86, 0, Math.PI / 8), metal);
    add(T(sph(0.09, 8, 6), 3.41, 1.86, 0), trim); // door handle hub
    add(T(box(0.04, 0.06, 0.6), 3.4, 1.86, 0), trim);
    // headlamp housing (lens is a separate emissive mesh)
    add(T(cylX(0.2, 0.28, 14), 3.25, 2.78, 0), "#2b2f35");
    add(T(box(0.3, 0.12, 0.3), 3.2, 2.58, 0), dark);
    // chimney: armoured collar + flared stack + cap
    add(T(cyl(0.34, 0.4, 0.22, 16), 2.35, 2.58, 0), dark);
    add(T(cyl(0.25, 0.22, 0.75, 16), 2.35, 2.98, 0), "#2b2f35");
    add(T(cyl(0.36, 0.25, 0.22, 16), 2.35, 3.44, 0), "#2b2f35");
    add(T(torus(0.36, 0.035, 6, 20), 2.35, 3.55, 0, Math.PI / 2), trim);
    // steam dome + sand dome + whistle + bell
    add(T(cyl(0.3, 0.36, 0.3, 16), 1.05, 2.6, 0), body);
    add(T(dome(0.3, 16, 6), 1.05, 2.75, 0), trim);
    add(T(cyl(0.26, 0.3, 0.24, 16), 0.0, 2.58, 0), body);
    add(T(dome(0.26, 16, 6), 0.0, 2.7, 0), body);
    add(T(cyl(0.035, 0.035, 0.3, 6), 0.55, 2.72, 0), trim);
    add(T(cyl(0.06, 0.04, 0.14, 8), 0.55, 2.9, 0), trim);
    // armour: sloped plates hugging the boiler sides, with rivets + hatch
    for (const s of [-1, 1]) {
      const plate = [];
      plate.push(paint(T(box(4.1, 0.08, 0.95), 1.0, 1.62, s * 0.92, s * -0.86, 0, 0), body, 0.04, 7));
      plate.push(paint(T(box(4.1, 0.05, 0.06), 1.0, 1.98, s * 0.74), trim));
      plate.push(paint(T(box(4.1, 0.05, 0.06), 1.0, 1.23, s * 1.24), trim));
      plate.push(...rivetsX(-0.85, 2.85, 1.9, s * 0.8, 14, 0.03, s).map((g) => paint(g, metal)));
      plate.push(...rivetsX(-0.85, 2.85, 1.34, s * 1.17, 14, 0.03, s).map((g) => paint(g, metal)));
      // inspection hatch
      plate.push(paint(T(box(0.6, 0.02, 0.36), 1.9, 1.62, s * 0.98, s * -0.86, 0, 0), dark));
      plate.push(paint(T(box(0.08, 0.03, 0.08), 1.65, 1.66, s * 1.02, s * -0.86, 0, 0), trim));
      P.push(...plate);
      // handrail along the boiler
      add(T(cylX(0.022, 3.6, 6), 1.1, 2.18, s * 0.66), trim);
    }
    // cab: walls, window frames (windows cut by leaving gaps), armoured roof
    const cx0 = -L + 0.05;
    const cx1 = -0.95;
    const cw = cx1 - cx0;
    const ccx = (cx0 + cx1) / 2;
    for (const s of [-1, 1]) {
      add(T(box(cw, 0.95, 0.1), ccx, 1.68, s * 1.2), body, 0.03); // lower side wall
      add(T(box(cw, 0.25, 0.1), ccx, 2.96, s * 1.2), body); // above windows
      add(T(box(0.18, 0.75, 0.1), cx0 + 0.09, 2.53, s * 1.2), body);
      add(T(box(0.16, 0.75, 0.1), ccx - 0.1, 2.53, s * 1.2), body);
      add(T(box(0.18, 0.75, 0.1), cx1 - 0.09, 2.53, s * 1.2), body);
      add(T(box(cw, 0.05, 0.12), ccx, 2.16, s * 1.22), trim);
      P.push(...rivetsX(cx0 + 0.15, cx1 - 0.15, 1.3, s * 1.25, 8, 0.03, s).map((g) => paint(g, metal)));
      P.push(...rivetsX(cx0 + 0.15, cx1 - 0.15, 2.05, s * 1.25, 8, 0.03, s).map((g) => paint(g, metal)));
      // cab steps
      add(T(box(0.3, 0.05, 0.2), cx0 + 0.25, 0.62, s * 1.3), metal);
      add(T(box(0.3, 0.05, 0.2), cx0 + 0.25, 0.92, s * 1.3), metal);
    }
    // cab front (with two spectacle windows) and back
    add(T(box(0.1, 0.95, 2.4), cx1, 1.68, 0), body);
    add(T(box(0.1, 0.3, 2.4), cx1, 2.98, 0), body);
    add(T(box(0.1, 0.75, 0.5), cx1, 2.53, 0), body);
    add(T(box(0.1, 0.75, 0.25), cx1, 2.53, 1.08), body);
    add(T(box(0.1, 0.75, 0.25), cx1, 2.53, -1.08), body);
    add(T(box(0.1, 1.9, 2.4), cx0, 2.1, 0), body);
    // roof: curved, overhanging, armour ridge + vent
    // curved roof: a thin arched shell over the cab, with a flat underside
    const shell = new THREE.CylinderGeometry(2.6, 2.6, cw + 0.55, 20, 1, true, -0.52, 1.04);
    shell.rotateZ(Math.PI / 2);
    shell.rotateX(-Math.PI / 2);
    add(T(shell, ccx, 3.22 - 2.6, 0), pal.roof);
    add(T(box(cw + 0.55, 0.06, 2.62), ccx, 3.09, 0), pal.roof);
    add(T(box(cw * 0.6, 0.16, 0.7), ccx, 3.24, 0), dark);
    add(T(box(cw + 0.6, 0.05, 0.08), ccx, 3.12, 1.32), trim);
    add(T(box(cw + 0.6, 0.05, 0.08), ccx, 3.12, -1.32), trim);
    // rear coupler + armour skirt under the cab
    add(T(box(0.4, 0.2, 0.3), -L - 0.12, 0.78, 0), metal);
    add(T(box(0.18, 0.14, 0.34), -L - 0.32, 0.78, 0), "#2d2f33");
    for (const s of [-1, 1]) add(T(box(cw, 0.36, 0.08), ccx, 1.0, s * 1.22), dark);
    // marker lamps on the buffer beam
    for (const s of [-1, 1]) add(T(box(0.14, 0.2, 0.14), L + 0.12, 1.25, s * 0.95), "#2b2f35");
    const g = merge(P);
    return g;
  });
}

/** mud/scorch plates that appear as a car takes damage (two stages) */
function damageGeo(len, h0, h1, stage, seed) {
  return cached(`dmg-${len}-${stage}-${seed}`, () => {
    const P = [];
    let s = seed * 77;
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const n = stage === 1 ? 7 : 11;
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      const x = (r() - 0.5) * (len - 0.6);
      const y = h0 + r() * (h1 - h0);
      const w = 0.25 + r() * 0.5;
      const h = 0.12 + r() * 0.3;
      const col = stage === 1 ? (r() < 0.5 ? "#2a2522" : "#3a3633") : r() < 0.3 ? "#ff8a3d" : "#151312";
      P.push(paint(T(box(w, h, 0.02), x, y, side * 1.265, 0, 0, (r() - 0.5) * 0.8), col));
      if (stage === 2 && r() < 0.5) P.push(paint(T(box(0.3, 0.06, 0.12), x, y + 0.1, side * 1.3, 0.6 * side, 0, r() - 0.5), "#55504b"));
    }
    return merge(P);
  });
}

export function buildLoco(pal) {
  const root = new THREE.Group();
  root.name = "loco";
  const mat = paintMat(pal);
  const body = new THREE.Mesh(locoBody(pal), mat);
  body.castShadow = true;
  body.receiveShadow = true;
  root.add(body);
  // windows (warm interior glow)
  const glass = glassMat(pal);
  const wins = new THREE.Mesh(
    cached(`loco-glass`, () =>
      merge([
        paint(T(box(0.52, 0.66, 0.04), -2.3, 2.53, 1.2), "#ffffff"),
        paint(T(box(0.52, 0.66, 0.04), -1.5, 2.53, 1.2), "#ffffff"),
        paint(T(box(0.52, 0.66, 0.04), -2.3, 2.53, -1.2), "#ffffff"),
        paint(T(box(0.52, 0.66, 0.04), -1.5, 2.53, -1.2), "#ffffff"),
        paint(T(box(0.04, 0.6, 0.42), -0.95, 2.53, 0.62), "#ffffff"),
        paint(T(box(0.04, 0.6, 0.42), -0.95, 2.53, -0.62), "#ffffff"),
      ])
    ),
    glass
  );
  root.add(wins);
  // headlamp lens + marker lamps
  const lamp = new THREE.Mesh(cached("loco-lamp", () => merge([paint(T(cylX(0.16, 0.05, 14), 3.4, 2.78, 0), "#ffffff"), paint(T(box(0.04, 0.1, 0.1), L + 0.21, 1.27, 0.95), "#ffffff"), paint(T(box(0.04, 0.1, 0.1), L + 0.21, 1.27, -0.95), "#ffffff")])), lampMat());
  root.add(lamp);
  // lamp glow sprite (brighter at night / in tunnels)
  const glowMat = new THREE.SpriteMaterial({ map: blobTexture(), color: "#ffe9b0", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35, fog: false });
  const glow = new THREE.Sprite(glowMat);
  glow.position.set(3.55, 2.78, 0);
  glow.scale.set(1.3, 1.3, 1);
  root.add(glow);
  // emblems on the cab sides
  const emMat = new THREE.MeshBasicMaterial({ map: emblemTexture(pal.trim, pal.id), transparent: true, depthWrite: false, toneMapped: false });
  for (const s of [-1, 1]) {
    const em = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), emMat);
    em.position.set(-2.1, 1.65, s * 1.258);
    if (s < 0) em.rotation.y = Math.PI;
    root.add(em);
  }
  // wheels: 3 drivers, 2 lead, 1 trailing per side
  const wheels = [];
  const drivers = [-1.75, -0.45, 0.85];
  const dGeo = wheelGeo(0.6, "#b23a2e", "#3b3d42", 10, true);
  const sGeo = wheelGeo(0.36, "#b23a2e", "#3b3d42", 8);
  const wm = metalMat();
  const wheelGroup = new THREE.Group();
  root.add(wheelGroup);
  const addWheel = (geo, x, r, s) => {
    const m = new THREE.Mesh(geo, wm);
    m.position.set(x, r, s * GAUGE);
    if (s < 0) m.rotation.y = Math.PI; // face outward
    m.castShadow = true;
    m.userData.r = r;
    m.userData.flip = s < 0 ? -1 : 1;
    wheelGroup.add(m);
    wheels.push(m);
  };
  for (const s of [-1, 1]) {
    for (const x of drivers) addWheel(dGeo, x, 0.6, s);
    for (const x of [1.95, 2.7]) addWheel(sGeo, x, 0.36, s);
    addWheel(sGeo, -2.85, 0.36, s);
  }
  // coupling rods (move on a crank circle) + crossheads
  const rodGeo = cached("loco-rod", () => merge([paint(box(2.75, 0.09, 0.05), "#c9cdd2"), paint(T(cylZ(0.07, 0.07, 10), -1.3, 0, 0), "#9aa0a6"), paint(T(cylZ(0.07, 0.07, 10), 0, 0, 0), "#9aa0a6"), paint(T(cylZ(0.07, 0.07, 10), 1.3, 0, 0), "#9aa0a6")]));
  const mainRodGeo = cached("loco-mainrod", () => merge([paint(T(box(1.55, 0.08, 0.05), 0.775, 0, 0), "#d8dce0")]));
  const rods = [];
  for (const s of [-1, 1]) {
    const rod = new THREE.Mesh(rodGeo, wm);
    rod.position.set(-0.45, 0.6, s * (GAUGE + 0.13));
    rod.userData.side = s;
    root.add(rod);
    const main = new THREE.Mesh(mainRodGeo, wm);
    main.position.set(0.85, 0.6, s * (GAUGE + 0.19));
    main.userData.side = s;
    root.add(main);
    rods.push({ rod, main, s });
  }
  // damage overlays
  const dmgMat = vcMat("tc-dmg", { roughness: 0.95, flatShading: true });
  const dmg1 = new THREE.Mesh(damageGeo(LOCO_LEN, 1.0, 2.0, 1, 3), dmgMat);
  const dmg2 = new THREE.Mesh(damageGeo(LOCO_LEN, 1.0, 2.3, 2, 5), dmgMat);
  dmg1.visible = dmg2.visible = false;
  root.add(dmg1, dmg2);
  return {
    kind: "loco",
    root,
    body,
    mat,
    wheels,
    rods,
    dmg1,
    dmg2,
    glow,
    glowMat,
    chimney: new THREE.Vector3(2.35, 3.6, 0),
    lampPos: new THREE.Vector3(3.6, 2.78, 0),
    len: LOCO_LEN,
    height: 3.6,
  };
}

/* ================================================================ wagon */
const W = WAGON_LEN / 2; // 2.45

function wagonBody(pal, variant) {
  return cached(`wagon-body-${pal.id}-${variant}`, () => {
    const P = [];
    const add = (g, c, j = 0.05) => P.push(paint(g, c, j, P.length + 3));
    const { body, dark, trim, metal } = pal;
    // underframe + deck
    add(T(box(WAGON_LEN - 0.2, 0.26, 1.3), 0, 0.72, 0), dark);
    add(T(box(WAGON_LEN - 0.1, 0.16, 2.42), 0, 0.93, 0), dark);
    // bulwark side walls (armour plates with seams), slight outward cant
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const pw = (WAGON_LEN - 0.3) / 3;
        const x = -W + 0.15 + pw * (k + 0.5);
        add(T(box(pw - 0.03, 0.74, 0.1), x, 1.38, s * 1.19, s * 0.05, 0, 0), body, 0.06);
        P.push(...rivetsY(x - pw / 2 + 0.1, 1.1, 1.66, s * 1.25, 4, 0.028, s).map((g) => paint(g, metal)));
        P.push(...rivetsY(x + pw / 2 - 0.1, 1.1, 1.66, s * 1.25, 4, 0.028, s).map((g) => paint(g, metal)));
      }
      add(T(box(WAGON_LEN - 0.25, 0.07, 0.16), 0, 1.76, s * 1.18), trim);
      add(T(box(WAGON_LEN - 0.25, 0.05, 0.04), 0, 1.06, s * 1.26), trim);
      // side step + grab bar
      add(T(box(0.35, 0.05, 0.18), W - 0.4, 0.62, s * 1.3), metal);
      add(T(cylX(0.02, 0.5, 6), W - 0.4, 1.5, s * 1.3), trim);
    }
    // end walls (lower), with door
    for (const e of [-1, 1]) {
      add(T(box(0.1, 0.62, 2.38), e * (W - 0.1), 1.31, 0), body);
      add(T(box(0.06, 0.5, 0.6), e * (W - 0.04), 1.28, 0), dark);
      add(T(box(0.12, 0.06, 2.38), e * (W - 0.1), 1.64, 0), trim);
      // couplers + buffers
      add(T(box(0.3, 0.18, 0.28), e * (W + 0.08), 0.76, 0), metal);
      add(T(box(0.12, 0.12, 0.3), e * (W + 0.25), 0.76, 0), "#2d2f33");
      for (const z of [-0.78, 0.78]) {
        add(T(cylX(0.11, 0.24), e * (W + 0.08), 0.8, z), metal);
        add(T(cylX(0.17, 0.05), e * (W + 0.21), 0.8, z), metal);
      }
    }
    // central pedestal for the module + hazard ring (visible when empty)
    add(T(cyl(0.82, 0.92, 0.82, 22), 0, 1.42, 0), dark);
    add(T(cyl(0.86, 0.86, 0.08, 22), 0, 1.86, 0), metal);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      add(T(box(0.28, 0.02, 0.14), Math.cos(a) * 0.72, 1.905, Math.sin(a) * 0.72, 0, -a, 0), i % 2 ? "#f2c230" : "#1d1d20");
    }
    // deck clutter, varied per wagon
    const r = (k) => ((variant * 31 + k * 17) % 10) / 10;
    for (const e of [-1, 1]) {
      const x = e * (W - 0.55);
      if (r(e + 2) < 0.5) {
        add(T(box(0.42, 0.34, 0.42), x, 1.17, 0.6), "#6b5236");
        add(T(box(0.44, 0.04, 0.44), x, 1.35, 0.6), "#4a3826");
        add(T(box(0.38, 0.3, 0.38), x, 1.15, -0.62), "#3e4a3c");
      } else {
        add(T(cyl(0.2, 0.2, 0.5, 12), x, 1.25, 0.65), "#7a3b2a");
        add(T(cyl(0.2, 0.2, 0.5, 12), x - e * 0.38, 1.25, 0.7), "#5a5f66");
        add(T(box(0.5, 0.26, 0.36), x, 1.13, -0.62), "#4a4f45");
      }
    }
    // lamp post on the rear end
    add(T(cyl(0.03, 0.03, 0.5, 6), -W + 0.25, 1.95, -1.0), metal);
    add(T(box(0.12, 0.14, 0.12), -W + 0.25, 2.24, -1.0), "#2b2f35");
    return merge(P);
  });
}

function bogieGeo(pal) {
  return cached(`bogie-${pal.id}`, () => {
    const P = [];
    const add = (g, c) => P.push(paint(g, c, 0.04, P.length + 9));
    for (const s of [-1, 1]) {
      add(T(box(1.55, 0.18, 0.1), 0, 0.42, s * (GAUGE + 0.15)), pal.dark);
      add(T(box(0.45, 0.08, 0.12), 0, 0.56, s * (GAUGE + 0.15)), pal.metal);
      for (const x of [-0.12, 0.12]) add(T(cyl(0.05, 0.05, 0.18, 8), x, 0.6, s * (GAUGE + 0.15)), "#c0a040");
      for (const x of [-0.55, 0.55]) add(T(box(0.22, 0.2, 0.14), x, 0.34, s * (GAUGE + 0.17)), "#2d2f33");
    }
    add(T(box(0.25, 0.14, GAUGE * 2 + 0.3), 0, 0.5, 0), pal.dark);
    return merge(P);
  });
}

export function buildWagon(pal, index) {
  const root = new THREE.Group();
  root.name = `wagon${index}`;
  const mat = paintMat(pal);
  const body = new THREE.Mesh(wagonBody(pal, index % 4), mat);
  body.castShadow = true;
  body.receiveShadow = true;
  root.add(body);
  const emMat = new THREE.MeshBasicMaterial({ map: emblemTexture(pal.trim, pal.id), transparent: true, depthWrite: false, toneMapped: false });
  for (const s of [-1, 1]) {
    const em = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), emMat);
    em.position.set(0, 1.38, s * 1.262);
    if (s < 0) em.rotation.y = Math.PI;
    root.add(em);
  }
  const wheels = [];
  const wm = metalMat();
  const wGeo = wheelGeo(0.34, "#3b3d42", "#2a2b2f", 6);
  const bogies = [];
  for (const bx of [-1.55, 1.55]) {
    const b = new THREE.Mesh(bogieGeo(pal), mat);
    b.position.set(bx, 0, 0);
    b.castShadow = true;
    root.add(b);
    bogies.push(b);
    for (const ax of [-0.55, 0.55])
      for (const s of [-1, 1]) {
        const m = new THREE.Mesh(wGeo, wm);
        m.position.set(bx + ax, 0.34, s * GAUGE);
        if (s < 0) m.rotation.y = Math.PI;
        m.userData.r = 0.34;
        m.userData.flip = s < 0 ? -1 : 1;
        root.add(m);
        wheels.push(m);
      }
  }
  const dmgMat = vcMat("tc-dmg", { roughness: 0.95, flatShading: true });
  const dmg1 = new THREE.Mesh(damageGeo(WAGON_LEN, 1.05, 1.7, 1, 10 + index), dmgMat);
  const dmg2 = new THREE.Mesh(damageGeo(WAGON_LEN, 1.05, 1.7, 2, 20 + index), dmgMat);
  dmg1.visible = dmg2.visible = false;
  root.add(dmg1, dmg2);
  const mount = new THREE.Group();
  mount.position.set(0, MOUNT_Y, 0);
  root.add(mount);
  return { kind: "wagon", root, body, mat, wheels, bogies, dmg1, dmg2, mount, len: WAGON_LEN, height: 2.2, module: null, moduleKey: "" };
}

/* ================================================================ crew */
function crewGeo(pal, pose = "gun") {
  return cached(`crew-${pal.id}-${pose}`, () => {
    const P = [];
    const add = (g, c) => P.push(paint(g, c, 0.04, P.length + 1));
    const uni = "#33465c";
    add(T(box(0.26, 0.34, 0.3), 0, 0.2, 0), uni); // torso
    add(T(box(0.27, 0.07, 0.31), 0, 0.08, 0), "#2a2a2a"); // belt
    add(T(sph(0.11, 10, 8), 0.02, 0.48, 0), "#e2b48c"); // head
    add(T(dome(0.135, 12, 5), 0.0, 0.5, 0), pal.trim); // helmet
    add(T(cyl(0.16, 0.16, 0.02, 12), 0, 0.5, 0), pal.trim); // brim
    add(T(box(0.05, 0.035, 0.16), 0.11, 0.49, 0), "#1b2533"); // goggles
    if (pose === "gun") {
      for (const s of [-1, 1]) add(T(box(0.3, 0.08, 0.08), 0.15, 0.25, s * 0.14, 0, 0, -0.2), uni);
    } else {
      add(T(box(0.08, 0.3, 0.08), 0, 0.25, 0.18), uni);
      add(T(box(0.08, 0.3, 0.08), 0.1, 0.32, -0.18, 0, 0, -0.9), uni);
    }
    return merge(P);
  });
}

/* ================================================================ modules */
/**
 * Every module returns:
 *   root   sits on the wagon mount (y = MOUNT_Y)
 *   yaw    turns to engine module.yaw (model faces +X at 0)
 *   pitch  barrel elevation (visual only)
 *   recoil parts that slide back on fire
 *   spin   (gunner L3) barrel cluster that spins while firing
 *   arm    (repair) crane boom that swings toward the car being welded
 *   muzzle local point (in pitch space) for flashes
 */
export function buildModule(type, level, pal) {
  const key = `${type}-${level}-${pal.id}`;
  const vm = vcMat("tc-mod", { roughness: 0.5, metalness: 0.45, flatShading: false });
  const root = new THREE.Group();
  const yaw = new THREE.Group();
  const pitch = new THREE.Group();
  root.add(yaw);
  yaw.add(pitch);
  const out = { type, level, root, yaw, pitch, recoil: [], spin: null, arm: null, muzzles: [], glow: [], key };
  const mesh = (geo, parent = yaw, mat = vm) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const { body, dark, trim, metal } = pal;
  const L2 = level >= 2;
  const L3 = level >= 3;

  if (type === "gunner") {
    // turntable + shield + seated gunner
    mesh(
      cached(`gun-base-${key}`, () => {
        const P = [];
        P.push(paint(cyl(0.62, 0.68, 0.16, 20), dark));
        P.push(paint(T(cyl(0.12, 0.16, 0.5, 10), 0, 0.3, 0), metal));
        if (!L3) {
          // curved gun shield
          const sh = new THREE.CylinderGeometry(0.66, 0.66, L2 ? 0.75 : 0.6, 16, 1, true, Math.PI * 0.18, Math.PI * 0.64);
          sh.rotateY(Math.PI / 2 - Math.PI * 0.5);
          P.push(paint(T(sh, 0.0, L2 ? 0.55 : 0.48, 0), body, 0.05));
          P.push(paint(T(box(0.06, 0.05, 1.0), 0.6, L2 ? 0.94 : 0.8, 0), trim));
          if (L2) for (const s of [-1, 1]) P.push(paint(T(cyl(0.15, 0.15, 0.22, 12), -0.05, 0.45, s * 0.42, Math.PI / 2), "#6b5236"));
        } else {
          // enclosed armoured cupola
          P.push(paint(T(dome(0.62, 18, 7), 0, 0.12, 0, 0, 0, 0, 1, 0.82, 1), body, 0.04));
          P.push(paint(T(torus(0.62, 0.04, 6, 24), 0, 0.14, 0, Math.PI / 2), trim));
          P.push(paint(T(box(0.3, 0.12, 0.5), 0.45, 0.42, 0), dark));
          P.push(paint(T(cyl(0.015, 0.015, 0.7, 4), -0.35, 0.8, 0.3), metal));
          P.push(paint(T(sph(0.04, 6, 4), -0.35, 1.15, 0.3), "#ff4d3d"));
          for (const s of [-1, 1]) P.push(paint(T(box(0.6, 0.06, 0.04), 0, 0.36, s * 0.6), trim));
        }
        return merge(P);
      })
    );
    if (!L3) {
      const crew = mesh(crewGeo(pal, "gun"));
      crew.position.set(-0.42, 0.12, 0);
    }
    // barrels on the pitch group
    pitch.position.set(0.15, L3 ? 0.45 : 0.62, 0);
    const n = L2 ? 4 : 2;
    const barrelGeo = cached(`gun-barrels-${n}-${L3}`, () => {
      const P = [];
      P.push(paint(T(box(0.42, 0.22, L2 ? 0.42 : 0.3), 0.05, 0, 0), "#2b2f35"));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.PI / 4;
        const rz = L2 ? Math.cos(a) * 0.09 : (i ? 1 : -1) * 0.08;
        const ry = L2 ? Math.sin(a) * 0.09 : 0;
        P.push(paint(T(cylX(0.035, 0.95, 8), 0.65, ry, rz), "#3a3e45"));
        P.push(paint(T(cylX(0.055, 0.32, 8), 0.35, ry, rz), "#4a4f57"));
        P.push(paint(T(cylX(0.045, 0.06, 8), 1.1, ry, rz), metal));
      }
      return merge(P);
    });
    const barrels = new THREE.Group();
    pitch.add(barrels);
    mesh(barrelGeo, barrels);
    if (L3) out.spin = barrels;
    out.recoil.push(barrels);
    out.muzzles.push(new THREE.Vector3(1.15, 0, 0));
    if (L2) mesh(cached(`gun-drum-${pal.id}`, () => merge([paint(T(cylZ(0.14, 0.18, 12), -0.12, -0.05, 0.28), "#6b5236"), paint(T(cylZ(0.14, 0.18, 12), -0.12, -0.05, -0.28), "#6b5236")])), pitch);
  } else if (type === "cannon") {
    mesh(
      cached(`can-base-${key}`, () => {
        const P = [];
        const w = L2 ? 1.25 : 1.05;
        P.push(paint(cyl(0.72, 0.8, 0.18, 22), dark));
        // sloped turret: prism profile extruded across Z
        const prof = L3 ? [[-0.75, 0], [0.55, 0], [0.82, 0.32], [0.55, 0.72], [-0.65, 0.72], [-0.85, 0.35]] : L2 ? [[-0.65, 0], [0.5, 0], [0.75, 0.28], [0.45, 0.62], [-0.55, 0.62], [-0.75, 0.3]] : [[-0.55, 0], [0.42, 0], [0.62, 0.25], [0.35, 0.52], [-0.5, 0.52]];
        P.push(paint(T(prism(prof, w), 0, 0.08, 0), body, 0.04));
        P.push(paint(T(box(0.9, 0.05, w + 0.04), -0.05, L3 ? 0.82 : L2 ? 0.72 : 0.62, 0), trim));
        P.push(...rivetsX(-0.4, 0.3, 0.3, w / 2, 5, 0.03, 1).map((g) => paint(g, metal)));
        P.push(...rivetsX(-0.4, 0.3, 0.3, -w / 2, 5, 0.03, -1).map((g) => paint(g, metal)));
        // commander hatch
        P.push(paint(T(cyl(0.18, 0.2, 0.1, 14), -0.3, L3 ? 0.84 : L2 ? 0.74 : 0.64, 0.2), dark));
        if (L2) for (const s of [-1, 1]) P.push(paint(T(box(1.1, 0.42, 0.06), -0.1, 0.35, s * (w / 2 + 0.06)), dark, 0.05));
        if (L3) {
          P.push(paint(T(cylZ(0.07, 1.3, 10), -0.15, 0.9, 0), metal)); // rangefinder bar
          for (const s of [-1, 1]) P.push(paint(T(cylZ(0.1, 0.12, 10), -0.15, 0.9, s * 0.68), trim));
          P.push(paint(T(box(0.06, 0.06, w + 0.08), 0.45, 0.62, 0), trim));
        }
        return merge(P);
      })
    );
    pitch.position.set(0.45, L3 ? 0.42 : 0.36, 0);
    const barrelGeo = cached(`can-barrel-${level}-${pal.id}`, () => {
      const P = [];
      const len = L3 ? 1.6 : L2 ? 1.55 : 1.2;
      const zs = L3 ? [-0.2, 0.2] : [0];
      for (const z of zs) {
        P.push(paint(T(cylX(L2 ? 0.12 : 0.11, len, 14, L2 ? 0.15 : 0.13), len / 2, 0, z), "#3a3e45"));
        P.push(paint(T(cylX(0.17, 0.3, 14), 0.15, 0, z), "#2b2f35"));
        if (L2) {
          P.push(paint(T(box(0.24, 0.22, 0.3), len + 0.06, 0, z), "#2b2f35")); // muzzle brake
          P.push(paint(T(box(0.1, 0.24, 0.32), len - 0.06, 0, z), "#3a3e45"));
        } else P.push(paint(T(cylX(0.15, 0.12, 14), len, 0, z), "#2b2f35"));
        if (L3) P.push(paint(T(cylX(0.165, 0.06, 14), len * 0.55, 0, z), trim));
      }
      return merge(P);
    });
    const barrel = new THREE.Group();
    pitch.add(barrel);
    mesh(barrelGeo, barrel);
    out.recoil.push(barrel);
    const len = L3 ? 1.6 : L2 ? 1.55 : 1.2;
    for (const z of L3 ? [-0.2, 0.2] : [0]) out.muzzles.push(new THREE.Vector3(len + 0.15, 0, z));
  } else if (type === "lancer") {
    mesh(
      cached(`lan-base-${key}`, () => {
        const P = [];
        P.push(paint(cyl(0.56, 0.64, 0.16, 20), dark));
        P.push(paint(T(box(0.5, 0.42, 0.6), -0.1, 0.3, 0), body, 0.05));
        P.push(paint(T(box(0.52, 0.04, 0.62), -0.1, 0.52, 0), trim));
        // winch drum
        P.push(paint(T(cylZ(0.13, 0.5, 12), -0.38, 0.38, 0), metal));
        const crew = crewGeo(pal, "gun").clone();
        P.push(T(crew, -0.62, 0.1, 0.32));
        return merge(P);
      })
    );
    pitch.position.set(0.1, 0.62, 0);
    const bowGeo = cached(`lan-bow-${level}-${pal.id}`, () => {
      const P = [];
      const len = L2 ? 1.9 : 1.6;
      // stock / rail(s)
      const rails = L3 ? [-0.1, 0.1] : [0];
      for (const z of rails) {
        P.push(paint(T(box(len, 0.1, 0.12), len / 2 - 0.3, 0, z), "#5b4630"));
        P.push(paint(T(box(len, 0.03, 0.04), len / 2 - 0.3, 0.065, z), metal));
      }
      // bow arms: two arcs of a torus, spring steel
      const armR = L2 ? 0.95 : 0.78;
      const arc = new THREE.TorusGeometry(armR, 0.05, 6, 18, Math.PI * 0.62);
      arc.rotateX(Math.PI / 2);
      arc.rotateY(Math.PI * 0.69);
      P.push(paint(T(arc, len - 0.45 - armR * 0.6, 0.02, 0), trim));
      // string
      for (const s of [-1, 1]) P.push(paint(T(box(0.012, 0.012, armR * 0.95), len - 0.95, 0.03, s * armR * 0.46, 0, s * 0.42, 0), "#e8e2cf"));
      if (L2) {
        P.push(paint(T(cylX(0.06, 0.45, 10), 0.3, 0.17, 0), "#2b2f35")); // scope
        P.push(paint(T(cylX(0.07, 0.04, 10), 0.53, 0.17, 0), "#7fd1ff"));
        for (const s of [-1, 1]) P.push(paint(T(box(0.16, 0.16, 0.16), len - 0.4, 0.02, s * (armR * 0.82)), "#2b2f35"));
      }
      return merge(P);
    });
    const bow = new THREE.Group();
    pitch.add(bow);
    mesh(bowGeo, bow);
    // the loaded bolt (hidden briefly after a shot)
    const bolt = mesh(cached("lan-bolt", () => merge([paint(T(cylX(0.025, 1.0, 6), 0, 0, 0), "#d9d2bd"), paint(T(cylX(0.001, 0.18, 6, 0.06), 0.58, 0, 0), "#cfd6dc")])), pitch);
    bolt.position.set(0.75, 0.09, 0);
    out.bolt = bolt;
    if (L3) {
      const coilMat = stdMat("tc-coil", { color: "#1d3d52", emissive: "#5fe3ff", emissiveIntensity: 1.6, roughness: 0.3 });
      const coils = mesh(cached("lan-coils", () => merge([0.2, 0.5, 0.8].map((x) => paint(T(torus(0.12, 0.03, 6, 14), x, 0.02, 0, 0, Math.PI / 2), "#ffffff")))), pitch, coilMat);
      out.glow.push(coils);
    }
    out.recoil.push(bow);
    out.muzzles.push(new THREE.Vector3(L2 ? 1.6 : 1.3, 0.05, 0));
  } else if (type === "repair") {
    mesh(
      cached(`rep-base-${key}`, () => {
        const P = [];
        P.push(paint(cyl(0.6, 0.66, 0.16, 20), dark));
        // tool cabinet + crates + welding tanks
        P.push(paint(T(box(0.55, 0.5, 0.42), -0.32, 0.33, -0.28), body, 0.05));
        P.push(paint(T(box(0.57, 0.04, 0.44), -0.32, 0.6, -0.28), trim));
        for (const z of [0.2, 0.42]) P.push(paint(T(cyl(0.1, 0.1, 0.55, 10), -0.42, 0.36, z), z > 0.3 ? "#3f7d4a" : "#b8342c"));
        P.push(paint(T(box(0.3, 0.26, 0.3), 0.3, 0.21, -0.35), "#6b5236"));
        P.push(paint(T(cyl(0.17, 0.2, 0.42, 12), 0, 0.29, 0), metal)); // crane post
        if (L3) {
          P.push(paint(T(box(0.7, 0.36, 0.36), 0.2, 0.26, 0.4), "#6b5236"));
          P.push(paint(T(torus(0.24, 0.06, 6, 10), -0.32, 0.8, -0.28), trim)); // cog
          P.push(paint(T(cyl(0.012, 0.012, 0.5, 4), 0.42, 0.45, -0.32), metal));
        }
        const crew = crewGeo(pal, "work").clone();
        P.push(T(crew, 0.3, 0.12, 0.32));
        return merge(P);
      })
    );
    // crane boom(s): pivot at the post top, swings in yaw (arm) and dips (pitch)
    const boomGeo = cached(`rep-boom-${level}-${pal.id}`, () => {
      const P = [];
      const len = L3 ? 1.55 : 1.25;
      P.push(paint(T(box(len, 0.1, 0.1), len / 2, 0.08, 0, 0, 0, -0.2), trim));
      P.push(paint(T(box(len * 0.8, 0.05, 0.05), len * 0.42, -0.02, 0, 0, 0, -0.35), "#2b2f35"));
      // claw + torch at the tip
      const tx = Math.cos(-0.2) * len;
      const ty = 0.08 + Math.sin(-0.2) * len;
      P.push(paint(T(box(0.14, 0.22, 0.14), tx, ty - 0.12, 0), "#2b2f35"));
      for (const s of [-1, 1]) P.push(paint(T(box(0.04, 0.18, 0.04), tx + 0.04, ty - 0.3, s * 0.06, s * 0.3), metal));
      return merge(P);
    });
    pitch.position.set(0, 0.52, 0);
    const arm = new THREE.Group();
    pitch.add(arm);
    mesh(boomGeo, arm);
    out.arm = arm;
    const len = L3 ? 1.55 : 1.25;
    out.muzzles.push(new THREE.Vector3(Math.cos(-0.2) * len + 0.04, 0.08 + Math.sin(-0.2) * len - 0.38, 0));
    if (L2) {
      const arm2 = new THREE.Group();
      arm2.rotation.y = Math.PI;
      pitch.add(arm2);
      mesh(boomGeo, arm2);
      out.arm2 = arm2;
    }
    if (L3) {
      const beaconMat = stdMat("tc-beacon", { color: "#553300", emissive: "#ffb020", emissiveIntensity: 1.8 });
      const beacon = mesh(cached("rep-beacon", () => merge([paint(T(cyl(0.07, 0.07, 0.1, 10), 0.42, 0.75, -0.32), "#ffffff")])), yaw, beaconMat);
      out.glow.push(beacon);
    }
  }
  // level pips on the base (1–3 brass chevrons)
  const pips = new THREE.Mesh(
    cached(`pips-${level}-${pal.id}`, () => merge(Array.from({ length: level }, (_, i) => paint(T(box(0.06, 0.035, 0.22), -0.6 + i * 0.1, 0.12, 0.52, 0, 0, 0), pal.trim)))),
    vm
  );
  yaw.add(pips);
  return out;
}

/** small flat ground shadow under a car (cheap contact shadow in low quality) */
export function contactShadow(len) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len + 0.6, 2.9), basicMat("tc-cshadow", { map: blobTexture(), color: "#000000", transparent: true, opacity: 0.32, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.025;
  m.renderOrder = 1;
  return m;
}
