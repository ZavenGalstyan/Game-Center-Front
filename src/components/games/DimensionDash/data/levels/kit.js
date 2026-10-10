/**
 * Dimension Dash — reusable level sections. Each helper builds one designed
 * set piece (rings, enemies, bot hints included) on top of the builder, so a
 * level reads as a handcrafted sequence of sections:
 *
 *   2.5D (take the side builder S):  sRun sHill sSpikes sPit sLedge sLoop
 *     sSecret sCrumble sMoverPit sLift sTurret sShield sChaser sSlope sDash
 *   3D   (take the level builder L): fRun fCurve fPlaza fRails fRamp
 *     fIslands fTunnel fCork fHalf fLasers fLift fMovers fSwitch fDash
 *   bosses: sideArena / discArena
 *
 * Every red-star helper places exactly one hidden star; levels use three.
 */

/* ======================================================================= 2.5D */

export function sRun(S, len, o = {}) {
  const n = o.rings ?? Math.floor(len / 4);
  if (n > 0) S.rings(3, len - 3, n, o.up ?? 1, o.arc ? { arc: o.arc } : {});
  if (o.enemy) S.enemy(o.enemy, len * 0.6, { range: 3, up: o.enemy === "fly" ? 3.6 : 0 });
  if (o.monitor) S.monitor(len * 0.4, o.monitor);
  S.run(len, o.dh ? { dh: o.dh } : {});
}

export function sHill(S, len = 24, amp = 2.6, o = {}) {
  S.rings(4, len - 4, 7, 1.2, { arc: amp * 0.85 });
  if (o.enemy !== false) S.enemy(o.enemy || "patrol", len * 0.55, { range: 3 });
  S.run(len, { hill: amp, dh: o.dh || 0 });
}

export function sSpikes(S, o = {}) {
  S.run(o.before ?? 14);
  S.rings(1, 7, 3, 2.6, { arc: 1.2 });
  S.spikes(4, o.n ?? 3);
  S.act(1, "jump", { hold: 0.3 });
  S.rings(16, 26, 4, 1);
  S.run(o.after ?? 30);
}

export function sPit(S, w = 6, o = {}) {
  S.run(o.before ?? 10);
  S.rings(-1, w + 1, 4, 2.6, { arc: 2 });
  S.gap(w, o.dh || 0, { hold: o.hold ?? 0.35 });
  S.run(o.after ?? 12);
}

/** one-way upper ledge with rings, an optional fly bot to home onto */
export function sLedge(S, o = {}) {
  const h = o.h ?? 3.2;
  const len = o.len ?? 14;
  S.run(4);
  S.platform(2, h, len);
  S.rings(3, len, 6, 1, { h: S.h + h + 1 });
  if (o.fly !== false) S.enemy("fly", len * 0.6, { up: h + 2, range: 2 });
  if (o.star) S.redStar(len - 1, { h: S.h + h + 1.4 });
  S.act(1.5, "jump", { hold: 0.35 });
  S.run(len + 10);
}

/** downhill + boost + loop + tail */
export function sLoop(S, o = {}) {
  S.run(14, { dh: o.drop ?? -4 });
  S.loop(o.r ?? 4.6, { lead: 12, boostSpeed: o.boost ?? 34 });
}

/** a spring tucked along the way to a hidden high ledge with a red star */
export function sSecret(S, o = {}) {
  const h = o.h ?? 10.5;
  S.spring(4, { v: Math.sqrt(2 * 40 * (h + 1.5)) });
  S.platform(1, h, 6, { thick: 0.9 });
  S.redStar(4, { h: S.h + h + 1.3 });
  S.rings(2, 6, 3, 1, { h: S.h + h + 1.1 });
  S.run(o.len ?? 14);
}

