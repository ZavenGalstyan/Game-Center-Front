/**
 * Mario Adventure 3D — pooled particle effects.
 *
 * Two InstancedMesh pools, allocated once per level and never grown:
 *   puffs   soft lit spheres (dust, smoke, splash, snow)
 *   sparks  unlit bright octahedra (coin glints, stomp stars, power auras,
 *           fireworks, lava embers)
 * burst(kind, x, y, z) spawns a preset; update(dt) advances and writes the
 * instance matrices. Dead particles are parked at scale 0.
 */
import * as THREE from "three";

const MAX_PUFF = 220;
const MAX_SPARK = 360;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export function createEffects(scene, opts = {}) {
  const puffGeo = new THREE.IcosahedronGeometry(1, 1);
  const puffMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, transparent: true, opacity: 0.85, depthWrite: false });
  const puffs = new THREE.InstancedMesh(puffGeo, puffMat, MAX_PUFF);
  const sparkGeo = new THREE.OctahedronGeometry(1, 0);
  const sparkMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.95, depthWrite: false });
  const sparks = new THREE.InstancedMesh(sparkGeo, sparkMat, MAX_SPARK);
  for (const im of [puffs, sparks]) {
    im.frustumCulled = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < im.count; i++) {
      _m.makeScale(0, 0, 0);
      im.setMatrixAt(i, _m);
      im.setColorAt(i, _c.set("#ffffff"));
    }
    scene.add(im);
  }
  const P = [];
  const S = [];
  for (let i = 0; i < MAX_PUFF; i++) P.push({ life: 0 });
  for (let i = 0; i < MAX_SPARK; i++) S.push({ life: 0 });
  let pi = 0;
  let si = 0;
  const reduced = () => (opts.reduced ? opts.reduced() : false);

  function puff(x, y, z, vx, vy, vz, size, life, color, grow = 1.6, grav = 0) {
    const i = pi;
    const p = P[pi];
    pi = (pi + 1) % MAX_PUFF;
    Object.assign(p, { x, y, z, vx, vy, vz, size, life, max: life, grow, grav, rot: Math.random() * 6 });
    puffs.setColorAt(i, _c.set(color));
    puffs.instanceColor.needsUpdate = true;
  }
  function spark(x, y, z, vx, vy, vz, size, life, color, grav = 0, spin = 6) {
    const i = si;
    const s = S[si];
    si = (si + 1) % MAX_SPARK;
    Object.assign(s, { x, y, z, vx, vy, vz, size, life, max: life, grav, rot: Math.random() * 6, spin });
    sparks.setColorAt(i, _c.set(color));
    sparks.instanceColor.needsUpdate = true;
  }
  const R = (a = 1) => (Math.random() * 2 - 1) * a;

  const fx = {
    burst(kind, x, y, z, o = {}) {
      const k = reduced() ? 0.5 : 1;
      switch (kind) {
        case "coin":
          for (let i = 0; i < 8 * k; i++) spark(x, y, z, R(2.5), 2 + Math.random() * 3, R(2.5), 0.08, 0.45, i % 2 ? "#fff3a0" : "#ffd21f", 6);
          break;
        case "dust": {
          const n = (o.n ?? 6) * k;
          const col = o.color || "#f4efe6";
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            puff(x + Math.cos(a) * 0.3, y + 0.1, z + Math.sin(a) * 0.3, Math.cos(a) * (o.spd ?? 2.2), 0.6 + Math.random() * 0.6, Math.sin(a) * (o.spd ?? 2.2), o.size ?? 0.18, 0.45, col);
          }
          break;
        }
        case "step":
          puff(x + R(0.15), y + 0.05, z + R(0.15), R(0.4), 0.6, R(0.4), 0.11, 0.35, o.color || "#f4efe6");
          break;
        case "stomp":
          for (let i = 0; i < 10 * k; i++) {
            const a = (i / 10) * Math.PI * 2;
            spark(x, y, z, Math.cos(a) * 5, 1 + Math.random() * 2, Math.sin(a) * 5, 0.12, 0.42, i % 2 ? "#ffffff" : "#ffe14a", 4);
          }
          for (let i = 0; i < 6 * k; i++) puff(x + R(0.4), y, z + R(0.4), R(1.5), 1.2, R(1.5), 0.25, 0.5, "#ffffff");
          break;
        case "poof":
          for (let i = 0; i < 9 * k; i++) puff(x + R(0.4), y + Math.random() * 0.6, z + R(0.4), R(1.8), 1 + Math.random() * 1.5, R(1.8), 0.3, 0.6, o.color || "#ffffff");
          break;
        case "block":
          for (let i = 0; i < 6 * k; i++) spark(x + R(0.5), y + 0.6, z + R(0.5), R(2), 3 + Math.random() * 2, R(2), 0.09, 0.4, "#fff3a0", 8);
          break;
        case "splash":
          for (let i = 0; i < 16 * k; i++) {
            const a = Math.random() * Math.PI * 2;
            puff(x + Math.cos(a) * 0.5, y, z + Math.sin(a) * 0.5, Math.cos(a) * 2.5, 5 + Math.random() * 4, Math.sin(a) * 2.5, 0.2, 0.7, o.color || "#d8f4ff", 0.6, 16);
          }
          break;
        case "fire":
          for (let i = 0; i < 12 * k; i++) puff(x + R(0.5), y + Math.random() * 0.5, z + R(0.5), R(1.5), 2 + Math.random() * 3, R(1.5), 0.24, 0.55, i % 2 ? "#ff7a1f" : "#ffcf3a");
          for (let i = 0; i < 8 * k; i++) spark(x, y + 0.5, z, R(3), 3 + Math.random() * 4, R(3), 0.07, 0.6, "#ffb02e", 9);
          break;
        case "hurt":
          for (let i = 0; i < 10 * k; i++) spark(x, y + 1, z, R(4), 2 + Math.random() * 3, R(4), 0.1, 0.45, i % 2 ? "#ffffff" : "#ff5a5a", 6);
          break;
        case "powerup": {
          const col = o.color || "#ffffff";
          for (let i = 0; i < 24 * k; i++) {
            const a = (i / 24) * Math.PI * 2;
            spark(x, y, z, Math.cos(a) * 4, R(1) + 2, Math.sin(a) * 4, 0.11, 0.7, i % 3 ? col : "#ffffff", 2);
          }
          break;
        }
        case "checkpoint":
          for (let i = 0; i < 30 * k; i++) spark(x + R(0.3), y + 2.6, z + R(0.3), R(3), 2 + Math.random() * 4, R(3), 0.1, 0.9, ["#e3262b", "#ffffff", "#ffd23a"][i % 3], 6);
          break;
        case "star":
          for (let i = 0; i < 40 * k; i++) spark(x, y, z, R(6), R(6), R(6), 0.13, 1.0, i % 2 ? "#fff3a0" : "#ffd21f", 0);
          break;
        case "firework":
          for (let i = 0; i < 46 * k; i++) {
            const th = Math.random() * Math.PI * 2;
            const ph = Math.acos(R(1));
            const sp = 7 + Math.random() * 2;
            spark(x, y, z, Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp, Math.sin(ph) * Math.sin(th) * sp, 0.12, 1.1, o.color || "#ffd21f", 5);
          }
          break;
        case "aura":
          spark(x + R(0.5), y + Math.random() * 1.4, z + R(0.5), R(0.4), 1 + Math.random(), R(0.4), 0.07, 0.6, o.color || "#ffffff", 0);
          break;
        case "trail":
          puff(x + R(0.2), y + 0.4 + Math.random() * 0.6, z + R(0.2), 0, 0.2, 0, 0.15, 0.35, o.color || "#8fd8ff", 0.4);
          break;
        case "ember":
          spark(x, y, z, R(0.6), 1.5 + Math.random() * 2, R(0.6), 0.07, 1.4, Math.random() > 0.5 ? "#ff7a1f" : "#ffb02e", -0.4, 3);
          break;
        case "snow":
          spark(x, y, z, R(0.6), -1 - Math.random(), R(0.6), 0.06, 4, "#ffffff", 0, 1);
          break;
        case "break":
          for (let i = 0; i < 10 * k; i++) puff(x + R(0.3), y, z + R(0.3), R(3), 2 + Math.random() * 3, R(3), 0.16, 0.6, o.color || "#d8f2ff", 1, 14);
          break;
        case "shock":
          for (let i = 0; i < 18 * k; i++) {
            const a = (i / 18) * Math.PI * 2;
            puff(x + Math.cos(a) * 1.5, y + 0.2, z + Math.sin(a) * 1.5, Math.cos(a) * 6, 0.5, Math.sin(a) * 6, 0.35, 0.6, o.color || "#e8dcc8");
          }
          break;
        default:
      }
    },
    update(dt) {
      for (let i = 0; i < MAX_PUFF; i++) {
        const p = P[i];
        if (p.life <= 0) {
          if (p.max) {
            p.max = 0;
            _m.makeScale(0, 0, 0);
            puffs.setMatrixAt(i, _m);
          }
          continue;
        }
        p.life -= dt;
        p.vy -= p.grav * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vx *= 1 - 3 * dt;
        p.vz *= 1 - 3 * dt;
        const k = 1 - p.life / p.max;
        const s = p.life > 0 ? p.size * (1 + k * p.grow) * (k > 0.6 ? (1 - k) / 0.4 : 1) : 0;
        _p.set(p.x, p.y, p.z);
        _q.setFromEuler(_e.set(p.rot, p.rot * 0.7, 0));
        _s.set(s, s, s);
        _m.compose(_p, _q, _s);
        puffs.setMatrixAt(i, _m);
      }
      for (let i = 0; i < MAX_SPARK; i++) {
        const p = S[i];
        if (p.life <= 0) {
          if (p.max) {
            p.max = 0;
            _m.makeScale(0, 0, 0);
            sparks.setMatrixAt(i, _m);
          }
          continue;
        }
        p.life -= dt;
        p.vy -= p.grav * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vx *= 1 - 1.5 * dt;
        p.vz *= 1 - 1.5 * dt;
        p.rot += p.spin * dt;
        const k = p.life / p.max;
        const s = p.life > 0 ? p.size * Math.min(1, k * 2.5) : 0;
        _p.set(p.x, p.y, p.z);
        _q.setFromEuler(_e.set(p.rot, p.rot * 1.3, 0));
        _s.set(s, s, s);
        _m.compose(_p, _q, _s);
        sparks.setMatrixAt(i, _m);
      }
      puffs.instanceMatrix.needsUpdate = true;
      sparks.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      scene.remove(puffs, sparks);
      puffGeo.dispose();
      puffMat.dispose();
      sparkGeo.dispose();
      sparkMat.dispose();
      puffs.dispose();
      sparks.dispose();
    },
  };
  return fx;
}

/** soft round shadow decal that sits on the ground under Mario */
export function createBlobShadow() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, "rgba(0,0,0,0.55)");
  gr.addColorStop(0.6, "rgba(0,0,0,0.3)");
  gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  return {
    mesh,
    place(x, y, z, height) {
      mesh.visible = Number.isFinite(y) && height < 40;
      if (!mesh.visible) return;
      const s = Math.max(0.35, 1.25 - height * 0.07);
      mesh.position.set(x, y + 0.04, z);
      mesh.scale.set(s, 1, s);
      mat.opacity = Math.max(0.25, 1 - height * 0.05);
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      tex.dispose();
    },
  };
}
