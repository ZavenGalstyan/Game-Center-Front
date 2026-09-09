/**
 * Parking Master — everything inside the WebGL canvas.
 *
 * Owns the fixed-order frame loop: commit input → step physics → pose the car,
 * wheels and lights → move the camera → run the parking check and its hold
 * timer → push HUD values → emit complete / fail. Mounted fresh per run (the
 * parent keys it on level + run nonce) so there is no reset logic to get wrong;
 * pause simply skips the simulation while keeping the scene on screen.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import Environment from "./Environment.jsx";
import PlayerCar from "./PlayerCar.jsx";
import ParkingZone from "./ParkingZone.jsx";
import { ParkedCar, Cone, Barrier, Column, WallProp } from "./props.jsx";
import { createCollisionWorld } from "./collision.js";
import { createVehicleState, stepVehicle, kmh } from "./vehiclePhysics.js";
import { createParkingCamera } from "./ParkingCamera.js";
import { evaluatePark, HOLD_TIME } from "./parkingValidation.js";
import { CAR_FOOTPRINT } from "../data/levels.js";
import { sfx } from "../utils/sound.js";

const HARD_COOLDOWN = 0.7;

export default function ParkingWorld({
  level,
  env,
  settings,
  colorHex,
  bodyType,
  input,
  hudStore,
  paused,
  cameraMode,
  soundOn,
  engineRef,
  onEvent,
}) {
  const { camera } = useThree();

  const world = useMemo(() => createCollisionWorld(level), [level.id]);
  const footprint = CAR_FOOTPRINT[bodyType] || CAR_FOOTPRINT.compact;

  const api = useMemo(() => ({ group: null, lights: null, steer: [], spin: [] }), [level.id]);
  const car = useMemo(() => {
    const s = createVehicleState(level.start, bodyType);
    // nudge out of anything it spawned touching
    for (let i = 0; i < 4; i++) {
      const hit = world.resolveCircle(s.x, s.z, 1.0);
      if (!hit) break;
      s.x += hit.px;
      s.z += hit.pz;
    }
    return s;
  }, [level.id, bodyType, world]);

  const cam = useMemo(() => createParkingCamera(), [level.id]);
  const coneRefs = useRef([]);
  const feedbackRef = useRef("idle");
  const hudRef = useRef({ t10: -1, spd: -1, mistakes: 3, feedback: "idle", hp: -1 });

  const run = useRef({
    t: 0,
    hold: 0,
    hard: 0,
    cones: 0,
    mistakes: 3,
    cooldown: 0,
    finished: false,
    started: false,
    lastPrecision: 0,
  });

  useEffect(() => {
    cam.reset(car);
    hudStore.set({ time: 0, speed: 0, mistakes: 3, feedback: "idle", holdProgress: 0, precision: 0 });
    feedbackRef.current = "idle";
  }, [cam, car, hudStore, feedbackRef]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    const r = run.current;

    /* ---- pose the knocked cones every frame regardless of pause ---- */
    world.cones.forEach((cn, i) => {
      const g = coneRefs.current[i];
      if (!g) return;
      if (cn.knocked) {
        const [nx, nz] = cn.knockDir || [0, 1];
        g.rotation.x += (nz * 1.3 - g.rotation.x) * Math.min(1, dt * 6);
        g.rotation.z += (-nx * 1.3 - g.rotation.z) * Math.min(1, dt * 6);
      }
    });

    // pose the car from its current state + keep the camera easing even while
    // paused / during the intro, so the view is always framed on the car
    const poseCar = () => {
      if (api.group) {
        api.group.rotation.order = "YXZ";
        api.group.position.set(car.x, car.y + car.bump * 0.02, car.z);
        api.group.rotation.set(car.pitch, car.yaw, car.roll);
      }
      for (const g of api.steer) if (g) g.rotation.y = car.steerAngle;
      for (const g of api.spin) if (g) g.rotation.x = -car.wheelSpin;
    };

    if (paused || r.finished) {
      engineRef.current?.update(0, 0);
      poseCar();
      cam.update(camera, car, dt, { mode: cameraMode, pref: settings.camera, ceiling: env.indoor ? 3.05 : null });
      return;
    }

    input.commit();
    const moving = Math.abs(input.throttle) > 0.02 || Math.abs(car.speed) > 0.1;
    if (moving) r.started = true;
    if (r.started) r.t += dt;
    r.cooldown = Math.max(0, r.cooldown - dt);

    stepVehicle(car, input, {
      world,
      grip: env.grip,
      sensitivity: settings.steeringSensitivity,
      onCollision: (impact, soft) => {
        if (soft > 0.6) {
          r.cones += 1;
          sfx.hitSoft(soundOn);
          return;
        }
        cam.kick(Math.min(1, impact * 0.14));
        if (impact > 1.4 && r.cooldown <= 0) {
          r.cooldown = HARD_COOLDOWN;
          r.hard += 1;
          r.mistakes = Math.max(0, r.mistakes - 1);
          sfx.hitHard(soundOn);
        } else {
          sfx.hitSoft(soundOn);
        }
      },
    }, dt);

    poseCar();

    if (api.lights) {
      const baseHead = env.night || env.indoor ? 1.8 : 0.4;
      api.lights.head.forEach((m) => (m.emissiveIntensity = baseHead));
      api.lights.brake.forEach((m) => (m.emissiveIntensity = car.braking ? 1.8 : 0.3));
      api.lights.reverse.forEach((m) => (m.emissiveIntensity = car.reversing ? 1.4 : 0.05));
    }

    /* ---- camera ---- */
    cam.update(camera, car, dt, { mode: cameraMode, pref: settings.camera, ceiling: env.indoor ? 3.05 : null });

    /* ---- parking check ---- */
    const ev = evaluatePark(car, level.zone, footprint);
    let feedback = "idle";
    if (ev.valid) {
      r.hold += dt;
      feedback = "hold";
      r.lastPrecision = ev.precision;
    } else {
      if (r.hold > 0) r.hold = Math.max(0, r.hold - dt * 2);
      if (ev.positionOk && ev.angleOk && !ev.stopped) feedback = "align"; // just stop
      else if (ev.inZone && ev.positionOk) feedback = "align";
      else if (ev.inZone) feedback = "position";
      else feedback = "idle";
    }
    feedbackRef.current = feedback;

    const holdProgress = Math.min(1, r.hold / HOLD_TIME);

    if (r.hold >= HOLD_TIME && !r.finished) {
      r.finished = true;
      feedbackRef.current = "done";
      const collisions = r.hard;
      const coneHits = r.cones;
      onEvent({
        type: "complete",
        result: {
          success: true,
          time: r.t,
          precision: r.lastPrecision || ev.precision,
          collisions,
          coneHits,
        },
      });
    } else if (r.mistakes <= 0 && !r.finished) {
      r.finished = true;
      onEvent({
        type: "fail",
        result: { success: false, time: r.t, precision: ev.precision, collisions: r.hard, coneHits: r.cones },
        reason: "Too many collisions",
      });
    }

    /* ---- HUD + engine ---- */
    engineRef.current?.update(Math.min(1, Math.abs(car.speed) / 9), input.throttle);
    const h = hudRef.current;
    const t10 = Math.floor(r.t * 10);
    const spd = Math.round(kmh(car));
    const hp = Math.round(holdProgress * 20);
    if (t10 !== h.t10 || spd !== h.spd || r.mistakes !== h.mistakes || feedback !== h.feedback || hp !== h.hp) {
      h.t10 = t10; h.spd = spd; h.mistakes = r.mistakes; h.feedback = feedback; h.hp = hp;
      hudStore.set({
        time: r.t,
        speed: spd,
        mistakes: r.mistakes,
        feedback,
        holdProgress,
        precision: ev.precision,
      });
    }
  });

  return (
    <>
      <color attach="background" args={[env.sky.bottom]} />
      <fog attach="fog" args={[env.sky.fog, env.sky.fogNear, env.sky.fogFar]} />

      <Environment level={level} env={env} quality={settings.graphics} />

      <PlayerCar api={api} color={colorHex} bodyType={bodyType} headlights={env.night || env.indoor} />

      <ParkingZone zone={level.zone} feedbackRef={feedbackRef} />

      {level.parked?.map((p, i) => (
        <ParkedCar key={i} position={p.pos} heading={p.heading} color={p.color} bodyType={p.body} />
      ))}

      {level.obstacles?.map((o, i) => {
        if (o.type === "cone") return null;
        if (o.type === "barrier")
          return <Barrier key={i} position={o.pos} heading={o.heading} size={o.size} />;
        if (o.type === "column")
          return <Column key={i} position={o.pos} size={o.size} height={o.h} />;
        return <WallProp key={i} position={o.pos} heading={o.heading} size={o.size} height={o.h} />;
      })}

      {world.cones.map((cn, i) => (
        <Cone key={i} position={[cn.x, cn.z]} ref={(el) => (coneRefs.current[i] = el)} />
      ))}
    </>
  );
}
