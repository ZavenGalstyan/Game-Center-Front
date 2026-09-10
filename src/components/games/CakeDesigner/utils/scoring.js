/**
 * Cake Designer — order scoring.
 *
 * Design goals (from the brief):
 *  - Score the CATEGORIES the order actually asks for. Never punish a missing
 *    drip / message / topping the customer never wanted.
 *  - Reward correct ingredients, colours and quantities — NOT pixel-perfect
 *    placement. Placement only ever adds a small bonus.
 *  - Allow a little creativity: a few extra decorations are fine. Burying the
 *    requested design under unrelated stuff lowers the match.
 *  - Early Birthday orders are forgiving.
 *
 * Returns:
 *  { total, stars, matchPct, categories:[{key,label,weight,ratio,grade}],
 *    extras, bonus, perfect }
 */

import { collectionOfLevel } from "../data/collections.js";

const BASE_WEIGHTS = {
  shape: 15, layers: 15, frosting: 15, color: 15,
  drip: 12, toppings: 15, decorations: 15, message: 8, finalTouch: 6,
};

const LABELS = {
  shape: "Shape", layers: "Layers", frosting: "Frosting", color: "Colour",
  drip: "Drip", toppings: "Toppings", decorations: "Decoration",
  message: "Message", finalTouch: "Final touch",
};

const norm = (s) => String(s || "").toUpperCase().replace(/\s+/g, " ").trim();
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function grade(ratio) {
  if (ratio >= 0.95) return "PERFECT";
  if (ratio >= 0.8) return "GREAT";
  if (ratio >= 0.55) return "OKAY";
  if (ratio > 0) return "CLOSE";
  return "MISSED";
}

/** count matching entries by id in a placed list */
const countId = (list, id) => list.reduce((n, it) => n + (it.id === id ? 1 : 0), 0);

function quantityRatio(got, want) {
  if (want <= 0) return got > 0 ? 1 : 0;
  if (got >= want) return 1;
  return got / want;
}

function ratioColor(cake, req) {
  const n = cake.layers.length;
  const want = req.colors;
  if (!want || !want.length) return 1;
  let match = 0;
  for (let i = 0; i < n; i++) {
    const expected = want.length === 1 ? want[0] : want[Math.min(i, want.length - 1)];
    if (cake.layers[i].color === expected) match++;
  }
  // also nudge for wanting the right *number* of tiers coloured
  return match / n;
}

function ratioFrosting(cake, req) {
  if (!req.frosting) return 1;
  const match = cake.layers.filter((l) => l.frosting === req.frosting).length;
  return match / cake.layers.length;
}

function ratioLayers(cake, req) {
  const diff = Math.abs(cake.layers.length - req.layers);
  if (diff === 0) return 1;
  if (diff === 1) return 0.5;
  return 0.15;
}

function ratioToppings(cake, req) {
  if (!req.toppings || !req.toppings.length) return 1;
  let sum = 0;
  for (const t of req.toppings) sum += quantityRatio(countId(cake.toppings, t.id), t.count || 1);
  return sum / req.toppings.length;
}

function ratioDecorations(cake, req) {
  const parts = [];
  if (req.scatter) parts.push(cake.scatter.includes(req.scatter) ? 1 : 0);
  if (req.decorations && req.decorations.length) {
    for (const d of req.decorations) {
      parts.push(quantityRatio(countId(cake.decorations, d.id), d.count || 1));
    }
  }
  if (req.special?.candles) {
    const got = cake.decorations.filter(
      (d) => d.id === "candle-classic" || d.id === "candle-spiral",
    ).length;
    parts.push(quantityRatio(got, req.special.candles));
  }
  if (req.special?.number != null) {
    const hit = cake.decorations.some(
      (d) => d.id === "candle-number" && Number(d.number) === Number(req.special.number),
    );
    const anyNumber = cake.decorations.some((d) => d.id === "candle-number");
    parts.push(hit ? 1 : anyNumber ? 0.4 : 0);
  }
  if (!parts.length) return 1;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

function placementBonus(cake) {
  const pts = [...cake.toppings, ...cake.decorations].map((d) => [d.x, d.y]);
  if (pts.length < 3) return 0;
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      total += Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
      pairs++;
    }
  }
  const spread = total / pairs;
  return spread > 0.14 ? 4 : spread > 0.09 ? 2 : 0;
}

function extrasPenalty(cake, req) {
  const wantTop = new Set((req.toppings || []).map((t) => t.id));
  const wantDec = new Set((req.decorations || []).map((d) => d.id));
  let extras = 0;
  for (const t of cake.toppings) if (!wantTop.has(t.id)) extras++;
  for (const d of cake.decorations) {
    const isCandle = d.id === "candle-classic" || d.id === "candle-spiral" || d.id === "candle-number";
    if (wantDec.has(d.id)) continue;
    if (isCandle && (req.special?.candles || req.special?.number != null)) continue;
    extras++;
  }
  // also count unrequested scatter fields as ~2 extras each
  const wantScatter = req.scatter ? new Set([req.scatter]) : new Set();
  for (const s of cake.scatter) if (!wantScatter.has(s)) extras += 2;

  const free = 3; // a few extras are creative, not wrong
  const penalty = Math.max(0, extras - free) * 2.2;
  return { extras, penalty: Math.min(20, penalty) };
}

