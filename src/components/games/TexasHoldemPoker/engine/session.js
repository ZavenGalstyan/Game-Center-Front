/**
 * App state = { profile, session, toasts } and its reducer.
 *
 * The reducer is the only place the poker table changes. It is pure — every
 * random input (shuffled decks, AI decisions, first button) is created by the
 * caller and passed in the action — so React StrictMode re-running it is
 * harmless and the same action always yields the same state.
 *
 * Stale or duplicate actions are rejected by `seq`: each table transition
 * bumps table.seq and every table action carries the seq it was made for.
 *
 * Bankroll (quick play): the buy-in moves from profile.bankroll onto the
 * table when a session starts / rebuys and the human's stack moves back when
 * they leave. Profile and session are saved together in one localStorage
 * write, so a reload can never count those chips twice.
 */
import { createTable, startHand, applyAction, advance, timeoutAction, validateTable } from "./table.js";
import { observeHand } from "./ai.js";
import { newTournament, afterHand, TIERS, PLACE_XP, prizeFor, blindsAt } from "./tournament.js";
import {
  handFacts, recordHand, recordTournament, recordTournamentEntry, sanitizeProfile, defaultProfile,
  REFILL_AMOUNT, COSMETICS, isUnlocked,
} from "./progress.js";

export const SAVE_KEY = "texas-holdem-poker-save";
export const SAVE_VERSION = 1;
export const MODES = ["quick", "tournament", "practice"];
export const HUMAN = 0;

export const initialApp = (loaded) => ({ profile: loaded?.profile || defaultProfile(), session: loaded?.session || null, toasts: [] });

let toastId = 0;
function withEvents(app, events, extra = []) {
  const toasts = app.toasts.slice(-4);
  if (events) {
    for (const a of events.achievements) toasts.push({ id: ++toastId, kind: "achievement", title: a.name, text: a.desc });
    if (events.levelUp) toasts.push({ id: ++toastId, kind: "level", title: `Level ${events.levelUp}!`, text: events.unlocks.length ? `Unlocked: ${events.unlocks.map((u) => u.name).join(", ")}` : "Keep climbing." });
  }
  for (const t of extra) toasts.push({ id: ++toastId, ...t });
  return { ...app, toasts };
}

/* ------------------------------------------------------------ session creation */

/**
 * action: { type: "start", mode, cfg, roster: [{name, profile, diff}], deck, dealer }
 * cfg (quick):      { players, difficulty, stack, blinds: {sb, bb} }
 * cfg (practice):   { players, difficulty, stack, blinds }
 * cfg (tournament): { tier, handsPerLevel }
 */
function startSession(app, a) {
  if (!MODES.includes(a.mode)) return app;
  let profile = app.profile;
  let cfg = { ...a.cfg };
  let tour = null;
  let events = null;
  let buyIn = 0;
  if (a.mode === "tournament") {
    const tier = TIERS[cfg.tier] || TIERS.bronze;
    if (!isUnlocked(profile, tier) || (!a.free && profile.bankroll < tier.buyIn)) return app;
    tour = newTournament({ tier: tier.id, handsPerLevel: cfg.handsPerLevel });
    cfg = { tier: tier.id, handsPerLevel: tour.handsPerLevel, players: 6, stack: tier.stack, difficulty: tier.difficulty, blinds: blindsAt(0) };
    // a GamePlayer Restart re-deals the same tournament: the entry already paid covers it
    if (!a.free) {
      profile = { ...profile, bankroll: profile.bankroll - tier.buyIn };
      ({ profile, events } = recordTournamentEntry(profile));
    }
  } else if (a.mode === "quick") {
    if (cfg.stack > profile.bankroll || cfg.stack <= 0) return app;
    buyIn = cfg.stack;
    profile = { ...profile, bankroll: profile.bankroll - cfg.stack };
  }
  const players = [{ id: "you", name: profile.name || "You", stack: cfg.stack, ai: false }];
  a.roster.slice(0, cfg.players - 1).forEach((r, k) => players.push({ id: `ai${k}-${r.profile}`, name: r.name, stack: cfg.stack, ai: true, profile: r.profile, diff: r.diff }));
  const table = createTable({ players, blinds: cfg.blinds });
  const r = startHand(table, a.deck, { dealer: a.dealer });
  if (r.error) return app;
  // sid tells tables apart (each table's seq restarts at 0) — supplied by the caller to stay pure
  const session = { v: SAVE_VERSION, sid: a.sid ?? 0, mode: a.mode, cfg, table: r.state, tour, memory: {}, buyIn, over: null, busted: false };
  return withEvents({ ...app, profile, session }, events);
}

