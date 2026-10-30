/**
 * Scripted solutions, one per level (index = level id - 1). Played by
 * tools/bot.mjs through the real simulation; every route must finish its
 * level AND collect every gem, which proves exits and gems are reachable.
 */
import { T, hazardPos } from "../engine/sim.js";

const x = (t) => ["x", t];
const jx = (t) => ["jx", t];
const j = (d) => ["j", d];
const w = (s) => ["w", s];
const u = (fn) => ["u", fn];
const ux = (t, fn) => ["ux", t, fn];
const sync = (n) => ["sync", n];
const hold = (d, s) => ["hold", d, s];

// predicates
const cx = (p) => (p.x + p.w / 2) / T;
const hero = (s, id) => s.players.find((p) => p.id === id);
const door = (i) => (s) => s.doors[i].open >= 1;
const shut = (i) => (s) => s.doors[i].open <= 0;
const plate = (i) => (s) => s.plates[i].down;
const past = (id, col) => (s) => cx(hero(s, id)) > col;
const before = (id, col) => (s) => cx(hero(s, id)) < col;
const at = (id, col) => (s) => Math.abs(cx(hero(s, id)) - col - 0.5) < 0.2 && hero(s, id).ground;
const on = (c) => (s) => !!s.ch[c];
const plat = (i, tx, ty) => (s) => Math.abs(s.platforms[i].x - tx * T) < 1 && Math.abs(s.platforms[i].y - ty * T) < 1;
const bx = (i) => (s) => (s.boxes[i].x + s.boxes[i].w / 2) / T - 0.5;
// a vertical hazard is rising and already above `maxY` (tiles): time to dash underneath
const up = (i, maxY) => (s) => {
  const h = s.hazards[i];
  return hazardPos(h, s.time + 0.05).y < h.pos.y && h.pos.y / T < maxY;
};
// an orbiting hazard's angle (0 = right, π/2 = bottom) lies in [lo, hi]
const ang = (i, lo, hi) => (s) => {
  const h = s.hazards[i];
  let a = Math.atan2(h.pos.y - h.orbit.cy, h.pos.x - h.orbit.cx);
  if (a < 0) a += Math.PI * 2;
  return a >= lo && a <= hi;
};
const all = (...fns) => (s, p) => fns.every((f) => f(s, p));

export const helpers = { x, jx, j, w, u, ux, sync, hold, cx, hero, door, shut, plate, past, before, at, on, plat, all, bx, up, ang };

