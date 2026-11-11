/**
 * Portal Shift — portal frame maths shared by the simulation and renderer.
 *
 * Every portal has an orthonormal frame: n (out of the surface), up, and
 * right = up × n. Passing through maps a vector expressed in the entry frame
 * (a·right + b·up + c·n) to (−a·right' + b·up' − c·n') in the exit frame — a
 * half turn about "up", so walking INTO one portal means walking OUT of the
 * other with the same speed.
 */
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);

export const FACES = {
  px: [1, 0, 0],
  nx: [-1, 0, 0],
  py: [0, 1, 0],
  ny: [0, -1, 0],
  pz: [0, 0, 1],
  nz: [0, 0, -1],
};

export function axisOf(n) {
  return n[0] !== 0 ? 0 : n[1] !== 0 ? 1 : 2;
}

/** Snap a horizontal direction to the nearest axis (for floor/ceiling portal "up"). */
export function snapHorizontal(v) {
  if (Math.abs(v[0]) >= Math.abs(v[2])) return [Math.sign(v[0]) || 1, 0, 0];
  return [0, 0, Math.sign(v[2]) || 1];
}

export function mapVec(pin, pout, v) {
  const a = dot(v, pin.right), b = dot(v, pin.up), c = dot(v, pin.n);
  return [
    -a * pout.right[0] + b * pout.up[0] - c * pout.n[0],
    -a * pout.right[1] + b * pout.up[1] - c * pout.n[1],
    -a * pout.right[2] + b * pout.up[2] - c * pout.n[2],
  ];
}

export function mapPoint(pin, pout, p) {
  const d = [p[0] - pin.center[0], p[1] - pin.center[1], p[2] - pin.center[2]];
  const m = mapVec(pin, pout, d);
  return [pout.center[0] + m[0], pout.center[1] + m[1], pout.center[2] + m[2]];
}

/** 4×4 column-major matrix taking world space at the entry portal to world space at the exit. */
export function portalMatrix(pin, pout) {
  const ex = mapVec(pin, pout, [1, 0, 0]);
  const ey = mapVec(pin, pout, [0, 1, 0]);
  const ez = mapVec(pin, pout, [0, 0, 1]);
  const t = mapPoint(pin, pout, [0, 0, 0]);
  return [ex[0], ex[1], ex[2], 0, ey[0], ey[1], ey[2], 0, ez[0], ez[1], ez[2], 0, t[0], t[1], t[2], 1];
}

export function lookVector(yaw, pitch) {
  const c = Math.cos(pitch);
  return [-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c];
}

export function yawOf(v) {
  return Math.atan2(-v[0], -v[2]);
}
