/**
 * Doll Repair Workshop — one repair job, start to finish.
 *
 * The session owns the gameplay rules and drives the 3D model's visual
 * state. Input arrives as "hits" (doll-root-space points from raycasts):
 *   pointerDown(hit, ray) / pointerMove(hit, ray) / pointerUp() / update(dt)
 * plus discrete actions (selectTool, finishInspection, pickPart, rotateCarry,
 * paint options, finishPaint, finishRepairs, setLook, submit).
 *
 * Phases: inspect → repair → customize → done.
 * Every mechanic measures real interaction: grime is removed vertex by
 * vertex by tool contact and rubbing distance; cracks are traced against the
 * crack polyline; parts must be carried to the right socket, rotated into
 * alignment and must be compatible; stitches follow a path; paint lands in a
 * grid scored against the original feature shapes; brushing works with the
 * grain of each lock. Scores come from those measurements — nothing is
 * awarded automatically.
 *
 * `ctx` connects to the workshop: hasTool(id), qty(item), consume(item, n),
 * tiers {bench, lighting, tools, sewing, painting, hair}, level.
 */
import * as THREE from "three";
import { DAMAGE, DOLL_TYPES, PAINT_TARGETS, PAINT_COLORS, HAIR_STYLES, HAIR_COLORS, OUTFITS, ACCESSORIES, SHOES, LOOK_KEYS, sanitizeLook } from "../data/dolls.js";
import { PARTS, TOOLS, partFits } from "../data/items.js";
import { FACE, aeToCell, cellToAE, featureMask, uvToAE } from "./plan.js";
import { mulberry, clamp } from "./rng.js";

const V = () => new THREE.Vector3();
const tmp = V();
const tmp2 = V();

/** Distance from p to segment ab. */
export function segDist(p, a, b) {
  const ab = tmp.copy(b).sub(a);
  const t = clamp(tmp2.copy(p).sub(a).dot(ab) / (ab.lengthSq() || 1), 0, 1);
  return tmp2.copy(a).addScaledVector(ab, t).distanceTo(p);
}
export function polyDist(p, pts) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(p, pts[i], pts[i + 1]));
  return pts.length === 1 ? p.distanceTo(pts[0]) : d;
}
function crackSegments(c) {
  const segs = [];
  for (let i = 0; i < c.main - 1; i++) segs.push([c.pts[i], c.pts[i + 1]]);
  if (c.pts.length > c.main) {
    segs.push([c.pts[c.branchFrom], c.pts[c.main]]);
    for (let i = c.main; i < c.pts.length - 1; i++) segs.push([c.pts[i], c.pts[i + 1]]);
  }
  return segs;
}

const CLEAN_TOOLS = {
  brush: { r: 0.065, s: [1.0, 0.16, 0], wetMul: 1 },
  cloth: { r: 0.055, s: [0.7, 0.34, 0.05], wetMul: 1.3, dries: true },
  sponge: { r: 0.05, s: [0.35, 0.75, 0], wetMul: 1.9, stainWet: 0.85 },
};
const K_CLEAN = 5.2;
const CLEAN_DONE = 0.92;
const PAINT_SIZES = [1.7, 2.7, 4.0];
const WEIGHT = { clean: 1, polish: 0.8, crack: 1.4, part: 1.1, button: 0.9, detangle: 1, reroot: 0.8, wash: 0.5, dry: 0.5, sew: 1.2, paint: 1.3, shine: 0.8 };

