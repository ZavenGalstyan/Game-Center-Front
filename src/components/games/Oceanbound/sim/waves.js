/**
 * Oceanbound — the ocean surface. One height function shared by the
 * simulation (buoyancy, swimming, the raft's bob) and the water shader
 * (WAVE_GLSL is generated from the same constants), so floating things sit
 * exactly on the waves the player sees.
 */
const G = 9.81;
const W = [
  // direction (deg), wavelength (m), amplitude (m), phase
  [12, 34, 0.32, 0.0],
  [-28, 19, 0.17, 1.7],
  [55, 11.5, 0.085, 4.1],
  [-70, 7.3, 0.05, 2.3],
  [140, 4.9, 0.025, 5.4],
];
export const WAVES = W.map(([deg, len, amp, ph]) => {
  const a = (deg * Math.PI) / 180;
  const k = (Math.PI * 2) / len;
  return { dx: Math.cos(a), dz: Math.sin(a), k, amp, ph, w: Math.sqrt(G * k) * 0.85 };
});
export const MAX_WAVE = WAVES.reduce((s, w) => s + w.amp, 0);

/** sea level (y) at a world position and time */
export function waveHeight(x, z, t) {
  let h = 0;
  for (let i = 0; i < WAVES.length; i++) {
    const q = WAVES[i];
    h += q.amp * Math.sin((q.dx * x + q.dz * z) * q.k - q.w * t + q.ph);
  }
  return h;
}
/** surface slope (dh/dx, dh/dz) */
export function waveSlope(x, z, t) {
  let sx = 0;
  let sz = 0;
  for (let i = 0; i < WAVES.length; i++) {
    const q = WAVES[i];
    const c = q.amp * q.k * Math.cos((q.dx * x + q.dz * z) * q.k - q.w * t + q.ph);
    sx += c * q.dx;
    sz += c * q.dz;
  }
  return [sx, sz];
}

const f = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(+v.toFixed(6)));
/** GLSL: float waveH(vec2 p, float t, float fade) and vec2 waveD(...) */
export const WAVE_GLSL = `
float waveH(vec2 p, float t, float fade){
  float h = 0.0;
${WAVES.map((q, i) => `  h += ${f(q.amp)} * sin(dot(vec2(${f(q.dx)}, ${f(q.dz)}), p) * ${f(q.k)} - ${f(q.w)} * t + ${f(q.ph)})${i >= 3 ? " * fade" : ""};`).join("\n")}
  return h;
}
vec2 waveD(vec2 p, float t, float fade){
  vec2 d = vec2(0.0);
${WAVES.map((q, i) => `  d += vec2(${f(q.dx)}, ${f(q.dz)}) * (${f(q.amp * q.k)} * cos(dot(vec2(${f(q.dx)}, ${f(q.dz)}), p) * ${f(q.k)} - ${f(q.w)} * t + ${f(q.ph)}))${i >= 3 ? " * fade" : ""};`).join("\n")}
  return d;
}
`;
