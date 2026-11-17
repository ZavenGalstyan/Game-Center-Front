/**
 * The saloon interiors (and the street outside), built per stage from
 * stage.env: size, sky (day / sunset / night), wall + floor texture sets,
 * felt colour and decor tags.
 *
 * Layout (metres, table at the origin, the player sits at +Z facing -Z):
 *   back wall (-Z)  : the bar — counter, brass foot rail, back bar cabinets,
 *                     shelves of bottles, mirror, cash register, stools
 *   left wall (-X)  : tall windows onto the street: sunlight shafts, the
 *                     boardwalk, false-front buildings and the sky panorama
 *   right wall (+X) : swinging batwing doors, the piano, a grandfather clock
 *   front wall (+Z) : behind the player — seen in the intro sweep
 * Background tables with chairs fill the room; patrons and a bartender are
 * added by world.js. Every prop is CC0 (Poly Haven); walls, bar, windows,
 * doors, piano, beams and street are built here with Poly Haven PBR sets.
 */
import * as THREE from "three";
import { loadProp, fitProp, tintProp, pbr, track, preloadSets } from "./assets.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (seed) => {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};

export const SIZES = {
  small: { w: 11, d: 10, h: 3.7, back: -5.6, front: 4.4 },
  medium: { w: 12.5, d: 11.5, h: 3.9, back: -6.4, front: 5.1 },
  large: { w: 14, d: 13, h: 4.4, back: -7.2, front: 5.8 },
};

/** Texture sets a stage needs (preloaded so the loading bar is honest). */
export function texSetsFor(env) {
  const s = new Set([env.walls, env.floor, "velour_velvet", "brown_leather", "wood_cabinet_worn_long", "wood_plank_wall", "weathered_plank_siding", "dry_ground_01", env.fancy ? "lacquered_cherry_wood" : "wood_table_worn"]);
  if (env.fancy) s.add("wooden_panels").add("decrepit_wallpaper");
  return [...s];
}

/** Props a stage needs. */
export function propsFor(env) {
  const p = new Set(["painted_wooden_chair_02", "wooden_stool_01", "Lantern_01", "lantern_chandelier_01", "wine_bottles_01", "brass_goblets", "CashRegister_01", "vintage_cabinet_01", "ornate_mirror_01", "round_wooden_table_01", "wine_barrel_01", "vintage_pocket_watch"]);
  const d = new Set(env.decor || []);
  if (d.has("crates") || d.has("mining") || d.has("railroad")) p.add("wooden_crate_02");
  if (d.has("clock")) p.add("vintage_grandfather_clock_01").add("mantel_clock_01");
  if (d.has("paintings")) p.add("fancy_picture_frame_01");
  if (d.has("mining")) p.add("wooden_bucket_01");
  if (d.has("desert") || env.adobe) p.add("quiver_tree_01").add("namaqualand_boulder_02");
  if (d.has("candles") || env.fancy) p.add("brass_candleholders");
  if (env.chandelier) p.add("Chandelier_01");
  if (env.fancy || d.has("wanted")) p.add("bull_head");
  p.add("Rockingchair_01");
  return [...p];
}

/* ------------------------------------------------------------ helpers */
function quad(w, h, mat, tile = 1.2) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * h) / tile);
  g.setAttribute("uv2", uv.clone());
  const m = new THREE.Mesh(track(g), mat);
  m.receiveShadow = true;
  return m;
}
function box(w, h, d, mat, { tile = 1, cast = true } = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (tile !== 1) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (Math.max(w, d) / tile), uv.getY(i) * (h / tile));
  }
  const m = new THREE.Mesh(track(g), mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

/**
 * A wall band (x along the wall, y up) from rectangles around openings.
 * openings: [{x0, x1, y0, y1}] in wall coordinates. Faces +Z of the group.
 */
function wallBand(len, y0, y1, openings, mat, tile) {
  const g = new THREE.Group();
  const xs = new Set([-len / 2, len / 2]);
  for (const o of openings) {
    xs.add(Math.max(-len / 2, o.x0));
    xs.add(Math.min(len / 2, o.x1));
  }
  const cuts = [...xs].sort((a, b) => a - b);
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i], b = cuts[i + 1];
    if (b - a < 1e-4) continue;
    const mid = (a + b) / 2;
    const hits = openings.filter((o) => mid > o.x0 && mid < o.x1 && o.y1 > y0 && o.y0 < y1);
    const spans = [];
    let y = y0;
    for (const o of hits.sort((p, q) => p.y0 - q.y0)) {
      if (o.y0 > y) spans.push([y, Math.min(o.y0, y1)]);
      y = Math.max(y, o.y1);
    }
    if (y < y1) spans.push([y, y1]);
    for (const [s0, s1] of spans) {
      if (s1 - s0 < 1e-4) continue;
      const q = new THREE.PlaneGeometry(b - a, s1 - s0);
      const uv = q.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, (a + uv.getX(k) * (b - a)) / tile, (s0 + uv.getY(k) * (s1 - s0)) / tile);
      const m = new THREE.Mesh(track(q), mat);
      m.position.set(mid, (s0 + s1) / 2, 0);
      m.receiveShadow = true;
      g.add(m);
    }
  }
  return g;
}