/** crumbling planks over a pit */
export function sCrumble(S, n = 3, o = {}) {
  S.run(o.before ?? 10);
  S.gap(4);
  let s = 0;
  let h = 0;
  // a continuous run of planks stepping gently up: keep moving or drop
  const rise = o.rise ?? 0.35;
  for (let i = 0; i < n; i++) {
    S.platform(s, h, 4, { crumble: true });
    s += 4;
    h += rise;
  }
  S.rings(1, s, n * 2, 1.3, { h: S.h + h * 0.5 + 1.2 });
  S.act(s - 1.4, "jump", { hold: 0.3 });
  S.s += s + 1;
  S.h += h - rise;
  S.run(o.after ?? 14);
}

/** a pit crossed on a platform sliding back and forth (wait for it, hop on, hop off) */
export function sMoverPit(S, o = {}) {
  const w = o.w ?? 18;
  S.run(o.before ?? 10);
  const edge = S.s;
  const span = w - 7;
  const b = S.platform(0.6, 0, 4.2, { mover: { to: [span, 0], period: o.period ?? 4.5 } });
  // bot: park at the edge, hop on when the platform is next to it, ride, hop off at the far side
  const [tx, , tz] = S.world(edge + 2.7, S.h);
  const [fx2, , fz2] = S.world(edge + 2.7 + span, S.h);
  S.act(-0.8, "waitDyn", { ref: b, tx, tz, near: 0.9, hold: 0.25 });
  S.act(2.7, "rideDyn", { ref: b, tx: fx2, tz: fz2, near: 0.9, hold: 0.3 });
  S.rings(2.7, 2.7 + span, 4, 1.2, { h: S.h + 1.2 });
  S.gap(w, 0, { jump: false });
  S.rings(2, 10, 4, 1);
  S.run(o.after ?? 14);
}

/** a lift that carries you up a wall onto a higher level */
export function sLift(S, o = {}) {
  const rise = o.rise ?? 6;
  S.run(8);
  const b = S.platform(-4.4, 0.15, 4, { mover: { to: [0, rise], period: o.period ?? 6 } });
  void b;
  S.block(1.5, 3, rise, { style: "block" });
  S.act(-2.4, "hold", { until: S.zone.oy + S.h + rise - 0.6 });
  // the upper ground starts on top of the wall (a sheer step, not a ramp)
  S.cut();
  S.h += rise;
  S.run(o.after ?? 16);
}

export function sTurret(S, o = {}) {
  S.run(8);
  S.block(6, 3, 1.6, { style: "block" });
  S.enemy("turret", 6, { h: S.h + 1.6 });
  S.act(2.2, "jump", { hold: 0.35 });
  S.rings(10, 18, 4, 1);
  S.run(o.after ?? 24);
}

export function sShield(S, o = {}) {
  S.run(6);
  S.enemy("shield", 10, { range: 3 });
  S.rings(4, 16, 5, 3.4, { arc: 1 });
  S.run(o.after ?? 22);
}

export function sChaser(S, o = {}) {
  S.run(8);
  S.enemy("chaser", 12, { range: 6, props: { leash: 12 } });
  S.run(o.after ?? 24, { hill: 1.2 });
}

/** a long downhill then uphill: let gravity do the work */
export function sSlope(S, o = {}) {
  const d = o.d ?? 8;
  S.rings(4, 30, 8, 1);
  S.run(32, { dh: -d });
  S.boost(2, 34);
  S.run(10);
  S.rings(2, 26, 6, 1);
  S.run(28, { dh: d * 0.75 });
}

/** a dash hoop launching you over a chasm */
export function sDash(S, o = {}) {
  const w = o.w ?? 20;
  S.dashRing(6.5, 2.0, { angle: 38, v: o.v ?? 30 });
  S.act(4.2, "jump", { hold: 0.3 });
  S.run(8);
  S.rings(2, w, 6, 6, { arc: 4 });
  S.gap(w, o.dh || 0, { jump: false });
  S.run(o.after ?? 16);
}

/* ======================================================================= 3D */

