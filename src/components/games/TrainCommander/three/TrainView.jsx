/**
 * Train Commander — the train in the scene.
 *
 * Built imperatively once per (livery, car count) and re-used across
 * restarts; modules are swapped in when the engine's module type/level
 * changes (with a short build pop + sparks). Every frame:
 *   - cars sit at engine car.x on the rail (controlled transform hierarchy:
 *     no physics joints, so couplers can never separate or jitter)
 *   - wheel angle = distance / radius, coupling rods ride the crank circle
 *   - subtle suspension bob + body sway while moving
 *   - turret yaw/recoil from engine module state, repair crane welding
 *   - damage: paint darkens, scorch plates, smoke/sparks when low
 * Invisible hitboxes (one per car) handle click/tap selection.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { buildLoco, buildWagon, buildModule, contactShadow, GAUGE } from "./train.js";
import { RAIL_Y } from "./environment.js";
import { ringTexture } from "./textures.js";
import { MODULES } from "../data/modules.js";

const tmpV = new THREE.Vector3();
const WHITE = new THREE.Color("#ffffff");
const DARK = new THREE.Color("#4a4440");
const SEL = new THREE.Color("#5ee6ff");

export function TrainView({ engine, pal, quality, settings, fx, selected, onSelect, view, interactive }) {
  const group = useRef();
  const count = engine.cars.length;
  const built = useMemo(() => {
    const cars = [];
    for (let i = 0; i < count; i++) {
      const c = i === 0 ? buildLoco(pal) : buildWagon(pal, i);
      const sh = contactShadow(c.len);
      c.root.add(sh);
      c.shadow = sh;
      cars.push(c);
    }
    // selection ring (one, moved to the selected car)
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: ringTexture(), color: SEL, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 4;
    ring.visible = false;
    return { cars, ring };
  }, [pal, count]);

  useEffect(() => {
    const g = group.current;
    if (!g) return undefined;
    for (const c of built.cars) g.add(c.root);
    g.add(built.ring);
    return () => {
      for (const c of built.cars) {
        g.remove(c.root);
        c.mat.dispose();
        if (c.glowMat) c.glowMat.dispose();
      }
      g.remove(built.ring);
      built.ring.geometry.dispose();
      built.ring.material.dispose();
    };
  }, [built]);

  const st = useRef({ smokeT: 0, dmgT: 0, weldT: 0, sway: 0 });

  useFrame((s, rdt) => {
    const dt = Math.min(rdt, 0.1);
    const run = engine.paused ? 0 : dt * (engine.mode === "play" ? engine.speed : 1);
    const t = s.clock.elapsedTime;
    const d = engine.d;
    const v = engine.v;
    const S = st.current;
    const F = fx.current;
    const shadows = settings.shadows && quality !== "low";
    const reduced = settings.reducedMotion;
    for (let i = 0; i < built.cars.length; i++) {
      const view3 = built.cars[i];
      const car = engine.cars[i];
      if (!car) continue;
      const moving = v > 0.05;
      // suspension: tiny rail-joint bob, stronger when fast
      const bob = moving && !reduced ? Math.sin(d * 1.9 + i * 1.7) * 0.012 * Math.min(1, v / 8) + Math.sin(d * 7.3 + i) * 0.004 : 0;
      view3.root.position.set(car.x, RAIL_Y + bob, 0);
      view3.root.rotation.x = moving && !reduced ? Math.sin(d * 0.9 + i * 2.1) * 0.006 : 0;
      view3.body.castShadow = shadows;
      view3.shadow.visible = !shadows;
      // wheels
      for (const w of view3.wheels) w.rotation.z = (-d / w.userData.r) * w.userData.flip;
      if (view3.rods) {
        const a = -d / 0.6;
        for (const r of view3.rods) {
          const ph = r.s > 0 ? 0 : Math.PI / 2; // quartered cranks
          const cx = Math.cos(a + ph) * 0.22;
          const cy = Math.sin(a + ph) * 0.22;
          r.rod.position.set(-0.45 + cx, 0.6 + cy, r.s * (GAUGE + 0.13));
          const px = 0.85 + cx;
          const py = 0.6 + cy;
          const dy = 0.78 - py;
          r.main.position.set(px, py, r.s * (GAUGE + 0.19));
          r.main.rotation.z = Math.atan2(dy, Math.sqrt(Math.max(0.01, 1.55 * 1.55 - dy * dy)));
        }
      }
      if (view3.bogies) for (const b of view3.bogies) b.rotation.y = moving && !reduced ? Math.sin(d * 0.37 + b.position.x) * 0.006 : 0;
      // damage tint + hit flash + selection glow
      const frac = car.hp / car.maxHp;
      const live = engine.mode === "play";
      const dmg = live ? 1 - frac : 0;
      view3.mat.color.copy(WHITE).lerp(DARK, car.disabled ? 0.62 : dmg * 0.45);
      // a short, subtle flash at the impact frame (repeated hits must not tint the car)
      const hit = car.hitT > 0.17 ? (car.hitT - 0.17) / 0.08 : 0;
      const sel = selected === i && interactive ? 0.07 + Math.sin(t * 5) * 0.035 : 0;
      view3.mat.emissive.setRGB(hit * 0.28 + SEL.r * sel, hit * 0.08 + SEL.g * sel, hit * 0.03 + SEL.b * sel);
      view3.dmg1.visible = live && frac < 0.6;
      view3.dmg2.visible = live && frac < 0.3;
      // loco lamp glow strength (night / tunnels)
      if (view3.glowMat) view3.glowMat.opacity = Math.min(1, 0.25 + (view.lampBoost || 0) * 0.45);
      // module
      if (i > 0) syncModule(view3, car, pal, F, engine, run, t, dt);
    }
    // selection ring
    const selCar = interactive && selected != null ? engine.cars[selected] : null;
    built.ring.visible = !!selCar;
    if (selCar) {
      built.ring.position.set(selCar.x, 0.06, 0);
      const pulse = 1 + Math.sin(t * 5) * 0.03;
      built.ring.scale.set((selCar.len + 1.6) * pulse, 4.2 * pulse, 1);
      // screen anchor for the DOM panel (top of the car)
      if (view.toScreen) {
        const [sx, sy] = view.toScreen(selCar.x, RAIL_Y + 3.4, 0);
        view.selAnchor = [sx, sy];
      }
    }
    if (!F || run <= 0) return;
    // chimney smoke: rides the air (drifts back at −v), rate rises with speed
    const loco = built.cars[0];
    S.smokeT -= run;
    if (S.smokeT <= 0 && loco) {
      S.smokeT = settings.particles ? (v > 1 ? 0.06 : 0.22) : 0.2;
      tmpV.copy(loco.chimney);
      const x = engine.cars[0].x + tmpV.x;
      const dark = engine.mode === "play" && engine.cars[0].hp / engine.cars[0].maxHp < 0.35;
      F.puffs.spawn(x, RAIL_Y + tmpV.y, 0, { color: dark ? "#3a3634" : "#e9e6e0", size: 0.55, grow: 4, rise: 1.6 + v * 0.05, life: 1.6, alpha: 0.6, speed: 0.25, drift: 1, spread: 0.15 });
    }
    // damaged cars smoke + spark
    S.dmgT -= run;
    if (S.dmgT <= 0 && engine.mode === "play") {
      S.dmgT = settings.particles ? 0.18 : 0.4;
      for (const car of engine.cars) {
        const f = car.hp / car.maxHp;
        if (f > 0.5 && !car.disabled) continue;
        const crit = f < 0.25 || car.disabled;
        if (Math.random() > (crit ? 0.9 : 0.45)) continue;
        const x = car.x + (Math.random() - 0.5) * car.len * 0.6;
        F.puffs.spawn(x, RAIL_Y + 2.0, (Math.random() - 0.5) * 1.6, { color: crit ? "#2e2b2a" : "#6a6560", size: 0.5, grow: 3.2, rise: 1.1, life: 1.5, alpha: crit ? 0.6 : 0.4, speed: 0.2, drift: 0.85 });
        if (crit && Math.random() < 0.4) F.bits.burst(3, x, RAIL_Y + 1.8, (Math.random() - 0.5) * 2.4, { color: "#ffcf6a", size: 0.04, speed: 2.8, up: 0.6, life: 0.35, gravity: 8 });
      }
    }
  });

  return (
    <group ref={group}>
      {interactive &&
        engine.cars.map((c) => (
          <mesh
            key={`hb${c.index}`}
            position={[c.x, RAIL_Y + 1.5, 0]}
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelect(c.index);
            }}
            onPointerOver={() => (document.body.style.cursor = "pointer")}
            onPointerOut={() => (document.body.style.cursor = "")}
          >
            <boxGeometry args={[c.len + 0.4, 3.4, 3.2]} />
            <meshBasicMaterial visible={false} />
          </mesh>
        ))}
    </group>
  );
}

/** keep a wagon's module mesh in sync with the engine and animate it */
function syncModule(view3, car, pal, F, engine, run, t, dt) {
  const m = car.module;
  const key = m ? `${m.type}-${m.level}` : "";
  if (key !== view3.moduleKey) {
    if (view3.module) view3.mount.remove(view3.module.root);
    view3.module = m ? buildModule(m.type, m.level, pal) : null;
    if (view3.module) {
      view3.module.base = 1.25; // modules are drawn a bit large so turrets read at gameplay distance
      view3.mount.add(view3.module.root);
      view3.module.root.scale.setScalar(0.01);
      view3.module.pop = 0;
      if (F && engine.mode === "play") {
        F.bits.burst(12, car.x, 2.6, 0, { color: "#ffd36a", size: 0.06, speed: 3.4, up: 0.7, life: 0.5, gravity: 9 });
        F.puffs.burst(4, car.x, 2.2, 0, { color: "#d9d2c4", size: 0.6, grow: 2.2, rise: 0.6, life: 0.7, alpha: 0.5, spread: 1.2 });
      }
    }
    view3.moduleKey = key;
  }
  const M = view3.module;
  if (!M || !m) return;
  // build pop-in
  if (M.pop < 1) {
    M.pop = Math.min(1, M.pop + dt * 3.2);
    const k = M.pop;
    M.root.scale.setScalar((k < 1 ? 1 + Math.sin(k * Math.PI) * 0.15 - (1 - k) * 0.9 : 1) * M.base);
  }
  const off = car.disabled;
  if (m.type === "repair") {
    // crane swings toward the car it is welding; sparks at the torch
    const tgt = car.repairing;
    let want = 0.6 + Math.sin(t * 0.5) * 0.3;
    if (tgt >= 0 && tgt !== car.index) want = engine.cars[tgt].x > car.x ? 0 : Math.PI;
    else if (tgt === car.index) want = Math.PI / 2 + Math.sin(t * 2) * 0.4;
    M.yaw.rotation.y += (want - M.yaw.rotation.y) * (1 - Math.exp(-3 * dt));
    if (M.arm) M.arm.rotation.z = tgt >= 0 && run > 0 ? Math.sin(t * 6) * 0.12 - 0.05 : -0.1;
    if (M.arm2) M.arm2.rotation.z = tgt >= 0 && run > 0 ? Math.cos(t * 5) * 0.12 - 0.05 : -0.1;
    if (tgt >= 0 && run > 0 && F && Math.random() < dt * 14) {
      const target = engine.cars[tgt];
      const x = target.x + (Math.random() - 0.5) * target.len * 0.5;
      F.bits.burst(2, x, 1.6 + Math.random() * 0.8, (Math.random() < 0.5 ? -1 : 1) * 1.2, { color: "#9dffb0", size: 0.035, speed: 2.4, up: 0.5, life: 0.3, gravity: 7 });
      F.flashes.spawn(x, 1.9, (Math.random() < 0.5 ? -1 : 1) * 1.25, { color: "#7dffb0", size: 0.35, grow: 1.2, rise: 0, life: 0.12, alpha: 0.8, speed: 0 });
    }
    for (const g of M.glow) g.rotation.y += run * 3;
    return;
  }
  // turret yaw straight from the engine (it already models the turn rate)
  M.yaw.rotation.y = m.yaw;
  // elevation: cannon lifts with distance, droops when disabled
  let pitch = 0;
  if (off) pitch = -0.25;
  else if (m.type === "cannon" && m.target >= 0) {
    const e = engine.enemyById.get(m.target);
    if (e) pitch = Math.min(0.45, Math.hypot(e.x - car.x, e.z) * 0.025);
  }
  M.pitch.rotation.z += (pitch - M.pitch.rotation.z) * (1 - Math.exp(-6 * dt));
  const rec = m.recoil;
  const kick = m.type === "cannon" ? 0.32 : m.type === "lancer" ? 0.12 : 0.08;
  for (const r of M.recoil) r.position.x = -rec * rec * kick;
  if (M.spin && engine.time - m.fireT < 0.4 && run > 0) M.spin.rotation.x += run * 28;
  if (M.bolt) M.bolt.visible = engine.time - m.fireT > 0.35 || m.fireT === 0;
  for (const g of M.glow) g.material.emissiveIntensity = off ? 0.1 : 1.2 + Math.sin(t * 6) * 0.4;
}

export { MODULES };
