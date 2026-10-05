/**
 * Castle Rush — the two fortresses.
 *
 * Built in local space facing +X (front wall face at x = FRONT); the enemy
 * castle is the same builder rotated half a turn. The two are deliberately
 * different structures, not recolours:
 *   player  round corner towers with conical blue roofs, a gabled keep,
 *           twin gate turrets, gold-crest banners
 *   enemy   square battlemented towers, a tall spired keep with glowing
 *           windows, spiked crowns, dark-crest red banners
 * Each kingdom swaps stone colour and the roof/spire style.
 *
 * Parts are kept in separate groups (front wall, gatehouse, towers, keep) so
 * damage stages and the destruction sequence can move them independently.
 */
import * as THREE from "three";
import { FIELD } from "../engine/constants.js";
import { paint, merge, T, box, cyl, cone, sph, dome, archWall, archSolid, merlonRing, merlonRow, merlonRowX, vcMat, rng } from "./geo.js";
import { stoneTexture, emblemTexture } from "./textures.js";

export const FRONT = FIELD.castleX - FIELD.wallX; // 3.4
const WALL_H = 3.4;
const HALF_W = 4.3;
const GATE_W = 1.9;
const GATE_H = 2.55;

let stoneMat = null;
let trimMat = null;
let glowMats = {};
function mats() {
  if (!stoneMat) {
    stoneMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: stoneTexture(), roughness: 0.92, flatShading: true });
    trimMat = vcMat("castleTrim", { roughness: 0.75 });
  }
  return { stoneMat, trimMat };
}
function glowMat(color) {
  if (!glowMats[color]) glowMats[color] = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.4 });
  return glowMats[color];
}

function mesh(geo, mat, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

/** a cloth banner (segmented plane, waved on the CPU) */
function banner(w, h, color, kind, tail = true) {
  const g = new THREE.PlaneGeometry(w, h, 4, 8);
  g.translate(0, -h / 2, 0);
  if (tail) {
    // swallow-tail bottom
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      if (y < -h * 0.9) p.setY(i, y + (1 - Math.abs(x) / (w / 2)) * h * 0.12);
    }
  }
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, map: emblemTexture(kind), side: THREE.DoubleSide, roughness: 0.9 }));
  m.castShadow = true;
  m.userData.base = Float32Array.from(g.attributes.position.array);
  m.userData.w = w;
  m.userData.h = h;
  return m;
}

/** a small pennant flag on a pole */
function flag(color, poleH = 1.3) {
  const grp = new THREE.Group();
  const pole = mesh(paint(cyl(0.035, 0.035, poleH, 6), "#5a3c22"), vcMat("castleTrim"));
  pole.position.y = poleH / 2;
  const g = new THREE.PlaneGeometry(0.9, 0.5, 6, 2);
  g.translate(0.45, 0, 0);
  const cloth = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.9 }));
  cloth.position.y = poleH - 0.3;
  cloth.userData.base = Float32Array.from(g.attributes.position.array);
  cloth.userData.flag = true;
  cloth.castShadow = true;
  grp.add(pole, cloth);
  grp.userData.cloth = cloth;
  return grp;
}

/**
 * build(side, kingdom) → { group, parts, banners, flags, torches, anchor }
 */
