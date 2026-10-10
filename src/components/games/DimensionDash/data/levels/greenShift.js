/**
 * Level 1-1 — GREEN SHIFT (the vertical slice).
 *
 *   A  classic 2.5D hills: rings, a patrol bot, spikes, a pit, an upper path
 *      with a fly bot (homing practice), booster → LOOP, checkpoint, a hidden
 *      red star up a spring, then the glowing shift gate
 *   B  full 3D: run-out into an open meadow plaza (free roaming, chaser,
 *      monitor, red star tucked behind the rocks), a banked curve, a launch
 *      ramp onto twin GRIND RAILS (red star over the right rail), a lift
 *      platform up a cliff, then a second shift gate
 *   C  2.5D cliff bridge: crumbling planks, a patrol bot, spring, GOAL
 */
import { createBuilder } from "../../engine/builder.js";

export default function greenShift(meta) {
  const L = createBuilder(meta);
  L.moveTo(0, 0, 0, Math.PI / 2); // heading +X
  L.spawn({ side: true, zone: 0 });

  /* ------------------------------------------------ A: classic 2.5D */
  L.side({ openStart: false, camDist: 15 }, (S) => {
    S.rings(6, 14, 5, 1);
    S.deco(3, "sign", { d: -2.8 });
    S.run(16);
    // rolling hill with a patrol bot on top
    S.rings(4, 20, 7, 1.2, { arc: 2.2 });
    S.enemy("patrol", 14, { range: 3 });
    S.run(24, { hill: 2.6 });
    // breathing room, then spikes to hop
    S.rings(6, 14, 4, 1);
    S.run(22);
    S.rings(1, 7, 3, 2.6, { arc: 1.2 });
    S.spikes(4, 3);
    S.act(1, "jump", { hold: 0.3 });
    S.rings(16, 26, 4, 1);
    S.run(32);
    // a pit
    S.rings(-1, 6, 4, 2.5, { arc: 2 });
    S.gap(5.5);
    S.run(8);
    // upper path: one-way ledge with rings and a fly bot to home onto
    S.platform(2, 3.2, 12);
    S.rings(3, 13, 6, 1, { h: S.h + 3.2 + 1 });
    S.enemy("fly", 9, { up: 5.2, range: 2 });
    S.rings(16, 22, 4, 1);
    S.act(1.5, "jump", { hold: 0.35 });
    S.run(24);
    // drop toward the loop
    S.run(14, { dh: -4 });
    S.loop(4.6, { lead: 12, boostSpeed: 34 });
    S.checkpoint(2);
    S.monitor(9, "rings");
    S.run(12);
    // rise; a spring tucked against a wall leads to a hidden ledge (red star)
    S.run(16, { dh: 3.2 });
    S.spring(4, { v: 31 });
    S.platform(1, 10.8, 6, { thick: 0.9 });
    S.redStar(4, { h: S.h + 10.8 + 1.3 });
    S.rings(2, 6, 3, 1, { h: S.h + 10.8 + 1.1 });
    S.run(10);
    S.enemy("patrol", 6, { range: 3 });
    S.rings(2, 14, 6, 1);
    S.run(24);
  });

  /* ------------------------------------------------ B: full 3D */
  L.road(18, { w: 10 });
  L.road(10, { w: 18 });
  L.plaza({
    w: 46,
    l: 44,
    fill(P) {
      const b = P.base;
      L.ringCircle(16, 0, 6, 10, 1, { base: b });
      L.enemy("chaser", 22, -8, { base: b, range: 6, props: { leash: 14 } });
      L.enemy("patrol", 30, 8, { base: b, range: 5 });
      L.monitor(12, 12, "magnet", { base: b });
      L.monitor(34, -14, "shield", { base: b });
      // rock cluster; the red star hides behind it
      L.box(26, -19, 7, 4, 3.4, { base: b, style: "rock" });
      L.box(31, -18, 4, 5, 4.6, { base: b, style: "rock" });
      L.redStar(29, -21.5, 1.2, { base: b });
      L.rings(20, 14, 38, 14, 6, 1, { base: b });
      L.spring(40, 16, { base: b, v: 18 });
      L.rings(40, 16, 40, 16, 1, 9, { base: b });
      for (const [f, r] of [
        [4, 20],
        [8, -20],
        [40, 20],
        [42, -9],
        [18, 21],
      ])
        L.deco(f, r, "tree", { base: b, s: 1.2 });
      for (let i = 0; i < 14; i++) L.deco(4 + ((i * 7.3) % 38), -20 + ((i * 11.7) % 40), "flower", { base: b, s: 0.9 });
    },
  });
  // banked curve with rings along the racing line
  L.road(6, { w: 11 });
  L.rings(2, 0, 14, 0, 5, 1);
  L.turn(70, 34, { bank: 12, guard: true });
  L.rings(2, 0, 12, -1, 5, 1);
  L.turn(-55, 30, { bank: 10, guard: true });
  L.road(10, { dh: -1 });
  L.boost(4, 0, 33);
  L.road(4, { w: 3.2, guard: true });
  L.ramp(8, 1.8, { w: 3.2, guard: true });
  // twin rails over the void (the left one lines up with the ramp; red star over the right one)
  const R = L.rails({ len: 54, count: 2, spacing: 3.6, offset: 1.8, start: 0.6, dh: -4, curve: 28, lead: 0 });
  {
    const ln = R.lines[1];
    const q = ln[Math.floor(ln.length * 0.55)];
    L.D.redStars.push({ x: q[0], y: q[1] + 2.4, z: q[2] });
  }
  L.road(14, { w: 10 });
  L.checkpoint(4, 0);
  L.rings(6, -3, 12, -3, 4, 1);
  // lift platform up the cliff face (the moving platform)
  L.road(8);
  L.box(-2.6, 0, 4.2, 4.2, 0.7, { solid: false, lift: -0.45, style: "lift", mover: { to: [0, 0, 7.2], period: 7 } });
  L.box(5, 0, 14, 10, 7.0, { style: "cliff" });
  L.node(-2.6, 0, 0, { act: "hold", until: L.C.y + 6.6 });
  {
    const [fx, fz] = [Math.sin(L.C.h), Math.cos(L.C.h)];
    L.node(4, 0, 7.2, {});
    L.moveTo(L.C.x + fx * 10, L.C.y + 7, L.C.z + fz * 10);
  }
  L.road(14, { w: 9 });
  L.rings(2, 0, 10, 0, 4, 1);
  L.road(6, { w: 8 });

  /* ------------------------------------------------ C: 2.5D bridge to the goal */
  L.side({ camDist: 14.5, openEnd: false }, (S) => {
    S.run(16);
    S.rings(4, 12, 4, 1);
    S.gap(4);
    S.platform(0, 0, 4, { crumble: true });
    S.platform(4.6, 0.6, 4, { crumble: true });
    S.platform(9.2, 1.2, 4, { crumble: true });
    S.rings(1, 12, 5, 1.3, { h: S.h + 2.2 });
    S.act(3.2, "jump", { hold: 0.2 });
    S.act(7.8, "jump", { hold: 0.25 });
    S.act(12.2, "jump", { hold: 0.3 });
    S.s += 14;
    S.h += 1.2;
    S.run(18);
    S.enemy("patrol", -8, { range: 3 });
    S.spring(3, { v: 20, angle: 25 });
    S.rings(6, 16, 5, 4, { arc: 3 });
    S.run(24, { dh: 1.4 });
    S.rings(2, 10, 5, 1);
    S.goal(14);
    S.run(22);
  });

  return L.done();
}