/* ------------------------------------------------------------ hand completion */

function onHandComplete(app) {
  let { profile, session } = app;
  session = { ...session };
  let table = session.table;
  session.memory = observeHand(session.memory, table);
  let events = null;
  const extra = [];
  if (session.mode !== "practice") {
    ({ profile, events } = recordHand(profile, handFacts(table, HUMAN)));
  }
  if (session.mode === "tournament") {
    const r = afterHand(session.tour, table);
    session.tour = r.tour;
    table = r.table;
    if (r.events.levelUp) extra.push({ kind: "info", title: "Blinds up", text: `Level ${r.events.levelUp.level + 1}: ${r.events.levelUp.sb}/${r.events.levelUp.bb}` });
    for (const e of r.events.eliminated) if (e.id !== "you") extra.push({ kind: "info", title: `${e.name} eliminated`, text: `Finished #${e.place}` });
    const mine = r.events.eliminated.find((e) => e.id === "you");
    const humanWon = r.tour.done && r.tour.winner?.id === "you";
    if (mine || humanWon) {
      const place = humanWon ? 1 : mine.place;
      const tier = TIERS[session.tour.tier];
      const prize = prizeFor(session.tour, place);
      const rt = recordTournament(profile, { place, xpMult: tier.xpMult, placeXp: PLACE_XP });
      profile = { ...rt.profile, bankroll: rt.profile.bankroll + prize };
      events = mergeEvents(events, rt.events);
      session.over = { kind: "tournament", place, prize, xp: rt.events.xp, pendingSim: !r.tour.done };
    }
    session.table = table;
  } else {
    session.table = table;
    if (table.players[HUMAN].stack === 0) session.busted = true;
  }
  if (events && events.xp) session.lastXp = events.xp;
  return withEvents({ ...app, profile, session }, events, extra);
}

function mergeEvents(a, b) {
  if (!a) return b;
  return {
    xp: a.xp + b.xp,
    reasons: [...a.reasons, ...b.reasons],
    achievements: [...a.achievements, ...b.achievements],
    levelUp: b.levelUp || a.levelUp,
    unlocks: [...a.unlocks, ...b.unlocks],
  };
}

function setTable(app, table) {
  const was = app.session.table.phase;
  const next = { ...app, session: { ...app.session, table } };
  return table.phase === "complete" && was !== "complete" ? onHandComplete(next) : next;
}

/* ------------------------------------------------------------ reducer */

