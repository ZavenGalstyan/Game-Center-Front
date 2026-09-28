/**
 * Boxing Club — training drill checks (Node):
 *   node src/components/games/BoxingClub/tools/trainingSim.mjs
 * Plays each drill with a scripted "good" and "sloppy" player through the
 * real drill code, verifies the drills finish, score sanely, and that the
 * medal thresholds need good play (sloppy play shouldn't earn gold).
 */
import { createBagDrill, stepBagDrill, createPadDrill, stepPadDrill, medalFor, DRILLS, bagCenterX } from "../engine/training.js";
import { canAct } from "../engine/fighter.js";

const IDLE = { move: 0, block: false, attack: null, body: false, dodge: null };
let fail = 0;
const check = (n, c, x = "") => { if (!c) { fail++; console.error("✗", n, x); } };
const FRAME = 1000 / 60;

function heavy(style) {
  const d = createBagDrill("heavy", {});
  let i = 0;
  while (!d.over && i++ < 5000) {
    const f = d.fighter;
    const gap = bagCenterX(d) - f.x;
    let inp = { ...IDLE, move: gap > 0.95 ? 1 : gap < 0.8 ? -1 : 0 };
    if (style === "good") {
      if (canAct(f) && f.stamina > 30 && gap < 1.0) inp.attack = ["jab", "cross", "hookL", "jab", "cross"][i % 5];
    } else if (i % 3 === 0) inp.attack = ["hookL", "hookR", "cross"][i % 3], inp.move = 0;
    stepBagDrill(d, FRAME, inp);
  }
  return d;
}
function speed(style) {
  const d = createBagDrill("speed", {});
  let i = 0;
  while (!d.over && i++ < 5000) {
    let inp = IDLE;
    if (style === "good" && Math.abs(d.t - d.beat.next) < 9) inp = { ...IDLE, attack: i % 2 ? "jab" : "cross" };
    if (style === "sloppy" && i % 11 === 0) inp = { ...IDLE, attack: "jab" };
    stepBagDrill(d, FRAME, inp);
  }
  return d;
}
function dodge(style) {
  const d = createPadDrill("dodge", {}, 3);
  let i = 0;
  while (!d.over && i++ < 8000) {
    let inp = IDLE;
    const c = d.current;
    if (c && style === "good") {
      const toThrow = c.throwAt - d.t;
      if (c.want === "block") inp = { ...IDLE, block: toThrow < 300 };
      else {
        // slip ~120 ms before the glove would land (the punch's startup after the throw)
        const impactIn = toThrow + (c.attack === "cross" ? 225 : c.attack.startsWith("hook") ? 310 : 110);
        if (impactIn < 130 && impactIn > 110) inp = { ...IDLE, dodge: c.want === "slip" ? "in" : "in" };
      }
    } else if (c && style === "sloppy" && i % 40 === 0) inp = { ...IDLE, dodge: "back" };
    stepPadDrill(d, FRAME, inp);
  }
  return d;
}
function combo(style) {
  const d = createPadDrill("combo", {}, 4);
  let i = 0;
  while (!d.over && i++ < 8000) {
    let inp = IDLE;
    const p = d.prompt;
    const f = d.fight.player;
    const gap = d.fight.opponent.x - f.x;
    if (p && style === "good" && canAct(f)) inp = { ...IDLE, attack: p.combo[p.step] };
    if (p && style === "sloppy" && i % 25 === 0) inp = { ...IDLE, attack: ["jab", "cross", "hookL"][i % 3] };
    if (gap > 0.95) inp.move = 1;
    stepPadDrill(d, FRAME, inp);
  }
  return d;
}

for (const [name, fn] of [["heavy", heavy], ["speed", speed], ["dodge", dodge], ["combo", combo]]) {
  const g = fn("good");
  const s = fn("sloppy");
  const gm = medalFor(name, g.score);
  const sm = medalFor(name, s.score);
  console.log(`${DRILLS[name].name.padEnd(14)} good ${String(g.score).padStart(5)} (medal ${gm})   sloppy ${String(s.score).padStart(5)} (medal ${sm})`);
  check(`${name}: drill finishes`, g.over && s.over);
  check(`${name}: good play earns a medal`, gm >= 2, `score ${g.score}`);
  check(`${name}: sloppy play doesn't earn gold`, sm < 3, `score ${s.score}`);
  check(`${name}: good beats sloppy`, g.score > s.score);
}
console.log(fail ? `${fail} failed` : "all training checks passed");
process.exit(fail ? 1 : 0);