export class RepairSession {
  constructor({ order, model, ctx, seed = 1 }) {
    this.order = order;
    this.model = model;
    this.plan = model.plan;
    this.type = model.type;
    this.ctx = ctx;
    this.rand = mulberry(seed);
    this.phase = "inspect";
    this.events = [];
    this.elapsed = 0;
    this.tool = "magnifier";
    this.inspect = { clicks: 0, false: 0, found: 0, score: 0, done: false };
    this.used = {};
    this.carry = null;
    this.stroke = null;
    this.holding = null;
    this.originalLook = { ...model.look };
    this.lookChanges = new Set();
    this.paintColor = 0;
    this.paintSize = 1;
    this.eraser = false;
    this.undoStack = [];
    this.result = null;
    this.buildDamages();
    this.buildTasks();
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  /* ============================================================ setup */
  buildDamages() {
    const m = this.model;
    const D = [];
    const add = (kind, extra) => D.push({ id: extra.id || kind, kind, label: DAMAGE[kind].label, found: false, missed: false, ...extra });
    for (const d of this.order.damage) {
      switch (d.kind) {
        case "dust":
        case "dirt":
        case "stain":
          add(d.kind, { channel: { dust: 0, dirt: 1, stain: 2 }[d.kind] });
          break;
        case "scratch":
          if (!D.some((x) => x.kind === "scratch")) add("scratch", {});
          break;
        case "crack":
          m.cracks.forEach((c, i) => {
            if (!D.some((x) => x.id === c.id)) add("crack", { id: c.id, crack: i, label: c.where === "forehead" ? "Cracked forehead" : c.where === "jaw" ? "Cracked jaw" : "Cracked cheek" });
          });
          break;
        case "arm":
        case "leg":
        case "eye":
        case "shoe": {
          const sid = d.kind === "shoe" ? `shoe${d.side}` : `${d.kind}${d.side}`;
          if (m.sockets[sid]) add(d.kind, { id: sid, socket: sid, label: `${DAMAGE[d.kind].label} (${d.side === "L" ? "left" : "right"})` });
          break;
        }
        case "button":
          if (m.sockets[`button${d.slot}`]) add("button", { id: `button${d.slot}`, socket: `button${d.slot}` });
          break;
        case "accessory": {
          const slot = ["hat", "ribbon", "extra"].find((s) => m.look[s] === d.item);
          if (slot) add("accessory", { id: `acc:${slot}`, socket: `acc:${slot}`, item: d.item, label: `Broken ${ACCESSORIES[d.item]?.name.toLowerCase() || d.item}` });
          break;
        }
        case "tangle":
          if (m.hair) add("tangle", {});
          break;
        case "bald":
          if (m.hair && m.patches.length) add("bald", {});
          break;
        case "tear":
          m.tears.forEach((t, i) => {
            if (!D.some((x) => x.id === t.id)) add("tear", { id: t.id, tear: i, label: t.seam ? "Burst seam" : t.where === "bodice" ? "Torn bodice" : t.where === "skirtBack" ? "Torn skirt (back)" : "Torn skirt" });
          });
          break;
        case "faded":
          if (m.faded.length) add("faded", { features: m.faded.slice(), label: `Faded ${m.faded.map((f) => PAINT_TARGETS[f].name.toLowerCase()).join(" & ")}` });
          break;
        default:
          break;
      }
    }
    this.damages = D;
  }

  buildTasks() {
    const m = this.model;
    const T = [];
    // grime baselines
    this.grimeInit = [0, 0, 0];
    for (const g of m.grime) {
      const a = g.attr.array;
      for (let i = 0; i < g.n; i++) if (g.vis[i]) for (let c = 0; c < 3; c++) this.grimeInit[c] += a[i * 4 + c];
    }
    this.grimeLeft = this.grimeInit.slice();
    for (const d of this.damages) {
      const base = { id: d.id, dmg: d.id, done: false, progress: 0, score: 0, mistakes: 0, required: true };
      switch (d.kind) {
        case "dust":
        case "dirt":
        case "stain":
          T.push({ ...base, kind: "clean", channel: d.channel, label: { dust: "Brush off the dust", dirt: "Scrub away the dirt", stain: "Lift the stains (spray + sponge)" }[d.kind], tools: d.kind === "dust" ? ["brush", "cloth"] : d.kind === "dirt" ? ["sponge", "cloth"] : ["spray", "sponge"] });
          break;
        case "scratch":
          T.push({ ...base, kind: "polish", label: "Buff out the scratches", tools: ["polish"], started: false });
          break;
        case "crack":
          T.push({ ...base, kind: "crack", crack: d.crack, label: `Repair the ${d.label.split(" ")[1]} crack`, tools: ["glue", "cloth"], stage: "open", fill: new Array(m.cracks[d.crack].pts.length).fill(0), good: 0, bad: 0, over: 0, cure: 0, polish: 0, started: false });
          break;
        case "arm":
        case "leg":
        case "eye":
        case "accessory":
          T.push({ ...base, kind: "part", socket: d.socket, label: `Replace the ${d.kind === "accessory" ? d.item : d.label.toLowerCase().replace("damaged ", "").replace("broken ", "")}`, tools: ["pliers"], stage: "broken", wrong: 0, misaligned: 0, angleErr: 0 });
          break;
        case "shoe":
          T.push({ ...base, kind: "part", socket: d.socket, label: `Fit a new ${d.socket.endsWith("L") ? "left" : "right"} shoe`, tools: ["pliers"], stage: "open", wrong: 0, misaligned: 0, angleErr: 0 });
          break;
        case "button":
          T.push({ ...base, kind: "button", socket: d.socket, label: "Sew on a new button", tools: ["pliers", "needle"], stage: "open", wrong: 0, misaligned: 0, sew: null });
          break;
        case "tangle": {
          const init = m.hair.locks.reduce((s, L) => s + (L.present ? L.tangle : 0), 0) / Math.max(1, m.hair.locks.filter((L) => L.present).length);
          T.push({ ...base, kind: "detangle", label: "Brush out the tangles", tools: ["comb"], init, snags: 0, against: 0 });
          break;
        }
        case "bald":
          T.push({ ...base, kind: "reroot", label: "Reroot the bald patches", tools: ["reroot"], patches: m.patches.map(() => ({ growth: 0, paid: false })) });
          break;
        case "tear":
          T.push({ ...base, kind: "sew", tear: d.tear, label: `Stitch the ${d.label.toLowerCase()}`, tools: ["needle"], next: 0, devs: [], offPath: 0, offAcc: 0, started: false });
          break;
        case "faded":
          T.push({ ...base, kind: "paint", features: d.features, label: `Repaint the ${d.features.map((f) => PAINT_TARGETS[f].name.toLowerCase()).join(" & ")}`, tools: ["paint"], started: false, cov: {}, spill: 0, color: 0 });
          break;
        default:
          break;
      }
    }
    for (const r of this.order.requests || []) {
      if (r.key === "wash" && m.hair) T.push({ id: "wash", kind: "wash", label: "Wash the hair (customer request)", tools: ["shampoo"], done: false, progress: 0, score: 0, mistakes: 0, required: true, started: false });
      if (r.key === "shine" && (DOLL_TYPES[this.type].mat === "porcelain" || DOLL_TYPES[this.type].mat === "resin")) {
        this.shine = m.grime.filter((g) => g.skin).map((g) => new Float32Array(g.n));
        T.push({ id: "shine", kind: "shine", label: "Polish to a shine (customer request)", tools: ["polish"], done: false, progress: 0, score: 0, mistakes: 0, required: true, started: false });
      }
    }
    if (T.some((t) => t.kind === "paint")) {
      this.grid = { alpha: new Float32Array(FACE.W * FACE.H), color: new Uint8Array(FACE.W * FACE.H) };
      this.masks = {};
      for (const f of ["lips", "brows", "cheeks"]) {
        const mk = new Float32Array(FACE.W * FACE.H);
        for (let y = 0; y < FACE.H; y++) for (let x = 0; x < FACE.W; x++) {
          const { az, el } = cellToAE(x + 0.5, y + 0.5);
          mk[y * FACE.W + x] = featureMask(f, this.plan, az, el);
        }
        this.masks[f] = mk;
      }
    }
    this.tasks = T;
  }

  /* ============================================================ helpers */
  get tiers() {
    return this.ctx.tiers || {};
  }
  task(id) {
    return this.tasks.find((t) => t.id === id);
  }
  tasksOf(kind) {
    return this.tasks.filter((t) => t.kind === kind);
  }
  consume(item, n = 1) {
    if (!this.ctx.consume(item, n)) return false;
    this.used[item] = (this.used[item] || 0) + n;
    return true;
  }
  needSupply(item) {
    if (this.ctx.qty(item) > 0) return true;
    this.emit("toast", { kind: "warn", text: `Out of ${item === "paint" ? "paint pots" : item} — restock in the Shop`, item });
    return false;
  }
  complete(t, score) {
    if (t.done) return;
    t.done = true;
    t.progress = 1;
    t.score = Math.round(clamp(score, 0, 100));
    this.emit("taskDone", { id: t.id, label: t.label, score: t.score });
    if (["crack", "sew", "paint", "detangle"].includes(t.kind)) this.ctx.track?.(t.kind, 1);
  }

  /** Max grime of channel c within r of p (doll-root space). */
  grimeAt(p, c, r = 0.03) {
    let best = 0;
    const r2 = r * r;
    for (const g of this.model.grime) {
      const P = g.pos;
      const a = g.attr.array;
      for (let i = 0; i < g.n; i++) {
        const dx = P[i * 3] - p.x, dy = P[i * 3 + 1] - p.y, dz = P[i * 3 + 2] - p.z;
        if (dx * dx + dy * dy + dz * dz < r2 && a[i * 4 + c] > best) best = a[i * 4 + c];
      }
    }
    return best;
  }
  grimeRemaining(c) {
    let s = 0;
    for (const g of this.model.grime) {
      const a = g.attr.array;
      for (let i = 0; i < g.n; i++) if (g.vis[i]) s += a[i * 4 + c];
    }
    return s;
  }

  /* ========================================================= tool / phase */
  selectTool(id) {
    if (id && id !== "hand" && TOOLS[id] && !this.ctx.hasTool(id)) {
      this.emit("toast", { kind: "warn", text: `You don't own the ${TOOLS[id].name} yet — buy it in the Shop` });
      return false;
    }
    if (this.phase === "inspect" && id && id !== "magnifier" && id !== "hand") {
      this.emit("toast", { kind: "info", text: "Finish inspecting first — click damaged spots with the magnifier" });
      return false;
    }
    this.cancelCarry();
    this.tool = id || "hand";
    this.emit("tool", { id: this.tool });
    if (this.model.face) this.model.face.setGuides(this.tool === "paint" ? this.tasksOf("paint").filter((t) => !t.done).flatMap((t) => t.features) : null);
    return true;
  }

  finishInspection() {
    if (this.phase !== "inspect") return;
    const total = this.damages.length;
    const found = this.damages.filter((d) => d.found).length;
    for (const d of this.damages) if (!d.found) d.missed = true;
    this.inspect.found = found;
    this.inspect.score = Math.round(clamp((total ? (100 * found) / total : 100) - 8 * this.inspect.false, 0, 100));
    this.inspect.done = true;
    this.phase = "repair";
    this.tool = "hand";
    this.emit("phase", { phase: "repair", missed: this.damages.filter((d) => d.missed).map((d) => d.label), score: this.inspect.score });
  }

  /** Everything required done (including drying washed hair)? */
  pendingTasks() {
    const list = this.tasks.filter((t) => t.required && !t.done);
    if (this.model.hair && this.model.hair.locks.some((L) => L.present && L.wet > 0.25)) list.push({ id: "dry", label: "Dry the wet hair", kind: "dry" });
    return list;
  }
  finishRepairs() {
    if (this.phase !== "repair") return false;
    if (this.pendingTasks().length) {
      this.emit("toast", { kind: "warn", text: "Some repairs are still unfinished" });
      return false;
    }
    this.cancelCarry();
    this.phase = "customize";
    this.tool = "hand";
    this.frozen = this.qualityParts();
    this.emit("phase", { phase: "customize" });
    return true;
  }

  /* ============================================================== input */
  pointerDown(hit, ray) {
    this.lastHit = hit ? { point: hit.point.clone(), part: hit.part } : null;
    if (this.carry) {
      this.carryMove(ray);
      this.carryClick();
      return;
    }
    if (this.phase === "inspect") {
      if (this.tool === "magnifier" && hit) this.inspectClick(hit);
      return;
    }
    if (!hit || this.phase !== "repair") return;
    const tool = this.tool;
    this.stroke = { tool, last: hit.point.clone(), lastCell: null };
    if (tool === "pliers") return this.pliersClick(hit);
    if (tool === "paint") {
      this.pushUndo();
      this.paintAt(hit, true);
      return;
    }
    if (tool === "spray") this.sprayAt(hit, 0.12);
    if (tool === "shampoo") this.shampooAt(hit, 0.02);
    if (tool === "dryer" || tool === "reroot") this.holding = { tool, hit };
    if (tool === "needle") this.sewAt(hit, 0);
    if (tool === "glue") this.glueAt(hit, 0.004);
  }

  pointerMove(hit, ray) {
    if (this.carry) {
      this.carryMove(ray);
      return;
    }
    const s = this.stroke;
    if (!s) return;
    if (!hit) {
      s.last = null;
      if (this.holding) this.holding.hit = null;
      return;
    }
    const travel = s.last ? Math.min(0.08, s.last.distanceTo(hit.point)) : 0;
    const delta = s.last ? hit.point.clone().sub(s.last) : V();
    s.last = hit.point.clone();
    if (this.holding) this.holding.hit = hit;
    switch (s.tool) {
      case "brush":
      case "cloth":
      case "sponge":
        this.cleanAt(hit, s.tool, travel);
        if (s.tool === "cloth") {
          this.polishCracks(hit, travel);
        }
        break;
      case "spray":
        break;
      case "polish":
        this.polishAt(hit, travel);
        break;
      case "glue":
        this.glueAt(hit, travel);
        break;
      case "needle":
        this.sewAt(hit, travel);
        break;
      case "paint":
        this.paintAt(hit, false);
        break;
      case "comb":
        this.combAt(hit, delta, travel);
        break;
      case "shampoo":
        this.shampooAt(hit, travel);
        break;
      default:
        break;
    }
  }

  pointerUp() {
    this.stroke = null;
    this.holding = null;
    if (this.tool === "paint" && this.grid) this.updatePaintScores();
  }

  /** Spray is a held action: bursts every 0.25 s while the pointer is down. */
  update(dt) {
    if (this.phase === "repair" || this.phase === "inspect") this.elapsed += dt;
    const m = this.model;
    // evaporation of wet surfaces + wet hair
    this._wetT = (this._wetT || 0) + dt;
    if (this._wetT > 0.25) {
      const k = this._wetT;
      this._wetT = 0;
      for (const g of m.grime) {
        const a = g.attr.array;
        let ch = false;
        for (let i = 0; i < g.n; i++) if (a[i * 4 + 3] > 0) {
          a[i * 4 + 3] = Math.max(0, a[i * 4 + 3] - 0.045 * k);
          ch = true;
        }
        if (ch) g.attr.needsUpdate = true;
      }
      if (m.hair) {
        m.hair.locks.forEach((L, i) => {
          if (L.wet > 0) m.hair.setLock(i, { wet: Math.max(0, L.wet - 0.004 * k) });
        });
      }
    }
    if (this.stroke && this.stroke.tool === "spray" && this.stroke.last && this.lastHit) {
      this._sprayT = (this._sprayT || 0) + dt;
      if (this._sprayT > 0.25) {
        this._sprayT = 0;
        this.sprayAt({ point: this.stroke.last }, 0);
      }
    }
    if (this.stroke && this.stroke.tool === "glue" && this.stroke.last) {
      // squeezing the tube while holding still keeps adding adhesive
      for (const t of this.tasksOf("crack")) {
        if (t.stage !== "glued") continue;
        const c = this.model.cracks[t.crack];
        if (polyDist(this.stroke.last, c.pts) < 0.012) {
          this.glueFill(t, c, this.stroke.last, dt * 0.9);
          this._dwellT = (this._dwellT || 0) + dt;
          if (this._dwellT > 0.3) {
            this._dwellT = 0;
            this.afterGlue(t);
          }
        }
      }
    }
    if (this.holding && this.holding.hit) {
      if (this.holding.tool === "dryer") this.dryAt(this.holding.hit, dt);
      if (this.holding.tool === "reroot") this.rerootAt(this.holding.hit, dt);
    }
    // crack curing
    for (const t of this.tasksOf("crack")) {
      if (t.stage === "curing") {
        t.cure -= dt;
        if (t.cure <= 0) {
          t.stage = "cured";
          m.setCrack(t.crack, { glue: t.fill, stage: "cured", residual: 1 });
          this.emit("cured", { id: t.id });
        }
      }
    }
    if (m.hair) m.hair.flush();
  }

  /* ========================================================== inspection */
  inspectClick(hit) {
    this.inspect.clicks++;
    const p = hit.point;
    const m = this.model;
    const order = ["arm", "leg", "eye", "accessory", "button", "shoe", "crack", "tear", "scratch", "bald", "faded", "tangle", "stain", "dirt", "dust"];
    const cand = this.damages.filter((d) => !d.found).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    for (const d of cand) {
      let ok = false;
      switch (d.kind) {
        case "dust":
        case "dirt":
          ok = this.grimeAt(p, d.channel, 0.035) > 0.22;
          break;
        case "stain":
          ok = this.grimeAt(p, 2, 0.04) > 0.25;
          break;
        case "scratch":
          ok = m.scratches.some((s) => s.depth > 0.1 && polyDist(p, s.pts) < 0.03);
          break;
        case "crack":
          ok = polyDist(p, m.cracks[d.crack].pts) < 0.035;
          break;
        case "arm":
        case "leg":
          ok = hit.part === d.socket;
          break;
        case "eye":
          ok = hit.part === d.socket || p.distanceTo(m.sockets[d.socket].pos) < 0.03;
          break;
        case "shoe":
          ok = p.distanceTo(m.sockets[d.socket].pos) < 0.065;
          break;
        case "button":
          ok = p.distanceTo(m.sockets[d.socket].pos) < 0.035;
          break;
        case "accessory":
          ok = hit.part === d.socket;
          break;
        case "tangle":
          ok = hit.part === "hair";
          break;
        case "bald":
          ok = m.patches.some((P) => P.center.distanceTo(p) < 0.055);
          break;
        case "tear":
          ok = polyDist(p, m.tears[d.tear].path) < 0.035;
          break;
        case "faded":
          if (hit.part === "head" && hit.uv) {
            const { az, el } = uvToAE(hit.uv.x, hit.uv.y);
            ok = d.features.some((f) => [0, 0.05, -0.05].some((o) => featureMask(f, this.plan, az + o, el) > 0.05 || featureMask(f, this.plan, az, el + o) > 0.05));
          }
          break;
        default:
          break;
      }
      if (ok) {
        d.found = true;
        this.inspect.found++;
        this.emit("found", { id: d.id, label: d.label, point: p.clone() });
        if (this.damages.every((x) => x.found)) this.emit("toast", { kind: "good", text: "All damage found! Finish inspection to start repairing." });
        return d;
      }
    }
    this.inspect.false++;
    this.emit("nothing", { point: p.clone() });
    return null;
  }

  /* ============================================================ cleaning */
  cleanAt(hit, tool, travel) {
    if (travel <= 0) return;
    const T = CLEAN_TOOLS[tool];
    const tiers = this.tiers;
    const bench = [1, 1.2, 1.4][tiers.bench || 0];
    const R = T.r * (tiers.tools ? 1.25 : 1);
    const r2 = R * R;
    const p = hit.point;
    const n = hit.normal;
    let removed = [0, 0, 0];
    let wetMax = 0;
    for (const g of this.model.grime) {
      const P = g.pos;
      const N = g.nrm;
      const a = g.attr.array;
      let ch = false;
      for (let i = 0; i < g.n; i++) {
        const dx = P[i * 3] - p.x, dy = P[i * 3 + 1] - p.y, dz = P[i * 3 + 2] - p.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > r2) continue;
        if (n && N[i * 3] * n.x + N[i * 3 + 1] * n.y + N[i * 3 + 2] * n.z < -0.1) continue;
        const o = i * 4;
        const fall = 1 - Math.sqrt(d2) / R;
        const wet = a[o + 3];
        if (wet > wetMax) wetMax = wet;
        for (let c = 0; c < 3; c++) {
          if (a[o + c] <= 0) continue;
          let s = T.s[c];
          if (c === 2) s = wet > 0.3 ? T.stainWet || T.s[2] : T.s[2] * 0.15;
          else s *= 1 + (T.wetMul - 1) * Math.min(1, wet * 1.5);
          if (s <= 0) continue;
          const dv = Math.min(a[o + c], s * travel * K_CLEAN * fall * bench);
          a[o + c] -= dv;
          if (g.vis[i]) removed[c] += dv;
          ch = true;
        }
        if (T.dries && wet > 0) {
          a[o + 3] = Math.max(0, wet - travel * 8 * fall);
          ch = true;
        }
      }
      if (ch) g.attr.needsUpdate = true;
    }
    const tot = removed[0] + removed[1] + removed[2];
    if (tot > 0.02) {
      this.emit("fx", { kind: tool === "sponge" && wetMax > 0.2 ? "foam" : removed[0] > removed[1] ? "dust" : "dirt", point: p.clone(), normal: n ? n.clone() : null, amount: tot });
    }
    for (let c = 0; c < 3; c++) this.grimeLeft[c] = Math.max(0, this.grimeLeft[c] - removed[c]);
    if (tot > 0) this.emit("rub", { tool, amount: tot });
    this.updateCleanTasks();
  }