export function fRun(L, len, o = {}) {
  if (o.rings !== false) L.rings(3, o.lane ?? 0, len - 3, o.lane ?? 0, Math.max(2, Math.floor(len / 5)), 1);
  if (o.enemy) L.enemy(o.enemy, len * 0.6, o.lat ?? 0, { range: 4, up: o.enemy === "fly" ? 3 : 0 });
  L.road(len, { w: o.w, dh: o.dh, guard: o.guard });
}

export function fCurve(L, deg, r, o = {}) {
  L.rings(2, 0, 10, deg > 0 ? 1.5 : -1.5, 4, 1);
  L.turn(deg, r, { bank: o.bank ?? 12, guard: o.guard ?? true, dh: o.dh, w: o.w });
}

/** open area: free roaming with enemies, a monitor and a hidden star */
export function fPlaza(L, o = {}) {
  const w = o.w ?? 42;
  const l = o.l ?? 40;
  L.road(8, { w: Math.min(18, w) });
  L.plaza({
    w,
    l,
    disc: o.disc,
    fill(P) {
      const b = P.base;
      L.ringCircle(l * 0.35, 0, 5, 10, 1, { base: b });
      for (const [k, e] of (o.enemies || ["patrol", "chaser"]).entries()) {
        const r = (k % 2 ? 1 : -1) * (6 + k * 2);
        L.enemy(e, l * (0.45 + k * 0.12), r, { base: b, range: 5, up: e === "fly" ? 2.8 : 0, props: { leash: 14 } });
      }
      if (o.monitor) L.monitor(l * 0.3, w * 0.3, o.monitor, { base: b });
      // a rock cluster in a corner hides the red star
      if (o.star !== false) {
        const sr = (o.starSide ?? -1) * (w / 2 - 4);
        L.box(l * 0.7, sr + Math.sign(sr) * -2.5, 5, 4, 3.6, { base: b, style: "rock" });
        L.box(l * 0.78, sr + Math.sign(sr) * -1, 3, 3, 4.8, { base: b, style: "rock" });
        L.redStar(l * 0.74, sr + Math.sign(sr) * 1.6, 1.2, { base: b });
      }
      for (let i = 0; i < 6; i++) L.deco(3 + ((i * 7.7) % (l - 6)), (i % 2 ? 1 : -1) * (w / 2 - 1.5), "tree", { base: b, s: 1.1 });
      for (let i = 0; i < 10; i++) L.deco(3 + ((i * 5.3) % (l - 6)), -w / 2 + 3 + ((i * 9.1) % (w - 6)), "flower", { base: b, s: 0.9 });
    },
  });
}

/** grind rails: ramp + one to three rails; optional star over a side rail */
export function fRails(L, o = {}) {
  L.road(10, { dh: -0.5 });
  L.boost(4, 0, 33);
  L.road(4, { w: 3.2, guard: true });
  L.ramp(8, 1.8, { w: 3.2, guard: true });
  const count = o.count ?? 2;
  const R = L.rails({ len: o.len ?? 50, count, spacing: 3.6, offset: count === 1 ? 0 : ((count - 1) / 2) * 3.6, start: 0.6, dh: o.dh ?? -4, curve: o.curve ?? 20, wave: o.wave, lead: 0 });
  if (o.star && count > 1) {
    const ln = R.lines[count - 1];
    const q = ln[Math.floor(ln.length * (o.starAt ?? 0.55))];
    L.D.redStars.push({ x: q[0], y: q[1] + 2.4, z: q[2] });
  }
  L.road(14, { w: 10 });
  return R;
}

/** boost → ramp → gap → lower landing */
export function fRamp(L, o = {}) {
  L.road(8, { w: 8 });
  L.boost(3, 0, 36, { w: 6 });
  L.road(4);
  L.ramp(10, 2.4);
  L.rings(2, 0, 2 + (o.gap ?? 12), 0, 5, 3.5, { arc: 2.5, hint: 4 });
  L.gap(o.gap ?? 12, o.dh ?? -3, { jump: false });
  L.road(14, { w: 10 });
}

