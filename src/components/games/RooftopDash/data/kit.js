/**
 * Rooftop Dash — the level kit: a tiny course-builder DSL. Every level is DATA
 * written with these calls; one loader turns it into collision boxes, movers,
 * hazards, triggers, decoration slots and a bot route (used by the validator
 * to prove every level is completable and every star reachable).
 *
 * Course frame: the builder walks a cursor along a heading (+Z first). Each
 * roof is a building whose top is the walkable surface. Local coordinates on
 * the current roof are (u, v): u = metres along the heading from the roof's
 * near edge, v = metres to the LEFT of the roof's centre line.
 *
 *   const c = course({ id, name, world });
 *   c.start({ len: 22, w: 12 });
 *   c.vault(8, { h: 0.8 });          // obstacle on the current roof
 *   c.roof({ gap: 2.4, len: 16 });    // jump a 2.4 m gap to a new roof
 *   c.finish(10);
 *   export default c.build();
 *
 * Gap guide (edge to edge, same height): run jump ≈ 4.3 m, sprint ≈ 6.1 m,
 * sprint + air dash ≈ 9 m, wall run ≈ 11 m. Authored gaps keep ≥ 0.8 m spare.
 */

const HEAD = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

export function course(meta) {
  const C = {
    meta: { world: 1, streetY: -32, ...meta },
    heading: 0,
    ox: 0,
    oz: 0,
    cu: 0, // cursor: u of the current roof's FAR edge in the current frame
    roofs: [],
    boxes: [],
    movers: [],
    crumbles: [],
    hazards: [],
    stars: [],
    checkpoints: [],
    hints: [],
    decor: [],
    route: [], // bot route nodes
    finish: null,
    spawn: null,
    cur: null,
    seq: 0,
  };

  /* ---------------- frame helpers */
  const f = () => HEAD[C.heading];
  /** local (u along heading from frame origin, v left) → world x,z */
  const w = (u, v) => {
    const [fx, fz] = f();
    // left of forward (fx,fz) is (fz, -fx)
    return [C.ox + fx * u + fz * v, C.oz + fz * u - fx * v];
  };
  /** local rect (u0..u1, v0..v1) → world AABB xz */
  const rect = (u0, u1, v0, v1) => {
    const a = w(u0, v0);
    const b = w(u1, v1);
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  };
  const addBox = (u0, u1, v0, v1, y0, y1, props = {}) => {
    const [x0, z0, x1, z1] = rect(u0, u1, v0, v1);
    const b = { min: [x0, y0, z0], max: [x1, y1, z1], ...props };
    C.boxes.push(b);
    return b;
  };
  /** current roof local → frame u */
  const ru = (u) => C.cur.u0 + u;
  const rv = (v) => C.cur.v + v;
  const yaw = () => Math.atan2(f()[0], f()[1]);
  let tag = null; // 'safe' | 'stars' route-only nodes (validator runs both routes)
  const node = (u, v, extra = {}) => {
    const [x, z] = w(ru(u), rv(v));
    const [fx, fz] = f();
    C.route.push({ x, z, y: C.cur.y, fx, fz, only: tag, ...extra });
  };

  /* ---------------- roofs */
  function makeRoof({ len, w: width = 10, y = 0, v = 0, style, mat = "concrete", lane = 3.2, h } = {}) {
    const u0 = C.cu;
    const u1 = u0 + len;
    const top = y;
    const bottom = h != null ? top - h : C.meta.streetY;
    const box = addBox(u0, u1, v - width / 2, v + width / 2, bottom, top, { kind: "building", mat, style: style || null });
    const roof = { i: C.roofs.length, u0, u1, v, y: top, width, len, box, heading: C.heading, ox: C.ox, oz: C.oz, lane, style, mat, props: [] };
    C.roofs.push(roof);
    C.cur = roof;
    C.cu = u1;
    return roof;
  }

  const api = {
    /** first roof; spawn on it */
    start(o = {}) {
      makeRoof({ len: 20, ...o });
      const su = o.spawnU ?? 2.5;
      const [x, z] = w(ru(su), rv(0));
      C.spawn = { x, y: C.cur.y, z, yaw: yaw() };
      node(su, 0);
      return api;
    },
    /** gap then a new roof. dy = height change, v = lateral shift of centre (left +) */
    roof(o = {}) {
      const gap = o.gap ?? 2.4;
      const prev = C.cur;
      const y = prev.y + (o.dy || 0);
      const v = o.v ?? prev.v;
      // bot: run to the edge, take off with the right move
      const how = o.how || autoHow(gap, o.dy || 0);
      const takeoffV = o.takeoffV ?? (o.lineV != null ? o.lineV : Math.max(-prev.width / 2 + 1, Math.min(prev.width / 2 - 1, v - prev.v)));
      const saveTag = tag;
      if (o.edgeTag !== undefined) tag = o.edgeTag;
      api._edge(prev, takeoffV, how, o);
      tag = saveTag;
      C.cu += gap;
      makeRoof({ ...o, y, v });
      node(Math.min(1.6, C.cur.len / 2), (o.landV ?? 0), { land: true });
      return api;
    },
    /** append the take-off node(s) for leaving `prev` */
    _edge(prev, lv, how, o = {}) {
      const back = how === "walk" ? 0.25 : 0.45;
      const save = C.cur;
      C.cur = prev;
      const sprint = how !== "jump" && how !== "hop" && how !== "walk";
      // run-up starts past the last obstacle on this roof (never behind a pipe / vault)
      const runU = Math.max(0.5, prev.len - (o.runup ?? 3.2), (prev.clearU || 0) + 0.4);
      if (how !== "walk" && runU < prev.len - 1.2) node(runU, lv, { sprint });
      node(prev.len - back, lv, { act: how, sprint, side: o.side, dashAt: o.dashAt, wjAt: o.wjAt, steer: o.steer });
      C.cur = save;
    },
    /** tag following route nodes as belonging only to the 'safe' or 'stars' bot route (null = both) */
    tag(t) {
      tag = t || null;
      return api;
    },
    /** a lower roof under the NEXT gap (safety net / alternative path), from a..b past the far edge */
    under(o = {}) {
      const r = C.cur;
      const a = r.u1 + (o.a ?? 0.6);
      const b = r.u1 + (o.b ?? 6);
      const wd = o.w ?? r.width;
      const v = r.v + (o.v ?? 0);
      addBox(a, b, v - wd / 2, v + wd / 2, C.meta.streetY, r.y + (o.dy ?? -2.8), { kind: "building", mat: o.mat || "concrete", style: o.style || "low" });
      C.roofs.push({ i: C.roofs.length, box: C.boxes[C.boxes.length - 1], y: r.y + (o.dy ?? -2.8), style: o.style || "low", under: true });
      return api;
    },
    /** turn the course 90° on the current roof (it becomes the corner) */
    turn(dir) {
      const r = C.cur;
      // new frame origin: centre of the current roof's far square
      const centerU = r.u1 - r.width / 2;
      const [cx, cz] = w(centerU, r.v);
      // heading +1 = +90° yaw = a LEFT turn in this frame (left of +Z is +X)
      C.heading = (C.heading + (dir === "right" ? 3 : 1)) % 4;
      C.ox = cx;
      C.oz = cz;
      // the far edge in the new heading is half the roof's width away
      C.cu = r.width / 2;
      // re-express the current roof in the new frame so on-roof calls keep working
      C.cur = { ...r, u0: C.cu - r.width, u1: C.cu, v: 0, len: r.width, width: r.len, heading: C.heading, ox: C.ox, oz: C.oz, turned: true };
      C.roofs[r.i] = { ...r, corner: true };
      // bot: walk to the corner centre first
      C.route.push({ x: cx, z: cz, y: r.y, turn: true });
      return api;
    },

    /* ---------------- on-roof gameplay elements (u from current roof's near edge, v left of its centre) */
    vault(u, o = {}) {
      const h = o.h ?? 0.8;
      const d = o.d ?? 0.6;
      const wd = o.w ?? 3.2;
      const v = o.v ?? 0;
      addBox(ru(u), ru(u + d), rv(v - wd / 2), rv(v + wd / 2), C.cur.y, C.cur.y + h, { kind: o.kind || "vault", mat: o.mat || "metal", look: o.look || (h > 0.95 ? "barrier" : "vent") });
      C.cur.clearU = Math.max(C.cur.clearU || 0, u + d + 0.9);
      return api;
    },
    /** overhead pipe / beam to slide under (bottom at y+clear) with posts outside the lane */
    pipe(u, o = {}) {
      const clear = o.clear ?? 1.12;
      const wd = o.w ?? Math.min(C.cur.width, 7);
      const v = o.v ?? 0;
      const th = o.th ?? 0.42;
      const y = C.cur.y;
      addBox(ru(u), ru(u + th), rv(v - wd / 2), rv(v + wd / 2), y + clear, y + clear + th, { kind: "pipe", mat: "metal", look: o.look || "pipe", noLedge: true, noVault: true });
      C.cur.clearU = Math.max(C.cur.clearU || 0, u + th + 1.4);
      // posts at both ends
      for (const s of [-1, 1]) addBox(ru(u - 0.05), ru(u + th + 0.05), rv(v + s * wd / 2 - (s > 0 ? 0.3 : 0)), rv(v + s * wd / 2 + (s > 0 ? 0 : 0.3)), y, y + clear + th + 0.25, { kind: "post", mat: "metal", noLedge: true, noVault: true });
      // bot slides
      const save = C.route.length;
      node(u - 2.4, v, { slide: true, pass: true });
      node(u + th + 1.5, v);
      return save;
    },
    /** solid rooftop structure (room, tank, AC bank): blocks the lane unless placed aside */
    block(u, o = {}) {
      const len = o.len ?? 2;
      const wd = o.w ?? 2;
      const v = o.v ?? 0;
      const h = o.h ?? 2.4;
      addBox(ru(u), ru(u + len), rv(v - wd / 2), rv(v + wd / 2), C.cur.y, C.cur.y + h, { kind: o.kind || "room", mat: o.mat || "concrete", look: o.look || null, wr: !!o.wr, noVault: o.noVault ?? h > 1.4, noLedge: !!o.noLedge });
      return api;
    },
    /**
     * Wall-run wall alongside the NEXT gap. side: 'left' | 'right' of travel.
     * from/to: u range relative to the current roof's FAR edge (negative = on the roof).
     */
    wallrun(o = {}) {
      const side = o.side || "left";
      const r = C.cur;
      const from = r.u1 + (o.from ?? -1.5);
      const to = r.u1 + (o.to ?? 10);
      const off = o.off ?? 2.1; // distance from the line the runner takes
      const lineV = r.v + (o.lineV ?? 0);
      const s = side === "left" ? 1 : -1;
      const v0 = lineV + s * off;
      const v1 = v0 + s * (o.th ?? 1.2);
      const top = r.y + (o.h ?? 6);
      const bottom = o.full ? C.meta.streetY : r.y - (o.below ?? 6);
      addBox(from, to, Math.min(v0, v1), Math.max(v0, v1), bottom, top, { kind: "wall", mat: o.mat || "brick", wr: true, noLedge: true, noVault: true, look: o.look || "mural" });
      return api;
    },
    /** narrow beam / plank across the next gap (a roof with tiny width) */
    beam(o = {}) {
      return api.roof({ w: o.w ?? 0.7, len: o.len ?? 6, gap: o.gap ?? 0.01, how: "walk", style: "beam", mat: "steel", h: 0.3, ...o });
    },
    star(u, v = 0, yOff = 1.0, tag = "main") {
      const [x, z] = w(ru(u), rv(v));
      C.stars.push({ x, y: C.cur.y + yOff, z, tag });
      return api;
    },
    /** star placed in WORLD-relative frame position (for over-gap stars): u relative to the current roof's far edge */
    starAhead(du, v = 0, yOff = 1.6, tag = "main") {
      const [x, z] = w(C.cur.u1 + du, C.cur.v + v);
      C.stars.push({ x, y: C.cur.y + yOff, z, tag });
      return api;
    },
    checkpoint(u, v = 0) {
      const [x, z] = w(ru(u), rv(v));
      C.checkpoints.push({ x, y: C.cur.y, z, yaw: yaw(), r: 1.8 });
      return api;
    },
    finish(u, v = 0) {
      const [x, z] = w(ru(u), rv(v));
      C.finish = { x, y: C.cur.y, z, r: 2.3, yaw: yaw() };
      node(u, v, { finish: true });
      return api;
    },
    /** tutorial hint zone on the current roof between u0..u1 (whole width) */
    hint(u0, u1, key) {
      const [x0, z0, x1, z1] = rect(ru(u0), ru(u1), rv(-C.cur.width / 2 - 1), rv(C.cur.width / 2 + 1));
      C.hints.push({ key, min: [x0, z0], max: [x1, z1], y: C.cur.y });
      return api;
    },
    /** explicit extra bot node on the current roof */
    go(u, v = 0, extra = {}) {
      node(u, v, extra);
      return api;
    },
    /** decoration slot (visual + solid if > step height), deterministic, same at every quality */
    prop(type, u, v, o = {}) {
      const [x, z] = w(ru(u), rv(v));
      const rot = (o.rot || 0) + yaw();
      C.decor.push({ type, x, y: C.cur.y, z, rot, ...o });
      const fp = PROP_FOOTPRINT[type];
      if (fp && !o.ghost) {
        const [L, Wd, H] = fp;
        const along = o.turn90 ? Wd : L;
        const across = o.turn90 ? L : Wd;
        addBox(ru(u - along / 2), ru(u + along / 2), rv(v - across / 2), rv(v + across / 2), C.cur.y, C.cur.y + H, { kind: "prop", prop: type, mat: "metal", noVault: H > 1.32 || o.noVault, noLedge: !!o.noLedge, look: "hidden" });
      }
      return api;
    },

    /* ---------------- moving / dynamic */
    /** moving platform across the NEXT gap. The runner jumps on, rides, jumps off. */
    mover(o = {}) {
      const r = C.cur;
      const len = o.len ?? 3;
      const wd = o.w ?? 3;
      const v = r.v + (o.v ?? 0);
      const dy = o.dy ?? 0;
      const y = r.y + dy;
      const u0 = r.u1 + (o.at ?? 1.5);
      const [x0, z0, x1, z1] = rect(u0, u0 + len, v - wd / 2, v + wd / 2);
      const travel = o.travel ?? 6;
      const axis = o.axis || "along";
      const [fx, fz] = f();
      const d = axis === "along" ? [fx * travel, 0, fz * travel] : axis === "up" ? [0, travel, 0] : [fz * travel, 0, -fx * travel];
      const m = { box: { min: [x0, y - 0.35, z0], max: [x1, y, z1] }, path: { type: o.type || (axis === "up" ? "lift" : "line"), d, period: o.period ?? 5, phase: o.phase || 0, hold: o.hold }, kind: o.kind || (axis === "up" ? "lift" : "mover"), look: o.look || "platform" };
      if (o.type === "swing") m.path = { type: "swing", axis: o.swingAxis || (fx !== 0 ? "z" : "x"), amp: o.amp ?? 0.45, len: o.ropeLen ?? 7, period: o.period ?? 4.5, phase: o.phase || 0 };
      C.movers.push(m);
      return C.movers.length - 1;
    },
    /**
     * A gap crossed on a moving thing, then the next roof.
     *   type 'along'  platform shuttles between the two roofs (ride it across)
     *   type 'swing'  crane load swinging along the course (ride it across)
     *   type 'lift'   lift beside the roof edge up (dy > 0) to a higher roof
     *   type 'across' platform sliding side to side in the gap (hop on, hop off)
     * o.next = options for the roof after it.
     */
    ride(o = {}) {
      const r = C.cur;
      const type = o.type || "along";
      const len = o.len ?? 3;
      const wd = o.w ?? 3.2;
      const period = o.period ?? (type === "lift" ? 7 : 5.5);
      const at = o.at ?? (type === "lift" ? 0.25 : 1.6);
      const [fx, fz] = f();
      const lv = o.v ?? 0;
      let travel = o.travel ?? 6;
      let gap;
      let idx;
      const centerAt = (du, dv) => w(r.u1 + du, r.v + dv);
      if (type === "lift") {
        const dy = o.dy ?? 4;
        idx = api.mover({ at, len, w: wd, v: lv, axis: "up", travel: dy, period, hold: 0.22, kind: "lift" });
        gap = at + len + 0.25;
        const [nx, nz] = centerAt(at + len / 2, lv);
        const [ex, ez] = centerAt(at + len - 0.5, lv);
        node(r.len - 0.4, lv, { waitMover: idx, mx: nx, mz: nz, my: r.y, lead: 0.5, tol: 0.4, ytol: 0.15 });
        C.route.push({ x: nx, z: nz, y: r.y, fx, fz, only: tag, hold: true, waitMover: idx, mx: nx, mz: nz, my: r.y + dy, tol: 0.4, ytol: 0.12, lead: 0.4 });
        C.route.push({ x: ex, z: ez, y: r.y + dy, fx, fz, only: tag, waitMover: idx, mx: nx, mz: nz, my: r.y + dy, tol: 0.4, ytol: 0.2, lead: 0.2, pass: true });
        C.cu += gap;
        makeRoof({ ...(o.next || {}), y: r.y + dy, v: o.next && o.next.v != null ? o.next.v : r.v });
        node(Math.min(1.6, C.cur.len / 2), lv);
        return idx;
      }
      if (type === "across") {
        const sweep = o.sweep ?? 3.5;
        idx = api.mover({ at, len, w: wd, v: lv - sweep / 2, axis: "across", travel: sweep, period, phase: o.phase || 0, hold: 0.1 });
        gap = at + len + (o.atEnd ?? 1.6);
        const [nx, nz] = centerAt(at + len / 2, lv);
        node(r.len - 2.7, lv, { waitMover: idx, mx: nx, mz: nz, lead: 0.72, tol: 0.6 });
        node(r.len - 0.45, lv, { act: "jump" });
        C.route.push({ x: nx, z: nz, y: r.y, fx, fz, only: tag, land: true });
        const [ex, ez] = centerAt(at + len - 0.4, lv);
        C.route.push({ x: ex, z: ez, y: r.y, fx, fz, only: tag, act: "jump", pass: true });
      } else {
        // along / swing: ride from the near edge to the far edge
        if (type === "swing") travel = 0;
        const amp = o.amp ?? 0.42;
        const ropeLen = o.ropeLen ?? 9;
        const swingReach = Math.sin(amp) * ropeLen;
        if (type === "swing") {
          // pivot centred over the middle of the gap; extremes reach toward each roof
          const mid = at + swingReach + len / 2;
          idx = api.mover({ type: "swing", at: mid - len / 2, len, w: wd, v: lv, period, phase: o.phase ?? 0.75, amp, ropeLen, swingAxis: fx !== 0 ? "x" : "z" });
          // fix the swing direction to follow the heading sign
          gap = mid + swingReach + len / 2 + (o.atEnd ?? 1.2);
          const near = w(r.u1 + mid - swingReach, r.v + lv);
          const far = w(r.u1 + mid + swingReach, r.v + lv);
          const lift = (1 - Math.cos(amp)) * ropeLen;
          node(r.len - 2.7, lv, { waitMover: idx, mx: near[0], mz: near[1], my: r.y + lift, ytol: 0.3, lead: 0.72, tol: 0.7 });
          node(r.len - 0.45, lv, { act: "jump" });
          C.route.push({ x: near[0], z: near[1], y: r.y, fx, fz, only: tag, land: true });
          C.route.push({ x: near[0], z: near[1], y: r.y, fx, fz, only: tag, hold: true, waitMover: idx, mx: far[0], mz: far[1], tol: 0.5, lead: 0.3 });
          const [ex, ez] = w(r.u1 + mid + swingReach + len / 2 - 0.45, r.v + lv);
          C.route.push({ x: ex, z: ez, y: r.y, fx, fz, only: tag, act: "jump", pass: true, rideEdge: true });
          C.cu += gap;
          makeRoof({ ...(o.next || {}), y: r.y + (o.next && o.next.dy != null ? o.next.dy : Math.round(lift * 10) / 10), v: o.next && o.next.v != null ? o.next.v : r.v });
          node(Math.min(1.6, C.cur.len / 2), 0, { land: true });
          return idx;
        }
        idx = api.mover({ at, len, w: wd, v: lv, axis: "along", travel, period, hold: o.hold ?? 0.2 });
        gap = at + len + travel + (o.atEnd ?? 1.6);
        const [nx, nz] = centerAt(at + len / 2, lv);
        const [fx2, fz2] = centerAt(at + len / 2 + travel, lv);
        node(r.len - 2.7, lv, { waitMover: idx, mx: nx, mz: nz, lead: 0.7, tol: 0.5 });
        node(r.len - 0.45, lv, { act: "jump" });
        C.route.push({ x: nx, z: nz, y: r.y, fx, fz, only: tag, land: true });
        C.route.push({ x: nx, z: nz, y: r.y, fx, fz, only: tag, hold: true, waitMover: idx, mx: fx2, mz: fz2, tol: 0.35, lead: 0.15 });
        const [ex, ez] = centerAt(at + len + travel - 0.45, lv);
        C.route.push({ x: ex, z: ez, y: r.y, fx, fz, only: tag, act: "jump", pass: true, rideEdge: true });
      }
      C.cu += gap;
      makeRoof({ ...(o.next || {}), y: r.y + ((o.next && o.next.dy) || 0), v: o.next && o.next.v != null ? o.next.v : r.v });
      node(Math.min(1.6, C.cur.len / 2), 0, { land: true });
      return idx;
    },
    /** a bridge of crumbling scaffold boards across the next gap, then the next roof */
    crumbleBridge(o = {}) {
      const r = C.cur;
      const n = o.pieces ?? 3;
      const piece = o.piece ?? 2.6;
      const wd = o.w ?? 2.6;
      const lv = o.v ?? 0;
      for (let i = 0; i < n; i++) {
        const [x0, z0, x1, z1] = rect(r.u1 + i * piece, r.u1 + (i + 1) * piece - 0.08, r.v + lv - wd / 2, r.v + lv + wd / 2);
        C.crumbles.push({ min: [x0, r.y - 0.3, z0], max: [x1, r.y, z1], delay: o.delay ?? 0.55, respawn: o.respawn ?? 3 });
      }
      node(r.len - 0.5, lv, { sprint: true });
      C.cu += n * piece;
      makeRoof({ ...(o.next || {}), y: r.y, v: o.next && o.next.v != null ? o.next.v : r.v });
      node(Math.min(1.6, C.cur.len / 2), 0, { land: true, pass: true });
      return api;
    },
    crumble(u, o = {}) {
      const len = o.len ?? 3;
      const wd = o.w ?? 3;
      const v = o.v ?? 0;
      const [x0, z0, x1, z1] = rect(ru(u), ru(u + len), rv(v - wd / 2), rv(v + wd / 2));
      C.crumbles.push({ min: [x0, C.cur.y - 0.3, z0], max: [x1, C.cur.y, z1], delay: o.delay ?? 0.6, respawn: o.respawn ?? 3 });
      return api;
    },
    hazard(type, u, v = 0, o = {}) {
      const [x, z] = w(ru(u), rv(v));
      const [fx, fz] = f();
      const base = { type, pos: [x, C.cur.y, z], period: o.period ?? 3, phase: o.phase ?? 0, onFrac: o.onFrac };
      if (type === "steam" || type === "zap") Object.assign(base, { r: o.r ?? 0.8, h: o.h ?? 2.6, push: o.push ? [o.push[0], 0, o.push[1]] : null });
      if (type === "fan") {
        const dir = o.dir === "left" ? [fz, 0, -fx] : o.dir === "right" ? [-fz, 0, fx] : o.dir === "back" ? [-fx, 0, -fz] : [fx, 0, fz];
        const sz = o.size || [3, 3, 3];
        const sx = fx !== 0 ? sz[0] : sz[2];
        const szz = fx !== 0 ? sz[2] : sz[0];
        Object.assign(base, { size: [sx, sz[1], szz], dir, force: o.force ?? 9 });
      }
      if (type === "hook") {
        base.pos = [x, C.cur.y + (o.top ?? 6.5), z];
        Object.assign(base, { len: o.len ?? 5.2, amp: o.amp ?? 0.85, axis: o.axis === "across" ? (fx !== 0 ? "z" : "x") : fx !== 0 ? "x" : "z", r: o.r ?? 0.6 });
      }
      C.hazards.push(base);
      if (o.wait) {
        // bot waits here until the hazard is safe
        node(u - 2.2, v, { waitHazard: C.hazards.length - 1 });
      }
      return api;
    },

    /* ---------------- build */
    build() {
      if (!C.spawn) throw new Error(`${C.meta.id}: no spawn`);
      if (!C.finish && !C.meta.noFinish) throw new Error(`${C.meta.id}: no finish`);
      let minTop = Infinity;
      let maxTop = -Infinity;
      for (const r of C.roofs) {
        minTop = Math.min(minTop, r.y);
        maxTop = Math.max(maxTop, r.y);
      }
      for (const m of C.movers) minTop = Math.min(minTop, m.box.max[1] + Math.min(0, m.path.d ? m.path.d[1] : 0));
      const bounds = [Infinity, Infinity, -Infinity, -Infinity];
      for (const b of C.boxes) {
        bounds[0] = Math.min(bounds[0], b.min[0]);
        bounds[1] = Math.min(bounds[1], b.min[2]);
        bounds[2] = Math.max(bounds[2], b.max[0]);
        bounds[3] = Math.max(bounds[3], b.max[2]);
      }
      return {
        ...C.meta,
        spawn: C.spawn,
        finish: C.finish,
        boxes: C.boxes,
        movers: C.movers,
        crumbles: C.crumbles,
        hazards: C.hazards,
        stars: C.stars,
        checkpoints: C.checkpoints,
        hints: C.hints,
        decor: C.decor,
        roofs: C.roofs.map((r) => ({ i: r.i, box: r.box, y: r.y, style: r.style, mat: r.mat, corner: !!r.corner, beam: r.style === "beam", under: !!r.under, heading: r.heading ?? 0 })),
        route: C.route,
        killY: C.meta.killY ?? minTop - 9,
        topY: maxTop,
        bounds,
      };
    },
    get cur() {
      return C.cur;
    },
  };
  return api;
}

