/**
 * Alpine Rush — one race's 3D scene and its frame loop.
 *
 * The loop (priority −1, so R3F keeps auto-rendering and it runs before the
 * camera / effects) steps the race with the shared input, drains its events
 * and fans them out: audio, snow bursts, camera dips and the React HUD
 * (onEvents). The sun's shadow box follows the player, so one small shadow
 * map stays crisp (only skiers + nearby furniture cast); every skier also
 * gets a soft blob shadow, which is what makes jumps readable.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { buildWorld } from "./world.js";
import { createSkierModel } from "./skierModel.js";
import CameraRig from "./CameraRig.jsx";
import Sky, { sunDir } from "./Sky.jsx";
import { Spray, Weather } from "./Effects.jsx";
import { windUniforms } from "./geo.js";
import { shadowTex, setTextureQuality } from "./textures.js";
import { RSTATE } from "../engine/race.js";
import { SKI_BY_ID, DEFAULT_CUSTOM } from "../data/skis.js";
import { Sizer, TEST } from "../utils/testHooks.js";

export function Lights({ world, focus, shadows, mapSize = 1024 }) {
  const sun = useRef();
  const { scene } = useThree();
  const sky = world.sky;
  const dir = useMemo(() => sunDir(sky), [sky]);
  useEffect(() => {
    scene.fog = new THREE.Fog(sky.fog, sky.fogNear, sky.fogFar);
    scene.background = new THREE.Color(sky.horizon);
    return () => {
      scene.fog = null;
      scene.background = null;
    };
  }, [scene, sky]);
  useFrame(() => {
    const f = focus();
    if (!sun.current) return;
    sun.current.position.set(f.x + dir.x * 60, f.y + dir.y * 60, f.z + dir.z * 60);
    sun.current.target.position.set(f.x, f.y, f.z);
    sun.current.target.updateMatrixWorld();
  });
  return (
    <>
      <directionalLight
        ref={sun}
        color={sky.sun}
        intensity={sky.light}
        castShadow={shadows}
        shadow-mapSize-width={mapSize}
        shadow-mapSize-height={mapSize}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-near={5}
        shadow-camera-far={130}
        shadow-bias={-0.0006}
        shadow-normalBias={0.04}
      />
      <hemisphereLight args={[sky.hemiSky, sky.hemiGround, sky.ambient]} />
    </>
  );
}

function nameTag(name, color) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(8,18,40,0.7)";
  g.beginPath();
  g.roundRect(8, 10, 240, 44, 22);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.arc(34, 32, 9, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#fff";
  g.font = "700 26px 'Segoe UI', Arial, sans-serif";
  g.textBaseline = "middle";
  g.fillText(name, 52, 33);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Model state from the simulation (shared with the menu / garage). */
export function poseOf(K, T, t, extra = {}) {
  const S = K.loc ? T.interp(K.loc.s).a : null;
  const slope = K.air ? Math.max(-0.3, Math.min(0.5, -Math.atan2(K.vy, Math.max(3, Math.hypot(K.ax, K.az))) * 0.5)) : S ? Math.atan(S.grade) : 0;
  return {
    speed: K.vF,
    tuck: K.tuck,
    plow: K.plow,
    steer: K.steerVis,
    lean: K.lean,
    air: K.air,
    compress: K.compress,
    crash: K.crash,
    hold: K.hold,
    pole: K.pole,
    slope,
    t,
    ...extra,
  };
}

/** One skier: model + blob shadow (+ name tag for rivals), driven from the sim. */
function RaceSkier({ racer, race, G, shadows, custom, skiId }) {
  const built = useMemo(() => {
    const suit = racer.isPlayer ? custom || DEFAULT_CUSTOM : racer.colors;
    const skiSet = SKI_BY_ID.get(skiId) || SKI_BY_ID.get("starter");
    const ski = racer.isPlayer ? { ...skiSet.colors, pattern: skiSet.pattern } : { ...racer.skiLook, pattern: "stripe" };
    const m = createSkierModel({ suit, ski, design: racer.isPlayer ? custom?.design || "set" : "set", shadows: shadows && racer.isPlayer, blobTex: shadowTex() });
    let tag = null;
    if (!racer.isPlayer) {
      const tex = nameTag(racer.name.split(" ")[0], racer.colors.jacket);
      tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
      tag.scale.set(2.2, 0.55, 1);
      tag.renderOrder = 5;
    }
    return { m, tag };
  }, [racer, shadows, custom, skiId]);
  useEffect(
    () => () => {
      built.m.dispose();
      if (built.tag) {
        built.tag.material.map.dispose();
        built.tag.material.dispose();
      }
    },
    [built],
  );
  const { camera } = useThree();
  const clock = useRef(0);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    clock.current += dt;
    const K = racer.sk;
    const { m, tag } = built;
    m.root.position.set(K.x, K.y, K.z);
    m.root.rotation.set(0, K.h, 0);
    const won = race.state === RSTATE.FINISHED && racer.isPlayer && race.results && (race.results.medal || race.results.free);
    m.update(poseOf(K, race.T, clock.current, { victory: won && Math.max(0, K.vF) < 3 }), dt);
    if (m.blob) {
      const gy = K.gnd ? (K.gnd.fall ? (G ? G.heightAt(K.x, K.z) : K.gnd.y) : K.gnd.y) : K.y;
      const above = Math.max(0, K.y - gy);
      m.blob.position.set(K.x, gy + 0.05, K.z);
      m.blob.rotation.set(-Math.PI / 2, 0, K.h);
      const k = Math.max(0.15, 1 - above / 8);
      m.blob.scale.set(k + above * 0.05, k + above * 0.05, 1);
      m.blob.material.opacity = k;
    }
    // a rival right next to the camera never blocks the view of the slope
    if (!racer.isPlayer) {
      const dc = Math.hypot(camera.position.x - K.x, camera.position.y - (K.y + 1), camera.position.z - K.z);
      m.root.visible = dc > 3.5;
    }
    if (tag) {
      tag.position.set(K.x, K.y + 2.3, K.z);
      const d = camera.position.distanceTo(tag.position);
      tag.visible = d < 70 && d > 6 && !K.crash && race.state !== RSTATE.COUNTDOWN;
      tag.material.opacity = Math.min(1, (70 - d) / 20);
    }
  });
  return (
    <>
      <primitive object={built.m.root} />
      {built.m.blob && <primitive object={built.m.blob} />}
      {built.tag && <primitive object={built.tag} />}
    </>
  );
}

