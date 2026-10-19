/**
 * A player bot for Doll Repair Workshop. It plays a job through the SAME
 * session API the UI uses (pointerDown/Move/Up with doll-space hits, tool
 * selection, part carrying, paint strokes…) — nothing is marked done
 * directly. `skill` 0..1 controls accuracy: low skill adds jitter, misses
 * damage, picks a wrong part first, brushes against the grain, etc.
 *
 * Used by tools/simTest.mjs (node) and from the browser console.
 */
import * as THREE from "three";
import { PAINT_TARGETS, PAINT_COLORS, DOLL_TYPES } from "../data/dolls.js";
import { PARTS, partFits, TOOLS } from "../data/items.js";
import { FACE, cellToAE, aeToUV } from "../engine/plan.js";
import { hexRgb } from "../engine/session.js";
import { buyTool, buySupply, buyPart, qty, toolsNeeded } from "../engine/progress.js";
import { mulberry } from "../engine/rng.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function makeBot(session, { skill = 0.9, seed = 7, step = null } = {}) {
  const r = mulberry(seed);
  const s = session;
  const m = s.model;
  const jit = (amt) => (r() - 0.5) * 2 * amt * (1 - skill);
  const hitAt = (p, extra = {}) => ({ point: p.clone(), normal: extra.normal || null, part: extra.part || "torso", uv: extra.uv || null, lock: extra.lock ?? null });
  const tick = (n = 1, dt = 1 / 30) => {
    for (let i = 0; i < n; i++) s.update(dt);
    if (step) step();
  };
  const stroke = (tool, pts, extra = {}) => {
    if (s.tool !== tool) s.selectTool(tool);
    s.pointerDown(hitAt(pts[0], typeof extra === "function" ? extra(0) : extra));
    for (let i = 1; i < pts.length; i++) {
      const e = typeof extra === "function" ? extra(i) : extra;
      s.pointerMove(hitAt(pts[i], e));
      if (i % 4 === 0) tick(1);
    }
    s.pointerUp();
  };

  /* ---------------------------------------------------------- inspection */
  function inspect() {
    s.selectTool("magnifier");
    if (skill < 0.6) s.inspectClick(hitAt(V(0, 2, 0), { part: "stand" })); // a careless false click
    for (const d of s.damages) {
      if (skill < 0.6 && r() < 0.3) continue; // missed it
      const h = damageHit(d);
      if (h) s.pointerDown(h);
      s.pointerUp();
    }
    s.finishInspection();
  }
  function damageHit(d) {
    switch (d.kind) {
      case "dust":
      case "dirt":
      case "stain": {
        let best = null, bv = 0;
        for (const g of m.grime) for (let i = 0; i < g.n; i++) {
          const v = g.attr.array[i * 4 + d.channel];
          if (g.vis[i] && v > bv) {
            bv = v;
            best = V(g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]);
          }
        }
        return best && hitAt(best);
      }
      case "scratch":
        return hitAt(m.scratches.find((x) => x.depth > 0.1).pts[2]);
      case "crack":
        return hitAt(m.cracks[d.crack].pts[4], { part: "head" });
      case "arm":
      case "leg":
      case "eye":
        return hitAt(m.sockets[d.socket].pos, { part: d.socket });
      case "shoe":
      case "button":
        return hitAt(m.sockets[d.socket].pos);
      case "accessory":
        return hitAt(m.sockets[d.socket].pos, { part: d.socket });
      case "tangle":
        return hitAt(m.hair.locks[0].tip, { part: "hair", lock: 0 });
      case "bald":
        return hitAt(m.patches[0].center, { part: "scalp" });
      case "tear":
        return hitAt(m.tears[d.tear].path[4], { part: "outfit" });
      case "faded": {
        const f = d.features[0];
        const el = f === "lips" ? s.plan.eyeEl - (s.plan.kind === "baby" ? 0.36 : 0.42) : f === "brows" ? s.plan.eyeEl + 0.3 : s.plan.eyeEl - 0.24;
        const az = f === "lips" ? 0 : s.plan.eyeAz + (f === "cheeks" ? 0.08 : 0.02);
        const uv = aeToUV(az, el);
        return hitAt(m.head.surf(new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))), { part: "head", uv: new THREE.Vector2(uv.u, uv.v) });
      }
      default:
        return null;
    }
  }

  /* ------------------------------------------------------------ cleaning */
  function rubAt(tool, p, n, len = 0.03, passes = 4) {
    const t1 = new THREE.Vector3().crossVectors(n, Math.abs(n.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0)).normalize();
    const pts = [];
    for (let k = 0; k <= passes * 6; k++) {
      const a = Math.sin((k / 6) * Math.PI);
      pts.push(p.clone().addScaledVector(t1, a * len).add(V(jit(0.02), jit(0.02), jit(0.02))));
    }
    stroke(tool, pts, { normal: n, part: "outfit" });
  }
  function worst(c) {
    let best = null, bv = 0.03;
    for (const g of m.grime) for (let i = 0; i < g.n; i++) {
      const v = g.attr.array[i * 4 + c];
      if (g.vis[i] && v > bv) {
        bv = v;
        best = { p: V(g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]), n: V(g.nrm[i * 3], g.nrm[i * 3 + 1], g.nrm[i * 3 + 2]) };
      }
    }
    return best;
  }
  function clean(t) {
    const target = skill >= 0.8 ? 0.985 : 0.93;
    for (let it = 0; it < 900 && (t.progress < target); it++) {
      const w = worst(t.channel);
      if (!w) break;
      if (t.channel === 2) {
        s.selectTool("spray");
        s.pointerDown(hitAt(w.p, { normal: w.n }));
        tick(2);
        s.pointerUp();
        rubAt("sponge", w.p, w.n);
      } else rubAt(t.channel === 0 ? "brush" : "sponge", w.p, w.n);
    }
  }

  /* ------------------------------------------------------------- repairs */
  function polishScratches(t) {
    for (let it = 0; it < 30 && !t.done; it++) for (const sc of m.scratches) {
      if (sc.depth <= 0) continue;
      const pts = [];
      for (let k = 0; k < 16; k++) pts.push(sc.pts[k % 2 ? 0 : sc.pts.length - 1].clone().lerp(sc.pts[2], 0.2));
      stroke("polish", pts, { part: "armL" });
    }
  }
  function shine(t) {
    for (let it = 0; it < 400 && !t.done; it++) {
      const skins = m.grime.filter((g) => g.skin);
      let best = null, bv = 2;
      skins.forEach((g, k) => {
        const arr = s.shine[k];
        if (!arr || arr.length !== g.n) return;
        for (let i = 0; i < g.n; i += 3) if (g.vis[i] && arr[i] < bv) {
          bv = arr[i];
          best = { p: V(g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]), n: V(g.nrm[i * 3], g.nrm[i * 3 + 1], g.nrm[i * 3 + 2]) };
        }
      });
      if (!best) break;
      rubAt("polish", best.p, best.n, 0.03, 3);
    }
  }
  function crack(t) {
    const c = m.cracks[t.crack];
    const lines = [c.pts.slice(0, c.main), [c.pts[c.branchFrom], ...c.pts.slice(c.main)]];
    const dense = (pts) => {
      const out = [];
      for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < 4; k++) out.push(pts[i].clone().lerp(pts[i + 1], k / 4).add(V(jit(0.016), jit(0.016), jit(0.016))));
      out.push(pts[pts.length - 1].clone());
      return out;
    };
    for (let pass = 0; pass < (skill < 0.6 ? 4 : 3) && t.stage !== "curing" && t.stage !== "cured"; pass++) for (const L of lines) if (t.stage !== "curing") stroke("glue", dense(L), { part: "head" });
    for (let k = 0; k < 200 && t.stage === "curing"; k++) tick(1, 0.05);
    for (let it = 0; it < 40 && !t.done; it++) {
      const pts = [];
      for (let k = 0; k < 20; k++) pts.push(c.pts[(k * 3) % c.main].clone());
      stroke("cloth", pts, { part: "head" });
    }
  }
  const correctPart = (t, save) => {
    const so = m.sockets[t.socket];
    const type = s.type;
    if (so.kind === "arm" || so.kind === "leg") return `${so.kind}:${type}`;
    if (so.kind === "eye") {
      const want = (s.order.requests || []).find((q) => q.key === "eyeColor")?.value;
      return DOLL_TYPES[type].eyes === "button" ? "eye:black" : `eye:${want || m.eyeColor[so.side === "L" ? "R" : "L"] || "blue"}`;
    }
    if (so.kind === "shoe") return `shoe:${m.look.shoes}`;
    if (so.kind === "button") {
      const want = (s.order.requests || []).find((q) => q.key === "button")?.value;
      return `button:${want || m.buttonStyle}`;
    }
    if (so.kind === "acc") return `acc:${so.want}`;
    void save;
    return null;
  };
  function place(t, save) {
    const so = m.sockets[t.socket];
    if (t.stage === "broken") {
      s.selectTool("pliers");
      s.pointerDown(hitAt(so.pos, { part: t.socket }));
      s.pointerUp();
    }
    const pid = correctPart(t, save);
    const ray = { origin: so.pos.clone().add(V(0, 0.1, 0.6)), dir: null };
    ray.dir = so.pos.clone().sub(ray.origin).normalize();
    if (skill < 0.6) {
      // try a wrong part first
      const wrong = Object.keys(PARTS).find((k) => PARTS[k].kind === PARTS[pid].kind && !partFits(k, so, s.type).ok);
      if (wrong) {
        save.inv[wrong] = (save.inv[wrong] || 0) + 1;
        s.pickPart(wrong);
        s.pointerDown(null, ray);
        s.pointerUp();
      }
    }
    if (!s.pickPart(pid)) return false;
    s.pointerMove(null, ray);
    if (skill < 0.6) {
      s.pointerDown(null, ray); // misaligned click
      s.pointerUp();
    }
    s.rotateCarry(-s.carry.angle + jit(10));
    s.pointerDown(null, ray);
    s.pointerUp();
    if (t.kind === "button" && t.stage === "sew") {
      const pts = t.sew.path.map((p) => p.clone().add(V(jit(0.004), jit(0.004), 0)));
      stroke("needle", [pts[0], ...pts, pts[3]], { part: `button${so.slot}` });
    }
    return t.done;
  }
  function sew(t) {
    const tear = m.tears[t.tear];
    for (let pass = 0; pass < 3 && !t.done; pass++) {
      const pts = [];
      for (let k = t.next; k < tear.path.length; k++) {
        const a = tear.path[Math.max(0, k - 1)], b = tear.path[k];
        for (let q = 1; q <= 3; q++) pts.push(a.clone().lerp(b, q / 3).add(V(jit(0.012), jit(0.012), jit(0.008))));
      }
      if (pts.length) stroke("needle", [tear.path[t.next].clone(), ...pts], { part: "outfit" });
    }
  }
  function paint(t) {
    s.selectTool("paint");
    for (const f of t.features) {
      const target = hexRgb(PAINT_TARGETS[f].color);
      let ci = 0, bd = 1e9;
      s.paintColors().forEach((c) => {
        const rgb = hexRgb(c.hex);
        const d = Math.hypot(rgb[0] - target[0], rgb[1] - target[1], rgb[2] - target[2]);
        if (d < bd) {
          bd = d;
          ci = PAINT_COLORS.indexOf(c);
        }
      });
      if (skill < 0.6) ci = (ci + 3) % 8;
      s.setPaint({ color: ci, size: f === "brows" ? 0 : 1, eraser: false });
      const mk = s.masks[f];
      for (let y = 0; y < FACE.H; y += 2) {
        const row = [];
        for (let x = 0; x < FACE.W; x++) if (mk[y * FACE.W + x] > 0.4) row.push(x);
        if (!row.length) continue;
        const pts = [];
        const uvs = [];
        for (let x = row[0]; x <= row[row.length - 1]; x += 1) {
          if (mk[y * FACE.W + x] < 0.2 && skill > 0.6) continue;
          const { az, el } = cellToAE(x + 0.5 + jit(3), y + 0.5 + jit(3));
          const uv = aeToUV(az, el);
          uvs.push(new THREE.Vector2(uv.u, uv.v));
          pts.push(m.head.surf(V(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))));
        }
        if (pts.length) stroke("paint", pts, (i) => ({ part: "head", uv: uvs[i] }));
        if (pts.length) {
          // the first point's uv
          s.selectTool("paint");
        }
      }
    }
    s.finishPaint();
  }
  function detangle(t) {
    const h = m.hair;
    for (let pass = 0; pass < 12 && !t.done; pass++) {
      h.locks.forEach((L, i) => {
        if (!L.present || L.tangle <= 0.02) return;
        const pts = [];
        const back = skill < 0.6 && i % 5 === 0;
        for (let k = 0; k <= 10; k++) pts.push(L.root.clone().lerp(L.tip, back ? 1 - k / 10 : k / 10));
        stroke("comb", pts, { part: "hair", lock: i });
      });
    }
  }
  function wash() {
    const h = m.hair;
    h.locks.forEach((L, i) => {
      if (!L.present) return;
      const pts = [];
      for (let k = 0; k <= 6; k++) pts.push(L.root.clone().lerp(L.tip, k / 6));
      stroke("shampoo", pts, { part: "hair", lock: i });
    });
  }
  function dry() {
    const h = m.hair;
    s.selectTool("dryer");
    for (let it = 0; it < 30 && h.locks.some((L) => L.present && L.wet > 0.1); it++) {
      for (const L of h.locks) {
        if (!L.present || L.wet <= 0.1) continue;
        const p = L.root.clone().lerp(L.tip, 0.5);
        s.pointerDown(hitAt(p, { part: "hair" }));
        s.pointerMove(hitAt(p, { part: "hair" }));
        tick(8, 0.05);
        s.pointerUp();
      }
    }
  }
  function reroot(t) {
    s.selectTool("reroot");
    m.patches.forEach((P, k) => {
      s.pointerDown(hitAt(P.center, { part: "scalp" }));
      s.pointerMove(hitAt(P.center, { part: "scalp" }));
      for (let i = 0; i < 120 && t.patches[k].growth < 1; i++) tick(1, 0.05);
      s.pointerUp();
    });
  }

  /* ----------------------------------------------------------- top level */
  function shop(save) {
    for (const id of toolsNeeded(s.order)) if (!save.tools[id]) buyTool(save, id);
    if (s.tasks.some((t) => t.kind === "crack")) while (qty(save, "adhesive") < s.tasksOf("crack").length && buySupply(save, "adhesive").ok);
    if (s.tasks.some((t) => t.kind === "clean" && t.channel === 2)) while (qty(save, "solution") < 40 && buySupply(save, "solution").ok);
    if (s.tasks.some((t) => t.kind === "polish" || t.kind === "shine")) while (qty(save, "compound") < 2 && buySupply(save, "compound").ok);
    if (s.tasks.some((t) => t.kind === "sew" || t.kind === "button")) while (qty(save, "thread") < s.tasks.filter((t) => t.kind === "sew" || t.kind === "button").length && buySupply(save, "thread").ok);
    if (s.tasks.some((t) => t.kind === "paint")) while (qty(save, "paint") < 1 && buySupply(save, "paint").ok);
    if (s.tasks.some((t) => t.kind === "wash")) while (qty(save, "shampoo") < 1 && buySupply(save, "shampoo").ok);
    if (s.tasks.some((t) => t.kind === "reroot")) while (qty(save, "fiber") < m.patches.length && buySupply(save, "fiber").ok);
    for (const t of s.tasks) if (t.kind === "part" || t.kind === "button") {
      const pid = correctPart(t, save);
      const need = s.tasks.filter((x) => (x.kind === "part" || x.kind === "button") && correctPart(x, save) === pid).length;
      while (qty(save, pid) < need && buyPart(save, pid).ok);
    }
  }

  function customize() {
    for (const q of s.order.requests || []) {
      if (["hairColor", "hairStyle", "outfit", "dressColor", "shoes", "shoeColor", "hat", "ribbon", "extra", "accent"].includes(q.key)) {
        if (skill < 0.6 && r() < 0.5) continue;
        s.setLook(q.key, q.value);
      }
    }
  }

  function play(save, { submit = true } = {}) {
    inspect();
    if (save) shop(save);
    const order = ["clean", "polish", "shine", "crack", "part", "button", "sew", "paint", "wash", "detangle", "reroot"];
    const sorted = [...s.tasks].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    for (const t of sorted) {
      if (t.done) continue;
      if (t.kind === "clean") clean(t);
      else if (t.kind === "polish") polishScratches(t);
      else if (t.kind === "shine") shine(t);
      else if (t.kind === "crack") crack(t);
      else if (t.kind === "part" || t.kind === "button") place(t, save);
      else if (t.kind === "sew") sew(t);
      else if (t.kind === "paint") paint(t);
      else if (t.kind === "wash") wash(t);
      else if (t.kind === "detangle") detangle(t);
      else if (t.kind === "reroot") reroot(t);
    }
    if (s.tasks.some((t) => t.kind === "wash") || (m.hair && m.hair.locks.some((L) => L.wet > 0.25))) dry();
    // tidy: re-run cleaning in case later steps added nothing
    for (const t of s.tasks) if (t.kind === "clean" && !t.done) clean(t);
    if (!submit) return { ok: s.pendingTasks().length === 0, pending: s.pendingTasks().map((t) => t.label) };
    const okRepairs = s.finishRepairs();
    if (!okRepairs) return { ok: false, pending: s.pendingTasks().map((t) => t.label), tasks: s.tasks.map((t) => `${t.id}:${t.done ? "done" : Math.round((t.progress || 0) * 100) + "%"}`) };
    customize();
    const res = s.submit();
    return { ok: !!res, result: res };
  }

  return { play, inspect, shop, clean, crack, place, sew, paint, detangle, wash, dry, reroot, customize, damageHit, TOOLS };
}
