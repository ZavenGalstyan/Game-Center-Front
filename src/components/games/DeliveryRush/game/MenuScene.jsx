/**
 * Delivery Rush — the menu backdrop.
 *
 * A live 3D street with the player's own car parked at the kerb and traffic
 * running through the junction, with the camera drifting slowly around the car.
 * It uses the same district palette and weather as whichever zone the player
 * was last in, so the menu changes character as the career progresses.
 *
 * Kept deliberately small (one intersection, four blocks) — it is a menu, and
 * it should not cost more to look at than the game costs to play.
 */

import { useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { buildDiorama } from "../world/layouts/diorama.js";
import { buildCityMesh } from "../world/cityMesh.js";
import { buildVehicle } from "../world/vehicleModel.js";
import { buildSky, buildEnvMap } from "./skyDome.js";
import { buildLights, buildFog } from "./lighting.js";
import { createWeather } from "./weather.js";
import { createTrafficRenderer } from "./trafficRenderer.js";
import { createHeadlights } from "./headlights.js";
import { TrafficSystem } from "../systems/traffic.js";
import { TRAFFIC_TYPES } from "../world/trafficModel.js";
import { getWeather } from "../data/zones.js";

const dioramaCache = new Map();

function getDiorama(zone) {
  let d = dioramaCache.get(zone.id);
  if (!d) {
    d = buildDiorama(zone);
    dioramaCache.set(zone.id, d);
  }
  return d;
}

function Diorama({ zone, theme, vehicle, paintHex, quality, orbit }) {
  const { scene, camera, gl } = useThree();
  const ref = useRef(null);
  const layout = useMemo(() => getDiorama(zone), [zone]);
  const detail = quality === "low" ? 0 : quality === "medium" ? 1 : 2;

  useLayoutEffect(() => {
    const root = new THREE.Group();
    const city = buildCityMesh(layout, theme, detail);
    root.add(city.group);
    const sky = buildSky(zone, theme);
    root.add(sky.group);
    const envMap = buildEnvMap(gl, zone, theme);
    scene.environment = envMap.texture;
    const lights = buildLights(zone, theme, quality === "low" ? "low" : "medium");
    root.add(lights.group);

    const car = buildVehicle(vehicle.body, paintHex, { night: theme.night });
    car.group.position.set(layout.spawn.x, 0.02, layout.spawn.z);
    car.group.rotation.y = layout.spawn.yaw;
    root.add(car.group);
    car.shadow.mesh.position.set(layout.spawn.x, 0.028, layout.spawn.z);
    car.shadow.mesh.rotation.y = layout.spawn.yaw;
    root.add(car.shadow.mesh);
    const beams = createHeadlights(car.dims, { quality: "medium", night: theme.night });
    car.group.add(beams.group);
    beams.set(theme.night ? 1 : 0, 1);
    car.materials.head.color.setScalar(theme.night ? 1 : 0.35);
    car.materials.tail.color.setScalar(theme.night ? 0.85 : 0.4);
    car.materials.reverse.color.setScalar(0.05);

    const meta = TRAFFIC_TYPES.map((t) => ({ speed: t.speed, hw: t.W / 2 + 0.15, hd: t.L / 2 + 0.15 }));
    const traffic = new TrafficSystem(layout, meta, {
      density: quality === "low" ? "low" : "medium",
      seed: zone.seed + 77,
    });
    const trafficView = createTrafficRenderer(traffic.cars, theme);
    root.add(trafficView.group);

    const rain = createWeather(zone.weather, quality === "high" ? "medium" : "low");
    if (rain) root.add(rain.mesh);

    const prevFog = scene.fog;
    const prevBg = scene.background;
    const prevEnv = scene.environment;
    scene.fog = buildFog(zone, "medium");
    scene.background = new THREE.Color(zone.palette.fog);
    scene.add(root);

    lights.update(layout.spawn);
    ref.current = { root, city, sky, lights, car, beams, traffic, trafficView, rain, t: 0 };

    return () => {
      scene.remove(root);
      scene.fog = prevFog;
      scene.background = prevBg;
      scene.environment = prevEnv;
      envMap.dispose();
      rain?.dispose();
      trafficView.dispose();
      beams.dispose();
      car.dispose();
      lights.dispose();
      sky.dispose();
      city.dispose();
      root.clear();
      ref.current = null;
    };
  }, [layout, theme, zone, vehicle.id, paintHex, detail, quality, scene]);

  useFrame((_, delta) => {
    const o = ref.current;
    if (!o) return;
    const dt = Math.min(0.05, delta);
    o.t += dt;

    // A slow arc *along* the boulevard rather than around the car: swinging
    // wide would put the camera inside the buildings on either side.
    const a = orbit.base + Math.sin(o.t * orbit.speed) * orbit.sweep;
    const r = orbit.radius + Math.sin(o.t * orbit.speed * 0.6) * 1.4;
    const cx = layout.spawn.x + Math.sin(a) * r;
    const cz = layout.spawn.z + Math.cos(a) * r;
    camera.position.set(cx, orbit.height + Math.sin(o.t * 0.35) * 0.25, cz);
    camera.lookAt(layout.spawn.x - 3.5, 1.15, layout.spawn.z + 0.4);

    o.traffic.update(dt, { x: layout.spawn.x, z: layout.spawn.z }, { recycle: false });
    o.trafficView.sync(o.traffic.cars, theme.night);
    o.sky.update(dt, camera.position);
    o.rain?.update(dt, camera.position, [0, 0], camera.rotation.y);
  });

  return null;
}

export default function MenuScene({ zone, theme, vehicle, paintHex, quality = "high", variant = "menu" }) {
  const orbit = useMemo(
    () =>
      variant === "select"
        ? { base: Math.PI / 2, sweep: 0.22, speed: 0.07, radius: 24, height: 9 }
        : { base: Math.PI / 2, sweep: 0.3, speed: 0.085, radius: 12.5, height: 3.3 },
    [variant],
  );

  return (
    <div className="dr-bgscene" aria-hidden="true">
      <Canvas
        dpr={quality === "low" ? [0.6, 1] : [1, 1.6]}
        gl={{ antialias: quality !== "low", alpha: false, stencil: false }}
        shadows={quality !== "low"}
        camera={{ fov: 42, near: 0.5, far: 700, position: [10, 4, 10] }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = theme.night ? 1.2 : 1.0;
        }}
      >
        <Diorama
          zone={zone}
          theme={theme}
          vehicle={vehicle}
          paintHex={paintHex}
          quality={quality}
          orbit={orbit}
        />
      </Canvas>
    </div>
  );
}
