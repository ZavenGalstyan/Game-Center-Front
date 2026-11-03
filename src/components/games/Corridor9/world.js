/**
 * Corridor 9 — Three.js renderer. Builds the passage from data.js and draws
 * a game state each frame. Holds no game rules.
 *
 * Structure
 *   sPiece  south connector + corner (static, batched)      ┐ the same group,
 *   nPiece  = sPiece rotated 180° about the corridor centre  ┘ cloned
 *   main    main-corridor shell (walls, floor, pipes, fixtures, door frames)
 *   props   everything an anomaly can touch — only in the current loop
 *   ghost   one more sPiece + main shell placed where the previous loop's
 *           exit / next loop's entrance would be, so the view across a
 *           junction is real geometry. It hops ends when you pass the
 *           middle of the corridor, where neither junction is visible.
 *
 * Anomalies: setLoop(loop) resets EVERY prop to its baseline, then applies
 * at most one anomaly. animate() derives all motion from loop time + player
 * position only, so state can't leak from one loop to the next.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { W, H, L, C, J0, J1, T, CENTER, PROPS, BENCH_SIZE, DOOR_W, DOOR_AJAR } from "./data.js";
import {
  floorTextures, wallTexture, ceilingTexture, posterTexture, missingPosterTexture, infoSignTexture,
  exitSignCanvas, noticeTexture, doorTexture, clockFaceTexture, shadowTexture, blobTexture, puddleTexture,
} from "./textures.js";

const P = 1.6; // texture period (m)
const FOG = 0x0a0a09;
const LIGHT_COL = 0xfff1d8;
const PANEL_COL = new THREE.Color(0xfff6e4);
const LIGHT_I = 5.2;

function worldBox(x0, y0, z0, x1, y1, z1) {
  const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    if (ny > 0.5) uv.setXY(i, x / P, z / P);
    else if (nx > 0.5) uv.setXY(i, z / P, y / H);
    else uv.setXY(i, x / P, y / H);
  }
  return geo;
}

export function createWorld(container) {
  const preserve = !!container.dataset.preserve;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: preserve });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.className = "c9-canvas";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG);
  scene.fog = new THREE.FogExp2(FOG, 0.03);
  const camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.05, 70);
  camera.rotation.order = "YXZ";
  scene.add(camera);
  scene.add(new THREE.HemisphereLight(0xb7b4a6, 0x2b2722, 0.55));

  const disposables = [];
  const track = (o) => (disposables.push(o), o);

  /* ---------------------------------------------------------------- materials */
  const floorT = floorTextures();
  const M = {
    floor: track(new THREE.MeshPhongMaterial({ map: track(floorT.map), bumpMap: track(floorT.bump), bumpScale: 0.6, shininess: 70, specular: 0x3a3a36 })),
    wall: track(new THREE.MeshPhongMaterial({ map: track(wallTexture(H)), shininess: 28, specular: 0x1f1f1c })),
    ceil: track(new THREE.MeshLambertMaterial({ map: track(ceilingTexture()) })),
    metal: track(new THREE.MeshPhongMaterial({ color: 0x8a8c88, shininess: 60, specular: 0x555555 })),
    darkMetal: track(new THREE.MeshPhongMaterial({ color: 0x3a3c3a, shininess: 40, specular: 0x333333 })),
    pipe: track(new THREE.MeshPhongMaterial({ color: 0x6f7470, shininess: 50, specular: 0x444444 })),
    pipe2: track(new THREE.MeshPhongMaterial({ color: 0x8c6f3e, shininess: 45, specular: 0x3a3020 })),
    panel: track(new THREE.MeshBasicMaterial({ color: PANEL_COL })),
    black: track(new THREE.MeshBasicMaterial({ color: 0x020202 })),
    wood: track(new THREE.MeshPhongMaterial({ color: 0x7a5232, shininess: 25, specular: 0x222222 })),
    frame: track(new THREE.MeshPhongMaterial({ color: 0xb9bab4, shininess: 80, specular: 0x777777 })),
    vent: track(new THREE.MeshLambertMaterial({ color: 0x575953 })),
    figure: track(new THREE.MeshLambertMaterial({ color: 0x050505 })),
  };
  const lambertMap = (map, extra = {}) => track(new THREE.MeshLambertMaterial({ map: track(map), ...extra }));

  /* ---------------------------------------------------------------- static batching */
  const makeBatch = () => new Map();
  const add = (batch, geo, mat) => {
    if (!batch.has(mat)) batch.set(mat, []);
    batch.get(mat).push(geo.index ? geo.toNonIndexed() : geo);
  };
  const flush = (batch, group) => {
    for (const [mat, list] of batch) {
      const merged = track(mergeGeometries(list, false));
      list.forEach((g) => g.dispose());
      const m = new THREE.Mesh(merged, mat);
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      group.add(m);
    }
    batch.clear();
  };
  const placed = (geo, x, y, z, ry = 0, rx = 0, rz = 0) => {
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, "YXZ"));
    m.setPosition(x, y, z);
    return geo.applyMatrix4(m);
  };
  const fixtureInto = (batch, x, z, alongX) => {
    const ry = alongX ? Math.PI / 2 : 0;
    add(batch, placed(new THREE.BoxGeometry(0.32, 0.07, 1.34), x, H - 0.035, z, ry), M.metal);
    add(batch, placed(new THREE.BoxGeometry(0.22, 0.02, 1.22), x, H - 0.08, z, ry), M.panel);
  };
  const ventInto = (batch, x, y, z, ry, w = 0.5, h = 0.22) => {
    add(batch, placed(new THREE.BoxGeometry(w, h, 0.03), x, y, z, ry), M.vent);
    for (let i = 0; i < 5; i++) add(batch, placed(new THREE.BoxGeometry(w - 0.06, 0.012, 0.04), x, y - h / 2 + 0.03 + i * ((h - 0.06) / 4), z, ry), M.darkMetal);
  };

  /* ---------------------------------------------------------------- south piece (connector + corner) */
  const sPiece = new THREE.Group();
  {
    const b = makeBatch();
    const X0 = J0.x, WT = 0.25;
    add(b, worldBox(X0, -0.1, -W, W / 2, 0, 0), M.floor);
    add(b, worldBox(X0, H, -W, W / 2, H + 0.1, 0), M.ceil);
    add(b, worldBox(X0, 0, -W - WT, W / 2 + WT, H, -W), M.wall); // south
    add(b, worldBox(X0, 0, 0, -W / 2, H, WT), M.wall); // north (connector side)
    add(b, worldBox(W / 2, 0, -W - WT, W / 2 + WT, H, 0), M.wall); // east (corner)
    fixtureInto(b, -3.6, -W / 2, true);
    fixtureInto(b, -7.6, -W / 2, true);
    fixtureInto(b, 0, -W / 2, false);
    // a conduit along the connector ceiling (south wall)
    add(b, placed(new THREE.CylinderGeometry(0.025, 0.025, C + W, 8), (X0 + W / 2) / 2, H - 0.12, -W + 0.12, 0, 0, Math.PI / 2), M.pipe);
    // the rules notice
    const notice = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.82), lambertMap(noticeTexture()));
    track(notice.geometry);
    notice.position.set(-6.4, 1.55, -0.012);
    notice.rotation.y = Math.PI;
    const nf = new THREE.Mesh(track(new THREE.BoxGeometry(0.7, 0.9, 0.008)), M.frame);
    nf.position.set(-6.4, 1.55, -0.004);
    sPiece.add(nf, notice);
    flush(b, sPiece);
    for (const [x, z] of [[0, -W / 2], [-5.6, -W / 2]]) {
      const l = new THREE.PointLight(LIGHT_COL, LIGHT_I, 11, 2);
      l.position.set(x, H - 0.55, z);
      sPiece.add(l);
    }
  }
  const nPiece = sPiece.clone();
  nPiece.rotation.y = Math.PI;
  nPiece.position.set(2 * CENTER.x, 0, 2 * CENTER.z);
  scene.add(sPiece, nPiece);

  /* ---------------------------------------------------------------- main corridor shell */
  const doorFrameInto = (b, z) => {
    const x = -W / 2;
    add(b, worldBox(x, 0, z - DOOR_W / 2 - 0.08, x + 0.07, 2.2, z - DOOR_W / 2), M.darkMetal);
    add(b, worldBox(x, 0, z + DOOR_W / 2, x + 0.07, 2.2, z + DOOR_W / 2 + 0.08), M.darkMetal);
    add(b, worldBox(x, 2.12, z - DOOR_W / 2 - 0.08, x + 0.07, 2.22, z + DOOR_W / 2 + 0.08), M.darkMetal);
  };
  const buildMainShell = (withFixtures) => {
    const g = new THREE.Group();
    const b = makeBatch();
    const WT = 0.25;
    add(b, worldBox(-W / 2, -0.1, 0, W / 2, 0, L), M.floor);
    add(b, worldBox(-W / 2, H, 0, W / 2, H + 0.1, L), M.ceil);
    add(b, worldBox(-W / 2 - WT, 0, 0, -W / 2, H, L), M.wall);
    add(b, worldBox(W / 2, 0, 0, W / 2 + WT, H, L), M.wall);
    if (withFixtures) PROPS.fixturesZ.forEach((z, i) => i !== PROPS.flickerIndex && fixtureInto(b, 0, z, false));
    // pipes along the west ceiling corner, with flanges and elbows into the ceiling
    const pipes = [[-W / 2 + 0.13, H - 0.15, 0.055, M.pipe], [-W / 2 + 0.33, H - 0.11, 0.04, M.pipe2]];
    for (const [x, y, r, mat] of pipes) {
      add(b, placed(new THREE.CylinderGeometry(r, r, L - 0.6, 12), x, y, L / 2, 0, Math.PI / 2), mat);
      for (const z of [0.3, L - 0.3]) add(b, placed(new THREE.CylinderGeometry(r, r, H - y, 12), x, (y + H) / 2, z), mat);
      for (let z = 1.6; z < L - 0.5; z += 3.2) add(b, placed(new THREE.CylinderGeometry(r * 1.45, r * 1.45, 0.06, 12), x, y, z, 0, Math.PI / 2), M.darkMetal);
      for (let z = 3.2; z < L - 0.5; z += 3.2) add(b, placed(new THREE.BoxGeometry(0.04, H - y, 0.04), x, (y + H) / 2 + 0.02, z), M.darkMetal);
    }
    // wall vents (high on the east wall) + ceiling vents
    ventInto(b, W / 2 - 0.016, 2.45, 7.0, -Math.PI / 2, 0.6, 0.26);
    ventInto(b, W / 2 - 0.016, 2.45, 18.6 + 0.0, -Math.PI / 2, 0.6, 0.26);
    for (const d of PROPS.doors) doorFrameInto(b, d.z);
    // floor drain
    add(b, worldBox(0.9, 0, 11.6, 1.2, 0.004, 11.9), M.darkMetal);
    flush(b, g);
    return g;
  };
  const mainShell = buildMainShell(true);
  scene.add(mainShell);

  /* ---------------------------------------------------------------- props (current loop only) */
  const props = new THREE.Group();
  scene.add(props);
  const blob = track(blobTexture());
  const contact = (w, d, op = 0.55) => {
    const m = new THREE.Mesh(track(new THREE.PlaneGeometry(w, d)), track(new THREE.MeshBasicMaterial({ map: blob, transparent: true, opacity: op, depthWrite: false, color: 0x000000 })));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.004;
    return m;
  };

  // ceiling fixtures that can change: the flickering one and the extra one
  const makeFixture = (z, panelMat) => {
    const g = new THREE.Group();
    const h = new THREE.Mesh(track(new THREE.BoxGeometry(0.32, 0.07, 1.34)), M.metal);
    h.position.y = H - 0.035;
    const p = new THREE.Mesh(track(new THREE.BoxGeometry(0.22, 0.02, 1.22)), panelMat);
    p.position.y = H - 0.08;
    g.add(h, p);
    g.position.z = z;
    return g;
  };
  const mainLights = PROPS.fixturesZ.map((z) => {
    const l = new THREE.PointLight(LIGHT_COL, LIGHT_I, 11, 2);
    l.position.set(0, H - 0.55, z);
    props.add(l);
    return l;
  });
  const flickerMat = track(M.panel.clone());
  const flickerFix = makeFixture(PROPS.fixturesZ[PROPS.flickerIndex], flickerMat);
  // the extra light: a bare bulb on a cord, hanging where no light should be
  const extraFix = new THREE.Group();
  {
    const cord = new THREE.Mesh(track(new THREE.CylinderGeometry(0.006, 0.006, 0.75, 6)), M.black);
    cord.position.y = H - 0.375;
    const socket = new THREE.Mesh(track(new THREE.CylinderGeometry(0.025, 0.03, 0.07, 10)), M.darkMetal);
    socket.position.y = H - 0.78;
    const bulb = new THREE.Mesh(track(new THREE.SphereGeometry(0.068, 16, 12)), track(new THREE.MeshBasicMaterial({ color: 0xffd7a0 })));
    bulb.scale.y = 1.25;
    bulb.position.y = H - 0.865;
    const rose = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12)), M.darkMetal);
    rose.position.y = H - 0.01;
    extraFix.add(cord, socket, bulb, rose);
    extraFix.position.set(0.15, 0, PROPS.extraLightZ);
  }
  const extraLight = new THREE.PointLight(0xffc98a, 0, 11, 2);
  extraLight.position.set(0.15, H - 0.95, PROPS.extraLightZ);
  props.add(flickerFix, extraFix, extraLight);

  // hanging exit sign
  const exitSign = exitSignCanvas();
  track(exitSign.texture);
  {
    const g = new THREE.Group();
    const mat = track(new THREE.MeshBasicMaterial({ map: exitSign.texture }));
    const box = new THREE.Mesh(track(new THREE.BoxGeometry(1.5, 0.47, 0.09)), [M.darkMetal, M.darkMetal, M.darkMetal, M.darkMetal, mat, mat]);
    box.position.y = 2.42;
    g.add(box);
    for (const x of [-0.6, 0.6]) {
      const rod = new THREE.Mesh(track(new THREE.CylinderGeometry(0.012, 0.012, 0.25, 6)), M.darkMetal);
      rod.position.set(x, H - 0.125, 0);
      g.add(rod);
    }
    g.position.z = PROPS.exitSignZ;
    props.add(g);
  }

  // posters on the east wall
  const posterMats = {};
  for (const k of ["metro", "lost", "seaside", "seaside_wrong", "concert"]) posterMats[k] = lambertMap(posterTexture(k));
  const posters = PROPS.posters.map((p) => {
    const g = new THREE.Group();
    const fr = new THREE.Mesh(track(new THREE.BoxGeometry(0.03, 1.46, 1.06)), M.frame);
    const pic = new THREE.Mesh(track(new THREE.PlaneGeometry(0.96, 1.36)), posterMats[p.art]);
    pic.rotation.y = -Math.PI / 2;
    pic.position.x = -0.017;
    g.add(fr, pic);
    g.position.set(W / 2 - 0.016, 1.6, p.z);
    props.add(g);
    return { ...p, group: g, pic };
  });
  const missingRect = new THREE.Mesh(track(new THREE.PlaneGeometry(1.06, 1.46)), lambertMap(missingPosterTexture(), { transparent: true }));
  missingRect.rotation.y = -Math.PI / 2;
  missingRect.position.set(W / 2 - 0.004, 1.6, PROPS.posters[1].z);
  props.add(missingRect);

  // info sign
  const signMats = { blue: lambertMap(infoSignTexture(false)), red: lambertMap(infoSignTexture(true)) };
  const infoSign = new THREE.Mesh(track(new THREE.BoxGeometry(0.03, 0.42, 0.84)), [signMats.blue, M.darkMetal, M.darkMetal, M.darkMetal, M.darkMetal, M.darkMetal]);
  infoSign.position.set(W / 2 - 0.02, 1.95, PROPS.infoSign.z);
  infoSign.rotation.y = Math.PI; // +x face → faces -x (into the corridor)
  props.add(infoSign);

  // strange shadow
  const shadowMat = track(new THREE.MeshBasicMaterial({ map: track(shadowTexture()), transparent: true, opacity: 0.72, depthWrite: false, color: 0x000000 }));
  const shadow = new THREE.Mesh(track(new THREE.PlaneGeometry(0.95, 1.9)), shadowMat);
  shadow.rotation.y = -Math.PI / 2;
  shadow.position.set(W / 2 - 0.006, 1.05, PROPS.shadow.z);
  props.add(shadow);

  // doors (west wall)
  const doors = PROPS.doors.map((d) => {
    const voidM = new THREE.Mesh(track(new THREE.PlaneGeometry(DOOR_W, 2.1)), M.black);
    voidM.rotation.y = Math.PI / 2;
    voidM.position.set(-W / 2 + 0.004, 1.05, d.z);
    const pivot = new THREE.Group();
    pivot.position.set(-W / 2 + 0.035, 0, d.z + DOOR_W / 2); // hinge on the north edge
    const dm = lambertMap(doorTexture(d.label, d.num));
    const leaf = new THREE.Mesh(track(new THREE.BoxGeometry(0.05, 2.1, DOOR_W - 0.01)), [dm, M.darkMetal, M.darkMetal, M.darkMetal, M.darkMetal, M.darkMetal]);
    leaf.position.set(0, 1.05, -DOOR_W / 2);
    const handle = new THREE.Mesh(track(new THREE.BoxGeometry(0.05, 0.03, 0.16)), M.metal);
    handle.position.set(0.055, 1.02, -(DOOR_W - 0.16));
    pivot.add(leaf, handle);
    props.add(voidM, pivot);
    return { ...d, pivot };
  });

  // bench (+ contact shadow)
  const bench = new THREE.Group();
  {
    const len = BENCH_SIZE.len, dep = 0.42;
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(track(new THREE.BoxGeometry(dep / 3 - 0.02, 0.045, len)), M.wood);
      s.position.set(-dep / 2 + dep / 6 + (i * dep) / 3, 0.45, 0);
      bench.add(s);
    }
    for (const z of [-len / 2 + 0.18, len / 2 - 0.18]) {
      const leg = new THREE.Mesh(track(new THREE.BoxGeometry(dep - 0.04, 0.42, 0.05)), M.darkMetal);
      leg.position.set(0, 0.21, z);
      const foot = new THREE.Mesh(track(new THREE.BoxGeometry(dep, 0.03, 0.08)), M.darkMetal);
      foot.position.set(0, 0.015, z);
      bench.add(leg, foot);
    }
    const rail = new THREE.Mesh(track(new THREE.BoxGeometry(0.04, 0.04, len - 0.3)), M.darkMetal);
    rail.position.set(0, 0.36, 0);
    bench.add(rail, contact(dep + 0.35, len + 0.35, 0.6));
    props.add(bench);
  }

  // wall clock
  const clock = new THREE.Group();
  const hands = {};
  {
    const body = new THREE.Mesh(track(new THREE.CylinderGeometry(0.26, 0.26, 0.06, 40)), M.darkMetal);
    body.rotation.z = Math.PI / 2;
    body.position.x = 0.03;
    const face = new THREE.Mesh(track(new THREE.CircleGeometry(0.235, 40)), lambertMap(clockFaceTexture()));
    face.rotation.y = Math.PI / 2;
    face.position.x = 0.062;
    const glassRim = new THREE.Mesh(track(new THREE.TorusGeometry(0.245, 0.016, 8, 40)), M.frame);
    glassRim.rotation.y = Math.PI / 2;
    glassRim.position.x = 0.064;
    clock.add(body, face, glassRim);
    const hand = (len, wdt, col, off) => {
      const pv = new THREE.Group();
      pv.position.x = off;
      const m = new THREE.Mesh(track(new THREE.BoxGeometry(0.006, len, wdt)), track(new THREE.MeshBasicMaterial({ color: col })));
      m.position.y = len / 2 - 0.03;
      pv.add(m);
      clock.add(pv);
      return pv;
    };
    hands.h = hand(0.13, 0.018, 0x111111, 0.068);
    hands.m = hand(0.19, 0.012, 0x111111, 0.072);
    hands.s = hand(0.21, 0.005, 0xb3201b, 0.076);
    const cap = new THREE.Mesh(track(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 12)), M.black);
    cap.rotation.z = Math.PI / 2;
    cap.position.x = 0.08;
    clock.add(cap);
    clock.position.set(-W / 2, PROPS.clock.y, PROPS.clock.z);
    props.add(clock);
  }

  // leaking pipe: drips, puddle, wet pipe ring
  const leak = new THREE.Group();
  const drips = [];
  {
    const lx = -W / 2 + 0.33, ly = H - 0.15, lz = PROPS.leak.z;
    const waterMat = track(new THREE.MeshPhongMaterial({ color: 0x9fb4bc, shininess: 120, specular: 0xffffff, transparent: true, opacity: 0.85, emissive: 0x1a2226 }));
    for (let i = 0; i < 3; i++) {
      const d = new THREE.Mesh(track(new THREE.SphereGeometry(0.014, 8, 6)), waterMat);
      d.scale.y = 2.2;
      d.position.set(lx, ly, lz);
      leak.add(d);
      drips.push(d);
    }
    const puddleMat = track(new THREE.MeshPhongMaterial({ color: 0x0d0f10, shininess: 220, specular: 0xbfc8cc, transparent: true, opacity: 0.78, alphaMap: track(puddleTexture()), depthWrite: false }));
    const puddle = new THREE.Mesh(track(new THREE.PlaneGeometry(1.5, 1.2)), puddleMat);
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(lx + 0.25, 0.006, lz + 0.05);
    leak.add(puddle);
    const ring = new THREE.Mesh(track(new THREE.TorusGeometry(0.02, 0.005, 6, 20)), waterMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(lx, 0.01, lz);
    leak.add(ring);
    leak.userData = { lx, ly, lz, ring };
    const wet = new THREE.Mesh(track(new THREE.CylinderGeometry(0.046, 0.046, 0.3, 12)), track(new THREE.MeshPhongMaterial({ color: 0x3b3120, shininess: 160, specular: 0x777777 })));
    wet.rotation.x = Math.PI / 2;
    wet.position.set(lx, H - 0.11, lz);
    leak.add(wet);
    props.add(leak);
  }

  // floor tiles that change colour (aligned to the 0.4 m floor grid)
  const fp = PROPS.floorPatch;
  const tilesX = Math.round(W / 0.4), tilesZ = Math.round((fp.z1 - fp.z0) / 0.4);
  const tileMat = track(new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 80, specular: 0x333333, transparent: true, opacity: 0.88 }));
  const tiles = new THREE.InstancedMesh(track(new THREE.PlaneGeometry(0.385, 0.385)), tileMat, tilesX * tilesZ);
  {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), s = new THREE.Vector3(1, 1, 1);
    let k = 0;
    for (let i = 0; i < tilesX; i++)
      for (let j = 0; j < tilesZ; j++) {
        m.compose(new THREE.Vector3(-W / 2 + 0.2 + i * 0.4, 0.003, fp.z0 + 0.2 + j * 0.4), q, s);
        tiles.setMatrixAt(k, m);
        tiles.setColorAt(k++, new THREE.Color(0x6a665e));
      }
    props.add(tiles);
  }

  // silhouette at the far end
  const figure = new THREE.Group();
  {
    const add2 = (geo, x, y, z, rx = 0, rz = 0) => {
      const m = new THREE.Mesh(track(geo), M.figure);
      m.position.set(x, y, z);
      m.rotation.set(rx, 0, rz);
      figure.add(m);
      return m;
    };
    add2(new THREE.SphereGeometry(0.115, 16, 12), 0, 1.86, 0).scale.set(0.9, 1.15, 0.95);
    add2(new THREE.CylinderGeometry(0.05, 0.06, 0.14, 10), 0, 1.7, 0);
    add2(new THREE.CapsuleGeometry(0.17, 0.55, 6, 12), 0, 1.33, 0).scale.set(1, 1, 0.62);
    add2(new THREE.CapsuleGeometry(0.075, 0.82, 4, 8), -0.085, 0.5, 0);
    add2(new THREE.CapsuleGeometry(0.075, 0.82, 4, 8), 0.085, 0.5, 0);
    add2(new THREE.CapsuleGeometry(0.045, 0.78, 4, 8), -0.23, 1.15, 0, 0, 0.06);
    add2(new THREE.CapsuleGeometry(0.045, 0.78, 4, 8), 0.23, 1.15, 0, 0, -0.06);
    const eyeMat = track(new THREE.MeshBasicMaterial({ color: 0x9a9384 }));
    for (const x of [-0.035, 0.035]) {
      const e = new THREE.Mesh(track(new THREE.SphereGeometry(0.009, 6, 4)), eyeMat);
      e.position.set(x, 1.88, -0.1);
      figure.add(e);
    }
    figure.add(contact(0.7, 0.5, 0.5));
    figure.position.set(PROPS.silhouette.x, 0, PROPS.silhouette.z); // eyes at -z: it faces down the corridor
    props.add(figure);
  }

  // the way out (Exit 9 only): daylight at the end of the north connector
  const exitGlow = new THREE.Group();
  {
    const glow = new THREE.Mesh(track(new THREE.PlaneGeometry(W + 0.2, H + 0.2)), track(new THREE.MeshBasicMaterial({ color: 0xfff8ea, fog: false })));
    glow.rotation.y = -Math.PI / 2;
    glow.position.set(J1.x + 0.3, H / 2, L + W / 2);
    const signC = document.createElement("canvas");
    signC.width = 256;
    signC.height = 96;
    const x = signC.getContext("2d");
    x.fillStyle = "#0e5a2a";
    x.fillRect(0, 0, 256, 96);
    x.fillStyle = "#e8ffe9";
    x.font = "bold 56px Arial, sans-serif";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText("EXIT  →", 128, 50);
    const st = track(new THREE.CanvasTexture(signC));
    st.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(track(new THREE.PlaneGeometry(0.9, 0.34)), track(new THREE.MeshBasicMaterial({ map: st })));
    sign.rotation.y = -Math.PI / 2;
    sign.position.set(J1.x - 0.6, 2.55, L + W / 2);
    const gl = new THREE.PointLight(0xfff4e0, 0, 14, 1.6);
    gl.position.set(J1.x - 1.2, 1.8, L + W / 2);
    exitGlow.add(glow, sign, gl);
    exitGlow.userData.light = gl;
    props.add(exitGlow);
  }

  /* ---------------------------------------------------------------- ghost (prev exit / next entrance) */
  const ghost = new THREE.Group();
  const ghostPiece = sPiece.clone();
  const ghostMain = buildMainShell(true);
  // the two main-corridor lights nearest the visible end spill around the corner
  const ghostLights = [0, 1].map(() => {
    const l = new THREE.PointLight(LIGHT_COL, LIGHT_I, 11, 2);
    ghostMain.add(l);
    return l;
  });
  ghost.add(ghostPiece, ghostMain);
  scene.add(ghost);
  let ghostMode = "";
  const setGhost = (mode) => {
    if (mode === ghostMode) return;
    ghostMode = mode;
    ghost.visible = mode !== "off";
    if (mode === "next") {
      ghostPiece.rotation.y = 0;
      ghostPiece.position.set(T.x, 0, T.z);
      ghostMain.position.set(T.x, 0, T.z);
      ghostLights.forEach((l, i) => l.position.set(0, H - 0.55, PROPS.fixturesZ[i]));
    } else if (mode === "prev") {
      // the previous loop's north piece: rotate about the centre, shift by -T
      ghostPiece.rotation.y = Math.PI;
      ghostPiece.position.set(2 * CENTER.x - T.x, 0, 2 * CENTER.z - T.z);
      ghostMain.position.set(-T.x, 0, -T.z);
      ghostLights.forEach((l, i) => l.position.set(0, H - 0.55, PROPS.fixturesZ[PROPS.fixturesZ.length - 1 - i]));
    }
  };
  setGhost("prev");

  /* ---------------------------------------------------------------- loop state */
  let loop = { index: -1, anomaly: null, final: false, exit: 0 };
  let figureGone = false;
  const tileBase = new THREE.Color(0x6a665e), tileRed = new THREE.Color(0x6e0f12), tileTmp = new THREE.Color();
  const BASE_TIME = 3 * 3600 + 47 * 60 + 12; // the clock reads 3:47:12 when a loop begins

  function resetProps() {
    posters.forEach((p) => {
      p.group.visible = true;
      p.pic.material = posterMats[p.art];
    });
    missingRect.visible = false;
    flickerMat.color.copy(PANEL_COL);
    mainLights.forEach((l) => (l.intensity = LIGHT_I));
    extraFix.visible = false;
    extraLight.intensity = 0;
    bench.position.set(PROPS.bench.x, 0, PROPS.bench.z);
    bench.rotation.set(0, PROPS.bench.rot, 0);
    doors.forEach((d) => d.pivot.rotation.set(0, 0, 0));
    infoSign.material[0] = signMats.blue;
    leak.visible = false;
    shadow.visible = false;
    shadow.position.z = PROPS.shadow.z;
    shadow.scale.set(1, 1, 1);
    figure.visible = false;
    figureGone = false;
    tiles.visible = false;
    exitGlow.visible = false;
    exitGlow.userData.light.intensity = 0;
  }

  function applyAnomaly(id) {
    switch (id) {
      case "poster_missing":
        posters[1].group.visible = false;
        missingRect.visible = true;
        break;
      case "poster_changed":
        posters[2].pic.material = posterMats.seaside_wrong;
        break;
      case "bench":
        bench.position.set(PROPS.benchMoved.x, 0, PROPS.benchMoved.z);
        bench.rotation.set(0, PROPS.benchMoved.rot, 0);
        break;
      case "door":
        doors[1].pivot.rotation.y = -DOOR_AJAR;
        break;
      case "red_sign":
        infoSign.material[0] = signMats.red;
        break;
      case "leak":
        leak.visible = true;
        break;
      case "shadow":
        shadow.visible = true;
        break;
      case "extra_light":
        extraFix.visible = true;
        extraLight.intensity = LIGHT_I * 0.7;
        break;
      case "silhouette":
        figure.visible = true;
        break;
      case "floor":
        tiles.visible = true;
        break;
      default: // flicker + clock are pure animation
        break;
    }
  }

  function setLoop(next) {
    loop = { ...next };
    resetProps();
    if (loop.anomaly) applyAnomaly(loop.anomaly);
    if (loop.final) {
      exitGlow.visible = true;
      exitGlow.userData.light.intensity = 9;
    }
    exitSign.draw(loop.exit ?? 0, !!loop.final);
  }

  /** smooth "dip" envelope for the flicker: soft dimming, never a hard strobe */
  function flickerLevel(t) {
    // pseudo-random dips, at most ~2 per second, each a 0.18–0.4 s smooth trough
    const slot = Math.floor(t / 0.55);
    const r = (n) => {
      const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return s - Math.floor(s);
    };
    let lvl = 1;
    for (let k = slot - 1; k <= slot; k++) {
      if (r(k) < 0.35) continue;
      const start = k * 0.55 + r(k + 0.5) * 0.2, len = 0.18 + r(k + 0.25) * 0.22, depth = 0.45 + r(k + 0.75) * 0.25;
      const u = (t - start) / len;
      if (u > 0 && u < 1) lvl = Math.min(lvl, 1 - depth * Math.sin(u * Math.PI));
    }
    return lvl;
  }

  /** everything that moves; derived from (loop time, player position) only */
  function animate(lt, px, pz) {
    const a = loop.anomaly;
    // clock: ticks forward once a second; backward and smooth in the anomaly
    const secs = a === "clock" ? BASE_TIME - lt * 5 : BASE_TIME + Math.floor(lt);
    const s = ((secs % 60) + 60) % 60, m = (((secs / 60) % 60) + 60) % 60, h = (((secs / 3600) % 12) + 12) % 12;
    hands.s.rotation.x = -(s / 60) * Math.PI * 2;
    hands.m.rotation.x = -(m / 60) * Math.PI * 2;
    hands.h.rotation.x = -(h / 12) * Math.PI * 2;
    if (a === "flicker") {
      const f = flickerLevel(lt);
      flickerMat.color.copy(PANEL_COL).multiplyScalar(0.15 + 0.85 * f);
      mainLights[PROPS.flickerIndex].intensity = LIGHT_I * (0.3 + 0.7 * f);
    }
    if (a === "leak") {
      const { lx, ly, ring } = leak.userData;
      drips.forEach((d, i) => {
        const u = ((lt + i * 0.37) % 1.1) / 1.1;
        const fall = Math.min(1, u * 1.6);
        d.position.y = ly - 0.03 - (ly - 0.03) * fall * fall;
        d.visible = u < 0.62;
        d.position.x = lx;
      });
      const ru = (lt % 0.37) / 0.37;
      ring.scale.setScalar(1 + ru * 5);
      ring.material.opacity = 0.85;
    }
    if (a === "shadow") {
      // it leans toward you as you approach, slowly
      const near = Math.max(0, Math.min(1, 1 - (Math.abs(pz - PROPS.shadow.z) - 2) / 10));
      shadow.scale.set(1, 1 + near * 0.12 + Math.sin(lt * 0.8) * 0.02, 1 + near * 0.06);
      shadow.position.z = PROPS.shadow.z - near * 0.35;
    }
    if (a === "silhouette" && !figureGone) {
      const d = Math.hypot(px - PROPS.silhouette.x, pz - PROPS.silhouette.z);
      if (d < 10.5) {
        figureGone = true;
        figure.visible = false;
        onEvent?.({ type: "figureGone" });
      }
    }
    if (a === "floor") {
      let k = 0;
      for (let i = 0; i < tilesX; i++)
        for (let j = 0; j < tilesZ; j++) {
          const w = 0.55 + 0.45 * Math.sin(lt * 0.9 - (i * 0.7 + j * 0.9));
          tiles.setColorAt(k++, tileTmp.copy(tileBase).lerp(tileRed, w));
        }
      tiles.instanceColor.needsUpdate = true;
    }
    if (loop.final) exitGlow.userData.light.intensity = 9 + Math.sin(lt * 1.3) * 0.6;
  }

  let onEvent = null;
  let menuT = 0;
  const w0 = { w: 0, h: 0 };

  function render(g, dt) {
    if (g) {
      if (g.loop.index !== loop.index) setLoop(g.loop);
      const e = g.eye();
      camera.position.set(e.x, e.y, e.z);
      camera.rotation.set(g.player.pitch, g.player.yaw, 0);
      setGhost(g.loop.final && g.player.z > L / 2 ? "off" : g.player.z < L / 2 ? "prev" : "next");
      animate(g.loopTime, g.player.x, g.player.z);
    } else {
      // attract mode: a slow drift up the corridor
      menuT += dt;
      if (loop.index !== -2) setLoop({ index: -2, anomaly: null, final: false, exit: 0 });
      const u = (menuT * 0.25) % 20;
      camera.position.set(0.35 * Math.sin(menuT * 0.1), 1.6, 1.5 + u);
      camera.rotation.set(-0.03, Math.PI + Math.sin(menuT * 0.07) * 0.18, 0);
      setGhost("prev");
      animate(menuT, 0, -50);
    }
    renderer.render(scene, camera);
  }

  function resize(w, h) {
    if (!w || !h || (w === w0.w && h === w0.h)) return;
    w0.w = w;
    w0.h = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  /** a comparable fingerprint of every anomaly-relevant prop (tests) */
  function snapshot() {
    const r = (v) => Math.round(v * 1000) / 1000;
    const node = (o) => [o.visible, r(o.position.x), r(o.position.y), r(o.position.z), r(o.rotation.x), r(o.rotation.y), r(o.rotation.z), r(o.scale.x), r(o.scale.y), r(o.scale.z)].join(",");
    const colors = [];
    if (tiles.instanceColor) for (let i = 0; i < tiles.count; i++) colors.push(r(tiles.instanceColor.array[i * 3]));
    return {
      posters: posters.map((p) => `${node(p.group)}|${Object.keys(posterMats).find((k) => posterMats[k] === p.pic.material)}`),
      missing: node(missingRect),
      flicker: `${flickerMat.color.getHexString()}|${mainLights.map((l) => r(l.intensity)).join(",")}`,
      extra: `${node(extraFix)}|${r(extraLight.intensity)}`,
      bench: node(bench),
      doors: doors.map((d) => node(d.pivot)),
      sign: infoSign.material[0] === signMats.red ? "red" : "blue",
      leak: node(leak),
      shadow: node(shadow),
      figure: node(figure),
      tiles: `${tiles.visible}`,
      clock: [hands.s, hands.m, hands.h].map((h) => r(h.rotation.x)).join(","),
      exit: `${node(exitGlow)}|${r(exitGlow.userData.light.intensity)}`,
    };
  }

  function dispose() {
    renderer.dispose();
    disposables.forEach((d) => d.dispose?.());
    renderer.domElement.remove();
  }

  return {
    renderer, scene, camera, render, resize, dispose, setLoop, snapshot, animate,
    set onEvent(fn) {
      onEvent = fn;
    },
    get loop() {
      return loop;
    },
    flickerLevel,
  };
}
