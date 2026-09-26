/**
 * Car Wash Studio — one job in progress (pure JS, Node-importable).
 *
 * Owns every Surface of the vehicle (and interior, when the job has one),
 * the trash / crumb lists, stage latches, hint bookkeeping and per-job stats.
 * The React layer only forwards pointer strokes into `stroke()`, calls
 * `tick()` / `evaluate()` on a timer, and renders from the same surfaces.
 */
import { buildVehicle } from "./vehicleModel.js";
import { buildInterior } from "./interiorModel.js";
import { Surface } from "./surface.js";
import { generateDirt } from "./dirtGen.js";
import { generateInteriorDirt, generateTrash, generateCrumbs } from "./interiorDirt.js";
import { strokeRegion, TOOLS } from "./tools.js";
import { STAGES, OPTIONAL, EXTERIOR_ORDER, INTERIOR_ORDER } from "./stages.js";

const WET_FLOOR = 130;

export class JobSession {
  constructor(job, { toolLevel = 0 } = {}) {
    this.job = job;
    this.model = buildVehicle(job.vehicle);
    this.interior = job.interior ? buildInterior(job.interior, job.vehicle) : null;
    this.surfaces = {};
    this.panels = { ...this.model.panels, ...(this.interior ? this.interior.panels : {}) };
    for (const p of Object.values(this.model.panels)) {
      const s = new Surface(p);
      generateDirt(s, this.model, job.dirt, job.dirtSeed);
      this.surfaces[p.id] = s;
    }
    if (this.interior) {
      for (const p of Object.values(this.interior.panels)) {
        const s = new Surface(p);
        generateInteriorDirt(s, this.interior, job.interior, job.dirtSeed);
        this.surfaces[p.id] = s;
      }
      this.trash = generateTrash(this.interior, job.interior, job.dirtSeed);
      this.crumbs = generateCrumbs(this.interior, job.interior, job.dirtSeed);
    } else {
      this.trash = [];
      this.crumbs = [];
    }
    // initial dust mass (vacuum progress only counts dust — stains belong to the seats stage)
    for (const s of Object.values(this.surfaces)) {
      let d0 = 0;
      let s0 = 0;
      for (let i = 0; i < s.n; i++) {
        if (!s.valid[i]) continue;
        d0 += s.D[i];
        s0 += s.S[i];
      }
      s.dust0 = d0;
      s.stain0 = s0; // seats are judged on stains, not on dust the vacuum already took
    }
    // tire ring mask for tire shine
    for (const s of Object.values(this.surfaces)) {
      if (s.material !== "wheel") continue;
      const w = s.panel.wheel;
      s.ring = new Uint8Array(s.n);
      for (let v = 0; v < s.h; v++) {
        for (let u = 0; u < s.w; u++) {
          const [x, y] = s.posOf(u, v);
          const rr = Math.hypot(x - w.cx, y - w.cy);
          if (rr > w.rimR * 1.04 && rr < w.r * 0.97) s.ring[v * s.w + u] = 1;
        }
      }
    }
    this.required = job.stages.slice();
    this.optional = (job.optional || []).slice();
    this.done = {};
    this.optDone = {};
    this.fracs = {};
    this.summ = new Map();
    this.fades = [];
    this.hintsUsed = 0;
    this.completed = false;
    this.elapsed = 0;
    this.ctx = {
      water: 0, foam: 0, scrub: 0, dried: 0, polish: 0, vacuum: 0,
      rateMul: 1 + toolLevel * 0.08,
      polishRate: job.polishCoats >= 2 ? 0.55 : 1,
      polishTarget: job.polishCoats >= 2 ? 225 : 120,
      // without a scrub stage the pressure washer has to shift stuck dirt itself
      pwStuck: job.stages.includes("scrub") ? 0.18 : 0.8,
    };
    this.statsBase = { water: 0, foam: 0, scrub: 0, dried: 0, polish: 0, vacuum: 0 };
    this.wetClock = 0;
    this.lastEval = null;
  }

  /* ------------------------------------------------------------- views */

