/**
 * Dimension Dash — robot enemy models (original designs) + per-frame pose.
 *
 *   patrol  red ladybird crawler on a wheel, wobbling antenna
 *   fly     hover drone with a spinning rotor and a stinger
 *   shield  squat tank with a glowing front shield panel
 *   chaser  spiky roller with a single eye that flashes on alert
 *   turret  armoured base + swivel head; the core glows during wind-up
 */
import * as THREE from "three";

const G = {};
function geos() {
  if (G.ready) return G;
  G.ready = true;
  G.sph = new THREE.SphereGeometry(1, 20, 14);
  G.half = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  G.cyl = new THREE.CylinderGeometry(1, 1, 1, 16);
  G.cone = new THREE.ConeGeometry(1, 1, 10);
  G.box = new THREE.BoxGeometry(1, 1, 1);
  G.tor = new THREE.TorusGeometry(1, 0.25, 8, 20);
  return G;
}

function mats() {
  if (mats.m) return mats.m;
  const s = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.35, ...o });
  mats.m = {
    red: s("#e8352b"),
    yellow: s("#ffc93a"),
    blue: s("#2f6bff"),
    purple: s("#8a4dff"),
    steel: s("#c3cad8", { metalness: 0.8, roughness: 0.25 }),
    dark: s("#2a2f40", { metalness: 0.5 }),
    black: s("#14161e"),
    eye: s("#ffffff", { emissive: "#ffffff", emissiveIntensity: 0.4 }),
    pupil: s("#111111"),
    glowRed: s("#ff3048", { emissive: "#ff1030", emissiveIntensity: 1.2 }),
    glowCyan: s("#5ae8ff", { emissive: "#29c6ff", emissiveIntensity: 1, transparent: true, opacity: 0.75 }),
    rotor: new THREE.MeshBasicMaterial({ color: "#d8e6ff", transparent: true, opacity: 0.35, depthWrite: false }),
  };
  return mats.m;
}

