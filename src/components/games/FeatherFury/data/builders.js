/**
 * Level authoring helpers. Levels are written in "island" coordinates: x to
 * the right, `y` = height ABOVE the ground of a piece's bottom edge. The
 * builder turns them into engine pieces (centre positions, y down).
 *
 * Building blocks come in standard sizes so towers stack cleanly:
 * planks are 20 thick, boxes are 40×40, and a frame is two posts + a beam.
 */
import { ENEMIES, MATERIALS, BIRD_BONUS } from "../engine/game.js";

const T = 20; // plank thickness

export function builder() {
  const pieces = [];
  const terrain = [];
  const b = {
    pieces,
    terrain,
    /** rectangle with its bottom-centre at (x, y) */
    box(mat, x, y, w = 40, h = 40, extra) {
      pieces.push({ t: "block", mat, x, y: -(y + h / 2), w, h, ...extra });
      return y + h;
    },
    /** upright plank */
    post(mat, x, y, h = 100, w = T) {
      return b.box(mat, x, y, w, h);
    },
    /** lying plank */
    beam(mat, x, y, w = 120, h = T) {
      return b.box(mat, x, y, w, h);
    },
    /** round log / boulder sitting at height y */
    ball(mat, x, y, r = 20) {
      pieces.push({ t: "block", mat, shape: "circle", x, y: -(y + r), r, w: r * 2, h: r * 2 });
      return y + 2 * r;
    },
    /** right-triangle wedge; x is the left edge, `flip` puts the tall side right */
    tri(mat, x, y, w = 60, h = 40, flip = false) {
      const cx = flip ? x + (2 * w) / 3 : x + w / 3;
      pieces.push({ t: "block", mat, shape: "tri", x: cx, y: -(y + h / 3), w, h, flip });
      return y + h;
    },
    tnt(x, y) {
      return b.box("tnt", x, y, 40, 40);
    },
    enemy(kind, x, y) {
      const r = ENEMIES[kind].r;
      pieces.push({ t: "enemy", kind, x, y: -(y + r) });
      return y + 2 * r;
    },
    /** two posts and a beam; returns the height of the top */
    frame(mat, x, y, w = 100, h = 100, beamMat = mat) {
      b.post(mat, x - w / 2 + T / 2, y, h);
      b.post(mat, x + w / 2 - T / 2, y, h);
      return b.beam(beamMat, x, y + h, w + 20);
    },
    /** frame with an enemy inside */
    hut(mat, x, y, kind = "small", w = 100, h = 100, beamMat = mat) {
      b.enemy(kind, x, y);
      return b.frame(mat, x, y, w, h, beamMat);
    },
    /** stacked frames, one material per floor (bottom first) */
    tower(x, y, mats, w = 100, h = 100, enemies = []) {
      let top = y;
      mats.forEach((m, i) => {
        if (enemies[i]) b.enemy(enemies[i], x, top);
        top = b.frame(m, x, top, w, h);
      });
      return top;
    },
    /** a column of boxes */
    stack(mat, x, y, n, s = 40) {
      let top = y;
      for (let i = 0; i < n; i++) top = b.box(mat, x, top, s, s);
      return top;
    },
    /** a brick pyramid of boxes, `rows` boxes wide at the bottom */
    pyramid(mat, x, y, rows, s = 40) {
      let top = y;
      for (let r = 0; r < rows; r++) {
        const n = rows - r;
        for (let i = 0; i < n; i++) b.box(mat, x + (i - (n - 1) / 2) * s, top, s, s);
        top += s;
      }
      return top;
    },
    /* --- static island terrain --- */
    /** solid rock/earth block whose top surface is at height `top` */
    plat(x, top, w, h = top, style = "rock", ice = false) {
      terrain.push({ x, y: -(top - h / 2), w, h, style, ice });
      return top;
    },
    /** a ramp from (x0, 0) up to (x1, h) — or down if h < 0 is given via flip */
    slope(x0, x1, h, flip = false, style = "rock", ice = false) {
      const verts = flip
        ? [{ x: x0, y: 0 }, { x: x1, y: 0 }, { x: x0, y: -h }]
        : [{ x: x0, y: 0 }, { x: x1, y: 0 }, { x: x1, y: -h }];
      const cx = (verts[0].x + verts[1].x + verts[2].x) / 3;
      const cy = (verts[0].y + verts[1].y + verts[2].y) / 3;
      terrain.push({ shape: "slope", x: cx, y: cy, verts, w: x1 - x0, h, style, ice, flip });
      return h;
    },
  };
  return b;
}

/**
 * Turns a level spec into a definition. `build(b)` draws the layout with
 * the builder; star thresholds come from the level's own point pool unless
 * the spec overrides them.
 */
export function makeLevel(spec) {
  const b = builder();
  spec.build(b);
  const enemyPts = b.pieces.filter((p) => p.t === "enemy").reduce((s, p) => s + ENEMIES[p.kind].pts, 0);
  const blockPts = b.pieces.filter((p) => p.t === "block").reduce((s, p) => s + MATERIALS[p.mat].pts, 0);
  const maxX = Math.max(...b.pieces.map((p) => p.x + (p.w || 0) / 2), ...b.terrain.map((t) => t.x + t.w / 2));
  const spare = Math.min(2, spec.birds.length - 1);
  const stars = spec.stars || [
    0,
    Math.round((enemyPts + blockPts * 0.25) / 1000) * 1000,
    Math.round((enemyPts + blockPts * 0.45 + (spare >= 1 ? BIRD_BONUS : 0)) / 1000) * 1000,
  ];
  return {
    id: spec.id,
    world: spec.world,
    name: spec.name,
    hint: spec.hint || "",
    birds: spec.birds,
    icyGround: !!spec.icyGround,
    pieces: b.pieces,
    terrain: b.terrain,
    width: Math.max(1400, Math.round(maxX + 180)),
    stars,
  };
}
