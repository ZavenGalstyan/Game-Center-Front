/**
 * Grappling: clinch, takedowns (shot / clinch trip) and sprawls, the ground
 * game (full guard · half guard · side control · mount · back control) and the
 * submission struggle (armbar · guillotine · rear-naked choke).
 *
 * Every grappling state has an exit: clinches break (fighter, referee after a
 * stalemate), ground positions can be escaped, stood up from, or are stood up
 * by the referee after inactivity, and submissions either finish or are
 * escaped (time limit included). Nothing can leave a fighter stuck.
 */
import { MOVES } from "./moves.js";
import { CLINCH_SEP, GROUND_LAYOUT, clamp, wrapAngle } from "./constants.js";
import { spend, fatigue, toWorld, dist } from "./fighter.js";

const G = (f) => f.A.grappling / 100;
const SUBK = (f) => f.A.subs / 100;
const TDD = (f) => f.A.tdd / 100;
const staK = (f) => clamp(f.sta / 40, 0.35, 1);

/* ================================================================ clinch */
export function tryClinch(m, att, def) {
  if (dist(att, def) > 1.05 || att.sta < 8) return false;
  att.act = { type: "clinchEnter", t: 0, dur: 0.28 };
  spend(att, 5);
  m.emit({ type: "clinchTry", side: att.side });
  return true;
}

export function resolveClinchEnter(m, att, def) {
  if (dist(att, def) > 1.15 || def.act.type === "down" || def.act.type === "dodge" && def.act.dir === "back") {
    att.act = { type: "idle", t: 0 };
    return;
  }
  const busy = def.act.type === "attack" || def.act.type === "hit" || def.act.type === "rocked" ? 0.3 : 0;
  const p = 0.55 + (G(att) - (G(def) + def.A.footwork / 100) / 2) * 0.8 + busy;
  if (!m.rng.chance(clamp(p, 0.15, 0.95))) {
    att.act = { type: "idle", t: 0 };
    m.emit({ type: "clinchFail", side: att.side });
    return;
  }
  enterClinch(m, att, def);
}

export function enterClinch(m, att, def) {
  const ctrl = clamp(0.15 + (G(att) - G(def)) * 0.9, -0.6, 0.6);
  m.clinch = { ctrl: att.side === 0 ? ctrl : -ctrl, t: 0, lastStrike: 0, tdT: -1, tdBy: -1, defendT: [0, 0] };
  for (const f of [att, def]) {
    f.act = { type: "clinch", t: 0 };
    f.vel.x = f.vel.z = 0;
  }
  m.emit({ type: "clinch", side: att.side });
}

/** Dominance in [−1, 1] from `f`'s point of view. */
export const clinchDom = (m, f) => (f.side === 0 ? m.clinch.ctrl : -m.clinch.ctrl);

