/**
 * Metro Rush — fairness validator.
 *
 * A chunk of track is accepted only if, from EVERY lane the runner could
 * enter it in, there is a way through to its end at the given speed. The
 * check is a backwards DP over a 0.5 m grid with a deliberately REDUCED move
 * set (no lane changes onto ramps, no jumps between roofs, a human reaction
 * margin on every lane change, recovery time after each action). Anything
 * the reduced runner can survive, a real runner can survive too.
 *
 * Grid cell i covers local z = i * CELL. States: (cell, lane, level), level
 * 0 = ground, 1 = on a train roof.
 *
 * Items use chunk-local coordinates:
 *   { kind: 'barrier' | 'overhead', lane, z0, z1 }
 *   { kind: 'train', lane, z0, z1, ramp, moving, u }
 * A moving train's z0/z1 are its position when spawned; it departs when the
 * runner is MOVING_ACT short of z0, so in "runner space" it is met over a
 * shorter, earlier stretch — that stretch is what blocks the lane.
 */
import {
  BARRIER_H, CELL, LANES, LANE_T, MOVING_ACT, P_HALF_L, RAMP_L, REACT_T, RECOVER_T,
  SLIDE_DROP_T, SLIDE_T, TRAIN_H, gravityAt, jumpVel,
} from "./config.js";

const PAD = 160; // free cells appended after the chunk so long actions can land

/** runner-space interval [a, b] in which a moving train occupies its lane */
export function movingMeet(item, v) {
  const trig = item.z0 - MOVING_ACT;
  const k = v / (v + item.u);
  return [trig + MOVING_ACT * k, trig + (MOVING_ACT + (item.z1 - item.z0)) * k];
}

/** action spans (in cells) at speed v */
export function spans(v) {
  const g = gravityAt(v);
  const vj = jumpVel(g);
  const T = (2 * vj) / g;
  const clear = BARRIER_H + 0.1;
  const disc = Math.sqrt(Math.max(0, vj * vj - 2 * g * clear));
  const t1 = (vj - disc) / g;
  const t2 = (vj + disc) / g;
  const tf = Math.sqrt((2 * TRAIN_H) / g);
  return {
    J: Math.ceil((v * T) / CELL) + 1,
    w0: Math.ceil((v * t1) / CELL) + 1,
    w1: Math.floor((v * t2) / CELL) - 1,
    S: Math.floor((v * SLIDE_T) / CELL),
    s0: Math.ceil((v * SLIDE_DROP_T) / CELL) + 1,
    K: Math.ceil((v * (LANE_T + REACT_T)) / CELL) + 1,
    F: Math.ceil((v * tf) / CELL) + 2,
    REC: Math.ceil((v * RECOVER_T) / CELL),
  };
}

/** rasterise items into per-lane cell flags */
export function rasterize(items, len, v) {
  const N = Math.ceil(len / CELL) + 1;
  const M = N + PAD;
  const mk = () => Array.from({ length: LANES }, () => new Uint8Array(M));
  const block = mk(); // ground body (train)
  const top = mk(); // walkable roof
  const jump = mk(); // barrier → needs a jump
  const slide = mk(); // overhead → needs a slide
  const ramp = mk();
  const tail = mk(); // the last few cm of a train, harmless when dropping off its roof
  const markOuter = (arr, l, a, b) => {
    const i0 = Math.max(0, Math.floor(a / CELL));
    const i1 = Math.min(M - 1, Math.ceil(b / CELL));
    for (let i = i0; i <= i1; i++) arr[l][i] = 1;
  };
  for (const it of items) {
    const l = it.lane;
    if (it.kind === "barrier") markOuter(jump, l, it.z0 - P_HALF_L, it.z1 + P_HALF_L);
    else if (it.kind === "overhead") markOuter(slide, l, it.z0 - P_HALF_L, it.z1 + P_HALF_L);
    else if (it.kind === "train") {
      if (it.moving) {
        const [a, b] = movingMeet(it, v);
        markOuter(block, l, a - 4 - P_HALF_L, b + 4);
      } else {
        const b0 = Math.max(0, Math.floor((it.z0 - P_HALF_L) / CELL));
        const e = Math.min(M - 1, Math.floor(it.z1 / CELL));
        const b1 = Math.min(M - 1, Math.ceil((it.z1 + P_HALF_L) / CELL));
        for (let i = b0; i <= b1; i++) block[l][i] = 1;
        for (let i = it.ramp ? b0 : Math.ceil(it.z0 / CELL); i <= e; i++) top[l][i] = 1;
        for (let i = e + 1; i <= b1; i++) tail[l][i] = 1;
        if (it.ramp) for (let i = Math.max(0, Math.ceil((it.z0 - RAMP_L) / CELL)); i < b0; i++) ramp[l][i] = 1;
      }
    }
  }
  return { N, M, block, top, jump, slide, ramp, tail };
}

const RUN = 1;
const JUMP = 2;
const SLIDE = 3;
const LANE_L = 4;
const LANE_R = 5;
const RAMP_UP = 6;
const FALL = 7;
const TOP_L = 8;
const TOP_R = 9;
export const ACT_NAMES = ["", "run", "jump", "slide", "left", "right", "rampUp", "fall", "topLeft", "topRight"];

/**
 * Validate a chunk. Returns { ok, start: [bool per lane], plan(l) → path }
 * where plan(lane) lists the moves of one surviving route from that lane.
 */