  /** regions for a view id. "wheel:<panelId>" = that wheel's side view. */
  viewRegions(view) {
    if (view.startsWith("wheel:")) {
      const panel = this.panels[view.slice(6)];
      return this.model.views[panel.primaryView].regions;
    }
    if (this.model.views[view]) return this.model.views[view].regions;
    if (this.interior && this.interior.views[view]) return this.interior.views[view].regions;
    return [];
  }

  wheelPanels() {
    return Object.values(this.model.panels).filter((p) => p.material === "wheel");
  }

  /* ----------------------------------------------------------- strokes */

  stroke(view, tool, x0, y0, x1, y1, r, dt) {
    if (this.completed) return { changed: false, code: 0 };
    let changed = false;
    let code = 0;
    let best = 0;
    for (const region of this.viewRegions(view)) {
      const s = this.surfaces[region.panel];
      if (!s) continue;
      const res = strokeRegion(s, region, tool, x0, y0, x1, y1, r, dt, this.ctx);
      if (!res) continue;
      if (res.changed) changed = true;
      if (res.code && res.codeAmount > best) {
        best = res.codeAmount;
        code = res.code;
      }
    }
    if (TOOLS[tool].mode === "spray" && tool === "vacuum") this.vacuumCrumbs(view, x1, y1, r, dt);
    // statistics are tool-time, not per-pixel sums (seconds of real use)
    if (changed) {
      const c = this.ctx;
      if (tool === "hose") c.water += dt;
      else if (tool === "pressure") c.water += dt * 0.8;
      else if (tool === "foam") c.foam += dt;
      else if (tool === "sponge") c.scrub += dt;
      else if (tool === "polisher") c.polish += dt;
      else if (tool === "vacuum") c.vacuum += dt;
      else if (tool === "towel") c.dried += dt;
    }
    // "wrong surface" only matters when the stroke achieved nothing at all —
    // wiping the edge of a window and brushing paint is not a mistake
    if (code === 5 && changed) code = 0;
    return { changed, code: changed && best < 0.02 ? 0 : code };
  }

  /** Crumbs within the nozzle get pulled in; returns removed count. */
  vacuumCrumbs(view, x, y, r, dt) {
    let n = 0;
    for (const c of this.crumbs) {
      if (!c.alive || c.view !== view) continue;
      const dx = x - c.x;
      const dy = y - c.y;
      const d = Math.hypot(dx, dy);
      if (d < r * 1.25) {
        // drift toward the nozzle, then disappear
        const k = Math.min(1, dt * 9);
        c.x += dx * k;
        c.y += dy * k;
        if (d < r * 0.45) {
          c.alive = false;
          c.pulled = 1;
          n++;
        }
      }
    }
    this.crumbsRemoved = (this.crumbsRemoved || 0) + n;
    return n;
  }

  pickTrash(view, x, y, r) {
    let best = null;
    let bd = Infinity;
    for (const t of this.trash) {
      if (t.removed || t.view !== view) continue;
      const d = Math.hypot(t.x - x, t.y - y);
      if (d < t.size * 0.75 + r * 0.4 && d < bd) {
        bd = d;
        best = t;
      }
    }
    if (best) best.removed = true;
    return best;
  }

  /* ------------------------------------------------------------- stats */

  takeStats() {
    const out = {};
    for (const k of Object.keys(this.statsBase)) {
      out[k] = this.ctx[k] - this.statsBase[k];
      this.statsBase[k] = this.ctx[k];
    }
    return out;
  }

  /* ------------------------------------------------------------ domains */

  domainSurfaces(domain) {
    const out = [];
    for (const s of Object.values(this.surfaces)) {
      const p = s.panel;
      const m = s.material;
      let ok = false;
      if (domain === "paint") ok = m === "paint";
      else if (domain === "glass") ok = m === "glass";
      else if (domain === "paintGlass") ok = m === "paint" || m === "glass";
      else if (domain === "wheel") ok = m === "wheel";
      else if (domain === "vacuum") ok = p.task === "floor" || (p.task === "seat" && m === "fabric");
      else if (domain === "dash") ok = p.task === "dash" || p.task === "vent";
      else if (domain === "seats") ok = p.task === "seat";
      else if (domain === "iglass") ok = p.task === "iglass";
      else if (domain === "grille") ok = p.id === "grille";
      else if (domain === "exhaust") ok = p.id === "exhaust";
      else if (domain === "cups") ok = p.task === "cups";
      else if (domain === "trunk") ok = p.task === "trunk";
      if (ok) out.push(s);
    }
    return out;
  }

