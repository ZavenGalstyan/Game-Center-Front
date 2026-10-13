/**
 * Checkers Classic — Russian checkers (8×8) rules as pure functions.
 *
 * Board: 64 cells, index = row * 8 + col, row 0 at the top. Values:
 * 0 empty, 1 white man, 2 white king, -1 black man, -2 black king.
 * White starts on rows 5–7 and moves up (towards row 0); white moves first.
 *
 * A move is { from, path: [landing squares], caps: [captured squares], king }
 * where `king` is whether the piece ends the move as a king. Captures are
 * whole sequences: caps[i] is the piece jumped on the way to path[i].
 *
 * Russian specifics implemented here:
 *  - men capture forward and backward; capturing is mandatory, but any
 *    capture sequence may be chosen (no "longest capture" rule);
 *  - flying kings move and capture along a whole diagonal and may land on any
 *    empty square beyond the captured piece — except that if some of those
 *    squares allow the capture to continue, the king must land on one of them;
 *  - captured pieces stay on the board until the sequence ends ("Turkish
 *    strike"): they can't be jumped twice and block the path;
 *  - a man reaching the far row mid-capture is crowned at once and continues
 *    capturing as a king.
 */
export const WHITE = 1, BLACK = -1;
const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const on = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
export const isDark = (i) => ((i >> 3) + (i & 7)) % 2 === 1;
export const sqName = (i) => "abcdefgh"[i & 7] + (8 - (i >> 3));
export const promoRow = (side) => (side === WHITE ? 0 : 7);

export function initialPosition() {
  const b = Array(64).fill(0);
  for (let i = 0; i < 64; i++) if (isDark(i)) b[i] = i < 24 ? BLACK : i >= 40 ? WHITE : 0;
  return { b, side: WHITE };
}

/** Single jumps available from `sq` ({ cap, lands }), given pieces already captured. */
function jumps(b, sq, king, side, caps) {
  const out = [];
  const r = sq >> 3, c = sq & 7;
  for (const [dr, dc] of DIRS) {
    let rr = r + dr, cc = c + dc;
    if (king) while (on(rr, cc) && b[rr * 8 + cc] === 0) { rr += dr; cc += dc; }
    if (!on(rr, cc)) continue;
    const e = rr * 8 + cc;
    if (Math.sign(b[e]) !== -side || caps.includes(e)) continue;
    const lands = [];
    rr += dr; cc += dc;
    while (on(rr, cc) && b[rr * 8 + cc] === 0) {
      lands.push(rr * 8 + cc);
      if (!king) break;
      rr += dr; cc += dc;
    }
    if (lands.length) out.push({ cap: e, lands });
  }
  return out;
}

/** Every complete capture sequence for the piece on `from`. */
function captureSeqs(b0, from) {
  const v = b0[from], side = Math.sign(v);
  const b = b0.slice();
  b[from] = 0; // the moving piece has left its square (it may pass over or land on it again)
  const out = [];
  const dfs = (sq, king, path, caps) => {
    const js = jumps(b, sq, king, side, caps);
    if (!js.length) {
      if (path.length) out.push({ from, path, caps, king });
      return;
    }
    for (const { cap, lands } of js) {
      const nc = [...caps, cap];
      const crown = (l) => king || l >> 3 === promoRow(side);
      // a king must pick a landing square that keeps the capture going, if one exists
      const cont = lands.filter((l) => jumps(b, l, crown(l), side, nc).length);
      for (const l of cont.length ? cont : lands) dfs(l, crown(l), [...path, l], nc);
    }
  };
  dfs(from, Math.abs(v) === 2, [], []);
  return out;
}

/** All legal moves for the side to move (captures only, when any exist). */
export function legalMoves(pos) {
  const { b, side } = pos;
  const caps = [];
  for (let i = 0; i < 64; i++) if (Math.sign(b[i]) === side) caps.push(...captureSeqs(b, i));
  if (caps.length) return caps;
  const out = [];
  for (let i = 0; i < 64; i++) {
    if (Math.sign(b[i]) !== side) continue;
    const king = Math.abs(b[i]) === 2;
    const r = i >> 3, c = i & 7;
    for (const [dr, dc] of DIRS) {
      if (!king && dr !== -side) continue; // men step forward only
      let rr = r + dr, cc = c + dc;
      while (on(rr, cc) && b[rr * 8 + cc] === 0) {
        const to = rr * 8 + cc;
        out.push({ from: i, path: [to], caps: [], king: king || rr === promoRow(side) });
        if (!king) break;
        rr += dr; cc += dc;
      }
    }
  }
  return out;
}

