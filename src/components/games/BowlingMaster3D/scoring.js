/**
 * Ten-pin bowling scoring — pure functions over a flat list of rolls
 * (pins knocked per ball). No React/Three here; tools/simTest.mjs covers it.
 */

/** Split rolls into frames (frame 10 may hold up to three balls). */
export function splitFrames(rolls) {
  const frames = [];
  let i = 0;
  for (let f = 0; f < 9 && i < rolls.length; f++) {
    if (rolls[i] === 10) {
      frames.push([10]);
      i += 1;
    } else {
      frames.push(rolls.slice(i, i + 2));
      i += 2;
    }
  }
  if (i < rolls.length) frames.push(rolls.slice(i, i + 3));
  return frames;
}

/**
 * What the next ball is: { over, frame (0-9), ball (0-2), fullRack, standing }.
 * `fullRack` means a fresh set of ten; otherwise `standing` pins remain.
 */
export function nextRoll(rolls) {
  const frames = splitFrames(rolls);
  const fresh = (frame, ball = 0) => ({ over: false, frame, ball, fullRack: true, standing: 10 });
  if (!frames.length) return fresh(0);
  const f = frames.length - 1;
  const r = frames[f];
  if (f < 9) {
    if (r[0] === 10 || r.length === 2) return fresh(f + 1);
    return { over: false, frame: f, ball: 1, fullRack: false, standing: 10 - r[0] };
  }
  if (r.length === 1) return r[0] === 10 ? fresh(9, 1) : { over: false, frame: 9, ball: 1, fullRack: false, standing: 10 - r[0] };
  if (r.length === 2) {
    if (r[0] === 10) return r[1] === 10 ? fresh(9, 2) : { over: false, frame: 9, ball: 2, fullRack: false, standing: 10 - r[1] };
    if (r[0] + r[1] === 10) return fresh(9, 2);
  }
  return { over: true, frame: 9, ball: r.length, fullRack: false, standing: 0 };
}

/** Running total after each frame, or null while bonus balls are pending. */
export function frameTotals(rolls) {
  const out = [];
  let i = 0;
  let total = 0;
  for (let f = 0; f < 10; f++) {
    const a = rolls[i];
    const b = rolls[i + 1];
    const c = rolls[i + 2];
    let add = null;
    if (a === undefined) add = null;
    else if (a === 10) add = b !== undefined && c !== undefined ? 10 + b + c : null;
    else if (b === undefined) add = null;
    else if (a + b === 10) add = c !== undefined ? 10 + c : null;
    else add = a + b;
    if (add === null) {
      while (out.length < 10) out.push(null);
      break;
    }
    total += add;
    out.push(total);
    i += a === 10 ? 1 : 2;
  }
  return out;
}

const num = (n) => (n === 0 ? "-" : String(n));

/** Score-sheet marks per frame: frames 1-9 → 2 boxes, frame 10 → 3 boxes. */
export function frameMarks(rolls) {
  const frames = splitFrames(rolls);
  const marks = [];
  for (let f = 0; f < 10; f++) {
    const r = frames[f] || [];
    if (f < 9) {
      if (r[0] === 10) marks.push(["", "X"]);
      else marks.push([r[0] === undefined ? "" : num(r[0]), r[1] === undefined ? "" : r[0] + r[1] === 10 ? "/" : num(r[1])]);
      continue;
    }
    const m = ["", "", ""];
    if (r[0] !== undefined) m[0] = r[0] === 10 ? "X" : num(r[0]);
    if (r[1] !== undefined) m[1] = r[0] === 10 ? (r[1] === 10 ? "X" : num(r[1])) : r[0] + r[1] === 10 ? "/" : num(r[1]);
    if (r[2] !== undefined) {
      const freshBefore = (r[0] === 10 && r[1] === 10) || (r[0] !== 10 && r[0] + r[1] === 10);
      m[2] = freshBefore ? (r[2] === 10 ? "X" : num(r[2])) : r[1] + r[2] === 10 ? "/" : num(r[2]);
    }
    marks.push(m);
  }
  return marks;
}

/** Final/current total (last known frame total). */
export function totalScore(rolls) {
  const t = frameTotals(rolls).filter((v) => v !== null);
  return t.length ? t[t.length - 1] : 0;
}

/** Strike / spare / open counts for the results screen. */
export function gameStats(rolls) {
  let strikes = 0;
  let spares = 0;
  for (const m of frameMarks(rolls)) for (const c of m) {
    if (c === "X") strikes++;
    else if (c === "/") spares++;
  }
  return { strikes, spares };
}