  summary(s) {
    const c = this.summ.get(s.id);
    if (c && c.v === s.version) return c;
    const tgt = this.ctx.polishTarget;
    let rinsed = 0, foamed = 0, foamFree = 0, dry = 0, polished = 0, ringN = 0, shined = 0;
    let dirt = 0, stuck = 0, wheelRem = 0, glassRem = 0, intRem = 0, trimRem = 0, dustRem = 0, stainRem = 0;
    const { D, ML, MS, G, S, SM, W, R, F, FD, C, P, TS, valid, ring } = s;
    for (let i = 0; i < s.n; i++) {
      if (!valid[i]) continue;
      if (R[i] >= 110) rinsed++;
      if (F[i] >= 90) foamed++;
      if (F[i] < 30 && FD[i] < 30) foamFree++;
      if (W[i] <= 50) dry++;
      if (P[i] >= tgt) polished++;
      if (ring && ring[i]) {
        ringN++;
        if (TS[i] >= 120) shined++;
      }
      const d = D[i] + ML[i] + MS[i] + G[i] + S[i] + SM[i];
      dirt += d;
      stuck += MS[i] + G[i] + S[i];
      wheelRem += D[i] + ML[i] + MS[i] + G[i] + FD[i] + C[i] * 0.5;
      glassRem += SM[i] + D[i] + ML[i] + C[i] * 0.5 + F[i] * 0.3 + FD[i] * 0.5;
      intRem += D[i] + S[i] + SM[i] + C[i] * 0.5;
      trimRem += S[i] + G[i];
      dustRem += D[i];
      stainRem += S[i] + C[i] * 0.5;
    }
    const out = { v: s.version, n: s.validCount, rinsed, foamed, foamFree, dry, polished, ringN, shined, dirt, stuck, wheelRem, glassRem, intRem, trimRem, dustRem, stainRem };
    this.summ.set(s.id, out);
    return out;
  }

  pixFrac(domain, key) {
    let a = 0;
    let n = 0;
    for (const s of this.domainSurfaces(domain)) {
      const m = this.summary(s);
      a += m[key];
      n += m.n;
    }
    return n ? a / n : 1;
  }

  massFrac(domain, key, base = "dirt0") {
    let rem = 0;
    let b = 0;
    for (const s of this.domainSurfaces(domain)) {
      rem += this.summary(s)[key];
      b += base === "stuck0" ? s.stuck0 : base === "dust0" ? s.dust0 : base === "stain0" ? s.stain0 : s.dirt0;
    }
    if (b < 1) return 1;
    return Math.max(0, Math.min(1, 1 - rem / b));
  }

  wheelFracs() {
    const out = {};
    for (const s of this.domainSurfaces("wheel")) {
      const m = this.summary(s);
      out[s.id] = s.dirt0 < 1 ? 1 : Math.max(0, Math.min(1, 1 - m.wheelRem / s.dirt0));
    }
    return out;
  }