  sprayAt(hit, travel) {
    if (!this.needSupply("solution")) return;
    this.consume("solution", 1);
    const R = 0.085;
    const p = hit.point;
    for (const g of this.model.grime) {
      const P = g.pos;
      const a = g.attr.array;
      let ch = false;
      for (let i = 0; i < g.n; i++) {
        if (!g.vis[i]) continue;
        const d = Math.hypot(P[i * 3] - p.x, P[i * 3 + 1] - p.y, P[i * 3 + 2] - p.z);
        if (d > R) continue;
        a[i * 4 + 3] = Math.min(1, a[i * 4 + 3] + 0.9 * (1 - d / R) + 0.2);
        ch = true;
      }
      if (ch) g.attr.needsUpdate = true;
    }
    this.emit("fx", { kind: "spray", point: p.clone() });
    this.emit("sfx", { name: "spray" });
    void travel;
  }

  updateCleanTasks() {
    for (const t of this.tasksOf("clean")) {
      const init = this.grimeInit[t.channel];
      if (init <= 0) {
        if (!t.done) this.complete(t, 100);
        continue;
      }
      const rem = this.grimeLeft[t.channel];
      t.progress = clamp(1 - rem / init, 0, 1);
      // thoroughness matters: 92% clean ≈ 72 points, spotless = 100
      const sc = clamp(100 - (1 - t.progress) * 350, 0, 100);
      if (!t.done && t.progress >= CLEAN_DONE) this.complete(t, sc);
      else if (t.done) t.score = Math.round(sc);
    }
  }

