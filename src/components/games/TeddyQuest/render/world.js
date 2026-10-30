/**
 * Plain Three.js view of a Game. Static platforms are merged into two
 * vertex-coloured meshes per level (bodies + grassy/sandy/snowy caps), coins
 * are one InstancedMesh, everything else is a small model updated from the
 * simulation each frame. The renderer never changes the game state.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createBear } from "./bear.js";
import { createKit, makePatrol, makeChaser, makeBoss, makeFriend, makeCoinGeometry, makeChest, makeCheckpoint, makePortal, makeSpring, makeHoney, makeHazard, makeDecor } from "./models.js";
import { hazardState } from "../engine/hazards.js";
import { createCamera, updateCamera, snapCamera } from "../engine/camera.js";

export const THEMES = {
  valley: { skyTop: 0x5cb8ff, skyBot: 0xd9f3ff, fog: 0xcdeeff, top: 0x7ccf4f, cap: 0x5fbf3c, side: 0xa8743f, sideDark: 0x5a3a1e, floor: 0x3fa7d6, floorEmissive: 0x000000, hemiSky: 0xffffff, hemiGround: 0x6a8a4a, sun: 0xfff2d8, decor: ["tree", "tree", "flower", "flower", "rock", "mushroom"] },
  desert: { skyTop: 0xffb85c, skyBot: 0xfff0c8, fog: 0xffe6b0, top: 0xf2cf7a, cap: 0xe9bf62, side: 0xd39b52, sideDark: 0x8a5a2a, floor: 0xe8b860, floorEmissive: 0x000000, hemiSky: 0xfff6e0, hemiGround: 0xb08040, sun: 0xffe7b8, decor: ["cactus", "cactus", "rock", "rock"] },
  snow: { skyTop: 0x8fc8ff, skyBot: 0xf0f8ff, fog: 0xe6f2ff, top: 0xf4fbff, cap: 0xe3f1fb, side: 0x7d8ea3, sideDark: 0x3f4a5a, floor: 0xdfeffa, floorEmissive: 0x000000, hemiSky: 0xffffff, hemiGround: 0x8899aa, sun: 0xffffff, decor: ["pine", "pine", "rock"] },
  cave: { skyTop: 0x1d1538, skyBot: 0x3d2c6a, fog: 0x2a2050, top: 0x8a86b0, cap: 0x7a74a6, side: 0x4a4566, sideDark: 0x221e36, floor: 0x150f2a, floorEmissive: 0x0a0618, hemiSky: 0xc0b0ff, hemiGround: 0x302050, sun: 0xd8ccff, decor: ["crystal", "crystal", "mushroom", "rock"] },
  castle: { skyTop: 0x2a1530, skyBot: 0x8a3b4a, fog: 0x4a2232, top: 0x9a96a4, cap: 0x8a8694, side: 0x5c5866, sideDark: 0x2a2630, floor: 0xff5a1e, floorEmissive: 0xb02a00, hemiSky: 0xffd0c0, hemiGround: 0x502020, sun: 0xffc8a0, decor: ["tower", "rock", "rock"] },
};
const SURFACE = { ice: 0xbfe8ff, sand: 0xc9984a };
const LOOK = { bridge: 0xb07a40, wall: null, secret: 0xffe08a, start: null, goal: 0xffe9a8, arena: 0x6a6670 };

export function createWorld(container, { preserve = false, lowPower = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: !lowPower, preserveDrawingBuffer: preserve, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 320);
  const cam = createCamera();
  const hemi = new THREE.HemisphereLight(0xffffff, 0x666666, 1.6);
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.position.set(18, 30, 10);
  scene.add(hemi, sun, sun.target);

  // shared blob-shadow + particle textures
  const blobTex = radialTexture("rgba(0,0,0,0.55)", "rgba(0,0,0,0)");
  const dotTex = radialTexture("rgba(255,255,255,1)", "rgba(255,255,255,0)");
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
  const blobGeo = new THREE.CircleGeometry(0.5, 20);
  blobGeo.rotateX(-Math.PI / 2);

  const bear = createBear();
  scene.add(bear.root);
  const bearShadow = new THREE.Mesh(blobGeo, blobMat);
  scene.add(bearShadow);

  // particles (pooled sprites)
  const PCOL = { gold: 0xffd84a, white: 0xffffff, dust: 0xd8c8a8, red: 0xff5a5a, green: 0x6dff8a, blue: 0x8be0ff, purple: 0xc58bff, orange: 0xff9a3a };
  const pmats = {};
  for (const [k, c] of Object.entries(PCOL)) pmats[k] = new THREE.SpriteMaterial({ map: dotTex, color: c, transparent: true, depthWrite: false });
  const parts = [];
  for (let i = 0; i < 140; i++) {
    const s = new THREE.Sprite(pmats.white);
    s.visible = false;
    scene.add(s);
    parts.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, g: 0, size: 0.2 });
  }
  let pIdx = 0;
  const spawn = (x, y, z, n, color, { speed = 3, up = 2, life = 0.7, size = 0.25, g = 8 } = {}) => {
    for (let i = 0; i < n; i++) {
      const p = parts[pIdx];
      pIdx = (pIdx + 1) % parts.length;
      const a = Math.random() * Math.PI * 2, r = Math.random() * speed;
      p.s.material = pmats[color] || pmats.white;
      p.s.position.set(x, y, z);
      p.vx = Math.cos(a) * r;
      p.vz = Math.sin(a) * r;
      p.vy = up * (0.5 + Math.random());
      p.life = p.max = life * (0.7 + Math.random() * 0.6);
      p.size = size;
      p.g = g;
      p.s.visible = true;
    }
  };

  let L = null; // current level scene state
  let sizeW = 1, sizeH = 1;

  function buildLevel(g) {
    clearLevel();
    const lv = g.level;
    const T = THEMES[lv.theme] || THEMES.valley;
    const K = createKit();
    const group = new THREE.Group();
    scene.add(group);
    scene.background = new THREE.Color(T.skyBot);
    scene.fog = new THREE.Fog(T.fog, 45, 150);
    hemi.color.setHex(T.hemiSky);
    hemi.groundColor.setHex(T.hemiGround);
    sun.color.setHex(T.sun);
    hemi.intensity = lv.theme === "cave" || lv.theme === "castle" ? 1.35 : 1.6;

    // sky dome (vertex-coloured gradient)
    const skyGeo = K.geo(new THREE.SphereGeometry(250, 24, 12));
    const sc = [];
    const top = new THREE.Color(T.skyTop), bot = new THREE.Color(T.skyBot);
    const pos = skyGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const k = Math.max(0, Math.min(1, pos.getY(i) / 250 + 0.15));
      const c = bot.clone().lerp(top, k);
      sc.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute("color", new THREE.Float32BufferAttribute(sc, 3));
    const sky = new THREE.Mesh(skyGeo, K.own(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
    group.add(sky);

    // bounds
    let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
    for (const b of lv.boxes) {
      bx0 = Math.min(bx0, b.x0);
      bx1 = Math.max(bx1, b.x1);
      bz0 = Math.min(bz0, b.z0);
      bz1 = Math.max(bz1, b.z1);
    }
    const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
    const floorY = lv.killY - 0.6;
    const floor = new THREE.Mesh(K.geo(new THREE.PlaneGeometry(420, 420)), K.mat(T.floor, { emissive: T.floorEmissive }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, floorY, cz);
    group.add(floor);

    // static platforms → merged bodies + caps
    const bodies = [], caps = [];
    const dyn = [];
    const colorize = (geo, cTop, cBot) => {
      const p = geo.attributes.position;
      const arr = [];
      const a = new THREE.Color(cTop), b = new THREE.Color(cBot);
      for (let i = 0; i < p.count; i++) {
        const c = p.getY(i) > 0 ? a : b;
        arr.push(c.r, c.g, c.b);
      }
      geo.setAttribute("color", new THREE.Float32BufferAttribute(arr, 3));
      return geo;
    };
    const boxGeo = (w, h, d, x, y, z, cTop, cBot) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      colorize(geo, cTop, cBot);
      geo.translate(x, y, z);
      return geo;
    };
    for (const b of g.boxes) {
      const w = b.x1 - b.x0, d = b.z1 - b.z0, h = b.y1 - b.y0;
      const x = (b.x0 + b.x1) / 2, z = (b.z0 + b.z1) / 2;
      const isWall = b.look === "wall";
      const capCol = b.surface ? SURFACE[b.surface] : LOOK[b.look] ?? T.cap;
      const sideCol = isWall ? (lv.theme === "castle" ? 0x6a6676 : T.side) : b.look === "bridge" ? 0x7a5230 : T.side;
      const dynamic = b.m || b.kind === "crumble" || b.kind === "gate";
      if (dynamic) {
        const grp = new THREE.Group();
        const mb = b.kind === "gate" ? K.mat(0x3a3440) : K.mat(b.m ? 0xd9a54a : 0x9fb6c8);
        grp.add(new THREE.Mesh(K.geo(new THREE.BoxGeometry(w, h, d)), mb));
        if (b.kind !== "gate") {
          const cap = new THREE.Mesh(K.geo(new THREE.BoxGeometry(w + 0.1, 0.18, d + 0.1)), K.mat(b.m ? 0xffd27a : b.surface === "ice" || lv.theme === "snow" ? 0xd6f0ff : 0xc9b6a0));
          cap.position.y = h / 2 - 0.05;
          grp.add(cap);
          if (b.kind === "crumble") {
            // cracks
            for (let i = 0; i < 3; i++) {
              const cr = new THREE.Mesh(K.box, K.mat(0x445566));
              cr.scale.set(w * 0.7, 0.02, 0.05);
              cr.position.set(0, h / 2 + 0.05, (i - 1) * d * 0.25);
              cr.rotation.y = (i - 1) * 0.5;
              grp.add(cr);
            }
          }
        } else {
          // gate bars
          for (let i = -3; i <= 3; i++) {
            const bar = new THREE.Mesh(K.cyl, K.mat(0x8a8494));
            bar.scale.set(0.08, h, 0.08);
            bar.position.set(Math.abs(w) > Math.abs(d) ? i * (w / 7) : 0, 0, Math.abs(w) > Math.abs(d) ? 0 : i * (d / 7));
            grp.add(bar);
          }
          grp.children[0].scale.set(1, 1, 0.3);
        }
        grp.position.set(x, (b.y0 + b.y1) / 2, z);
        group.add(grp);
        dyn.push({ b, grp, base: grp.position.clone() });
        continue;
      }
      const darkBottom = new THREE.Color(sideCol).lerp(new THREE.Color(T.sideDark), Math.min(1, h / 10));
      bodies.push(boxGeo(w, h, d, x, (b.y0 + b.y1) / 2, z, sideCol, darkBottom.getHex()));
      if (!isWall) {
        caps.push(boxGeo(w + 0.12, 0.24, d + 0.12, x, b.y1 - 0.1, z, capCol, new THREE.Color(capCol).multiplyScalar(0.8).getHex()));
        if (b.look === "bridge") {
          // plank seams + rope posts
          const n = Math.max(2, Math.round(Math.max(w, d) / 0.6));
          for (let i = 1; i < n; i++) {
            const along = w > d;
            caps.push(boxGeo(along ? 0.05 : w + 0.14, 0.02, along ? d + 0.14 : 0.05, along ? b.x0 + (w * i) / n : x, b.y1 + 0.03, along ? z : b.z0 + (d * i) / n, 0x6a4424, 0x6a4424));
          }
        }
        if (b.surface === "sand") {
          for (let i = 0; i < 3; i++) caps.push(boxGeo(w * (0.3 + i * 0.2), 0.02, d * (0.3 + i * 0.2), x, b.y1 + 0.03 + i * 0.002, z, i % 2 ? 0xb5843a : 0xd7a85a, 0xb5843a));
        }
      } else {
        caps.push(boxGeo(w + 0.08, 0.3, d + 0.08, x, b.y1 - 0.1, z, lv.theme === "castle" ? 0x8a8496 : T.top, T.side));
      }
    }
    const vmat = K.own(new THREE.MeshLambertMaterial({ vertexColors: true }));
    if (bodies.length) {
      const m = mergeGeometries(bodies, false);
      bodies.forEach((x) => x.dispose());
      group.add(new THREE.Mesh(K.geo(m), vmat));
    }
    if (caps.length) {
      const m = mergeGeometries(caps, false);
      caps.forEach((x) => x.dispose());
      group.add(new THREE.Mesh(K.geo(m), vmat));
    }

    // coins
    const coinGeo = makeCoinGeometry(K);
    const coinMat = K.mat(0xffcc33, { emissive: 0x6a4a00 });
    const coins = new THREE.InstancedMesh(coinGeo, coinMat, Math.max(1, g.coins.length));
    coins.count = g.coins.length;
    group.add(coins);

    // entities
    const mk = (fn, list) =>
      list.map((o) => {
        const m = fn(o);
        group.add(m.root);
        return m;
      });
    const enemies = mk((e) => (e.type === "patrol" ? makePatrol(K, lv.theme, e.tough) : makeChaser(K, lv.theme, e.tough)), g.enemies);
    const enemyShadows = g.enemies.map(() => {
      const s = new THREE.Mesh(blobGeo, blobMat);
      group.add(s);
      return s;
    });
    const chests = mk(() => makeChest(K), g.chests);
    g.chests.forEach((c, i) => {
      chests[i].root.position.set(c.x, c.y, c.z);
      chests[i].root.rotation.y = c.face + Math.PI;
    });
    const cps = mk(() => makeCheckpoint(K), g.cps);
    g.cps.forEach((c, i) => cps[i].root.position.set(c.x, c.y, c.z));
    const springs = mk(() => makeSpring(K), g.springs);
    g.springs.forEach((s, i) => springs[i].root.position.set(s.x, s.y, s.z));
    const honey = mk(() => makeHoney(K), g.honey);
    const hazards = g.hazards.map((h) => {
      const m = makeHazard(K, h, lv.theme);
      group.add(m.root);
      return m;
    });
    const portal = makePortal(K);
    portal.root.position.set(g.portal.x, g.portal.y, g.portal.z);
    portal.root.rotation.y = g.portal.face;
    group.add(portal.root);
    let friend = null;
    if (g.friend) {
      friend = makeFriend(K, g.friend.kind);
      friend.root.position.set(g.friend.x, g.friend.y, g.friend.z);
      friend.root.rotation.y = Math.PI;
      group.add(friend.root);
    }
    let boss = null, lane = null, ring = null, marks = [];
    if (g.boss) {
      boss = makeBoss(K);
      group.add(boss.root);
      lane = new THREE.Mesh(K.box, K.basic(0xff2a2a, { transparent: true, opacity: 0.35, depthWrite: false }));
      group.add(lane);
      ring = new THREE.Mesh(K.geo(new THREE.TorusGeometry(1, 0.22, 6, 48)), K.basic(0xffa040, { transparent: true, opacity: 0.85 }));
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
      const markGeo = K.geo(new THREE.RingGeometry(0.85, 1, 28));
      markGeo.rotateX(-Math.PI / 2);
      const fillGeo = K.geo(new THREE.CircleGeometry(1, 28));
      fillGeo.rotateX(-Math.PI / 2);
      for (let i = 0; i < 10; i++) {
        const o = new THREE.Group();
        o.add(new THREE.Mesh(markGeo, K.basic(0xff2a2a, { transparent: true, opacity: 0.8, depthWrite: false })));
        const fill = new THREE.Mesh(fillGeo, K.basic(0xff2a2a, { transparent: true, opacity: 0.25, depthWrite: false }));
        o.add(fill);
        const thorn = new THREE.Mesh(K.cone, K.mat(0x5a3a5a));
        thorn.scale.set(0.35, -1.4, 0.35);
        o.add(thorn);
        o.visible = false;
        group.add(o);
        marks.push({ o, fill, thorn });
      }
    }

    // decoration: props around the course (no collision), clouds/background
    const rand = mulberry(lv.id * 977);
    const decorKinds = T.decor;
    const isFree = (x, z) => !g.level.boxes.some((b) => x > b.x0 - 6 && x < b.x1 + 6 && z > b.z0 - 6 && z < b.z1 + 6);
    let placed = 0;
    for (let i = 0; i < 260 && placed < 70; i++) {
      const x = bx0 - 25 + rand() * (bx1 - bx0 + 50), z = bz0 - 25 + rand() * (bz1 - bz0 + 50);
      if (!isFree(x, z)) continue;
      const kind = decorKinds[Math.floor(rand() * decorKinds.length)];
      const d = makeDecor(K, kind === "flower" ? "tree" : kind, lv.theme);
      const s = 1.5 + rand() * 1.3;
      d.scale.setScalar(s);
      d.position.set(x, floorY, z);
      d.rotation.y = rand() * 6.28;
      group.add(d);
      placed++;
    }
    // small props on the edges of wide platforms
    for (const b of lv.boxes) {
      if (b.m || b.kind !== "ground" || b.look === "wall" || b.look === "bridge" || b.surface) continue;
      const w = b.x1 - b.x0, d = b.z1 - b.z0;
      if (w < 3.4 || d < 3.4 || rand() < 0.45) continue;
      const kind = decorKinds[Math.floor(rand() * decorKinds.length)];
      const small = kind === "tree" || kind === "pine" ? "flower" : kind === "cactus" || kind === "tower" ? (lv.theme === "castle" ? "torch" : "rock") : kind;
      const dd = makeDecor(K, small, lv.theme);
      const corner = Math.floor(rand() * 4);
      dd.position.set(corner % 2 ? b.x1 - 0.35 : b.x0 + 0.35, b.y1, corner > 1 ? b.z1 - 0.35 : b.z0 + 0.35);
      dd.scale.setScalar(small === "torch" ? 1 : 0.7);
      group.add(dd);
    }
    for (const dcr of lv.decor || []) {
      const dd = makeDecor(K, dcr.kind, lv.theme);
      dd.position.set(dcr.x, dcr.y, dcr.z);
      dd.scale.setScalar(dcr.k || 1);
      group.add(dd);
    }
    // clouds / floating motes
    const clouds = new THREE.Group();
    const cloudMat = lv.theme === "cave" ? K.basic(0x8a6cff, { transparent: true, opacity: 0.35, fog: false }) : lv.theme === "castle" ? K.basic(0x2a1520, { transparent: true, opacity: 0.6, fog: false }) : K.basic(0xffffff, { transparent: true, opacity: 0.9, fog: false });
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const p = new THREE.Mesh(K.sphereLo, cloudMat);
        p.scale.set(3 + rand() * 3, 1.5 + rand(), 2 + rand() * 2);
        p.position.set(j * 3 - 4.5, rand(), rand() * 2);
        c.add(p);
      }
      const a = rand() * Math.PI * 2, r = 80 + rand() * 60;
      c.position.set(cx + Math.cos(a) * r, 25 + rand() * 30, cz + Math.sin(a) * r);
      clouds.add(c);
    }
    group.add(clouds);

    L = { id: lv.id, K, group, coins, coinGeo, enemies, enemyShadows, chests, cps, springs, honey, hazards, portal, friend, boss, lane, ring, marks, dyn, clouds, theme: lv.theme, floor };
  }

  function clearLevel() {
    if (!L) return;
    scene.remove(L.group);
    L.K.dispose();
    L = null;
  }

  const dummy = new THREE.Object3D();
  const v3 = new THREE.Vector3();

  function setGame(g, { snap = true } = {}) {
    if (!L || L.id !== g.level.id) buildLevel(g);
    if (snap) snapCamera(cam, g, g.player.face);
  }

  /**
   * opts: { mode: 'play'|'menu'|'victory', look: {dx, dy} }
   */
  function render(g, dt, opts = {}) {
    if (!g) return;
    if (!L || L.id !== g.level.id) setGame(g);
    const mode = opts.mode || "play";
    const t = g.t;
    const p = g.player;

    // ---- platforms that move / crumble
    for (const d of L.dyn) {
      const b = d.b;
      if (b.kind === "gate") {
        d.grp.visible = b.solid;
        continue;
      }
      d.grp.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
      if (b.kind === "crumble") {
        const shake = b.ct >= 0 && !b.fallen ? Math.sin(t * 60) * 0.06 : 0;
        d.grp.position.x += shake;
        d.grp.position.y -= b.fallen ? b.fallY : 0;
        d.grp.visible = !b.fallen || b.fallY < 9;
      }
    }

    // ---- coins
    for (let i = 0; i < g.coins.length; i++) {
      const c = g.coins[i];
      if (c.got) dummy.scale.setScalar(0);
      else dummy.scale.setScalar(1);
      dummy.position.set(c.x, c.y + Math.sin(t * 2.5 + i) * 0.08, c.z);
      dummy.rotation.set(0, t * 2.4 + i * 0.4, 0);
      dummy.updateMatrix();
      L.coins.setMatrixAt(i, dummy.matrix);
    }
    L.coins.instanceMatrix.needsUpdate = true;

    // ---- enemies
    g.enemies.forEach((e, i) => {
      const m = L.enemies[i];
      const sh = L.enemyShadows[i];
      if (!e.alive && e.deadT > 0.35) {
        m.root.visible = false;
        sh.visible = false;
        return;
      }
      m.root.visible = true;
      m.root.position.set(e.x, e.y, e.z);
      m.root.rotation.y = e.face;
      if (!e.alive) m.root.scale.set(1 + e.deadT * 2, Math.max(0.05, 1 - e.deadT * 3), 1 + e.deadT * 2);
      else if (e.hitT > 0) m.root.scale.set(1.2, 0.75, 1.2);
      else m.root.scale.setScalar(1);
      m.update(e, t);
      sh.visible = true;
      sh.position.set(e.x, e.y + 0.02, e.z);
      sh.scale.setScalar(1.8);
    });

    // ---- props
    g.chests.forEach((c, i) => L.chests[i].update(c, t));
    g.cps.forEach((c, i) => L.cps[i].update(c, t));
    g.springs.forEach((s, i) => L.springs[i].update(s, t, dt));
    g.honey.forEach((h, i) => {
      const m = L.honey[i];
      m.root.visible = !h.got;
      m.root.position.set(h.x, h.y - 0.3 + Math.sin(t * 2 + i) * 0.08, h.z);
      m.root.rotation.y = t;
    });
    // the boss arena's exit only appears once the Baron is beaten
    L.portal.root.visible = !(g.boss && !g.portal.open);
    L.portal.update(g.portal, t);
    if (L.friend && g.friend) {
      L.friend.update(g.friend, t);
    }
    // ---- hazards
    g.hazards.forEach((h, i) => {
      const m = L.hazards[i];
      const s = hazardState(h, t);
      if (h.type === "spikes") m.spikes.position.y = h.period ? (s.up - 1) * 0.5 + (s.warn ? Math.sin(t * 50) * 0.03 : 0) : 0;
      else if (h.type === "bar") m.arm.rotation.y = -s.a;
      else if (h.type === "saw") {
        m.root.position.set(s.x, h.y, s.z);
        m.ball.rotation.x = t * 6;
        m.ball.rotation.z = t * 4;
      } else if (h.type === "fire") {
        m.flame.visible = s.on;
        m.flame.scale.set(1, Math.max(0.05, s.k), 1);
        m.flame.rotation.y = t * 8;
        m.smoke.visible = s.warn && !s.on;
        m.smoke.scale.setScalar(0.25 + Math.abs(Math.sin(t * 9)) * 0.25);
        m.smoke.position.y = 0.4 + ((t * 2) % 0.6);
      } else if (h.type === "drop") {
        const st = s.stage;
        m.obj.visible = st !== "idle" && !(st === "rest" && s.k > 0.7);
        m.obj.position.y = s.y - h.y + (L.theme === "snow" ? 0.55 : 0.4) + (st === "warn" ? Math.sin(t * 40) * 0.03 * s.k : 0);
        const sk = st === "warn" ? 0.3 + s.k * 0.7 : st === "fall" || st === "hit" ? 1 : 0;
        m.shadow.visible = sk > 0;
        m.shadow.scale.setScalar(Math.max(0.01, sk * h.r));
        m.shadow.material.opacity = 0.25 + sk * 0.3;
      }
    });

    // ---- boss
    if (L.boss && g.boss) {
      const B = g.boss;
      L.boss.root.visible = B.state !== "gone";
      L.boss.root.position.set(B.x, B.y, B.z);
      L.boss.root.rotation.y = B.face;
      L.boss.update(B, t, dt);
      const ln = B.lane && B.state === "chargeTele" ? B.lane : null;
      L.lane.visible = !!ln;
      if (ln) {
        const len = ln.len;
        L.lane.scale.set(2.6, 0.04, len);
        L.lane.position.set(B.x + (ln.dx * len) / 2, B.def.y + 0.03, B.z + (ln.dz * len) / 2);
        L.lane.rotation.y = Math.atan2(ln.dx, ln.dz);
        L.lane.material.opacity = 0.25 + 0.15 * Math.sin(t * 18);
      }
      L.ring.visible = !!B.ring;
      if (B.ring) {
        L.ring.position.set(B.ring.x, B.def.y + 0.25, B.ring.z);
        L.ring.scale.set(B.ring.r, B.ring.r, 1);
      }
      L.marks.forEach((mk, i) => {
        const m = B.marks[i];
        mk.o.visible = !!m;
        if (!m) return;
        mk.o.position.set(m.x, B.def.y + 0.04, m.z);
        mk.o.scale.set(m.r, 1, m.r);
        const k = Math.min(1, m.t / 1.15);
        mk.fill.scale.setScalar(Math.max(0.01, k));
        mk.thorn.position.y = Math.max(0.6, 9 * (1 - k * k) + 0.6);
        mk.thorn.visible = m.t > 0.55;
      });
    }

    // ---- bear
    const victory = mode === "victory" || g.status === "complete";
    bear.root.position.set(p.x, p.y - (p.sink || 0) * 0.8, p.z);
    bear.root.rotation.y = victory && mode !== "play" ? Math.atan2(cam.x - p.x, cam.z - p.z) : p.face;
    bear.update(
      {
        t: g.t,
        speed: p.speed,
        grounded: p.grounded || mode === "menu",
        vy: p.vy,
        attackT: p.attackT,
        hitT: p.hitT,
        inv: p.inv,
        landed: g.frameEvents?.some((e) => e.type === "land"),
        mode: g.status === "ko" || g.status === "over" ? "ko" : victory ? "victory" : mode === "menu" ? "menu" : "play",
      },
      dt,
    );
    bear.root.visible = bear.root.visible && g.status !== "respawn";
    const gy = g.groundBelow(p.x, p.z, p.y + 0.05);
    bearShadow.visible = gy > -Infinity && g.status !== "respawn";
    if (bearShadow.visible) {
      bearShadow.position.set(p.x, gy + 0.03, p.z);
      bearShadow.scale.setScalar(Math.max(0.4, 1.5 - (p.y - gy) * 0.12));
    }

    // ---- particles
    for (const q of parts) {
      if (q.life <= 0) continue;
      q.life -= dt;
      if (q.life <= 0) {
        q.s.visible = false;
        continue;
      }
      q.vy -= q.g * dt;
      q.s.position.x += q.vx * dt;
      q.s.position.y += q.vy * dt;
      q.s.position.z += q.vz * dt;
      const k = q.life / q.max;
      q.s.scale.setScalar(q.size * (0.4 + k * 0.6));
      q.s.material.opacity = Math.min(1, k * 1.5);
    }
    L.clouds.rotation.y += dt * 0.004;
    if (L.theme === "castle") L.floor.material.emissive.setHex(0xb02a00).multiplyScalar(0.8 + Math.sin(t * 1.5) * 0.2);

    // ---- camera
    if (mode === "menu") {
      cam.yaw += dt * 0.12;
      cam.pitch = 0.3;
      cam.want = 6;
      updateCamera(cam, g, dt, { follow: false });
    } else if (mode === "victory" || g.status === "complete") {
      cam.yaw += dt * 0.35;
      cam.pitch += (0.62 - cam.pitch) * Math.min(1, dt * 2);
      cam.want = 6;
      updateCamera(cam, g, dt, { follow: false });
    } else {
      cam.want = opts.zoom ?? 7.2;
      const focus = g.boss && g.boss.state === "defeat" ? { x: g.boss.x, y: g.boss.y, z: g.boss.z } : null;
      updateCamera(cam, g, dt, { follow: opts.follow !== false, focus });
    }
    camera.position.set(cam.x, cam.y, cam.z);
    camera.lookAt(cam.tx, cam.ty, cam.tz);
    sun.position.set(cam.tx + 18, cam.ty + 30, cam.tz + 10);
    sun.target.position.set(cam.tx, cam.ty, cam.tz);
    renderer.render(scene, camera);
  }

  function onEvents(g, evs) {
    const p = g.player;
    for (const e of evs) {
      switch (e.type) {
        case "coin":
          spawn(e.x, e.y, e.z, 6, "gold", { speed: 1.5, up: 2.5, life: 0.45, size: 0.25 });
          break;
        case "chest":
          spawn(e.x, e.y + 0.8, e.z, 18, "gold", { speed: 2.5, up: 6, life: 1, size: 0.3, g: 12 });
          break;
        case "honey":
          spawn(e.x, e.y, e.z, 12, "red", { speed: 1.5, up: 3, life: 0.7, size: 0.25 });
          break;
        case "land":
          spawn(p.x, p.y + 0.05, p.z, 5, "dust", { speed: 1.8, up: 0.6, life: 0.4, size: 0.3, g: 2 });
          break;
        case "jump":
          spawn(p.x, p.y + 0.05, p.z, 3, "dust", { speed: 1, up: 0.4, life: 0.3, size: 0.25, g: 2 });
          break;
        case "enemyHit":
          spawn(e.x, e.y + 0.6, e.z, 8, "white", { speed: 3, up: 2, life: 0.35, size: 0.22 });
          break;
        case "enemyDie":
          spawn(e.x, e.y + 0.5, e.z, 16, "white", { speed: 3, up: 3, life: 0.6, size: 0.4, g: 3 });
          spawn(e.x, e.y + 0.5, e.z, 6, "gold", { speed: 2, up: 4, life: 0.6, size: 0.22 });
          break;
        case "hurt":
          spawn(p.x, p.y + 0.8, p.z, 10, "red", { speed: 3, up: 2, life: 0.4, size: 0.22 });
          cam.shake = Math.max(cam.shake, 0.6);
          break;
        case "fall":
          spawn(p.x, Math.max(p.y, g.level.killY), p.z, 14, L?.theme === "castle" ? "orange" : "blue", { speed: 2.5, up: 5, life: 0.8, size: 0.35 });
          break;
        case "checkpoint":
          spawn(e.x, e.y + 1.6, e.z, 16, "green", { speed: 2, up: 4, life: 0.8, size: 0.25 });
          break;
        case "spring": {
          const i = g.springs.findIndex((s) => s.x === e.x && s.z === e.z);
          if (i >= 0) L?.springs[i]?.boing();
          spawn(e.x, p.y + 0.3, e.z, 6, "white", { speed: 2, up: 1, life: 0.3, size: 0.25 });
          break;
        }
        case "cageHit":
          if (g.friend) spawn(g.friend.x, g.friend.y + 0.8, g.friend.z, 8, "white", { speed: 2.5, up: 2, life: 0.35, size: 0.2 });
          break;
        case "friend":
          spawn(e.x, e.y + 1, e.z, 24, "green", { speed: 3, up: 5, life: 1, size: 0.3 });
          spawn(e.x, e.y + 1, e.z, 12, "gold", { speed: 2, up: 6, life: 1, size: 0.25 });
          break;
        case "crumble":
          {
            const b = g.boxes[e.i];
            spawn((b.x0 + b.x1) / 2, b.y1, (b.z0 + b.z1) / 2, 10, L?.theme === "snow" ? "blue" : "dust", { speed: 2, up: 1, life: 0.6, size: 0.35 });
          }
          break;
        case "bossSlam":
          cam.shake = 1;
          spawn(e.x, g.boss.def.y + 0.2, e.z, 20, "dust", { speed: 6, up: 2, life: 0.6, size: 0.5, g: 4 });
          break;
        case "bossWall":
          cam.shake = 1.2;
          spawn(e.x, g.boss.def.y + 2, e.z, 14, "white", { speed: 4, up: 4, life: 0.6, size: 0.4 });
          break;
        case "thornLand":
          spawn(e.x, g.boss.def.y + 0.3, e.z, 6, "purple", { speed: 2.5, up: 2, life: 0.4, size: 0.3 });
          break;
        case "bossHit":
          spawn(g.boss.x, g.boss.y + 2, g.boss.z, 12, "gold", { speed: 4, up: 3, life: 0.5, size: 0.3 });
          cam.shake = Math.max(cam.shake, 0.4);
          break;
        case "bossDefeated":
          cam.shake = 1.5;
          break;
        case "bossGone":
          spawn(g.boss.x, g.boss.def.y + 1.5, g.boss.z, 40, "gold", { speed: 5, up: 7, life: 1.4, size: 0.4, g: 9 });
          spawn(g.boss.x, g.boss.def.y + 1.5, g.boss.z, 30, "white", { speed: 4, up: 4, life: 1, size: 0.6, g: 2 });
          break;
        case "complete":
          spawn(p.x, p.y + 1, p.z, 30, "gold", { speed: 3, up: 6, life: 1.2, size: 0.3 });
          break;
        default:
          break;
      }
    }
  }

  function resize(w, h) {
    sizeW = Math.max(1, Math.floor(w));
    sizeH = Math.max(1, Math.floor(h));
    renderer.setSize(sizeW, sizeH, false);
    renderer.domElement.style.width = `${sizeW}px`;
    renderer.domElement.style.height = `${sizeH}px`;
    camera.aspect = sizeW / sizeH;
    camera.fov = camera.aspect < 1 ? 68 : 55; // portrait phones see more
    camera.updateProjectionMatrix();
  }

  function dispose() {
    clearLevel();
    bear.dispose();
    blobGeo.dispose();
    blobMat.dispose();
    blobTex.dispose();
    dotTex.dispose();
    for (const m of Object.values(pmats)) m.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
    renderer.domElement.remove();
  }

  void v3;
  return { renderer, scene, camera, cam, setGame, render, onEvents, resize, dispose, canvas: renderer.domElement };
}

function radialTexture(inner, outer) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d");
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner);
  gr.addColorStop(1, outer);
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
