/**
 * Test driver: full gas, but eases off when the nose climbs too far, and in
 * the air uses gas/brake to match the slope below. Works headless and in the
 * browser (`__bot(true)` in the harness).
 */
export function botInput(w, { flip = false } = {}) {
  const c = w.chassis;
  const { dy } = w.terrain.at(c.x + 2);
  const rel = c.a - Math.atan(dy); // + = nose up relative to the ground
  if (!w.grounded) {
    if (flip) return { gas: true };
    return rel > 0.25 ? { brake: true } : rel < -0.25 ? { gas: true } : {};
  }
  if (rel > 0.75) return { brake: c.w > 0.4 }; // wheelie: lift off / tap brake
  return { gas: true };
}
