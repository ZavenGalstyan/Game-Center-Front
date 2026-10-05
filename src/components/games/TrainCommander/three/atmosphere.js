/**
 * Train Commander — lighting + sky per region × time of day × weather.
 * Visual only. Night keeps strong lamp/hemisphere fill so combat stays
 * readable (silhouettes, projectiles and HP bars never get lost).
 */
import * as THREE from "three";

const mix = (a, b, k) => "#" + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString();

export function atmosphere(R, time = "day", weather = "clear") {
  const A = {
    skyTop: R.skyTop,
    sky: R.sky,
    horizon: R.horizon,
    fog: R.fog,
    fogNear: R.fogNear,
    fogFar: R.fogFar,
    sun: R.sun,
    sunI: R.sunI,
    hemiSky: R.hemiSky,
    hemiGround: R.hemiGround,
    hemiI: R.hemiI,
    ambient: 0.22,
    exposure: 1.0,
    lamps: 0.35, // lamp glow strength
    sunPos: [-40, 60, 30],
    night: false,
    weather,
    time,
  };
  if (time === "morning") {
    Object.assign(A, { sun: mix(R.sun, "#ffd2a0", 0.5), sunI: R.sunI * 0.85, horizon: mix(R.horizon, "#ffd9b8", 0.4), fog: mix(R.fog, "#f4dccb", 0.35), sunPos: [-60, 34, 20] });
  } else if (time === "sunset") {
    Object.assign(A, {
      skyTop: mix(R.skyTop, "#3b4a7a", 0.5),
      sky: mix(R.sky, "#f08a4b", 0.55),
      horizon: mix(R.horizon, "#ffb36b", 0.65),
      fog: mix(R.fog, "#e09a6a", 0.5),
      sun: "#ffb070",
      sunI: R.sunI * 0.75,
      hemiSky: mix(R.hemiSky, "#ffb88a", 0.5),
      hemiI: R.hemiI * 0.9,
      lamps: 0.6,
      sunPos: [-70, 22, -10],
    });
  } else if (time === "dusk") {
    Object.assign(A, { skyTop: mix(R.skyTop, "#1b1a33", 0.4), sky: mix(R.sky, "#5a4a78", 0.35), fog: mix(R.fog, "#4a4260", 0.3), sunI: R.sunI * 0.85, hemiI: R.hemiI * 1.15, ambient: 0.32, lamps: 0.8 });
  } else if (time === "night") {
    Object.assign(A, {
      skyTop: "#070b1a",
      sky: mix(R.sky, "#15203d", 0.82),
      horizon: mix(R.horizon, "#2a3658", 0.8),
      fog: mix(R.fog, "#1a2238", 0.82),
      sun: "#9db4ff",
      sunI: 0.75,
      hemiSky: "#6f86c8",
      hemiGround: mix(R.hemiGround, "#1c2030", 0.6),
      hemiI: 1.1,
      ambient: 0.36,
      lamps: 1.6,
      sunPos: [30, 50, 20],
      night: true,
    });
  }
  if (weather === "fog") Object.assign(A, { fogNear: A.fogNear * 0.55, fogFar: A.fogFar * 0.62 });
  if (weather === "dust") Object.assign(A, { fog: mix(A.fog, "#d8a86a", 0.5), fogNear: A.fogNear * 0.5, fogFar: A.fogFar * 0.65, sunI: A.sunI * 0.8 });
  if (weather === "rain" || weather === "storm") Object.assign(A, { fog: mix(A.fog, "#6a7480", 0.4), sunI: A.sunI * 0.75, hemiI: A.hemiI * 1.1, fogFar: A.fogFar * 0.8, skyTop: mix(A.skyTop, "#3a4048", 0.5), sky: mix(A.sky, "#68707a", 0.5) });
  if (weather === "snow") Object.assign(A, { fogNear: A.fogNear * 0.8, fogFar: A.fogFar * 0.85 });
  return A;
}
