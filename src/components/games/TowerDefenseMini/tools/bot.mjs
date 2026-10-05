/**
 * Tower Defense Mini — headless bots used by simTest.mjs.
 *   smart    reads the next wave and builds/upgrades the tower that counters it
 *   archers  only ever builds and upgrades Archer Towers
 */
import { Engine, STEP } from "../engine/engine.js";
import { TOWERS, towerStats } from "../data/towers.js";
import { coverage } from "../engine/path.js";

function needs(next, eng) {
  const c = next ? next.counts : {};
  const have = { archer: 0, cannon: 0, frost: 0, mage: 0 };
  for (const t of eng.towers) have[t.type] += t.level;
  const n = {
    archer: (c.raider || 0) * 1 + (c.scout || 0) * 0.9 + 2,
    cannon: (c.swarmer || 0) * 0.55 + (c.raider || 0) * 0.25,
    frost: (c.scout || 0) * 0.5 + (c.boss || c.warlord ? 4 : 0) + (c.brute || 0) * 0.5,
    mage: (c.armored || 0) * 2.4 + (c.brute || 0) * 2 + (c.boss || 0) * 14 + (c.warlord || 0) * 30,
  };
  if (have.frost >= 2) n.frost = 0;
  return Object.entries(n)
    .map(([k, v]) => [k, v / (1 + have[k])])
    .sort((a, b) => b[1] - a[1]);
}

function bestSpot(eng, type) {
  const r = towerStats(type, 1).range;
  let best = -1;
  let score = -1;
  for (const s of eng.spots) {
    if (s.tower) continue;
    let cov = 0;
    for (const p of eng.paths) cov += coverage(p, s.x, s.z, r);
    // later along the road is better for slow killers; earlier for frost
    if (cov > score) {
      score = cov;
      best = s.i;
    }
  }
  return best;
}

function botAct(eng, style) {
  for (let guard = 0; guard < 20; guard++) {
    const free = eng.spots.filter((s) => !s.tower).length;
    if (style === "archers") {
      if (free && eng.coins >= TOWERS.archer.levels[0].cost) eng.build(bestSpot(eng, "archer"), "archer");
      else {
        const t = eng.towers.filter((t) => t.level < 3).sort((a, b) => a.level - b.level)[0];
        if (!t || !eng.upgrade(t.id).ok) return;
      }
      continue;
    }
    const next = eng.phase === "build" ? eng.nextWave() : eng.currentWave();
    const order = needs(next, eng);
    const want = order[0][0];
    const cheapUp = eng.towers.filter((t) => t.level < 3).sort((a, b) => TOWERS[a.type].levels[a.level].cost - TOWERS[b.type].levels[b.level].cost || a.level - b.level)[0];
    const shouldUpgrade = !free || (eng.towers.length >= 5 && cheapUp && eng.run.upgrades < eng.towers.length);
    if (shouldUpgrade && cheapUp) {
      if (!eng.upgrade(cheapUp.id).ok) return;
    } else if (free && eng.coins >= TOWERS[want].levels[0].cost) {
      eng.build(bestSpot(eng, want), want);
    } else return;
  }
}

export function play(L, style) {
  const eng = new Engine();
  let summary = null;
  eng.cb.over = (s) => (summary = s);
  eng.load(L);
  let t = 0;
  while (!summary && t < 60 * 60 * 30) {
    if (eng.phase === "build") {
      botAct(eng, style);
      eng.startWave();
    }
    if (t % 30 === 0) botAct(eng, style);
    eng.step(STEP);
    eng.events.length = 0;
    t++;
  }
  return summary || { result: "timeout", lives: eng.lives, wave: eng.waveNo };
}