  /* ========================================================= polishing */
  polishAt(hit, travel) {
    if (travel <= 0) return;
    const p = hit.point;
    const pro = this.tiers.tools ? 1.5 : 1;
    const scr = this.tasksOf("polish")[0];
    let touched = false;
    if (scr && !scr.done) {
      this.model.scratches.forEach((s, i) => {
        if (s.depth <= 0) return;
        if (polyDist(p, s.pts) < 0.022) {
          if (!scr.started) {
            if (!this.needSupply("compound")) return;
            this.consume("compound", 1);
            scr.started = true;
          }
          this.model.setScratch(i, Math.max(0, s.depth - travel * 9 * pro));
          touched = true;
        }
      });
      const live = this.model.scratches.filter((s) => s.mesh.parent);
      const avg = live.reduce((a, s) => a + s.depth, 0) / Math.max(1, live.length);
      scr.progress = 1 - avg;
      if (live.every((s) => s.depth <= 0.1)) {
        live.forEach((s) => this.model.setScratch(this.model.scratches.indexOf(s), 0));
        this.complete(scr, 100 - avg * 40);
      }
    }
    const sh = this.task("shine");
    if (sh && !sh.done && this.shine) {
      const skins = this.model.grime.filter((g) => g.skin);
      let hitSkin = false;
      skins.forEach((g, k) => {
        const arr = this.shine[k];
        if (!arr || arr.length !== g.n) return;
        for (let i = 0; i < g.n; i++) {
          if (!g.vis[i]) continue;
          const d = Math.hypot(g.pos[i * 3] - p.x, g.pos[i * 3 + 1] - p.y, g.pos[i * 3 + 2] - p.z);
          if (d < 0.06) {
            arr[i] = Math.min(1, arr[i] + travel * 10 * pro * (1 - d / 0.06));
            hitSkin = true;
          }
        }
      });
      if (hitSkin && !sh.started) {
        if (!this.needSupply("compound")) return;
        this.consume("compound", 1);
        sh.started = true;
      }
      let s = 0, c = 0;
      skins.forEach((g, k) => {
        const arr = this.shine[k];
        if (!arr) return;
        for (let i = 0; i < g.n; i++) if (g.vis[i]) {
          s += arr[i];
          c++;
        }
      });
      sh.progress = c ? s / c : 0;
      this.model.setGloss(sh.progress);
      if (sh.progress >= 0.85) this.complete(sh, sh.progress * 100);
      if (hitSkin) touched = true;
    }
    if (touched) this.emit("fx", { kind: "sparkle", point: p.clone() });
    if (touched) this.emit("rub", { tool: "polish", amount: travel });
  }

