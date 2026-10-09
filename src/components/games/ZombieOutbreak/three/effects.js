/**
 * Zombie Outbreak — pooled world effects. Nothing here allocates per shot:
 * particles live in two instanced meshes, tracers / decals / flashes /
 * telegraphs / projectile and pickup visuals are fixed pools reused in turn.
 *
 *   handle(events)    react to engine events (impacts, hits, explosions…)
 *   update(dt, game)  advance particles, mirror engine hazards / projectiles /
 *                     pickups into their visuals
 */
import * as THREE from "three";
import * as T from "./textures.js";

const MAX_ADD = 420;
const MAX_ALPHA = 260;
const TRACERS = 18;
const HOLES = 90;
const SPLATS = 28;
const FLASHES = 6;
const HAZ = 28;
const PROJ = 40;

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const Z1 = new THREE.Vector3(0, 0, 1);

const COLORS = new Map();
function colorOf(c) {
  let v = COLORS.get(c);
  if (!v) {
    v = new THREE.Color(c);
    COLORS.set(c, v);
  }
  return v;
}

const PICKUP_COLORS = { health: "#ff4a4a", ammo: "#ffd24a", armor: "#4ab8ff", boost: "#ff7a1a" };

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.t = 0;

    // ------------------------------------------------ particles
    const quad = new THREE.PlaneGeometry(1, 1);
    this.addMesh = new THREE.InstancedMesh(
      quad,
      new THREE.MeshBasicMaterial({ map: T.groundGlowTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
      MAX_ADD,
    );
    this.alphaMesh = new THREE.InstancedMesh(
      quad,
      new THREE.MeshBasicMaterial({ map: T.smokeTex(), transparent: true, depthWrite: false, opacity: 1 }),
      MAX_ALPHA,
    );
    for (const m of [this.addMesh, this.alphaMesh]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      m.setColorAt(0, tmpC.set(1, 1, 1));
      this.root.add(m);
    }
    this.add = [];
    this.alpha = [];

    // ------------------------------------------------ tracers
    const trGeo = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
    this.tracers = Array.from({ length: TRACERS }, () => {
      const m = new THREE.Mesh(trGeo, new THREE.MeshBasicMaterial({ color: "#ffe6a0", transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      m.frustumCulled = false;
      this.root.add(m);
      return { m, life: 0 };
    });
    this.trI = 0;

    // ------------------------------------------------ decals
    const holeMat = new THREE.MeshBasicMaterial({ map: T.decalTex("hole"), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, color: "#ffffff" });
    this.holes = Array.from({ length: HOLES }, () => {
      const m = new THREE.Mesh(quad, holeMat);
      m.visible = false;
      this.root.add(m);
      return m;
    });
    this.holeI = 0;
    const splatMat = new THREE.MeshStandardMaterial({ color: "#2a0806", alphaMap: T.decalTex("splat"), transparent: true, depthWrite: false, roughness: 0.25, polygonOffset: true, polygonOffsetFactor: -3 });
    this.splats = Array.from({ length: SPLATS }, () => {
      const m = new THREE.Mesh(quad, splatMat);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      this.root.add(m);
      return m;
    });
    this.splatI = 0;

    // ------------------------------------------------ explosion flashes
    const sph = new THREE.SphereGeometry(1, 16, 12);
    this.flashes = Array.from({ length: FLASHES }, () => {
      const m = new THREE.Mesh(sph, new THREE.MeshBasicMaterial({ color: "#ffb04a", transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      this.root.add(m);
      return { m, life: 0, max: 0.35, r: 1 };
    });
    this.flashI = 0;
    // One shared light for explosions / slams (constant light count = no shader recompiles).
    this.fxLight = new THREE.PointLight("#ff9a4a", 0, 18, 2);
    this.fxLight.position.set(0, -50, 0);
    this.root.add(this.fxLight);
    this.fxLightT = 0;

    // ------------------------------------------------ hazards
    const ringMat = (c) => new THREE.MeshBasicMaterial({ color: c, map: T.ringTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
    const discGeo = new THREE.CircleGeometry(1, 40);
    this.haz = Array.from({ length: HAZ }, () => {
      const ring = new THREE.Mesh(discGeo, ringMat("#ff3020"));
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      const line = new THREE.Mesh(quad, new THREE.MeshBasicMaterial({ color: "#ff3020", transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      line.visible = false;
      this.root.add(ring, line);
      return { ring, line, id: -1 };
    });

    // ------------------------------------------------ projectiles
    this.proj = Array.from({ length: PROJ }, () => {
      const m = new THREE.Mesh(sph, new THREE.MeshBasicMaterial({ color: "#8aff3a" }));
      const halo = new THREE.Mesh(quad, new THREE.MeshBasicMaterial({ color: "#6aff2a", map: T.groundGlowTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = halo.visible = false;
      this.root.add(m, halo);
      return { m, halo, trail: 0 };
    });

    // ------------------------------------------------ pickups
    this.pickupVis = new Map();
    this.pickupProto = {};

    // ------------------------------------------------ spawn markers
    this.markers = Array.from({ length: 10 }, () => {
      const m = new THREE.Mesh(quad, new THREE.MeshBasicMaterial({ color: "#ff2a1a", map: T.groundGlowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      this.root.add(m);
      return { m, life: 0 };
    });
    this.markerI = 0;

    // ------------------------------------------------ rain
    this.rain = null;
  }

  enableRain(center, size) {
    const n = 1400;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 6);
    this.rainData = { n, pos, cx: center[0], cz: center[1], size };
    for (let i = 0; i < n; i++) this.resetDrop(i, true);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: "#9fb4cf", transparent: true, opacity: 0.35, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.root.add(this.rain);
  }

  resetDrop(i, any) {
    const d = this.rainData;
    const x = d.cx + (Math.random() - 0.5) * d.size;
    const z = d.cz + (Math.random() - 0.5) * d.size;
    const y = any ? Math.random() * 22 : 22;
    d.pos.set([x, y, z, x + 0.05, y + 0.6, z + 0.02], i * 6);
  }

  // ---------------------------------------------------------------- spawners
  particle(additive, x, y, z, vx, vy, vz, life, size, grow, color, gravity = 0, drag = 0) {
    const list = additive ? this.add : this.alpha;
    const max = additive ? MAX_ADD : MAX_ALPHA;
    if (list.length >= max) list.shift();
    list.push({ x, y, z, vx, vy, vz, life, max: life, size, grow, color: colorOf(color), gravity, drag });
  }

  sparks(x, y, z, nx, ny, nz, n = 8, color = "#ffd68a") {
    for (let i = 0; i < n; i++) {
      const s = 2 + Math.random() * 5;
      this.particle(true, x, y, z, nx * s + (Math.random() - 0.5) * 4, ny * s + Math.random() * 3, nz * s + (Math.random() - 0.5) * 4, 0.12 + Math.random() * 0.2, 0.05 + Math.random() * 0.05, -0.1, color, 12, 1);
    }
    this.particle(true, x + nx * 0.02, y + ny * 0.02, z + nz * 0.02, 0, 0, 0, 0.06, 0.35, 1, "#ffcf7a");
  }

  dust(x, y, z, nx, ny, nz, n = 4, color = "#8a8478", size = 0.3) {
    for (let i = 0; i < n; i++) {
      const s = 0.5 + Math.random() * 1.5;
      this.particle(false, x, y, z, nx * s + (Math.random() - 0.5), ny * s + Math.random() * 0.6, nz * s + (Math.random() - 0.5), 0.5 + Math.random() * 0.5, size, 1.4, color, -0.3, 2);
    }
  }

  blood(x, y, z, dx, dz, n = 6, color = "#5a0a08", toxic = false) {
    for (let i = 0; i < n; i++) {
      const s = 1 + Math.random() * 3;
      this.particle(false, x, y, z, dx * s + (Math.random() - 0.5) * 2, Math.random() * 2.5, dz * s + (Math.random() - 0.5) * 2, 0.35 + Math.random() * 0.3, 0.08 + Math.random() * 0.08, 0.6, color, 9, 0.5);
    }
    this.particle(false, x, y, z, dx * 0.5, 0.3, dz * 0.5, 0.3, 0.3, 1.8, toxic ? "#3a6a1a" : "#3a0605", 0, 3);
  }

  explosion(x, y, z, r, color = "#ffb04a") {
    const f = this.flashes[this.flashI++ % FLASHES];
    f.m.position.set(x, y, z);
    f.life = f.max = 0.4;
    f.r = r;
    f.m.material.color.set(color);
    f.m.visible = true;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 1.2;
      const s = 3 + Math.random() * 7;
      this.particle(true, x, y, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s, Math.sin(a) * Math.cos(e) * s, 0.25 + Math.random() * 0.3, 0.12, -0.2, i % 2 ? "#ffcf6a" : "#ff6a1a", 9, 1.5);
    }
    for (let i = 0; i < 12; i++) this.particle(false, x + (Math.random() - 0.5) * r * 0.6, y, z + (Math.random() - 0.5) * r * 0.6, (Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2, 1.2 + Math.random() * 0.8, 0.9, 2.2, "#3a3530", -0.4, 1.2);
    this.fxLight.position.set(x, y + 1, z);
    this.fxLight.color.set(color);
    this.fxLightT = 0.3;
  }

  tracer(ax, ay, az, bx, by, bz, color = "#ffe6a0", width = 0.012) {
    const tr = this.tracers[this.trI++ % TRACERS];
    const m = tr.m;
    tmpV.set(bx - ax, by - ay, bz - az);
    const len = tmpV.length();
    if (len < 0.5) return;
    // Show only the far part of the path so it reads as a streak, not a beam.
    const start = Math.min(len * 0.25, 1.5);
    tmpV.normalize();
    m.position.set(ax + tmpV.x * (start + len) * 0.5, ay + tmpV.y * (start + len) * 0.5, az + tmpV.z * (start + len) * 0.5);
    m.quaternion.setFromUnitVectors(UP, tmpV);
    m.scale.set(width, len - start, width);
    m.material.color.set(color);
    m.material.opacity = 0.75;
    m.visible = true;
    tr.life = 0.06;
  }

  hole(x, y, z, nx, ny, nz) {
    const m = this.holes[this.holeI++ % HOLES];
    m.position.set(x + nx * 0.01, y + ny * 0.01, z + nz * 0.01);
    tmpV.set(x + nx, y + ny, z + nz);
    m.lookAt(tmpV);
    m.rotateZ(Math.random() * 6.28);
    const s = 0.12 + Math.random() * 0.06;
    m.scale.set(s, s, 1);
    m.visible = true;
  }

  splat(x, z, s = 1, toxic = false) {
    const m = this.splats[this.splatI++ % SPLATS];
    m.position.set(x, 0.02 + (this.splatI % 7) * 0.001, z);
    m.rotation.z = Math.random() * 6.28;
    m.scale.set(1.3 * s, 1.3 * s, 1);
    m.material.color.set(toxic ? "#1f3a0e" : "#2a0806");
    m.visible = true;
  }

  marker(x, z, color = "#ff2a1a") {
    const mk = this.markers[this.markerI++ % this.markers.length];
    mk.m.position.set(x, 0.04, z);
    mk.m.material.color.set(color);
    mk.life = 1.3;
    mk.m.visible = true;
  }

  // ---------------------------------------------------------------- events
  handle(events, game) {
    for (const e of events) {
      switch (e.type) {
        case "impact": {
          const sc = e.surface === "metal" ? "#ffe2a0" : e.surface === "glass" ? "#cfe8ff" : "#ffcf8a";
          if (e.surface === "metal" || e.surface === "glass") this.sparks(e.x, e.y, e.z, e.nx, e.ny, e.nz, 9, sc);
          else this.sparks(e.x, e.y, e.z, e.nx, e.ny, e.nz, 4, sc);
          const dc = e.surface === "wood" ? "#7a5a36" : e.surface === "dirt" ? "#6a5a40" : "#8a8478";
          this.dust(e.x, e.y, e.z, e.nx, e.ny, e.nz, e.surface === "metal" ? 2 : 5, dc, 0.22);
          if (e.ny < 0.5 || e.ny > 0.9) this.hole(e.x, e.y, e.z, e.nx, e.ny, e.nz);
          break;
        }
        case "zhit": {
          const p = game.player;
          const dx = e.x - p.x;
          const dz = e.z - p.z;
          const l = Math.hypot(dx, dz) || 1;
          const toxic = e.ztype === "spitter" || e.ztype === "toxicGiant";
          this.blood(e.x, e.y, e.z, dx / l, dz / l, e.zone === 0 ? 9 : 5, toxic ? "#3a6a1a" : "#4a0806", toxic);
          if (e.zone === 0) this.particle(true, e.x, e.y, e.z, 0, 0, 0, 0.08, 0.25, 1, "#ffffff");
          break;
        }
        case "kill": {
          if (!e.self || e.points === 0) {
            const z = game.zombies.find((q) => q.id === e.id);
            if (z) this.splat(z.x + Math.sin(z.yaw) * (z.variant.fallFwd ? 0.9 : -0.9), z.z + Math.cos(z.yaw) * (z.variant.fallFwd ? 0.9 : -0.9), z.boss ? 2.4 : 1, z.type === "spitter");
          }
          break;
        }
        case "explode":
          this.explosion(e.x, e.y, e.z, e.r);
          this.splat(e.x, e.z, 1.6);
          break;
        case "blast":
          this.explosion(e.x, e.y, e.z, e.r * 0.7, "#5ad8ff");
          break;
        case "splat": {
          for (let i = 0; i < 10; i++) this.particle(true, e.x, e.y, e.z, (Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4, 0.35, 0.12, 0.5, "#7aff3a", 9, 0.5);
          this.particle(false, e.x, e.y, e.z, 0, 0.5, 0, 0.8, 0.6, 2, "#3a7a1a", 0, 2);
          if (e.y < 0.3 && !e.onPlayer) this.splat(e.x, e.z, e.kind === "glob" ? 1.6 : 0.7, true);
          break;
        }
        case "burst":
          for (let i = 0; i < 24; i++) this.particle(true, e.x + (Math.random() - 0.5) * e.r, 0.2, e.z + (Math.random() - 0.5) * e.r, (Math.random() - 0.5) * 2, 3 + Math.random() * 5, (Math.random() - 0.5) * 2, 0.6, 0.25, 0.6, "#8aff3a", 6, 0.5);
          this.fxLight.position.set(e.x, 1, e.z);
          this.fxLight.color.set("#6aff3a");
          this.fxLightT = 0.25;
          break;
        case "slam":
          for (let i = 0; i < 22; i++) {
            const a = (i / 22) * Math.PI * 2;
            this.particle(false, e.x + Math.cos(a) * e.r * 0.6, 0.15, e.z + Math.sin(a) * e.r * 0.6, Math.cos(a) * 3, 0.8 + Math.random(), Math.sin(a) * 3, 0.9, 0.7, 1.6, "#6d665a", -0.2, 2.5);
          }
          break;
        case "spawn":
          if (!e.relocated) {
            this.marker(e.x, e.z);
            this.dust(e.x, 0.2, e.z, 0, 1, 0, 6, "#5a554c", 0.5);
          }
          break;
        case "boss_spawn":
          this.marker(e.x, e.z, "#ff6a1a");
          for (let i = 0; i < 20; i++) this.dust(e.x + (Math.random() - 0.5) * 3, 0.2, e.z + (Math.random() - 0.5) * 3, 0, 1, 0, 1, "#4a453c", 1.0);
          break;
        default:
          break;
      }
    }
  }

  // ---------------------------------------------------------------- per frame
  update(dt, game, camera) {
    this.t += dt;
    const q = camera.quaternion;
    // Particles.
    for (const [list, mesh] of [
      [this.add, this.addMesh],
      [this.alpha, this.alphaMesh],
    ]) {
      let n = 0;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.life -= dt;
        if (p.life <= 0) {
          list.splice(i, 1);
          continue;
        }
        p.vy -= p.gravity * dt;
        const dr = Math.exp(-p.drag * dt);
        p.vx *= dr;
        p.vy *= dr;
        p.vz *= dr;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.y < 0.02) {
          p.y = 0.02;
          p.vy *= -0.2;
          p.vx *= 0.6;
          p.vz *= 0.6;
        }
        const k = p.life / p.max;
        const s = Math.max(0.001, p.size * (1 + p.grow * (1 - k)));
        tmpS.set(s, s, s);
        tmpV.set(p.x, p.y, p.z);
        tmpM.compose(tmpV, q, tmpS);
        mesh.setMatrixAt(n, tmpM);
        tmpC.copy(p.color).multiplyScalar(mesh === this.addMesh ? k : 0.4 + 0.6 * k);
        mesh.setColorAt(n, tmpC);
        n++;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.alphaMesh.material.opacity = 0.85;

    for (const tr of this.tracers) {
      if (!tr.m.visible) continue;
      tr.life -= dt;
      tr.m.material.opacity = Math.max(0, tr.life / 0.06) * 0.75;
      if (tr.life <= 0) tr.m.visible = false;
    }
    for (const f of this.flashes) {
      if (!f.m.visible) continue;
      f.life -= dt;
      const k = 1 - f.life / f.max;
      f.m.scale.setScalar(f.r * (0.3 + k * 0.9));
      f.m.material.opacity = Math.max(0, 1 - k) * 0.9;
      if (f.life <= 0) f.m.visible = false;
    }
    if (this.fxLightT > 0) {
      this.fxLightT -= dt;
      this.fxLight.intensity = Math.max(0, this.fxLightT / 0.3) * 60;
    } else this.fxLight.intensity = 0;
    for (const mk of this.markers) {
      if (!mk.m.visible) continue;
      mk.life -= dt;
      const pulse = 0.6 + 0.4 * Math.sin(this.t * 14);
      mk.m.material.opacity = Math.max(0, Math.min(1, mk.life)) * pulse;
      mk.m.scale.set(2.4, 2.4, 1);
      if (mk.life <= 0) mk.m.visible = false;
    }

    // Hazards (telegraphs) mirror the engine pool slot by slot.
    for (let i = 0; i < this.haz.length; i++) {
      const h = game.hazards[i];
      const v = this.haz[i];
      if (!h || !h.active) {
        v.ring.visible = v.line.visible = false;
        continue;
      }
      const k = Math.min(1, h.t / Math.max(0.01, h.dur));
      const pulse = 0.65 + 0.35 * Math.sin(this.t * (10 + k * 20));
      if (h.kind === "line") {
        v.ring.visible = false;
        v.line.visible = true;
        const len = h.len;
        v.line.position.set(h.x + Math.sin(h.yaw) * len * 0.5, 0.05, h.z + Math.cos(h.yaw) * len * 0.5);
        v.line.rotation.set(-Math.PI / 2, 0, h.yaw);
        v.line.scale.set(1.8, len, 1);
        v.line.material.opacity = 0.25 + 0.35 * pulse * (0.4 + k * 0.6);
        continue;
      }
      v.line.visible = false;
      v.ring.visible = true;
      let r = h.r;
      let col = "#ff3020";
      let op = (0.35 + 0.65 * k) * pulse;
      if (h.kind === "puddle") {
        col = "#5aff2a";
        op = 0.55 * Math.min(1, (h.dur - h.t) / 0.6) * (0.8 + 0.2 * Math.sin(this.t * 3));
      } else if (h.kind === "burst") col = "#9aff2a";
      else if (h.kind === "shock") {
        col = "#ffb04a";
        op = 0.9 * (1 - h.r / h.maxR);
      } else if (h.glob) col = "#9aff2a";
      else if (h.ring) {
        // Shockwave wind-up: shrink-to-centre warning.
        r = h.r * (1.6 - 0.6 * k);
      }
      v.ring.position.set(h.x, 0.05 + i * 0.002, h.z);
      v.ring.scale.set(r, r, 1);
      v.ring.material.color.set(col);
      v.ring.material.opacity = op;
    }

    // Projectiles.
    for (let i = 0; i < this.proj.length; i++) {
      const p = game.projectiles[i];
      const v = this.proj[i];
      if (!p || !p.active) {
        v.m.visible = v.halo.visible = false;
        continue;
      }
      v.m.visible = v.halo.visible = true;
      const r = p.kind === "glob" ? 0.32 : 0.16;
      v.m.position.set(p.x, p.y, p.z);
      v.m.scale.setScalar(r * (1 + Math.sin(this.t * 30 + i) * 0.1));
      v.halo.position.set(p.x, p.y, p.z);
      v.halo.quaternion.copy(q);
      v.halo.scale.setScalar(r * 6);
      v.trail -= dt;
      if (v.trail <= 0) {
        v.trail = 0.03;
        this.particle(true, p.x, p.y, p.z, (Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4, 0.35, r * 1.4, -0.5, "#6aff2a", -1, 1);
      }
    }

    // Pickups.
    const seen = new Set();
    for (const pk of game.pickups) {
      if (!pk.active) continue;
      seen.add(pk.id);
      let vis = this.pickupVis.get(pk.id);
      if (!vis) {
        vis = buildPickup(pk.type);
        this.root.add(vis);
        this.pickupVis.set(pk.id, vis);
      }
      const bob = Math.sin(this.t * 2.4 + pk.id) * 0.08;
      vis.position.set(pk.x, 0, pk.z);
      vis.userData.item.position.y = 0.55 + bob;
      vis.userData.item.rotation.y = this.t * 1.4 + pk.id;
      const fade = pk.life !== Infinity && pk.life < 4 ? (Math.sin(this.t * 14) > 0 ? 1 : 0.25) : 1;
      vis.userData.beam.material.opacity = 0.22 * fade;
      vis.userData.item.visible = fade > 0.5 || pk.life > 4;
    }
    for (const [id, vis] of this.pickupVis) {
      if (!seen.has(id)) {
        if (!vis.userData.dying) {
          // Collected / expired: quick pop.
          vis.userData.dying = 0.18;
          for (let i = 0; i < 10; i++) this.particle(true, vis.position.x, 0.7, vis.position.z, (Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3, 0.4, 0.1, 0, PICKUP_COLORS[vis.userData.type] || "#fff", 3, 1);
        }
        vis.userData.dying -= dt;
        vis.scale.setScalar(Math.max(0.01, vis.userData.dying / 0.18));
        if (vis.userData.dying <= 0) {
          this.root.remove(vis);
          this.pickupVis.delete(id);
        }
      }
    }

    // Rain.
    if (this.rain) {
      const d = this.rainData;
      const pos = d.pos;
      const fall = 18 * dt;
      for (let i = 0; i < d.n; i++) {
        const o = i * 6;
        pos[o + 1] -= fall;
        pos[o + 4] -= fall;
        if (pos[o + 1] < 0) this.resetDrop(i, false);
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      if (o.isMesh || o.isLineSegments) {
        if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
        if (o.material && !o.material.userData?.shared) o.material.dispose();
      }
    });
  }
}

/* ------------------------------------------------------------------ pickup models */

const PG = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
  beam: new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 1, true),
};

function buildPickup(type) {
  const g = new THREE.Group();
  g.userData.type = type;
  const item = new THREE.Group();
  g.add(item);
  const col = PICKUP_COLORS[type];
  const add = (geo, color, x, y, z, sx, sy, sz, emissive = null) => {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2, emissive: emissive || "#000", emissiveIntensity: emissive ? 0.8 : 0 }));
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    item.add(m);
    return m;
  };
  if (type === "health") {
    add(PG.box, "#e8e4da", 0, 0, 0, 0.5, 0.32, 0.34);
    add(PG.box, "#d82020", 0, 0, 0.175, 0.26, 0.08, 0.01, "#ff2020");
    add(PG.box, "#d82020", 0, 0, 0.175, 0.08, 0.24, 0.01, "#ff2020");
    add(PG.box, "#d82020", 0, 0, -0.175, 0.26, 0.08, 0.01, "#ff2020");
    add(PG.box, "#d82020", 0, 0, -0.175, 0.08, 0.24, 0.01, "#ff2020");
    add(PG.box, "#3a3a3a", 0, 0.19, 0, 0.18, 0.05, 0.06);
  } else if (type === "ammo") {
    add(PG.box, "#4c5338", 0, 0, 0, 0.52, 0.3, 0.28);
    add(PG.box, "#d8b02a", 0, 0.05, 0.142, 0.4, 0.06, 0.01, "#ffcc33");
    add(PG.box, "#d8b02a", 0, 0.05, -0.142, 0.4, 0.06, 0.01, "#ffcc33");
    add(PG.box, "#222", 0, 0.17, 0, 0.3, 0.04, 0.05);
    for (let i = 0; i < 4; i++) add(PG.cyl, "#b08a3a", -0.15 + i * 0.1, 0.24, 0.0, 0.025, 0.14, 0.025);
  } else if (type === "armor") {
    add(PG.box, "#2c3e5c", 0, 0, 0, 0.44, 0.5, 0.16);
    add(PG.box, "#1a2638", 0, 0.12, 0.085, 0.36, 0.14, 0.02);
    add(PG.box, "#4ab8ff", 0, -0.1, 0.085, 0.2, 0.05, 0.02, "#4ab8ff");
  } else {
    add(PG.cyl, "#8a1f1a", 0, 0, 0, 0.14, 0.42, 0.14);
    add(PG.cyl, "#ff7a1a", 0, 0, 0, 0.145, 0.12, 0.145, "#ff6a1a");
    add(PG.cyl, "#2a2a2a", 0, 0.25, 0, 0.06, 0.08, 0.06);
  }
  const beam = new THREE.Mesh(PG.beam, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 1.4;
  beam.scale.set(0.9, 2.8, 0.9);
  g.add(beam);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshBasicMaterial({ color: col, map: T.groundGlowTex(), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.04;
  g.add(glow);
  g.userData.item = item;
  g.userData.beam = beam;
  void Z1;
  void tmpQ;
  return g;
}
