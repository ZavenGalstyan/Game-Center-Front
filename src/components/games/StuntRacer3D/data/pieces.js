/**
 * Stunt Racer 3D — small helpers for authoring levels (piece grammar in
 * engine/track.js). Jump classes are sized with tools/jumpCalc.mjs against
 * BLAZE's real physics: the gap is cleared from the posted speed (75 km/h
 * when unsigned) and the landing run-out catches a full-speed jump.
 *
 *   class    ramp len/rise  lip slope  gap   drop  posted   air at 148 km/h
 *   small    18 / 2.4       0.27       14    1.5   —        1.3 s
 *   medium   20 / 3         0.30       20    2     —        1.5 s
 *   big      24 / 4         0.33       32    3     100      1.7 s
 *   large    26 / 5         0.38       44    4     115      1.9 s
 *   huge     30 / 7         0.47       58    6     130      2.3 s
 *
 * A jump is [ramp, gap, land]; the land piece plus whatever follows must run
 * straight for ≥ 50 m (the validator proves every jump lands from the posted
 * speed to top speed).
 */
const CLASSES = {
  small: { ramp: 18, rise: 2.4, gap: 14, drop: 1.5 },
  medium: { ramp: 20, rise: 3, gap: 20, drop: 2 },
  big: { ramp: 24, rise: 4, gap: 32, drop: 3, minKmh: 100 },
  large: { ramp: 26, rise: 5, gap: 44, drop: 4, minKmh: 115 },
  huge: { ramp: 30, rise: 7, gap: 58, drop: 6, minKmh: 130 },
};

export const start = (len = 40, extra = {}) => ({ t: "S", len, start: true, ...extra });
export const S = (len, extra = {}) => ({ t: "S", len, ...extra });
export const C = (len, ang, extra = {}) => ({ t: "C", len, ang, ...extra });
export const loop = (R, extra = {}) => ({ t: "loop", R, ...extra });
export const finish = (len = 80, extra = {}) => ({ t: "S", len, finish: 24, ...extra });

/**
 * A jump: [ramp, gap, landing pad]. o: gap / drop / ramp / rise overrides,
 * w (ramp + pad width), shift (sideways transfer across the gap), rampAng
 * (curved ramp), star (air star on the arc, default true; false = none;
 * number = lateral offset), land (pad length), padX (items on the pad),
 * rails (pad rails).
 */
export function jump(kind, o = {}) {
  const j = { ...CLASSES[kind], ...o };
  const gapItems = [];
  if (j.star !== false) gapItems.push(["air", Math.round(j.gap * (j.starAt ?? 0.5)), typeof j.star === "number" ? j.star : 0]);
  const ramp = { t: "ramp", len: j.ramp, rise: j.rise };
  if (j.minKmh) ramp.minKmh = j.minKmh;
  if (j.w) ramp.w = j.w;
  if (j.rampAng) ramp.ang = j.rampAng;
  if (j.rampRails !== undefined) ramp.rails = j.rampRails;
  const gap = { t: "gap", len: j.gap, drop: j.drop, x: gapItems };
  if (j.shift) gap.shift = j.shift;
  const land = { t: "land", len: j.land ?? 30, drop: j.drop };
  if (j.landW || j.w) land.w = j.landW || j.w;
  if (j.padX) land.x = j.padX;
  if (j.rails !== undefined) land.rails = j.rails;
  return [ramp, gap, land];
}
