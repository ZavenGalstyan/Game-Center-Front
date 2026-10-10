/**
 * Dimension Dash — boss models (original robot designs) + their attack
 * visuals: shockwave rings, sweeping laser beams, shield nodes and drones,
 * the glowing weak point and a hit flash. Owns every resource it creates.
 */
import * as THREE from "three";

export function createBossView(B, scene, { shadows }) {
  const own = [];
  const g = (x) => (own.push(x), x);
  const std = (color, o = {}) => g(new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.45, ...o }));
  const add = (color, o = {}) => g(new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, ...o }));
  const M = {
    hull: std("#d8342c"),
    hull2: std("#ffc53a"),
    dark: std("#2a2f42"),
    steel: std("#c9d0de", { metalness: 0.85, roughness: 0.2 }),
    glass: std("#7fe3ff", { transparent: true, opacity: 0.6, roughness: 0.05 }),
    sand: std("#d9a14e"),
    purple: std("#6b4bd8"),
    crystal: std("#8afff2", { emissive: "#2ab8ff", emissiveIntensity: 0.9, flatShading: true, transparent: true, opacity: 0.92 }),
    weak: std("#ff3b5c", { emissive: "#ff1040", emissiveIntensity: 1.2 }),
    flash: std("#ffffff", { emissive: "#ffffff", emissiveIntensity: 2 }),
    eye: std("#ffffff", { emissive: "#ffe14a", emissiveIntensity: 1.5 }),
    ring: add("#ffb02a", { opacity: 0.85 }),
    beam: add("#ff2a55", { opacity: 0.9 }),
    beamWarn: add("#ff2a55", { opacity: 0.18 }),
    marker: add("#ff3b5c", { opacity: 0.5 }),
  };
  const G = {
    sph: g(new THREE.SphereGeometry(1, 24, 16)),
    box: g(new THREE.BoxGeometry(1, 1, 1)),
    cyl: g(new THREE.CylinderGeometry(1, 1, 1, 20)),
    cone: g(new THREE.ConeGeometry(1, 1, 20)),
    oct: g(new THREE.OctahedronGeometry(1, 0)),
    tor: g(new THREE.TorusGeometry(1, 0.08, 6, 48)),
    beam: g(new THREE.BoxGeometry(0.22, 0.22, 1)),
    disc: g(new THREE.CircleGeometry(1, 32)),
  };
  const mesh = (geo, mat, parent, pos, scale, rot) => {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(...pos);
    if (scale) m.scale.set(...scale);
    if (rot) m.rotation.set(...rot);
    m.castShadow = shadows;
    parent.add(m);
    return m;
  };
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  scene.add(root);
  const parts = { mats: [] };
  const remember = (m) => (parts.mats.push(m), m);

  switch (B.kind) {
    case "drill": {
      remember(mesh(G.box, M.hull, body, [0, 1.1, 0], [3.2, 1.4, 2.6]));
      mesh(G.box, M.dark, body, [0, 0.35, 0], [3.6, 0.7, 2.9]);
      for (const s of [-1, 1]) mesh(G.cyl, M.dark, body, [0, 0.4, 1.35 * s], [0.45, 3.6, 0.45], [0, 0, Math.PI / 2]);
      parts.drill = new THREE.Group();
      parts.drill.position.set(0, 1.1, 1.6);
      body.add(parts.drill);
      mesh(G.cone, M.steel, parts.drill, [0, 0, 1.1], [0.95, 2.2, 0.95], [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 4; i++) mesh(G.box, M.hull2, parts.drill, [0, 0, 0.6 + i * 0.35], [1.3 - i * 0.25, 0.1, 0.1], [0, 0, (i * Math.PI) / 4]);
      parts.dome = mesh(G.sph, M.glass, body, [0, 2.2, -0.3], [0.9, 0.7, 0.9]);
      mesh(G.sph, M.dark, body, [0, 2.2, -0.3], [0.45, 0.45, 0.45]);
      for (const s of [-1, 1]) mesh(G.sph, M.eye, body, [0.18 * s, 2.3, 0.05], [0.1, 0.1, 0.06]);
      break;
    }
    case "scorpion": {
      remember(mesh(G.sph, M.sand, body, [0, 1.0, 0], [2.0, 0.9, 2.4]));
      mesh(G.sph, M.hull2, body, [0, 1.15, 1.6], [1.1, 0.7, 0.9]);
      for (const s of [-1, 1]) {
        mesh(G.sph, M.eye, body, [0.35 * s, 1.5, 2.3], [0.16, 0.16, 0.1]);
        // claws
        const arm = new THREE.Group();
        arm.position.set(1.4 * s, 1.0, 1.8);
        body.add(arm);
        mesh(G.cyl, M.sand, arm, [0.4 * s, 0, 0.6], [0.22, 1.4, 0.22], [Math.PI / 2, 0, 0.5 * s]);
        mesh(G.cone, M.hull2, arm, [0.8 * s, 0, 1.5], [0.4, 0.9, 0.25], [Math.PI / 2, 0, 0]);
        for (let k = 0; k < 3; k++) mesh(G.cyl, M.dark, body, [1.9 * s, 0.5, -0.6 + k * 0.9], [0.1, 1.2, 0.1], [0, 0, 0.9 * s]);
      }
      parts.tail = [];
      for (let k = 0; k < 6; k++) {
        const seg = mesh(G.sph, k === 5 ? M.weak : M.sand, root, [0, 0, 0], [0.5 - k * 0.04, 0.5 - k * 0.04, 0.5 - k * 0.04]);
        parts.tail.push(seg);
      }
      parts.marker = mesh(G.disc, M.marker, root, [0, 0, 0], [2.4, 2.4, 2.4], [-Math.PI / 2, 0, 0]);
      parts.marker.castShadow = false;
      break;
    }
    case "wing": {
      remember(mesh(G.sph, M.hull, body, [0, 0, 0], [1.4, 0.8, 2.0]));
      mesh(G.box, M.hull2, body, [0, 0, -0.2], [5.6, 0.18, 1.3]);
      mesh(G.box, M.dark, body, [0, 0.5, -1.7], [0.18, 1.0, 0.8]);
      parts.dome = mesh(G.sph, M.glass, body, [0, 0.6, 0.6], [0.7, 0.5, 0.8]);
      parts.props = [];
      for (const s of [-1, 1]) {
        mesh(G.cyl, M.dark, body, [2.6 * s, 0, 0], [0.35, 0.9, 0.35], [Math.PI / 2, 0, 0]);
        const pr = mesh(G.box, M.steel, body, [2.6 * s, 0, 0.5], [1.4, 0.06, 0.18]);
        parts.props.push(pr);
      }
      parts.drones = (B.drones || []).map(() => {
        const d = new THREE.Group();
        mesh(G.sph, M.hull2, d, [0, 0, 0], [0.5, 0.45, 0.5]);
        mesh(G.sph, M.eye, d, [0, 0.05, 0.42], [0.14, 0.14, 0.08]);
        const rot = mesh(G.box, M.steel, d, [0, 0.5, 0], [1.2, 0.04, 0.12]);
        d.userData.rot = rot;
        scene.add(d);
        return d;
      });
      break;
    }
    case "sentinel": {
      for (const s of [-1, 1]) {
        mesh(G.box, M.dark, body, [0.9 * s, 0.9, 0], [0.7, 1.8, 0.9]);
        mesh(G.box, M.steel, body, [0.9 * s, 0.15, 0.2], [0.9, 0.3, 1.3]);
        mesh(G.box, M.purple, body, [2.0 * s, 3.0, 0], [0.6, 2.0, 0.6]);
        mesh(G.sph, M.steel, body, [2.0 * s, 1.8, 0], [0.5, 0.5, 0.5]);
      }
      remember(mesh(G.box, M.purple, body, [0, 3.0, 0], [3.0, 2.2, 1.8]));
      mesh(G.box, M.dark, body, [0, 4.5, 0], [1.4, 1.0, 1.3]);
      mesh(G.box, M.eye, body, [0, 4.55, 0.66], [1.0, 0.18, 0.05]);
      parts.vents = [];
      for (const s of [-1, 1]) parts.vents.push(mesh(G.box, M.dark, body, [0.8 * s, 3.4, -0.95], [0.6, 0.8, 0.1]));
      parts.emitter = mesh(G.cyl, M.steel, body, [0, 4.9, 0], [0.3, 0.6, 0.3]);
      break;
    }
    case "core": {
      parts.crystal = remember(mesh(G.oct, M.crystal, body, [0, 0, 0], [1.4, 2.0, 1.4]));
      parts.halo = mesh(G.tor, M.ring, body, [0, 0, 0], [2.4, 2.4, 2.4], [Math.PI / 2, 0, 0]);
      parts.halo2 = mesh(G.tor, M.ring, body, [0, 0, 0], [2.0, 2.0, 2.0], [0, 0, 0]);
      parts.nodes = B.nodes.map(() => {
        const n = mesh(G.oct, M.purple, root, [0, 0, 0], [0.7, 0.9, 0.7]);
        return n;
      });
      break;
    }
    default:
  }
  // the weak point marker (pulsing glow sphere) — visible only while open
  const weakGlow = mesh(G.sph, add("#ffe14a", { opacity: 0.45 }), root, [0, 0, 0], [1, 1, 1]);
  weakGlow.castShadow = false;
  weakGlow.visible = false;

  // pools: shockwave rings + beams
  const ringPool = [];
  const beamPool = [];
  const ringGroup = new THREE.Group();
  scene.add(ringGroup);
  const getRing = (i) => {
    while (ringPool.length <= i) {
      const r = new THREE.Mesh(G.tor, M.ring);
      r.rotation.x = Math.PI / 2;
      ringGroup.add(r);
      ringPool.push(r);
    }
    return ringPool[i];
  };
  const getBeam = (i) => {
    while (beamPool.length <= i) {
      const b = new THREE.Mesh(G.beam, M.beam);
      ringGroup.add(b);
      beamPool.push(b);
    }
    return beamPool[i];
  };
  const baseMats = parts.mats.map((m) => m.material);

  function sync(Bs, t, dt) {
    const dead = Bs.defeated;
    root.visible = !(dead && Bs.deadT > 2.2);
    root.position.set(Bs.x, Bs.y, Bs.z);
    root.rotation.y = 0;
    body.rotation.y = Bs.facing;
    // hit flash
    const fl = Bs.flash > 0 && Math.floor(t * 24) % 2 === 0;
    parts.mats.forEach((m, i) => (m.material = fl ? M.flash : baseMats[i]));
    if (dead) {
      body.rotation.z = Math.sin(t * 30) * 0.05;
      body.position.y = -Math.min(1.5, Bs.deadT * 0.6);
    }
    switch (Bs.kind) {
      case "drill": {
        const st = Bs.state;
        parts.drill.rotation.z += dt * (st === "charge" ? 30 : st === "rev" ? 22 : 4);
        body.position.y = (Bs.hopY || 0) + (st === "rev" ? Math.sin(t * 50) * 0.05 : 0);
        body.rotation.x = st === "stuck" ? Math.sin(t * 8) * 0.04 + 0.08 : 0;
        break;
      }
      case "scorpion": {
        // tail: arc from the back of the body to the weak point
        const w = Bs.weak;
        const bx = Bs.x - Math.sin(Bs.facing) * 1.8;
        const bz = Bs.z - Math.cos(Bs.facing) * 1.8;
        parts.tail.forEach((seg, k) => {
          const u = (k + 1) / parts.tail.length;
          const x = bx + (w.x - bx) * u;
          const z = bz + (w.z - bz) * u;
          const y = Bs.y + 1.2 + (w.y - Bs.y - 1.2) * u + Math.sin(u * Math.PI) * 2.2;
          seg.position.set(x - Bs.x, y - Bs.y, z - Bs.z);
        });
        parts.marker.visible = Bs.state === "raise";
        if (parts.marker.visible) {
          parts.marker.position.set(Bs.tx - Bs.x, Bs.cy - Bs.y + 0.06, Bs.tz - Bs.z);
          parts.marker.material.opacity = 0.3 + Math.abs(Math.sin(t * 12)) * 0.4;
        }
        break;
      }
      case "wing":
        parts.props.forEach((p) => (p.rotation.y += dt * 30));
        body.rotation.z = Math.sin(t * 2) * 0.08;
        body.rotation.x = Bs.state === "swoop" ? 0.25 : Bs.state === "tired" ? -0.15 : 0;
        Bs.drones.forEach((d, i) => {
          const v = parts.drones[i];
          v.visible = !d.dead;
          v.position.set(d.x, d.y, d.z);
          v.userData.rot.rotation.y += dt * 30;
        });
        break;
      case "sentinel":
        parts.vents.forEach((v) => (v.material = Bs.state === "overheat" && Math.floor(t * 8) % 2 ? M.weak : M.dark));
        parts.emitter.rotation.y += dt * 4;
        break;
      case "core":
        parts.crystal.rotation.y += dt * (Bs.state === "exposed" || Bs.state === "dip" ? 0.5 : 2);
        parts.halo.rotation.z += dt * 1.5;
        parts.halo2.rotation.y += dt * 2.2;
        parts.halo.visible = parts.halo2.visible = !(Bs.state === "exposed" || Bs.state === "dip");
        parts.nodes.forEach((n, i) => {
          const nd = Bs.nodes[i];
          n.visible = !nd.dead && !dead;
          n.position.set(nd.x - Bs.x, nd.y - Bs.y, nd.z - Bs.z);
          n.rotation.y += dt * 3;
        });
        break;
      default:
    }
    const w = Bs.weak;
    weakGlow.visible = w.homable && !dead;
    if (weakGlow.visible) {
      weakGlow.position.set(w.x - Bs.x, w.y + w.hy - Bs.y, w.z - Bs.z);
      weakGlow.scale.setScalar(w.r * (0.9 + Math.sin(t * 10) * 0.12));
    }
    // shockwaves + beams
    let i = 0;
    for (const r of Bs.rings) {
      const m = getRing(i++);
      m.visible = true;
      m.position.set(r.x, r.y + 0.25, r.z);
      m.scale.set(r.r, r.r, 3.2);
      m.material.opacity = 0.9 * (1 - r.r / r.max);
    }
    for (; i < ringPool.length; i++) ringPool[i].visible = false;
    i = 0;
    for (const bm of Bs.beams) {
      const m = getBeam(i++);
      m.visible = true;
      m.material = bm.on ? M.beam : M.beamWarn;
      m.position.set(bm.x + Math.sin(bm.a) * bm.len * 0.5, bm.y + bm.h * 0.6, bm.z + Math.cos(bm.a) * bm.len * 0.5);
      m.rotation.set(0, bm.a, 0);
      m.scale.set(bm.on ? 1.4 : 0.8, bm.on ? 1.4 : 0.8, bm.len);
    }
    for (; i < beamPool.length; i++) beamPool[i].visible = false;
  }

  function onEvent(ev, fx) {
    if (ev.type === "bossBoom") fx.burst("explode", ev.x, ev.y, ev.z);
  }

  function dispose() {
    scene.remove(root, ringGroup);
    if (parts.drones) for (const d of parts.drones) scene.remove(d);
    for (const x of own) x.dispose();
  }

  return { sync, onEvent, dispose };
}