export function applyMove(pos, m) {
  const b = pos.b.slice();
  const side = pos.side;
  b[m.from] = 0;
  for (const e of m.caps) b[e] = 0;
  b[m.path[m.path.length - 1]] = side * (m.king ? 2 : 1);
  return { b, side: -side };
}

/** Moves of the piece on `from` that start with `prefix`. */
export const matching = (moves, from, prefix) =>
  moves.filter((m) => m.from === from && prefix.every((p, i) => m.path[i] === p));

/** Next landing squares after `prefix`: Map(to → { cap, crown }). */
export function nextSteps(pos, moves, from, prefix) {
  const k = prefix.length;
  const out = new Map();
  const startKing = Math.abs(pos.b[from]) === 2;
  for (const m of matching(moves, from, prefix)) {
    const to = m.path[k];
    if (out.has(to)) continue;
    const wasKing = startKing || prefix.some((p) => p >> 3 === promoRow(pos.side));
    out.set(to, { cap: m.caps[k] ?? null, crown: !wasKing && to >> 3 === promoRow(pos.side) });
  }
  return out;
}

export function count(b) {
  const n = { 1: { men: 0, kings: 0 }, [-1]: { men: 0, kings: 0 } };
  for (const v of b) if (v) n[Math.sign(v)][Math.abs(v) === 2 ? "kings" : "men"]++;
  return n;
}

export const notation = (m) => [m.from, ...m.path].map(sqName).join(m.caps.length ? ":" : "-");

/* ------------------------------------------------------------ game record + end rules */
const keyOf = (pos) => pos.b.join(",") + "|" + pos.side;

/** Draw thresholds in plies (one "move" = one turn of each player). */
export const DRAW = { kingsOnly: 30, threeVsOne: 30, small: 60, medium: 120, repeat: 3 };

export function newGame(pos = initialPosition()) {
  return { pos, quiet: 0, lone: 0, still: 0, seen: { [keyOf(pos)]: 1 }, result: null };
}

/**
 * Plays `m` (assumed legal) and evaluates the end conditions:
 *  - no pieces / no legal moves → the side to move loses;
 *  - threefold repetition (same position, same side to move) → draw;
 *  - 15 moves in which both sides only moved kings without capturing → draw;
 *  - three or more kings against a lone king not won within 15 moves → draw;
 *  - both sides have kings and the balance of force (captures, promotions)
 *    hasn't changed for 30 moves with 4–5 pieces, or 60 moves with 6–7
 *    pieces → draw (Russian checkers rules, 2004 edition).
 */
export function playMove(g, m) {
  const mover = g.pos.side;
  const wasKing = Math.abs(g.pos.b[m.from]) === 2;
  const pos = applyMove(g.pos, m);
  const n = count(pos.b);
  const me = n[mover], op = n[-mover];
  const changed = m.caps.length > 0 || (!wasKing && m.king);
  const quiet = wasKing && !m.caps.length ? g.quiet + 1 : 0;
  const loneNow = (me.kings >= 3 && op.men + op.kings === 1 && op.kings === 1) || (op.kings >= 3 && me.men + me.kings === 1 && me.kings === 1);
  const lone = loneNow ? g.lone + 1 : 0;
  const total = me.men + me.kings + op.men + op.kings;
  const still = me.kings && op.kings && !changed ? g.still + 1 : 0;
  const key = keyOf(pos);
  const seen = { ...g.seen, [key]: (g.seen[key] || 0) + 1 };

  let result = null;
  if (!op.men && !op.kings) result = { winner: mover, reason: "All pieces captured" };
  else if (!legalMoves(pos).length) result = { winner: mover, reason: "No legal moves left" };
  else if (seen[key] >= DRAW.repeat) result = { winner: 0, reason: "Threefold repetition" };
  else if (lone >= DRAW.threeVsOne) result = { winner: 0, reason: "Three kings could not catch a lone king in 15 moves" };
  else if (quiet >= DRAW.kingsOnly) result = { winner: 0, reason: "15 moves with only king moves and no captures" };
  else if ((total <= 5 && total >= 4 && still >= DRAW.small) || (total >= 6 && total <= 7 && still >= DRAW.medium))
    result = { winner: 0, reason: `No change in material for ${still / 2} moves` };
  return { pos, quiet, lone, still, seen, result };
}
