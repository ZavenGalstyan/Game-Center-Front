/**
 * Train Commander — combat visuals.
 *
 *   <Enemies>      pooled rigs keyed by stable enemy id; ground dust trails
 *   <Projectiles>  pooled meshes per projectile kind (tracer/bolt/shell/…)
 *   <Markers>      boss telegraphs on the targeted car, incoming-group
 *                  warnings (red chevrons + dust where a group will appear)
 *   <Effects>      Bits/Puffs/Flashes/Rings driven by engine events
 *   <Floaters>     DOM damage numbers + Scrap pop-ups (pooled spans)
 *
 * All of them only READ engine state. Effects use engine-speed-scaled time,
 * so 2x speeds up sparks and smoke too, and pause freezes them.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { buildEnemy, resetRig, animateEnemy } from "./enemies.js";
import { Bits, Puffs, Rings } from "./effects.js";
import { chevronTexture, ringTexture, flashTexture } from "./textures.js";
import { RAIL_Y } from "./environment.js";
import { WARN_TIME } from "../engine/constants.js";

const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const FWD = new THREE.Vector3(1, 0, 0);

const animStep = (engine, rdt) => (engine.paused ? 0 : Math.min(rdt, 0.1) * (engine.mode === "play" ? engine.speed : 1));

/* ================================================================ enemies */
export function Enemies({ engine, quality, settings, fx }) {
  const group = useRef();
  const state = useRef({ rigs: new Map(), pools: new Map(), frame: 0, dustT: 0 });
  const { camera } = useThree();
  useEffect(() => {
    const S = state.current;
    return () => {
      for (const rig of S.rigs.values()) rig.mat.dispose();
      for (const list of S.pools.values()) for (const rig of list) rig.mat.dispose();
      S.rigs.clear();
      S.pools.clear();
    };
  }, []);
  useFrame((s, rdt) => {
    const g = group.current;
    if (!g) return;
    const S = state.current;
    S.frame++;
    const dt = animStep(engine, rdt);
    const shadows = quality === "high" && settings.shadows;
    for (const e of engine.enemies) {
      let rig = S.rigs.get(e.id);
      if (!rig) {
        const pool = S.pools.get(e.type);
        rig = pool && pool.length ? pool.pop() : buildEnemy(e.type);
        resetRig(rig);
        if (!rig.root.parent) g.add(rig.root);
        S.rigs.set(e.id, rig);
      }
      rig.seen = S.frame;
      rig.root.position.set(e.x, 0, e.z);
      // the train side of every model is +Z: mirror riders on the right
      rig.flip.scale.z = e.z > 0 ? -1 : 1;
      rig.root.traverse((o) => {
        if (o.isMesh && o !== rig.shadow && o !== rig.ring && o.parent !== rig.bar) o.castShadow = shadows;
      });
      animateEnemy(rig, e, dt, engine.time, true);
      // HP bar: billboard, only once damaged
      const frac = e.hp / e.maxHp;
      const show = frac < 0.999 && e.state !== "DYING";
      rig.bar.visible = show;
      if (show) {
        rig.hpShown += (frac - rig.hpShown) * (1 - Math.exp(-14 * Math.min(rdt, 0.1)));
        const w = rig.barW * rig.hpShown;
        rig.barFill.scale.x = Math.max(0.001, w);
        rig.barFill.position.x = -(rig.barW - w) / 2;
        rig.barFill.material.color.set(e.boss ? "#ff3d6e" : e.armor >= 4 ? "#ffb13c" : "#ff5a3c");
        rig.root.getWorldQuaternion(tmpQ).invert();
        rig.bar.quaternion.copy(tmpQ.multiply(camera.quaternion));
      }
    }
    for (const [id, rig] of S.rigs) {
      if (rig.seen === S.frame) continue;
      S.rigs.delete(id);
      rig.root.visible = false;
      if (!S.pools.has(rig.type)) S.pools.set(rig.type, []);
      S.pools.get(rig.type).push(rig);
    }
    // dust kicked up by wheels (ground speed), exhaust from vehicles
    const F = fx.current;
    if (!F || dt <= 0) return;
    S.dustT -= dt;
    if (S.dustT > 0) return;
    S.dustT = settings.particles ? (quality === "low" ? 0.16 : 0.09) : 0.24;
    for (const e of engine.enemies) {
      if (e.state === "DYING") continue;
      const gs = Math.hypot(e.gvx, e.gvz);
      // dust trails BEHIND the vehicle and stays faint so it never veils the model
      const big = e.boss || e.def.vehicle;
      if (gs > 2 && !e.def.rail) F.puffs.spawn(e.x - (big ? 3.2 : 1.2), 0.15, e.z, { color: "#cdb894", size: big ? 0.6 : 0.35, grow: 2.0, rise: 0.25, life: 0.6, alpha: big ? 0.22 : 0.26, speed: 0.2, drift: 1, spread: big ? 1.2 : 0.3 });
      const rig = state.current.rigs.get(e.id);
      if (rig && rig.exhaust && Math.random() < 0.6) {
        for (const p of rig.exhaust) {
          const z = e.z > 0 ? -p.z : p.z;
          F.puffs.spawn(e.x + p.x, p.y, e.z + z, { color: "#3e3a38", size: 0.35, grow: 3, rise: 1.2, life: 0.9, alpha: 0.45, speed: 0.1, drift: 1 });
        }
      }
    }
  });
  return <group ref={group} />;
}

