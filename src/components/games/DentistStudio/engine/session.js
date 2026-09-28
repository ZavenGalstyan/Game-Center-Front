/**
 * Dentist Studio — one treatment (pure logic, no DOM; Node-importable).
 *
 * ONE SOURCE OF TRUTH: every tooth owns Uint8 cell layers and the renderer
 * paints straight from them, so if plaque is gone logically it is gone on
 * screen and vice versa.
 *
 *   P  soft plaque        Z  zone (0 open, 1 between teeth, 2 around bracket)
 *   T  thick buildup      K  buildup kind (0 plaque, 1 tartar)
 *   S  stain              SH stubborn stain
 *   C  cavity spot        CV cavity area       PR prepared  FI filling  SM smoothed
 *   D  dull film (polish removes it)
 *   F  foam   W  water   R  residue
 *   I  inspected (mirror) BR brushed    X blocked by a bracket    G grain
 *
 * Strokes are capsules (previous → current pointer) so fast movement never
 * leaves gaps. Procedures are an explicit, ordered state machine: a stage
 * latches only when its condition holds AND every earlier stage has latched,
 * and completion fires exactly once.
 */
import { buildMouth, allTeeth, buildGaps, dist2ToSeg, describeTooth, WORLD, KIND_LABEL } from "./geometry.js";
import { generateIssues } from "./issues.js";
import { TOOLS, STAGES, stageKind, CODES, OPTIONAL } from "./defs.js";

const LAYERS = ["P", "T", "K", "S", "SH", "C", "CV", "PR", "FI", "SM", "D", "F", "W", "R", "I", "BR", "Z", "X", "G"];
const SAVED = ["P", "T", "S", "C", "PR", "FI", "SM", "D", "F", "W", "R", "I", "BR"];

export const THRESH = { inspect: 0.5, plaque: 0.85, brushCover: 0.7, scale: 0.85, braces: 0.85, stains: 0.85, rinse: 0.82, suction: 0.8, cavity: 0.85, fill: 0.85, smooth: 0.85, polish: 0.72 };

/**
 * Relaxed difficulty: every tool works this much faster and reaches this much
 * further than its base values, so treatments stay quick and forgiving.
 */
export const EASE = { rate: 2, reach: 1.3 };

const SUMS = ["P", "PZ", "PB", "T", "S", "C", "PRc", "FIp", "SMp", "D", "F", "W", "R", "Ic", "BRc", "vc"];

function makeTooth(g) {
  const L = {};
  for (const k of LAYERS) L[k] = new Uint8Array(g.n);
  const t = { id: g.id, g, L, hidden: false, sums: {}, init: {}, dirty: true, flags: {}, checkT: 0, checked: false };
  t.sumOf = (key) => {
    let s = 0;
    const a = L[key];
    for (let k = 0; k < g.n; k++) s += a[k];
    return s;
  };
  return t;
}

function recount(t) {
  const g = t.g;
  const L = t.L;
  const s = t.sums;
  for (const k of SUMS) s[k] = 0;
  for (let k = 0; k < g.n; k++) {
    if (!g.valid[k] || L.X[k]) continue;
    s.vc++;
    const z = L.Z[k];
    if (z === 0) s.P += L.P[k];
    else if (z === 1) s.PZ += L.P[k];
    else s.PB += L.P[k];
    s.T += L.T[k];
    s.S += L.S[k];
    s.C += L.C[k];
    if (L.PR[k]) {
      s.PRc++;
      s.FIp += L.FI[k];
      s.SMp += L.SM[k];
    }
    s.D += L.D[k];
    s.F += L.F[k];
    s.W += L.W[k];
    s.R += L.R[k];
    if (L.I[k]) s.Ic++;
    if (L.BR[k]) s.BRc++;
  }
}

const clampByte = (v) => (v <= 0 ? 0 : v >= 255 ? 255 : v);

export class TreatmentSession {
  constructor(level) {
    this.level = level;
    this.mouth = buildMouth();
    this.teeth = allTeeth(this.mouth).map(makeTooth);
    this.byId = new Map(this.teeth.map((t) => [t.id, t]));
    this.gaps = buildGaps(this.mouth).map((gp) => ({ ...gp, listed: false, required: false, progress: 0, done: false, cells: [] }));
    this.debris = [];
    this.brackets = [];
    this.blobs = [];
    this.cavities = [];
    this.stainCount = 0;
    generateIssues(this, level);
    for (const t of this.teeth) recount(t);
    this.initTotals = this.totals();
    for (const t of this.teeth) t.init = { ...t.sums };

    this.stages = level.stages.slice();
    this.latched = [];
    this.peaks = {};
    this.pool = { water: 0, foam: 0, bits: [] };
    this.hintsUsed = 0;
    this.time = 0;
    this.activeT = 0;
    this.effT = 0;
    this.completed = false;
    this.events = [];
    this.floss = { gap: null, x: 0 };
    this.suctionAt = null;
    this.debrisRemoved = 0;
    this.chips = 0;
    this.evaluate();
    this.events.length = 0;
  }

  /* ------------------------------------------------------------ totals */

  totals() {
    const s = {};
    for (const k of SUMS) s[k] = 0;
    for (const t of this.teeth) for (const k of SUMS) s[k] += t.sums[k];
    return s;
  }

  get currentStage() {
    return this.stages[this.latched.length] || null;
  }

  isLatched(id) {
    return this.latched.includes(id);
  }

  hasStage(kind) {
    return this.stages.some((s) => stageKind(s) === kind);
  }

  toolsNeeded() {
    const set = new Set(this.stages.map((s) => STAGES[stageKind(s)].tool));
    return set;
  }

  foamMetric(T = this.totals()) {
    const vc = Math.max(1, T.vc) * 255;
    return T.F / vc + (T.R / vc) * 3;
  }

  wetMetric(T = this.totals()) {
    const vc = Math.max(1, T.vc) * 255;
    return (T.W / vc) * 1.2 + this.pool.water * 0.6 + this.pool.foam * 0.35 + this.pool.bits.length * 0.03;
  }

  /* ------------------------------------------------------------ strokes */