export function makeEnemy(e, shadows) {
  const g = geos();
  const M = mats();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const mesh = (geo, mat, parent, pos, scale, rot) => {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(...pos);
    if (scale) m.scale.set(...scale);
    if (rot) m.rotation.set(...rot);
    m.castShadow = shadows;
    parent.add(m);
    return m;
  };
  const parts = {};
  const eyes = (parent, y, z, s = 1) => {
    for (const k of [-1, 1]) {
      mesh(g.sph, M.eye, parent, [0.16 * k * s, y, z], [0.12 * s, 0.14 * s, 0.08 * s]);
      mesh(g.sph, M.pupil, parent, [0.16 * k * s, y - 0.01, z + 0.06 * s], [0.05 * s, 0.07 * s, 0.03 * s]);
    }
  };
  switch (e.kind) {
    case "patrol": {
      mesh(g.half, M.red, body, [0, 0.42, -0.05], [0.62, 0.55, 0.72]);
      for (const [x, z] of [
        [0.25, 0.1],
        [-0.28, -0.15],
        [0.1, -0.4],
      ])
        mesh(g.sph, M.black, body, [x, 0.85, z], [0.12, 0.05, 0.12]);
      mesh(g.sph, M.dark, body, [0, 0.42, 0.5], [0.34, 0.3, 0.26]);
      eyes(body, 0.5, 0.68);
      parts.wheel = mesh(g.cyl, M.dark, body, [0, 0.22, 0.05], [0.22, 0.22, 0.22], [0, 0, Math.PI / 2]);
      const ant = new THREE.Group();
      ant.position.set(0, 0.9, 0.35);
      body.add(ant);
      mesh(g.cyl, M.steel, ant, [0, 0.18, 0], [0.025, 0.36, 0.025]);
      mesh(g.sph, M.yellow, ant, [0, 0.38, 0], [0.07, 0.07, 0.07]);
      parts.ant = ant;
      break;
    }
    case "fly": {
      mesh(g.sph, M.yellow, body, [0, 0, 0], [0.45, 0.4, 0.55]);
      for (let i = 0; i < 3; i++) mesh(g.tor, M.black, body, [0, 0, -0.12 + i * 0.16], [0.43, 0.39, 0.4]);
      mesh(g.cone, M.steel, body, [0, -0.1, -0.62], [0.12, 0.35, 0.12], [-Math.PI / 2 - 0.4, 0, 0]);
      eyes(body, 0.1, 0.45);
      const rot = new THREE.Group();
      rot.position.y = 0.52;
      body.add(rot);
      mesh(g.cyl, M.steel, rot, [0, -0.08, 0], [0.04, 0.2, 0.04]);
      mesh(g.cyl, M.rotor, rot, [0, 0.04, 0], [0.75, 0.02, 0.75]).castShadow = false;
      mesh(g.box, M.dark, rot, [0, 0.04, 0], [1.4, 0.03, 0.12]);
      parts.rotor = rot;
      break;
    }
    case "shield": {
      mesh(g.box, M.purple, body, [0, 0.55, 0], [0.9, 0.7, 0.9]);
      mesh(g.box, M.dark, body, [0, 0.16, 0], [1.05, 0.32, 1.05]);
      mesh(g.half, M.steel, body, [0, 0.9, 0], [0.38, 0.28, 0.38]);
      eyes(body, 0.66, 0.46, 1);
      const shield = mesh(g.box, M.glowCyan, body, [0, 0.62, 0.78], [1.45, 1.25, 0.1]);
      shield.castShadow = false;
      mesh(g.box, M.steel, body, [0, 0.62, 0.72], [1.55, 0.12, 0.12]);
      parts.shield = shield;
      break;
    }
    case "chaser": {
      mesh(g.sph, M.dark, body, [0, 0.62, 0], [0.55, 0.55, 0.55]);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        mesh(g.cone, M.steel, body, [Math.cos(a) * 0.5, 0.62 + Math.sin(a) * 0.5 * 0.4, Math.sin(a) * 0.5], [0.1, 0.3, 0.1], [Math.sin(a) * 1.4, 0, -Math.cos(a) * 1.4]);
      }
      parts.eye = mesh(g.sph, M.eye, body, [0, 0.72, 0.48], [0.2, 0.2, 0.1]);
      mesh(g.sph, M.pupil, body, [0, 0.72, 0.56], [0.08, 0.08, 0.04]);
      for (const k of [-1, 1]) mesh(g.box, M.black, body, [0.42 * k, 0.18, 0], [0.22, 0.36, 0.9]);
      break;
    }
    case "turret": {
      mesh(g.cyl, M.dark, body, [0, 0.3, 0], [0.75, 0.6, 0.75]);
      const head = new THREE.Group();
      head.position.y = 0.8;
      body.add(head);
      mesh(g.sph, M.steel, head, [0, 0, 0], [0.55, 0.45, 0.55]);
      mesh(g.cyl, M.dark, head, [0, 0.05, 0.55], [0.13, 0.7, 0.13], [Math.PI / 2, 0, 0]);
      parts.core = mesh(g.sph, M.glowRed.clone(), head, [0, 0.05, 0.92], [0.12, 0.12, 0.12]);
      eyes(head, 0.22, 0.4, 0.8);
      parts.head = head;
      break;
    }
    default:
      mesh(g.sph, M.red, body, [0, 0.5, 0], [0.5, 0.5, 0.5]);
  }
  return { root, body, parts, kind: e.kind };
}

export function poseEnemy(v, e, t, dt) {
  const { root, body, parts } = v;
  if (e.dead) {
    root.visible = false;
    return;
  }
  root.visible = true;
  root.position.set(e.x, e.y, e.z);
  root.rotation.y = e.facing;
  const flash = e.flash > 0 && Math.floor(t * 30) % 2 === 0;
  body.visible = !flash;
  switch (v.kind) {
    case "patrol":
      body.rotation.z = Math.sin(t * 9 + e.bob) * 0.06;
      if (parts.wheel) parts.wheel.rotation.x += dt * 8;
      if (parts.ant) parts.ant.rotation.x = Math.sin(t * 7) * 0.3;
      if (e.state === "turn") body.rotation.y = Math.sin(e.t * 18) * 0.15;
      else body.rotation.y = 0;
      break;
    case "fly":
      if (parts.rotor) parts.rotor.rotation.y += dt * 40;
      body.rotation.x = Math.sin(t * 2) * 0.1;
      break;
    case "shield":
      if (parts.shield) parts.shield.material.opacity = 0.6 + Math.sin(t * 6) * 0.15;
      break;
    case "chaser": {
      const alert = e.state === "alert";
      body.position.y = alert ? Math.abs(Math.sin(t * 25)) * 0.15 : 0;
      if (parts.eye) parts.eye.material = alert || e.state === "chase" ? mats().glowRed : mats().eye;
      if (e.state === "chase") body.rotation.x += dt * 10;
      else body.rotation.x = 0;
      break;
    }
    case "turret":
      if (parts.core) {
        const k = e.state === "charge" ? e.charge : 0;
        parts.core.scale.setScalar(0.12 + k * 0.14);
        parts.core.material.emissiveIntensity = 0.8 + k * 3 + (k > 0 ? Math.sin(t * 40) * 0.6 : 0);
      }
      break;
    default:
      break;
  }
}
