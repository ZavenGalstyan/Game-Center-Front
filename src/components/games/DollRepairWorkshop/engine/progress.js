/**
 * Doll Repair Workshop — save model (localStorage), economy, progression and
 * daily challenges. Pure functions on a plain save object so the UI and the
 * headless tests share the exact same rules.
 *
 * Money: orders pay a 25% deposit on acceptance and the balance on
 * delivery; the total depends on quality, time bonus and tips. Purchases
 * deduct money and are refused when you can't afford them or the level gate
 * isn't met. Restarting a job refunds the supplies it used; permanent
 * progress is never wiped by Restart.
 */
import { TOOLS, SUPPLIES, PARTS, UPGRADES, UPGRADE_ORDER, STORAGE_CAP, MAX_LEVEL, xpToNext, START_INVENTORY, START_MONEY } from "../data/items.js";
import { ORDERS, ORDER_BY_ID, walkInOrder } from "../data/orders.js";
import { hashStr, mulberry, clamp } from "./rng.js";

export const SAVE_KEY = "doll-repair-workshop-save";
export const SAVE_VERSION = 1;
export const DEFAULT_SETTINGS = { music: 0.5, sfx: 0.8, quality: "high", hints: true, invertX: false, sens: 1 };
export const DEPOSIT = 0.25;

export function freshSave() {
  const tools = {};
  for (const [id, t] of Object.entries(TOOLS)) if (t.price === 0) tools[id] = true;
  const upgrades = {};
  for (const k of UPGRADE_ORDER) upgrades[k] = 0;
  return {
    v: SAVE_VERSION,
    started: false,
    money: START_MONEY,
    level: 1,
    xp: 0,
    totalXp: 0,
    tools,
    inv: { ...START_INVENTORY },
    upgrades,
    completed: {},
    active: null,
    walkSeed: 1000,
    gallery: [],
    stats: { orders: 0, fiveStars: 0, parts: 0, earned: 0, walkins: 0 },
    challenges: null,
    settings: { ...DEFAULT_SETTINGS },
    seenHow: false,
  };
}

const num = (v, d, lo = -Infinity, hi = Infinity) => (typeof v === "number" && Number.isFinite(v) ? clamp(v, lo, hi) : d);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);

export function validateSave(raw) {
  const s = freshSave();
  const o = obj(raw);
  if (!o || o.v !== SAVE_VERSION) return s;
  s.started = !!o.started;
  s.money = Math.round(num(o.money, s.money, 0, 1e9));
  s.level = Math.round(num(o.level, 1, 1, MAX_LEVEL));
  s.xp = Math.round(num(o.xp, 0, 0, 1e9));
  s.totalXp = Math.round(num(o.totalXp, 0, 0, 1e9));
  for (const id of Object.keys(obj(o.tools) || {})) if (TOOLS[id] && o.tools[id]) s.tools[id] = true;
  const inv = obj(o.inv) || {};
  s.inv = {};
  for (const [k, v] of Object.entries(inv)) if ((SUPPLIES[k] || PARTS[k]) && num(v, 0) > 0) s.inv[k] = Math.round(num(v, 0, 0, 999));
  const up = obj(o.upgrades) || {};
  for (const k of UPGRADE_ORDER) s.upgrades[k] = Math.round(num(up[k], 0, 0, UPGRADES[k].tiers.length - 1));
  for (const [id, c] of Object.entries(obj(o.completed) || {})) {
    if (!ORDER_BY_ID[id] || !obj(c)) continue;
    s.completed[id] = { stars: Math.round(num(c.stars, 1, 1, 5)), quality: Math.round(num(c.quality, 0, 0, 100)), times: Math.round(num(c.times, 1, 1, 999)) };
  }
  const a = obj(o.active);
  if (a && (ORDER_BY_ID[a.orderId] || obj(a.order))) s.active = { orderId: a.orderId ?? null, order: obj(a.order) || null, deposit: Math.round(num(a.deposit, 0, 0, 1e6)), snap: obj(a.snap), startedAt: num(a.startedAt, Date.now()) };
  s.walkSeed = Math.round(num(o.walkSeed, 1000, 1, 1e9));
  if (Array.isArray(o.gallery)) s.gallery = o.gallery.filter((g) => obj(g) && obj(g.spec) && typeof g.title === "string").slice(-40);
  const st = obj(o.stats) || {};
  for (const k of Object.keys(s.stats)) s.stats[k] = Math.round(num(st[k], 0, 0, 1e9));
  const ch = obj(o.challenges);
  if (ch && typeof ch.day === "string" && Array.isArray(ch.list)) s.challenges = { day: ch.day, list: ch.list.filter((c) => obj(c) && CHALLENGES[c.id]).map((c) => ({ id: c.id, progress: num(c.progress, 0, 0, 1e9), claimed: !!c.claimed })) };
  const set = obj(o.settings) || {};
  s.settings = {
    music: num(set.music, DEFAULT_SETTINGS.music, 0, 1),
    sfx: num(set.sfx, DEFAULT_SETTINGS.sfx, 0, 1),
    quality: set.quality === "low" ? "low" : "high",
    hints: set.hints !== false,
    invertX: !!set.invertX,
    sens: num(set.sens, 1, 0.4, 2),
  };
  s.seenHow = !!o.seenHow;
  return s;
}