  /**
   * Apply `tool` along the capsule a→b (world units) for `dt` seconds.
   * `moving` false = pointer held still (scaled by the tool's `stationary`).
   * Returns what happened so the UI can react (particles, sounds, hints).
   */
  stroke(tool, ax, ay, bx, by, dt, moving = true) {
    const def = TOOLS[tool];
    const res = { touched: false, relevant: false, changed: false, effective: false, code: 0, scraped: 0, rinsed: 0, sucked: 0, polished: 0, brushed: 0, filled: 0 };
    if (!def || this.completed) return res;
    const rate = moving ? 1 : def.stationary;
    if (rate <= 0) return res;
    const DT = dt * rate * EASE.rate;
    const r = def.radius * EASE.reach;
    const r2 = r * r;
    const minX = Math.min(ax, bx) - r;
    const maxX = Math.max(ax, bx) + r;
    const minY = Math.min(ay, by) - r;
    const maxY = Math.max(ay, by) + r;
    const paste = tool === "brush" && this.hasStage("brush") && !this.isLatched(this.stages.find((s) => stageKind(s) === "brush"));
    const finalNow = stageKind(this.currentStage || "") === "final";

    for (const t of this.teeth) {
      const g = t.g;
      const bb = g.bbox;
      if (bb.maxX < minX || bb.minX > maxX || bb.maxY < minY || bb.minY > maxY) continue;
      const L = t.L;
      let touchedTooth = false;
      for (let k = 0; k < g.n; k++) {
        if (!g.valid[k] || L.X[k]) continue;
        const d2 = dist2ToSeg(g.cellX[k], g.cellY[k], ax, ay, bx, by);
        if (d2 >= r2) continue;
        touchedTooth = true;
        const f = 1 - 0.55 * (d2 / r2);
        const a = DT * f;
        switch (tool) {
          case "mirror":
            if (!L.I[k]) {
              L.I[k] = 255;
              res.effective = true;
            }
            break;
          case "brush": {
            const z = L.Z[k];
            if (L.P[k]) {
              if (z === 1) {
                L.P[k] = clampByte(L.P[k] - 30 * a);
                res.code |= CODES.GAP;
              } else if (z === 2) {
                L.P[k] = clampByte(L.P[k] - 40 * a);
                res.code |= CODES.BRACES;
              } else {
                L.P[k] = clampByte(L.P[k] - 1500 * a);
                res.effective = true;
                res.brushed++;
              }
            }
            if (L.T[k] > 30) res.code |= CODES.HARD;
            if (L.C[k] > 30) res.code |= CODES.CAVITY;
            if (L.S[k] && !L.SH[k]) L.S[k] = clampByte(L.S[k] - 40 * a);
            if (!L.BR[k] && f > 0.45) {
              L.BR[k] = 255;
              res.effective = true;
            }
            if (paste) L.F[k] = Math.min(235, L.F[k] + 700 * a);
            break;
          }
          case "bracesBrush":
            if (L.P[k]) {
              if (L.Z[k] === 2) {
                L.P[k] = clampByte(L.P[k] - 950 * a);
                res.effective = true;
              } else if (L.Z[k] === 0) {
                L.P[k] = clampByte(L.P[k] - 500 * a);
                res.effective = true;
              } else res.code |= CODES.GAP;
            }
            if (L.T[k] > 30) res.code |= CODES.HARD;
            break;
          case "scaler":
            if (L.T[k]) {
              const before = L.T[k];
              L.T[k] = clampByte(before - (L.K[k] ? 200 : 360) * a);
              res.scraped += before - L.T[k];
              res.effective = true;
            }
            if (L.P[k] && L.Z[k] === 0) {
              L.P[k] = clampByte(L.P[k] - 420 * a);
              res.effective = true;
            }
            if (L.C[k] > 30) res.code |= CODES.CAVITY;
            break;
          case "water": {
            if (L.F[k] || L.R[k]) {
              const before = L.F[k] + L.R[k];
              L.F[k] = clampByte(L.F[k] - 1100 * a);
              L.R[k] = clampByte(L.R[k] - 1100 * a);
              res.rinsed += before - L.F[k] - L.R[k];
              res.effective = true;
            }
            L.W[k] = Math.min(255, L.W[k] + 700 * a);
            break;
          }
          case "suction":
            if (L.W[k] || L.F[k]) {
              const before = L.W[k] + L.F[k];
              L.W[k] = clampByte(L.W[k] - 1500 * a);
              L.F[k] = clampByte(L.F[k] - 500 * a);
              res.sucked += before - L.W[k] - L.F[k];
              res.effective = true;
            }
            break;
          case "polisher": {
            if (L.T[k] > 25) {
              res.code |= CODES.HARD;
              break;
            }
            if (L.C[k] > 25) {
              res.code |= CODES.CAVITY;
              break;
            }
            if (L.PR[k] && L.SM[k] < 200) {
              res.code |= CODES.FILLING;
              break;
            }
            // plaque hiding BETWEEN teeth (floss zone) doesn't block polishing the face
            if (L.P[k] > 25 && L.Z[k] !== 1) {
              res.code |= L.Z[k] === 2 ? CODES.BRACES : CODES.DIRTY;
              break;
            }
            if (L.S[k]) {
              L.S[k] = clampByte(L.S[k] - (L.SH[k] ? 70 : 520) * a);
              if (L.SH[k]) res.code |= CODES.STUBBORN;
              res.effective = true;
            } else if (L.D[k]) {
              L.D[k] = clampByte(L.D[k] - 560 * a);
              res.polished++;
              res.effective = true;
            }
            break;
          }
          case "stainBrush":
            if (L.S[k]) {
              L.S[k] = clampByte(L.S[k] - (L.SH[k] ? 430 : 620) * a);
              res.effective = true;
            }
            if (L.P[k] && L.Z[k] === 0) L.P[k] = clampByte(L.P[k] - 300 * a);
            break;
          case "cavity":
            if (L.C[k]) {
              L.C[k] = clampByte(L.C[k] - 340 * a);
              res.effective = true;
              res.scraped += 1;
              if (!L.C[k] && L.CV[k]) {
                L.PR[k] = 255;
                L.R[k] = Math.max(L.R[k], 150);
              }
            }
            break;
          case "filler":
            if (L.PR[k]) {
              if (L.FI[k] < 255) {
                L.FI[k] = Math.min(255, L.FI[k] + 560 * a);
                res.filled++;
                res.effective = true;
              }
            } else if (L.C[k] > 20) res.code |= CODES.NOTPREP;
            break;
          case "smoother":
            if (L.PR[k]) {
              if (L.FI[k] < 180) res.code |= CODES.NOTFILLED;
              else if (L.SM[k] < 255) {
                L.SM[k] = Math.min(255, L.SM[k] + 520 * a);
                res.effective = true;
              }
            } else if (L.C[k] > 20) res.code |= CODES.NOTPREP;
            break;
          default:
            break;
        }
      }
      if (touchedTooth) {
        res.touched = true;
        // precision: was the tool working on a tooth that still needed it?
        if (!res.relevant) res.relevant = this.needs(t, tool);
        t.dirty = true;
        recount(t);
        this.toothAutoClear(t);
        if (tool === "mirror" && finalNow) this.checkTooth(t, dt);
      }
    }

    if (tool === "mirror") this.revealDebris(ax, ay, bx, by, r + 8);
    if (tool === "water") this.waterPool(bx, by, dt, res);
    if (tool === "suction") this.suctionAt = { x: bx, y: by, dt };

    if (res.effective || res.rinsed || res.sucked) res.changed = true;
    return res;
  }

