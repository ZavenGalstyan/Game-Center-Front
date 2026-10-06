/**
 * Lost Toy — level-authoring kit.
 *
 * Levels are built out of believable household objects at true scale
 * (1 unit = 10 cm; the toy is 1 unit tall). Every kit call pushes BOTH the
 * collision boxes and the visual descriptor the renderer turns into meshes
 * (three/props.js), so what you see is exactly what you stand on.
 *
 *   const K = createKit({ id, name, world, … });
 *   K.room({ … });  K.book({ … });  K.chair({ … });  …
 *   return K.done();
 *
 * Platforming reference (see engine/config.js):
 *   jump up ≤ 1.1 (tap ≈ 0.6) · ledge grab lip ≤ 1.4 above the feet
 *   running gap ≤ 2.0 · sprint gap ≤ 2.9 · walk-over step ≤ 0.17
 *   narrow (< 0.62 wide) = balance beam · drops > maxFall (5.5) = respawn
 */
export const GAP = { STEP: 0.17, JUMP: 1.1, LEDGE: 1.4, RUN: 2.0, SPRINT: 2.9, BALANCE: 0.62 };

export function createKit(meta) {
  const L = {
    floorY: 0,
    killY: -6,
    maxFall: 5.5,
    ...meta,
    boxes: [],
    props: [],
    movers: [],
    pushables: [],
    interacts: [],
    hazards: [],
    pets: [],
    buttons: [],
    checkpoints: [],
    hints: [],
    lights: [],
    route: [],
  };

  /** raw collision box; returns its index (stable id = index + 1 in the world) */
  function box(min, max, o = {}) {
    L.boxes.push({ min, max, ...o });
    return L.boxes.length - 1;
  }
  /** box from bottom-centre + size */
  function cbox(x, y, z, w, h, d, o) {
    return box([x - w / 2, y, z - d / 2], [x + w / 2, y + h, z + d / 2], o);
  }
  function prop(p) {
    L.props.push(p);
    return p;
  }

  const K = {
    L,
    box,
    cbox,
    prop,

    /* ---------------------------------------------------------- level meta */
    spawn(x, y, z, yaw = 0) {
      L.spawn = { x, y, z, yaw };
    },
    finish(x, y, z, o = {}) {
      L.finish = { x, y, z, r: o.r || 1.0, yaw: o.yaw || 0, kind: o.kind || "flag" };
    },
    checkpoint(x, y, z, yaw = 0, r = 1.1) {
      L.checkpoints.push({ x, y, z, yaw, r });
    },
    button(x, y, z, note = "") {
      L.buttons.push({ x, y, z, note });
    },
    hint(key, x0, z0, x1, z1, y = 0, h = 3) {
      L.hints.push({ key, min: [Math.min(x0, x1), Math.min(z0, z1)], max: [Math.max(x0, x1), Math.max(z0, z1)], y, h });
    },
    /** bot route node (tools/levelBot.mjs walks these through the real input path) */
    go(x, z, o = {}) {
      L.route.push({ x, z, ...o });
    },

    /* ---------------------------------------------------------- the room shell */
    /**
     * Walls / floor / ceiling with thick collision so neither the toy nor the
     * camera can leave. windows: [{ wall:"back"|"left"|"right"|"front", c, y, w, h }]
     * doors: [{ wall, c, w, h }]   (c = centre along the wall)
     */
    room(o) {
      const { x0, x1, z0, z1, h } = o;
      const T = 3;
      L.room = { floor: "planks", wall: "#f3e6d4", wallKind: "wall", trim: "#fff8ee", ceiling: "#fbf4ea", ...o };
      L.ceilingY = h;
      box([x0 - T, -2, z0 - T], [x1 + T, 0, z1 + T], { mat: o.floorMat || "wood", noLedge: true });
      box([x0 - T, 0, z0 - T], [x0, h, z1 + T], { mat: "wall", noLedge: true });
      box([x1, 0, z0 - T], [x1 + T, h, z1 + T], { mat: "wall", noLedge: true });
      box([x0, 0, z0 - T], [x1, h, z0], { mat: "wall", noLedge: true });
      box([x0, 0, z1], [x1, h, z1 + T], { mat: "wall", noLedge: true });
      box([x0 - T, h, z0 - T], [x1 + T, h + 2, z1 + T], { mat: "wall", noLedge: true });
      // baseboards: a tiny step along the walls (visual + walkable lip)
      for (const w of o.windows || []) {
        // window sill sticking into the room (a real platform)
        const sd = w.sill || 0.9;
        if (w.wall === "back") box([w.c - w.w / 2 - 0.6, w.y - 0.35, z0], [w.c + w.w / 2 + 0.6, w.y, z0 + sd], { mat: "wood", kind: "sill" });
        if (w.wall === "front") box([w.c - w.w / 2 - 0.6, w.y - 0.35, z1 - sd], [w.c + w.w / 2 + 0.6, w.y, z1], { mat: "wood", kind: "sill" });
        if (w.wall === "left") box([x0, w.y - 0.35, w.c - w.w / 2 - 0.6], [x0 + sd, w.y, w.c + w.w / 2 + 0.6], { mat: "wood", kind: "sill" });
        if (w.wall === "right") box([x1 - sd, w.y - 0.35, w.c - w.w / 2 - 0.6], [x1, w.y, w.c + w.w / 2 + 0.6], { mat: "wood", kind: "sill" });
      }
    },

    /** outdoor ground (backyard): a big ground slab + soft invisible boundary walls (fences are props) */
    yard(o) {
      const { x0, x1, z0, z1 } = o;
      L.room = { outdoor: true, floor: "grass", ...o };
      L.ceilingY = null;
      box([x0 - 4, -3, z0 - 4], [x1 + 4, 0, z1 + 4], { mat: "grass", noLedge: true });
      const H = 40;
      box([x0 - 4, 0, z0 - 4], [x0, H, z1 + 4], { mat: "wood", noLedge: true, invisible: true });
      box([x1, 0, z0 - 4], [x1 + 4, H, z1 + 4], { mat: "wood", noLedge: true, invisible: true });
      box([x0, 0, z0 - 4], [x1, H, z0], { mat: "wood", noLedge: true, invisible: true });
      box([x0, 0, z1], [x1, H, z1 + 4], { mat: "wood", noLedge: true, invisible: true });
    },

    /* ---------------------------------------------------------- floor coverings */
    rug(x, z, w, d, o = {}) {
      const i = cbox(x, 0, z, w, 0.08, d, { mat: "fabric", noLedge: true, noCamera: true });
      prop({ type: "rug", x, y: 0, z, w, h: 0.08, d, pattern: o.pattern || "classic", color: o.color || "#c9734f", box: i });
    },
    mat(x, y, z, w, d, o = {}) {
      const i = cbox(x, y, z, w, 0.06, d, { mat: o.mat || "fabric", noLedge: true, noCamera: true, slip: !!o.slip });
      prop({ type: "flatmat", x, y, z, w, h: 0.06, d, color: o.color || "#7fa3c9", kind: o.kind || "fabric", box: i });
    },

    /* ---------------------------------------------------------- books & paper */
    /** a book lying flat (spine: 0 +z, 1 +x, 2 -z, 3 -x) */
    book(x, y, z, w, h, d, o = {}) {
      const i = cbox(x, y, z, w, h, d, { mat: "paper" });
      prop({ type: "book", x, y, z, w, h, d, color: o.color || "#c0504d", spine: o.spine ?? 3, band: o.band || "#f2d16b", box: i });
      return y + h;
    },
    /** stacked flat books: list of { w, h, d, color, dx, dz, spine } */
    books(x, y, z, list) {
      let yy = y;
      for (const b of list) yy = K.book(x + (b.dx || 0), yy, z + (b.dz || 0), b.w, b.h, b.d, b);
      return yy;
    },
    /** a row of books standing upright (on a shelf / desk) — one collision box, many spines */
    bookRow(x0, x1, y, z, d, hMax, o = {}) {
      const i = box([Math.min(x0, x1), y, z - d / 2], [Math.max(x0, x1), y + hMax, z + d / 2], { mat: "paper", noLedge: !!o.noLedge });
      prop({ type: "bookRow", x0: Math.min(x0, x1), x1: Math.max(x0, x1), y, z, d, h: hMax, axis: "x", seed: o.seed || 1, box: i, palette: o.palette });
    },
    bookRowZ(x, y, z0, z1, d, hMax, o = {}) {
      const i = box([x - d / 2, y, Math.min(z0, z1)], [x + d / 2, y + hMax, Math.max(z0, z1)], { mat: "paper", noLedge: !!o.noLedge });
      prop({ type: "bookRow", z0: Math.min(z0, z1), z1: Math.max(z0, z1), y, x, d, h: hMax, axis: "z", seed: o.seed || 1, box: i, palette: o.palette });
    },
    notebook(x, y, z, w, d, o = {}) {
      const i = cbox(x, y, z, w, 0.14, d, { mat: "paper", noLedge: true });
      prop({ type: "notebook", x, y, z, w, h: 0.14, d, color: o.color || "#3f7fd6", open: !!o.open, rot: o.rot || 0, box: i });
      return y + 0.14;
    },
    paper(x, y, z, w, d, o = {}) {
      prop({ type: "paper", x, y, z, w, h: 0.02, d, rot: o.rot || 0, color: o.color || "#fbf8f0", lowHide: true });
    },

    /* ---------------------------------------------------------- toys */
    block(x, y, z, s, o = {}) {
      if (o.push) {
        const p = { min: [x - s / 2, y, z - s / 2], max: [x + s / 2, y + s, z + s / 2], axis: o.push.axis || "xz", range: o.push.range || null, mat: "wood", resetOnRespawn: !!o.push.resetOnRespawn };
        L.pushables.push(p);
        prop({ type: "block", pushIndex: L.pushables.length - 1, x, y, z, w: s, h: s, d: s, color: o.color || "#e85d4a", letter: o.letter || "A" });
        return y + s;
      }
      const i = cbox(x, y, z, s, s, s, { mat: "wood" });
      prop({ type: "block", x, y, z, w: s, h: s, d: s, color: o.color || "#e85d4a", letter: o.letter || "B", box: i });
      return y + s;
    },
    /** stack of toy blocks: list of { s, color, letter, dx, dz } */
    blocks(x, y, z, list) {
      let yy = y;
      for (const b of list) yy = K.block(x + (b.dx || 0), yy, z + (b.dz || 0), b.s || 1.2, b);
      return yy;
    },
    ball(x, y, z, r, o = {}) {
      // a resting ball: square-ish collision so you can stand on its top
      const s = r * 1.3;
      const i = cbox(x, y, z, s, r * 2, s, { mat: "rubber", bounce: o.bounce || 0, noLedge: true });
      prop({ type: "ball", x, y, z, r, color: o.color || "#e94f4f", color2: o.color2 || "#f6d04d", box: i });
    },
    teddy(x, z, o = {}) {
      // a big sitting plush bear: soft belly (bounce), head is climbable-by-jump
      const s = o.s || 1;
      const rot = o.rot || 0;
      const i1 = cbox(x, 0, z, 7 * s, 5.2 * s, 6 * s, { mat: "fabric", bounce: o.bounce ?? 8.5, noLedge: true });
      const i2 = cbox(x, 5.2 * s, z, 5 * s, 4.4 * s, 4.6 * s, { mat: "fabric", noLedge: true });
      prop({ type: "teddy", x, y: 0, z, s, rot, color: o.color || "#c98d5a", box: i1, box2: i2 });
    },
    car(x, y, z, o = {}) {
      // a parked toy car (static) — roof is a platform
      const rot = o.rot || 0;
      const w = rot % 2 ? 1.5 : 2.6;
      const d = rot % 2 ? 2.6 : 1.5;
      const i = cbox(x, y, z, w, 1.2, d, { mat: "plastic" });
      prop({ type: "toyCar", x, y, z, rot, color: o.color || "#3f7fd6", box: i });
    },
    springToy(x, y, z, o = {}) {
      const i = cbox(x, y, z, 1.6, 1.0, 1.6, { mat: "metal", bounce: o.bounce || 12.5, noLedge: true });
      prop({ type: "spring", x, y, z, w: 1.6, h: 1.0, d: 1.6, color: o.color || "#e85d9c", box: i });
    },
    drum(x, y, z, r, h, o = {}) {
      const s = r * 1.75;
      const i = cbox(x, y, z, s, h, s, { mat: "plastic", bounce: o.bounce || 10, noLedge: true });
      prop({ type: "drum", x, y, z, r, h, color: o.color || "#d9473b", box: i });
    },
    trainTrack(x0, z0, x1, z1, o = {}) {
      prop({ type: "track", x0, z0, x1, z1, y: o.y || 0, lowHide: false });
    },

    /* ---------------------------------------------------------- boxes */
    /** cardboard box; open: side the opening faces ("+x","-x","+z","-z","top") or null (closed) */
    cardboard(x, y, z, w, h, d, o = {}) {
      const t = 0.14;
      const open = o.open || null;
      const ids = [];
      const x0 = x - w / 2;
      const x1 = x + w / 2;
      const z0 = z - d / 2;
      const z1 = z + d / 2;
      if (!open) ids.push(cbox(x, y, z, w, h, d, { mat: "cardboard" }));
      else {
        ids.push(box([x0, y, z0], [x1, y + t, z1], { mat: "cardboard", noLedge: true })); // floor
        if (open !== "top") ids.push(box([x0, y + h - t, z0], [x1, y + h, z1], { mat: "cardboard" })); // lid
        if (open !== "-x") ids.push(box([x0, y, z0], [x0 + t, y + h, z1], { mat: "cardboard" }));
        if (open !== "+x") ids.push(box([x1 - t, y, z0], [x1, y + h, z1], { mat: "cardboard" }));
        if (open !== "-z") ids.push(box([x0, y, z0], [x1, y + h, z0 + t], { mat: "cardboard" }));
        if (open !== "+z") ids.push(box([x0, y, z1 - t], [x1, y + h, z1], { mat: "cardboard" }));
      }
      prop({ type: "cardboard", x, y, z, w, h, d, open, tape: o.tape !== false, label: o.label || null, box: ids[0] });
      return y + h;
    },
    shoebox(x, y, z, w, h, d, o = {}) {
      const i = cbox(x, y, z, w, h, d, { mat: "cardboard" });
      prop({ type: "shoebox", x, y, z, w, h, d, color: o.color || "#e9e2d6", lid: o.lid || "#d6553f", box: i });
      return y + h;
    },
    chest(x0, x1, z0, z1, h, o = {}) {
      const i = box([x0, 0, z0], [x1, h, z1], { mat: "wood" });
      prop({ type: "chest", x: (x0 + x1) / 2, y: 0, z: (z0 + z1) / 2, w: x1 - x0, h, d: z1 - z0, color: o.color || "#7fb5c9", trim: o.trim || "#f4e7cf", front: o.front || "+z", box: i });
      return h;
    },

    /* ---------------------------------------------------------- soft things */
    pillow(x, y, z, w, h, d, o = {}) {
      const i = cbox(x, y, z, w, h, d, { mat: "fabric", bounce: o.bounce ?? 8.8, noLedge: true });
      prop({ type: "pillow", x, y, z, w, h, d, color: o.color || "#f4f0e6", pattern: o.pattern || null, box: i });
      return y + h;
    },
    cushion(x, y, z, w, h, d, o = {}) {
      const i = cbox(x, y, z, w, h, d, { mat: "fabric", bounce: o.bounce ?? 7.5, noLedge: true });
      prop({ type: "cushion", x, y, z, w, h, d, color: o.color || "#e07a5f", box: i });
      return y + h;
    },
    laundry(x, z, w, h, d, o = {}) {
      const i = cbox(x, 0, z, w, h, d, { mat: "fabric", bounce: o.bounce ?? 7, noLedge: true });
      prop({ type: "laundry", x, y: 0, z, w, h, d, box: i, seed: o.seed || 3 });
    },
    sock(x, y, z, o = {}) {
      prop({ type: "sock", x, y, z, rot: o.rot || 0, color: o.color || "#f4f0e6", stripe: o.stripe || "#d9473b", lowHide: true });
    },

    /* ---------------------------------------------------------- more bedroom things */
    /** a fuzzy house slipper lying on the floor: walk in at the heel, a little cave under the toe cap */
    slipper(x, z, o = {}) {
      const rot = o.rot || 0; // 0: toe toward -z, 1: toe toward +x, 2: +z, 3: -x
      const L = 3.4;
      const Wd = 1.5;
      const H = 1.5;
      const t = 0.14;
      const toe = [[0, -1], [1, 0], [0, 1], [-1, 0]][rot];
      const along = toe[0] !== 0 ? "x" : "z";
      const half = L / 2;
      const ids = [];
      const bx = (a0, a1, w0, w1, y0, y1, extra = {}) => {
        // a = along the slipper (toe positive), w = across
        const p0 = along === "x" ? [x + a0 * toe[0], z + w0] : [x + w0, z + a0 * toe[1]];
        const p1 = along === "x" ? [x + a1 * toe[0], z + w1] : [x + w1, z + a1 * toe[1]];
        ids.push(box([Math.min(p0[0], p1[0]), y0, Math.min(p0[1], p1[1])], [Math.max(p0[0], p1[0]), y1, Math.max(p0[1], p1[1])], { mat: "fabric", noLedge: true, ...extra }));
      };
      bx(-half, half, -Wd / 2, Wd / 2, 0, 0.16, { noLedge: false });
      bx(-half * 0.1, half, -Wd / 2, -Wd / 2 + t, 0, H);
      bx(-half * 0.1, half, Wd / 2 - t, Wd / 2, 0, H);
      bx(half - t, half, -Wd / 2, Wd / 2, 0, H);
      bx(-half * 0.1, half, -Wd / 2, Wd / 2, H - 0.22, H, { noLedge: false });
      prop({ type: "slipper", x, y: 0, z, rot, L, W: Wd, H, color: o.color || "#f28da0", color2: o.color2 || "#fff0f3", box: ids[0] });
      return ids;
    },
    /** a fabric bunting garland hanging down a face: climbable. face: side it hangs on (+x,-x,+z,-z) */
    garland(x0, x1, z0, z1, y0, y1, o = {}) {
      const i = box([x0, y0, z0], [x1, y1, z1], { mat: "fabric", climb: true, noLedge: true, noCamera: true });
      prop({ type: "garland", x0, x1, z0, z1, y0, y1, colors: o.colors || ["#e85d4a", "#f2c14e", "#4fb3a8", "#6f9bd1"], box: i });
      return i;
    },
    /** a plush toy (bunny / bear / whale) — soft, bouncy */
    plush(x, y, z, o = {}) {
      const s = o.s || 1;
      const w = 2.4 * s;
      const h = 1.8 * s;
      const i = cbox(x, y, z, w, h, w, { mat: "fabric", bounce: o.bounce ?? 9.5, noLedge: true });
      prop({ type: "plush", x, y, z, s, kind: o.kind || "bunny", color: o.color || "#f4e3e8", rot: o.rot || 0, box: i });
      return y + h;
    },
    dustBunny(x, z, o = {}) {
      prop({ type: "dustBunny", x, y: 0, z, s: o.s || 1, lowHide: true });
    },
    /** a crank-operated string lift (platform that rides up / down when wound) */
    lift(x, y, z, w, d, rise, o = {}) {
      const m = K.mover("platform", { min: [x - w / 2, y - 0.3, z - d / 2], max: [x + w / 2, y, z + d / 2] }, { type: "line", d: [0, rise, 0], period: o.period || 9, hold: o.hold ?? 0.22 }, { startsOn: o.startsOn ?? false, color: o.color || "#c0504d", color2: o.color2 || "#f2d16b", extra: { look: o.look || "book", strings: o.strings ?? rise + 4 } });
      if (o.crank) K.interact("crank", o.crank[0], o.crank[1], o.crank[2], { mover: m }, { label: o.label || "Wind the lift", r: 1.5, rot: o.crankRot || 0 });
      return m;
    },
    dresser(x0, x1, z0, z1, h, o = {}) {
      const i = box([x0, 0, z0], [x1, h, z1], { mat: "wood" });
      prop({ type: "dresser", x0, x1, z0, z1, h, color: o.color || "#e9d8bd", front: o.front || "+z", rows: o.rows || 3, box: i });
      return h;
    },
    /** clothes hanging from a rail: soft climbable fabric. face: the side the toy climbs from */
    clothes(x0, x1, z0, z1, y0, y1, o = {}) {
      const i = box([x0, y0, z0], [x1, y1, z1], { mat: "fabric", climb: true, noLedge: true });
      prop({ type: "clothes", x0, x1, z0, z1, y0, y1, color: o.color || "#6f9bd1", box: i });
      return i;
    },
    fan(x, y, z, dir, len, o = {}) {
      // a desk fan blowing along dir ([1,0,0] …): wind zone in front of it
      const w = o.w || 3;
      const h = o.h || 3;
      const cx = x + dir[0] * (len / 2 + 1.2);
      const cz = z + dir[2] * (len / 2 + 1.2);
      const size = dir[0] !== 0 ? [len, h, w] : [w, h, len];
      return K.hazard({ type: "wind", look: "fan", pos: [cx, y, cz], size, dir, force: o.force || 3, period: o.period, onFrac: o.onFrac, warnFrac: o.warnFrac, phase: o.phase, fanY: o.fanY || 1.6 });
    },

    /** a "don't touch" patch (spilled paint, wet glue, a hot ring): toy says oops and respawns */
    spill(x, y, z, w, d, o = {}) {
      prop({ type: "spill", x, y, z, w, d, color: o.color || "#6fc3e8", lowHide: false });
      return K.hazard({ type: "zone", kind: o.kind || "paint", look: "paint", pos: [x, y, z], size: [w, o.h || 0.12, d], color: o.color || "#6fc3e8" });
    },
    laptop(x, y, z, o = {}) {
      const w = o.w || 6;
      const d = o.d || 4;
      const ids = [cbox(x, y, z, w, 0.3, d, { mat: "plastic" })];
      // the open screen standing at the back edge
      ids.push(box([x - w / 2, y + 0.3, z - d / 2 - 0.25], [x + w / 2, y + 4.1, z - d / 2 + 0.05], { mat: "plastic", noLedge: false }));
      prop({ type: "laptop", x, y, z, w, d, color: o.color || "#c9ccd2", box: ids[0] });
    },
    gate(x0, x1, z, h, o = {}) {
      const i = box([x0, 0, z - 0.2], [x1, h, z + 0.2], { mat: "wood" });
      prop({ type: "gate", x0, x1, z, h, color: o.color || "#f4efe6", box: i });
    },
    hatbox(x, y, z, r, h, o = {}) {
      const s = r * 1.75;
      const i = cbox(x, y, z, s, h, s, { mat: "cardboard" });
      prop({ type: "hatbox", x, y, z, r, h, color: o.color || "#f28da0", band: o.band || "#fff1cf", box: i });
      return y + h;
    },
    /** a loop of wooden track for a toy train mover (visual only) */
    trackLoop(pts, y) {
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        prop({ type: "track", x0: a[0], z0: a[1], x1: b[0], z1: b[1], y });
      }
    },

    /* ---------------------------------------------------------- kitchen */
    /**
     * Base cabinets with a worktop. front: side with the doors. sink: optional
     * { x0, x1, z0, z1, depth, water } — a real basin cut into the worktop
     * (walls are worktop pieces, the bottom sits `depth` lower, deep water inside).
     */
    counter(x0, x1, z0, z1, h, o = {}) {
      const t = 0.5;
      const ids = [];
      const sk = o.sink;
      // the cabinet body (hollow under a sink basin)
      const bx0 = x0 + 0.2;
      const bx1 = x1 - 0.2;
      const bz0 = z0 + 0.2;
      const bz1 = z1 - 0.2;
      if (!sk) ids.push(box([bx0, 0, bz0], [bx1, h - t, bz1], { mat: "wood", noLedge: true }));
      else {
        const under = h - sk.depth - 0.3;
        ids.push(box([bx0, 0, bz0], [bx1, under, bz1], { mat: "wood", noLedge: true }));
        if (sk.x0 > bx0) ids.push(box([bx0, under, bz0], [sk.x0, h - t, bz1], { mat: "wood", noLedge: true }));
        if (sk.x1 < bx1) ids.push(box([sk.x1, under, bz0], [bx1, h - t, bz1], { mat: "wood", noLedge: true }));
        if (sk.z0 > bz0) ids.push(box([sk.x0, under, bz0], [sk.x1, h - t, sk.z0], { mat: "wood", noLedge: true }));
        if (sk.z1 < bz1) ids.push(box([sk.x0, under, sk.z1], [sk.x1, h - t, bz1], { mat: "wood", noLedge: true }));
      }
      if (!sk) ids.push(box([x0, h - t, z0], [x1, h, z1], { mat: o.topMat || "stone" }));
      else {
        // worktop around the basin
        if (sk.x0 > x0) ids.push(box([x0, h - t, z0], [sk.x0, h, z1], { mat: "stone" }));
        if (sk.x1 < x1) ids.push(box([sk.x1, h - t, z0], [x1, h, z1], { mat: "stone" }));
        if (sk.z0 > z0) ids.push(box([sk.x0, h - t, z0], [sk.x1, h, sk.z0], { mat: "stone" }));
        if (sk.z1 < z1) ids.push(box([sk.x0, h - t, sk.z1], [sk.x1, h, z1], { mat: "stone" }));
        // the basin: stainless walls down to its floor
        const bot = h - sk.depth;
        ids.push(box([sk.x0, bot - 0.3, sk.z0], [sk.x1, bot, sk.z1], { mat: "metal", noLedge: true }));
        if (sk.water) K.hazard({ type: "water", deep: true, pos: [(sk.x0 + sk.x1) / 2, bot, (sk.z0 + sk.z1) / 2], size: [sk.x1 - sk.x0, sk.water, sk.z1 - sk.z0] });
      }
      prop({ type: "counter", x0, x1, z0, z1, h, front: o.front || "+z", color: o.color || "#4fb3a8", top: o.top || "#f4efe6", sink: sk || null, box: ids[0] });
      return h;
    },
    upperCabinet(wall, c, y, w, h, o = {}) {
      prop({ type: "upperCabinet", wall, c, y, w, h, color: o.color || "#4fb3a8", open: !!o.open });
    },
    fridge(x0, x1, z0, z1, h, o = {}) {
      const i = box([x0, 0, z0], [x1, h, z1], { mat: "metal", noLedge: false });
      prop({ type: "fridge", x0, x1, z0, z1, h, front: o.front || "+z", color: o.color || "#f4f4f2", box: i });
      return h;
    },
    /** a fridge magnet sticking out of a front face: a tiny ledge to climb on */
    magnet(x, y, z, face, o = {}) {
      const w = o.w || 1.2;
      const d = o.d || 0.7;
      const h = o.h || 0.5;
      let i;
      if (face === "+z") i = box([x - w / 2, y - h, z], [x + w / 2, y, z + d], { mat: "plastic" });
      else if (face === "-z") i = box([x - w / 2, y - h, z - d], [x + w / 2, y, z], { mat: "plastic" });
      else if (face === "+x") i = box([x, y - h, z - w / 2], [x + d, y, z + w / 2], { mat: "plastic" });
      else i = box([x - d, y - h, z - w / 2], [x, y, z + w / 2], { mat: "plastic" });
      prop({ type: "magnet", x, y, z, face, w, d, h, color: o.color || "#e85d4a", shape: o.shape || "letter", letter: o.letter || "A", box: i });
    },
    table(x0, x1, z0, z1, h, o = {}) {
      const ids = [box([x0, h - 0.5, z0], [x1, h, z1], { mat: "wood" })];
      const lg = 0.8;
      for (const [lx, lz] of [
        [x0 + 0.6, z0 + 0.6],
        [x1 - 0.6 - lg, z0 + 0.6],
        [x0 + 0.6, z1 - 0.6 - lg],
        [x1 - 0.6 - lg, z1 - 0.6 - lg],
      ])
        ids.push(box([lx, 0, lz], [lx + lg, h - 0.5, lz + lg], { mat: "wood", noLedge: true }));
      prop({ type: "table", x0, x1, z0, z1, h, color: o.color || "#d2a679", cloth: o.cloth || null, box: ids[0] });
      return h;
    },
    plate(x, y, z, r, o = {}) {
      const s = r * 1.7;
      const h = o.h || 0.16;
      const i = cbox(x, y, z, s, h, s, { mat: "ceramic", slip: !!o.wet });
      prop({ type: "plate", x, y, z, r, h, color: o.color || "#fbfbf7", rim: o.rim || "#4fb3a8", box: i });
      return y + h;
    },
    plates(x, y, z, r, n, o = {}) {
      const h = 0.16 * n;
      const s = r * 1.7;
      const i = cbox(x, y, z, s, h, s, { mat: "ceramic" });
      prop({ type: "plates", x, y, z, r, n, color: o.color || "#fbfbf7", rim: o.rim || "#4fb3a8", box: i });
      return y + h;
    },
    cup(x, y, z, o = {}) {
      const r = o.r || 0.8;
      const h = o.h || 1.0;
      const s = r * 1.7;
      const i = cbox(x, y, z, s, h, s, { mat: "ceramic" });
      prop({ type: "mug", x, y, z, r, h, color: o.color || "#fbfbf7", accent: o.accent || "#f2c14e", handle: 1, box: i });
      return y + h;
    },
    bowl(x, y, z, r, h, o = {}) {
      const s = r * 1.6;
      const i = cbox(x, y, z, s, h, s, { mat: "ceramic", noLedge: true });
      prop({ type: "bowl", x, y, z, r, h, color: o.color || "#f2c14e", fill: o.fill || null, box: i });
      return y + h;
    },
    /** a spoon lying across a gap: a balance bridge (bowl end a little wider) */
    spoon(x, y, z, len, o = {}) {
      const ax = o.axis || "x";
      const t = 0.12;
      const w = 0.42;
      const i = ax === "x" ? cbox(x, y, z, len, t, w, { mat: "metal", noLedge: true }) : cbox(x, y, z, w, t, len, { mat: "metal", noLedge: true });
      prop({ type: "spoon", x, y, z, len, axis: ax, flip: !!o.flip, color: o.color || "#d4d7dc", box: i });
      return y + t;
    },
    cereal(x, y, z, w, h, d, o = {}) {
      const i = cbox(x, y, z, w, h, d, { mat: "cardboard" });
      prop({ type: "cereal", x, y, z, w, h, d, color: o.color || "#f2c14e", label: o.label || "OATY O's", rot: o.rot || 0, box: i });
      return y + h;
    },
    jar(x, y, z, r, h, o = {}) {
      const s = r * 1.7;
      const i = cbox(x, y, z, s, h, s, { mat: "ceramic" });
      prop({ type: "jar", x, y, z, r, h, color: o.color || "#e9e2d6", lid: o.lid || "#d9473b", fill: o.fill || "#c98d5a", box: i });
      return y + h;
    },
    board(x, y, z, w, d, o = {}) {
      const i = cbox(x, y, z, w, 0.3, d, { mat: "wood" });
      prop({ type: "cutboard", x, y, z, w, d, color: o.color || "#d9a873", box: i });
      return y + 0.3;
    },
    toaster(x, y, z, o = {}) {
      const i = cbox(x, y, z, 2.6, 1.1, 1.6, { mat: "metal", bounce: o.bounce || 14.6, noLedge: true });
      prop({ type: "toaster", x, y, z, color: o.color || "#e85d4a", box: i });
      return y + 1.1;
    },
    kettle(x, y, z, o = {}) {
      const i = cbox(x, y, z, 1.8, 2.0, 1.8, { mat: "metal", noLedge: true });
      prop({ type: "kettle", x, y, z, color: o.color || "#4fb3a8", box: i });
    },
    stove(x, y, z, w, d, o = {}) {
      const rings = o.rings || [[-w / 4, -d / 4], [w / 4, d / 4]];
      prop({ type: "stove", x, y, z, w, d, rings });
      for (const [dx, dz] of rings) {
        K.hazard({ type: "zone", kind: "hot", look: "ring", color: "#ff6a3a", pos: [x + dx, y, z + dz], size: [w * 0.38, 0.3, d * 0.38], period: o.period || 5, onFrac: o.onFrac ?? 0.45, warnFrac: 0.2, phase: o.phase || 0 });
      }
    },
    /** a tea towel hanging from a rail / handle: climbable cloth. face: the side you climb from */
    towel(x0, x1, z0, z1, y0, y1, o = {}) {
      const i = box([x0, y0, z0], [x1, y1, z1], { mat: "fabric", climb: true, noLedge: true });
      prop({ type: "towel", x0, x1, z0, z1, y0, y1, color: o.color || "#e85d4a", color2: o.color2 || "#fff8ee", box: i });
      return i;
    },
    stepStool(x, z, o = {}) {
      const rot = o.rot || 0;
      const ax = rot % 2 ? "z" : "x";
      const ids = [];
      // two steps: low (1.4) and high (2.8), 2 deep each
      const w = 3.6;
      if (ax === "x") {
        ids.push(box([x - w / 2, 0, z], [x + w / 2, 1.4, z + 2], { mat: "plastic" }));
        ids.push(box([x - w / 2, 0, z - 2], [x + w / 2, 2.8, z], { mat: "plastic" }));
      } else {
        ids.push(box([x, 0, z - w / 2], [x + 2, 1.4, z + w / 2], { mat: "plastic" }));
        ids.push(box([x - 2, 0, z - w / 2], [x, 2.8, z + w / 2], { mat: "plastic" }));
      }
      prop({ type: "stepStool", x, z, rot, w, color: o.color || "#6f9bd1", box: ids[0] });
    },
    wetMat(x, z, w, d, o = {}) {
      const i = cbox(x, 0, z, w, 0.04, d, { mat: "tile", slip: true, noLedge: true, noCamera: true });
      prop({ type: "wetFloor", x, y: 0, z, w, d, box: i });
      if (o.sign !== false) prop({ type: "wetSign", x: x + w / 2 - 1.2, y: 0, z: z - d / 2 + 1.2 });
    },
    dishRack(x0, x1, z0, z1, y, o = {}) {
      const ids = [box([x0, y, z0], [x1, y + 0.3, z1], { mat: "metal" })];
      // standing plates = thin walls with rounded tops
      const n = o.plates || 5;
      const gap = (x1 - x0 - 1) / n;
      for (let i = 0; i < n; i++) {
        const px = x0 + 0.5 + gap * (i + 0.5);
        ids.push(box([px - 0.1, y + 0.3, z0 + 0.3], [px + 0.1, y + 0.3 + (o.plateH || 3.2), z1 - 0.3], { mat: "ceramic", noLedge: false }));
      }
      prop({ type: "dishRack", x0, x1, z0, z1, y, n, plateH: o.plateH || 3.2, box: ids[0] });
      return y + 0.3;
    },
    highChair(x, z, o = {}) {
      // a tall baby high chair: legs, a footrest, a seat and a tray — a climbing frame.
      // flip: tray toward -z (backrest toward +z)
      const sh = o.seatH || 7.6;
      const f = o.flip ? -1 : 1;
      const ids = [];
      const s = 3.6;
      for (const [lx, lz] of [
        [x - s / 2, z - s / 2],
        [x + s / 2 - 0.35, z - s / 2],
        [x - s / 2, z + s / 2 - 0.35],
        [x + s / 2 - 0.35, z + s / 2 - 0.35],
      ])
        ids.push(box([lx, 0, lz], [lx + 0.35, sh - 0.3, lz + 0.35], { mat: "wood", noLedge: true }));
      ids.push(box([x - s / 2 - 0.2, 2.4, z - s / 2], [x + s / 2 + 0.2, 2.65, z + s / 2], { mat: "wood" }));
      ids.push(box([x - s / 2, sh - 0.3, z - s / 2], [x + s / 2, sh, z + s / 2], { mat: "wood" }));
      const bz = z - f * (s / 2 - 0.175);
      ids.push(box([x - s / 2, sh, bz - 0.175], [x + s / 2, sh + 3.4, bz + 0.175], { mat: "wood", noLedge: true }));
      const tz0 = z + f * (s / 2 - 0.2);
      const tz1 = z + f * (s / 2 + 1.6);
      const ty = sh + (o.trayY || 1.0);
      ids.push(box([x - s / 2 - 0.3, ty, Math.min(tz0, tz1)], [x + s / 2 + 0.3, ty + 0.3, Math.max(tz0, tz1)], { mat: "plastic" }));
      prop({ type: "highChair", x, z, s, sh, f, ty, color: o.color || "#f4efe6", tray: o.tray || "#f2c14e", box: ids[ids.length - 1] });
    },
    /* ---------------------------------------------------------- garage */
    workbench(x0, x1, z0, z1, h, o = {}) {
      const ids = [box([x0, h - 0.6, z0], [x1, h, z1], { mat: "wood" })];
      for (const [lx, lz] of [
        [x0 + 0.4, z0 + 0.4],
        [x1 - 1.2, z0 + 0.4],
        [x0 + 0.4, z1 - 1.2],
        [x1 - 1.2, z1 - 1.2],
      ])
        ids.push(box([lx, 0, lz], [lx + 0.8, h - 0.6, lz + 0.8], { mat: "wood", noLedge: true }));
      // lower shelf between the legs
      if (o.shelf !== false) ids.push(box([x0 + 0.4, 2.0, z0 + 0.4], [x1 - 0.4, 2.4, z1 - 0.4], { mat: "wood" }));
      prop({ type: "workbench", x0, x1, z0, z1, h, color: o.color || "#c8956a", shelf: o.shelf !== false, box: ids[0] });
      return h;
    },
    /** pegboard on the back wall: a climbable face (the holes are great hand-holds) */
    pegboard(x0, x1, y0, y1, z, o = {}) {
      const i = box([x0, y0, z - 0.2], [x1, y1, z], { mat: "wood", climb: true, noLedge: true });
      prop({ type: "pegboard", x0, x1, y0, y1, z, color: o.color || "#d9b98f", tools: o.tools !== false, box: i });
      return i;
    },
    toolbox(x0, x1, z0, z1, h, o = {}) {
      const i = box([x0, 0, z0], [x1, h, z1], { mat: "metal" });
      prop({ type: "toolbox", x0, x1, z0, z1, h, color: o.color || "#d9473b", rows: o.rows || 4, front: o.front || "+z", box: i });
      return h;
    },
    /** open metal shelving: four posts and boards (each a platform) */
    metalShelf(x0, x1, z0, z1, h, tiers, o = {}) {
      const ids = [];
      const p = 0.35;
      for (const [px, pz] of [
        [x0, z0],
        [x1 - p, z0],
        [x0, z1 - p],
        [x1 - p, z1 - p],
      ])
        ids.push(box([px, 0, pz], [px + p, h, pz + p], { mat: "metal", noLedge: true }));
      const boards = [];
      for (let i = 1; i <= tiers; i++) {
        const y = (i * h) / tiers;
        boards.push(y);
        ids.push(box([x0, y - 0.25, z0], [x1, y, z1], { mat: "metal" }));
      }
      prop({ type: "metalShelf", x0, x1, z0, z1, h, boards, color: o.color || "#7f8a96", box: ids[ids.length - 1] });
      return boards;
    },
    paintCan(x, y, z, o = {}) {
      const r = o.r || 1.1;
      const h = o.h || 1.4;
      const s = r * 1.75;
      const i = cbox(x, y, z, s, h, s, { mat: "metal" });
      prop({ type: "paintCan", x, y, z, r, h, color: o.color || "#4fb3a8", drip: o.drip || o.color || "#4fb3a8", box: i });
      return y + h;
    },
    /** a stack of tyres: rubber = bouncy */
    tires(x, z, n, o = {}) {
      const r = o.r || 2.6;
      const th = o.th || 1.5;
      const s = r * 1.6;
      const i = cbox(x, 0, z, s, th * n, s, { mat: "rubber", bounce: o.bounce ?? 9.6, noLedge: true });
      prop({ type: "tires", x, y: 0, z, r, th, n, box: i });
      return th * n;
    },
    plank(x0, x1, z, y, o = {}) {
      const w = o.w || 1.4;
      const i = box([Math.min(x0, x1), y - 0.3, z - w / 2], [Math.max(x0, x1), y, z + w / 2], { mat: "wood" });
      prop({ type: "plank", x0: Math.min(x0, x1), x1: Math.max(x0, x1), z, y, w });
      return i;
    },
    plankZ(x, z0, z1, y, o = {}) {
      const w = o.w || 1.4;
      const i = box([x - w / 2, y - 0.3, Math.min(z0, z1)], [x + w / 2, y, Math.max(z0, z1)], { mat: "wood" });
      prop({ type: "plankZ", z0: Math.min(z0, z1), z1: Math.max(z0, z1), x, y, w });
      return i;
    },
    sawhorse(x, z, o = {}) {
      const h = o.h || 6;
      const len = o.len || 8;
      const ax = o.axis || "x";
      const i = ax === "x" ? cbox(x, h - 0.6, z, len, 0.6, 0.9, { mat: "wood" }) : cbox(x, h - 0.6, z, 0.9, 0.6, len, { mat: "wood" });
      prop({ type: "sawhorse", x, z, h, len, axis: ax, box: i });
      return h;
    },
    conveyor(x0, x1, z0, z1, y, v, o = {}) {
      const i = box([x0, y - 0.6, z0], [x1, y, z1], { mat: "rubber", conveyor: v });
      prop({ type: "conveyor", x0, x1, z0, z1, y, box: i, color: o.color || "#2a2d34", frame: o.frame || "#f2c14e" });
      return i;
    },
    bucket(x, y, z, o = {}) {
      const r = o.r || 1.6;
      const h = o.h || 2.6;
      const s = r * 1.7;
      const i = cbox(x, y, z, s, h, s, { mat: "plastic" });
      prop({ type: "bucket", x, y, z, r, h, color: o.color || "#6f9bd1", box: i });
      return y + h;
    },
    oilSpill(x, y, z, w, d) {
      const i = cbox(x, y, z, w, 0.03, d, { mat: "stone", slip: true, noLedge: true, noCamera: true });
      prop({ type: "oil", x, y, z, w, d, box: i });
    },
    /** a real car parked at the back: giant tyres you can stand on, a bumper ledge */
    bigCar(x0, z0, o = {}) {
      // car is 42 long along x, 18 wide along z, its body 9 high
      const ids = [];
      const len = o.len || 42;
      const wid = 18;
      for (const tx of [x0 + 7, x0 + len - 8]) for (const tz of [z0 + 1, z0 + wid - 1]) ids.push(cbox(tx, 0, tz, 6.4, 6.6, 2.4, { mat: "rubber", noLedge: true }));
      ids.push(box([x0, 4.0, z0 + 1.5], [x0 + len, 11, z0 + wid - 1.5], { mat: "metal" }));
      prop({ type: "bigCar", x0, z0, len, wid, color: o.color || "#6f9bd1", box: ids[ids.length - 1] });
    },
    cord(x0, x1, z, y, o = {}) {
      const i = box([Math.min(x0, x1), y - 0.25, z - 0.15], [Math.max(x0, x1), y, z + 0.15], { mat: "rubber", noLedge: true });
      prop({ type: "cord", x0: Math.min(x0, x1), x1: Math.max(x0, x1), z, y, color: o.color || "#f2c14e" });
      return i;
    },
    wallBike(x, y, z, o = {}) {
      prop({ type: "wallBike", x, y, z, color: o.color || "#e85d4a" });
    },
    lawnmower(x, z, o = {}) {
      const i = cbox(x, 0, z, 7, 4, 6, { mat: "metal" });
      prop({ type: "lawnmower", x, y: 0, z, color: o.color || "#6a8f3f", box: i });
    },
    switchE(x, y, z, target, o = {}) {
      return K.interact(o.kind || "lever", x, y, z, target, { label: o.label || "Pull the lever", r: o.r || 1.3, toggle: o.toggle !== false, color: o.color || "#e85d4a", rot: o.rot || 0 });
    },

    /* ---------------------------------------------------------- furniture */
    /**
     * Chair. facing: direction a sitter looks ("+x","-x","+z","-z"); the back is
     * on the opposite side. Legs, seat, stretchers (narrow beams) and a tall back.
     */
    chair(x, z, o = {}) {
      const s = o.size || 4.4;
      const sh = o.seatH || 4.5;
      const lg = 0.4;
      const facing = o.facing || "-z";
      const ids = [];
      const hx = s / 2;
      const legs = [
        [x - hx + lg / 2, z - hx + lg / 2],
        [x + hx - lg / 2, z - hx + lg / 2],
        [x - hx + lg / 2, z + hx - lg / 2],
        [x + hx - lg / 2, z + hx - lg / 2],
      ];
      for (const [lx, lz] of legs) ids.push(cbox(lx, 0, lz, lg, sh - 0.3, lg, { mat: "wood", noLedge: true }));
      ids.push(cbox(x, sh - 0.3, z, s, 0.3, s, { mat: "wood" }));
      // side stretchers (narrow beams, walkable with balance)
      const sy = o.stretchY || 1.5;
      ids.push(box([x - hx + 0.08, sy - 0.24, z - hx + 0.08], [x - hx + 0.32, sy, z + hx - 0.08], { mat: "wood", noLedge: true }));
      ids.push(box([x + hx - 0.32, sy - 0.24, z - hx + 0.08], [x + hx - 0.08, sy, z + hx - 0.08], { mat: "wood", noLedge: true }));
      // back
      const bh = o.backH || 9.4;
      const back = facing === "-z" ? "+z" : facing === "+z" ? "-z" : facing === "-x" ? "+x" : "-x";
      if (back === "+z") ids.push(box([x - hx, sh, z + hx - 0.4], [x + hx, bh, z + hx], { mat: "wood", noLedge: true }));
      if (back === "-z") ids.push(box([x - hx, sh, z - hx], [x + hx, bh, z - hx + 0.4], { mat: "wood", noLedge: true }));
      if (back === "+x") ids.push(box([x + hx - 0.4, sh, z - hx], [x + hx, bh, z + hx], { mat: "wood", noLedge: true }));
      if (back === "-x") ids.push(box([x - hx, sh, z - hx], [x - hx + 0.4, bh, z + hx], { mat: "wood", noLedge: true }));
      prop({ type: "chair", x, y: 0, z, s, sh, bh, back, sy, color: o.color || "#c8956a", box: ids[4] });
      if (o.cushion) K.cushion(x, sh, z + (back === "+z" ? -0.2 : back === "-z" ? 0.2 : 0), s - 0.9, 0.45, s - 0.9, o.cushion);
      return sh;
    },
    /** desk: top slab, legs, optional drawer unit ("left"/"right" = -x/+x end) */
    desk(x0, x1, z0, z1, h, o = {}) {
      const ids = [];
      ids.push(box([x0, h - 0.4, z0], [x1, h, z1], { mat: "wood" }));
      const lg = 0.6;
      const dw = o.drawers ? 4.2 : 0;
      const legs = [];
      if (o.drawers !== "left") legs.push([x0, z0], [x0, z1 - lg]);
      if (o.drawers !== "right") legs.push([x1 - lg, z0], [x1 - lg, z1 - lg]);
      for (const [lx, lz] of legs) ids.push(box([lx, 0, lz], [lx + lg, h - 0.4, lz + lg], { mat: "wood", noLedge: true }));
      let drawerBox = null;
      if (o.drawers === "right") drawerBox = box([x1 - dw, 0, z0], [x1, h - 0.4, z1], { mat: "wood", noLedge: true });
      if (o.drawers === "left") drawerBox = box([x0, 0, z0], [x0 + dw, h - 0.4, z1], { mat: "wood", noLedge: true });
      if (drawerBox != null) ids.push(drawerBox);
      prop({ type: "desk", x0, x1, z0, z1, h, drawers: o.drawers || null, dw, color: o.color || "#d2a679", knob: o.knob || "#8a5a3a", box: ids[0] });
      return h;
    },
    /** bed with an open space underneath, soft mattress (bounce), headboard, hanging blanket */
    bed(x0, x1, z0, z1, o = {}) {
      const top = o.top || 5.0;
      const frameY = o.frameY || 1.6;
      const railTop = o.railTop || frameY + 1.0;
      const lg = 0.8;
      for (const [lx, lz] of [
        [x0, z0],
        [x1 - lg, z0],
        [x0, z1 - lg],
        [x1 - lg, z1 - lg],
      ])
        box([lx, 0, lz], [lx + lg, railTop, lz + lg], { mat: "wood", noLedge: true });
      box([x0, frameY, z0], [x1, railTop, z1], { mat: "wood" });
      const mattress = box([x0 + 0.3, railTop, z0 + 0.3], [x1 - 0.3, top, z1 - 0.3], { mat: "fabric", bounce: o.bounce ?? 7.6, noLedge: true });
      // headboard
      const hb = o.headboard || "-z";
      const hbH = o.headboardH || 10;
      if (hb === "-z") box([x0, 0, z0 - 0.6], [x1, hbH, z0], { mat: "wood", noLedge: false });
      if (hb === "+z") box([x0, 0, z1], [x1, hbH, z1 + 0.6], { mat: "wood" });
      // blanket hanging over one long side: a climbable cloth face
      const hang = o.hang || "+x";
      let cloth = null;
      if (o.hang === "none") cloth = null;
      const hz0 = o.hangZ0 ?? z0 + 2;
      const hz1 = o.hangZ1 ?? z1 - 1.2;
      if (hang === "+x") cloth = box([x1 - 0.05, 0.6, hz0], [x1 + 0.12, top + 0.05, hz1], { mat: "fabric", climb: true, noLedge: true });
      if (hang === "-x") cloth = box([x0 - 0.12, 0.6, hz0], [x0 + 0.05, top + 0.05, hz1], { mat: "fabric", climb: true, noLedge: true });
      prop({ type: "bed", x0, x1, z0, z1, top, frameY, railTop, hb, hbH, hang, hz0, hz1, color: o.color || "#e7cfa8", blanket: o.blanket || "#6f9bd1", blanket2: o.blanket2 || "#f4e3b2", sheet: o.sheet || "#f7f2ea", box: mattress, cloth });
      if (o.pillow !== false) {
        const pz = hb === "-z" ? z0 + 2.4 : z1 - 2.4;
        K.pillow((x0 + x1) / 2, top, pz, x1 - x0 - 2.2, 1.3, 3.2, { color: o.pillowColor || "#fffaf0", bounce: 9 });
      }
      return top;
    },
    /** open shelf unit: sides, back, boards (each a platform). open: side you look into */
    shelf(x0, x1, z0, z1, h, o = {}) {
      const tiers = o.tiers || 3;
      const t = 0.4;
      const open = o.open || "+z";
      const ids = [];
      const alongX = open === "+z" || open === "-z";
      if (alongX) {
        ids.push(box([x0, 0, z0], [x0 + t, h, z1], { mat: "wood" }));
        ids.push(box([x1 - t, 0, z0], [x1, h, z1], { mat: "wood" }));
        if (open === "+z") ids.push(box([x0, 0, z0], [x1, h, z0 + 0.25], { mat: "wood", noLedge: true }));
        else ids.push(box([x0, 0, z1 - 0.25], [x1, h, z1], { mat: "wood", noLedge: true }));
      } else {
        ids.push(box([x0, 0, z0], [x1, h, z0 + t], { mat: "wood" }));
        ids.push(box([x0, 0, z1 - t], [x1, h, z1], { mat: "wood" }));
        if (open === "+x") ids.push(box([x0, 0, z0], [x0 + 0.25, h, z1], { mat: "wood", noLedge: true }));
        else ids.push(box([x1 - 0.25, 0, z0], [x1, h, z1], { mat: "wood", noLedge: true }));
      }
      const boards = [];
      for (let i = 0; i <= tiers; i++) {
        const y = i === tiers ? h - t : i === 0 ? 0.5 : 0.5 + (i * (h - 0.5 - t)) / tiers;
        boards.push(y + t);
        ids.push(box([x0, i === 0 ? 0 : y, z0], [x1, y + t, z1], { mat: "wood" }));
      }
      prop({ type: "shelf", x0, x1, z0, z1, h, tiers, open, boards, color: o.color || "#f0e2c8", inner: o.inner || "#d9b98f", box: ids[ids.length - 1] });
      return boards;
    },
    nightstand(x, z, o = {}) {
      const w = o.w || 4.5;
      const d = o.d || 4;
      const h = o.h || 5.5;
      const i = cbox(x, 0, z, w, h, d, { mat: "wood" });
      prop({ type: "nightstand", x, y: 0, z, w, h, d, color: o.color || "#d8b48a", front: o.front || "+z", box: i });
      return h;
    },
    wardrobe(x0, x1, z0, z1, h, o = {}) {
      const i = box([x0, 0, z0], [x1, h, z1], { mat: "wood", noLedge: true });
      prop({ type: "wardrobe", x0, x1, z0, z1, h, color: o.color || "#e9d8bd", front: o.front || "+z", box: i });
    },
    stool(x, z, o = {}) {
      const r = o.r || 1.8;
      const h = o.h || 4;
      const s = r * 1.7;
      const i = cbox(x, h - 0.3, z, s, 0.3, s, { mat: "wood" });
      cbox(x, 0, z, 0.5, h - 0.3, 0.5, { mat: "wood", noLedge: true });
      prop({ type: "stool", x, y: 0, z, r, h, color: o.color || "#c8956a", box: i });
    },

    /* ---------------------------------------------------------- desk things */
    lamp(x, y, z, o = {}) {
      const i = cbox(x, y, z, 2.2, 0.35, 2.2, { mat: "metal" });
      // the pole and shade don't block movement (you can't climb a lamp pole), nor the camera
      prop({ type: "lamp", x, y, z, color: o.color || "#f2c14e", h: o.h || 7, reach: o.reach || 2.5, dir: o.dir ?? 0, on: o.on !== false, box: i });
      if (o.on !== false) L.lights.push({ kind: "lamp", x: x + Math.sin(o.dir ?? 0) * (o.reach || 2.5), y: y + (o.h || 7) - 0.6, z: z + Math.cos(o.dir ?? 0) * (o.reach || 2.5), color: o.light || "#ffcf8a", intensity: o.intensity ?? 5, distance: o.distance || 22 });
    },
    mug(x, y, z, o = {}) {
      const r = o.r || 0.9;
      const h = o.h || 1.0;
      const s = r * 1.78;
      const i = cbox(x, y, z, s, h, s, { mat: "ceramic" });
      prop({ type: "mug", x, y, z, r, h, color: o.color || "#f2efe8", accent: o.accent || "#4fb3a8", handle: o.handle ?? 1, box: i });
      return y + h;
    },
    pencilCup(x, y, z, o = {}) {
      const r = o.r || 0.8;
      const h = o.h || 1.6;
      const s = r * 1.78;
      const i = cbox(x, y, z, s, h, s, { mat: "metal", noLedge: true });
      prop({ type: "pencilCup", x, y, z, r, h, color: o.color || "#5a8fd1", box: i });
    },
    /** a pencil lying across things: a balance beam. axis "x" or "z" */
    pencil(x, y, z, len, o = {}) {
      const ax = o.axis || "x";
      const t = 0.3;
      const i = ax === "x" ? cbox(x, y, z, len, t, t, { mat: "wood", noLedge: true }) : cbox(x, y, z, t, t, len, { mat: "wood", noLedge: true });
      prop({ type: "pencil", x, y, z, len, axis: ax, color: o.color || "#f2c14e", flip: !!o.flip, box: i });
      return y + t;
    },
    ruler(x, y, z, len, o = {}) {
      const ax = o.axis || "x";
      const w = 0.42;
      const t = 0.06;
      const i = ax === "x" ? cbox(x, y, z, len, t, w, { mat: "plastic", noLedge: true }) : cbox(x, y, z, w, t, len, { mat: "plastic", noLedge: true });
      prop({ type: "ruler", x, y, z, len, axis: ax, color: o.color || "#f4e3a1", box: i });
      return y + t;
    },
    crayons(x, y, z, o = {}) {
      prop({ type: "crayons", x, y, z, seed: o.seed || 1, lowHide: true });
    },
    eraser(x, y, z, o = {}) {
      const i = cbox(x, y, z, 1.0, 0.35, 0.6, { mat: "rubber", noLedge: true });
      prop({ type: "eraser", x, y, z, color: o.color || "#f28da0", box: i });
    },
    plant(x, y, z, o = {}) {
      const r = o.r || 1.8;
      const h = o.h || 2.4;
      const s = r * 1.6;
      const i = cbox(x, y, z, s, h, s, { mat: "ceramic" });
      prop({ type: "plant", x, y, z, r, h, color: o.color || "#c96f4a", leaf: o.leaf || "#5f9b52", size: o.size || 1, box: i });
    },
    globe(x, y, z, o = {}) {
      const i = cbox(x, y, z, 1.8, 0.4, 1.8, { mat: "wood" });
      prop({ type: "globe", x, y, z, r: o.r || 1.6, box: i });
    },
    alarmClock(x, y, z, o = {}) {
      const i = cbox(x, y, z, 1.8, 1.8, 1.0, { mat: "metal", noLedge: true });
      prop({ type: "alarmClock", x, y, z, color: o.color || "#e85d4a", rot: o.rot || 0, box: i });
    },

    /* ---------------------------------------------------------- walls & room life */
    wallArt(wall, c, y, w, h, o = {}) {
      prop({ type: "frame", wall, c, y, w, h, art: o.art || "sun", color: o.color || "#c8956a", lowHide: false });
    },
    wallClock(wall, c, y, r = 2.4) {
      prop({ type: "wallClock", wall, c, y, r });
    },
    wallShelf(wall, c, y, w, o = {}) {
      prop({ type: "wallShelf", wall, c, y, w, items: o.items || "toys", color: o.color || "#f0e2c8" });
    },
    curtains(wall, c, y, w, h, o = {}) {
      prop({ type: "curtains", wall, c, y, w, h, color: o.color || "#f2b8a0" });
    },
    ceilingLamp(x, z, o = {}) {
      prop({ type: "ceilingLamp", x, z, color: o.color || "#fff1d6", on: !!o.on });
      if (o.on) L.lights.push({ kind: "ceiling", x, y: (L.ceilingY || 26) - 3, z, color: "#ffd9a0", intensity: o.intensity ?? 6, distance: 70 });
    },
    nightLight(x, y, z, o = {}) {
      prop({ type: "nightLight", x, y, z, color: o.color || "#ffd27a" });
      L.lights.push({ kind: "night", x, y: y + 0.8, z, color: o.color || "#ffd27a", intensity: o.intensity ?? 4, distance: o.distance || 16 });
    },
    door(wall, c, w, h, o = {}) {
      prop({ type: "door", wall, c, w, h, color: o.color || "#f4ebdd", open: !!o.open });
    },

    /* ---------------------------------------------------------- moving things */
    /**
     * A ridable moving toy (car, gondola, robot vacuum, trolley, drawer).
     * path: { type:"line", d:[dx,dy,dz], period, hold } | { type:"loop", pts:[[x,y,z]…], speed }
     * startsOn:false = waits for an interaction (E) to start.
     */
    mover(kind, box0, path, o = {}) {
      L.movers.push({ kind, box: box0, path, startsOn: o.startsOn !== false, mat: o.mat || "plastic", bounce: o.bounce || 0 });
      const i = L.movers.length - 1;
      prop({ type: "mover", kind, mover: i, color: o.color || "#e85d4a", color2: o.color2 || "#f2c14e", extra: o.extra || null });
      return i;
    },
    toyCarMover(x, y, z, axis, travel, period, o = {}) {
      const w = axis === "x" ? 2.5 : 1.6;
      const d = axis === "x" ? 1.6 : 2.5;
      return K.mover("car", { min: [x - w / 2, y, z - d / 2], max: [x + w / 2, y + 1.0, z + d / 2] }, { type: "line", d: axis === "x" ? [travel, 0, 0] : [0, 0, travel], period, hold: o.hold ?? 0.14, phase: o.phase || 0 }, o);
    },
    /** E-interaction (crank / switch / wind-up key …) */
    interact(kind, x, y, z, target, o = {}) {
      L.interacts.push({ kind, pos: [x, y, z], target, r: o.r || 1.3, label: o.label || "Interact", toggle: !!o.toggle });
      prop({ type: "interact", kind, x, y, z, index: L.interacts.length - 1, rot: o.rot || 0, color: o.color || "#e85d4a" });
      return L.interacts.length - 1;
    },

    /* ---------------------------------------------------------- hazards & pets */
    hazard(h) {
      L.hazards.push(h);
      return L.hazards.length - 1;
    },
    pet(p) {
      L.pets.push(p);
      return L.pets.length - 1;
    },

    done() {
      if (!L.spawn) throw new Error(`level ${L.id}: no spawn`);
      if (!L.finish) throw new Error(`level ${L.id}: no finish`);
      return L;
    },
  };
  return K;
}