export function scoreCake(cake, order) {
  const req = order.requirements;
  const relevant = [];
  if (req.shape) relevant.push("shape");
  if (req.layers) relevant.push("layers");
  if (req.frosting) relevant.push("frosting");
  if (req.colors) relevant.push("color");
  if (req.drip) relevant.push("drip");
  if (req.toppings) relevant.push("toppings");
  if (req.decorations || req.scatter || req.special?.candles || req.special?.number != null) {
    relevant.push("decorations");
  }
  if (req.special?.message) relevant.push("message");
  if (req.finalTouch) relevant.push("finalTouch");

  const ratios = {
    shape: cake.shape === req.shape ? 1 : 0,
    layers: ratioLayers(cake, req),
    frosting: ratioFrosting(cake, req),
    color: ratioColor(cake, req),
    drip: cake.drip === req.drip ? 1 : cake.drip !== "none" ? 0.15 : 0,
    toppings: ratioToppings(cake, req),
    decorations: ratioDecorations(cake, req),
    message:
      req.special?.message == null
        ? 1
        : norm(cake.message) === norm(req.special.message)
          ? 1
          : cake.message
            ? 0.4
            : 0,
    finalTouch: req.finalTouch ? (cake.finalTouches.includes(req.finalTouch) ? 1 : 0) : 1,
  };

  const weightSum = relevant.reduce((s, k) => s + BASE_WEIGHTS[k], 0);
  const categories = relevant.map((k) => {
    const weight = (BASE_WEIGHTS[k] / weightSum) * 100;
    const ratio = clamp01(ratios[k]);
    return { key: k, label: LABELS[k], weight, ratio, grade: grade(ratio) };
  });

  let raw = categories.reduce((s, c) => s + c.weight * c.ratio, 0);

  const { extras, penalty } = extrasPenalty(cake, req);
  const bonus = placementBonus(cake);

  const collection = collectionOfLevel(order.id);
  let leniency = 0;
  if (collection.id === "birthday") leniency += 3;
  if (order.id <= 5) leniency += 6;

  let total = Math.round(clamp01((raw + bonus - penalty + leniency) / 100) * 100);
  total = Math.max(0, Math.min(100, total));

  let stars = 0;
  if (total >= 90) stars = 3;
  else if (total >= 70) stars = 2;
  else if (total >= 50) stars = 1;

  const perfect = categories.every((c) => c.ratio >= 0.95) && extras <= 2;

  return { total, stars, matchPct: total, categories, extras, bonus, penalty, leniency, perfect };
}

/**
 * Live per-requirement ticks for the order card. Keys match reqLines() in
 * components/CustomerOrder.jsx.
 */
export function matchChecks(cake, req) {
  const m = {};
  if (req.shape) m.shape = cake.shape === req.shape;
  if (req.layers) m.layers = cake.layers.length === req.layers;
  if (req.frosting) m.frosting = cake.layers.every((l) => l.frosting === req.frosting);
  if (req.colors) {
    m.color = cake.layers.every((l, i) => {
      const want = req.colors.length === 1 ? req.colors[0] : req.colors[Math.min(i, req.colors.length - 1)];
      return l.color === want;
    });
  }
  if (req.drip) m.drip = cake.drip === req.drip;
  (req.toppings || []).forEach((t) => {
    m[`top-${t.id}`] = countId(cake.toppings, t.id) >= (t.count || 1);
  });
  if (req.scatter) m.scatter = cake.scatter.includes(req.scatter);
  (req.decorations || []).forEach((d) => {
    m[`dec-${d.id}`] = countId(cake.decorations, d.id) >= (d.count || 1);
  });
  if (req.special?.candles) {
    m.candles = cake.decorations.filter((d) => d.id === "candle-classic" || d.id === "candle-spiral").length >= req.special.candles;
  }
  if (req.special?.number != null) {
    m.number = cake.decorations.some((d) => d.id === "candle-number" && Number(d.number) === Number(req.special.number));
  }
  if (req.special?.message) m.message = norm(cake.message) === norm(req.special.message);
  if (req.finalTouch) m.final = cake.finalTouches.includes(req.finalTouch);
  return m;
}

export function coinsFor(order, stars) {
  const full = order.rewards.coins;
  if (stars >= 3) return full;
  if (stars === 2) return Math.round(full * 0.75);
  if (stars === 1) return Math.round(full * 0.5);
  return 0;
}