export function loadSave(storage) {
  try {
    const raw = storage?.getItem(SAVE_KEY);
    return raw ? validateSave(JSON.parse(raw)) : freshSave();
  } catch {
    return freshSave();
  }
}
export function writeSave(storage, save) {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    // quota exceeded: drop gallery snapshots' oldest entries and retry once
    try {
      save.gallery = save.gallery.slice(-15);
      storage?.setItem(SAVE_KEY, JSON.stringify(save));
      return true;
    } catch {
      return false;
    }
  }
}

/* ------------------------------------------------------------- economy */
export const tier = (save, key) => save.upgrades[key] || 0;
export const capOf = (save) => STORAGE_CAP[tier(save, "storage")];
export const qty = (save, item) => save.inv[item] || 0;

export function buyTool(save, id) {
  const t = TOOLS[id];
  if (!t) return { ok: false, why: "Unknown tool" };
  if (save.tools[id]) return { ok: false, why: "Already owned" };
  if (save.level < t.level) return { ok: false, why: `Requires level ${t.level}` };
  if (save.money < t.price) return { ok: false, why: "Not enough money" };
  save.money -= t.price;
  save.tools[id] = true;
  return { ok: true };
}

export function buySupply(save, id) {
  const s = SUPPLIES[id];
  if (!s) return { ok: false, why: "Unknown item" };
  const cap = capOf(save) * (id === "solution" ? 5 : 1);
  if (qty(save, id) >= cap) return { ok: false, why: "Storage full — upgrade Storage" };
  if (save.money < s.price) return { ok: false, why: "Not enough money" };
  save.money -= s.price;
  save.inv[id] = Math.min(cap, qty(save, id) + s.pack);
  return { ok: true };
}

export function buyPart(save, id) {
  const p = PARTS[id];
  if (!p) return { ok: false, why: "Unknown part" };
  if (qty(save, id) >= capOf(save)) return { ok: false, why: "Storage full — upgrade Storage" };
  if (save.money < p.price) return { ok: false, why: "Not enough money" };
  save.money -= p.price;
  save.inv[id] = qty(save, id) + 1;
  return { ok: true };
}

export function nextUpgrade(save, key) {
  const U = UPGRADES[key];
  const cur = tier(save, key);
  return cur + 1 < U.tiers.length ? { tier: cur + 1, ...U.tiers[cur + 1] } : null;
}
export function buyUpgrade(save, key) {
  const n = nextUpgrade(save, key);
  if (!n) return { ok: false, why: "Fully upgraded" };
  if (key === "stage" && n.tier === 2 && tier(save, "stage") < 1) return { ok: false, why: "Expand to a studio first" };
  if (save.level < n.level) return { ok: false, why: `Requires level ${n.level}` };
  if (save.money < n.price) return { ok: false, why: "Not enough money" };
  save.money -= n.price;
  save.upgrades[key] = n.tier;
  return { ok: true, tier: n.tier };
}

export function consume(save, item, n = 1) {
  if (qty(save, item) < n) return false;
  save.inv[item] -= n;
  if (save.inv[item] <= 0) delete save.inv[item];
  return true;
}

/** Refund supplies a restarted job had used. */
export function refund(save, used) {
  for (const [k, v] of Object.entries(used || {})) save.inv[k] = qty(save, k) + v;
}

/* ------------------------------------------------------------ progress */
export function addXp(save, amount) {
  const levels = [];
  save.xp += amount;
  save.totalXp += amount;
  while (save.level < MAX_LEVEL && save.xp >= xpToNext(save.level)) {
    save.xp -= xpToNext(save.level);
    save.level++;
    levels.push(save.level);
  }
  if (save.level >= MAX_LEVEL) save.xp = Math.min(save.xp, 0);
  return levels;
}