/**
 * Adaptive resolution: a slow machine drops render resolution (down to 0.5×)
 * instead of frames; it climbs back when there is headroom again.
 */
export function AutoRes({ min = 0.5 }) {
  const { gl, setDpr } = useThree();
  const st = useRef(null);
  useFrame((_, dt) => {
    if (TEST) return;
    if (!st.current) st.current = { t: 0, n: 0, dpr: gl.getPixelRatio(), max: gl.getPixelRatio(), good: 0 };
    const s = st.current;
    if (dt > 0.5) return; // tab switch / hitch: not a measurement
    s.t += dt;
    s.n++;
    if (s.t < 1.2) return;
    const fps = s.n / s.t;
    s.t = 0;
    s.n = 0;
    let next = s.dpr;
    if (fps < 48 && s.dpr > min + 0.01) {
      next = Math.max(min, s.dpr - (fps < 30 ? 0.2 : 0.1));
      s.good = 0;
    } else if (fps > 58 && s.dpr < s.max - 0.01) {
      if (++s.good >= 3) {
        next = Math.min(s.max, s.dpr + 0.05);
        s.good = 0;
      }
    } else s.good = 0;
    if (next !== s.dpr) {
      s.dpr = next;
      setDpr(next);
    }
  });
  return null;
}

export function WorldMesh({ T, G, world, quality, race }) {
  const built = useMemo(() => buildWorld(T, G, world, quality), [T, G, world, quality]);
  useEffect(() => () => built.dispose(), [built]);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += Math.min(dt, 0.05);
    windUniforms.uTime.value = t.current;
    built.update(t.current, race);
  });
  return <primitive object={built.group} />;
}

export default function RaceScene({ race, G, world, input, audio, settings, settingsRef, paused, onEvents, custom, skiId }) {
  const T = race.T;
  const bus = useRef([]);
  const camBus = useRef([]);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const q = settings.graphics;
  setTextureQuality(q);
  const shadows = q === "high";
  const reduced = !!settings.reducedFx;
  const three = useThree();
  useEffect(() => {
    if (TEST) window.__ar = { ...(window.__ar || {}), gl: three.gl, scene: three.scene, camera: three.camera };
  }, [three.gl, three.scene, three.camera]);
  useEffect(() => {
    windUniforms.uWind.value = reduced ? 0.15 : world.weather === "blizzard" ? 1.4 : 0.5;
  }, [reduced, world.weather]);

  useFrame((_, dtRaw) => {
    if (bus.current.length > 60) bus.current.length = 0;
    if (pausedRef.current) return;
    race.tick(Math.min(dtRaw, 0.2), input);
    const events = race.drain();
    if (events.length) {
      const K = race.player.sk;
      for (const e of events) {
        if (e.type === "land") {
          if (e.airT > 0.25) bus.current.push({ x: K.x, y: K.y, z: K.z, n: 14 + Math.round(e.hard * 20), speed: 2.5 + e.hard * 3, up: 1.6 });
          camBus.current.push({ kind: "land", a: Math.min(1, e.hard + (e.airT > 0.6 ? 0.3 : 0)) });
        } else if (e.type === "crash") {
          bus.current.push({ x: K.x, y: K.y, z: K.z, n: 36, speed: 4, up: 2.4, life: 1.3 });
        } else if (e.type === "hit" || e.type === "net") {
          bus.current.push({ x: K.x, y: K.y, z: K.z, n: 10, speed: 2.5 });
        } else if (e.type === "gate") {
          const g = T.gates[e.n - 1];
          bus.current.push({ x: g.x, y: g.y + 0.3, z: g.z, n: 10, speed: 2, up: 2, life: 0.6 });
        }
      }
      audio?.onEvents(events, race);
      onEvents?.(events);
    }
    audio?.update(race);
  }, -1);

  const focus = () => race.player.sk;
  return (
    <>
      <Sizer />
      <AutoRes />
      <Sky region={world} seed={T.def.seed} />
      <Lights world={world} focus={focus} shadows={shadows} mapSize={q === "high" ? 2048 : 1024} />
      <WorldMesh T={T} G={G} world={world} quality={q} race={race} />
      {race.racers.map((r) => (
        <RaceSkier key={r.id} racer={r} race={race} G={G} shadows={shadows} custom={custom} skiId={skiId} />
      ))}
      <Spray race={race} bus={bus} quality={q} reduced={reduced} />
      <Weather world={world} race={race} quality={q} reduced={reduced} />
      <CameraRig race={race} G={G} settingsRef={settingsRef} camBus={camBus} />
    </>
  );
}
