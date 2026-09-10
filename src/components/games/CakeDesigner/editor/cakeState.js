/**
 * Cake Designer — the editable cake configuration.
 *
 * One plain, serialisable object. Decoration & topping positions are stored
 * NORMALISED (x, y in 0..1 across the cake's bounding box) so the same cake
 * renders correctly at any size and after a fullscreen toggle.
 *
 * All mutators are pure: they take a cake and return a new cake. The editor
 * screen keeps the current cake in React state and pushes snapshots into the
 * undo history (editor/undoHistory.js) after meaningful actions.
 */

let uidSeq = 1;
const uid = () => `d${uidSeq++}`;

/** ids that read best as a single centred hero piece rather than in a ring */
const HERO_IDS = new Set([
  "rainbow", "moon", "unicorn-horn", "topper-heart", "topper-mr-mrs",
  "topper-elegant", "ribbon", "gold-drizzle",
]);

/**
 * Spread a flat list of { id, count } across the cake top: hero pieces go
 * along the back-centre, everything else fills a golden-angle spiral so even
 * ~15 stars never pile up. Returns [{ uid, id, x, y, rot, scale }].
 */
function distribute(list, { spin = 0 } = {}) {
  if (!list) return [];
  const heroes = [];
  const small = [];
  for (const it of list) {
    const n = it.count || 1;
    (HERO_IDS.has(it.id) ? heroes : small).push(...Array.from({ length: n }, () => it.id));
  }
  const out = [];
  heroes.forEach((id, i) => {
    const t = heroes.length === 1 ? 0.5 : i / (heroes.length - 1);
    out.push({ uid: uid(), id, x: 0.32 + t * 0.36, y: 0.4 + (i % 2) * 0.06, rot: 0, scale: 1 });
  });
  const GA = Math.PI * (3 - Math.sqrt(5));
  small.forEach((id, i) => {
    const k = (i + 0.5) / Math.max(1, small.length);
    const r = 0.1 + Math.sqrt(k) * 0.26;
    const a = i * GA + spin;
    out.push({
      uid: uid(), id,
      x: 0.5 + Math.cos(a) * r,
      y: 0.54 + Math.sin(a) * r * 0.5,
      rot: 0, scale: 1,
    });
  });
  return out;
}

export function emptyCake() {
  return {
    shape: "round",
    layers: [{ color: "white", frosting: "vanilla" }],
    drip: "none",
    scatter: [], // scatter decoration ids currently applied (sprinkles, pearls…)
    toppings: [], // { uid, id, x, y, rot, scale }
    decorations: [], // { uid, id, x, y, rot, scale, number? }
    message: null,
    finalTouches: [], // final-touch ids
    rotation: 0, // -1..1 simulated turntable
  };
}

/** Build the target cake described by an order's requirements (for previews). */
export function cakeFromRequirements(req) {
  const cake = emptyCake();
  cake.shape = req.shape || "round";
  const n = req.layers || 1;
  const colors = req.colors && req.colors.length ? req.colors : ["white"];
  cake.layers = Array.from({ length: n }, (_, i) => ({
    color: colors[Math.min(i, colors.length - 1)],
    frosting: req.frosting || "vanilla",
  }));
  cake.drip = req.drip || "none";
  if (req.scatter) cake.scatter = [req.scatter];
  if (req.finalTouch) cake.finalTouches = [req.finalTouch];
  if (req.special?.message) cake.message = req.special.message;

  if (req.toppings) cake.toppings = distribute(req.toppings, { spin: 0.6 });
  if (req.decorations) {
    cake.decorations = distribute(req.decorations, { spin: 2.1 }).map((d) =>
      d.id === "candle-number" && req.special?.number != null
        ? { ...d, number: req.special.number }
        : d,
    );
  }
  if (req.special?.candles) {
    for (let i = 0; i < req.special.candles; i++) {
      const a = (i / req.special.candles) * Math.PI * 2 - Math.PI / 2;
      cake.decorations.push({
        uid: uid(), id: "candle-classic",
        x: 0.5 + Math.cos(a) * 0.16, y: 0.5 + Math.sin(a) * 0.13,
        rot: 0, scale: 1,
      });
    }
  }
  return cake;
}