  /* ============================================================== cracks */
  glueAt(hit, travel) {
    const p = hit.point;
    const pro = this.tiers.tools ? 1 : 0;
    let best = null;
    let bd = Infinity;
    for (const t of this.tasksOf("crack")) {
      if (t.stage !== "open" && t.stage !== "glued") continue;
      const c = this.model.cracks[t.crack];
      let d = Infinity;
      for (const [a, b] of crackSegments(c)) d = Math.min(d, segDist(p, a, b));
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    if (!best) return;
    const t = best;
    const c = this.model.cracks[t.crack];
    const tol = 0.011 + pro * 0.004;
    if (bd > 0.07) return;
    if (!t.started) {
      if (!this.needSupply("adhesive")) return;
      this.consume("adhesive", 1);
      t.started = true;
      t.stage = "glued";
    }
    if (bd < tol) {
      t.good++;
      this.glueFill(t, c, p, travel / 0.03);
    } else {
      t.bad++;
      if (t.bad % 4 === 1) this.emit("fx", { kind: "smear", point: p.clone() });
    }
    this.afterGlue(t);
  }

  glueFill(t, c, p, amt) {
    c.pts.forEach((q, k) => {
      if (q.distanceTo(p) < 0.012) {
        const before = t.fill[k];
        t.fill[k] = Math.min(3.5, t.fill[k] + amt);
        if (before <= 2.6 && t.fill[k] > 2.6) t.over++;
      }
    });
  }

  afterGlue(t) {
    if (t.stage !== "glued") return;
    const filled = t.fill.filter((f) => f >= 0.75).length;
    t.progress = 0.6 * (filled / t.fill.length);
    this.model.setCrack(t.crack, { glue: t.fill, stage: "glued", residual: 1 });
    this.emit("rub", { tool: "glue", amount: 0.01 });
    if (filled >= Math.ceil(t.fill.length * 0.96)) {
      t.stage = "curing";
      t.cure = this.tiers.tools ? 2 : 4;
      this.model.setCrack(t.crack, { glue: t.fill, stage: "curing", residual: 1 });
      this.emit("toast", { kind: "info", text: "Crack sealed — the adhesive is curing…" });
      this.emit("sfx", { name: "cure" });
      this.stroke = null;
    }
  }

  polishCracks(hit, travel) {
    if (travel <= 0) return;
    for (const t of this.tasksOf("crack")) {
      if (t.stage !== "cured") continue;
      const c = this.model.cracks[t.crack];
      if (polyDist(hit.point, c.pts) > 0.032) continue;
      t.polish = Math.min(1, t.polish + travel * 5 * (this.tiers.tools ? 1.5 : 1));
      t.progress = 0.75 + 0.25 * t.polish;
      this.emit("fx", { kind: "sparkle", point: hit.point.clone() });
      if (t.polish >= 1) {
        t.stage = "polished";
        const acc = t.good / Math.max(1, t.good + t.bad);
        const ovf = t.over / t.fill.length;
        const q = 0.62 * acc + 0.23 * (1 - Math.min(1, ovf * 1.5)) + 0.15;
        t.quality = q;
        this.model.setCrack(t.crack, { glue: null, stage: "polished", residual: clamp(0.05 + 0.75 * (1 - q), 0.05, 0.85) });
        this.complete(t, q * 100);
      }
    }
  }

  /* =============================================================== parts */
  pliersClick(hit) {
    for (const t of this.tasks) {
      if (t.kind !== "part" || t.stage !== "broken") continue;
      const so = this.model.sockets[t.socket];
      const onIt = hit.part === t.socket || (so.kind === "eye" && hit.point.distanceTo(so.pos) < 0.03);
      if (!onIt) continue;
      const obj = this.model.detach(t.socket);
      t.stage = "open";
      t.progress = 0.35;
      this.emit("detached", { id: t.id, obj, socket: t.socket });
      this.emit("toast", { kind: "info", text: "Broken part removed — pick a replacement from the Parts tray" });
      return true;
    }
    this.emit("toast", { kind: "info", text: "Use the pliers on a broken part to remove it" });
    return false;
  }

  openSockets() {
    return this.tasks.filter((t) => (t.kind === "part" || t.kind === "button") && t.stage === "open").map((t) => this.model.sockets[t.socket]);
  }

  pickPart(partId) {
    if (this.phase !== "repair") return false;
    if (!this.ctx.hasTool("pliers")) {
      this.emit("toast", { kind: "warn", text: "You need Parts Pliers to fit parts" });
      return false;
    }
    if ((this.ctx.qty(partId) || 0) <= 0) {
      this.emit("toast", { kind: "warn", text: `No ${PARTS[partId]?.name || "part"} in stock — buy one in the Shop` });
      return false;
    }
    const open = this.openSockets();
    if (!open.length) {
      this.emit("toast", { kind: "info", text: "There's no open socket — remove the broken part with the pliers first" });
      return false;
    }
    const P = PARTS[partId];
    const spin = P.kind === "button" ? 0 : (35 + this.rand() * 80) * (this.rand() < 0.5 ? -1 : 1);
    this.carry = { partId, angle: spin, pos: null, target: null, snapped: false };
    this.tool = "pliers";
    this.emit("carry", { partId });
    return true;
  }

  carryMove(ray) {
    const c = this.carry;
    if (!c || !ray) return;
    const open = this.openSockets();
    if (!open.length) return;
    let best = null, bd = Infinity;
    const o = ray.origin, d = ray.dir;
    for (const s of open) {
      const t = Math.max(0, tmp.copy(s.pos).sub(o).dot(d));
      const q = tmp2.copy(o).addScaledVector(d, t);
      const dist = q.distanceTo(s.pos);
      if (dist < bd) {
        bd = dist;
        best = s;
      }
    }
    c.target = best;
    // ray ∩ plane through the target socket, facing the camera
    const nrm = d.clone().negate();
    const denom = d.dot(nrm);
    const t = tmp.copy(best.pos).sub(o).dot(nrm) / (denom || -1);
    c.pos = o.clone().addScaledVector(d, Math.max(0.05, t));
    c.snapped = c.pos.distanceTo(best.pos) < 0.05;
    if (c.snapped) c.pos.copy(best.pos);
    const fit = partFits(c.partId, best, this.type);
    c.fits = fit.ok;
    c.why = fit.why;
  }

  rotateCarry(deg) {
    if (!this.carry) return;
    let a = this.carry.angle + deg;
    while (a > 180) a -= 360;
    while (a < -180) a += 360;
    this.carry.angle = a;
  }

  carryClick() {
    const c = this.carry;
    if (!c || !c.target) return;
    if (!c.snapped) {
      this.emit("toast", { kind: "info", text: "Bring the part to the glowing socket" });
      return;
    }
    const so = c.target;
    const t = this.tasks.find((x) => x.socket === so.id);
    if (!c.fits) {
      if (t) {
        t.wrong++;
        t.mistakes++;
      }
      this.mistakes = (this.mistakes || 0) + 1;
      this.emit("wrongPart", { text: c.why || "It doesn't fit", point: so.pos.clone() });
      this.carry = null;
      return;
    }
    const tol = 14;
    if (Math.abs(c.angle) > tol) {
      t.misaligned++;
      this.emit("misaligned", { angle: c.angle, point: so.pos.clone() });
      return;
    }
    if (!this.consume(c.partId, 1)) {
      this.emit("toast", { kind: "warn", text: "That part is out of stock" });
      this.carry = null;
      return;
    }
    this.model.attach(so.id, c.partId);
    const P = PARTS[c.partId];
    t.angleErr = Math.abs(c.angle);
    t.partId = c.partId;
    this.carry = null;
    this.emit("attached", { id: t.id, point: so.pos.clone(), partId: c.partId });
    const base = 100 - 12 * t.wrong - 6 * t.misaligned - t.angleErr * 1.2;
    if (t.kind === "button") {
      t.stage = "sew";
      t.progress = 0.5;
      t.placeScore = base;
      const b = this.model.buttons[so.slot];
      const up = Math.abs(b.n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const s1 = new THREE.Vector3().crossVectors(b.n, up).normalize();
      const s2 = new THREE.Vector3().crossVectors(b.n, s1).normalize();
      const k = b.size * 0.34;
      const off = (a, bb) => b.pos.clone().addScaledVector(s1, a * k).addScaledVector(s2, bb * k).addScaledVector(b.n, 0.002);
      t.sew = { path: [off(-1, 1), off(1, -1), off(1, 1), off(-1, -1)], next: 0, devs: [], started: false };
      this.emit("toast", { kind: "info", text: "Now sew it on — follow the four holes with the needle" });
    } else {
      this.complete(t, base);
    }
    void P;
  }

  cancelCarry() {
    if (this.carry) this.emit("carryCancel", {});
    this.carry = null;
  }

  /* ============================================================== sewing */
  sewAt(hit, travel) {
    const p = hit.point;
    const tolK = [1, 1.35, 1.7][this.tiers.sewing || 0];
    // buttons waiting to be sewn first (small path)
    for (const t of this.tasksOf("button")) {
      if (t.stage !== "sew" || t.done) continue;
      const s = t.sew;
      if (s.next >= 4) continue;
      if (p.distanceTo(s.path[Math.min(s.next, 3)]) > 0.05) continue;
      if (!s.started) {
        if (!this.needSupply("thread")) return;
        this.consume("thread", 1);
        s.started = true;
      }
      const tol = 0.007 * tolK;
      const d = p.distanceTo(s.path[s.next]);
      if (this.approach(s, d, tol)) {
        s.next++;
        this.emit("stitch", { point: p.clone(), button: true });
        t.progress = 0.5 + 0.5 * (s.next / 4);
        if (s.next >= 4) {
          const acc = 1 - 0.5 * (s.devs.reduce((a, b) => a + b, 0) / s.devs.length);
          t.stage = "done";
          this.complete(t, t.placeScore * 0.6 + acc * 100 * 0.4);
        }
      }
      return;
    }
    for (const t of this.tasksOf("sew")) {
      if (t.done) continue;
      const tear = this.model.tears[t.tear];
      const path = tear.path;
      const nextP = path[t.next];
      if (polyDist(p, path) > 0.06 && p.distanceTo(nextP) > 0.06) continue;
      if (!t.started) {
        if (!this.needSupply("thread")) return;
        this.consume("thread", 1);
        t.started = true;
      }
      const tol = 0.014 * tolK;
      const d = p.distanceTo(nextP);
      if (this.approach(t, d, tol)) {
        t.next++;
        const N = path.length;
        this.model.setTear(t.tear, t.next, 0.65 * (t.next / N), this.sewQuality(t));
        t.progress = t.next / N;
        this.emit("stitch", { point: nextP.clone() });
        if (t.next >= N) {
          const q = this.sewQuality(t);
          this.model.setTear(t.tear, N, 1, q);
          this.complete(t, q * 100);
        }
      } else if (t.next > 0 && travel > 0) {
        const seg = segDist(p, path[t.next - 1], nextP);
        if (seg > tol * 2.2) {
          t.offAcc += travel;
          if (t.offAcc > 0.03) {
            t.offAcc = 0;
            t.offPath++;
            t.mistakes++;
            this.emit("offPath", { point: p.clone() });
          }
        }
      }
      return;
    }
  }
  /**
   * Stitch placement on closest approach: once the needle is within
   * tolerance of the next point we wait until it starts moving away again,
   * so the deviation recorded is the best the player managed.
   */
  approach(st, d, tol) {
    if (d < tol) {
      if (st.cand == null || d < st.cand) {
        st.cand = d;
        if (d < tol * 0.15) {
          st.devs.push(d / tol);
          st.cand = null;
          return true;
        }
        return false;
      }
      if (d > st.cand + tol * 0.12) {
        st.devs.push(st.cand / tol);
        st.cand = null;
        return true;
      }
      return false;
    }
    if (st.cand != null) {
      st.devs.push(st.cand / tol);
      st.cand = null;
      return true;
    }
    return false;
  }

  sewQuality(t) {
    const dev = t.devs.length ? t.devs.reduce((a, b) => a + b, 0) / t.devs.length : 0;
    return clamp(1 - 0.45 * dev - 0.06 * t.offPath, 0.2, 1);
  }

  /* ============================================================ painting */
  setPaint({ color, size, eraser }) {
    if (color != null) this.paintColor = color;
    if (size != null) this.paintSize = size;
    if (eraser != null) this.eraser = eraser;
  }
  paintColors() {
    const premium = (this.tiers.painting || 0) >= 1;
    return PAINT_COLORS.filter((c) => premium || !c.premium);
  }
  pushUndo() {
    if (!this.grid) return;
    this.undoStack.push({ a: this.grid.alpha.slice(), c: this.grid.color.slice() });
    if (this.undoStack.length > 25) this.undoStack.shift();
  }
  undoPaint() {
    const u = this.undoStack.pop();
    if (!u || !this.grid) return false;
    this.grid.alpha.set(u.a);
    this.grid.color.set(u.c);
    this.refreshFace();
    this.updatePaintScores();
    return true;
  }
  refreshFace() {
    if (this.model.face) this.model.face.setGrid(this.grid, PAINT_COLORS.map((c) => hexRgb(c.hex)));
  }
  paintAt(hit, first) {
    const t = this.tasksOf("paint").find((x) => !x.done);
    if (!t || !this.grid || hit.part !== "head" || !hit.uv) return;
    const { az, el } = uvToAE(hit.uv.x, hit.uv.y);
    const cell = aeToCell(az, el);
    if (!cell) return;
    if (!t.started) {
      if (!this.needSupply("paint")) return;
      this.consume("paint", 1);
      t.started = true;
    }
    const s = this.stroke;
    const from = !first && s && s.lastCell ? s.lastCell : cell;
    const dist = Math.hypot(cell.x - from.x, cell.y - from.y);
    const steps = Math.max(1, Math.ceil(dist / 0.5));
    const R = PAINT_SIZES[this.paintSize] + ((this.tiers.painting || 0) >= 1 ? 0.4 : 0);
    const steady = (this.tiers.painting || 0) >= 2;
    const allMask = this.combinedMask(t.features);
    for (let k = 1; k <= steps; k++) {
      const x = from.x + ((cell.x - from.x) * k) / steps;
      const y = from.y + ((cell.y - from.y) * k) / steps;
      this.stamp(x, y, R, steady ? allMask : null);
    }
    if (s) s.lastCell = cell;
    this.refreshFace();
    this.emit("rub", { tool: "paint", amount: 0.01 });
  }
  combinedMask(features) {
    const key = features.join(",");
    if (this._cm && this._cmKey === key) return this._cm;
    const out = new Float32Array(FACE.W * FACE.H);
    for (const f of features) {
      const m = this.masks[f];
      for (let i = 0; i < out.length; i++) out[i] = Math.max(out[i], m[i]);
    }
    this._cm = out;
    this._cmKey = key;
    return out;
  }
  stamp(cx, cy, R, steadyMask) {
    const { alpha, color } = this.grid;
    const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(FACE.W - 1, Math.ceil(cx + R));
    const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(FACE.H - 1, Math.ceil(cy + R));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > R) continue;
      const i = y * FACE.W + x;
      let s = (1 - (d / R) ** 2) * 0.55;
      if (steadyMask && steadyMask[i] < 0.1) s *= 0.35;
      if (this.eraser) alpha[i] = Math.max(0, alpha[i] - s * 1.5);
      else {
        if (s > 0.12) color[i] = this.paintColor;
        alpha[i] = Math.min(1, alpha[i] + s);
      }
    }
  }
  updatePaintScores() {
    const t = this.tasksOf("paint").find((x) => !x.done) || this.tasksOf("paint")[0];
    if (!t || !this.grid) return;
    const { alpha, color } = this.grid;
    const all = this.combinedMask(t.features);
    let spillA = 0, totA = 0;
    for (let i = 0; i < alpha.length; i++) {
      totA += alpha[i];
      if (all[i] < 0.1) spillA += alpha[i];
    }
    let colorSum = 0, colorN = 0, covAll = 0;
    for (const f of t.features) {
      const m = this.masks[f];
      const target = hexRgb(PAINT_TARGETS[f].color);
      let inside = 0, cov = 0;
      for (let i = 0; i < m.length; i++) {
        if (m[i] < 0.5) continue;
        inside++;
        if (alpha[i] > 0.45) {
          cov++;
          const c = hexRgb(PAINT_COLORS[color[i]]?.hex || "#000000");
          const dist = Math.hypot(c[0] - target[0], c[1] - target[1], c[2] - target[2]);
          colorSum += clamp(1 - (dist - 25) / 130, 0, 1);
          colorN++;
        }
      }
      t.cov[f] = inside ? cov / inside : 1;
      covAll += t.cov[f];
    }
    t.spill = totA > 0 ? spillA / totA : 0;
    t.color = colorN ? colorSum / colorN : 0;
    const cov = covAll / t.features.length;
    t.progress = Math.min(1, cov / 0.6) * 0.95;
    t.ready = t.features.every((f) => t.cov[f] >= 0.6);
    t.live = Math.round(100 * clamp(0.5 * Math.min(1, cov / 0.9) + 0.3 * (1 - t.spill) + 0.2 * t.color, 0, 1));
  }
  finishPaint() {
    const t = this.tasksOf("paint").find((x) => !x.done);
    if (!t) return false;
    this.updatePaintScores();
    if (!t.ready) {
      this.emit("toast", { kind: "warn", text: "Fill in more of the outlined areas first (60%+ of each)" });
      return false;
    }
    if (this.model.face) this.model.face.setGuides(null);
    this.complete(t, t.live);
    return true;
  }