  /** Does tooth t still have work for this tool? (sums are pre-stroke-safe enough for precision) */
  needs(t, tool) {
    const s = t.sums;
    switch (tool) {
      case "brush":
        return s.P > 0 || s.BRc < s.vc;
      case "bracesBrush":
        return s.PB > 0 || s.P > 0;
      case "scaler":
        return s.T > 0;
      case "polisher":
        return s.D > 0 || s.S > 0;
      case "stainBrush":
        return s.S > 0;
      case "cavity":
        return s.C > 0;
      case "filler":
        return s.PRc > 0 && s.FIp < s.PRc * 255;
      case "smoother":
        return s.PRc > 0 && s.SMp < s.PRc * 255;
      default:
        return true;
    }
  }

  /** Per-tooth finishing touches: tiny leftovers vanish, a finished tooth sparkles. */
  toothAutoClear(t) {
    const s = t.sums;
    const i = t.init;
    const L = t.L;
    const g = t.g;
    const each = (fn) => {
      for (let k = 0; k < g.n; k++) if (g.valid[k] && !L.X[k]) fn(k);
    };
    let changed = false;
    if (i.P > 0 && s.P > 0 && s.P <= i.P * 0.3) {
      each((k) => {
        if (L.Z[k] === 0) L.P[k] = 0;
      });
      changed = true;
      if (!t.flags.plaque) {
        t.flags.plaque = true;
        this.events.push({ type: "toothClean", tooth: t.id, x: g.x, y: g.yGum + g.dir * g.h * g.sy * 0.5 });
      }
    }
    if (i.T > 0 && s.T > 0 && s.T <= i.T * 0.3) {
      each((k) => (L.T[k] = 0));
      changed = true;
    }
    for (const b of this.blobs) {
      if (b.broken || b.tooth !== t.id) continue;
      let rem = 0;
      for (const k of b.cells) rem += L.T[k];
      if (rem <= b.total * 0.65) {
        for (const k of b.cells) L.T[k] = 0;
        b.broken = true;
        changed = true;
        this.chips++;
        this.events.push({ type: "chip", tooth: t.id, x: b.x, y: b.y, kind: b.kind });
        this.addPoolBits(b.kind === "tartar" ? 2 : 1, b.kind);
      }
    }
    if (i.S > 0 && s.S > 0 && s.S <= i.S * 0.3) {
      each((k) => (L.S[k] = 0));
      changed = true;
    }
    if (i.C > 0 && s.C > 0 && s.C <= i.C * 0.3) {
      each((k) => {
        L.C[k] = 0;
        if (L.CV[k]) {
          L.PR[k] = 255;
          L.R[k] = Math.max(L.R[k], 150);
        }
      });
      changed = true;
    }
    if (s.PRc > 0 && s.FIp < s.PRc * 255 && s.FIp >= s.PRc * 255 * 0.75) {
      each((k) => {
        if (L.PR[k]) L.FI[k] = 255;
      });
      changed = true;
    }
    if (s.PRc > 0 && s.SMp < s.PRc * 255 && s.SMp >= s.PRc * 255 * 0.75) {
      each((k) => {
        if (L.PR[k]) L.SM[k] = 255;
      });
      changed = true;
    }
    if (s.vc && s.BRc < s.vc && s.BRc >= s.vc * 0.7) {
      each((k) => (L.BR[k] = 255));
      changed = true;
    }
    if (s.vc && s.Ic < s.vc && s.Ic >= s.vc * 0.55) {
      each((k) => (L.I[k] = 255));
      changed = true;
    }
    // polish: once a tooth is nearly all polished, finish its clean cells
    const pol = s.vc ? 1 - s.D / (255 * s.vc) : 1;
    if (pol >= 0.75 && s.D > 0) {
      each((k) => {
        if ((!L.P[k] || L.Z[k] === 1) && !L.T[k] && !L.C[k] && !L.S[k] && (!L.PR[k] || L.SM[k] >= 200)) L.D[k] = 0;
      });
      changed = true;
      if (!t.flags.polished) {
        t.flags.polished = true;
        this.events.push({ type: "toothPolished", tooth: t.id, x: g.x, y: g.yGum + g.dir * g.h * g.sy * 0.45 });
      }
    }
    if (changed) {
      t.dirty = true;
      recount(t);
    }
  }

  revealDebris(ax, ay, bx, by, r) {
    for (const d of this.debris) {
      if (d.revealed || d.removed) continue;
      if (dist2ToSeg(d.x, d.y, ax, ay, bx, by) < r * r) {
        d.revealed = true;
        this.events.push({ type: "reveal", x: d.x, y: d.y });
      }
    }
  }

  checkTooth(t, dt) {
    if (t.checked) return;
    t.checkT += dt;
    if (t.checkT >= 0.1) t.checked = true;
  }

