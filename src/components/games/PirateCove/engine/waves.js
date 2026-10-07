/**
 * Pirate Cove — the swell. One set of analytic waves shared by the ship
 * physics (bobbing, pitch, roll, cannonball splashes, floating loot) and the
 * ocean vertex shader (three/ocean.js builds its GLSL from WAVES), so a ship
 * always sits on the water you actually see.
 *
 * Deep-water dispersion (ω = √(g·k)) keeps long swells slow and short chop
 * quick, which is most of what makes the sea read as "big".
 */

const G = 9.81;

// dir is normalized below; len in metres; amp in metres at amplitude 1.
const RAW = [
  { dir: [0.82, 0.57], len: 52, amp: 0.5, phase: 0.0 },
  { dir: [-0.38, 0.92], len: 31, amp: 0.3, phase: 1.7 },
  { dir: [0.96, -0.27], len: 17, amp: 0.15, phase: 4.1 },
  { dir: [-0.71, -0.7], len: 10, amp: 0.07, phase: 2.6 },
];

export const WAVES = RAW.map((w) => {
  const l = Math.hypot(w.dir[0], w.dir[1]);
  const k = (Math.PI * 2) / w.len;
  return { dx: w.dir[0] / l, dz: w.dir[1] / l, k, w: Math.sqrt(G * k), amp: w.amp, phase: w.phase };
});

/** Water surface height at (x, z), time t, region amplitude `A`. */
export function waveHeight(x, z, t, A) {
  let h = 0;
  for (let i = 0; i < WAVES.length; i++) {
    const W = WAVES[i];
    h += W.amp * Math.sin(W.k * (W.dx * x + W.dz * z) - W.w * t + W.phase);
  }
  return h * A;
}

/** GLSL source for the same function: `float waveH(vec2 p, float t)` (amplitude applied by caller). */
export function wavesGLSL() {
  const terms = WAVES.map(
    (W) =>
      `${W.amp.toFixed(4)} * sin(${W.k.toFixed(5)} * dot(p, vec2(${W.dx.toFixed(5)}, ${W.dz.toFixed(5)})) - ${W.w.toFixed(5)} * t + ${W.phase.toFixed(4)})`,
  ).join("\n    + ");
  const grads = WAVES.map(
    (W) =>
      `g += ${(W.amp * W.k).toFixed(5)} * cos(${W.k.toFixed(5)} * dot(p, vec2(${W.dx.toFixed(5)}, ${W.dz.toFixed(5)})) - ${W.w.toFixed(5)} * t + ${W.phase.toFixed(4)}) * vec2(${W.dx.toFixed(5)}, ${W.dz.toFixed(5)});`,
  ).join("\n    ");
  return `
  float waveH(vec2 p, float t) {
    return ${terms};
  }
  vec2 waveGrad(vec2 p, float t) {
    vec2 g = vec2(0.0);
    ${grads}
    return g;
  }`;
}