  /* =============================================================== hair */
  locksNear(p, r) {
    const h = this.model.hair;
    if (!h) return [];
    const out = [];
    h.locks.forEach((L, i) => {
      if (!L.present) return;
      const d = segDist(p, L.root, L.tip);
      if (d < r) out.push(i);
    });
    return out;
  }
  combAt(hit, delta, travel) {
    const t = this.tasksOf("detangle")[0];
    const h = this.model.hair;
    if (!h || hit.part !== "hair" || travel <= 0) return;
    const mult = [1, 1.4, 1.8][this.tiers.hair || 0];
    const ids = new Set(this.locksNear(hit.point, 0.035));
    if (hit.lock != null && h.locks[hit.lock]?.present) ids.add(hit.lock);
    const dir = delta.clone().normalize();
    let changed = 0;
    for (const i of ids) {
      const L = h.locks[i];
      const align = dir.dot(L.dir);
      if (align > 0.2) {
        if (L.tangle > 0) {
          const k = (L.wet > 0.4 ? 2 : 1) * mult;
          h.setLock(i, { tangle: Math.max(0, L.tangle - (travel * 3.6 * align * k) / (1 + L.tangle)) });
          changed++;
        }
      } else if (align < -0.35 && L.tangle > 0.25 && t && !t.done) {
        t.against += travel;
        if (t.against > 0.05) {
          t.against = 0;
          t.snags++;
          t.mistakes++;
          this.emit("snag", { point: hit.point.clone() });
          h.setLock(i, { tangle: Math.min(1, L.tangle + 0.05) });
        }
      }
    }
    if (changed) this.emit("rub", { tool: "comb", amount: travel });
    if (t && !t.done) {
      const live = h.locks.filter((L) => L.present);
      const avg = live.reduce((s, L) => s + L.tangle, 0) / Math.max(1, live.length);
      t.progress = clamp(1 - avg / Math.max(0.01, t.init), 0, 1);
      if (avg <= 0.08 && live.every((L) => L.tangle <= 0.2)) this.complete(t, 100 * (1 - avg / Math.max(0.01, t.init)) - 5 * t.snags);
    }
  }
  shampooAt(hit, travel) {
    const h = this.model.hair;
    if (!h || (hit.part !== "hair" && hit.part !== "scalp")) return;
    const t = this.task("wash");
    if (!this._shampooPaid) {
      if (!this.needSupply("shampoo")) return;
      this.consume("shampoo", 1);
      this._shampooPaid = true;
    }
    let any = false;
    for (const i of this.locksNear(hit.point, 0.05)) {
      const L = h.locks[i];
      const wet = Math.min(1, L.wet + travel * 14 + 0.06);
      h.setLock(i, { wet, washed: L.washed || wet > 0.7 });
      any = true;
    }
    if (any) this.emit("fx", { kind: "foam", point: hit.point.clone() });
    if (t && !t.done) {
      const live = h.locks.filter((L) => L.present);
      t.progress = live.filter((L) => L.washed).length / Math.max(1, live.length);
      if (t.progress >= 0.95) this.complete(t, 100);
    }
  }
  dryAt(hit, dt) {
    const h = this.model.hair;
    if (!h) return;
    const mult = [1, 1.5, 2][this.tiers.hair || 0];
    let any = false;
    for (const i of this.locksNear(hit.point, 0.08)) {
      const L = h.locks[i];
      if (L.wet <= 0) continue;
      h.setLock(i, { wet: Math.max(0, L.wet - dt * 0.7 * mult) });
      any = true;
    }
    if (any) this.emit("fx", { kind: "steam", point: hit.point.clone() });
  }
  rerootAt(hit, dt) {
    const t = this.tasksOf("reroot")[0];
    const h = this.model.hair;
    if (!t || t.done || !h) return;
    const mult = [1, 1.3, 1.6][this.tiers.hair || 0];
    this.model.patches.forEach((P, k) => {
      const st = t.patches[k];
      if (st.growth >= 1) return;
      if (P.center.distanceTo(hit.point) > 0.05) return;
      if (!st.paid) {
        if (!this.needSupply("fiber")) return;
        this.consume("fiber", 1);
        st.paid = true;
      }
      st.growth = Math.min(1, st.growth + dt * 0.5 * mult);
      for (const i of P.ids) h.setLock(i, { present: true, growth: st.growth, tangle: 0, wet: 0 });
      this.emit("fx", { kind: "sparkle", point: hit.point.clone(), small: true });
      this.emit("rub", { tool: "reroot", amount: dt * 0.02 });
      if (st.growth >= 1) this.emit("sfx", { name: "pop" });
    });
    t.progress = t.patches.reduce((s, p) => s + p.growth, 0) / t.patches.length;
    if (t.patches.every((p) => p.growth >= 1)) this.complete(t, 100);
  }

