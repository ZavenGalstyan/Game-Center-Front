/**
 * Island Conquest — enemy commander.
 *
 * A lightweight scoring AI that plays by EXACTLY the player's rules: it only
 * ever calls engine.send() (troops are deducted from a real island, the fleet
 * sails the same routes at the same speed), it sees the same board the player
 * sees (island troops and fleets at sea, never future orders) and it thinks on
 * a timer, not every frame. Difficulty changes decision quality only:
 *
 *   easy    slow thinker, thin safety margins, sometimes picks a poor target,
 *           often forgets to defend
 *   normal  sensible expansion, basic defence, punishes weak islands
 *   hard    quicker (still human-paced), better defence, coordinates attacks
 *           from several islands and feeds its frontline
 *
 * Priorities each decision: DEFEND a threatened island → ATTACK / EXPAND the
 * best value target it can actually take → REINFORCE the frontline → otherwise
 * SAVE (do nothing and let troops grow).
 */
import { NEUTRAL } from "./constants.js";

export const AI_LEVELS = {
  easy: { evac: false, think: 2.9, jitter: 0.45, margin: 1, sloppy: 0.28, defend: 0.35, combine: true, actions: 1, minSend: 6, frontline: 0, keep: 0.25, hostile: 0.7, extra: 0, guard: 0 },
  normal: { evac: true, think: 1.9, jitter: 0.3, margin: 2, sloppy: 0.06, defend: 0.8, combine: true, actions: 1, minSend: 5, frontline: 0.45, keep: 0.15, hostile: 1, extra: 0.2, guard: 0.3 },
  hard: { evac: true, think: 1.3, jitter: 0.25, margin: 3, sloppy: 0, defend: 1, combine: true, actions: 2, minSend: 4, frontline: 0.9, keep: 0.1, hostile: 1.2, extra: 0.3, guard: 0.45 },
  // test-only profile: plays the PLAYER side in tools/balance.mjs at a quick,
  // careful human pace — never used for an enemy
  expert: { evac: true, think: 0.8, jitter: 0.2, margin: 2, sloppy: 0, defend: 1, combine: true, actions: 2, minSend: 4, frontline: 0.9, keep: 0.05, hostile: 1.3, extra: 0.25, guard: 0.6 },
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function createAI(faction, cfg = {}, rand = Math.random) {
  const base = AI_LEVELS[cfg.level] || AI_LEVELS.normal;
  const P = { ...base };
  if (cfg.think) P.think = cfg.think;
  if (cfg.aggr) P.hostile *= cfg.aggr;
  if (cfg.margin != null) P.margin = cfg.margin;
  const ai = {
    faction,
    level: cfg.level || "normal",
    P,
    timer: cfg.delay ?? P.think * 1.4,
    decisions: 0,
    sends: 0,
    tick(engine, h) {
      ai.timer -= h;
      if (ai.timer > 0) return;
      ai.timer = P.think * (1 - P.jitter / 2 + rand() * P.jitter);
      ai.decisions++;
      think(engine, ai, P, rand);
    },
  };
  return ai;
}

/** incoming fleets per island, with arrival times (seconds from now) */
function incomingMap(engine) {
  const m = new Map();
  for (const f of engine.fleets) {
    const eta = (f.len - f.d) / f.speed;
    let list = m.get(f.to);
    if (!list) m.set(f.to, (list = []));
    list.push({ owner: f.owner, troops: f.troops, eta });
  }
  return m;
}

/** defenders `t` will have after `eta` seconds, as `me` sees the board */
function projected(t, eta, me, incoming) {
  let D = t.troops;
  if (t.owner !== NEUTRAL && t.troops < t.cap) D = Math.min(t.cap, D + t.rate * Math.max(0, eta - Math.max(0, t.grace)));
  const inc = incoming.get(t.id);
  if (inc)
    for (const f of inc) {
      if (f.eta > eta + 0.6) continue;
      if (f.owner === t.owner) D += f.troops;
      else if (f.owner === me) D -= f.troops / t.defense;
    }
  return D;
}

/** threat on my island: how many more defenders it needs (≤0 = safe) */
function threat(i, me, incoming) {
  const inc = incoming.get(i.id);
  if (!inc) return null;
  let hostile = 0;
  let last = 0;
  let first = Infinity;
  for (const f of inc)
    if (f.owner !== me) {
      hostile += f.troops;
      last = Math.max(last, f.eta);
      first = Math.min(first, f.eta);
    }
  if (!hostile) return null;
  let mine = i.troops + (i.troops < i.cap ? i.rate * first : 0);
  for (const f of inc) if (f.owner === me && f.eta <= last) mine += f.troops;
  const deficit = hostile - mine * i.defense;
  return { deficit, first, last, hostile };
}

function think(engine, ai, P, rand) {
  const me = ai.faction;
  let incoming = incomingMap(engine);
  const mine = engine.islands.filter((i) => i.owner === me);
  if (!mine.length) return;
  const hostiles = engine.islands.filter((i) => i.owner !== me && i.owner !== NEUTRAL);
  const threatened = new Map();
  for (const i of mine) {
    const t = threat(i, me, incoming);
    if (t && t.deficit > -2) threatened.set(i.id, t);
  }
  // home guard: what hostile neighbours could land before this island refills
  const guardOf = (S) => {
    if (!P.guard) return 0;
    let g = 0;
    for (const H of hostiles) g = Math.max(g, H.troops * P.guard - S.rate * engine.travelTime(H, S) * S.defense);
    return Math.max(0, Math.ceil(g / S.defense));
  };
  // ...plus whatever must stay to beat fleets already sailing at it
  const holdFor = (S) => {
    const inc = incoming.get(S.id);
    if (!inc) return 0;
    let h = 0;
    let first = Infinity;
    for (const f of inc)
      if (f.owner !== me) {
        h += f.troops;
        first = Math.min(first, f.eta);
      }
    if (!h) return 0;
    return Math.max(0, Math.ceil(h / S.defense - S.rate * first) + 1 + P.margin);
  };
  const guard = new Map(mine.map((S) => [S.id, Math.max(guardOf(S), holdFor(S))]));
  const send = (a, b, n) => {
    const r = engine.send(me, a.id, b.id, { count: n });
    if (r.ok) ai.sends++;
    return r.ok;
  };

  /* ---------------- 1. defend */
  const doomed = new Set();
  if (threatened.size && rand() < P.defend) {
    const list = [...threatened.entries()].map(([id, t]) => ({ isl: engine.byId.get(id), t })).sort((p, q) => q.isl.rate - p.isl.rate || q.isl.troops - p.isl.troops);
    for (const { isl, t } of list) {
      if (t.deficit <= -2) continue;
      let need = Math.ceil(Math.max(0, t.deficit) / isl.defense) + 1 + P.margin;
      const need0 = need;
      const helpers = mine
        .filter((h) => h !== isl && !threatened.has(h.id) && h.troops >= 3)
        .map((h) => ({ h, eta: engine.travelTime(h, isl) }))
        .filter((x) => x.eta < t.last - 0.15)
        .sort((p, q) => p.eta - q.eta);
      for (const { h } of helpers) {
        if (need <= 0) break;
        const spare = h.troops - Math.max(1, guard.get(h.id) || 0);
        const n = Math.min(spare, need);
        if (n >= 2 && send(h, isl, n)) need -= n;
        if (!P.combine) break;
      }
      if (need === need0 && t.deficit > 0) doomed.add(isl.id);
    }
    incoming = incomingMap(engine);
  }

  /* ---------------- 1b. an island that cannot be saved strikes out (or evacuates) */
  if (P.evac) {
    for (const id of doomed) {
      const S = engine.byId.get(id);
      if (!S || S.owner !== me || S.troops < 3) continue;
      const t = threatened.get(id);
      // only when the blow is about to land and no friendly fleet is on its way
      if (!t || t.first > 1.8) continue;
      if ((incoming.get(id) || []).some((f) => f.owner === me)) continue;
      let best = null;
      for (const T of engine.islands) {
        if (T === S) continue;
        const eta = engine.travelTime(S, T);
        if (T.owner === me) {
          const sc = 1 / (eta + 2);
          if (!threatened.has(T.id) && (!best || sc * 0.5 > best.sc)) best = { T, sc: sc * 0.5 };
          continue;
        }
        const D = projected(T, eta, me, incoming);
        if (D < 0 || Math.floor(D * T.defense) + 1 > S.troops) continue;
        const sc = (T.rate * 10 + (T.owner !== NEUTRAL ? 6 : 2)) / (eta + 2);
        if (!best || sc > best.sc) best = { T, sc };
      }
      if (best) send(S, best.T, S.troops);
    }
    incoming = incomingMap(engine);
  }

  /* ---------------- 2. attack / expand */
  for (let action = 0; action < P.actions; action++) {
    const sources = mine.filter((s) => s.owner === me && !threatened.has(s.id) && s.troops >= P.minSend);
    if (!sources.length) break;
    const cands = [];
    for (const T of engine.islands) {
      if (T.owner === me) continue;
      const hostile = T.owner !== NEUTRAL;
      let value = T.rate * 12 + T.cap / 25 + (T.type === "farm" || T.type === "capital" ? 3 : 0);
      if (hostile) value *= 1.5 * P.hostile;
      // closer to home = easier to hold
      let near = Infinity;
      for (const s of mine) near = Math.min(near, dist(s, T));
      value += 6 / (1 + near * 0.25);
      // risk: strong hostile islands right next to the target
      let risk = 0;
      for (const H of hostiles) if (H !== T && H.owner !== T.owner) {
        const d = dist(H, T);
        if (d < 9) risk += H.troops * (1 - d / 9) * 0.35;
      }
      // single-source options
      for (const S of sources) {
        const eta = engine.travelTime(S, T);
        const D = projected(T, eta, me, incoming);
        if (D < -0.5) continue; // my fleets already cover it
        const need = Math.max(3, Math.floor(Math.max(0, D) * T.defense) + 1 + P.margin);
        const avail = S.troops - Math.max(Math.floor(S.troops * P.keep), guard.get(S.id) || 0);
        if (avail < need) continue;
        const amount = Math.min(avail, need + Math.round((avail - need) * P.extra));
        const score = value / (need + eta * 1.6 + risk * 0.5 + 4);
        cands.push({ score, parts: [[S, amount]], T });
      }
      // coordinated attack from several islands landing close together
      if (P.combine && sources.length > 1) {
        const opts = sources.map((S) => ({ S, eta: engine.travelTime(S, T) })).sort((p, q) => p.eta - q.eta);
        let sum = 0;
        const parts = [];
        for (const o of opts) {
          if (parts.length && o.eta - opts[0].eta > 3.5) break;
          const avail = o.S.troops - Math.max(Math.floor(o.S.troops * P.keep), guard.get(o.S.id) || 0);
          if (avail < 3) continue;
          parts.push([o.S, avail, o.eta]);
          sum += avail;
          const D = projected(T, o.eta, me, incoming);
          const need = Math.floor(Math.max(0, D) * T.defense) + 1 + P.margin;
          if (parts.length > 1 && sum >= need) {
            // trim each part proportionally to what is needed (+ a little)
            const k = Math.min(1, (need + P.margin) / sum);
            const trimmed = parts.map(([s, a]) => [s, Math.min(a, Math.max(3, Math.ceil(a * k)))]);
            const score = (value / (need + o.eta * 1.6 + risk * 0.5 + 4)) * 0.92;
            cands.push({ score, parts: trimmed, T });
            break;
          }
        }
      }
    }
    if (!cands.length) break;
    cands.sort((p, q) => q.score - p.score);
    let pick = cands[0];
    if (P.sloppy && rand() < P.sloppy) {
      // easy commanders sometimes go for a poor target with half an island
      const S = sources[Math.floor(rand() * sources.length)];
      const others = engine.islands.filter((i) => i.owner !== me);
      const T = others[Math.floor(rand() * others.length)];
      if (S && T) pick = { parts: [[S, Math.max(P.minSend, Math.floor(S.troops / 2))]], T };
    }
    let any = false;
    for (const [S, n] of pick.parts) if (send(S, pick.T, Math.min(n, S.troops))) any = true;
    if (!any) break;
    incoming = incomingMap(engine);
  }

  /* ---------------- 3. feed the frontline */
  if (P.frontline && hostiles.length && rand() < P.frontline) {
    const front = (i) => {
      let d = Infinity;
      for (const H of hostiles) d = Math.min(d, dist(i, H));
      return d;
    };
    const ranked = mine.map((i) => ({ i, d: front(i) })).sort((p, q) => p.d - q.d);
    const frontIsl = ranked[0];
    for (const { i, d } of ranked.slice(1).reverse()) {
      if (d < frontIsl.d + 3 || threatened.has(i.id)) continue;
      if (i.troops >= i.cap * 0.6 && i.troops >= 12) {
        send(i, frontIsl.i, Math.floor(i.troops * 0.6));
        break;
      }
    }
  }
}
