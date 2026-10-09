/**
 * Zombie Outbreak — the gameplay scene.
 *
 * One logic useFrame (priority −1) owns the loop: apply mouse look, step the
 * engine (unless paused), route its events to audio / effects / view model /
 * HUD, then place the camera and sync zombie rigs. A second useFrame
 * (priority 1) renders: world first, then the view model on top with the
 * depth buffer cleared (no gun-through-wall clipping).
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EYE } from "../engine/game.js";
import { buildArena, animateDynamics } from "./environment.js";
import { applyMood } from "./moods.js";
import { createRig, configureRig, applyPose, disposeRig } from "./zombieRig.js";
import { Effects } from "./effects.js";
import { Viewmodel } from "./viewmodel.js";
import { TEST } from "../utils/testHooks.js";

const tmpV = new THREE.Vector3();
const euler = new THREE.Euler(0, 0, 0, "YXZ");

export default function GameScene({ game, input, audio, settings, paused, onEvents, quality }) {
  const { gl, scene, camera } = useThree();
  const arena = game.arena;
  const indoor = !!arena.ceiling;
  const theme = useMemo(() => applyMood(arena.theme, game.stage.mood || "night", indoor), [arena, game.stage, indoor]);
  const shadows = quality !== "low" && settings.shadows !== "off";

  // ------------------------------------------------ world
  const env = useMemo(() => buildArena(arena, theme, { shadows }), [arena, theme, shadows]);
  useEffect(
    () => () => {
      env.root.traverse((o) => {
        if (o.isMesh || o.isSprite) {
          if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
          if (o.material && !o.material.userData?.shared) o.material.dispose();
        }
      });
    },
    [env],
  );

  // Real point lights for the brightest lamps (the rest are emissive + light pools).
  const maxLights = quality === "high" ? 8 : quality === "low" ? 3 : 6;
  const lampSpecs = useMemo(() => {
    const ranked = arena.lights
      .map((L, i) => ({ L, i, score: L.intensity * (L.kind === "siren" ? 0.6 : 1) * (L.kind === "fire" ? 1.3 : 1) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxLights);
    return ranked;
  }, [arena, maxLights]);
  const lightRefs = useRef([]);

  // ------------------------------------------------ atmosphere
  useEffect(() => {
    scene.background = new THREE.Color(theme.fog);
    scene.fog = new THREE.Fog(theme.fog, theme.fogNear, theme.fogFar);
    gl.toneMappingExposure = theme.exposure || 1;
    return () => {
      scene.fog = null;
      scene.background = null;
    };
  }, [scene, gl, theme]);

  useEffect(() => {
    audio?.setAmbience(arena.theme.ambience || arena.id, indoor);
  }, [audio, arena, indoor]);

  // Static shadow map: render it once (props never move; zombies use blob shadows).
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    const id = setTimeout(() => {
      gl.shadowMap.needsUpdate = true;
    }, 300);
    return () => clearTimeout(id);
  }, [gl, env]);

  // ------------------------------------------------ zombies
  const rigs = useMemo(() => game.zombies.map(() => createRig()), [game]);
  const rigGroup = useMemo(() => {
    const g = new THREE.Group();
    for (const r of rigs) g.add(r.root);
    return g;
  }, [rigs]);
  useEffect(() => () => rigs.forEach(disposeRig), [rigs]);

  // ------------------------------------------------ effects + view model
  const fx = useMemo(() => new Effects(scene), [scene]);
  useEffect(() => {
    if (theme.rain) {
      const b = arena.bounds;
      fx.enableRain([(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2], Math.max(b.maxX - b.minX, b.maxZ - b.minZ) + 10);
    }
    return () => fx.dispose();
  }, [fx, theme, arena]);
  const vm = useMemo(() => new Viewmodel(game.arsenal.slots.map((s) => s.def.id)), [game]);
  useEffect(() => {
    vm.setTint(theme);
    return () => vm.dispose();
  }, [vm, theme]);

  // Soft image-based lighting so metal (guns, cars) reads instead of going black.
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = indoor ? 0.22 : 0.18;
    vm.scene.environment = env;
    vm.scene.environmentIntensity = 0.55;
    return () => {
      scene.environment = null;
      vm.scene.environment = null;
      env.dispose();
      pmrem.dispose();
      room.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          o.material.dispose();
        }
      });
    };
  }, [gl, scene, vm, indoor]);

  // Muzzle-flash light in the world (one, reused — constant light count).
  const muzzleLight = useRef();
  const hemiRef = useRef();
  const dirRef = useRef();
  const st = useRef({ shake: 0, lightning: 0, nextBolt: 4, deathFall: 0, flashT: 0, lookX: 0, lookY: 0 });

  // The light's target must live in the scene or its matrix never updates.
  useEffect(() => {
    const l = dirRef.current;
    if (!l) return undefined;
    scene.add(l.target);
    l.target.updateMatrixWorld();
    return () => scene.remove(l.target);
  }, [scene]);

  useEffect(() => {
    if (TEST) window.__zo = { ...(window.__zo || {}), scene, camera, gl, fx, vm };
  }, [scene, camera, gl, fx, vm]);

  // ================================================================== logic frame
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = st.current;
    const p = game.player;
    let lookX = 0;
    let lookY = 0;
    if (!paused) {
      const [dx, dy] = input.consumeLook();
      lookX = dx;
      lookY = dy;
      game.look(dx, dy * (settings.invertY ? -1 : 1), settings.sensitivity ?? 1);
      game.update(dt, input);
      const events = game.drain();
      if (events.length) {
        audio?.handle(events, game);
        fx.handle(events, game);
        vm.handle(events, game);
        for (const e of events) {
          if (e.type === "zhit") {
            const z = game.zombies.find((q) => q.id === e.id);
            if (z) rigs[z.slot].flash = e.zone === 0 ? 1 : 0.7;
          }
          if (e.type === "shot") {
            s.flashT = 0.05;
            // Tracers from the muzzle (every shot for automatics is too busy: every other).
            const mz = vm.muzzle(camera, tmpV);
            e.tracers.forEach((t, i) => {
              if (game.arsenal.def.pellets > 1 && i > 2) return;
              fx.tracer(mz.x, mz.y, mz.z, t[0], t[1], t[2], game.arsenal.def.energy ? "#7ae0ff" : "#ffe6a0", game.arsenal.def.energy ? 0.03 : 0.012);
            });
          }
          if (e.type === "boss_spawn" || e.type === "slam" || e.type === "explode") {
            const d = Math.hypot((e.x ?? p.x) - p.x, (e.z ?? p.z) - p.z);
            s.shake = Math.max(s.shake, e.type === "boss_spawn" ? 0.6 : Math.max(0, 0.7 - d * 0.04));
          }
        }
        onEvents?.(events);
      }
      audio?.update(dt, game);
    } else {
      input.consumeLook();
    }

    // ------------------------------------------------ camera
    const reduced = settings.reducedMotion;
    const bobK = reduced ? 0 : settings.cameraBob ?? 1;
    const shakeK = reduced ? 0 : settings.cameraShake ?? 1;
    const ph = p.bobPhase;
    const moving = p.grounded && p.speed > 0.5 ? Math.min(1, p.speed / 4.6) : 0;
    s.bob = (s.bob || 0) + (moving * (1 - p.ads * 0.7) - (s.bob || 0)) * Math.min(1, dt * 8);
    const bobY = Math.abs(Math.sin(ph)) * 0.035 * s.bob * bobK;
    const bobX = Math.cos(ph) * 0.02 * s.bob * bobK;
    s.shake = Math.max(0, s.shake - dt * 1.8);
    const shake = (Math.max(game.shake, s.shake) * 0.05 + (p.hurtT > 0 ? p.hurtT * 0.02 : 0)) * shakeK * (paused ? 0 : 1);
    const t = state.clock.elapsedTime;
    const sx = (Math.sin(t * 47) + Math.sin(t * 29.3)) * shake;
    const sy = (Math.sin(t * 53.7) + Math.sin(t * 23.1)) * shake;

    let eyeY = p.y + EYE + bobY - p.landDip * 0.12;
    let roll = Math.sin(ph * 0.5) * 0.004 * s.bob * bobK;
    let pitchExtra = 0;
    if (!p.alive) {
      // Collapse to the ground.
      const k = Math.min(1, p.deathT / 1.1);
      const e = k * k * (3 - 2 * k);
      eyeY = p.y + EYE - e * 1.35;
      roll = e * 0.55;
      pitchExtra = e * 0.35;
    }
    const sxw = Math.cos(p.yaw) * bobX;
    const szw = -Math.sin(p.yaw) * bobX;
    camera.position.set(p.x + sxw, eyeY, p.z + szw);
    euler.set(p.pitch + p.recoilP + sy + pitchExtra, p.yaw + p.recoilY + sx, roll);
    camera.quaternion.setFromEuler(euler);
    const baseFov = settings.fov || 74;
    const zoom = 1 - (1 - game.arsenal.def.adsZoom) * p.ads;
    const fov = baseFov * zoom;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();

    // ------------------------------------------------ zombies
    for (let i = 0; i < rigs.length; i++) {
      const z = game.zombies[i];
      const r = rigs[i];
      if (!z.active) {
        r.root.visible = false;
        continue;
      }
      if (r.gen !== z.gen) configureRig(r, z);
      r.root.visible = true;
      applyPose(r, z, t);
    }

    // ------------------------------------------------ lights + env animation
    const lights = lightRefs.current.filter(Boolean);
    animateDynamics(env.dynamics, t, dt, lights);
    if (muzzleLight.current) {
      s.flashT = Math.max(0, s.flashT - dt);
      const ml = muzzleLight.current;
      ml.intensity = s.flashT > 0 ? (game.arsenal.def.energy ? 14 : 22) : 0;
      ml.color.set(game.arsenal.def.energy ? "#5ad8ff" : "#ffb860");
      camera.getWorldDirection(tmpV);
      ml.position.set(camera.position.x + tmpV.x * 1.2, camera.position.y + tmpV.y * 1.2 - 0.1, camera.position.z + tmpV.z * 1.2);
    }
    if (theme.lightning && !paused) {
      s.nextBolt -= dt;
      if (s.nextBolt <= 0) {
        s.nextBolt = 6 + Math.random() * 9;
        s.lightning = 0.35;
      }
      s.lightning = Math.max(0, s.lightning - dt);
    }
    const flick = s.lightning > 0 && Math.sin(s.lightning * 60) > -0.2 ? 1 : 0;
    if (hemiRef.current) hemiRef.current.intensity = theme.hemi + flick * 2.2;

    fx.update(dt, game, camera);
    vm.update(dt, game, lookX, lookY, settings, camera);
  }, -1);

  // ================================================================== render
  useFrame(() => {
    gl.autoClear = false;
    gl.clear();
    gl.render(scene, camera);
    gl.clearDepth();
    gl.render(vm.scene, vm.camera);
  }, 1);

  const moonDir = theme.moonDir || [-0.45, 1, 0.35];
  const b = arena.bounds;
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.62;
  const shadowSize = settings.shadows === "high" && quality === "high" ? 4096 : 2048;

  return (
    <>
      <hemisphereLight ref={hemiRef} args={[theme.hemiSky, theme.hemiGround, theme.hemi]} />
      <ambientLight intensity={indoor ? 0.18 : 0.12} color={theme.hemiSky} />
      <directionalLight
        ref={dirRef}
        position={[cx + moonDir[0] * 60, moonDir[1] * 60, cz + moonDir[2] * 60]}
        target-position={[cx, 0, cz]}
        intensity={theme.moonInt}
        color={theme.moon}
        castShadow={shadows}
        shadow-mapSize-width={shadowSize}
        shadow-mapSize-height={shadowSize}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
        shadow-camera-near={1}
        shadow-camera-far={180}
        shadow-bias={-0.0006}
        shadow-normalBias={0.03}
      />
      {lampSpecs.map(({ L, i }, k) => {
        const lampK = L.kind === "emergency" || L.kind === "warning" ? theme.emergency : L.kind === "fire" || L.kind === "siren" ? 1 : theme.lampScale;
        const base = L.intensity * 26 * lampK;
        return (
          <pointLight
            key={i}
            ref={(el) => {
              lightRefs.current[k] = el;
              if (el) {
                el.userData.base = base;
                el.userData.dyn = env.dynamics.find((d) => d.type === "lamp" && d.index === i);
              }
            }}
            position={[L.x, L.y - 0.3, L.z]}
            color={L.color}
            intensity={base}
            distance={L.distance * 1.4}
            decay={1.6}
          />
        );
      })}
      <pointLight ref={muzzleLight} intensity={0} distance={14} decay={1.8} color="#ffb860" />
      <primitive object={env.root} />
      <primitive object={rigGroup} />
    </>
  );
}