/** island hops: round platforms with short gaps */
export function fIslands(L, o = {}) {
  const n = o.n ?? 3;
  for (let i = 0; i < n; i++) {
    L.road(6, { w: 8 });
    L.gap(5, o.dh ?? 0);
    const P = L.plaza({ w: 16, l: 16, disc: true, style: "island" });
    L.ringCircle(8, 0, 3, 6, 1, { base: P.base });
    if (o.enemies && i % 2 === 1) L.enemy("fly", 8, 0, { base: P.base, up: 2.8, range: 2 });
    if (o.star && i === n - 1) L.redStar(8, 6.2, 1.2, { base: P.base });
  }
  L.road(6, { w: 9 });
}

export function fTunnel(L, len = 36, o = {}) {
  L.road(6, { w: 9 });
  L.rings(4, 0, len - 4, 0, Math.floor(len / 4), 1);
  L.tunnel(len, { speed: o.speed ?? 38 });
  L.road(6);
}

export function fCork(L, o = {}) {
  L.road(10, { w: 9 });
  L.boost(4, 0, 36);
  L.road(8);
  L.corkscrew(o.len ?? 38, o.r ?? 4.2, { left: o.left });
}

/** half loop (Immelmann) + the U-turn on the upper road */
export function fHalf(L, o = {}) {
  // the return road doubles back overhead: keep earlier sections out from under it
  L.road(20, { w: 9 });
  L.halfLoop(o.r ?? 6);
  L.road(6, { w: 9 });
  L.turn(o.left ? -180 : 180, o.turnR ?? 14, { bank: 10, guard: true });
  L.road(8);
}

/** a corridor of timed laser gates (jump over the beams) */
export function fLasers(L, o = {}) {
  const n = o.n ?? 3;
  L.road(6, { w: 9, guard: true });
  for (let i = 0; i < n; i++) {
    L.laser(6, 0, { w: 9, phase: i * 0.7, on: 1.3, off: 1.6 });
    L.node(3.4, 0, 0, { act: "jump", hold: 0.3 });
    L.rings(9, 0, 11, 0, 2, 1);
    L.road(12, { guard: true });
  }
  L.road(6);
}

/** lift up a cliff (3D) */
export function fLift(L, o = {}) {
  const rise = o.rise ?? 7;
  L.road(8);
  L.box(-2.6, 0, 4.2, 4.2, 0.7, { solid: false, lift: -0.45, style: "lift", mover: { to: [0, 0, rise + 0.2], period: o.period ?? 7 } });
  L.box(5, 0, 14, 10, rise, { style: "cliff" });
  L.node(-2.6, 0, 0, { act: "hold", until: L.C.y + rise - 0.4 });
  const [fx, fz] = [Math.sin(L.C.h), Math.cos(L.C.h)];
  L.node(4, 0, rise, {});
  L.moveTo(L.C.x + fx * 10, L.C.y + rise, L.C.z + fz * 10);
  L.road(10, { w: 9 });
}

/** moving platforms ferrying you across a chasm (3D) */
export function fMovers(L, o = {}) {
  const gap = o.gap ?? 20;
  L.road(8, { w: 9 });
  const span = gap - 8;
  const b = L.box(3.6, 0, 5.4, 5.4, 0.6, { solid: false, lift: -0.4, style: "mover", mover: { to: [span, 0, 0], period: o.period ?? 5 } });
  const [tx, , tz] = L.at(3.6, 0, 0);
  const [fx2, , fz2] = L.at(3.6 + span, 0, 0);
  L.node(-0.9, 0, 0, { act: "waitDyn", ref: b, tx, tz, near: 0.9, hold: 0.25 });
  L.node(3.6, 0, 0, { act: "rideDyn", ref: b, tx: fx2, tz: fz2, near: 0.9, hold: 0.3 });
  L.rings(3.6, 0, 3.6 + span, 0, 4, 1.2, { h: 1.2 });
  L.gap(gap, 0, { jump: false });
  L.road(10, { w: 9 });
}