  /* ------------------------------------------------------------ pool */

  addPoolBits(n, kind) {
    const P = this.mouth.pool;
    for (let i = 0; i < n; i++) {
      const x = P.cx + (Math.random() - 0.5) * 160;
      this.pool.bits.push({ x, y: P.cy - 40, tx: x, ty: P.cy + (Math.random() - 0.5) * 16, vx: 0, vy: 0, kind, r: 3 + Math.random() * 1.6, sucked: false });
    }
  }

  waterPool(x, y, dt, res) {
    const M = this.mouth.mouth;
    const nx = (x - M.cx) / M.rx;
    const ny = (y - M.cy) / (y < M.cy ? M.ryTop : M.ryBot);
    if (nx * nx + ny * ny > 1.1) return;
    this.pool.water = Math.min(1, this.pool.water + 0.16 * dt);
    if (res.rinsed) this.pool.foam = Math.min(1, this.pool.foam + res.rinsed / (255 * 900));
  }

  /** Per-frame: pool bits settle; suction pulls water, foam and bits in. */
  tick(dt) {
    this.time += dt;
    const P = this.mouth.pool;
    const sa = this.suctionAt;
    this.suctionAt = null;
    let sucked = 0;
    if (sa) {
      const dx = (sa.x - P.cx) / (70 + 150 * Math.max(this.pool.water, 0.3));
      const dy = (sa.y - P.cy) / 42;
      if (dx * dx + dy * dy < 1.6 && (this.pool.water > 0 || this.pool.foam > 0)) {
        const before = this.pool.water + this.pool.foam;
        this.pool.water = Math.max(0, this.pool.water - 1.4 * dt);
        this.pool.foam = Math.max(0, this.pool.foam - 1.6 * dt);
        sucked = before - this.pool.water - this.pool.foam;
      }
    }
    for (const b of this.pool.bits) {
      if (sa) {
        const dx = sa.x - b.x;
        const dy = sa.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d < 95) {
          const pull = (1 - d / 95) * 900;
          b.vx += (dx / (d || 1)) * pull * dt;
          b.vy += (dy / (d || 1)) * pull * dt;
          if (d < 12) b.sucked = true;
        }
      }
      b.vx += (b.tx - b.x) * 6 * dt;
      b.vy += (b.ty - b.y) * 6 * dt;
      b.vx *= 1 - Math.min(1, 5 * dt);
      b.vy *= 1 - Math.min(1, 5 * dt);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    const before = this.pool.bits.length;
    if (before) this.pool.bits = this.pool.bits.filter((b) => !b.sucked);
    const slurped = before - this.pool.bits.length;
    if (slurped) this.events.push({ type: "slurp", n: slurped });
    return sucked;
  }

  /* ------------------------------------------------------------ debris */

  grab(x, y) {
    let best = null;
    let bd = Infinity;
    for (const d of this.debris) {
      if (d.removed || !d.revealed) continue;
      const dd = Math.hypot(d.x - x, d.y - y);
      if (dd < d.size + TOOLS.tweezers.radius * EASE.reach && dd < bd) {
        best = d;
        bd = dd;
      }
    }
    if (best) best.grabbed = true;
    return best;
  }

  /** Tug a grabbed bit; past the pull distance it pops out (counted once). */
  tug(d, x, y) {
    if (!d || d.removed) return { popped: false, pull: 0 };
    const pull = Math.hypot(x - d.x, y - d.y);
    if (pull > 16) {
      d.removed = true;
      d.grabbed = false;
      this.debrisRemoved++;
      this.effT += 0.3;
      this.events.push({ type: "debris", id: d.id, optional: d.optional });
      return { popped: true, pull };
    }
    return { popped: false, pull };
  }

  releaseGrab(d) {
    if (d) d.grabbed = false;
  }

  /* ------------------------------------------------------------ floss */

  flossMove(ax, ay, bx, by) {
    const F = this.floss;
    const out = { snapped: false, x: bx, travel: 0, done: false };
    if (F.gap && F.gap.done) F.gap = null;
    if (!F.gap) {
      let best = null;
      let bd = 42;
      for (const gp of this.gaps) {
        if (!gp.listed || gp.done) continue;
        if (by < gp.yMin - 40 || by > gp.yMax + 40) continue;
        const d = Math.abs(bx - gp.x);
        if (d < bd) {
          bd = d;
          best = gp;
        }
      }
      if (best) {
        F.gap = best;
        this.events.push({ type: "flossSnap", x: best.x, y: (best.yMin + best.yMax) / 2 });
      }
    } else if (Math.abs(bx - F.gap.x) > 60) {
      F.gap = null;
    }
    if (!F.gap) return out;
    const gp = F.gap;
    out.snapped = true;
    out.x = gp.x;
    const ya = Math.max(gp.yMin, Math.min(gp.yMax, ay));
    const yb = Math.max(gp.yMin, Math.min(gp.yMax, by));
    const travel = Math.abs(yb - ya);
    out.travel = travel;
    if (travel > 0.3) {
      gp.progress = Math.min(1, gp.progress + travel / ((gp.yMax - gp.yMin) * 1.4));
      for (const [t, k, v0] of gp.cells) {
        const target = Math.round(v0 * (1 - gp.progress));
        if (t.L.P[k] > target) {
          t.L.P[k] = target;
          t.dirty = true;
        }
      }
      if (gp.progress >= 1) {
        gp.done = true;
        for (const [t, k] of gp.cells) t.L.P[k] = 0;
        for (const d of this.debris) {
          if (!d.removed && d.gap === gp.id) {
            d.removed = true;
            this.debrisRemoved++;
            this.events.push({ type: "debris", id: d.id, optional: d.optional, viaFloss: true });
          }
        }
        this.events.push({ type: "flossDone", x: gp.x, y: (gp.yMin + gp.yMax) / 2, gap: gp.id });
        F.gap = null;
        out.done = true;
      }
      for (const id of [gp.a, gp.b]) recount(this.byId.get(id));
    }
    return out;
  }

  /* ------------------------------------------------------------ metrics */

  /** Is the current step's tool being used usefully? (precision) */
  track(dt, effective) {
    this.activeT += dt;
    if (effective) this.effT += dt;
  }

