/**
 * Crowd Rush — gate arithmetic. The crowd is ONE integer group; a gate applies
 * its operation once, to the whole group.
 *
 *   add N  -> count + N
 *   sub N  -> max(0, count - N)
 *   mul N  -> count * N
 *   div N  -> floor(count / N)
 *
 * Runners are always whole. `applyGate` clamps to [0, HARD_CAP] so a chain of
 * multipliers can't blow past what the crowd renderer can handle.
 */

export const HARD_CAP = 999;

export function applyOp(op, value, count) {
  const c = Math.max(0, Math.floor(count));
  const v = Math.max(0, Math.floor(value));
  switch (op) {
    case "add": return c + v;
    case "sub": return Math.max(0, c - v);
    case "mul": return c * Math.max(1, v);
    case "div": return Math.floor(c / Math.max(1, v));
    default: return c;
  }
}

export function applyGate(gate, count) {
  return Math.min(HARD_CAP, applyOp(gate.operation, gate.value, count));
}

export const OP_SYMBOL = { add: "+", sub: "−", mul: "×", div: "÷" };

/** "×3", "+20", "−10", "÷2" — the big face text. */
export function gateLabel(gate) {
  return `${OP_SYMBOL[gate.operation] || "+"}${gate.value}`;
}

/** true when the operation can only ever help the crowd. */
export function isFriendly(gate) {
  if (gate.operation === "add") return true;
  if (gate.operation === "mul") return gate.value >= 1;
  return false;
}

/** Which gate in a choice yields the biggest crowd at `count` (index). Ties -> first. */
export function bestGateIndex(gates, count) {
  let best = 0;
  let bestVal = -Infinity;
  gates.forEach((g, i) => {
    const r = applyOp(g.operation, g.value, count);
    if (r > bestVal) {
      bestVal = r;
      best = i;
    }
  });
  return best;
}