export function validate(items, len, v) {
  const R = rasterize(items, len, v);
  const sp = spans(v);
  const { N, M, block, top, jump, slide, ramp, tail } = R;
  // good[(i*LANES + l)*2 + lev] = move code (0 = dead)
  const good = new Uint8Array(M * LANES * 2);
  const idx = (i, l, lev) => (i * LANES + l) * 2 + lev;
  const plain = (l, i) => i >= M || (!block[l][i] && !jump[l][i] && !slide[l][i] && !ramp[l][i]);
  const runnable = (l, i) => i >= M || (!block[l][i] && !jump[l][i] && !slide[l][i]);
  const isGood = (i, l, lev) => (i >= N - 1 ? lev === 0 && (i >= M || runnable(l, i)) : good[idx(i, l, lev)] !== 0);
  const clearRange = (l, a, b, test) => {
    for (let k = a; k <= b; k++) if (!test(l, k)) return false;
    return true;
  };

  for (let i = M - 1; i >= 0; i--) {
    for (let l = 0; l < LANES; l++) {
      // ---------------------------------------------------------- ground
      if (i >= N - 1) {
        if (runnable(l, i)) good[idx(i, l, 0)] = RUN;
      } else if (runnable(l, i)) {
        let mv = 0;
        // run straight / up the ramp onto the roof
        if (runnable(l, i + 1) && isGood(i + 1, l, 0)) mv = RUN;
        else if (ramp[l][i] && top[l][i + 1] && isGood(i + 1, l, 1)) mv = RAMP_UP;
        // lane changes (reaction + switch time; both lanes clear, no ramps)
        if (!mv && plain(l, i)) {
          const e = i + sp.K;
          for (const [dl, code] of [[-1, LANE_L], [1, LANE_R]]) {
            const t = l + dl;
            if (mv || t < 0 || t >= LANES) continue;
            if (clearRange(l, i, e, plain) && clearRange(t, i, e, plain) && isGood(e, t, 0)) mv = code;
          }
        }
        // jump: barriers only inside the clearance window
        if (!mv && plain(l, i)) {
          let ok = true;
          for (let k = 1; k <= sp.J && ok; k++) {
            const c = i + k;
            if (c >= M) break;
            if (block[l][c] || slide[l][c] || ramp[l][c]) ok = false;
            else if (jump[l][c] && (k < sp.w0 || k > sp.w1)) ok = false;
          }
          const e = i + sp.J + sp.REC;
          if (ok && clearRange(l, i + sp.J, e, plain) && isGood(e, l, 0)) mv = JUMP;
        }
        // slide: overheads only once the body is down
        if (!mv && plain(l, i)) {
          let ok = true;
          for (let k = 1; k <= sp.S && ok; k++) {
            const c = i + k;
            if (c >= M) break;
            if (block[l][c] || jump[l][c] || ramp[l][c]) ok = false;
            else if (slide[l][c] && k < sp.s0) ok = false;
          }
          const e = i + sp.S + 1 + sp.REC;
          if (ok && clearRange(l, i + sp.S + 1, e, plain) && isGood(e, l, 0)) mv = SLIDE;
        }
        good[idx(i, l, 0)] = mv;
      }
      // ---------------------------------------------------------- roof
      if (i < N - 1 && top[l][i]) {
        let mv = 0;
        if (top[l][i + 1]) {
          if (isGood(i + 1, l, 1)) mv = RUN;
        } else {
          // roof ends: fall to the rails — the drop must land on clear track
          const e = i + sp.F + sp.REC;
          if (clearRange(l, i + 1, e, (ll, k) => plain(ll, k) || (k < M && tail[ll][k] && !jump[ll][k] && !slide[ll][k])) && isGood(e, l, 0)) mv = FALL;
        }
        if (!mv) {
          const e = i + sp.K;
          for (const [dl, code] of [[-1, TOP_L], [1, TOP_R]]) {
            const t = l + dl;
            if (mv || t < 0 || t >= LANES) continue;
            let ok = true;
            for (let k = i; k <= e && ok; k++) if (!top[l][Math.min(k, M - 1)] || !top[t][Math.min(k, M - 1)]) ok = false;
            if (ok && isGood(e, t, 1)) mv = code;
          }
        }
        good[idx(i, l, 1)] = mv;
      }
    }
  }

  const start = [0, 1, 2].map((l) => good[idx(0, l, 0)] !== 0);
  const plan = (l0) => {
    const out = [];
    let i = 0;
    let l = l0;
    let lev = 0;
    let guard = 0;
    while (i < N - 1 && guard++ < 20000) {
      const mv = good[idx(i, l, lev)];
      if (!mv) return null;
      const step = { i, z: i * CELL, lane: l, lev, act: ACT_NAMES[mv] };
      if (mv === RUN) i += 1;
      else if (mv === RAMP_UP) (i += 1), (lev = 1);
      else if (mv === JUMP) i += sp.J + sp.REC;
      else if (mv === SLIDE) i += sp.S + 1 + sp.REC;
      else if (mv === LANE_L || mv === LANE_R) (i += sp.K), (l += mv === LANE_L ? -1 : 1);
      else if (mv === FALL) (i += sp.F + sp.REC), (lev = 0);
      else if (mv === TOP_L || mv === TOP_R) (i += sp.K), (l += mv === TOP_L ? -1 : 1);
      step.to = { i, lane: l, lev };
      out.push(step);
    }
    return out;
  };
  return { ok: start.every(Boolean), start, plan, raster: R, spans: sp };
}