/** default take-off move for a gap (bot + validation reference) */
function autoHow(gap, dy) {
  const eff = gap - Math.max(0, -dy) * 0.9 + Math.max(0, dy) * 1.4;
  if (eff <= 0.3) return "walk";
  if (eff <= 3.4) return "jump";
  if (eff <= 5.2) return "sprintJump";
  return "dashJump";
}

/** solid footprint of standard props: [along, across, height] */
export const PROP_FOOTPRINT = {
  ac: [1.3, 1.0, 1.1],
  acBig: [2.2, 1.4, 1.5],
  tank: [2.6, 2.6, 4.2],
  vent: [0.7, 0.7, 0.9],
  chimney: [0.7, 0.7, 1.9],
  door: [2.4, 2.0, 2.7],
  dish: [0.9, 0.9, 1.4],
  crates: [1.6, 1.2, 1.0],
  solar: [3.0, 1.6, 0.7],
  planter: [2.4, 0.8, 0.6],
  billboard: [5.0, 0.6, 5.5],
  antenna: [0.25, 0.25, 3.5],
  pipes: [3.0, 0.5, 0.5],
  bench: [1.6, 0.5, 0.5],
  skylight: [2.0, 1.4, 0.45],
  laundry: [4.0, 0.3, 2.0],
  helipad: [0, 0, 0],
};