/** a switch opens a gate to a side alcove holding a red star (E to press) */
export function fSwitch(L, o = {}) {
  L.road(6, { w: 12 });
  const P = L.plaza({ w: 30, l: 26 });
  const b = P.base;
  // walled alcove on the left edge; its inner side is a gate the switch opens
  L.box(8.6, -13, 3.6, 0.8, 3, { base: b, style: "block" });
  L.box(17.4, -13, 3.6, 0.8, 3, { base: b, style: "block" });
  L.box(13, -14.6, 0.8, 9.6, 3, { base: b, style: "block" });
  const gate = L.box(13, -11, 0.8, 8, 3, { base: b, style: "gate" });
  L.switchGate(13, 6, gate, { base: b });
  L.redStar(13, -13, 1.2, { base: b });
  L.enemy(o.enemy || "shield", 16, 3, { base: b, range: 3 });
  L.ringCircle(13, 6, 2.5, 6, 1, { base: b });
}

/** a chain of dash hoops across a big gap */
export function fDash(L, o = {}) {
  L.road(10, { w: 9 });
  L.node(0, 0, 0, { act: "jump", hold: 0.3 });
  L.dashRing(2.4, 0, 2.0, { angle: 30, v: 32 });
  L.rings(10, 0, 26, 0, 6, 6, { arc: 4, h: 6 });
  L.road(6);
  L.gap(o.gap ?? 15, o.dh ?? -2, { jump: false });
  L.road(16, { w: 10 });
}

/* ======================================================================= bosses */

/** 2.5D boss arena: a closed side zone; returns the zone index */
export function sideArena(L, kind, o = {}) {
  let idx = -1;
  L.side({ camDist: 18, openEnd: false, boss: true }, (S) => {
    idx = S.zone.idx;
    const len = o.len ?? 46;
    S.rings(4, len - 4, 10, 1);
    S.run(len);
  });
  const Z = L.D.zones[idx];
  const mid = (Z.s0 + Z.s1) / 2;
  L.boss({ kind, arena: "side", zone: idx, center: { x: Z.ox + Z.fx * mid, y: Z.oy, z: Z.oz + Z.fz * mid } });
  return idx;
}

/** 3D disc arena with a glowing fence; returns its centre */
export function discArena(L, kind, o = {}) {
  const r = o.r ?? 24;
  L.road(6, { w: 12 });
  const P = L.plaza({ w: r * 2, l: r * 2, disc: true, style: "arena" });
  const [cx, cy, cz] = P.at(r, 0, 0);
  L.ringCircle(r, 0, r * 0.6, 14, 1, { base: P.base });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    L.D.deco.push({ t: "pylon", x: cx + Math.sin(a) * (r - 0.3), y: cy, z: cz + Math.cos(a) * (r - 0.3), s: 1, r: a });
  }
  L.boss({ kind, arena: "3d", center: { x: cx, y: cy, z: cz }, radius: r, sideZone: o.sideZone });
  return { cx, cy, cz, P };
}

/** the final arena: a 3D disc plus a dormant 2.5D plane through its centre (phase 2) */
export function coreArena(L, o = {}) {
  const r = o.r ?? 26;
  const A = discArena(L, "core", { r });
  const save = { ...L.C };
  const h = A.P.base.h;
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  const half = r - 3;
  L.moveTo(A.cx - fx * half, A.cy, A.cz - fz * half, h);
  let idx = -1;
  L.side({ dormant: true, openStart: false, openEnd: false, deco: false, camDist: 19 }, (S) => {
    idx = S.zone.idx;
    S.s = half * 2;
  });
  L.D.boss.sideZone = idx;
  L.moveTo(save.x, save.y, save.z, save.h);
  return A;
}