export function stepClinch(m, dt) {
  const c = m.clinch;
  const [a, b] = m.f;
  c.t += dt;
  c.lastStrike += dt;
  // keep the pair locked face to face; the dominant fighter steers
  const mid = { x: (a.pos.x + b.pos.x) / 2, z: (a.pos.z + b.pos.z) / 2 };
  const dom = c.ctrl >= 0 ? a : b;
  const steer = 0.45 * Math.abs(c.ctrl);
  const fw = { x: Math.sin(dom.yaw), z: Math.cos(dom.yaw) };
  mid.x += fw.x * dom.intent.mz * steer * dt + fw.z * dom.intent.mx * steer * dt;
  mid.z += fw.z * dom.intent.mz * steer * dt - fw.x * dom.intent.mx * steer * dt;
  const ang = Math.atan2(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
  a.pos.x = mid.x - Math.sin(ang) * CLINCH_SEP * 0.5;
  a.pos.z = mid.z - Math.cos(ang) * CLINCH_SEP * 0.5;
  b.pos.x = mid.x + Math.sin(ang) * CLINCH_SEP * 0.5;
  b.pos.z = mid.z + Math.cos(ang) * CLINCH_SEP * 0.5;
  a.yaw = ang;
  b.yaw = wrapAngle(ang + Math.PI);
  m.stat(dom, "ctrl", dt * Math.abs(c.ctrl));
  for (const f of [a, b]) {
    const o = f === a ? b : a;
    if (c.defendT[f.side] > 0) c.defendT[f.side] -= dt;
    if (f.act.type === "clinchTd") {
      f.act.t += dt;
      if (f.act.t >= f.act.dur) resolveClinchTd(m, f, o);
      continue;
    }
    if (f.act.type !== "clinch") continue;
    if (f.act.cool > 0) {
      f.act.cool -= dt;
      continue;
    }
    const it = f.intent;
    if (it.action === "break" || it.dodge) {
      // escaping: easier when you are the dominant one
      const p = clamp(0.45 + clinchDom(m, f) * 0.45 + (f.A.footwork - o.A.grappling) / 200, 0.2, 0.92) * staK(f);
      spend(f, 6);
      if (m.rng.chance(p)) return breakClinch(m, f.side);
      m.emit({ type: "clinchHold", side: o.side });
      f.act = { type: "clinch", t: 0, cool: 0.5 };
    } else if (it.action === "pummel") {
      spend(f, 5);
      const gain = 0.22 * (0.6 + G(f) - G(o) * 0.5) * staK(f);
      c.ctrl = clamp(c.ctrl + (f.side === 0 ? gain : -gain), -1, 1);
      m.emit({ type: "pummel", side: f.side });
    } else if (it.action === "td") {
      if (f.sta < 10) continue;
      spend(f, 10);
      f.act = { type: "clinchTd", t: 0, dur: 0.55 };
      c.tdBy = f.side;
      m.emit({ type: "tdTry", side: f.side, from: "clinch" });
    } else if (it.action === "sprawl" || it.guard) {
      c.defendT[f.side] = 0.6;
    }
  }
  // referee breaks a stalemate
  if (c.lastStrike > 10 && c.t > 10) {
    m.emit({ type: "ref", text: "BREAK!" });
    breakClinch(m, -1);
  }
}

export function breakClinch(m, bySide) {
  const [a, b] = m.f;
  const ang = Math.atan2(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
  for (const f of [a, b]) {
    f.act = { type: "idle", t: 0 };
    const s = f === a ? -1 : 1;
    f.vel.x = Math.sin(ang) * s * 2.2;
    f.vel.z = Math.cos(ang) * s * 2.2;
  }
  m.clinch = null;
  m.emit({ type: "clinchBreak", side: bySide });
}

function resolveClinchTd(m, att, def) {
  const c = m.clinch;
  const defended = c.defendT[def.side] > 0;
  const p = clamp(0.32 + clinchDom(m, att) * 0.35 + (G(att) - TDD(def)) * 0.9 + (def.pressedCage ? -0.05 : 0) + (staK(att) - staK(def)) * 0.25 - (defended ? 0.3 : 0), 0.05, 0.9);
  m.stat(att, "tdAtt");
  if (m.rng.chance(p)) {
    m.clinch = null;
    m.stat(att, "td");
    startTakedown(m, att, def, m.rng.chance(0.5) ? "half" : "side", "trip");
  } else {
    att.act = { type: "clinch", t: 0, cool: 0.4 };
    c.ctrl = clamp(c.ctrl + (att.side === 0 ? -0.25 : 0.25), -1, 1);
    m.emit({ type: "tdStuffed", side: att.side, by: def.side });
  }
}

/* ================================================================ shots */
export function tryShoot(m, att, def) {
  const d = dist(att, def);
  if (d < 0.75 || d > 2.4 || att.sta < 12) return false;
  att.act = { type: "shoot", t: 0, dur: 0.42, sf: 0.9 + 0.2 * (att.A.speed / 100) };
  spend(att, 12);
  m.stat(att, "tdAtt");
  m.emit({ type: "tdTry", side: att.side, from: "shot" });
  return true;
}

export function stepShoot(m, att, def, dt) {
  const a = att.act;
  a.t += dt * a.sf;
  // penetration step: drive forward through the defender's stance
  const fw = { x: Math.sin(att.yaw), z: Math.cos(att.yaw) };
  if (a.t < a.dur) {
    const sp = 2.6;
    att.vel.x = fw.x * sp;
    att.vel.z = fw.z * sp;
    att.pos.x += att.vel.x * dt;
    att.pos.z += att.vel.z * dt;
    return;
  }
  att.vel.x = att.vel.z = 0;
  const d = dist(att, def);
  const sprawled = def.act.type === "sprawl" && def.act.t < 0.55;
  if (d > 1.3 || def.act.type === "down" || def.act.type === "getup" || (def.act.type === "dodge" && def.act.dir === "back")) {
    att.act = { type: "stuffed", t: 0, dur: 0.75 };
    m.emit({ type: "tdMiss", side: att.side });
    return;
  }
  if (sprawled) {
    att.act = { type: "stuffed", t: 0, dur: 0.85 };
    spend(att, 8);
    m.emit({ type: "tdStuffed", side: att.side, by: def.side, sprawl: true });
    // front headlock: the defender can snatch a guillotine for a short window
    def.act = { type: "sprawl", t: 0.55, dur: 1.0, headlock: 0.7 };
    return;
  }
  const busy = def.act.type === "attack" ? 0.28 : def.act.type === "hit" || def.act.type === "rocked" ? 0.2 : def.act.type === "block" ? 0.05 : 0;
  const p = clamp(0.45 + (G(att) - TDD(def)) * 1.1 + busy + (def.pressedCage ? 0.08 : 0) + (staK(att) - staK(def)) * 0.25 - (def.sta < 8 ? -0.1 : 0), 0.05, 0.93);
  if (m.rng.chance(p)) {
    m.stat(att, "td");
    startTakedown(m, att, def, "guard", "double");
  } else {
    att.act = { type: "stuffed", t: 0, dur: 0.7 };
    spend(att, 6);
    m.emit({ type: "tdStuffed", side: att.side, by: def.side });
  }
}

export function startSprawl(m, f) {
  if (f.sta < 6) return false;
  f.act = { type: "sprawl", t: 0, dur: 0.75 };
  spend(f, 6);
  m.emit({ type: "sprawl", side: f.side });
  return true;
}

/** Shot / trip lands: a timed transition into a ground position. */
export function startTakedown(m, att, def, pos, kind) {
  const ang = Math.atan2(att.pos.x - def.pos.x, att.pos.z - def.pos.z);
  m.transition = { kind: "takedown", t: 0, dur: 0.9, top: att.side, bottom: def.side, pos, from: [{ ...att.pos }, { ...def.pos }], dir: ang };
  att.act = { type: "takedown", t: 0, dur: 0.9 };
  def.act = { type: "takenDown", t: 0, dur: 0.9 };
  spend(def, 8);
  def.hp.body = Math.max(0, def.hp.body - 2.5); // slam
  m.emit({ type: "takedown", side: att.side, by: att.side, kind, pos });
}

/* ================================================================ ground */
const POS_ORDER = ["guard", "half", "side", "mount", "back"];
const GNP = { guard: 0.65, half: 0.85, side: 1.0, mount: 1.3, back: 1.05 };
const ADV = { guard: 0.5, half: 0.48, side: 0.44, mount: 0.38 };
const ESC = { guard: 0.0, half: 0.4, side: 0.34, mount: 0.27, back: 0.3 };

export function enterGround(m, top, bottom, pos, anchor, dir) {
  // keep the whole pair away from the fence
  const g = { pos, top: top.side, bottom: bottom.side, t: 0, idle: 0, anchor: { ...anchor }, dir, acts: [null, null], gnpRecent: [] };
  m.ground = g;
  layoutGround(m);
  for (const f of [top, bottom]) {
    f.act = { type: "ground", t: 0 };
    f.vel.x = f.vel.z = 0;
  }
  m.emit({ type: "ground", pos, top: top.side });
}

/** Place both roots from the anchor + layout (the renderer uses the same layout). */
export function layoutGround(m) {
  const g = m.ground;
  const top = m.f[g.top];
  const bot = m.f[g.bottom];
  // nudge the anchor inside the cage (the pair spans ~1.6 m)
  const r = Math.hypot(g.anchor.x, g.anchor.z);
  const maxR = 3.2;
  if (r > maxR) {
    g.anchor.x *= maxR / r;
    g.anchor.z *= maxR / r;
  }
  bot.pos.x = g.anchor.x;
  bot.pos.z = g.anchor.z;
  bot.yaw = g.dir;
  const L = GROUND_LAYOUT[g.pos];
  const c = Math.cos(g.dir);
  const s = Math.sin(g.dir);
  top.pos.x = g.anchor.x + L.off[0] * c + L.off[2] * s;
  top.pos.z = g.anchor.z - L.off[0] * s + L.off[2] * c;
  top.yaw = wrapAngle(g.dir + L.yaw);
}

/** Ground actions available to `f` (for the HUD and the AI). */
export function groundOptions(m, f) {
  const g = m.ground;
  const isTop = g.top === f.side;
  const o = [];
  if (isTop) {
    o.push({ action: "gstrike", label: "Ground strike" });
    if (g.pos !== "back") o.push({ action: "advance", label: g.pos === "mount" ? "Take the back" : "Advance position" });
    if (g.pos === "mount") o.push({ action: "sub", sub: "armbar", label: "Armbar" });
    if (g.pos === "back") o.push({ action: "sub", sub: "rnc", label: "Rear-naked choke" });
    o.push({ action: "standup", label: "Stand up" });
  } else {
    if (g.pos === "guard" || g.pos === "half") o.push({ action: "gstrike", label: "Strike from bottom" });
    o.push({ action: "escape", label: g.pos === "guard" ? "Sweep" : g.pos === "back" ? "Turn into guard" : "Escape" });
    if (g.pos === "guard") {
      o.push({ action: "sub", sub: "armbar", label: "Armbar" });
      o.push({ action: "sub2", sub: "guillotine", label: "Guillotine" });
    }
    if (g.pos === "guard" || g.pos === "half") o.push({ action: "standup", label: "Stand up" });
  }
  return o;
}

export function stepGround(m, dt) {
  const g = m.ground;
  g.t += dt;
  g.idle += dt;
  const top = m.f[g.top];
  const bot = m.f[g.bottom];
  m.stat(top, "ctrl", dt);
  for (const f of [top, bot]) {
    const o = f === top ? bot : top;
    const ga = g.acts[f.side];
    if (ga) {
      ga.t += dt * (ga.sf || 1);
      if (ga.kind === "gstrike" && !ga.done && ga.t >= ga.hitAt) {
        ga.done = true;
        groundStrike(m, f, o, f === top);
        if (!m.ground) return;
      }
      if (ga.t >= ga.dur) {
        g.acts[f.side] = null;
        if (ga.kind === "advance") resolveAdvance(m, f, o);
        else if (ga.kind === "escape") resolveEscape(m, f, o);
        else if (ga.kind === "standup") resolveStandup(m, f, o);
        else if (ga.kind === "sub") startSub(m, f, o, ga.sub);
        if (!m.ground) return; // position ended
      }
      continue;
    }
    const it = f.intent;
    f.act.type = "ground";
    f.guard = it.guard ? "high" : null;
    const opts = groundOptions(m, f).map((x) => x.action);
    let want = it.action;
    if (it.attack && opts.includes("gstrike")) want = "gstrike";
    if (!want || !opts.includes(want)) continue;
    const sf = 0.85 + 0.3 * (f.A.speed / 100);
    if (want === "gstrike") {
      if (f.sta < 4) continue;
      spend(f, f === top ? 4 : 3);
      g.acts[f.side] = { kind: "gstrike", t: 0, dur: f === top ? 0.72 : 0.6, hitAt: f === top ? 0.26 : 0.24, sf, hand: m.rng.chance(0.5) ? "rh" : "lh" };
    } else if (want === "advance" || want === "escape") {
      if (f.sta < 8) continue;
      spend(f, 9);
      g.acts[f.side] = { kind: want, t: 0, dur: 0.6, sf };
      m.emit({ type: want === "advance" ? "advanceTry" : "escapeTry", side: f.side });
    } else if (want === "standup") {
      if (f.sta < 8) continue;
      spend(f, 8);
      g.acts[f.side] = { kind: "standup", t: 0, dur: f === top ? 0.4 : 0.8, sf };
    } else if (want === "sub" || want === "sub2") {
      const sub = groundOptions(m, f).find((x) => x.action === want)?.sub;
      if (!sub || f.sta < 10) continue;
      spend(f, 10);
      g.acts[f.side] = { kind: "sub", t: 0, dur: 0.5, sub, sf };
      m.emit({ type: "subTry", side: f.side, sub });
    }
  }
  // referee stands them up when nothing is happening
  if (g.idle > 15) {
    m.emit({ type: "ref", text: "STAND UP!" });
    standUpBoth(m, -1);
  }
}

function groundStrike(m, f, o, fromTop) {
  const g = m.ground;
  const covering = !!o.intent.guard && !g.acts[o.side];
  const block = covering ? (fromTop ? { guard: 0.6, half: 0.55, side: 0.42, mount: 0.32, back: 0.3 }[g.pos] : 0.6) : 0;
  const base = fromTop ? 3.1 * GNP[g.pos] : 1.8;
  const dmg = base * (0.78 + 0.5 * (f.A.power / 100)) * fatigue(f) * m.rng.range(0.9, 1.1) * (1 - block);
  o.hp.head = Math.max(0, o.hp.head - dmg * 0.5);
  o.daze += dmg * 1.25 * (1.5 - (o.A.chin / 100) * 0.8);
  g.idle = 0;
  m.stat(f, "landedSig", dmg, "head");
  m.emit({ type: "gnp", side: o.side, by: f.side, dmg, blocked: block > 0, pos: toWorld(o, 0, 0.3, -0.62) });
  if (fromTop && !block) {
    g.gnpRecent.push(m.time);
    g.gnpRecent = g.gnpRecent.filter((t) => m.time - t < 6);
  }
  if (o.hp.head <= 0) return m.knockout(f, o, "KO", null);
  // referee: unanswered ground-and-pound on a hurt fighter → TKO
  if (fromTop && g.gnpRecent.length >= 5 && o.hp.head < 30) return m.knockout(f, o, "TKO", null, "Referee stops it — strikes on the ground");
  if (fromTop && o.daze > 95 && o.hp.head < 40) return m.knockout(f, o, "TKO", null, "Referee stops it — fighter not defending");
}

function resolveAdvance(m, f, o) {
  const g = m.ground;
  const defending = !!o.intent.guard || g.acts[o.side]?.kind === "escape";
  const p = clamp(ADV[g.pos] + (G(f) - G(o)) * 0.9 + (staK(f) - staK(o)) * 0.3 - (defending ? 0.18 : 0) + (o.daze > 50 ? 0.2 : 0), 0.08, 0.92);
  if (m.rng.chance(p)) {
    const next = POS_ORDER[POS_ORDER.indexOf(g.pos) + 1];
    g.pos = next;
    g.idle = 0;
    m.stat(f, "advance");
    layoutGround(m);
    m.emit({ type: "position", pos: next, top: f.side, adv: true });
  } else m.emit({ type: "advanceFail", side: f.side });
}

function resolveEscape(m, f, o) {
  const g = m.ground;
  const p = clamp((g.pos === "guard" ? 0.3 : ESC[g.pos]) + (G(f) - G(o)) * 0.9 + (staK(f) - staK(o)) * 0.35 - (o.daze < 20 ? 0 : -0.1), 0.1, 0.9);
  if (!m.rng.chance(p)) return m.emit({ type: "escapeFail", side: f.side });
  g.idle = 0;
  if (g.pos === "guard") {
    // sweep: reversal, bottom ends on top in half guard
    g.top = f.side;
    g.bottom = o.side;
    g.pos = "half";
    g.dir = wrapAngle(g.dir + Math.PI);
    m.stat(f, "td");
    m.emit({ type: "position", pos: "half", top: f.side, sweep: true });
  } else {
    const back = { half: "guard", side: "half", mount: "half", back: "guard" }[g.pos];
    if (g.pos === "back") {
      // turn into him: the defender ends on top in the attacker's guard
      g.top = f.side;
      g.bottom = o.side;
      g.dir = wrapAngle(g.dir + Math.PI);
    }
    g.pos = back;
    m.emit({ type: "position", pos: back, top: g.top, escape: true });
  }
  layoutGround(m);
}

function resolveStandup(m, f, o) {
  const g = m.ground;
  if (f.side === g.top) return standUpBoth(m, f.side);
  const p = clamp(0.32 + (f.A.footwork / 100 - G(o)) * 0.7 + (staK(f) - staK(o)) * 0.3 - (g.pos === "half" ? 0.1 : 0), 0.06, 0.85);
  if (m.rng.chance(p)) standUpBoth(m, f.side);
  else m.emit({ type: "standFail", side: f.side });
}

export function standUpBoth(m, bySide) {
  const g = m.ground;
  if (!g) return;
  const top = m.f[g.top];
  const bot = m.f[g.bottom];
  const d = { x: Math.sin(g.dir), z: Math.cos(g.dir) };
  bot.pos.x = g.anchor.x - d.x * 0.2;
  bot.pos.z = g.anchor.z - d.z * 0.2;
  top.pos.x = bot.pos.x + d.x * 1.45;
  top.pos.z = bot.pos.z + d.z * 1.45;
  bot.yaw = g.dir;
  top.yaw = wrapAngle(g.dir + Math.PI);
  bot.act = { type: "getup", t: 0, dur: 1.1, from: "ground" };
  top.act = { type: "getup", t: 0, dur: 0.6, from: "top" };
  m.ground = null;
  m.sub = null;
  m.emit({ type: "standup", side: bySide });
}

/* ================================================================ submissions */
const SUB_BASE = { armbar: 1.0, guillotine: 1.08, rnc: 1.0 };

export function startSub(m, att, def, type, opts = {}) {
  const g = m.ground;
  // armbar from mount: the attacker falls back → attacker becomes the bottom of a guard frame
  if (type === "armbar" || type === "guillotine") {
    if (g && g.top === att.side) {
      g.top = def.side;
      g.bottom = att.side;
      g.dir = wrapAngle(g.dir + Math.PI);
    }
    if (g) g.pos = "guard";
  }
  if (g) layoutGround(m);
  const wA = 0.13 + 0.12 * SUBK(att);
  const wD = 0.13 + 0.12 * ((def.A.subs + def.A.grappling) / 200);
  m.sub = {
    type,
    att: att.side,
    def: def.side,
    prog: 0.06 + (opts.standing ? 0.04 : 0) + (def.daze > 50 ? 0.12 : 0),
    esc: 0,
    t: 0,
    limit: 11,
    zones: { [att.side]: { c: 0.27, w: wA }, [def.side]: { c: 0.73, w: wD } },
    marker: 0,
    speed: 1.55,
    lastTap: [0, 0],
    taps: [0, 0],
  };
  att.act = { type: "sub", t: 0, role: "att", sub: type };
  def.act = { type: "sub", t: 0, role: "def", sub: type };
  m.stat(att, "subAtt");
  m.emit({ type: "sub", side: att.side, sub: type });
}

/** Marker position 0..1 — both players watch the same marker; each has a zone. */
export const subMarker = (s) => 0.5 + 0.5 * Math.sin(s.t * s.speed * Math.PI);

export function stepSub(m, dt) {
  const s = m.sub;
  s.t += dt;
  s.marker = subMarker(s);
  const att = m.f[s.att];
  const def = m.f[s.def];
  const posK = s.type === "rnc" ? 1.08 : 1;
  for (const f of [att, def]) {
    if (!f.intent.struggle) continue;
    const z = s.zones[f.side];
    const inZone = Math.abs(s.marker - z.c) <= z.w / 2;
    const k = (inZone ? 2.6 : 0.35) * m.rng.range(0.8, 1.2);
    s.taps[f.side]++;
    s.lastTap[f.side] = s.t;
    spend(f, 0.9);
    if (f === att) s.prog += 0.04 * k * SUB_BASE[s.type] * posK * (0.7 + 0.6 * SUBK(att)) * staK(att) * (1.15 - 0.3 * (def.A.subs / 100));
    else s.esc += 0.038 * k * (0.75 + 0.35 * (def.A.subs / 100) + 0.25 * G(def)) * staK(def) * (1.1 - 0.3 * SUBK(att));
    m.emit({ type: "subTap", side: f.side, good: inZone });
  }
  // the hold tightens / slips on its own a little
  s.prog = Math.max(0, s.prog - 0.03 * dt);
  s.esc = Math.max(0, s.esc - 0.02 * dt);
  if (def.sta < 10) s.prog += 0.02 * dt;
  m.stat(att, "subProg", s.prog);
  if (s.prog >= 1) {
    m.submission(att, def, s.type); // training resets the position via endSub (needs m.sub)
    if (m.sub === s) m.sub = null;
  } else if (s.esc >= 1 || s.t >= s.limit) {
    endSub(m, true);
  }
}

/** Defender escapes: back to full guard with the defender on top. */
export function endSub(m, escaped) {
  const s = m.sub;
  const att = m.f[s.att];
  const def = m.f[s.def];
  m.sub = null;
  spend(att, 10);
  if (!m.ground) {
    const ang = Math.atan2(def.pos.x - att.pos.x, def.pos.z - att.pos.z);
    m.ground = null;
    enterGround(m, def, att, "guard", { ...att.pos }, ang);
  } else {
    const g = m.ground;
    if (g.top !== def.side) {
      g.top = def.side;
      g.bottom = att.side;
      g.dir = wrapAngle(g.dir + Math.PI);
    }
    g.pos = "guard";
    g.idle = 0;
    layoutGround(m);
    att.act = { type: "ground", t: 0 };
    def.act = { type: "ground", t: 0 };
  }
  m.emit({ type: "subEscape", side: def.side, sub: s.type, escaped });
}

/** Standing guillotine off a stuffed shot (front headlock) → pulls guard. */
export function headlockGuillotine(m, def, att) {
  const ang = Math.atan2(att.pos.x - def.pos.x, att.pos.z - def.pos.z);
  enterGround(m, att, def, "guard", { ...def.pos }, ang);
  startSub(m, def, att, "guillotine", { standing: true });
}

export { MOVES };