export function reducer(app, a) {
  const s = app.session;
  switch (a.type) {
    case "start":
      if (s) return app;
      return startSession(app, a);

    case "restart": {
      if (!s) return app;
      const back = s.mode === "quick" ? s.table.players[HUMAN].stack : 0;
      const base = { ...app, profile: { ...app.profile, bankroll: app.profile.bankroll + back }, session: null };
      const cfg = s.mode === "tournament" ? { tier: s.cfg.tier, handsPerLevel: s.cfg.handsPerLevel } : s.cfg;
      return startSession(base, { ...a, mode: s.mode, cfg, free: s.mode === "tournament" });
    }
    case "act": {
      if (!s || s.over || s.table.seq !== a.seq || s.table.toAct !== a.seat) return app;
      const r = applyAction(s.table, a.seat, a.action);
      return r.error ? app : setTable(app, r.state);
    }
    case "timeout": {
      if (!s || s.over || s.table.seq !== a.seq || s.table.toAct !== HUMAN) return app;
      const r = applyAction(s.table, HUMAN, timeoutAction(s.table, HUMAN));
      return r.error ? app : setTable(app, r.state);
    }
    case "advance": {
      if (!s || s.table.seq !== a.seq) return app;
      const r = advance(s.table);
      return r.error ? app : setTable(app, r.state);
    }
    case "next": {
      if (!s || s.over || s.table.phase !== "complete" || s.table.seq !== a.seq) return app;
      let table = { ...s.table, players: s.table.players.map((p) => ({ ...p })) };
      if (s.mode === "quick" || s.mode === "practice") {
        if (table.players[HUMAN].stack === 0) {
          if (s.mode === "quick") return app; // needs a rebuy
          table.players[HUMAN].stack = s.cfg.stack; // practice chips are free
        }
        // busted opponents rebuy so the table stays full
        table.players.forEach((p) => { if (p.ai && p.stack === 0) p.stack = s.cfg.stack; });
      }
      const r = startHand(table, a.deck);
      if (r.error) return app;
      return { ...app, session: { ...s, table: r.state, busted: false } };
    }
    case "rebuy": {
      if (!s || s.mode !== "quick" || s.table.phase !== "complete") return app;
      const amt = s.cfg.stack;
      if (app.profile.bankroll < amt || s.table.players[HUMAN].stack > 0) return app;
      const table = { ...s.table, players: s.table.players.map((p, i) => (i === HUMAN ? { ...p, stack: amt, startStack: amt } : p)) };
      return { ...app, profile: { ...app.profile, bankroll: app.profile.bankroll - amt }, session: { ...s, table, buyIn: s.buyIn + amt, busted: false } };
    }
    case "tourSimulated": {
      if (!s || s.mode !== "tournament" || !s.over?.pendingSim) return app;
      return { ...app, session: { ...s, table: a.table, tour: a.tour, over: { ...s.over, pendingSim: false } } };
    }
    case "leave": {
      if (!s) return app;
      // quick play: whatever is in front of you goes back to the bankroll;
      // chips already committed to an unfinished hand stay in that pot.
      const back = s.mode === "quick" ? s.table.players[HUMAN].stack : 0;
      return { ...app, profile: { ...app.profile, bankroll: app.profile.bankroll + back }, session: null };
    }
    case "refill": {
      if (app.profile.bankroll >= 500 || (s && s.mode === "quick")) return app;
      return { ...app, profile: { ...app.profile, bankroll: app.profile.bankroll + REFILL_AMOUNT } };
    }
    case "cosmetic": {
      const item = COSMETICS[a.slot]?.find((x) => x.id === a.id);
      if (!item || !isUnlocked(app.profile, item)) return app;
      return { ...app, profile: { ...app.profile, cosmetics: { ...app.profile.cosmetics, [a.slot]: a.id } } };
    }
    case "setting":
      return { ...app, profile: sanitizeProfile({ ...app.profile, settings: { ...app.profile.settings, [a.key]: a.value } }) };
    case "toastDone":
      return { ...app, toasts: app.toasts.filter((t) => t.id !== a.id) };
    case "resetProgress":
      return { profile: defaultProfile(), session: null, toasts: [] };
    case "load":
      return { ...app, profile: a.profile, session: a.session };
    default:
      return app;
  }
}

/* ------------------------------------------------------------ save / load */

export function validateSession(sess) {
  if (!sess || typeof sess !== "object" || sess.v !== SAVE_VERSION || !MODES.includes(sess.mode)) return "bad session";
  if (!sess.cfg || typeof sess.cfg !== "object") return "bad cfg";
  if (!sess.table || !Array.isArray(sess.table.players) || sess.table.players[HUMAN]?.ai !== false) return "bad table";
  let bank = null;
  if (sess.mode === "tournament") {
    const tier = TIERS[sess.tour?.tier];
    if (!tier || !Number.isInteger(sess.tour.level) || !Array.isArray(sess.tour.eliminated)) return "bad tournament";
    bank = tier.stack * sess.table.players.length;
  }
  const err = validateTable(sess.table, bank);
  if (err) return err;
  if (sess.memory && typeof sess.memory !== "object") return "bad memory";
  if (!Number.isFinite(sess.buyIn) || sess.buyIn < 0) return "bad buy-in";
  return null;
}

/** Reads and validates the save; never throws. */
export function loadSave(storage) {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return { profile: defaultProfile(), session: null, note: null };
    const data = JSON.parse(raw);
    if (!data || data.v !== SAVE_VERSION) return { profile: defaultProfile(), session: null, note: "Save from an unknown version was reset." };
    const profile = sanitizeProfile(data.profile);
    let session = data.session || null;
    let note = null;
    if (session) {
      const err = validateSession(session);
      if (err) {
        // a damaged quick-play table gives the buy-in back instead of losing it
        if (session.mode === "quick" && Number.isFinite(session.buyIn) && session.buyIn > 0) profile.bankroll += Math.min(Math.floor(session.buyIn), 1e9);
        session = null;
        note = "The saved table was damaged and could not be restored.";
      } else {
        session = { ...session, memory: session.memory || {}, over: session.over || null };
      }
    }
    return { profile, session, note };
  } catch {
    return { profile: defaultProfile(), session: null, note: "Save data was unreadable and was reset." };
  }
}

export function writeSave(storage, profile, session) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, profile, session }));
    return true;
  } catch {
    return false;
  }
}
