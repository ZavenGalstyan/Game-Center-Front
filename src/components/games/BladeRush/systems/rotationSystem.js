/**
 * Blade Rush — target rotation, driven entirely by delta time.
 *
 * A pattern is either:
 *   { type: "constant", speed }                     rad/s, forever
 *   { type: "segments", segments: [{dur, speed}] }   loops after summed dur
 *
 * A segment may ease between two speeds instead of holding one constant:
 *   { dur, from, to }   linear ramp across the segment (accel/decel/pulse)
 *
 * `speed` is signed: positive = clockwise, negative = counter-clockwise.
 * Everything here is pure/stateless except `stepRotation`, which folds one
 * frame's delta time into a rotation + cycle-time pair — the ONE source of
 * truth both the renderer and the collision system read from every frame.
 */

export const TAU = Math.PI * 2;

export function normalizeAngle(a) {
  a %= TAU;
  if (a < 0) a += TAU;
  return a;
}

/** Shortest angular distance between two angles, correctly wrapping 359°/1°. */
export function shortestAngleDiff(a, b) {
  let d = normalizeAngle(a - b);
  if (d > Math.PI) d = TAU - d;
  return d;
}

function cycleLength(pattern) {
  return pattern.segments.reduce((s, seg) => s + seg.dur, 0);
}

/** Instantaneous angular speed (rad/s) of a pattern at time `t` (seconds). */
export function speedAt(pattern, t) {
  if (pattern.type === "constant") return pattern.speed;
  const len = cycleLength(pattern);
  if (len <= 0) return 0;
  let tm = t % len;
  if (tm < 0) tm += len;
  let acc = 0;
  for (const seg of pattern.segments) {
    if (tm < acc + seg.dur || seg === pattern.segments[pattern.segments.length - 1]) {
      if (seg.from != null && seg.to != null) {
        const p = seg.dur > 0 ? Math.min(1, Math.max(0, (tm - acc) / seg.dur)) : 1;
        return seg.from + (seg.to - seg.from) * p;
      }
      return seg.speed ?? 0;
    }
    acc += seg.dur;
  }
  return 0;
}

/** Advance rotation + cycle-time by one frame's delta time (seconds). */
export function stepRotation(pattern, state, dt) {
  const speed = speedAt(pattern, state.cycleTime);
  return {
    rotation: state.rotation + speed * dt,
    cycleTime: state.cycleTime + dt,
  };
}

/* ---------------------------------------------------------- pattern builders */
/* Named, reusable rotation patterns used by the stage data. Every one is a
   fixed, understandable sequence — never per-frame randomness — so a player
   can learn and react to it. */

export const constantPattern = (speed) => ({ type: "constant", speed });

export const reversePeriodic = (baseSpeed, everySec) => ({
  type: "segments",
  segments: [
    { dur: everySec, speed: baseSpeed },
    { dur: everySec, speed: -baseSpeed },
  ],
});

export const speedPulse = (low, high, lowDur = 1.2, highDur = 0.8, rampDur = 0.35) => ({
  type: "segments",
  segments: [
    { dur: lowDur, speed: low },
    { dur: rampDur, from: low, to: high },
    { dur: highDur, speed: high },
    { dur: rampDur, from: high, to: low },
  ],
});

export const stopAndGo = (speed, goDur = 1.1, stopDur = 0.5) => ({
  type: "segments",
  segments: [
    { dur: goDur, speed },
    { dur: stopDur, speed: 0 },
  ],
});

export const burstPattern = (cruise, burst, cruiseDur = 1.4, burstDur = 0.4) => ({
  type: "segments",
  segments: [
    { dur: cruiseDur, speed: cruise },
    { dur: 0.2, from: cruise, to: burst },
    { dur: burstDur, speed: burst },
    { dur: 0.2, from: burst, to: cruise },
  ],
});

/**
 * A fixed, hand-legible "randomized" sequence — built once (at data-gen time)
 * from a seeded PRNG, then baked into stage data as literal segments. Never
 * regenerated per frame/per attempt, so it's exactly as fair on retry #1 as
 * retry #50.
 */
export function randomizedSequence(seed, count = 5, speedRange = [0.6, 1.6]) {
  let s = seed >>> 0;
  const rnd = () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return (s % 10000) / 10000;
  };
  const segments = [];
  for (let i = 0; i < count; i++) {
    const dir = rnd() < 0.5 ? 1 : -1;
    if (rnd() < 0.22) {
      segments.push({ dur: 0.3 + rnd() * 0.3, speed: 0 }); // a fair pause
    } else {
      const speed = (speedRange[0] + rnd() * (speedRange[1] - speedRange[0])) * dir;
      segments.push({ dur: 0.7 + rnd() * 1.0, speed });
    }
  }
  return { type: "segments", segments };
}