/** Which story order is next, and which orders are open to the player. */
export function orderBoard(save) {
  const story = ORDERS.map((o) => ({ order: o, done: !!save.completed[o.id], locked: save.level < o.level, stars: save.completed[o.id]?.stars || 0 }));
  const next = story.find((s) => !s.done && !s.locked) || null;
  const walk = [0, 1].map((k) => walkInOrder(save.walkSeed + k * 7919, save.level));
  return { story, next, walk };
}

export function resolveOrder(save, ref) {
  if (ref && typeof ref === "object") return ref;
  return ORDER_BY_ID[ref] || null;
}

/** Tools an order needs (by damage + requests) that the player is missing. */
export function toolsNeeded(order) {
  const need = new Set();
  for (const d of order.damage) {
    if (d.kind === "dust") need.add("brush");
    if (d.kind === "dirt") need.add("sponge");
    if (d.kind === "stain") {
      need.add("spray");
      need.add("sponge");
    }
    if (d.kind === "scratch") need.add("polish");
    if (d.kind === "crack") need.add("glue");
    if (["arm", "leg", "eye", "shoe", "accessory", "button"].includes(d.kind)) need.add("pliers");
    if (d.kind === "button" || d.kind === "tear") need.add("needle");
    if (d.kind === "tangle") need.add("comb");
    if (d.kind === "bald") need.add("reroot");
    if (d.kind === "faded") need.add("paint");
  }
  for (const r of order.requests || []) {
    if (r.key === "wash") {
      need.add("shampoo");
      need.add("dryer");
    }
    if (r.key === "shine") need.add("polish");
  }
  return [...need];
}

export function acceptOrder(save, order) {
  if (save.active) return { ok: false, why: "Finish the current job first" };
  const dep = Math.round(order.budget * DEPOSIT);
  save.money += dep;
  save.active = { orderId: order.walkIn ? null : order.id, order: order.walkIn ? order : null, deposit: dep, snap: null, startedAt: Date.now() };
  save.started = true;
  return { ok: true, deposit: dep };
}

/** Payment, satisfaction and XP for a finished job. */
export function payout(save, order, result) {
  const q = result.quality;
  const stage = tier(save, "stage");
  const stageMult = [1, 1.1, 1.25][stage];
  const wait = tier(save, "waiting");
  const base = order.budget * (0.35 + 0.65 * (q / 100)) * stageMult;
  const deadline = order.time * (1 + [0, 0.15, 0.3][wait]);
  const onTime = result.elapsed <= deadline;
  const timeBonus = onTime ? Math.round(order.budget * 0.15) : 0;
  const picky = order.customer?.mood === "picky";
  const satisfaction = clamp(Math.round(q + [0, 2, 4][tier(save, "shelves")] + [0, 1, 3][tier(save, "decor")] - (picky ? 6 : 0)), 0, 100);
  const tip = satisfaction >= 88 ? Math.round(order.budget * 0.1 * (1 + [0, 0.1, 0.2][wait])) : 0;
  const total = Math.round(base) + timeBonus + tip;
  const deposit = save.active?.deposit || 0;
  const balance = Math.max(0, total - deposit);
  const xp = Math.round(order.xp * (0.5 + 0.5 * (q / 100)) * (result.stars === 5 ? 1.15 : 1));
  const mood = satisfaction >= 90 ? "delighted" : satisfaction >= 75 ? "happy" : satisfaction >= 55 ? "okay" : "disappointed";
  return { base: Math.round(base), timeBonus, tip, total, deposit, balance, xp, satisfaction, mood, onTime, deadline: Math.round(deadline) };
}