  precision() {
    if (this.activeT < 1) return 1;
    return Math.max(0, Math.min(1, this.effT / this.activeT));
  }

  zoneState() {
    const up = this.teeth.filter((t) => t.g.jaw === "upper");
    const lo = this.teeth.filter((t) => t.g.jaw === "lower");
    const le = this.teeth.filter((t) => t.g.x < WORLD.cx - 60);
    const ri = this.teeth.filter((t) => t.g.x > WORLD.cx + 60);
    const f = (list) => list.filter((t) => t.checked).length / list.length;
    return { upper: f(up), lower: f(lo), left: f(le), right: f(ri) };
  }

  tidy(T = this.totals()) {
    return this.foamMetric(T) < 0.02 && this.wetMetric(T) < 0.05 && this.pool.bits.length === 0;
  }

  /** progress 0..1 and done flag for a stage id, from the live cell state */
  stageState(id, T = this.totals()) {
    const kind = stageKind(id);
    const I = this.initTotals;
    const frac = (rem, init) => (init > 0 ? 1 - rem / init : 1);
    const vc = Math.max(1, T.vc);
    switch (kind) {
      case "inspect": {
        const c = T.Ic / vc;
        return { frac: Math.min(1, c / THRESH.inspect), done: c >= THRESH.inspect };
      }
      case "debris": {
        const req = this.debris.filter((d) => !d.optional);
        const rem = req.filter((d) => !d.removed).length;
        return { frac: req.length ? 1 - rem / req.length : 1, done: rem === 0 };
      }
      case "brush": {
        const cov = T.BRc / vc;
        const pl = frac(T.P, I.P);
        return {
          frac: Math.min(1, cov / THRESH.brushCover) * 0.5 + Math.min(1, pl / THRESH.plaque) * 0.5,
          done: cov >= THRESH.brushCover && pl >= THRESH.plaque,
        };
      }
      case "scale":
      case "tartar": {
        const v = frac(T.T, I.T);
        return { frac: Math.min(1, v / THRESH.scale), done: v >= THRESH.scale };
      }
      case "floss": {
        const req = this.gaps.filter((g) => g.required);
        const sum = req.reduce((a, g) => a + g.progress, 0);
        return { frac: req.length ? sum / req.length : 1, done: req.every((g) => g.done) };
      }
      case "braces": {
        const v = frac(T.PB, I.PB);
        return { frac: Math.min(1, v / THRESH.braces), done: v >= THRESH.braces };
      }
      case "stains": {
        const v = frac(T.S, I.S);
        return { frac: Math.min(1, v / THRESH.stains), done: v >= THRESH.stains };
      }
      case "rinse": {
        const m = this.foamMetric(T);
        const pk = Math.max(this.peaks[id] || 0, m);
        const v = pk > 0.003 ? 1 - m / pk : 1;
        return { frac: Math.min(1, v / THRESH.rinse), done: v >= THRESH.rinse || m < 0.003, metric: m };
      }
      case "suction": {
        const m = this.wetMetric(T);
        const pk = Math.max(this.peaks[id] || 0, m);
        const v = pk > 0.01 ? 1 - m / pk : 1;
        return { frac: Math.min(1, v / THRESH.suction), done: v >= THRESH.suction || m < 0.01, metric: m };
      }
      case "cavity": {
        const v = frac(T.C, I.C);
        return { frac: Math.min(1, v / THRESH.cavity), done: v >= THRESH.cavity };
      }
      case "fill": {
        const v = T.PRc ? T.FIp / (255 * T.PRc) : 0;
        // no cavity at all (bad data) must never deadlock the treatment
        if (!I.C && !T.PRc) return { frac: 1, done: true };
        return { frac: Math.min(1, v / THRESH.fill), done: T.PRc > 0 && v >= THRESH.fill };
      }
      case "smooth": {
        const v = T.PRc ? T.SMp / (255 * T.PRc) : 0;
        if (!I.C && !T.PRc) return { frac: 1, done: true };
        return { frac: Math.min(1, v / THRESH.smooth), done: T.PRc > 0 && v >= THRESH.smooth };
      }
      case "polish": {
        const pol = 1 - T.D / (255 * vc);
        const st = this.hasStage("stains") ? 1 : frac(T.S, I.S);
        const f = Math.min(1, pol / THRESH.polish) * (I.S > 0 && !this.hasStage("stains") ? 0.75 : 1) + (I.S > 0 && !this.hasStage("stains") ? Math.min(1, st / THRESH.stains) * 0.25 : 0);
        return { frac: f, done: pol >= THRESH.polish && st >= THRESH.stains };
      }
      case "final": {
        const z = this.zoneState();
        const zf = Object.values(z).reduce((a, v) => a + Math.min(1, v / 0.3), 0) / 4;
        const tidy = this.tidy(T);
        return { frac: zf * (tidy ? 1 : 0.9), done: zf >= 1 && tidy, zones: z, tidy };
      }
      default:
        return { frac: 1, done: true };
    }
  }

