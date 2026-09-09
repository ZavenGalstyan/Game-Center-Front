/**
 * Delivery Rush — the gameplay world.
 *
 * Everything that moves lives behind refs and one useFrame: physics, traffic,
 * camera, the delivery state machine, weather and the car's own animation. The
 * React tree above this component renders at most a dozen times a minute; the
 * HUD gets its live numbers through a small store flushed at ~12 Hz, and the
 * mini-map reads a mutable snapshot object directly.
 *
 * The district itself is built once per (zone, quality) pair and torn down on
 * unmount. Restarting a mission never rebuilds it — it just moves the car back
 * to the spawn and makes a fresh DeliveryRun.
 */

import { useEffect, useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { buildCityMesh } from "../world/cityMesh.js";
import { buildVehicle } from "../world/vehicleModel.js";
import { buildSky, buildEnvMap } from "./skyDome.js";
import { buildLights, buildFog } from "./lighting.js";
import { createMarker } from "./markers.js";
import { createWeather, createSprayPool } from "./weather.js";
import { createChaseCamera } from "./chaseCamera.js";
import { createTrafficRenderer } from "./trafficRenderer.js";
import { TRAFFIC_TYPES } from "../world/trafficModel.js";
import { createHeadlights } from "./headlights.js";

import { WorldIndex } from "../systems/collision.js";
import { createVehicleState, stepVehicle } from "../systems/vehiclePhysics.js";
import { TrafficSystem } from "../systems/traffic.js";
import { DeliveryRun, ARRIVE_SPEED } from "../systems/deliverySystem.js";
import { getWeather } from "../data/zones.js";
import { sfx } from "../utils/sound.js";

const HUD_INTERVAL = 1 / 12;
const _camDir = new THREE.Vector3();

export default function GameWorld({
  zone,
  layout,
  theme,
  mission,
  vehicle,
  paintHex,
  settings,
  paused,
  input,
  live,
  hudStore,
  audioRef,
  cameraMode,
  restartKey,
  resetKey,
  onEvent,
}) {
  const { scene, camera, gl } = useThree();
  const ref = useRef(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const camModeRef = useRef(cameraMode);
  camModeRef.current = cameraMode;
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const quality = settings.graphics;
  const detail = quality === "low" ? 0 : quality === "medium" ? 1 : 2;

  /* ------------------------------------------------------------ build the world */

  useLayoutEffect(() => {
    const root = new THREE.Group();
    root.name = "delivery-rush-world";
    const weather = getWeather(zone.weather);

    const city = buildCityMesh(layout, theme, detail);
    root.add(city.group);

    const sky = buildSky(zone, theme);
    root.add(sky.group);

    // Without an environment map every glass/chrome material renders black —
    // there is nothing for it to reflect. This bakes one from the district's
    // own sky once per world build, which is what makes shopfronts and car
    // windows read as glass instead of tinted plastic.
    const envMap = buildEnvMap(gl, zone, theme);
    scene.environment = envMap.texture;

    const lights = buildLights(zone, theme, quality);
    root.add(lights.group);

    const world = new WorldIndex(layout);

    const drive = { ...vehicle.drive, wheelR: vehicle.body.wheelR };
    const car = buildVehicle(vehicle.body, paintHex, { night: theme.night });
    root.add(car.group);
    // flat ground decal, not a child of car.group — see buildVehicle's note
    root.add(car.shadow.mesh);

    const beams = createHeadlights(car.dims, { quality, night: theme.night });
    car.group.add(beams.group);

    // the simulation only needs each type's size and pace; geometry comes later
    const trafficMeta = TRAFFIC_TYPES.map((t) => ({
      speed: t.speed,
      hw: t.W / 2 + 0.15,
      hd: t.L / 2 + 0.15,
    }));
    const traffic = new TrafficSystem(layout, trafficMeta, {
      density: settings.trafficDensity,
      zoneBias: zone.trafficBias,
      seed: zone.seed + 5,
    });
    const trafficView = createTrafficRenderer(traffic.cars, theme);
    root.add(trafficView.group);

    const marker = createMarker();
    root.add(marker.group);

    const rain = createWeather(zone.weather, quality);
    if (rain) root.add(rain.mesh);
    const spray = createSprayPool(quality);
    if (spray) root.add(spray.mesh);

    const chase = createChaseCamera();

    const prevFog = scene.fog;
    const prevBg = scene.background;
    const prevEnv = scene.environment;
    scene.fog = buildFog(zone, quality);
    scene.background = new THREE.Color(zone.palette.fog);

    scene.add(root);

    ref.current = {
      root, city, sky, lights, world, car, beams, traffic, trafficView,
      marker, rain, spray, chase, weather, drive,
      state: createVehicleState(layout.spawn, drive),
      run: null,
      hudTimer: 0,
      offRoad: 0,
      resetFlash: 0,
      streak: 1,
      coins: 0,
      lastCollision: 0,
    };
    chase.reset(ref.current.state);

    return () => {
      scene.remove(root);
      scene.fog = prevFog;
      scene.background = prevBg;
      scene.environment = prevEnv;
      envMap.dispose();
      marker.dispose();
      trafficView.dispose();
      rain?.dispose();
      spray?.dispose();
      beams.dispose();
      car.dispose();
      lights.dispose();
      sky.dispose();
      city.dispose();
      root.clear();
      ref.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, theme, detail, quality, vehicle.id, paintHex, settings.trafficDensity, zone.id]);

  /* ------------------------------------------------- start / restart a mission */

  useEffect(() => {
    const o = ref.current;
    if (!o || !mission) return;
    o.state = createVehicleState(layout.spawn, o.drive);
    o.run = new DeliveryRun(mission, layout);
    o.chase.reset(o.state);
    o.offRoad = 0;
    o.hudTimer = 99;
    const t = o.run.target;
    o.marker.setTarget(t.x, t.z, t.radius, t.stage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission?.id, restartKey, layout]);

  /* ----------------------------------------------------- manual vehicle reset */

  useEffect(() => {
    if (!resetKey) return;
    const o = ref.current;
    if (!o) return;
    respawn(o);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  /* ---------------------------------------------------------------- the loop */

  useFrame((_, delta) => {
    const o = ref.current;
    if (!o) return;
    const dt = Math.min(0.05, Math.max(0.0004, delta));
    const s = o.state;
    const st = settingsRef.current;
    const isPaused = pausedRef.current;

    if (!isPaused) {
      input.commit();
      stepVehicle(s, input, {
        world: o.world,
        weather: o.weather,
        zoneSurface: zone.surface,
        onCollision: (impact, soft) => handleImpact(o, impact, soft, st),
      }, dt);

      const impact = o.traffic.resolvePlayer(s);
      if (impact > 1.4) handleImpact(o, impact, 0.35, st);

      o.traffic.update(dt, s);

      // fell in the water or left the city: fish the player out
      const drown = s.surface?.drown || o.world.outOfBounds(s.x, s.z);
      o.offRoad = drown ? o.offRoad + dt : 0;
      if (o.offRoad > 1.4) respawn(o);

      if (o.run && o.run.state === "running") {
        const events = o.run.update(dt, s);
        for (const e of events) handleRunEvent(o, e, st, onEventRef.current);
      }
    }

    /* ------------------------------------------------------------ presentation */

    // car transform, body attitude and wheels
    o.car.group.position.set(s.x, s.y, s.z);
    o.car.group.rotation.set(s.pitch, s.yaw, s.roll, "YXZ");
    o.car.shadow.mesh.position.set(s.x, 0.028, s.z);
    o.car.shadow.mesh.rotation.y = s.yaw;
    for (const p of o.car.steered) p.rotation.y = s.steerAngle * 0.85;
    for (const w of o.car.wheels) w.rotation.x = -s.wheelSpin;

    const night = theme.night;
    const lampsOn = night || o.weather.rain > 0 ? 1 : 0;
    o.beams.set(lampsOn, dt);
    o.car.materials.head.color.setScalar(lampsOn ? 1 : 0.35);
    o.car.materials.tail.color.setScalar(s.braking ? 1.5 : lampsOn ? 0.85 : 0.4);
    o.car.materials.reverse.color.setScalar(s.reversing && s.speed < -0.4 ? 1.4 : 0.05);

    o.chase.update(camera, s, dt, {
      mode: camModeRef.current,
      maxSpeed: o.drive.maxSpeed,
      shake: st.cameraShake,
    });

    o.lights.update(s);
    o.sky.update(dt, camera.position);
    o.trafficView.sync(o.traffic.cars, night);

    // camera.rotation.y is NOT the heading once lookAt has pitched the camera
    // (the Euler decomposition puts the turn in x/z instead), so billboards and
    // the HUD compass both take the heading from the world direction.
    camera.getWorldDirection(_camDir);
    const camYaw = Math.atan2(_camDir.x, _camDir.z);

    if (o.rain) o.rain.update(dt, camera.position, [s.vx, s.vz], camYaw);
    if (o.spray && !isPaused) emitSpray(o, s, dt);
    if (o.spray) o.spray.update(dt, camYaw);

    // marker feedback: how close, and are we slow enough to collect
    if (o.run && o.run.state === "running") {
      const t = o.run.target;
      const d = Math.hypot(s.x - t.x, s.z - t.z);
      const near = Math.max(0, Math.min(1, 1 - (d - t.radius) / 40));
      const ready = d <= t.radius && Math.abs(s.speed) <= ARRIVE_SPEED;
      o.marker.update(dt, near, ready);
    }

    audioRef?.current?.update(
      Math.min(1, Math.abs(s.speed) / o.drive.maxSpeed),
      input.throttle,
      s.sliding,
      isPaused,
    );

    /* --------------------------------------------------------------- readouts */

    live.x = s.x;
    live.z = s.z;
    live.yaw = s.yaw;
    live.speed = s.speed;
    live.camYaw = camYaw;
    live.traffic = o.traffic.cars;
    if (o.run) {
      const t = o.run.target;
      live.targetX = t.x;
      live.targetZ = t.z;
      live.stage = t.stage;
    }

    o.hudTimer += dt;
    if (o.hudTimer >= HUD_INTERVAL) {
      o.hudTimer = 0;
      flushHud(o, s, camYaw, hudStore);
    }
  });

  return null;
}

/* ------------------------------------------------------------------ helpers */

function handleImpact(o, impact, soft, settings) {
  const now = performance.now();
  if (now - o.lastCollision < 260) return; // one hit per scrape, not per frame
  o.lastCollision = now;
  o.chase.kick(Math.min(0.55, impact * 0.05));
  if (impact > 3) sfx.crash(settings.sound, impact);
  else sfx.scrape(settings.sound);
  if (impact > 2.2) o.run?.hit(impact);
  if (o.spray) {
    for (let i = 0; i < 5; i++) {
      o.spray.emit(o.state.x, 0.4, o.state.z, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 1.6, 0.4);
    }
  }
}

function handleRunEvent(o, e, settings, emit) {
  if (e.type === "pickup") {
    sfx.pickup(settings.sound);
    o.marker.setTarget(e.next.x, e.next.z, e.next.radius, e.next.stage);
  } else if (e.type === "stop") {
    sfx.stop(settings.sound);
    o.marker.setTarget(e.next.x, e.next.z, e.next.radius, e.next.stage);
  } else if (e.type === "complete") {
    sfx.deliver(settings.sound);
    o.marker.hide();
    e.result = o.run.result(o.state);
  } else if (e.type === "fail") {
    sfx.fail(settings.sound);
    o.marker.hide();
    e.result = o.run.result(o.state);
  }
  emit?.(e);
}

function respawn(o) {
  const p = o.world.nearestRoadPoint(o.state.x, o.state.z);
  const s = o.state;
  s.x = p.x;
  s.z = p.z;
  s.yaw = p.yaw;
  s.vx = 0;
  s.vz = 0;
  s.speed = 0;
  s.lateral = 0;
  s.y = 0.02;
  o.offRoad = 0;
  o.chase.reset(s);
}

function emitSpray(o, s, dt) {
  const speed = Math.abs(s.speed);
  if (speed < 3) return;
  const wet = o.weather.wetness > 0.3;
  const loose = s.surface && s.surface.grip < 0.8;
  const slipping = s.sliding > 0.35;
  if (!wet && !loose && !slipping) return;
  o.sprayAcc = (o.sprayAcc || 0) + dt * (speed * (slipping ? 2.4 : 0.9));
  while (o.sprayAcc > 1) {
    o.sprayAcc -= 1;
    const back = -1.3;
    const side = (Math.random() - 0.5) * 1.6;
    const fx = Math.sin(s.yaw);
    const fz = Math.cos(s.yaw);
    o.spray.emit(
      s.x + fx * back + fz * side,
      s.y,
      s.z + fz * back - fx * side,
      -fx * 2 + (Math.random() - 0.5),
      -fz * 2 + (Math.random() - 0.5),
      1.1,
      loose ? 0.75 : 0.5,
    );
  }
}

function flushHud(o, s, camYaw, hudStore) {
  const run = o.run;
  const snap = run ? run.snapshot(s) : null;
  const speed = Math.abs(s.speed) * 3.6;

  let arrowAngle = 0;
  let onScreen = false;
  if (snap) {
    // bearing to the target relative to where the camera is looking
    const dx = snap.targetX - s.x;
    const dz = snap.targetZ - s.z;
    const world = Math.atan2(dx, dz);
    let rel = world - camYaw;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    arrowAngle = rel;
    onScreen = Math.abs(rel) < 0.5 && snap.distance < 140;
  }

  hudStore.set({
    speed,
    gear: s.reversing && s.speed < -0.3 ? "R" : Math.abs(s.speed) < 0.4 ? "N" : "D",
    timeLeft: snap?.timeLeft ?? 0,
    distance: snap?.distance ?? 0,
    targetName: snap?.targetName ?? "",
    targetLabel: snap?.targetLabel ?? "",
    stage: snap?.stage ?? "pickup",
    condition: snap?.condition ?? 100,
    collisions: snap?.collisions ?? 0,
    carrying: snap?.carrying ?? false,
    remainingStops: snap?.remainingStops ?? 0,
    arrowAngle,
    onScreen,
    ready: snap ? snap.distance <= snap.targetRadius : false,
    offRoad: o.offRoad > 0.4,
    sliding: s.sliding,
    braking: s.braking,
  });
}