/* ------------------------------------------------------------ canvas signs / posters */
function signTexture(text, { w = 1024, h = 256, bg = "#2a1d14", ink = "#e9d9b0", font = "Georgia, serif", weathered = true } = {}) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  // planks
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.lineWidth = 3;
  for (let i = 1; i < 3; i++) {
    g.beginPath();
    g.moveTo(0, (h * i) / 3);
    g.lineTo(w, (h * i) / 3);
    g.stroke();
  }
  g.fillStyle = ink;
  g.font = `700 ${Math.round(h * 0.52)}px ${font}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, w / 2, h * 0.54, w * 0.92);
  if (weathered) {
    const r = rnd(text.length * 31);
    g.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 260; i++) {
      g.globalAlpha = r() * 0.5;
      g.fillRect(r() * w, r() * h, 2 + r() * 10, 1 + r() * 3);
    }
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
  }
  const t = track(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function posterTexture(seed, reward) {
  const c = document.createElement("canvas");
  c.width = 384;
  c.height = 512;
  const g = c.getContext("2d");
  const r = rnd(seed);
  g.fillStyle = "#d9c7a0";
  g.fillRect(0, 0, 384, 512);
  // stains
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `rgba(110,80,40,${r() * 0.12})`;
    g.beginPath();
    g.arc(r() * 384, r() * 512, 20 + r() * 60, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = "#2a1c10";
  g.textAlign = "center";
  g.font = "700 78px Georgia, serif";
  g.fillText("WANTED", 192, 88);
  g.font = "600 30px Georgia, serif";
  g.fillText("DEAD OR ALIVE", 192, 132);
  // portrait silhouette: hat + shoulders
  g.fillStyle = "#3a2a1a";
  g.beginPath();
  g.ellipse(192, 250, 48, 58, 0, 0, Math.PI * 2);
  g.fill();
  g.fillRect(110, 196, 164, 14);
  g.beginPath();
  g.ellipse(192, 192, 56, 30, 0, Math.PI, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(96, 380);
  g.quadraticCurveTo(192, 270, 288, 380);
  g.fill();
  g.font = "700 46px Georgia, serif";
  g.fillStyle = "#2a1c10";
  g.fillText(`$${reward}`, 192, 440);
  g.font = "600 26px Georgia, serif";
  g.fillText("REWARD", 192, 478);
  const t = track(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------ procedural props */
function windowFrame(w, h, wood, glassMat) {
  const g = new THREE.Group();
  const t = 0.07, d = 0.16;
  const add = (m, x, y, z = 0) => {
    m.position.set(x, y, z);
    g.add(m);
  };
  add(box(w + t * 2, t, d, wood), 0, h / 2 + t / 2);
  add(box(w + t * 2.4, t * 1.2, d * 1.6, wood), 0, -h / 2 - t * 0.6, 0.04); // sill
  add(box(t, h, d, wood), -w / 2 - t / 2, 0);
  add(box(t, h, d, wood), w / 2 + t / 2, 0);
  // muntins: 2 × 3 panes
  add(box(w, 0.035, 0.05, wood), 0, h * 0.0);
  add(box(w, 0.035, 0.05, wood), 0, h * 0.33);
  add(box(w, 0.035, 0.05, wood), 0, -h * 0.33);
  add(box(0.035, h, 0.05, wood), 0, 0);
  const glass = new THREE.Mesh(track(new THREE.PlaneGeometry(w, h)), glassMat);
  glass.renderOrder = 3;
  add(glass, 0, 0, 0.0);
  return g;
}

function batwingDoors(wood) {
  const g = new THREE.Group();
  const leaves = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.62, 1.0, 0);
    const leaf = new THREE.Group();
    const w = 0.6, h = 1.05;
    const frame = [box(w, 0.07, 0.04, wood), box(w, 0.07, 0.04, wood), box(0.07, h, 0.04, wood), box(0.07, h, 0.04, wood)];
    frame[0].position.set(-s * w / 2, h / 2, 0);
    frame[1].position.set(-s * w / 2, -h / 2, 0);
    frame[2].position.set(-s * 0.035, 0, 0);
    frame[3].position.set(-s * (w - 0.035), 0, 0);
    for (const f of frame) leaf.add(f);
    for (let i = 0; i < 11; i++) {
      const sl = box(w - 0.12, 0.06, 0.012, wood);
      sl.position.set(-s * w / 2, -h / 2 + 0.12 + i * 0.075, 0);
      sl.rotation.x = 0.5;
      leaf.add(sl);
    }
    // scalloped top
    const top = box(w - 0.1, 0.12, 0.03, wood);
    top.position.set(-s * w / 2, h / 2 + 0.07, 0);
    leaf.add(top);
    pivot.add(leaf);
    g.add(pivot);
    leaves.push({ pivot, s, a: 0, v: 0 });
  }
  return { group: g, leaves };
}

function piano(wood, ivory, black) {
  const g = new THREE.Group();
  const body = box(1.52, 1.3, 0.62, wood);
  body.position.set(0, 0.65 + 0.05, 0);
  g.add(body);
  const top = box(1.6, 0.05, 0.68, wood);
  top.position.set(0, 1.37, 0);
  g.add(top);
  const shelf = box(1.4, 0.26, 0.32, wood);
  shelf.position.set(0, 0.86, 0.43);
  g.add(shelf);
  const keys = box(1.3, 0.025, 0.16, ivory);
  keys.position.set(0, 0.74, 0.5);
  g.add(keys);
  for (let i = 0; i < 36; i++) {
    if ([2, 6, 9, 13, 16, 20, 23, 27, 30, 34].includes(i % 36) || i % 7 === 2 || i % 7 === 5) continue;
    const k = box(0.018, 0.02, 0.09, black, { cast: false });
    k.position.set(-0.63 + i * 0.036, 0.757, 0.47);
    g.add(k);
  }
  for (const x of [-0.66, 0.66]) {
    const leg = box(0.07, 0.62, 0.07, wood);
    leg.position.set(x, 0.31, 0.5);
    g.add(leg);
  }
  const music = box(0.5, 0.32, 0.02, ivory);
  music.position.set(0, 1.08, 0.33);
  music.rotation.x = -0.25;
  g.add(music);
  return g;
}

function falseFront(w, h, siding, trim, sign, rng) {
  const g = new THREE.Group();
  const front = box(w, h, 0.25, siding, { tile: 1.6 });
  front.position.set(0, h / 2, 0);
  g.add(front);
  const roof = box(w + 0.3, 0.12, 0.4, trim);
  roof.position.set(0, h + 0.06, 0.05);
  g.add(roof);
  // porch roof + posts
  const pr = box(w, 0.08, 1.6, trim);
  pr.position.set(0, 2.7, 0.9);
  g.add(pr);
  for (let i = 0; i <= Math.floor(w / 2.4); i++) {
    const post = box(0.12, 2.7, 0.12, trim);
    post.position.set(-w / 2 + 0.2 + i * ((w - 0.4) / Math.floor(w / 2.4)), 1.35, 1.6);
    g.add(post);
  }
  // windows (dark glass) + door
  const dark = track(new THREE.MeshStandardMaterial({ color: 0x0d0c0b, roughness: 0.15, metalness: 0.2, envMapIntensity: 1.2 }));
  const n = Math.max(1, Math.floor(w / 2.6));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w / n) * (i + 0.5);
    if (i === Math.floor(n / 2)) {
      const door = box(1.0, 2.1, 0.05, dark);
      door.position.set(x, 1.05, 0.14);
      g.add(door);
    } else {
      const win = box(1.0, 1.3, 0.05, dark);
      win.position.set(x, 1.5, 0.14);
      g.add(win);
    }
    if (h > 5) {
      const up = box(0.8, 1.0, 0.05, dark);
      up.position.set(x, h - 1.6, 0.14);
      g.add(up);
    }
  }
  if (sign) {
    const sm = new THREE.Mesh(track(new THREE.PlaneGeometry(Math.min(w - 0.6, 4.2), 0.9)), track(new THREE.MeshStandardMaterial({ map: signTexture(sign, { bg: rng() > 0.5 ? "#3a2618" : "#2b2f2a" }), roughness: 0.9 })));
    sm.position.set(0, h - 0.6, 0.14);
    g.add(sm);
  }
  return g;
}

/* ------------------------------------------------------------ build */
/**
 * @returns {{ root, anchors, lights, beams, doors, update(dt), dispose() }}
 */
export async function buildSaloon(stage, { quality = "high", onProgress } = {}) {
  const env = stage.env;
  const S = SIZES[env.size] || SIZES.small;
  const root = new THREE.Group();
  root.name = "saloon";
  const rng = rnd(stage.id * 977);
  const decor = new Set(env.decor || []);
  await preloadSets(texSetsFor(env));
  onProgress?.(0.45);

  const xL = -S.w / 2, xR = S.w / 2, zB = S.back, zF = S.front, H = S.h;
  // materials
  const floorMat = pbr(env.floor, { repeat: [1, 1], roughness: 1, envMapIntensity: 0.5 });
  const wallSet = env.fancy ? "decrepit_wallpaper" : env.walls;
  const wallMat = pbr(wallSet, { roughness: 1, envMapIntensity: 0.35, color: env.adobe ? 0xe8d2b6 : env.dark ? 0x9a8a7a : 0xffffff });
  const lowerMat = env.fancy ? pbr("wooden_panels", { roughness: 0.9, envMapIntensity: 0.5 }) : env.adobe ? wallMat : pbr("wood_plank_wall", { roughness: 1, envMapIntensity: 0.4, color: 0xd8c8b4 });
  const wood = pbr("wood_cabinet_worn_long", { roughness: 0.85, envMapIntensity: 0.6 });
  const woodDark = pbr("wood_cabinet_worn_long", { roughness: 0.7, envMapIntensity: 0.7, color: 0x8a6a52 });
  const ceilMat = pbr("wood_plank_wall", { roughness: 1, envMapIntensity: 0.3, color: 0x8a7a6a });
  const brass = track(new THREE.MeshStandardMaterial({ color: 0xc89a4a, roughness: 0.28, metalness: 1, envMapIntensity: 1.2 }));
  const ivory = track(new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.35 }));
  const blackMat = track(new THREE.MeshStandardMaterial({ color: 0x111010, roughness: 0.3 }));
  const glassMat = track(new THREE.MeshPhysicalMaterial({ color: 0xdfe6e8, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.1, envMapIntensity: 1.4, depthWrite: false, side: THREE.DoubleSide }));

  // floor (inside) + ceiling
  const floor = quad(S.w, zF - zB, floorMat, 2.2);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, (zF + zB) / 2);
  root.add(floor);
  const ceil = quad(S.w, zF - zB, ceilMat, 2.0);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, H, (zF + zB) / 2);
  root.add(ceil);
  for (let z = zB + 1.2; z < zF; z += 2.0) {
    const beam = box(S.w, 0.22, 0.18, woodDark, { tile: 2 });
    beam.position.set(0, H - 0.11, z);
    root.add(beam);
  }

  // walls with openings
  const windows = [];
  const winW = 1.5, winH = 1.9, winY = 0.95;
  const winZs = env.size === "small" ? [-2.6, 0.6] : [-3.2, -0.2, 2.6];
  const doorZ = env.size === "small" ? -1.6 : -2.0;
  const addWall = (len, openings, pos, rotY) => {
    const g = new THREE.Group();
    const wain = 1.1;
    g.add(wallBand(len, 0, wain, openings, lowerMat, 1.6));
    g.add(wallBand(len, wain, H, openings, wallMat, env.fancy ? 1.4 : 1.8));
    // chair rail + baseboard
    const rail = box(len, 0.06, 0.04, woodDark, { tile: 2 });
    rail.position.set(0, wain, 0.02);
    const base = box(len, 0.16, 0.03, woodDark, { tile: 2 });
    base.position.set(0, 0.08, 0.015);
    g.add(rail, base);
    g.position.copy(pos);
    g.rotation.y = rotY;
    root.add(g);
    return g;
  };
  // left wall: windows (wall coordinate x runs along -Z → +Z when rotated +90°)
  const leftOpen = winZs.map((z) => ({ x0: z - winW / 2, x1: z + winW / 2, y0: winY, y1: winY + winH }));
  // rotated +90°: wall-local x runs along world -Z
  addWall(zF - zB, leftOpen.map((o) => ({ ...o, x0: -(o.x1 - (zF + zB) / 2), x1: -(o.x0 - (zF + zB) / 2) })), V(xL, 0, (zF + zB) / 2), Math.PI / 2);
  for (const z of winZs) {
    const wf = windowFrame(winW, winH, woodDark, glassMat);
    wf.position.set(xL, winY + winH / 2, z);
    wf.rotation.y = Math.PI / 2;
    root.add(wf);
    windows.push({ z, y0: winY, y1: winY + winH, w: winW });
  }
  // right wall: batwing door opening
  const doorW = 1.5, doorH = 2.5;
  // rotated -90°: wall-local x runs along world +Z
  addWall(zF - zB, [{ x0: doorZ - (zF + zB) / 2 - doorW / 2, x1: doorZ - (zF + zB) / 2 + doorW / 2, y0: 0, y1: doorH }], V(xR, 0, (zF + zB) / 2), -Math.PI / 2);
  const doors = batwingDoors(woodDark);
  doors.group.position.set(xR - 0.05, 0, doorZ);
  doors.group.rotation.y = -Math.PI / 2;
  root.add(doors.group);
  // door frame
  for (const dz of [-doorW / 2 - 0.05, doorW / 2 + 0.05]) {
    const p = box(0.12, doorH, 0.22, woodDark);
    p.position.set(xR - 0.06, doorH / 2, doorZ + dz);
    root.add(p);
  }
  const lintel = box(0.22, 0.14, doorW + 0.3, woodDark);
  lintel.position.set(xR - 0.06, doorH + 0.07, doorZ);
  root.add(lintel);
  // back + front walls
  addWall(S.w, [], V(0, 0, zB), 0);
  addWall(S.w, [], V(0, 0, zF), Math.PI);

  /* ---------------- outside: boardwalk, street, false fronts, sky */
  const out = new THREE.Group();
  root.add(out);
  const ground = quad(80, 80, pbr("dry_ground_01", { roughness: 1, envMapIntensity: 0.6, color: env.adobe ? 0xe8c8a0 : 0xffffff }), 3);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.02, 0);
  // the ground only shows outside; the floor covers it inside
  out.add(ground);
  const walk = quad(2.6, zF - zB + 8, pbr("weathered_plank_siding", { roughness: 1, color: 0xc0a888 }), 1.4);
  walk.rotation.x = -Math.PI / 2;
  walk.rotation.z = Math.PI / 2;
  walk.position.set(xL - 1.3, 0.12, (zF + zB) / 2);
  out.add(walk);
  const walkR = walk.clone();
  walkR.position.set(xR + 1.3, 0.12, (zF + zB) / 2);
  out.add(walkR);
  // the saloon's own outer walls (seen through the door/window edges)
  const siding = pbr("weathered_plank_siding", { roughness: 1, envMapIntensity: 0.5 });
  const trim = pbr("wood_cabinet_worn_long", { roughness: 0.9, color: 0x9a8a78 });
  // buildings across the street (left) and beyond the door (right)
  const signs = ["GENERAL STORE", "HOTEL", "BANK", "BARBER", "LIVERY STABLE", "ASSAY OFFICE", "SHERIFF", "DRY GOODS", "TELEGRAPH"];
  const r2 = rnd(stage.id * 13);
  let z = zB - 6;
  while (z < zF + 6) {
    const w = 5 + r2() * 3.5, h = 4.4 + r2() * 2.6;
    const b = falseFront(w, h, siding, trim, signs[Math.floor(r2() * signs.length)], r2);
    b.position.set(xL - 13.5, 0, z + w / 2);
    b.rotation.y = Math.PI / 2;
    out.add(b);
    z += w + 0.4 + r2() * 1.5;
  }
  z = zB - 6;
  while (z < zF + 6) {
    const w = 5 + r2() * 3, h = 4.2 + r2() * 2.4;
    const b = falseFront(w, h, siding, trim, signs[Math.floor(r2() * signs.length)], r2);
    b.position.set(xR + 12, 0, z + w / 2);
    b.rotation.y = -Math.PI / 2;
    out.add(b);
    z += w + 0.4 + r2() * 1.5;
  }
  // hitching rail
  for (const [x, rz] of [[xL - 2.9, 0], [xR + 2.9, 0]]) {
    const bar = box(0.08, 0.08, 3.4, trim);
    bar.position.set(x, 1.0, doorZ + rz);
    out.add(bar);
    for (const dz of [-1.6, 1.6]) {
      const post = box(0.12, 1.05, 0.12, trim);
      post.position.set(x, 0.52, doorZ + rz + dz);
      out.add(post);
    }
  }

  /* ---------------- the bar */
  const barZ = zB + 1.55;
  const barLen = Math.min(S.w - 3.6, 7.5);
  const barX = 0.6;
  const barFront = box(barLen, 1.05, 0.62, wood, { tile: 1.4 });
  barFront.position.set(barX, 0.525, barZ);
  root.add(barFront);
  for (let i = 0; i < Math.floor(barLen / 0.9); i++) {
    const panel = box(0.7, 0.62, 0.02, woodDark);
    panel.position.set(barX - barLen / 2 + 0.45 + i * 0.9, 0.55, barZ + 0.32);
    root.add(panel);
  }
  const barTop = box(barLen + 0.2, 0.06, 0.78, pbr(env.fancy ? "lacquered_cherry_wood" : "wood_table_worn", { repeat: [4, 1], roughness: 0.55, envMapIntensity: 0.9 }));
  barTop.position.set(barX, 1.08, barZ + 0.04);
  root.add(barTop);
  const footRail = new THREE.Mesh(track(new THREE.CylinderGeometry(0.025, 0.025, barLen, 16)), brass);
  footRail.rotation.z = Math.PI / 2;
  footRail.position.set(barX, 0.2, barZ + 0.48);
  root.add(footRail);
  // back bar: shelves + cabinets + mirror
  const shelfMat = woodDark;
  for (const y of [1.45, 1.85, 2.25]) {
    const sh = box(barLen - 1.2, 0.04, 0.3, shelfMat);
    sh.position.set(barX, y, zB + 0.17);
    root.add(sh);
  }
  const backPanel = box(barLen + 0.4, 2.2, 0.06, wood, { tile: 1.2 });
  backPanel.position.set(barX, 1.4, zB + 0.03);
  root.add(backPanel);

  /* ---------------- lights */
  const lights = { lamps: [], key: null, sun: null, bar: null, fill: null };
  const lampColor = 0xffa45a;
  lights.fill = new THREE.HemisphereLight(0x8a94a8, 0x3a2818, env.sky === "night" ? 0.22 : 0.42);
  root.add(lights.fill);
  // key: the lamp over the table
  lights.key = new THREE.SpotLight(0xffb873, env.sky === "night" ? 10 : 8, 7, 1.0, 0.9, 1.6);
  lights.key.position.set(0, 2.45, 0);
  lights.key.target.position.set(0, 0.7, 0);
  root.add(lights.key, lights.key.target);
  // a warm bounce from the felt/table up onto the faces
  lights.bounce = new THREE.PointLight(0xffb070, 0.9, 3.2, 2);
  lights.bounce.position.set(0, 1.0, 0);
  root.add(lights.bounce);
  // wall lamps
  const lampSpots = [
    V(xL + 0.25, 2.25, (winZs[0] + winZs[1]) / 2),
    V(xR - 0.25, 2.25, doorZ + 2.4),
    V(barX - barLen / 2 + 0.6, 2.4, zB + 0.35),
    V(barX + barLen / 2 - 0.6, 2.4, zB + 0.35),
    V(-1.8, 2.3, zF - 0.25),
  ];
  for (const p of lampSpots) {
    const l = new THREE.PointLight(lampColor, env.sky === "night" ? 5.5 : 3.2, 6.5, 1.6);
    l.position.copy(p).add(V(p.x < xL + 1 ? 0.25 : p.x > xR - 1 ? -0.25 : 0, -0.15, p.z < zB + 1 ? 0.25 : p.z > zF - 1 ? -0.25 : 0));
    root.add(l);
    lights.lamps.push({ light: l, base: l.intensity, ph: rng() * 10, pos: p });
  }
  // sun through the windows (day/sunset), moonlight at night
  const sunDir = env.sky === "sunset" ? V(0.9, -0.28, -0.32) : env.sky === "night" ? V(0.5, -0.7, -0.4) : V(0.62, -0.62, -0.45);
  sunDir.normalize();
  lights.sun = new THREE.DirectionalLight(env.sky === "sunset" ? 0xffb066 : env.sky === "night" ? 0x8ea8e0 : 0xfff0d6, env.sky === "night" ? 0.35 : env.sky === "sunset" ? 4.2 : 4.8);
  lights.sun.position.copy(sunDir.clone().multiplyScalar(-14));
  lights.sun.target.position.set(0, 0, 0);
  const sc = lights.sun.shadow.camera;
  sc.left = -9;
  sc.right = 9;
  sc.top = 9;
  sc.bottom = -9;
  sc.near = 1;
  sc.far = 40;
  lights.sun.shadow.bias = -0.0005;
  lights.sun.shadow.normalBias = 0.03;
  root.add(lights.sun, lights.sun.target);
  lights.sunDir = sunDir;

  /* ---------------- light shafts through the windows */
  const beams = [];
  if (env.sky !== "night" && quality !== "low") {
    for (const w of windows) {
      const corners = [V(xL, w.y0, w.z - w.w / 2), V(xL, w.y0, w.z + w.w / 2), V(xL, w.y1, w.z + w.w / 2), V(xL, w.y1, w.z - w.w / 2)];
      const t = (p) => Math.min(9, p.y / -sunDir.y);
      const far = corners.map((p) => p.clone().add(sunDir.clone().multiplyScalar(t(p))));
      const pos = [];
      const fade = [];
      const quadF = (a, b, c, d, fa, fb, fc, fd) => {
        pos.push(...a.toArray(), ...b.toArray(), ...c.toArray(), ...a.toArray(), ...c.toArray(), ...d.toArray());
        fade.push(fa, fb, fc, fa, fc, fd);
      };
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        quadF(corners[i], corners[j], far[j], far[i], 1, 1, 0, 0);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("fade", new THREE.Float32BufferAttribute(fade, 1));
      const m = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color(env.sky === "sunset" ? 0xffa050 : 0xffe2b0) }, uI: { value: env.sky === "sunset" ? 0.07 : 0.055 }, uTime: { value: 0 } },
        vertexShader: `attribute float fade; varying float vF; varying vec3 vW; void main(){ vF = fade; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uI, uTime; varying float vF; varying vec3 vW;
          float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
          void main(){ float d = 0.65 + 0.35 * n(vW.yz * 3.0 + vec2(uTime * 0.05, -uTime * 0.03)); gl_FragColor = vec4(uColor * uI * pow(vF, 1.3) * d, 1.0); }`,
      });
      track(g);
      track(m);
      const mesh = new THREE.Mesh(g, m);
      mesh.renderOrder = 6;
      mesh.frustumCulled = false;
      root.add(mesh);
      beams.push({ mesh, origin: V(xL, (w.y0 + w.y1) / 2, w.z), radius: 0.8 });
    }
  }

  /* ---------------- props */
  const placed = [];
  const put = async (name, size, pos, rotY = 0, { axis = "y", tint = null, parent = root, ground = true } = {}) => {
    try {
      const p = fitProp(await loadProp(name), size, axis, ground);
      if (tint) tintProp(p, tint);
      p.position.copy(pos);
      p.rotation.y = rotY;
      parent.add(p);
      placed.push(p);
      return p;
    } catch (e) {
      if (import.meta.env?.DEV) console.warn("[WildWest] prop failed", name, e);
      return null;
    }
  };
  const jobs = [];
  const J = (p) => jobs.push(p);
  // hanging lamp over the table
  J(put("lantern_chandelier_01", 0.55, V(0, H - 0.75, 0), 0, { ground: false }).then((p) => {
    if (!p) return;
    p.position.y = Math.min(H - 0.45, 2.55);
    p.traverse((o) => {
      if (o.isMesh && /glass|bulb|light/i.test(o.material.name)) {
        o.material = o.material.clone();
        o.material.emissive = new THREE.Color(0xffb060);
        o.material.emissiveIntensity = 2.5;
      }
    });
    const chain = box(0.012, H - 2.55 - 0.25, 0.012, brass, { cast: false });
    chain.position.set(0, (H + 2.55 + 0.25) / 2, 0);
    root.add(chain);
  }));
  if (env.chandelier) J(put("Chandelier_01", 1.0, V(0.6, H - 1.1, zB + 3.4), 0, { ground: false }).then((p) => p && (p.position.y = H - 1.05)));
  // bar dressing
  J(put("CashRegister_01", 0.36, V(barX + barLen / 2 - 0.7, 1.11, barZ + 0.02), -0.15));
  J(put("Lantern_01", 0.3, V(barX - barLen / 2 + 0.5, 1.11, barZ + 0.05), 0.4));
  J(put("brass_goblets", 0.2, V(barX - 0.6, 1.11, barZ + 0.12), 0.3));
  J(put("wine_bottles_01", 0.33, V(barX + 0.6, 1.11, barZ + 0.05), -0.2));
  for (let i = 0; i < 3; i++) for (const y of [1.47, 1.87, 2.27]) J(put("wine_bottles_01", 0.33, V(barX - barLen / 2 + 1.0 + i * ((barLen - 2) / 2) + (rng() - 0.5) * 0.4, y + 0.02, zB + 0.17), rng() * 6));
  J(put("ornate_mirror_01", 1.35, V(barX, 1.55, zB + 0.12), 0, { axis: "x", ground: false }).then((p) => p && (p.position.y = 2.6)));
  J(put("vintage_cabinet_01", 2.0, V(barX - barLen / 2 - 0.55, 0, zB + 0.35), 0, { axis: "y" }));
  for (let i = 0; i < Math.floor(barLen / 1.1); i++) J(put("wooden_stool_01", 0.72, V(barX - barLen / 2 + 0.6 + i * 1.1, 0, barZ + 0.85), rng() * 6));
  if (decor.has("clock")) {
    J(put("mantel_clock_01", 0.34, V(barX + barLen / 2 - 0.4, 2.27, zB + 0.17), 0));
    J(put("vintage_grandfather_clock_01", 2.05, V(xR - 0.4, 0, zB + 2.2), -Math.PI / 2));
  }
  if (env.fancy || decor.has("wanted")) J(put("bull_head", 0.55, V(xL + 0.2, 2.75, zB + 2.4), Math.PI / 2, { ground: false }).then((p) => p && (p.position.y = 2.55)));
  // background tables with chairs (patrons are added by the world)
  const chairTint = env.fancy ? 0x6a4a36 : 0x8a6a50;
  const tableSpots = [V(xL + 2.0, 0, zB + 3.2), V(xR - 2.3, 0, 2.4), V(xL + 1.9, 0, zF - 1.6)];
  if (env.size !== "small") tableSpots.push(V(xR - 2.4, 0, zB + 3.6));
  const bgSeats = [];
  tableSpots.forEach((t, i) => {
    J(put("round_wooden_table_01", 0.78, t, rng() * 6));
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + i;
      const cp = t.clone().add(V(Math.cos(a) * 0.72, 0, Math.sin(a) * 0.72));
      const rot = Math.atan2(t.x - cp.x, t.z - cp.z); // seat facing the table
      J(put("painted_wooden_chair_02", 0.9, cp, rot, { tint: chairTint }));
      bgSeats.push({ pos: cp.clone(), face: Math.atan2(t.x - cp.x, t.z - cp.z), table: t });
    }
    J(put(rng() > 0.5 ? "wine_bottles_01" : "brass_goblets", 0.22, t.clone().add(V(0.05, 0.78, 0.0)), rng() * 6));
    if (env.fancy || decor.has("candles")) J(put("brass_candleholders", 0.32, t.clone().add(V(-0.12, 0.78, 0.1)), 0));
  });
  // barrels, crates and corners
  if (decor.has("barrels")) {
    J(put("wine_barrel_01", 0.95, V(xL + 0.55, 0, zF - 0.6), 0.4));
    J(put("wine_barrel_01", 0.95, V(xL + 1.45, 0, zF - 0.5), 1.2));
    J(put("wine_barrel_01", 0.9, V(xL - 1.8, 0.12, doorZ + 3), 0.3, { parent: out }));
  }
  if (decor.has("crates") || decor.has("mining") || decor.has("railroad")) {
    J(put("wooden_crate_02", 0.62, V(xR - 0.55, 0, zF - 0.7), 0.2));
    J(put("wooden_crate_02", 0.55, V(xR - 0.6, 0.62, zF - 0.72), -0.3));
    J(put("wooden_crate_02", 0.62, V(xR + 1.5, 0.12, doorZ - 2.4), 0.6, { parent: out }));
  }
  if (decor.has("mining")) J(put("wooden_bucket_01", 0.36, V(xR - 1.4, 0, zF - 0.5), 0));
  if (decor.has("paintings")) {
    J(put("fancy_picture_frame_01", 1.2, V(xR - 0.05, 2.2, 1.2), -Math.PI / 2, { axis: "z", ground: false }).then((p) => p && (p.position.y = 2.1)));
    J(put("fancy_picture_frame_01", 1.0, V(-2.6, 2.2, zF - 0.06), Math.PI, { axis: "x", ground: false }).then((p) => p && (p.position.y = 2.1)));
  }
  // porch rocking chair outside the window, desert flora
  J(put("Rockingchair_01", 1.0, V(xL - 1.1, 0.12, winZs[0] + 1.2), Math.PI / 2 + 0.3, { parent: out }));
  if (decor.has("desert") || env.adobe) {
    J(put("quiver_tree_01", 4.2, V(xL - 7, 0, -4.5), 0.5, { parent: out }));
    J(put("quiver_tree_01", 3.4, V(xL - 6.2, 0, 4.8), 2.0, { parent: out }));
    J(put("namaqualand_boulder_02", 1.3, V(xL - 5.2, -0.1, 1.2), 0.3, { parent: out }));
  }
  // the player's side of the table: pocket watch near the rail
  J(put("vintage_pocket_watch", 0.05, V(0.4, 0.795, 0.82), 0.9, { axis: "x" }));

  // piano + wanted posters + mining tools + railroad sign
  if (decor.has("piano")) {
    const pn = piano(woodDark, ivory, blackMat);
    pn.position.set(xR - 0.36, 0, zF - 2.6);
    pn.rotation.y = -Math.PI / 2;
    root.add(pn);
  }
  if (decor.has("wanted")) {
    const spots = [[xR - 0.03, 1.75, doorZ + 1.6, -Math.PI / 2], [xR - 0.03, 1.7, doorZ + 2.25, -Math.PI / 2], [xL + 0.03, 1.75, winZs[0] + 1.3, Math.PI / 2]];
    spots.forEach(([x, y, zz, r], i) => {
      const m = new THREE.Mesh(track(new THREE.PlaneGeometry(0.42, 0.56)), track(new THREE.MeshStandardMaterial({ map: posterTexture(stage.id * 10 + i, [500, 1000, 250][i]), roughness: 0.95 })));
      m.position.set(x, y, zz);
      m.rotation.set(0, r, (rng() - 0.5) * 0.06);
      m.receiveShadow = true;
      root.add(m);
    });
  }
  if (decor.has("mining")) {
    const handle = pbr("wood_table_worn", { roughness: 1 });
    const iron = track(new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.55, metalness: 0.9 }));
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      const h = new THREE.Mesh(track(new THREE.CylinderGeometry(0.018, 0.02, 0.9, 10)), handle);
      const head = new THREE.Mesh(track(new THREE.BoxGeometry(0.5, 0.05, 0.04)), iron);
      head.position.y = 0.43;
      g.add(h, head);
      g.position.set(xR - 0.15, 0.45, zF - 1.4 + i * 0.25);
      g.rotation.set(0.15, 0, -0.18);
      g.traverse((o) => o.isMesh && (o.castShadow = true));
      root.add(g);
    }
  }
  {
    // the saloon's name over the bar
    const name = stage.saloon.toUpperCase();
    const sm = new THREE.Mesh(track(new THREE.PlaneGeometry(3.2, 0.62)), track(new THREE.MeshStandardMaterial({ map: signTexture(name, { bg: "#2a1a10", ink: "#e8c27a", weathered: false }), roughness: 0.6, metalness: 0.1 })));
    sm.position.set(barX, H - 0.55, zB + 0.07);
    root.add(sm);
  }
  if (decor.has("railroad")) {
    const sm = new THREE.Mesh(track(new THREE.PlaneGeometry(2.4, 0.5)), track(new THREE.MeshStandardMaterial({ map: signTexture("RAILROAD DEPOT", { bg: "#1f2a22" }), roughness: 0.8 })));
    sm.position.set(xL - 13.3, 4.5, 6.5);
    sm.rotation.y = Math.PI / 2;
    out.add(sm);
  }
  onProgress?.(0.55);
  let n = 0;
  await Promise.all(jobs.map((j) => j.then(() => onProgress?.(0.55 + (++n / jobs.length) * 0.25))));

  /* ---------------- update */
  let t = 0;
  const update = (dt, flicker = 1) => {
    t += dt;
    for (const L of lights.lamps) {
      const f = 0.92 + 0.05 * Math.sin(t * 7.3 + L.ph) + 0.03 * Math.sin(t * 17.1 + L.ph * 2);
      L.light.intensity = L.base * (1 - flicker + flicker * f);
    }
    for (const b of beams) b.mesh.material.uniforms.uTime.value = t;
    for (const L of doors.leaves) {
      L.v += (-L.a * 30 - L.v * 3.2) * dt;
      L.a += L.v * dt;
      L.pivot.rotation.y = L.a * L.s;
    }
  };
  const swingDoors = (power = 1.4) => {
    for (const L of doors.leaves) L.v += power * (1 + Math.random() * 0.2);
  };

  return {
    root,
    lights,
    beams,
    windows,
    doors,
    swingDoors,
    bgSeats,
    bar: { x: barX, z: barZ, len: barLen, back: zB },
    room: { ...S, xL, xR, zB, zF, H, doorZ },
    update,
    dispose() {
      root.removeFromParent();
    },
  };
}