  /** Clean up the last fragments once a stage's threshold is reached. */
  autoClear(id) {
    const kind = stageKind(id);
    const each = (fn) => {
      for (const t of this.teeth) {
        const g = t.g;
        for (let k = 0; k < g.n; k++) if (g.valid[k] && !t.L.X[k]) fn(t.L, k);
        t.dirty = true;
      }
    };
    switch (kind) {
      case "inspect":
        each((L, k) => (L.I[k] = 255));
        for (const t of this.teeth) t.hidden = false;
        break;
      case "brush":
        each((L, k) => {
          if (L.Z[k] === 0) L.P[k] = 0;
          L.BR[k] = 255;
        });
        break;
      case "scale":
      case "tartar":
        each((L, k) => (L.T[k] = 0));
        for (const b of this.blobs) b.broken = true;
        break;
      case "braces":
        each((L, k) => {
          if (L.Z[k] === 2) L.P[k] = 0;
        });
        break;
      case "stains":
        each((L, k) => (L.S[k] = 0));
        break;
      case "rinse":
        each((L, k) => {
          L.F[k] = 0;
          L.R[k] = 0;
        });
        break;
      case "suction":
        each((L, k) => (L.W[k] = 0));
        this.pool.water = 0;
        this.pool.foam = 0;
        if (this.pool.bits.length) this.events.push({ type: "slurp", n: this.pool.bits.length });
        this.pool.bits = [];
        break;
      case "cavity":
        each((L, k) => {
          L.C[k] = 0;
          if (L.CV[k] && !L.PR[k]) {
            L.PR[k] = 255;
            L.R[k] = Math.max(L.R[k], 150);
          }
        });
        break;
      case "fill":
        each((L, k) => {
          if (L.PR[k]) L.FI[k] = 255;
        });
        break;
      case "smooth":
        each((L, k) => {
          if (L.PR[k]) L.SM[k] = 255;
        });
        break;
      case "polish":
        for (const t of this.teeth) {
          const s = t.sums;
          const pol = s.vc ? 1 - s.D / (255 * s.vc) : 1;
          if (pol >= 0.5) {
            const g = t.g;
            const L = t.L;
            for (let k = 0; k < g.n; k++) if (g.valid[k] && (!L.P[k] || L.Z[k] === 1) && !L.T[k] && !L.C[k]) L.D[k] = 0;
            t.flags.polished = true;
          }
          if (!this.hasStage("stains")) {
            const g = t.g;
            for (let k = 0; k < g.n; k++) t.L.S[k] = 0;
          }
          t.dirty = true;
        }
        break;
      default:
        break;
    }
    for (const t of this.teeth) recount(t);
  }

  /** Latch finished stages in order; fire completion exactly once. */
  evaluate() {
    let T = this.totals();
    const cur = this.currentStage;
    if (cur) {
      const k = stageKind(cur);
      if (k === "rinse") this.peaks[cur] = Math.max(this.peaks[cur] || 0, this.foamMetric(T));
      if (k === "suction") this.peaks[cur] = Math.max(this.peaks[cur] || 0, this.wetMetric(T));
    }
    let guard = 0;
    while (this.currentStage && guard++ < 32) {
      const id = this.currentStage;
      const st = this.stageState(id, T);
      if (!st.done) break;
      this.autoClear(id);
      this.latched.push(id);
      this.events.push({ type: "stage", id });
      T = this.totals();
      const next = this.currentStage;
      if (next) {
        const k = stageKind(next);
        if (k === "rinse") this.peaks[next] = Math.max(this.peaks[next] || 0, this.foamMetric(T));
        if (k === "suction") this.peaks[next] = Math.max(this.peaks[next] || 0, this.wetMetric(T));
        if (k === "final") for (const t of this.teeth) {
          t.checked = false;
          t.checkT = 0;
        }
      }
    }
    if (!this.currentStage && !this.completed) {
      this.completed = true;
      this.events.push({ type: "complete" });
    }
    return T;
  }

  /** overall 0..1 treatment progress (stage-weighted) */
  progress(T = this.totals()) {
    const n = this.stages.length;
    if (!this.currentStage) return 1;
    const st = this.stageState(this.currentStage, T);
    return Math.min(1, (this.latched.length + Math.max(0, Math.min(1, st.frac))) / n);
  }

  /** How clean the mouth actually is right now (0..1), from the real cell state. */
  cleanliness(T = this.totals()) {
    const I = this.initTotals;
    const parts = [];
    const plaqueInit = I.P + I.PZ + I.PB;
    if (plaqueInit > 0) parts.push([3, 1 - (T.P + T.PZ + T.PB) / plaqueInit]);
    if (I.T > 0) parts.push([2.5, 1 - T.T / I.T]);
    if (I.S > 0) parts.push([2, 1 - T.S / I.S]);
    if (this.debris.length) parts.push([1.5, this.debris.filter((d) => d.removed).length / this.debris.length]);
    if (I.C > 0) {
      const prep = 1 - T.C / I.C;
      const fill = T.PRc ? T.FIp / (255 * T.PRc) : 0;
      const sm = T.PRc ? T.SMp / (255 * T.PRc) : 0;
      parts.push([2.5, (prep + fill + sm) / 3]);
    }
    if (this.hasStage("polish")) parts.push([2, 1 - T.D / (255 * Math.max(1, T.vc))]);
    const listedGaps = this.gaps.filter((g) => g.listed);
    if (listedGaps.length) parts.push([1, listedGaps.filter((g) => g.done).length / listedGaps.length]);
    if (this.hasStage("rinse")) parts.push([1, 1 - Math.min(1, (this.foamMetric(T) + this.wetMetric(T)) * 3)]);
    const w = parts.reduce((a, p) => a + p[0], 0);
    const v = parts.reduce((a, p) => a + p[0] * Math.max(0, Math.min(1, p[1])), 0) / (w || 1);
    return Math.max(0, Math.min(1, v));
  }

  optionalStatus() {
    return (this.level.optional || []).map((id) => {
      let done = false;
      if (id === "hiddenDebris") {
        const hid = this.debris.filter((d) => d.optional);
        done = hid.length > 0 && hid.every((d) => d.removed);
      } else if (id === "polishAll") {
        done = this.teeth.every((t) => (t.sums.vc ? 1 - t.sums.D / (255 * t.sums.vc) : 1) >= 0.9);
      } else if (id === "flossAll") {
        const listed = this.gaps.filter((g) => g.listed);
        done = listed.length > 0 && listed.every((g) => g.done);
      } else if (id === "precise") {
        done = this.precision() >= 0.5;
      }
      return { id, label: OPTIONAL[id]?.label || id, done };
    });
  }

  /** Final result — read once at completion. */
  result() {
    const T = this.totals();
    const opt = this.optionalStatus();
    const I = this.initTotals;
    const teethTreated = this.teeth.filter((t) => t.init.P + t.init.PZ + t.init.PB + t.init.T + t.init.S + t.init.C > 0).length;
    return {
      cleanliness: this.cleanliness(T),
      precision: this.precision(),
      procedures: this.latched.length,
      proceduresTotal: this.stages.length,
      optional: opt,
      optDone: opt.filter((o) => o.done).length,
      optTotal: opt.length,
      hints: this.hintsUsed,
      time: this.time,
      counts: {
        teethCleaned: teethTreated,
        plaque: this.blobs.filter((b) => b.kind === "plaque").length + this.teeth.filter((t) => t.init.P > 0).length,
        tartar: this.blobs.filter((b) => b.kind === "tartar").length,
        stains: I.S > 0 ? this.stainCount : 0,
        debris: this.debrisRemoved,
        polished: this.teeth.filter((t) => (t.sums.vc ? 1 - t.sums.D / (255 * t.sums.vc) : 1) >= 0.9).length,
        flossed: this.gaps.filter((g) => g.done).length,
        cavities: this.cavities.length,
        braces: this.brackets.length ? 1 : 0,
      },
    };
  }