/* ================================================================ projectiles */
const PROJ = {
  tracer: { color: "#ffe27a", glow: "#ffd04a", len: 1.1, w: 0.07, glowS: 0.55 },
  bolt: { color: "#e6dcff", glow: "#c084fc", len: 1.3, w: 0.06, glowS: 0.75 },
  ebolt: { color: "#ffb08a", glow: "#ff5a3c", len: 0.9, w: 0.06, glowS: 0.6 },
  shell: { color: "#2d2b2a", glow: "#ffb050", len: 0.36, w: 0.3, glowS: 0.9 },
  bshell: { color: "#3a1a10", glow: "#ff5a2a", len: 0.62, w: 0.6, glowS: 1.6 },
};

export function Projectiles({ engine, fx, settings }) {
  const group = useRef();
  const pools = useRef(new Map());
  const mats = useMemo(() => {
    const out = {};
    for (const [k, p] of Object.entries(PROJ)) {
      out[k] = {
        body: new THREE.MeshBasicMaterial({ color: p.color, toneMapped: false }),
        glow: new THREE.SpriteMaterial({ map: flashTexture(), color: p.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
      };
    }
    return out;
  }, []);
  const geos = useMemo(
    () => ({
      line: new THREE.BoxGeometry(1, 1, 1),
      ball: new THREE.IcosahedronGeometry(0.5, 1),
    }),
    []
  );
  useEffect(
    () => () => {
      for (const m of Object.values(mats)) {
        m.body.dispose();
        m.glow.dispose();
      }
      geos.line.dispose();
      geos.ball.dispose();
    },
    [mats, geos]
  );
  const trailT = useRef(0);
  useFrame((_, rdt) => {
    const g = group.current;
    if (!g) return;
    const used = {};
    for (const p of engine.projectiles) {
      const k = p.kind;
      const def = PROJ[k];
      if (!def) continue;
      let list = pools.current.get(k);
      if (!list) {
        list = [];
        pools.current.set(k, list);
      }
      const i = used[k] || 0;
      used[k] = i + 1;
      let o = list[i];
      if (!o) {
        o = new THREE.Group();
        const ball = k === "shell" || k === "bshell";
        const body = new THREE.Mesh(ball ? geos.ball : geos.line, mats[k].body);
        if (ball) body.scale.setScalar(def.w);
        else body.scale.set(def.len, def.w, def.w);
        const glow = new THREE.Sprite(mats[k].glow);
        glow.scale.setScalar(def.glowS);
        if (!ball) glow.position.x = def.len * 0.4;
        o.add(body, glow);
        o.userData.body = body;
        g.add(o);
        list.push(o);
      }
      o.visible = true;
      o.position.set(p.x, p.y, p.z);
      tmpV.set(p.x - p.px, p.y - p.py, p.z - p.pz);
      if (tmpV.lengthSq() > 1e-8) o.quaternion.setFromUnitVectors(FWD, tmpV.normalize());
    }
    for (const [k, list] of pools.current) for (let i = used[k] || 0; i < list.length; i++) list[i].visible = false;
    // smoke trails behind shells
    const F = fx.current;
    const dt = animStep(engine, rdt);
    if (!F || dt <= 0) return;
    trailT.current -= dt;
    if (trailT.current > 0) return;
    trailT.current = settings.particles ? 0.035 : 0.09;
    for (const p of engine.projectiles) {
      if (p.kind === "shell" || p.kind === "bshell") F.puffs.spawn(p.x, p.y, p.z, { color: p.kind === "bshell" ? "#5a4a44" : "#bdb6aa", size: p.kind === "bshell" ? 0.45 : 0.25, grow: 2.4, rise: 0.15, life: 0.5, alpha: 0.4, speed: 0.05, drift: 1 });
      else if (p.kind === "bolt" && settings.particles) F.flashes.spawn(p.x, p.y, p.z, { color: "#b07cff", size: 0.25, grow: 0.4, rise: 0, life: 0.18, alpha: 0.6, speed: 0 });
    }
  });
  return <group ref={group} />;
}

/* ================================================================ markers */
export function Markers({ engine, bus, view }) {
  const group = useRef();
  const res = useMemo(() => {
    const ringMat = new THREE.MeshBasicMaterial({ map: ringTexture(), color: "#ff3b30", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const chevMat = new THREE.MeshBasicMaterial({ map: chevronTexture(), color: "#ff4a3a", transparent: true, depthWrite: false, toneMapped: false, opacity: 0.85 });
    const plane = new THREE.PlaneGeometry(1, 1);
    return { ringMat, chevMat, plane, rings: [], chevs: [] };
  }, []);
  useEffect(
    () => () => {
      res.ringMat.dispose();
      res.chevMat.dispose();
      res.plane.dispose();
    },
    [res]
  );
  const warns = useRef([]);
  useEffect(() => {
    const h = (ev) => {
      for (const e of ev) {
        if (e.type === "warn") warns.current.push({ x: e.x, z: e.z, t0: engine.time, boss: e.boss, side: e.side, enemy: e.enemy });
      }
    };
    bus.handlers.add(h);
    return () => bus.handlers.delete(h);
  }, [bus, engine]);
  const lastLoad = useRef(-1);
  useFrame((s, rdt) => {
    const g = group.current;
    if (!g) return;
    if (lastLoad.current !== engine.loadId) {
      lastLoad.current = engine.loadId;
      warns.current = [];
    }
    const t = s.clock.elapsedTime;
    // boss telegraphs: pulsing red ring on top of the targeted car
    let n = 0;
    for (const m of engine.markers) {
      const car = engine.cars[m.car];
      if (!car) continue;
      let r = res.rings[n];
      if (!r) {
        r = new THREE.Mesh(res.plane, res.ringMat);
        r.rotation.x = -Math.PI / 2;
        r.renderOrder = 8;
        g.add(r);
        res.rings.push(r);
      }
      const k = m.t / m.tmax;
      r.visible = true;
      r.position.set(car.x, RAIL_Y + 2.55, 0);
      const pulse = 1 + Math.sin(t * 16) * 0.06;
      r.scale.set((car.len + 0.8) * (1.4 - k * 0.4) * pulse, 3.2 * (1.4 - k * 0.4) * pulse, 1);
      n++;
    }
    for (let i = n; i < res.rings.length; i++) res.rings[i].visible = false;
    // incoming warnings: chevrons pointing at the train where a group will appear
    const list = warns.current;
    let c = 0;
    const out = [];
    for (const w of list) {
      // aged in GAME time: pauses with the game, runs 2x at 2x
      if (engine.time - w.t0 > WARN_TIME + 0.6) continue;
      out.push(w);
      let ch = res.chevs[c];
      if (!ch) {
        ch = new THREE.Mesh(res.plane, res.chevMat);
        ch.renderOrder = 8;
        g.add(ch);
        res.chevs.push(ch);
      }
      ch.visible = true;
      // clamp the marker into the visible field so it is never off in the fog
      const zc = Math.max(-15, Math.min(9.5, w.z));
      const xc = Math.max(-40, Math.min(40, w.x));
      ch.position.set(xc, 0.12, zc);
      const ang = Math.atan2(-zc, -xc * 0.15); // point toward the track
      ch.rotation.set(-Math.PI / 2, 0, ang - Math.PI / 2);
      const s2 = (w.boss ? 3.4 : 2.2) * (1 + Math.sin(t * 10) * 0.08);
      ch.scale.set(s2, s2, 1);
      c++;
    }
    warns.current = out;
    for (let i = c; i < res.chevs.length; i++) res.chevs[i].visible = false;
    view.warnings = out;
  });
  return <group ref={group} />;
}

/* ================================================================ effects */
export function Effects({ engine, bus, fx, settings, view }) {
  const { camera } = useThree();
  const sys = useMemo(() => ({ bits: new Bits(480), puffs: new Puffs(260), flashes: new Puffs(90, { additive: true }), rings: new Rings(28) }), []);
  useEffect(() => {
    fx.current = sys;
    return () => {
      fx.current = null;
      for (const k of ["bits", "puffs", "flashes", "rings"]) {
        sys[k].geo.dispose();
        sys[k].mat.dispose();
      }
    };
  }, [fx, sys]);
  useEffect(() => {
    const h = (ev) => {
      const q = settings.particles ? 1 : 0.35;
      const n = (x) => Math.max(1, Math.round(x * q));
      const shake = (a) => {
        if (settings.cameraShake && !settings.reducedMotion) view.shake = Math.min(1, Math.max(view.shake || 0, a));
      };
      for (const e of ev) {
        switch (e.type) {
          case "fire": {
            const big = e.module === "cannon";
            const col = e.module === "lancer" ? "#d9b8ff" : "#ffd27a";
            const fx2 = e.x + Math.cos(e.yaw) * (big ? 1.2 : 0.5);
            const fz = e.z - Math.sin(e.yaw) * (big ? 1.2 : 0.5);
            sys.flashes.spawn(fx2, e.y, fz, { color: col, size: big ? 1.5 : 0.6, grow: 1.4, rise: 0, life: big ? 0.14 : 0.07, alpha: 1, speed: 0 });
            if (big) {
              sys.puffs.burst(n(4), fx2, e.y, fz, { color: "#cfc7ba", size: 0.6, grow: 2.6, rise: 0.4, life: 0.9, alpha: 0.55, speed: 0.8, drift: 0.8 });
              shake(0.12);
            }
            break;
          }
          case "impact": {
            const col = e.kind === "bolt" ? "#e0c8ff" : "#ffe9a8";
            sys.flashes.spawn(e.x, e.y, e.z, { color: e.armored ? "#ffffff" : col, size: e.kind === "bolt" ? 0.8 : 0.45, grow: 1.3, rise: 0, life: 0.08, alpha: 1, speed: 0 });
            sys.bits.burst(n(e.armored ? 5 : 3), e.x, e.y, e.z, { color: e.armored ? "#fff4c8" : "#ffcc66", size: 0.04, speed: e.armored ? 3.6 : 2.6, up: 0.5, life: 0.25, gravity: 8 });
            break;
          }
          case "fizzle":
            sys.puffs.burst(1, e.x, Math.max(0.2, e.y), e.z, { color: "#cdbfa8", size: 0.3, grow: 1.8, rise: 0.2, life: 0.4, alpha: 0.35, drift: 1 });
            break;
          case "explode": {
            const r = e.r || 2;
            sys.flashes.spawn(e.x, 0.8, e.z, { color: "#ffcf7a", size: r * 1.3, grow: 1.5, rise: 0.3, life: 0.22, alpha: 1, speed: 0 });
            sys.rings.spawn(e.x, 0.1, e.z, { r0: 0.3, r1: r, life: 0.4, color: "#ffd9a0", alpha: 0.85 });
            sys.puffs.burst(n(7), e.x, 0.5, e.z, { color: "#8e8478", size: 0.9, grow: 2.6, rise: 1.0, life: 1.1, alpha: 0.6, speed: 1.6, spread: r * 0.6, drift: 1 });
            sys.puffs.burst(n(3), e.x, 0.3, e.z, { color: "#d9c8a8", size: 1.1, grow: 2.2, rise: 0.3, life: 0.8, alpha: 0.5, speed: 2.2, spread: r * 0.8, drift: 1 });
            sys.bits.burst(n(10), e.x, 0.4, e.z, { color: "#6b5a46", size: 0.09, speed: 4.5, up: 0.7, life: 0.9, gravity: 14, bounce: true, drift: 1 });
            shake(0.22);
            break;
          }
          case "kill": {
            const veh = e.vehicle;
            if (veh) {
              sys.flashes.spawn(e.x, 1.2, e.z, { color: "#ffb050", size: e.boss ? 6 : 3.4, grow: 1.6, rise: 0.4, life: 0.3, alpha: 1, speed: 0 });
              sys.rings.spawn(e.x, 0.1, e.z, { r0: 0.5, r1: e.boss ? 7 : 4, life: 0.55, color: "#ffc070", alpha: 0.9 });
              sys.puffs.burst(n(e.boss ? 16 : 9), e.x, 1, e.z, { color: "#3e3a38", size: 1.1, grow: 3, rise: 1.6, life: 1.8, alpha: 0.65, speed: 1.8, spread: 2, drift: 1 });
              sys.bits.burst(n(e.boss ? 26 : 14), e.x, 1.2, e.z, { color: "#5a504a", size: 0.14, speed: 5.5, up: 0.75, life: 1.3, gravity: 14, bounce: true, drift: 1 });
              sys.bits.burst(n(8), e.x, 1.2, e.z, { color: "#ffd26a", size: 0.05, speed: 6, up: 0.6, life: 0.5, gravity: 8 });
              shake(e.boss ? 0.8 : 0.35);
            } else {
              sys.puffs.burst(n(5), e.x, 0.4, e.z, { color: "#d6c7aa", size: 0.65, grow: 2.4, rise: 0.4, life: 1.0, alpha: 0.55, spread: 0.7, drift: 1 });
              sys.bits.burst(n(5), e.x, 0.8, e.z, { color: "#6d6863", size: 0.07, speed: 3, up: 0.7, life: 0.8, gravity: 12, bounce: true, drift: 1 });
            }
            // scrap sparkle (the reward)
            sys.bits.burst(n(6), e.x, 1.3, e.z, { color: "#ffd24a", size: 0.08, speed: 2.6, up: 0.9, life: 0.7, gravity: 9 });
            break;
          }
          case "carHit": {
            const car = engine.cars[e.car];
            if (!car) break;
            const z = Math.sign(e.z || 1) * 1.3;
            const x = Math.max(car.x - car.len / 2, Math.min(car.x + car.len / 2, e.x));
            sys.bits.burst(n(e.by === "boss" || e.by === "vehicle" ? 10 : 5), x, RAIL_Y + 1.3, z, { color: "#fff0b0", size: 0.045, speed: 3.6, up: 0.55, life: 0.3, gravity: 8, vz: Math.sign(z) * 1.5 });
            if (e.by === "vehicle" || e.by === "boss") {
              sys.puffs.burst(n(3), x, RAIL_Y + 1.2, z, { color: "#6a6560", size: 0.7, grow: 2.4, rise: 0.6, life: 0.8, alpha: 0.5, drift: 1 });
              shake(e.by === "boss" ? 0.3 : 0.18);
            }
            break;
          }
          case "bossImpact":
            sys.flashes.spawn(e.x, RAIL_Y + 1.8, e.z, { color: "#ff8a4a", size: 3.0, grow: 1.5, rise: 0.3, life: 0.25, alpha: 1, speed: 0 });
            sys.puffs.burst(n(6), e.x, RAIL_Y + 1.5, e.z, { color: "#4a4440", size: 1.0, grow: 2.6, rise: 1, life: 1.2, alpha: 0.6, speed: 1.2, drift: 1 });
            sys.bits.burst(n(10), e.x, RAIL_Y + 2, e.z, { color: "#ffcf6a", size: 0.06, speed: 4.5, up: 0.7, life: 0.5, gravity: 9 });
            shake(0.35);
            break;
          case "eimpact":
            sys.bits.burst(n(3), e.x, e.y, e.z, { color: "#ffb08a", size: 0.04, speed: 2.4, up: 0.5, life: 0.25, gravity: 8 });
            break;
          case "carDisabled": {
            const car = engine.cars[e.car];
            if (!car) break;
            sys.flashes.spawn(car.x, RAIL_Y + 2, 0, { color: "#ff9a4a", size: 3.2, grow: 1.4, rise: 0, life: 0.25, alpha: 1, speed: 0 });
            sys.puffs.burst(n(10), car.x, RAIL_Y + 2, 0, { color: "#2e2b2a", size: 0.9, grow: 3, rise: 1.6, life: 1.6, alpha: 0.65, speed: 1.2, spread: car.len * 0.6, drift: 0.9 });
            shake(0.3);
            break;
          }
          case "carRestored":
          case "emergency": {
            const car = engine.cars[e.car];
            if (!car) break;
            sys.bits.burst(n(16), car.x, RAIL_Y + 2, 0, { color: "#7dffb0", size: 0.06, speed: 3, up: 0.8, life: 0.7, gravity: 6 });
            sys.rings.spawn(car.x, RAIL_Y + 0.2, 0, { r0: 0.5, r1: car.len * 0.7, life: 0.5, color: "#7dffb0", alpha: 0.8 });
            break;
          }
          case "upgrade": {
            const car = engine.cars[e.car];
            if (!car) break;
            sys.bits.burst(n(18), car.x, RAIL_Y + 2.5, 0, { color: "#ffd24a", size: 0.07, speed: 3.6, up: 0.85, life: 0.8, gravity: 8 });
            sys.rings.spawn(car.x, RAIL_Y + 2.0, 0, { r0: 0.4, r1: 2.6, life: 0.5, color: "#ffd24a", alpha: 0.9 });
            break;
          }
          case "bossSummon":
            sys.puffs.burst(n(6), e.x, 0.6, e.z, { color: "#cdb894", size: 0.9, grow: 2.4, rise: 0.5, life: 1, alpha: 0.5, spread: 2, drift: 1 });
            break;
          case "bossFire":
            sys.flashes.spawn(e.x, 3, e.z, { color: "#ffb050", size: 2.4, grow: 1.4, rise: 0, life: 0.15, alpha: 1, speed: 0 });
            sys.puffs.burst(n(4), e.x, 3, e.z, { color: "#4a4440", size: 0.8, grow: 2.6, rise: 0.6, life: 1, alpha: 0.55, drift: 1 });
            break;
          case "warn":
            sys.puffs.burst(n(e.boss ? 10 : 5), Math.max(-40, Math.min(40, e.x)), 0.5, Math.max(-15, Math.min(9.5, e.z)), { color: "#d8c4a0", size: e.boss ? 1.6 : 1.0, grow: 2.4, rise: 0.4, life: 1.6, alpha: 0.4, speed: 0.6, spread: 3, drift: 0.3 });
            break;
          default:
        }
      }
    };
    bus.handlers.add(h);
    return () => bus.handlers.delete(h);
  }, [bus, sys, settings.particles, settings.cameraShake, settings.reducedMotion, engine, view]);
  const loadRef = useRef(-1);
  useFrame((_, rdt) => {
    if (loadRef.current !== engine.loadId) {
      loadRef.current = engine.loadId;
      sys.bits.hideAll();
      sys.puffs.hideAll();
      sys.flashes.hideAll();
      sys.rings.hideAll();
    }
    const dt = animStep(engine, rdt);
    const v = engine.v;
    sys.bits.update(dt, v);
    sys.puffs.update(dt, camera, v);
    sys.flashes.update(dt, camera, v);
    sys.rings.update(dt, v);
  });
  return (
    <>
      <primitive object={sys.bits.mesh} />
      <primitive object={sys.puffs.mesh} />
      <primitive object={sys.flashes.mesh} />
      <primitive object={sys.rings.mesh} />
    </>
  );
}

/* ================================================================ floaters */
export function Floaters({ bus, layer, view, settings, engine }) {
  const pool = useRef([]);
  const live = useRef([]);
  const idx = useRef(0);
  useEffect(() => {
    const el = layer.current;
    if (!el) return undefined;
    const spans = [];
    for (let i = 0; i < 40; i++) {
      const s = document.createElement("span");
      s.className = "tc-float";
      s.style.display = "none";
      el.appendChild(s);
      spans.push(s);
    }
    pool.current = spans;
    return () => {
      spans.forEach((s) => s.remove());
      pool.current = [];
      live.current = [];
    };
  }, [layer]);
  useEffect(() => {
    const h = (ev) => {
      if (engine.mode !== "play") return;
      for (const e of ev) {
        let text = null;
        let cls = "";
        let x = 0;
        let y = 0;
        let z = 0;
        if (e.type === "impact" && settings.damageNumbers && e.dmg > 0) {
          text = String(Math.max(1, Math.round(e.dmg)));
          cls = e.armored ? "is-armor" : "is-dmg";
          x = e.x;
          y = e.y + 1.0;
          z = e.z;
        } else if (e.type === "explode" && settings.damageNumbers && e.hits > 1) {
          text = `×${e.hits}`;
          cls = "is-splash";
          x = e.x;
          y = 2.2;
          z = e.z;
        } else if (e.type === "kill" && e.reward > 0) {
          text = `+${e.reward}`;
          cls = "is-scrap";
          x = e.x;
          y = e.vehicle ? 3.2 : 2.2;
          z = e.z;
        } else if (e.type === "carHit" && settings.damageNumbers && e.dmg >= 1) {
          const car = engine.cars[e.car];
          text = `-${Math.round(e.dmg)}`;
          cls = car && car.kind === "loco" ? "is-loco" : "is-hurt";
          x = car ? car.x : e.x;
          y = RAIL_Y + 3.2;
          z = Math.sign(e.z || 1) * 0.8;
        } else if (e.type === "emergency" || e.type === "carRestored") {
          const car = engine.cars[e.car];
          text = e.type === "emergency" ? "REPAIRED" : "ONLINE";
          cls = "is-heal";
          x = car ? car.x : 0;
          y = RAIL_Y + 3.6;
        } else if (e.type === "carDisabled") {
          const car = engine.cars[e.car];
          text = "DISABLED";
          cls = "is-hurt is-big";
          x = car ? car.x : 0;
          y = RAIL_Y + 3.8;
        }
        if (!text) continue;
        const spans = pool.current;
        if (!spans.length) return;
        const s = spans[idx.current % spans.length];
        idx.current++;
        s.textContent = text;
        s.className = `tc-float ${cls}`;
        s.style.display = "block";
        live.current = live.current.filter((f) => f.s !== s);
        live.current.push({ s, x, y, z, t: 0, jx: (Math.random() - 0.5) * 16, life: cls.includes("scrap") || cls.includes("heal") || cls.includes("big") ? 1.15 : 0.8 });
      }
    };
    bus.handlers.add(h);
    return () => bus.handlers.delete(h);
  }, [bus, settings.damageNumbers, engine]);
  useFrame((_, rdt) => {
    if (!view.toScreen || !live.current.length) return;
    const dt = engine.paused ? 0 : Math.min(rdt, 0.1);
    const keep = [];
    for (const f of live.current) {
      f.t += dt;
      if (f.t >= f.life) {
        f.s.style.display = "none";
        continue;
      }
      // world positions in the train frame: scrap from wrecks rides the ground
      const [sx, sy] = view.toScreen(f.x, f.y, f.z);
      const k = f.t / f.life;
      f.s.style.transform = `translate(${Math.round(sx + f.jx)}px, ${Math.round(sy - k * 38)}px) translate(-50%, -50%) scale(${k < 0.15 ? 0.7 + k * 2 : 1})`;
      f.s.style.opacity = String(k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1);
      keep.push(f);
    }
    live.current = keep;
  });
  return null;
}