  stageFrac(id) {
    switch (id) {
      case "rinse": return this.pixFrac("paint", "rinsed");
      case "foam": return this.pixFrac("paint", "foamed");
      case "scrub": return this.massFrac("paint", "stuck", "stuck0");
      case "wash": return Math.min(this.massFrac("paint", "dirt"), this.pixFrac("paint", "foamFree"));
      case "wheels": {
        const w = Object.values(this.wheelFracs());
        return w.length ? w.reduce((a, b) => a + b, 0) / w.length : 1;
      }
      case "glass": return this.massFrac("glass", "glassRem");
      case "dry": return this.pixFrac("paintGlass", "dry");
      case "polish": return this.pixFrac("paint", "polished");
      case "trash": return this.trash.length ? this.trash.filter((t) => t.removed).length / this.trash.length : 1;
      case "vacuum": {
        const cr = this.crumbs.length ? this.crumbs.filter((c) => !c.alive).length / this.crumbs.length : 1;
        const cMain = this.crumbs.filter((c) => c.view !== "trunk");
        const crMain = cMain.length ? cMain.filter((c) => !c.alive).length / cMain.length : cr;
        return 0.5 * this.massFrac("vacuum", "dustRem", "dust0") + 0.5 * crMain;
      }
      case "dash": return this.massFrac("dash", "intRem");
      case "seats": {
        let st0 = 0;
        for (const q of this.domainSurfaces("seats")) st0 += q.stain0;
        return st0 > 255 * 20 ? this.massFrac("seats", "stainRem", "stain0") : this.massFrac("seats", "intRem");
      }
      case "iglass": return this.massFrac("iglass", "intRem");
      // optional
      case "grille": return this.massFrac("grille", "trimRem");
      case "exhaust": return this.massFrac("exhaust", "trimRem");
      case "tireShine": {
        let a = 0;
        let n = 0;
        for (const s of this.domainSurfaces("wheel")) {
          const m = this.summary(s);
          a += m.shined;
          n += m.ringN;
        }
        return n ? a / n : 1;
      }
      case "cups": return this.massFrac("cups", "intRem");
      case "trunk": {
        const tc = this.crumbs.filter((c) => c.view === "trunk");
        const cf = tc.length ? tc.filter((c) => !c.alive).length / tc.length : 1;
        return 0.5 * this.massFrac("trunk", "dustRem", "dust0") + 0.5 * cf;
      }
      default: return 1;
    }
  }

  /* ------------------------------------------------------------ stages */

  depsMet(def) {
    return def.deps.every((d) => !this.required.includes(d) || this.done[d]);
  }

  orderedRequired() {
    const order = [...EXTERIOR_ORDER, ...INTERIOR_ORDER];
    return order.filter((id) => this.required.includes(id));
  }

  currentStage() {
    for (const id of this.orderedRequired()) if (!this.done[id] && this.depsMet(STAGES[id])) return id;
    return null;
  }

  activeStages() {
    return this.orderedRequired().filter((id) => !this.done[id] && this.depsMet(STAGES[id]));
  }

  activeOptional() {
    return this.optional.filter((id) => !this.optDone[id] && OPTIONAL[id].deps.every((d) => !this.required.includes(d) || this.done[d]));
  }

  /** Measure everything; latch stages that crossed their threshold. */
  evaluate() {
    const justDone = [];
    for (const id of this.orderedRequired()) {
      const f = this.stageFrac(id);
      this.fracs[id] = f;
      const def = STAGES[id];
      if (!this.done[id] && this.depsMet(def) && f >= def.th - 1e-9) {
        this.done[id] = true;
        justDone.push(id);
        this.finishStage(id);
      }
    }
    const optJust = [];
    for (const id of this.optional) {
      const f = this.stageFrac(id);
      this.fracs[id] = f;
      const def = OPTIONAL[id];
      const ready = def.deps.every((d) => !this.required.includes(d) || this.done[d]);
      if (!this.optDone[id] && ready && f >= def.th) {
        this.optDone[id] = true;
        optJust.push(id);
        this.finishOptional(id);
      }
    }
    const wheels = this.wheelFracs();
    const allDone = this.orderedRequired().every((id) => this.done[id]);
    const optPending = this.optional.filter((id) => !this.optDone[id]);
    let completedNow = false;
    // with optional details left the player chooses when to finish
    if (allDone && !this.completed && (optPending.length === 0 || this.finishRequested)) {
      this.completed = true;
      completedNow = true;
    }
    const req = this.orderedRequired();
    const overall = req.length ? req.reduce((a, id) => a + (this.done[id] ? 1 : this.depsMet(STAGES[id]) ? Math.min(1, this.fracs[id] / STAGES[id].th) : 0), 0) / req.length : 1;
    this.lastEval = { fracs: { ...this.fracs }, done: { ...this.done }, optDone: { ...this.optDone }, justDone, optJust, wheels, overall, current: this.currentStage(), completedNow, allDone, optPending };
    return this.lastEval;
  }

  /** Player chose to wrap up with optional details still open. */
  requestFinish() {
    if (this.orderedRequired().every((id) => this.done[id])) this.finishRequested = true;
  }