/** Build a decorative showcase cake from a collection `preview` spec. */
export function cakeFromPreview(preview) {
  const cake = emptyCake();
  cake.shape = preview.shape || "round";
  cake.layers = (preview.layers || [{ color: "pink", frosting: "vanilla" }]).map((l) => ({ ...l }));
  cake.drip = preview.drip || "none";
  if (preview.scatter) cake.scatter = [preview.scatter];
  if (preview.topping) cake.toppings = distribute([{ id: preview.topping, count: 6 }], { spin: 0.6 });
  if (preview.decoration) cake.decorations = distribute([{ id: preview.decoration, count: 3 }], { spin: 1.4 });
  return cake;
}

/* ------------------------------------------------------------- mutators --- */

export const setShape = (cake, shape) => ({ ...cake, shape });

export function setLayerCount(cake, count) {
  const layers = cake.layers.slice(0, count);
  while (layers.length < count) {
    const src = layers[layers.length - 1] || { color: "white", frosting: "vanilla" };
    layers.push({ ...src });
  }
  return { ...cake, layers };
}

export function setLayerColor(cake, index, color) {
  const layers = cake.layers.map((l, i) => (i === index ? { ...l, color } : l));
  return { ...cake, layers };
}

export function setAllColors(cake, color) {
  return { ...cake, layers: cake.layers.map((l) => ({ ...l, color })) };
}

export function setFrosting(cake, frosting) {
  return { ...cake, layers: cake.layers.map((l) => ({ ...l, frosting })) };
}

export const setDrip = (cake, drip) => ({ ...cake, drip });

export function toggleScatter(cake, id) {
  const has = cake.scatter.includes(id);
  return { ...cake, scatter: has ? cake.scatter.filter((s) => s !== id) : [...cake.scatter, id] };
}

export function toggleFinalTouch(cake, id) {
  const has = cake.finalTouches.includes(id);
  return { ...cake, finalTouches: has ? cake.finalTouches.filter((s) => s !== id) : [...cake.finalTouches, id] };
}

export const setMessage = (cake, message) => ({ ...cake, message: message || null });
export const setRotation = (cake, rotation) => ({ ...cake, rotation: clamp(rotation, -1, 1) });

export function addTopping(cake, id, x, y, extra = {}) {
  const item = { uid: uid(), id, x: clamp(x, 0, 1), y: clamp(y, 0, 1), rot: 0, scale: 1, ...extra };
  return { ...cake, toppings: [...cake.toppings, item] };
}

export function addDecoration(cake, id, x, y, extra = {}) {
  const item = { uid: uid(), id, x: clamp(x, 0, 1), y: clamp(y, 0, 1), rot: 0, scale: 1, ...extra };
  return { ...cake, decorations: [...cake.decorations, item] };
}

export function moveItem(cake, kind, itemUid, x, y) {
  const key = kind === "topping" ? "toppings" : "decorations";
  return {
    ...cake,
    [key]: cake[key].map((it) =>
      it.uid === itemUid ? { ...it, x: clamp(x, 0, 1), y: clamp(y, 0, 1) } : it,
    ),
  };
}

export function updateItem(cake, kind, itemUid, patch) {
  const key = kind === "topping" ? "toppings" : "decorations";
  return {
    ...cake,
    [key]: cake[key].map((it) => (it.uid === itemUid ? { ...it, ...patch } : it)),
  };
}

export function removeItem(cake, kind, itemUid) {
  const key = kind === "topping" ? "toppings" : "decorations";
  return { ...cake, [key]: cake[key].filter((it) => it.uid !== itemUid) };
}

export function clearDecor(cake) {
  return { ...cake, toppings: [], decorations: [], scatter: [], finalTouches: [], message: null };
}

export function countPlaced(cake) {
  return cake.toppings.length + cake.decorations.length;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
