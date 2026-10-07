/**
 * Highway Racer — a driving bot for the headless tools and the DEV browser
 * hooks. It plans on the same lane × time grid the spawner validates with
 * (engine/fairness.js), so a long bot survival is evidence the traffic is
 * fair. skill < 1 adds reaction delay and occasional mistakes.
 */
import { planMove, laneSafe } from "../engine/fairness.js";

export function createBot({ skill = 1, rng = Math.random, coins = true } = {}) {
  let cooldown = 0;
  return function drive(R, dt) {
    if (R.phase !== "playing") return;
    cooldown -= dt;
    if (cooldown > 0) return;
    cooldown = (1 - skill) * 0.3 + 0.04;
    const p = R.player;
    const cars = R.traffic.filter((c) => c.active && c.z < 8);
    let move = planMove(cars, R.speed, R.tune.laneTime, p.target);
    if (skill < 1 && rng() < (1 - skill) * 0.03) move = rng() < 0.5 ? -1 : 1;
    if (move === 0 && coins) {
      // nothing to dodge: drift toward coins if that lane is safe too
      const coin = R.pickups.find((k) => k.active && k.z < -12 && k.z > -50);
      if (coin) {
        const cl = coin.x < -1.6 ? 0 : coin.x > 1.6 ? 2 : 1;
        const n = p.target + Math.sign(cl - p.target);
        if (cl !== p.target && laneSafe(n) && planMove(cars, R.speed, R.tune.laneTime, n) === 0) move = n - p.target;
      }
    }
    if (move) R.steer(move);
    if (R.boost >= 1 && R.boostTime === 0 && cars.length < 4) R.activateBoost();
  };
}