  /* ========================================================= customize */
  canUse(key, value) {
    const lvl = this.ctx.level || 1;
    const T = DOLL_TYPES[this.type];
    if (key === "hairStyle") return T.styles.includes(value) && (HAIR_STYLES[value]?.level || 1) <= lvl;
    if (key === "hairColor") return !!HAIR_COLORS[value] && HAIR_COLORS[value].level <= lvl && T.styles.length > 0;
    if (key === "outfit") return T.outfits.includes(value) && (OUTFITS[value]?.level || 1) <= lvl;
    if (key === "shoes") return T.shoes.includes(value) && (SHOES[value]?.level || 1) <= lvl;
    if (key === "hat" || key === "ribbon" || key === "extra") return T[key === "hat" ? "hats" : key === "ribbon" ? "ribbons" : "extras"].includes(value) && (ACCESSORIES[value]?.level || 1) <= lvl;
    return true;
  }
  setLook(key, value) {
    if (this.phase !== "customize") return false;
    if (!LOOK_KEYS.includes(key) || key === "eyeColor") return false;
    if (!this.canUse(key, value)) {
      this.emit("toast", { kind: "warn", text: "Not unlocked yet" });
      return false;
    }
    const before = this.model.look[key];
    this.model.applyLook({ [key]: value });
    if (this.model.look[key] !== before) {
      if (this.model.look[key] !== this.originalLook[key]) this.lookChanges.add(key);
      else this.lookChanges.delete(key);
      this.emit("look", { key, value });
    }
    return true;
  }

  /* ============================================================ scoring */
  evalPrefs() {
    const reqs = (this.order.requests || []).filter((r) => r.key !== "wash" && r.key !== "shine");
    const out = [];
    const look = this.model.look;
    for (const r of reqs) {
      if (r.key === "keep") {
        const changed = [...this.lookChanges];
        out.push({ label: "Keep the original look", ok: changed.length === 0, score: Math.max(0, 100 - 30 * changed.length), note: changed.length ? `Changed: ${changed.join(", ")}` : "Untouched" });
      } else if (r.key === "eyeColor") {
        const ok = this.model.eyeColor.L === r.value && this.model.eyeColor.R === r.value;
        out.push({ label: `${r.value[0].toUpperCase() + r.value.slice(1)} eyes`, ok, score: ok ? 100 : 0 });
      } else if (r.key === "buttonMatch") {
        const parts = this.tasksOf("button").map((t) => t.partId);
        const ok = parts.length > 0 && parts.every((p) => p === `button:${this.model.buttonStyle}`);
        out.push({ label: "Matching buttons", ok, score: ok ? 100 : 20 });
      } else if (r.key === "button") {
        const parts = this.tasksOf("button").map((t) => t.partId);
        const ok = parts.length > 0 && parts.every((p) => p === `button:${r.value}`);
        out.push({ label: `${r.value[0].toUpperCase() + r.value.slice(1)} buttons`, ok, score: ok ? 100 : 20 });
      } else if (r.key === "shoeMatch") {
        const st = this.tasks.filter((t) => t.socket?.startsWith("shoe")).map((t) => t.partId);
        const ok = st.length > 0 && st.every((p) => p === `shoe:${look.shoes}`);
        out.push({ label: "A matching pair of shoes", ok, score: ok ? 100 : 15 });
      } else {
        const ok = look[r.key] === r.value;
        const names = { hairColor: HAIR_COLORS, hairStyle: HAIR_STYLES, outfit: OUTFITS, shoes: SHOES, hat: ACCESSORIES, ribbon: ACCESSORIES, extra: ACCESSORIES };
        const nm = names[r.key]?.[r.value]?.name || r.value;
        out.push({ label: `${r.key === "dressColor" ? "Dress" : r.key === "shoeColor" ? "Shoes" : r.key === "accent" ? "Ribbon" : ""} ${nm}`.trim(), ok, score: ok ? 100 : 0 });
      }
    }
    return out;
  }

  qualityParts() {
    const tasks = this.tasks.map((t) => ({ id: t.id, label: t.label, kind: t.kind, score: t.done ? t.score : Math.round((t.progress || 0) * 50), done: t.done, w: WEIGHT[t.kind] || 1, mistakes: t.mistakes || 0 }));
    return { tasks };
  }

  /** Quality 0–100 from inspection, task scores and customer preferences. */
  evaluate() {
    const parts = this.frozen || this.qualityParts();
    const prefs = this.evalPrefs();
    const W = parts.tasks.reduce((s, t) => s + t.w, 0);
    const taskScore = W ? parts.tasks.reduce((s, t) => s + t.score * t.w, 0) / W : 100;
    const insp = this.inspect.done ? this.inspect.score : 0;
    const prefScore = prefs.length ? prefs.reduce((s, p) => s + p.score, 0) / prefs.length : null;
    const quality = prefScore == null ? 0.14 * insp + 0.86 * taskScore : 0.12 * insp + 0.7 * taskScore + 0.18 * prefScore;
    const q = Math.round(clamp(quality, 0, 100));
    const stars = q >= 92 ? 5 : q >= 80 ? 4 : q >= 65 ? 3 : q >= 45 ? 2 : 1;
    return { quality: q, stars, inspection: insp, taskScore: Math.round(taskScore), prefScore: prefScore == null ? null : Math.round(prefScore), prefs, tasks: parts.tasks, missed: this.damages.filter((d) => d.missed).length, falseClicks: this.inspect.false, mistakes: parts.tasks.reduce((s, t) => s + t.mistakes, 0) + (this.inspect.false || 0) };
  }

  /** Live satisfaction estimate for the HUD. */
  liveQuality() {
    const tasks = this.tasks;
    const W = tasks.reduce((s, t) => s + (WEIGHT[t.kind] || 1), 0) || 1;
    const ts = tasks.reduce((s, t) => s + (t.done ? t.score : (t.progress || 0) * 70) * (WEIGHT[t.kind] || 1), 0) / W;
    const insp = this.inspect.done ? this.inspect.score : (100 * this.damages.filter((d) => d.found).length) / Math.max(1, this.damages.length);
    return Math.round(clamp(0.14 * insp + 0.86 * ts, 0, 100));
  }

  submit() {
    if (this.phase === "repair" && !this.finishRepairs()) return null;
    if (this.phase !== "customize") return null;
    this.phase = "done";
    this.result = this.evaluate();
    this.result.elapsed = this.elapsed;
    this.emit("phase", { phase: "done" });
    return this.result;
  }