  /** Clean the tiny leftovers of a finished stage (gentle fade, not a pop). */
  finishStage(id) {
    const fade = (domain, layers, steps = 8, filter = null) => {
      const surfs = this.domainSurfaces(domain).filter((s) => !filter || filter(s));
      this.fades.push({ surfs, layers, steps, left: steps });
    };
    if (id === "scrub") {
      for (const s of this.domainSurfaces("paint")) {
        for (let i = 0; i < s.n; i++) {
          const st = s.MS[i] + s.G[i] + s.S[i];
          if (st && s.valid[i]) {
            if (s.F[i] > 30) s.FD[i] = Math.min(255, s.FD[i] + st * 0.6);
            s.MS[i] = 0;
            s.G[i] = 0;
            s.S[i] = 0;
          }
        }
        s.markAll();
      }
    } else if (id === "wash") fade("paint", ["D", "ML", "MS", "G", "S", "F", "FD"]);
    else if (id === "wheels") fade("wheel", ["D", "ML", "MS", "G", "FD", "C"]);
    else if (id === "glass") fade("glass", ["SM", "C", "D", "ML", "F", "FD"]);
    else if (id === "dry") {
      fade("paintGlass", ["W"]);
      fade("wheel", ["W"]);
    } else if (id === "polish") {
      const tgt = this.ctx.polishTarget;
      for (const s of this.domainSurfaces("paint")) {
        for (let i = 0; i < s.n; i++) if (s.valid[i] && s.P[i] < tgt) s.P[i] = tgt;
        s.markAll();
      }
    } else if (id === "vacuum") {
      fade("vacuum", ["D"]);
      for (const c of this.crumbs) if (c.view !== "trunk") c.alive = false;
    } else if (id === "dash") fade("dash", ["D", "S", "C"]);
    else if (id === "seats") fade("seats", ["S", "C", "D"]);
    else if (id === "iglass") fade("iglass", ["SM", "C"]);
  }

  finishOptional(id) {
    const push = (domain, layers) => this.fades.push({ surfs: this.domainSurfaces(domain), layers, steps: 8, left: 8 });
    if (id === "grille") push("grille", ["S", "G", "D"]);
    else if (id === "exhaust") push("exhaust", ["G", "D"]);
    else if (id === "cups") push("cups", ["S", "C", "D"]);
    else if (id === "trunk") {
      push("trunk", ["D"]);
      for (const c of this.crumbs) if (c.view === "trunk") c.alive = false;
    } else if (id === "tireShine") {
      for (const s of this.domainSurfaces("wheel")) {
        for (let i = 0; i < s.n; i++) if (s.ring[i] && s.valid[i]) s.TS[i] = Math.max(s.TS[i], 150);
        s.markAll();
      }
    }
  }

  /* --------------------------------------------------------------- time */

  tick(dt) {
    this.elapsed += dt;
    // stage-finish fades
    for (const f of this.fades) {
      f.left--;
      const k = f.left <= 0 ? 0 : f.left / (f.left + 1);
      for (const s of f.surfs) {
        for (const L of f.layers) {
          const a = s[L];
          for (let i = 0; i < s.n; i++) if (a[i]) a[i] = (a[i] * k) | 0;
        }
        s.markAll();
      }
    }
    this.fades = this.fades.filter((f) => f.left > 0);
    // wet surfaces slowly dry — but only down to a damp floor; the towel finishes it
    this.wetClock += dt;
    if (this.wetClock >= 1) {
      this.wetClock = 0;
      for (const s of Object.values(this.surfaces)) {
        if (s.material === "paint" || s.material === "glass" || s.material === "wheel" || s.material === "trim") {
          const W = s.W;
          let any = false;
          for (let i = 0; i < s.n; i++) {
            if (W[i] > WET_FLOOR) {
              W[i] = Math.max(WET_FLOOR, W[i] - 5);
              any = true;
            }
          }
          if (any) s.markAll();
        }
      }
    }
  }

  /** Apply pending fades instantly (after a restore — nothing to animate). */
  flushFades() {
    for (const f of this.fades) {
      for (const s of f.surfs) {
        for (const L of f.layers) s[L].fill(0);
        s.markAll();
      }
    }
    this.fades = [];
  }

  /* -------------------------------------------------------------- hints */