  /* ------------------------------------------------------------ hints */

  /** Where the remaining work for `kind` is, per tooth (for hints + assist glow). */
  remainingByTooth(kind) {
    const out = [];
    for (const t of this.teeth) {
      const s = t.sums;
      let v = 0;
      switch (kind) {
        case "inspect":
        case "final":
          v = kind === "final" ? (t.checked ? 0 : 1) : s.vc ? 1 - s.Ic / s.vc : 0;
          break;
        case "brush":
          v = (s.P + (s.vc - s.BRc) * 40) / (255 * Math.max(1, s.vc));
          break;
        case "scale":
        case "tartar":
          v = s.T / (255 * Math.max(1, s.vc));
          break;
        case "braces":
          v = s.PB / (255 * Math.max(1, s.vc));
          break;
        case "stains":
          v = s.S / (255 * Math.max(1, s.vc));
          break;
        case "rinse":
          v = (s.F + s.R * 2) / (255 * Math.max(1, s.vc));
          break;
        case "suction":
          v = s.W / (255 * Math.max(1, s.vc));
          break;
        case "cavity":
          v = s.C / (255 * Math.max(1, s.vc));
          break;
        case "fill":
          v = s.PRc ? 1 - s.FIp / (255 * s.PRc) : 0;
          break;
        case "smooth":
          v = s.PRc ? 1 - s.SMp / (255 * s.PRc) : 0;
          break;
        case "polish":
          v = s.vc ? s.D / (255 * s.vc) + s.S / (255 * s.vc) : 0;
          break;
        default:
          v = 0;
      }
      if (v > 0.004) out.push({ t, v });
    }
    out.sort((a, b) => b.v - a.v);
    return out;
  }

  /** Centroid of the cells still needing `kind` on tooth t. */
  focusOn(t, kind) {
    const g = t.g;
    const L = t.L;
    let sx = 0;
    let sy = 0;
    let w = 0;
    for (let k = 0; k < g.n; k++) {
      if (!g.valid[k] || L.X[k]) continue;
      let v = 0;
      if (kind === "brush") v = L.P[k] + (L.BR[k] ? 0 : 40);
      else if (kind === "scale" || kind === "tartar") v = L.T[k];
      else if (kind === "braces") v = L.Z[k] === 2 ? L.P[k] : 0;
      else if (kind === "stains") v = L.S[k];
      else if (kind === "rinse") v = L.F[k] + L.R[k];
      else if (kind === "suction") v = L.W[k];
      else if (kind === "cavity") v = L.C[k];
      else if (kind === "fill") v = L.PR[k] ? 255 - L.FI[k] : 0;
      else if (kind === "smooth") v = L.PR[k] ? 255 - L.SM[k] : 0;
      else if (kind === "polish") v = L.D[k] + L.S[k];
      else if (kind === "inspect") v = L.I[k] ? 0 : 1;
      if (v > 0) {
        sx += g.cellX[k] * v;
        sy += g.cellY[k] * v;
        w += v;
      }
    }
    if (!w) return { x: g.x, y: g.yGum + g.dir * g.h * g.sy * 0.5 };
    return { x: sx / w, y: sy / w };
  }

  /** A gentle pointer to the next unfinished thing. Never solves anything. */
  hint() {
    const id = this.currentStage;
    if (!id) return null;
    const kind = stageKind(id);
    const def = STAGES[kind];
    const toolName = TOOLS[def.tool].name.toLowerCase();
    if (kind === "debris") {
      const d = this.debris.find((b) => !b.removed && !b.optional);
      if (!d) return null;
      const t = this.byId.get(d.tooth);
      return { x: d.x, y: d.y, r: 26, text: `There's a food bit on the ${describeTooth(t.g)} — grab it with the tweezers and pull.` };
    }
    if (kind === "floss") {
      const gp = this.gaps.find((g) => g.required && !g.done);
      if (!gp) return null;
      const t = this.byId.get(gp.a);
      return { x: gp.x, y: (gp.yMin + gp.yMax) / 2, r: 26, text: `This gap in the ${describeTooth(t.g)} still needs flossing — slide the floss in, then move it up and down.` };
    }
    if (kind === "suction") {
      if (this.pool.water > 0.05 || this.pool.foam > 0.05 || this.pool.bits.length) {
        const P = this.mouth.pool;
        return { x: P.cx, y: P.cy, r: 60, text: "Hold the suction over the water pooled on the tongue." };
      }
    }
    if (kind === "final") {
      const T = this.totals();
      if (this.foamMetric(T) >= 0.02) {
        const rem = this.remainingByTooth("rinse")[0];
        if (rem) return { ...this.focusOn(rem.t, "rinse"), r: 34, text: "A little foam came back — rinse it with the water." };
      }
      if (this.wetMetric(T) >= 0.05 || this.pool.bits.length) {
        const P = this.mouth.pool;
        return { x: P.cx, y: P.cy, r: 60, text: "Clear the last of the water with the suction." };
      }
      const z = this.zoneState();
      const name = Object.entries(z).find(([, v]) => v < 0.3)?.[0];
      const rem = this.teeth.filter((t) => !t.checked && (!name || (name === "upper" ? t.g.jaw === "upper" : name === "lower" ? t.g.jaw === "lower" : name === "left" ? t.g.x < WORLD.cx - 60 : t.g.x > WORLD.cx + 60)));
      const t = rem[0];
      if (!t) return null;
      return { x: t.g.x, y: t.g.yGum + t.g.dir * t.g.h * t.g.sy * 0.5, r: 40, text: `Check the ${name || "remaining"} teeth with the mirror.` };
    }
    const rem = this.remainingByTooth(kind);
    if (!rem.length) return { x: WORLD.cx, y: WORLD.cy, r: 60, text: def.tip };
    // a hidden-debris nudge during inspection
    const t = rem[0].t;
    const f = this.focusOn(t, kind);
    const where = describeTooth(t.g);
    const kindName = KIND_LABEL[t.g.kind];
    const text = {
      inspect: `Check the ${where} with the mirror.`,
      brush: `The ${where} still need brushing.`,
      scale: `There's still some buildup on the ${where}. Try the scaler.`,
      tartar: `There's still some tartar on the ${where}. Keep working it with the scaler.`,
      braces: `Plaque is hiding around the brackets on the ${where}.`,
      stains: `Some stains are left on the ${where}.`,
      rinse: `Rinse the foam off the ${where}.`,
      suction: `There's still water on the ${where} — use the suction.`,
      cavity: `The dark spot on this ${kindName} needs the cavity tool.`,
      fill: `Spread filling over the prepared spot on this ${kindName}.`,
      smooth: `Smooth the filling on this ${kindName} until it blends in.`,
      polish: `One of the ${where} still needs polishing.`,
    }[kind] || `Try the ${toolName}.`;
    return { x: f.x, y: f.y, r: 32, text };
  }