  /* ======================================================== save / load */
  snapshot() {
    const m = this.model;
    const grime = {};
    const counts = {};
    for (const g of m.grime) {
      const key = `${g.part}#${(counts[g.part] = (counts[g.part] || 0) + 1)}`;
      grime[key] = rleQ(g.attr.array, 4, 3);
    }
    const hair = m.hair ? m.hair.locks.map((L) => [round2(L.tangle), round2(L.wet), round2(L.growth), L.present ? 1 : 0, L.washed ? 1 : 0]) : null;
    const tasks = this.tasks.map((t) => {
      const o = { ...t };
      if (o.fill) o.fill = o.fill.map(round2);
      return o;
    });
    return {
      v: 1,
      phase: this.phase,
      elapsed: Math.round(this.elapsed),
      inspect: { ...this.inspect },
      damages: this.damages.map((d) => [d.id, d.found ? 1 : 0, d.missed ? 1 : 0]),
      tasks,
      grime,
      hair,
      grid: this.grid ? { a: rleQ(this.grid.alpha, 1, 1, 255), c: rle8(this.grid.color) } : null,
      look: { ...m.look },
      eyes: { ...m.eyeColor },
      lookChanges: [...this.lookChanges],
      gloss: round2(m.gloss || 0),
      scratches: m.scratches.map((s) => round2(s.depth)),
      used: { ...this.used },
      shine: this.shine ? null : null,
      frozen: this.frozen || null,
    };
  }

  /** Re-apply a snapshot onto a freshly built model of the same order. */
  restore(snap) {
    if (!snap || snap.v !== 1) return false;
    applySnapshot(this.model, snap, this);
    this.phase = snap.phase;
    this.elapsed = snap.elapsed || 0;
    this.inspect = { ...this.inspect, ...snap.inspect };
    for (const [id, f, mi] of snap.damages || []) {
      const d = this.damages.find((x) => x.id === id);
      if (d) {
        d.found = !!f;
        d.missed = !!mi;
      }
    }
    this.grimeLeft = [0, 1, 2].map((c) => this.grimeRemaining(c));
    const byId = new Map((snap.tasks || []).map((t) => [t.id, t]));
    this.tasks = this.tasks.map((t) => (byId.has(t.id) ? { ...t, ...byId.get(t.id) } : t));
    // live crack visuals
    for (const t of this.tasksOf("crack")) {
      if (t.stage === "curing") t.stage = "cured";
      const res = t.stage === "polished" ? clamp(0.05 + 0.75 * (1 - (t.quality || 0.8)), 0.05, 0.85) : 1;
      this.model.setCrack(t.crack, { glue: t.stage === "polished" ? null : t.fill, stage: t.stage, residual: res });
    }
    for (const t of this.tasksOf("sew")) this.model.setTear(t.tear, t.next, t.done ? 1 : 0.65 * (t.next / this.model.tears[t.tear].path.length), this.sewQuality(t));
    if (this.grid && snap.grid) {
      unrleQ(snap.grid.a, this.grid.alpha, 1, 1, 255);
      unrle8(snap.grid.c, this.grid.color);
      this.refreshFace();
      this.updatePaintScores();
    }
    this.lookChanges = new Set(snap.lookChanges || []);
    this.used = { ...(snap.used || {}) };
    this.frozen = snap.frozen || null;
    this.tool = "hand";
    return true;
  }
}

/**
 * Apply saved restoration state to a model (also used by the gallery to
 * rebuild the "after" doll). Replaced parts are re-fitted, then grime, hair,
 * paint, scratches and gloss are restored.
 */
export function applySnapshot(model, snap, session = null) {
  if (!snap) return;
  // look first (customization rebuilds outfit/hair)
  if (snap.look) {
    const diff = {};
    for (const k of LOOK_KEYS) if (snap.look[k] && snap.look[k] !== model.look[k] && k !== "eyeColor") diff[k] = snap.look[k];
    if (Object.keys(diff).length) model.applyLook(diff);
  }
  // parts
  for (const t of snap.tasks || []) {
    if ((t.kind === "part" || t.kind === "button") && t.socket) {
      if (t.stage !== "broken" && model.sockets[t.socket] && (model.sockets[t.socket].kind === "arm" || model.sockets[t.socket].kind === "leg" || model.sockets[t.socket].kind === "eye" || model.sockets[t.socket].kind === "acc")) {
        if (!model.sockets[t.socket].open) model.detach(t.socket);
      }
      if ((t.done || t.stage === "sew") && t.partId) model.attach(t.socket, t.partId);
    }
  }
  // scratches
  (snap.scratches || []).forEach((d, i) => model.setScratch(i, d));
  // grime
  const counts = {};
  for (const g of model.grime) {
    const key = `${g.part}#${(counts[g.part] = (counts[g.part] || 0) + 1)}`;
    if (snap.grime && snap.grime[key]) {
      unrleQ(snap.grime[key], g.attr.array, 4, 3);
      g.attr.needsUpdate = true;
    } else if (snap.grime) {
      // a part fitted later (fresh, clean)
      g.attr.array.fill(0);
      g.attr.needsUpdate = true;
    }
  }
  if (model.hair && snap.hair && snap.hair.length === model.hair.locks.length) {
    snap.hair.forEach(([tg, wet, gr, pr, wa], i) => model.hair.setLock(i, { tangle: tg, wet, growth: gr, present: !!pr, washed: !!wa }));
    model.hair.flush();
  }
  if (snap.gloss) model.setGloss(snap.gloss);
  if (!session) {
    // gallery: crack + tear + paint visuals
    for (const t of snap.tasks || []) {
      if (t.kind === "crack") {
        const res = t.stage === "polished" ? clamp(0.05 + 0.75 * (1 - (t.quality || 0.8)), 0.05, 0.85) : 1;
        model.setCrack(t.crack, { glue: t.stage === "polished" ? null : t.fill, stage: t.stage, residual: res });
      }
      if (t.kind === "sew" && model.tears[t.tear]) model.setTear(t.tear, t.next, t.done ? 1 : 0, 1 - 0.45 * ((t.devs || []).reduce((a, b) => a + b, 0) / Math.max(1, (t.devs || []).length)));
    }
    if (snap.grid && model.face) {
      const grid = { alpha: new Float32Array(FACE.W * FACE.H), color: new Uint8Array(FACE.W * FACE.H) };
      unrleQ(snap.grid.a, grid.alpha, 1, 1, 255);
      unrle8(snap.grid.c, grid.color);
      model.face.setGrid(grid, PAINT_COLORS.map((c) => hexRgb(c.hex)));
    }
  }
}

/* --------------------------------------------------------- compression */
const round2 = (v) => Math.round(v * 100) / 100;
/** Run-length encode `n` channels of a strided float array quantized to 0..q. */
function rleQ(arr, stride, n, q = 15) {
  const out = [];
  let last = -1, run = 0;
  const count = arr.length / stride;
  for (let i = 0; i < count; i++) for (let c = 0; c < n; c++) {
    const v = Math.round(clamp(arr[i * stride + c], 0, 1) * q);
    if (v === last) run++;
    else {
      if (run) out.push(run, last);
      last = v;
      run = 1;
    }
  }
  if (run) out.push(run, last);
  return out.join(",");
}
function unrleQ(str, arr, stride, n, q = 15) {
  if (typeof str !== "string") return;
  const parts = str.split(",").map(Number);
  const count = arr.length / stride;
  let k = 0;
  for (let p = 0; p < parts.length; p += 2) {
    const run = parts[p], v = parts[p + 1] / q;
    for (let r = 0; r < run; r++, k++) {
      const i = Math.floor(k / n), c = k % n;
      if (i >= count) return;
      arr[i * stride + c] = v;
    }
  }
}
function rle8(arr) {
  const out = [];
  let last = -1, run = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === last) run++;
    else {
      if (run) out.push(run, last);
      last = arr[i];
      run = 1;
    }
  }
  if (run) out.push(run, last);
  return out.join(",");
}
function unrle8(str, arr) {
  if (typeof str !== "string") return;
  const parts = str.split(",").map(Number);
  let k = 0;
  for (let p = 0; p < parts.length; p += 2) for (let r = 0; r < parts[p] && k < arr.length; r++) arr[k++] = parts[p + 1];
}

export function hexRgb(hex) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export { sanitizeLook };