export const ROUTES = [
  // 1 Twin Steps
  {
    f: [x(9), x(14), jx(17), x(19), jx(21), x(23), jx(25), x(26)],
    a: [x(8), jx(11), x(15), x(19), jx(22), x(23), jx(25), x(29)],
  },
  // 2 The Old Lever
  {
    f: [x(4), jx(7), x(9), x(15), jx(16.5), jx(18.5), jx(16), x(13), x(9), x(12), x(17), x(19), x(21), ux(26, door(0)), x(28)],
    a: [x(5), x(9), x(15), jx(16.5), jx(18.5), w(0.6), jx(16), x(15), jx(12), x(11), x(12), jx(15.5), x(17), x(19), x(21), ux(27, door(0)), x(30)],
  },
  // 3 Hold the Gate
  {
    f: [x(6), x(13), ux(18, door(0)), u(past("aqua", 17)), x(19), j(0), x(21), jx(24), jx(25.5), x(26), jx(28), x(28)],
    a: [x(5), jx(8), x(9), j(0), x(12), u(plate(1)), x(19), x(22), x(24), jx(25.5), x(27), x(26), jx(28.5), x(30)],
  },
  // 4 Toxic Moat
  {
    f: [x(6), jx(8), x(12), x(16), jx(18), x(26), jx(27.5), jx(25), x(21.5), jx(19), x(16), jx(14), x(9), x(3), sync("lever"), sync("up"), jx(1.5), jx(3.5), x(10), x(15), jx(17), x(20), jx(22), x(26)],
    a: [x(6), jx(8), x(11), jx(13), x(17), x(26), jx(27.5), jx(25), x(20), x(16), jx(14), x(10), jx(8), x(3), sync("lever"), sync("up"), w(0.3), jx(1.5), jx(3.5), x(9), jx(11), x(16), x(20), jx(22), x(29)],
  },
  // 5 Split Paths
  {
    f: [x(5), x(9), x(12), x(15), x(19), ux(23, door(1)), jx(26), x(28)],
    a: [x(5), x(6), x(9), jx(12), ux(17, door(0)), x(19), x(22), x(28)],
  },
  // 6 Color Doors
  {
    f: [ux(13, door(0)), u((s) => cx(hero(s, "aqua")) > 7.3 && hero(s, "aqua").y < 13 * T), x(17), x(20), jx(22), x(26), jx(28.5), jx(25.5), x(20)],
    a: [x(8), u(plate(1)), x(4), jx(1.5), jx(4), ux(9, door(1)), x(14), jx(16), x(23)],
  },
  // 7 Two Levers
  {
    f: [x(13), x(11), x(7), j(0), x(1), x(4), x(11), ux(14, door(0))],
    a: [x(18), x(20), x(24), j(0), x(30), x(27), x(20), ux(17, door(1))],
  },
  // 8 Lift Off
  {
    f: [x(9), jx(12.5), x(21), jx(23), sync("ride"), u(plat(0, 22, 9)), x(19), jx(16), x(10), x(4), sync("l2"), x(7), x(12)],
    a: [x(9), jx(12.5), x(14), jx(17.5), x(20), u(at("flame", 23)), jx(23), x(25), x(27), sync("ride"), u((s) => hero(s, "flame").y < 9 * T && cx(hero(s, "flame")) < 21.6), x(25), u(plat(0, 22, 16.5)), jx(23), x(21), x(17), jx(14), x(12), jx(9), x(5), jx(2), sync("l2"), u(plat(1, 1, 9)), x(6), jx(9.5), x(14)],
  },
  // 9 Seesaw Gates
  {
    f: [ux(15, door(0)), x(17), ux(21, door(1)), jx(24), x(28)],
    a: [x(10), u(past("flame", 14.2)), x(5), jx(3.5), jx(1.5), x(2.2), jx(5.5), ux(14, door(2)), x(19), jx(22), x(27), x(30)],
  },
  // 10 Forest Heart
  {
    f: [x(10), x(4), jx(2), sync("ride"), u(plat(0, 1, 12)), x(9.5), x(10), jx(12), x(13), jx(14.5), x(17), sync("l2"), x(19), u((s) => cx(hero(s, "aqua")) < 27.5 && hero(s, "aqua").y < 12 * T), x(16), jx(14.5), jx(12), x(5), x(11), jx(14.5), jx(16.5), ux(24, door(0))],
    a: [x(22), sync("ride"), x(24), u((s) => cx(hero(s, "flame")) > 4.6 && hero(s, "flame").y < 12 * T), x(27), jx(29), sync("l2"), u(plat(1, 28, 12)), x(21), x(16), jx(14.5), x(12), jx(10), jx(12), x(13), jx(14.5), jx(12), x(8), x(11), jx(14.5), jx(16.5), ux(27, door(0))],
  },
  // 11 Box Step
  {
    f: [x(4), x(7), jx(10), hold(1, 2), jx(15), jx(17), x(19), jx(22), x(25)],
    a: [x(4), jx(7), x(9), x(10), u((s) => s.boxes[0].x > 449), x(13), jx(15), jx(17), x(19), jx(22), x(28)],
  },
  // 12 Crate on the Plate
  {
    f: [x(12.2), jx(15), x(19), jx(22), x(23), jx(24.5), jx(26.5), x(27)],
    a: [u((s) => s.boxes[0].x > 12 * T), x(8), jx(11), x(12), jx(15), x(20), x(23), jx(24.5), jx(26.5), x(30), x(29)],
  },
  // 13 Goo Bridge
  {
    f: [x(8.6), u((s) => s.boxes[0].y > 15 * T), jx(bx(0)), jx(13.5), x(17.4), u((s) => s.boxes[1].y > 15 * T), jx(bx(1)), jx(22.5), x(24), ux(28, door(0))],
    a: [u((s) => s.boxes[1].y > 15 * T), x(8), jx(bx(0)), jx(13.5), x(17), jx(bx(1)), jx(22.5), x(26), ux(30, door(0))],
  },
  // 14 Crystal Lift
  {
    f: [x(7), jx(9), x(15), jx(18), x(20), u(plat(0, 21, 16.5)), jx(22), sync("board1"), u(plat(0, 21, 8)), x(18), sync("board2"), x(15), jx(13), x(10), x(3)],
    a: [x(7), jx(9), x(11), jx(14), x(16), x(20), x(26), sync("board1"), x(24), x(20), u(plat(0, 21, 16.5)), jx(22), sync("board2"), u(plat(0, 21, 8)), x(15), x(12), jx(9), x(6)],
  },
  // 15 Crate Drop
  {
    f: [x(5), x(8), jx(10), sync("ride"), u(plat(0, 9, 9)), x(4), x(2), x(10), x(12), jx(14), x(17), jx(19), jx(21), x(22), x(23)],
    a: [x(4), jx(6), x(8), jx(12), x(13), x(14), sync("ride"), x(15), u((s) => cx(hero(s, "flame")) < 8.5 && hero(s, "flame").y < 9 * T), x(16), u((s) => s.boxes[0].y > 14 * T), x(17), jx(19), jx(21), x(25), jx(27), x(29)],
  },
  // 16 Ferry Crossing
  {
    f: [x(6), u(plat(0, 7, 15.5)), jx(8), u(plat(0, 11, 15.5)), jx(15), u(plat(1, 18, 15.5)), x(20.6), jx(23.2), x(27), x(26)],
    a: [x(5), u(plat(0, 7, 15.5)), jx(8), u(plat(0, 11, 15.5)), jx(15), u(plat(1, 18, 15.5)), x(20.6), jx(23.2), x(26), jx(28), x(29)],
  },
  // 17 Counterweight
  {
    f: [x(6), jx(4), sync("ride"), u(plat(0, 3, 9)), x(9.2), jx(11.5), x(13), jx(15.5), x(20)],
    a: [x(9), sync("ride"), x(10), u((s) => s.boxes[0].y > 12 * T), x(12), u(door(0)), x(13), jx(16), x(19), x(23), jx(25.5), jx(28), x(28), jx(29.5), jx(27), x(17)],
  },
  // 18 Gem Gallery
  {
    f: [x(5), x(12), jx(13.5), jx(11), x(10), x(6), x(4), ux(3, door(0)), jx(1.5), jx(3.5), x(6), x(8), x(10), ux(12, door(1)), jx(13.5), jx(11), x(8), x(3)],
    a: [x(26), x(19), jx(17.5), jx(20), x(21), x(25), x(27), ux(28, door(2)), jx(29.5), jx(27.5), x(25), x(23), x(21), ux(19, door(3)), jx(17.5), jx(20), x(23), x(28)],
  },
  // 19 Lift the Crate
  {
    f: [x(11.2), jx(13.5), sync("up"), u(plat(0, 12, 10)), x(9.8), x(18), sync("down"), sync("aquaOn"), x(16), u(plat(0, 12, 10)), x(11), jx(7), x(2)],
    a: [x(11), jx(13), x(15.5), x(16), sync("up"), x(18), sync("down"), x(15), u(plat(0, 12, 16.5)), jx(13), sync("aquaOn"), u(plat(0, 12, 10)), x(11), jx(7), x(4)],
  },
  // 20 Crystal Core
  {
    f: [x(12.2), jx(15), x(18), jx(20), x(24), u(plat(0, 26, 16.5)), jx(27), sync("ride"), u(plat(0, 26, 9)), x(22), sync("aquaOn"), x(20.5), sync("ferry"), u(plat(1, 17, 8.5)), jx(18), u(plat(1, 9, 8.5)), x(7), x(4), x(2)],
    a: [u((s) => s.plates[0].down), x(8), jx(11), x(12), jx(15), x(19), x(21), sync("ride"), x(23), u(plat(0, 26, 16.5)), jx(27), sync("aquaOn"), u(plat(0, 26, 9)), x(23), sync("ferry"), u(plat(1, 17, 8.5)), jx(18), u(plat(1, 9, 8.5)), x(7), x(5)],
  },
  // 21 Quick Feet
  {
    f: [x(5), x(15), x(17), jx(20.4), x(24), x(25), jx(27), jx(29), x(28), jx(25), ux(15, door(1)), x(11), jx(9), x(4)],
    a: [x(7), jx(9), x(15), x(19), x(25), jx(27), jx(29), x(28), jx(25), ux(15, door(1)), x(11), jx(9), x(7)],
  },
  // 22 Saw Corridor
  {
    f: [x(5), x(6), u(up(0, 14)), x(11), u(up(1, 14)), x(14), jx(17), u(up(2, 14)), x(21), u(up(3, 14)), x(25), x(28)],
    a: [x(6), u(up(0, 14)), x(12), u(up(1, 14)), x(15), x(17), u(up(2, 14)), x(19), jx(22), u(up(3, 14)), x(30)],
  },
  // 23 Element Orbs
  {
    f: [x(5), x(11), x(12), u(up(1, 15)), x(16), jx(19), x(20), u(up(2, 15)), x(25), jx(27), jx(29), x(28), jx(25), u(up(3, 10.5)), x(20), jx(18), x(3), jx(1.5), jx(3.5), x(10), x(13), u(up(5, 6.4)), x(20), jx(22), x(26)],
    a: [x(5), u(up(0, 15)), x(10), jx(12), x(18), x(20), u(up(2, 15)), x(25), jx(27), jx(29), x(28), jx(25), x(20), jx(18), x(12), u(up(4, 10.5)), x(3), jx(1.5), jx(3.5), x(9), jx(11), x(13), u(up(5, 6.4)), x(21), x(29)],
  },
  // 24 Relay Race
  {
    f: [x(4), x(9), jx(11), x(12), ux(15, door(1)), x(16), x(24), ux(26, door(3)), jx(28), x(29)],
    a: [x(7), ux(9, door(0)), x(11), x(14), jx(16), x(18), x(20), ux(22, door(2)), x(23), x(26), jx(28), x(29)],
  },
  // 25 Orbit Hall
  {
    f: [x(4), jx(6.5), jx(10.5), u(ang(0, 1.2, 1.9)), jx(14), u(ang(1, 4.0, 5.0)), jx(18.5), u(ang(1, 1.2, 1.9)), jx(22.5), jx(26.5), x(27), ux(29, door(0))],
    a: [x(4), jx(6.5), jx(10.5), u(ang(0, 1.2, 1.9)), jx(14), u(ang(1, 4.0, 5.0)), jx(18.5), u(ang(1, 1.2, 1.9)), jx(22.5), jx(26.5), x(27), ux(30, door(0))],
  },
  // 26 Timed Lift
  {
    f: [x(9), x(4), x(13), jx(16), u(up(0, 15)), x(19), u(plat(0, 20, 16.5)), jx(21), sync("ride"), u(plat(0, 20, 8)), x(17), jx(14), x(13), u(up(1, 6.4)), x(8), x(3)],
    a: [x(11), jx(8), jx(11), x(14), x(16), u(up(0, 15)), x(19), u(plat(0, 20, 16.5)), jx(21), sync("ride"), u(plat(0, 20, 8)), x(15), x(13), u(up(1, 6.4)), x(9), jx(6), x(5)],
  },
  // 27 Night Watch
  {
    f: [x(12), x(10), u(up(1, 15)), x(7), u(up(0, 15)), x(1), x(4), u(up(0, 15)), x(7), u(up(1, 15)), x(11), ux(14, door(0))],
    a: [x(19), x(21), u(up(3, 15)), x(24), u(up(2, 15)), x(30), x(27), u(up(2, 15)), x(24), u(up(3, 15)), x(20), ux(17, door(1))],
  },
  // 28 Gauntlet
  {
    f: [x(4), x(7), x(8), u(up(0, 15)), x(10), jx(12), x(13), u(up(2, 15)), x(15), jx(17), u(up(3, 15)), x(21), x(22), jx(24), u(up(4, 15)), x(29)],
    a: [x(6), jx(8), u(up(0, 15)), x(11), x(12), u(up(1, 15)), x(15), jx(17), u(up(3, 15)), x(21), x(22), jx(24), u(up(4, 15)), x(30)],
  },
  // 29 Twin Timers
  {
    f: [j(0), x(13), sync("go"), x(9), j(0), x(8), u(up(0, 15)), x(4), ux(2, door(0))],
    a: [j(0), x(18), sync("go"), x(22), j(0), x(23), u(up(1, 15)), x(27), ux(29, door(1))],
  },
  // 30 Shadow Heart
  {
    f: [x(19), jx(22), u(up(0, 15)), sync("ready"), x(26), x(25), u(up(0, 15)), x(22), jx(19), x(17), u(plat(0, 14, 16.5)), jx(15), sync("ride"), u(plat(0, 14, 9)), x(30), x(27), x(17), x(13), jx(10), u(up(2, 7.4)), x(6), ux(1, door(0))],
    a: [x(7), jx(4), x(1), x(4), jx(7), x(12), sync("ready"), u(plat(0, 14, 16.5)), jx(15), sync("ride"), u(plat(0, 14, 9)), x(12), jx(10), x(8), u(on("c")), ux(3, door(0))],
  },
  // 31 First Light
  {
    f: [x(5), x(8), x(11), x(12), jx(15), x(18), jx(20), x(22), ux(26, door(0)), x(27), x(26)],
    a: [x(4), jx(6), x(16), x(18), jx(20), ux(25, door(0)), x(26), jx(28), x(29)],
  },
  // 32 Mirror Crate
  {
    f: [u((s) => s.boxes[0].x > 12 * T), x(8), jx(10), x(11), j(0), x(13), jx(16.5), x(18), ux(24, door(0)), jx(26), x(27)],
    a: [x(13.2), j(0), jx(16.5), x(17), jx(19), ux(24, door(0)), jx(26), x(29)],
  },
  // 33 Two Mirrors
  {
    f: [x(14), x(11), x(1), x(4), x(12), ux(15, door(0))],
    a: [x(17), x(20), x(30), x(27), x(19), ux(16, door(1))],
  },
  // 34 Shadow Play
  {
    f: [x(4), x(9.2), u((s) => s.boxes[0].y > 14 * T), x(9), jx(12), ux(17, door(0)), x(19), sync("hold"), u(past("aqua", 17.3)), x(20), jx(22), x(25), ux(28, door(1))],
    a: [x(3), jx(5), u((s) => s.boxes[0].y > 14 * T), x(9), jx(12), x(13), sync("hold"), x(21), x(26), ux(30, door(1))],
  },
  // 35 Light Lift
  {
    f: [x(18), x(12.8), u(plat(0, 2, 10)), x(14), x(20), x(22), jx(23.5), ux(23.5, door(0)), jx(25.5), jx(27.5), jx(24), sync("up"), x(17), jx(15), x(14)],
    a: [jx(3), u(plat(0, 2, 10)), x(5), x(11), jx(13), x(15), jx(17), x(18), sync("up"), x(21)],
  },
  // 36 Prism Path
  {
    f: [x(12), jx(9), jx(7), x(1), sync("hold"), w(0.3), x(7), jx(9), x(10), x(11), ux(14, door(0))],
    a: [x(19), jx(22), jx(24), x(30), sync("hold"), w(0.3), x(24), jx(22), x(21), x(20), ux(17, door(1))],
  },
  // 37 Sun Gate
  {
    f: [x(8), j(0), x(3), x(5), x(11), jx(12.5), x(14), x(22), u(door(0)), u(up(0, 15)), x(28)],
    a: [x(11), jx(12.5), jx(14.5), x(19.2), x(17), j(0), x(19), jx(22), x(23), u(door(0)), u(up(0, 15)), x(30)],
  },
  // 38 Hall of Mirrors
  {
    f: [x(9.2), jx(12), x(22), jx(24.5), jx(26.5), x(25.8), jx(23.5), u((s) => s.boxes[1].x < 15 * T), x(18), jx(15), jx(12), jx(9), ux(2, door(0))],
    a: [u((s) => s.boxes[0].x > 9 * T), x(5), jx(8), jx(12), x(18), x(22), jx(24.5), jx(26.5), x(25.8), jx(23.5), x(14.8), jx(12), jx(9), ux(4, door(0))],
  },
  // 39 Twin Beams
  {
    f: [x(4), j(0), x(1), sync("hold"), w(0.3), x(8), u(up(0, 15)), x(11), x(19), u(plat(0, 20, 16.5)), jx(21), sync("ride"), u(plat(0, 20, 7)), x(14)],
    a: [x(28), j(0), x(30), sync("hold"), w(0.3), x(25), u(plat(0, 20, 16.5)), u(up(1, 15)), x(24), jx(21), sync("ride"), u(plat(0, 20, 7)), x(18), x(17)],
  },
  // 40 Heart of Light
  {
    f: [x(7.2), jx(10), x(18), x(21), jx(23), x(24), u(plat(0, 25, 16.5)), jx(26), sync("ride"), u(plat(0, 25, 9)), x(22), sync("aquaOn"), x(20.5), u(plat(0, 25, 9)), x(19), x(16), u(up(0, 7.4)), x(13), x(10), jx(8), x(4), ux(1, door(1))],
    a: [u(door(0)), x(7), jx(10), x(18), jx(20), x(22), x(29), sync("ride"), x(28), u(plat(0, 25, 16.5)), jx(26), sync("aquaOn"), u(plat(0, 25, 9)), x(23), x(17), x(10), jx(8), x(4), ux(2, door(1))],
  },
];