  /** Where does the current stage (or optional task) still need work? */
  locate(stageId) {
    const def = STAGES[stageId] || OPTIONAL[stageId];
    if (!def) return null;
    if (stageId === "trash") {
      const t = this.trash.find((x) => !x.removed);
      return t ? { panel: null, view: t.view, x: t.x, y: t.y, text: "There's still some trash to bag." } : null;
    }
    let surfs;
    if (STAGES[stageId]) surfs = this.domainSurfaces(def.domain);
    else if (stageId === "tireShine") surfs = this.domainSurfaces("wheel");
    else surfs = this.domainSurfaces(stageId);
    let best = null;
    let bestN = 0;
    for (const s of surfs) {
      let n = 0;
      let sx = 0;
      let sy = 0;
      for (let v = 0; v < s.h; v++) {
        for (let u = 0; u < s.w; u++) {
          const i = v * s.w + u;
          if (s.valid[i] && def.need(s, i, this.ctx)) {
            n++;
            sx += u;
            sy += v;
          }
        }
      }
      if (n > bestN) {
        bestN = n;
        best = { s, u: sx / n, v: sy / n };
      }
    }
    if (stageId === "vacuum" || stageId === "trunk") {
      const c = this.crumbs.find((x) => x.alive && (stageId === "trunk" ? x.view === "trunk" : x.view !== "trunk"));
      if (c && (!best || bestN < 40)) return { panel: null, view: c.view, x: c.x, y: c.y, text: "A few crumbs are still hiding in there." };
    }
    if (!best) return null;
    const { s, u, v } = best;
    const [x, y] = s.posOf(u, v);
    const panel = s.panel;
    const vf = v / s.h;
    const part = vf > 0.62 ? "lower " : vf < 0.35 ? "upper " : "";
    let text;
    if (panel.material === "wheel") text = `The ${panel.label} still needs attention.`;
    else if (panel.material === "glass" || panel.task === "iglass") text = `The ${panel.label} has a few spots left.`;
    else text = `Check the ${part}${panel.label}.`;
    const view = panel.material === "wheel" ? `wheel:${panel.id}` : panel.primaryView;
    return { panel: panel.id, view, x, y, text };
  }

  /* ------------------------------------------------------------ results */

  results() {
    const ext = this.massFrac("paintGlass", "dirt");
    const wf = Object.values(this.wheelFracs());
    const wheels = wf.length ? wf.reduce((a, b) => a + b, 0) / wf.length : 1;
    const intSurfs = this.interior ? ["vacuum", "dash", "seats", "iglass"].filter((d) => this.required.includes(d) && this.domainSurfaces(d).length) : [];
    let interior = null;
    if (this.interior) {
      const vals = intSurfs.map((d) => (d === "vacuum" ? this.massFrac(d, "dustRem", "dust0") : d === "seats" ? this.stageFrac("seats") : this.massFrac(d, "intRem")));
      const tr = this.trash.length ? this.trash.filter((t) => t.removed).length / this.trash.length : 1;
      interior = (vals.reduce((a, b) => a + b, 0) + tr) / (vals.length + 1);
    }
    const parts = [ext, wheels];
    if (interior != null) parts.push(interior);
    const clean = parts.reduce((a, b) => a + b, 0) / parts.length;
    const optTotal = this.optional.length;
    const optDone = this.optional.filter((id) => this.optDone[id]).length;
    const optIds = this.optional.filter((id) => this.optDone[id]);
    return { cleanliness: clean, exterior: ext, wheels, interior, optDone, optTotal, optIds, hints: this.hintsUsed, time: this.elapsed };
  }

  /* ---------------------------------------------------------- save/load */

