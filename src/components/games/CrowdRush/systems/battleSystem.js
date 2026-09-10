/**
 * Crowd Rush — crowd-vs-crowd battle.
 *
 * Simple attrition, no manual attacking. When the crowds meet, both sides lose
 * the SAME number of runners per second (front-line clash), so the winner walks
 * away with exactly `player - enemy` — which is the model the level tuner and
 * validator assume, so a fight never surprises the player with worse math than
 * the gates implied.
 *
 * The loss rate is picked so any fight resolves in ~1–4 seconds regardless of
 * size. If the player's crowd hits zero first, the level is lost.
 */

export function makeBattle(playerCount, enemy) {
  const enemyCount = enemy.count;
  // rate so duration = min(player, enemy) / rate falls in [1s, 3.5s]
  const smaller = Math.min(playerCount, enemyCount);
  const rate = Math.max(8, Math.min(smaller / 1.0, smaller / 3.4 + 6));
  return {
    enemy,
    rate,
    playerStart: playerCount,
    enemyStart: enemyCount,
    playerFloat: playerCount,
    enemyFloat: enemyCount,
    shake: 0,
    done: false,
    outcome: null, // "win" | "loss"
  };
}

/** advance one frame; returns { playerCount, enemyCount, justKilledPlayer, justKilledEnemy, finished, outcome } */
export function tickBattle(b, dt) {
  if (b.done) {
    return { finished: true, outcome: b.outcome, playerCount: Math.max(0, Math.round(b.playerFloat)), enemyCount: Math.max(0, Math.round(b.enemyFloat)), killedPlayer: 0, killedEnemy: 0 };
  }
  const prevP = Math.round(b.playerFloat);
  const prevE = Math.round(b.enemyFloat);
  const loss = b.rate * dt;
  b.playerFloat = Math.max(0, b.playerFloat - loss);
  b.enemyFloat = Math.max(0, b.enemyFloat - loss);
  b.shake = Math.min(1, b.shake + dt * 3);

  const p = Math.round(b.playerFloat);
  const e = Math.round(b.enemyFloat);

  if (e <= 0 || p <= 0) {
    b.done = true;
    b.outcome = p <= 0 ? "loss" : "win";
    // snap to the exact attrition result on a win
    if (b.outcome === "win") b.playerFloat = Math.max(0, b.playerStart - b.enemyStart);
  }
  return {
    finished: b.done,
    outcome: b.outcome,
    playerCount: Math.max(0, Math.round(b.playerFloat)),
    enemyCount: Math.max(0, Math.round(b.enemyFloat)),
    killedPlayer: Math.max(0, prevP - p),
    killedEnemy: Math.max(0, prevE - e),
  };
}