export function buildCastle(side, k) {
  const { stoneMat: SM, trimMat: TM } = mats();
  const enemy = side === "enemy";
  const stone = enemy ? k.enemyStone : k.stone;
  const stoneD = k.stoneDark;
  const roof = enemy ? k.roofEnemy : k.roofPlayer;
  const style = k.props;
  const r = rng(enemy ? 41 : 17);
  const wood = "#7a4f2a";
  const iron = "#3d3f45";
  const gold = "#e8bf4f";
  const dark = "#141214";

  const group = new THREE.Group();
  const parts = {};
  const mk = (name) => {
    const g = new THREE.Group();
    g.userData.name = name;
    parts[name] = g;
    group.add(g);
    return g;
  };

  /* ---------------------------------------------------------- front wall */
  const front = mk("front");
  {
    const s = [];
    const t = [];
    s.push(paint(T(archWall(HALF_W * 2, WALL_H, 0.9, GATE_W, GATE_H), FRONT - 0.45, 0, 0), stone, 0.12, 1));
    s.push(...merlonRow(FRONT - 0.12, WALL_H, -HALF_W + 0.2, HALF_W - 0.2).map((g, i) => paint(g, stone, 0.12, i + 3)));
    s.push(...merlonRow(FRONT - 0.85, WALL_H, -HALF_W + 0.2, HALF_W - 0.2).map((g, i) => paint(g, stoneD, 0.1, i + 40)));
    // plinth + string course
    s.push(paint(T(box(1.1, 0.5, HALF_W * 2 + 0.2), FRONT - 0.45, 0.25, 0), stoneD, 0.1, 5));
    s.push(paint(T(box(0.2, 0.18, HALF_W * 2), FRONT + 0.02, WALL_H - 0.1, 0), stoneD, 0.08, 6));
    // gate passage (dark) + arch keystones
    t.push(paint(T(archSolid(GATE_W - 0.02, GATE_H - 0.02, 0.1), FRONT - 1.15, 0, 0), dark));
    t.push(paint(T(box(1.2, 0.02, GATE_W - 0.1), FRONT - 0.5, 0.015, 0), "#2a2622"));
    s.push(paint(T(box(1.0, 2.3, 0.1), FRONT - 0.6, 1.15, -GATE_W / 2 + 0.02), "#3a3530"));
    s.push(paint(T(box(1.0, 2.3, 0.1), FRONT - 0.6, 1.15, GATE_W / 2 - 0.02), "#3a3530"));
    for (let i = -3; i <= 3; i++) {
      const a = (i / 3) * (Math.PI / 2) * 0.95;
      const rr = GATE_W / 2 + 0.14;
      s.push(paint(T(box(0.16, 0.3, 0.22), FRONT + 0.02, GATE_H - GATE_W / 2 + Math.cos(a) * rr, Math.sin(a) * rr, -a, 0, 0), i === 0 ? stoneD : stone, 0.1, 60 + i));
    }
    // open wooden doors swung inward + portcullis teeth
    t.push(paint(T(box(0.12, GATE_H - 0.5, GATE_W / 2), FRONT - 1.0, (GATE_H - 0.5) / 2, -GATE_W / 2 - 0.06, 0, 0.9, 0), wood, 0.1, 7));
    t.push(paint(T(box(0.12, GATE_H - 0.5, GATE_W / 2), FRONT - 1.0, (GATE_H - 0.5) / 2, GATE_W / 2 + 0.06, 0, -0.9, 0), wood, 0.1, 8));
    for (let i = 0; i < 6; i++) t.push(paint(T(box(0.06, 0.38, 0.06), FRONT - 0.32, GATE_H - 0.22, -GATE_W / 2 + 0.2 + i * 0.3), iron));
    t.push(paint(T(box(0.07, 0.07, GATE_W), FRONT - 0.32, GATE_H - 0.06, 0), iron));
    // arrow slits
    for (const z of [-3.3, -2.5, 2.5, 3.3]) t.push(paint(T(box(0.05, 0.6, 0.11), FRONT + 0.005, 1.9, z), dark));
    front.add(mesh(merge(s, 0.85), SM), mesh(merge(t), TM));
    // banners on the wall face
    const bannerCol = enemy ? "#b62b22" : "#2d6ad0";
    for (const z of [-2.05 * 1.0 - 0.9, 2.95]) {
      const b = banner(0.85, 1.75, bannerCol, side);
      b.position.set(FRONT + 0.08, WALL_H - 0.15, z);
      b.rotation.y = Math.PI / 2;
      front.add(b);
      parts.banners = parts.banners || [];
      parts.banners.push(b);
    }
  }

  /* ---------------------------------------------------------- gatehouse */
  const gate = mk("gate");
  {
    const s = [];
    const t = [];
    for (const z of [-1.55, 1.55]) {
      if (!enemy) {
        s.push(paint(T(cyl(0.72, 0.8, 4.5, 12), FRONT - 0.15, 2.25, z), stone, 0.12, 9 + z));
        s.push(...merlonRing(0.72, 4.5, 8, 0.28, 0.36, 0.22).map((g, i) => paint(T(g, FRONT - 0.15, 0, z), stone, 0.1, i)));
        t.push(paint(T(cone(0.9, 1.5, 12), FRONT - 0.15, 4.5 + 0.75, z), roof, 0.08, 10));
        t.push(paint(T(sph(0.08, 6, 4), FRONT - 0.15, 6.1, z), gold));
      } else {
        s.push(paint(T(box(1.35, 4.8, 1.25), FRONT - 0.2, 2.4, z), stone, 0.12, 9 + z));
        s.push(paint(T(box(1.55, 0.3, 1.45), FRONT - 0.2, 4.65, z), stoneD, 0.08, 11));
        s.push(...merlonRowX(z - 0.6, 4.8, FRONT - 0.85, FRONT + 0.45, 0.42, 0.26, 0.42, 0.22).map((g) => paint(g, stone, 0.1, 12)));
        s.push(...merlonRowX(z + 0.6, 4.8, FRONT - 0.85, FRONT + 0.45, 0.42, 0.26, 0.42, 0.22).map((g) => paint(g, stone, 0.1, 13)));
        s.push(...merlonRow(FRONT + 0.48, 4.8, z - 0.55, z + 0.55, 0.42, 0.26, 0.42, 0.22).map((g) => paint(g, stone, 0.1, 14)));
        for (const dz of [-0.62, 0.62]) t.push(paint(T(cone(0.08, 0.5, 4), FRONT + 0.47, 5.45, z + dz), iron));
      }
      t.push(paint(T(box(0.05, 0.55, 0.1), FRONT + (enemy ? 0.47 : 0.6), 3.0, z), dark));
    }
    // machicolated bridge above the gate
    s.push(paint(T(box(1.0, 0.7, 2.4), FRONT - 0.1, WALL_H + 0.25, 0), stoneD, 0.1, 15));
    for (let i = -2; i <= 2; i++) s.push(paint(T(box(0.22, 0.25, 0.22), FRONT + 0.32, WALL_H - 0.18, i * 0.48), stoneD, 0.1, 16 + i));
    s.push(...merlonRow(FRONT + 0.32, WALL_H + 0.6, -1.0, 1.0, 0.5, 0.3, 0.36, 0.3).map((g) => paint(g, stone, 0.1, 22)));
    gate.add(mesh(merge(s, 0.85), SM), mesh(merge(t), TM));
    // crest shield above the gate
    const crest = new THREE.Mesh(
      merge([paint(T(box(0.08, 0.8, 0.7), FRONT + 0.36, WALL_H + 0.2, 0), enemy ? "#2a2326" : "#f0c24e"), paint(T(box(0.1, 0.5, 0.42), FRONT + 0.38, WALL_H + 0.24, 0), enemy ? "#c7362b" : "#2f72d6")]),
      TM
    );
    gate.add(crest);
  }

  /* ---------------------------------------------------------- corner towers */
  const towers = [];
  for (const [name, z] of [
    ["towerL", -HALF_W - 0.25],
    ["towerR", HALF_W + 0.25],
  ]) {
    const tg = mk(name);
    towers.push(tg);
    const s = [];
    const t = [];
    const tx = FRONT - 0.7;
    if (!enemy) {
      const h = 5.6;
      s.push(paint(T(cyl(1.08, 1.22, h, 14), tx, h / 2, z), stone, 0.12, 30));
      s.push(paint(T(cyl(1.32, 1.18, 0.4, 14), tx, h + 0.1, z), stoneD, 0.1, 31));
      s.push(...merlonRing(1.22, h + 0.3, 10, 0.34, 0.4, 0.26).map((g, i) => paint(T(g, tx, 0, z), stone, 0.1, 32 + i)));
      const rh = style === "desert" ? 1.4 : 2.5;
      if (style === "desert" || style === "royal") t.push(paint(T(dome(1.1, 14, 6), tx, h + 0.35, z, 0, 0, 0, 1, style === "royal" ? 1.25 : 1, 1), style === "royal" ? gold : roof, 0.06, 33));
      else t.push(paint(T(cone(1.45, rh, 14), tx, h + 0.35 + rh / 2, z), roof, 0.08, 33));
      if (style === "frozen") t.push(paint(T(cone(0.8, rh * 0.45, 14), tx, h + 0.35 + rh * 0.78, z), "#f4f8fb", 0.04, 34));
      for (const a of [0, 1.9, -1.9]) t.push(paint(T(box(0.06, 0.55, 0.12), tx + Math.cos(a) * 1.13, 2.9, z + Math.sin(a) * 1.13, 0, -a, 0), dark));
      t.push(paint(T(box(0.07, 0.5, 0.12), tx + 1.12, 4.3, z), dark));
    } else {
      const h = 6.2;
      s.push(paint(T(box(2.1, h, 2.1), tx, h / 2, z), stone, 0.12, 30));
      s.push(paint(T(box(2.35, 0.35, 2.35), tx, h - 0.1, z), stoneD, 0.08, 31));
      s.push(...merlonRowX(z - 1.05, h + 0.08, tx - 1.05, tx + 1.05, 0.5, 0.3, 0.46, 0.26).map((g) => paint(g, stone, 0.1, 32)));
      s.push(...merlonRowX(z + 1.05, h + 0.08, tx - 1.05, tx + 1.05, 0.5, 0.3, 0.46, 0.26).map((g) => paint(g, stone, 0.1, 33)));
      s.push(...merlonRow(tx + 1.05, h + 0.08, z - 1.05, z + 1.05, 0.5, 0.3, 0.46, 0.26).map((g) => paint(g, stone, 0.1, 34)));
      s.push(...merlonRow(tx - 1.05, h + 0.08, z - 1.05, z + 1.05, 0.5, 0.3, 0.46, 0.26).map((g) => paint(g, stone, 0.1, 35)));
      // buttresses
      s.push(paint(T(box(0.5, 2.2, 2.3), tx + 0.95, 1.1, z, 0, 0, 0.12), stoneD, 0.1, 36));
      // spiked crown / kingdom style
      if (style === "shadow") {
        for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) t.push(paint(T(cone(0.16, 0.9, 5), tx + dx, h + 0.75, z + dz), "#2a2236"));
      } else if (style === "desert") {
        t.push(paint(T(dome(0.8, 12, 6), tx, h + 0.15, z, 0, 0, 0, 1, 1.4, 1), roof, 0.06, 37));
      } else if (style === "frozen") {
        t.push(paint(T(cone(0.65, 2.0, 6), tx, h + 1.1, z), "#bfe6ff", 0.05, 37));
      } else if (style === "royal") {
        t.push(paint(T(cone(0.95, 1.6, 4), tx, h + 0.9, z, 0, Math.PI / 4, 0), roof, 0.06, 37));
        t.push(paint(T(sph(0.12, 6, 4), tx, h + 1.8, z), gold));
      } else {
        t.push(paint(T(cone(0.9, 1.5, 4), tx, h + 0.85, z, 0, Math.PI / 4, 0), roof, 0.06, 37));
      }
      for (const yy of [2.6, 4.4]) t.push(paint(T(box(0.07, 0.6, 0.13), tx + 1.06, yy, z), dark));
    }
    tg.add(mesh(merge(s, 0.85), SM), mesh(merge(t), TM));
  }

  /* ---------------------------------------------------------- side + back walls */
  const sides = mk("sides");
  {
    const s = [];
    for (const z of [-HALF_W, HALF_W]) {
      s.push(paint(T(box(6.4, 3.0, 0.8), -0.4, 1.5, z), stone, 0.12, 50 + z));
      s.push(...merlonRowX(z + (z > 0 ? 0.25 : -0.25), 3.0, -3.4, 2.4).map((g) => paint(g, stone, 0.1, 52)));
    }
    s.push(paint(T(box(0.8, 3.0, HALF_W * 2), -3.6, 1.5, 0), stone, 0.12, 54));
    for (const z of [-HALF_W, HALF_W]) {
      s.push(paint(T(cyl(0.75, 0.82, 4.0, 10), -3.6, 2.0, z), stone, 0.12, 55));
      s.push(...merlonRing(0.8, 4.0, 8, 0.26, 0.34, 0.22).map((g) => paint(T(g, -3.6, 0, z), stone, 0.1, 56)));
    }
    sides.add(mesh(merge(s, 0.85), SM));
  }

  /* ---------------------------------------------------------- keep */
  const keep = mk("keep");
  const glow = [];
  {
    const s = [];
    const t = [];
    if (!enemy) {
      s.push(paint(T(box(3.2, 6.0, 4.0), -1.0, 3.0, 0), stone, 0.12, 70));
      s.push(paint(T(box(3.5, 0.3, 4.3), -1.0, 6.0, 0), stoneD, 0.08, 71));
      s.push(...merlonRow(0.62, 6.15, -1.9, 1.9, 0.5, 0.3, 0.4, 0.26).map((g) => paint(g, stone, 0.1, 72)));
      // gabled roof (prism) in the kingdom style
      if (style === "desert") t.push(paint(T(dome(1.5, 14, 6), -1.0, 6.15, 0, 0, 0, 0, 1, 0.9, 1.2), roof, 0.06, 73));
      else {
        const pr = new THREE.CylinderGeometry(0.01, 2.0, 2.4, 4, 1);
        t.push(paint(T(pr, -1.0, 6.15 + 1.2, 0, 0, Math.PI / 4, 0, 0.95, 1, 1.35), roof, 0.08, 73));
        if (style === "frozen") t.push(paint(T(new THREE.CylinderGeometry(0.01, 1.0, 1.2, 4, 1), -1.0, 6.15 + 1.8, 0, 0, Math.PI / 4, 0, 0.95, 1, 1.35), "#f4f8fb", 0.04, 74));
      }
      // turret
      s.push(paint(T(cyl(0.55, 0.6, 2.4, 10), -1.9, 7.0, 1.6), stone, 0.12, 75));
      t.push(paint(T(cone(0.75, 1.5, 10), -1.9, 8.95, 1.6), style === "royal" ? gold : roof, 0.08, 76));
      for (const z of [-1.0, 0, 1.0]) t.push(paint(T(box(0.06, 0.7, 0.32), 0.61, 4.2, z), "#2a2a3a"));
      for (const z of [-1.0, 1.0]) glow.push(T(box(0.04, 0.5, 0.22), 0.62, 4.15, z));
    } else {
      s.push(paint(T(box(3.0, 5.0, 3.6), -1.2, 2.5, 0), stone, 0.12, 70));
      s.push(paint(T(box(2.2, 9.2, 2.2), -1.4, 4.6, 0), stone, 0.12, 71));
      s.push(paint(T(box(2.6, 0.4, 2.6), -1.4, 9.2, 0), stoneD, 0.08, 72));
      s.push(...merlonRowX(-1.3, 9.4, -2.6, -0.2, 0.46, 0.3, 0.44, 0.26).map((g) => paint(g, stone, 0.1, 73)));
      s.push(...merlonRowX(1.3, 9.4, -2.6, -0.2, 0.46, 0.3, 0.44, 0.26).map((g) => paint(g, stone, 0.1, 74)));
      s.push(...merlonRow(-0.1, 9.4, -1.2, 1.2, 0.46, 0.3, 0.44, 0.26).map((g) => paint(g, stone, 0.1, 75)));
      if (style === "desert") t.push(paint(T(dome(1.15, 14, 7), -1.4, 9.4, 0, 0, 0, 0, 1, 1.6, 1), roof, 0.06, 76), paint(T(cone(0.12, 0.8, 6), -1.4, 11.5, 0), gold));
      else if (style === "frozen") t.push(paint(T(cone(0.9, 3.6, 6), -1.4, 11.2, 0), "#bfe6ff", 0.06, 76));
      else if (style === "shadow") t.push(paint(T(cone(1.0, 3.8, 4), -1.4, 11.3, 0, 0, Math.PI / 4, 0), "#2a2236", 0.06, 76));
      else if (style === "royal") t.push(paint(T(cone(1.25, 3.2, 8), -1.4, 11.0, 0), roof, 0.06, 76), paint(T(sph(0.22, 8, 6), -1.4, 12.75, 0), gold));
      else t.push(paint(T(cone(1.2, 3.4, 4), -1.4, 11.1, 0, 0, Math.PI / 4, 0), roof, 0.06, 76));
      // glowing windows
      for (const y of [5.4, 7.2]) glow.push(T(box(0.05, 0.6, 0.26), -0.28, y, 0));
      glow.push(T(box(0.05, 0.45, 0.22), 0.32, 3.4, -0.9), T(box(0.05, 0.45, 0.22), 0.32, 3.4, 0.9));
    }
    keep.add(mesh(merge(s, 0.85), SM), mesh(merge(t), TM));
    if (glow.length) {
      const gm = new THREE.Mesh(merge(glow.map((g) => paint(g, "#ffffff"))), glowMat(enemy ? (style === "shadow" ? "#c46cff" : style === "frozen" ? "#7fe0ff" : "#ffb347") : "#ffd27a"));
      keep.add(gm);
    }
  }

  /* ---------------------------------------------------------- flags + torches */
  const flags = [];
  const flagCol = enemy ? "#d23a2c" : "#2f78e0";
  const flagSpots = enemy
    ? [
        [FRONT - 0.7, 6.9, -HALF_W - 0.25],
        [FRONT - 0.7, 6.9, HALF_W + 0.25],
        [-1.4, enemyTop(style), 0],
      ]
    : [
        [FRONT - 0.7, style === "desert" ? 7.35 : 8.4, -HALF_W - 0.25],
        [FRONT - 0.7, style === "desert" ? 7.35 : 8.4, HALF_W + 0.25],
        [-1.9, 10.35, 1.6],
      ];
  const flagParents = [parts.towerL, parts.towerR, parts.keep];
  flagSpots.forEach(([x, y, z], i) => {
    const f = flag(flagCol, 1.25);
    f.position.set(x, y - 0.1, z);
    flagParents[i].add(f);
    flags.push(f.userData.cloth);
  });

  const torches = [];
  for (const z of [-GATE_W / 2 - 0.45, GATE_W / 2 + 0.45]) {
    const tg = new THREE.Group();
    const hold = mesh(merge([paint(T(box(0.1, 0.1, 0.1), 0, 0, 0), iron), paint(T(cyl(0.05, 0.03, 0.4, 6), 0.12, 0.15, 0, 0, 0, -0.5), wood)]), TM, false);
    const flame = new THREE.Mesh(cone(0.09, 0.26, 6), glowMat(style === "shadow" ? "#b86cff" : "#ffae3a"));
    flame.position.set(0.22, 0.42, 0);
    tg.add(hold, flame);
    tg.position.set(FRONT + 0.1, 2.2, z);
    front.add(tg);
    torches.push(flame);
  }

  // rubble & cracks revealed as the castle takes damage
  const dmg1 = new THREE.Group();
  const dmg2 = new THREE.Group();
  {
    const cracks = [];
    const rr = rng(enemy ? 9 : 3);
    for (let i = 0; i < 4; i++) {
      const z = (rr() - 0.5) * 6.5;
      if (Math.abs(z) < 1.4) continue;
      let y = 1.0 + rr() * 1.8;
      let zz = z;
      for (let j = 0; j < 4; j++) {
        const ny = y + 0.22 + rr() * 0.2;
        const nz = zz + (rr() - 0.5) * 0.35;
        const len = Math.hypot(ny - y, nz - zz);
        cracks.push(paint(T(box(0.03, len, 0.06), FRONT + 0.012, (y + ny) / 2, (zz + nz) / 2, Math.atan2(nz - zz, ny - y), 0, 0), "#2b2622"));
        y = ny;
        zz = nz;
      }
    }
    if (cracks.length) dmg1.add(new THREE.Mesh(merge(cracks), TM));
    const rub = [];
    for (let i = 0; i < 14; i++) {
      const z = (rr() - 0.5) * 8;
      if (Math.abs(z) < 1.3) continue;
      rub.push(paint(T(new THREE.DodecahedronGeometry(0.15 + rr() * 0.22, 0), FRONT + 0.3 + rr() * 0.6, 0.1, z, rr() * 3, rr() * 3, 0), rr() > 0.5 ? stone : stoneD, 0.15, i));
    }
    dmg2.add(new THREE.Mesh(merge(rub), TM));
    // a broken merlon gap: a dark notch on the wall top
    dmg2.add(new THREE.Mesh(merge([paint(T(box(0.4, 0.45, 1.3), FRONT - 0.12, WALL_H + 0.2, -2.6), "#3a332c"), paint(T(box(0.4, 0.45, 1.0), FRONT - 0.12, WALL_H + 0.2, 3.3), "#3a332c")]), TM));
  }
  dmg1.visible = false;
  dmg2.visible = false;
  front.add(dmg1, dmg2);

  // place in the world
  if (enemy) {
    group.rotation.y = Math.PI;
    group.position.x = FIELD.castleX;
  } else group.position.x = -FIELD.castleX;
  group.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true;
  });
  return { group, parts, banners: parts.banners || [], flags, torches, dmg1, dmg2, towers };
}

function enemyTop(style) {
  if (style === "desert") return 12.2;
  if (style === "frozen") return 13.1;
  if (style === "shadow") return 13.3;
  if (style === "royal") return 13.1;
  return 12.9;
}

/** wave the castle cloth (banners hang, flags fly) */
export function waveCloth(list, t, strength = 1) {
  for (const m of list) {
    const base = m.userData.base;
    const p = m.geometry.attributes.position;
    const flagMode = !!m.userData.flag;
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3];
      const y = base[i * 3 + 1];
      if (flagMode) {
        const k = x / 0.9;
        p.setZ(i, Math.sin(t * 5 + x * 5) * 0.12 * k * strength);
        p.setY(i, y + Math.sin(t * 4 + x * 4) * 0.03 * k * strength);
      } else {
        const k = -y / m.userData.h;
        p.setZ(i, Math.sin(t * 1.8 + y * 2.4 + x) * 0.05 * k * strength);
      }
    }
    p.needsUpdate = true;
  }
}