  serialize() {
    const B = 8;
    const surf = {};
    const REM = ["D", "ML", "MS", "G", "S", "SM"];
    const ADD = ["W", "R", "F", "FD", "C", "P", "TS"];
    for (const s of Object.values(this.surfaces)) {
      const cw = Math.ceil(s.w / B);
      const ch = Math.ceil(s.h / B);
      const enc = {};
      for (const L of [...REM, ...ADD]) {
        const a = s[L];
        let str = "";
        let nonTrivial = false;
        for (let cy = 0; cy < ch; cy++) {
          for (let cx = 0; cx < cw; cx++) {
            let sum = 0;
            let n = 0;
            for (let y = cy * B; y < Math.min(s.h, cy * B + B); y++) {
              for (let x = cx * B; x < Math.min(s.w, cx * B + B); x++) {
                const i = y * s.w + x;
                if (!s.valid[i]) continue;
                sum += a[i];
                n++;
              }
            }
            const avg = n ? sum / n : 0;
            const q = Math.round((avg / 255) * 15);
            if (q) nonTrivial = true;
            str += q.toString(16);
          }
        }
        if (nonTrivial) enc[L] = str;
      }
      surf[s.id] = enc;
    }
    return {
      v: 1,
      done: Object.keys(this.done).filter((k) => this.done[k]),
      optDone: Object.keys(this.optDone).filter((k) => this.optDone[k]),
      hints: this.hintsUsed,
      elapsed: Math.round(this.elapsed),
      trash: this.trash.filter((t) => t.removed).map((t) => t.id),
      crumbs: this.crumbs.map((c) => (c.alive ? 1 : 0)).join(""),
      surf,
    };
  }

  restore(data) {
    if (!data || data.v !== 1) return false;
    const B = 8;
    try {
      for (const s of Object.values(this.surfaces)) {
        const enc = data.surf?.[s.id];
        if (!enc) continue;
        const cw = Math.ceil(s.w / B);
        const ch = Math.ceil(s.h / B);
        for (const L of ["D", "ML", "MS", "G", "S", "SM", "W", "R", "F", "FD", "C", "P", "TS"]) {
          const str = enc[L];
          const a = s[L];
          const removal = ["D", "ML", "MS", "G", "S", "SM"].includes(L);
          // original per-cell averages, so removal layers restore as "fraction left of the real dirt"
          const cellVal = (cx, cy) => {
            if (!str) return 0;
            const c = Math.max(0, Math.min(cw - 1, cx));
            const r = Math.max(0, Math.min(ch - 1, cy));
            return (parseInt(str[r * cw + c], 16) / 15) * 255;
          };
          if (removal) {
            const orig = new Float32Array(cw * ch);
            const cnt = new Float32Array(cw * ch);
            for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
              const i = y * s.w + x;
              if (!s.valid[i]) continue;
              const k = ((y / B) | 0) * cw + ((x / B) | 0);
              orig[k] += a[i];
              cnt[k]++;
            }
            for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
              const i = y * s.w + x;
              const k = ((y / B) | 0) * cw + ((x / B) | 0);
              const o = cnt[k] ? orig[k] / cnt[k] : 0;
              const cur = cellVal((x / B) | 0, (y / B) | 0);
              const ratio = o > 0.5 ? Math.min(1, cur / o) : 0;
              a[i] = (a[i] * ratio) | 0;
            }
          } else {
            for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
              // bilinear between cell centers
              const fx = x / B - 0.5;
              const fy = y / B - 0.5;
              const x0 = Math.floor(fx);
              const y0 = Math.floor(fy);
              const tx = fx - x0;
              const ty = fy - y0;
              const val = cellVal(x0, y0) * (1 - tx) * (1 - ty) + cellVal(x0 + 1, y0) * tx * (1 - ty)
                + cellVal(x0, y0 + 1) * (1 - tx) * ty + cellVal(x0 + 1, y0 + 1) * tx * ty;
              a[y * s.w + x] = Math.min(255, val) | 0;
            }
          }
        }
        s.markAll();
      }
      for (const id of data.done || []) {
        this.done[id] = true;
        this.finishStage(id);
      }
      for (const id of data.optDone || []) {
        this.optDone[id] = true;
        this.finishOptional(id);
      }
      this.flushFades();
      this.hintsUsed = data.hints || 0;
      this.elapsed = data.elapsed || 0;
      const gone = new Set(data.trash || []);
      for (const t of this.trash) if (gone.has(t.id)) t.removed = true;
      if (typeof data.crumbs === "string" && data.crumbs.length === this.crumbs.length) {
        this.crumbs.forEach((c, i) => {
          c.alive = data.crumbs[i] === "1";
        });
      }
      return true;
    } catch {
      return false;
    }
  }
}