/** Bank a finished job: money, XP, stats, gallery, challenges. */
export function completeOrder(save, order, result, { snap, face = null, before = null } = {}) {
  const pay = payout(save, order, result);
  save.money += pay.balance;
  const levels = addXp(save, pay.xp);
  if (!order.walkIn) {
    const c = save.completed[order.id];
    save.completed[order.id] = { stars: Math.max(c?.stars || 0, result.stars), quality: Math.max(c?.quality || 0, result.quality), times: (c?.times || 0) + 1 };
  } else {
    save.stats.walkins++;
    save.walkSeed += 31;
  }
  save.stats.orders++;
  save.stats.earned += pay.total;
  if (result.stars === 5) save.stats.fiveStars++;
  const parts = result.tasks.filter((t) => t.kind === "part" || t.kind === "button").length;
  save.stats.parts += parts;
  save.gallery.push({
    id: `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`,
    orderId: order.id,
    title: order.title,
    customer: order.customer?.name || "",
    type: order.type,
    date: new Date().toISOString(),
    quality: result.quality,
    stars: result.stars,
    spec: { type: order.type, look: order.look, damage: order.damage, seed: seedOf(order) },
    snap,
    face,
    before,
  });
  if (save.gallery.length > 40) save.gallery.splice(0, save.gallery.length - 40);
  // challenge events
  const ev = [];
  if (result.tasks.some((t) => t.kind === "clean")) ev.push(["cleanOrder", 1]);
  if (parts) ev.push(["part", parts]);
  if (result.stars === 5) ev.push(["fiveStar", 1]);
  if (result.mistakes === 0 && result.missed === 0) ev.push(["flawless", 1]);
  if (result.tasks.length >= 6) ev.push(["hardOrder", 1]);
  ev.push(["earn", pay.total]);
  ev.push(["order", 1]);
  for (const [k, n] of ev) trackChallenge(save, k, n);
  save.active = null;
  return { pay, levels };
}

export const seedOf = (order) => (typeof order.id === "number" ? order.id * 101 : hashStr(String(order.id)) % 100000);

/* ------------------------------------------------------------ challenges */
export const CHALLENGES = {
  clean3: { label: "Clean 3 dolls", event: "cleanOrder", target: 3, money: 90, xp: 60 },
  parts5: { label: "Replace 5 broken parts", event: "part", target: 5, money: 120, xp: 80 },
  five3: { label: "Earn three 5-star ratings", event: "fiveStar", target: 3, money: 150, xp: 100 },
  flawless: { label: "Finish a restoration with no mistakes", event: "flawless", target: 1, money: 110, xp: 70 },
  hard1: { label: "Finish a difficult order (6+ repairs)", event: "hardOrder", target: 1, money: 140, xp: 90 },
  sew2: { label: "Stitch 2 tears", event: "sew", target: 2, money: 80, xp: 50 },
  paint2: { label: "Complete 2 painting jobs", event: "paint", target: 2, money: 90, xp: 60 },
  hair2: { label: "Detangle 2 heads of hair", event: "detangle", target: 2, money: 80, xp: 50 },
  earn500: { label: "Earn $500 from customers", event: "earn", target: 500, money: 100, xp: 60 },
  crack1: { label: "Repair a crack", event: "crack", target: 1, money: 70, xp: 45 },
  orders3: { label: "Deliver 3 orders", event: "order", target: 3, money: 100, xp: 70 },
};

export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function ensureChallenges(save, day = today()) {
  if (save.challenges && save.challenges.day === day) return save.challenges;
  const r = mulberry(hashStr(day));
  const ids = Object.keys(CHALLENGES);
  const pick = [];
  while (pick.length < 3) {
    const id = ids[Math.floor(r() * ids.length)];
    if (!pick.includes(id)) pick.push(id);
  }
  save.challenges = { day, list: pick.map((id) => ({ id, progress: 0, claimed: false })) };
  return save.challenges;
}

export function trackChallenge(save, event, n = 1) {
  const ch = ensureChallenges(save);
  for (const c of ch.list) if (CHALLENGES[c.id].event === event && !c.claimed) c.progress = Math.min(CHALLENGES[c.id].target, c.progress + n);
}

export function claimChallenge(save, id) {
  const ch = ensureChallenges(save);
  const c = ch.list.find((x) => x.id === id);
  if (!c) return { ok: false, why: "Unknown challenge" };
  const C = CHALLENGES[id];
  if (c.claimed) return { ok: false, why: "Already claimed" };
  if (c.progress < C.target) return { ok: false, why: "Not finished yet" };
  c.claimed = true;
  save.money += C.money;
  const levels = addXp(save, C.xp);
  return { ok: true, money: C.money, xp: C.xp, levels };
}

/** The session's workshop connection. */
export function makeCtx(save, onChange) {
  return {
    hasTool: (id) => !!save.tools[id],
    qty: (item) => qty(save, item),
    consume: (item, n = 1) => {
      const ok = consume(save, item, n);
      if (ok) onChange?.();
      return ok;
    },
    track: (kind, n) => trackChallenge(save, kind, n),
    get tiers() {
      return save.upgrades;
    },
    get level() {
      return save.level;
    },
  };
}