  /* ------------------------------------------------------------ save */

  serialize() {
    const layers = {};
    for (const key of SAVED) {
      let out = "";
      let run = 0;
      let prev = -1;
      const flush = () => {
        if (run <= 0) return;
        out += String.fromCharCode(97 + prev) + (run > 1 ? run : "");
      };
      for (const t of this.teeth) {
        const a = t.L[key];
        for (let k = 0; k < a.length; k++) {
          const v = a[k];
          const q = v === 0 ? 0 : Math.max(1, Math.min(15, Math.round(v / 17)));
          if (q === prev) run++;
          else {
            flush();
            prev = q;
            run = 1;
          }
        }
      }
      flush();
      layers[key] = out;
    }
    return {
      v: 1,
      layers,
      latched: this.latched.slice(),
      peaks: { ...this.peaks },
      debris: this.debris.map((d) => (d.removed ? 2 : d.revealed ? 1 : 0)),
      gaps: this.gaps.filter((g) => g.listed).map((g) => [g.id, Math.round(g.progress * 100), g.done ? 1 : 0]),
      blobs: this.blobs.map((b) => (b.broken ? 1 : 0)),
      pool: [Math.round(this.pool.water * 100), Math.round(this.pool.foam * 100), this.pool.bits.length],
      hidden: this.teeth.map((t) => (t.hidden ? 1 : 0)),
      flags: this.teeth.map((t) => (t.flags.plaque ? 1 : 0) | (t.flags.polished ? 2 : 0)),
      hints: this.hintsUsed,
      time: Math.round(this.time),
      at: Math.round(this.activeT * 10),
      et: Math.round(this.effT * 10),
      dr: this.debrisRemoved,
    };
  }

  /** Restore a checkpoint. Returns false (and leaves a fresh session) on bad data. */
  restore(d) {
    try {
      if (!d || d.v !== 1 || !d.layers) return false;
      const n = this.teeth[0].g.n;
      const total = n * this.teeth.length;
      const decoded = {};
      for (const key of SAVED) {
        const str = d.layers[key];
        if (typeof str !== "string") return false;
        const arr = new Uint8Array(total);
        let i = 0;
        let p = 0;
        while (p < str.length && i < total) {
          const q = str.charCodeAt(p) - 97;
          p++;
          let num = "";
          while (p < str.length && str[p] >= "0" && str[p] <= "9") num += str[p++];
          const run = num ? parseInt(num, 10) : 1;
          if (q < 0 || q > 15) return false;
          arr.fill(q === 15 ? 255 : q * 17, i, Math.min(total, i + run));
          i += run;
        }
        if (i !== total) return false;
        decoded[key] = arr;
      }
      const valid = (id) => this.stages.includes(id);
      if (!Array.isArray(d.latched) || !d.latched.every(valid)) return false;
      if (d.latched.some((id, i) => this.stages[i] !== id)) return false;
      this.teeth.forEach((t, ti) => {
        for (const key of SAVED) {
          const src = decoded[key];
          const dst = t.L[key];
          for (let k = 0; k < n; k++) dst[k] = t.g.valid[k] && !t.L.X[k] ? src[ti * n + k] : 0;
        }
        t.hidden = !!d.hidden?.[ti];
        const fl = d.flags?.[ti] || 0;
        t.flags.plaque = !!(fl & 1);
        t.flags.polished = !!(fl & 2);
        t.dirty = true;
        recount(t);
      });
      this.latched = d.latched.slice();
      this.peaks = { ...(d.peaks || {}) };
      (d.debris || []).forEach((s, i) => {
        const b = this.debris[i];
        if (!b) return;
        b.revealed = s >= 1 || !b.hidden;
        b.removed = s === 2;
      });
      for (const [id, p, done] of d.gaps || []) {
        const g = this.gaps.find((x) => x.id === id);
        if (!g) continue;
        g.progress = Math.max(0, Math.min(1, p / 100));
        g.done = !!done;
      }
      (d.blobs || []).forEach((b, i) => {
        if (this.blobs[i]) this.blobs[i].broken = !!b;
      });
      this.pool.water = Math.max(0, Math.min(1, (d.pool?.[0] || 0) / 100));
      this.pool.foam = Math.max(0, Math.min(1, (d.pool?.[1] || 0) / 100));
      this.pool.bits = [];
      this.addPoolBits(Math.min(12, d.pool?.[2] || 0), "plaque");
      this.hintsUsed = Math.max(0, d.hints | 0);
      this.time = Math.max(0, d.time || 0);
      this.activeT = Math.max(0, (d.at || 0) / 10);
      this.effT = Math.max(0, Math.min(this.activeT, (d.et || 0) / 10));
      this.debrisRemoved = Math.max(0, d.dr | 0);
      this.events.length = 0;
      this.evaluate();
      this.events.length = 0;
      return true;
    } catch {
      return false;
    }
  }
}
