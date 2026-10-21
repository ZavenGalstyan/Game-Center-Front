/**
 * Motel 6: Last Guest — pure game logic (no React / Three). State is a plain
 * JSON object, every action returns a NEW state, so saves are just
 * JSON.stringify(state) and the headless tests drive the whole campaign.
 */
import {
  NIGHTS, NIGHT_COUNT, RULES, rulesForNight, CALLS, EVIDENCE_BY_ID, CRITICAL, REGISTER_NAMES, LOCKBOX_CODE,
  boardForNight, RESIDENT_PLATES, SAVE_VERSION, FAIL_SUSPICION, ENDING_BY_ID, NOTES,
} from "./data.js";
import { GUESTS, samePortrait } from "./guests.js";

/* ------------------------------------------------------------------ text helpers */
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}
export function spokenDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const sfx = d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th";
  return `${MONTHS[m - 1]} ${d}${sfx}, ${y}`;
}
export const shortName = (name) => {
  const p = name.split(" ");
  return `${p[0][0]}. ${p[p.length - 1]}`;
};
export const nightDate = (n) => NIGHTS[n].date;
export function clockFor(night, step) {
  const steps = NIGHTS[night].steps.length;
  const mins = Math.round((step / Math.max(1, steps)) * 400); // 11:00 PM → ~5:40 AM
  const t = 23 * 60 + mins;
  const h = Math.floor(t / 60) % 24, m = t % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h >= 12 && h < 24 ? "PM" : "AM"}`;
}

/* ------------------------------------------------------------------ board / lot */
export const ROOM_COUNT = 12;
export function baseBoard(night) {
  const b = {};
  const src = boardForNight(night);
  for (let r = 1; r <= ROOM_COUNT; r++) {
    const v = src[r];
    b[r] = !v ? { status: "vacant" } : v === "ooo" ? { status: "ooo" } : { status: "occupied", name: v };
  }
  return b;
}
/** Board as displayed: scripted residents + guests you accepted tonight + story flags. */
export function boardFor(s) {
  const b = baseBoard(s.night);
  for (const [id, d] of Object.entries(s.decisions)) {
    const g = GUESTS[id];
    if (!g || g.night !== s.night || d.d !== "accept" || !g.res || g.res.room > ROOM_COUNT) continue;
    b[g.res.room] = { status: "occupied", name: shortName(g.doc.name), tonight: true };
  }
  if (s.flags["n:missing5"] && b[5]) b[5] = { ...b[5], status: "occupied", name: "F. Dorsey", alert: "NOT RESPONDING" };
  if (s.flags["n:vanish4"] && b[4]) b[4] = { ...b[4], alert: "NOT RESPONDING" };
  return b;
}
export function lotPlates(g, night) {
  return [...(RESIDENT_PLATES[night] || []), ...(g && g.car ? [g.car] : [])];
}

/* ------------------------------------------------------------------ answers */
export function answerFor(g, q) {
  const L = g.lines || {};
  switch (q) {
    case "purpose": return L.purpose || "Just need some sleep.";
    case "from": return L.from || "Up the highway.";
    case "before": return L.before || "No, first time.";
    case "dob": return `${spokenDate(g.answers.dob)}.`;
    case "vehicle":
      if (g.answers.vehicle) return g.answers.vehicle;
      return g.car ? `Yes — that's mine out on the lot. Plate ${g.car}.` : "No car. I got dropped off.";
    case "word":
      return g.answers.word ? `It's "${g.answers.word}".` : "A security word? I don't think I set one.";
    case "code":
      return g.answers.code ? `${g.answers.code}.` : "I don't have one — I don't have a booking.";
    default: return "…";
  }
}

/* ------------------------------------------------------------------ inspection */
const CHECK_RULE = {};
for (const r of RULES) for (const c of r.checks) CHECK_RULE[c] = r.id;

/**
 * Every rule the guest breaks under the rules active on `night`, derived only
 * from data the player can see (documents, board, lot camera, answers, CCTV).
 */
export function checkGuest(g, night) {
  const active = new Set(rulesForNight(night).map((r) => r.id));
  const date = nightDate(night);
  const out = [];
  const add = (key, detail) => {
    const rule = CHECK_RULE[key];
    if (active.has(rule)) out.push({ key, rule, detail });
  };
  const { doc, res } = g;
  if (doc.expires < date) add("expired", `The ID expired on ${fmtDate(doc.expires)} — tonight is ${fmtDate(date)}.`);
  if (!samePortrait(doc.photo, g.face)) add("photo", "The ID photo shows someone else (different hair, face or features).");
  if (!res) add("noReservation", "There is no reservation under this name.");
  if (res && res.name !== doc.name) add("name", `The reservation is for "${res.name}" but the ID says "${doc.name}".`);
  if (res && res.idLast4 !== doc.number.slice(-4)) add("last4", `Reservation ID digits …${res.idLast4} ≠ ID number ${doc.number}.`);
  if (doc.number.slice(0, 2) !== doc.state) add("issuer", `ID number ${doc.number} doesn't start with ${doc.state} (the issuing state).`);
  if (res && res.checkIn !== date) add("date", `The reservation is for ${fmtDate(res.checkIn)}, not tonight.`);
  if (res && res.room <= ROOM_COUNT) {
    const b = baseBoard(night)[res.room];
    const own = g.returning && b.status === "occupied" && b.name === shortName(doc.name);
    if (b.status === "ooo") add("room", `Room ${res.room} is out of order.`);
    else if (b.status === "occupied" && !own) add("room", `Room ${res.room} is already occupied by ${b.name}.`);
  }
  if (res && res.room === 13) add("room13", "The reservation is for Room 13.");
  if (g.answers.dob !== doc.dob) add("dob", `Said they were born ${spokenDate(g.answers.dob)} — the ID says ${fmtDate(doc.dob)}.`);
  if (g.cctv !== "normal") add("cctv", g.cctv === "absent" ? "CAM 1 shows nobody standing at the desk." : "CAM 1 shows something that is not the person at the desk.");
  if (res && res.plate && !lotPlates(g, night).includes(res.plate)) add("vehicle", `Plate ${res.plate} from the reservation isn't on the lot.`);
  if (res && res.word && g.answers.word !== res.word) add("word", `Gave the security word "${g.answers.word || "—"}", the booking says "${res.word}".`);
  if (!doc.seal) add("uv", "Under UV the ID shows no state seal.");
  if (res && g.answers.code !== res.code) add("code", `Gave confirmation code ${g.answers.code || "—"}, the booking says ${res.code}.`);
  if (REGISTER_NAMES.includes(doc.name)) add("register", `"${doc.name}" is written in the 1979 register.`);
  return out;
}
export const shouldReject = (g, night) => checkGuest(g, night).length > 0;

/* ------------------------------------------------------------------ state */
const clone = (o) => JSON.parse(JSON.stringify(o));
function snapshot(s) {
  const c = clone(s);
  delete c.nightStart;
  return c;
}
function baseState() {
  return {
    v: SAVE_VERSION, night: 1, step: 0, queue: [], phase: "intro",
    stats: { correct: 0, mistakes: 0, suspicion: 0 },
    evidence: [], evNight: {}, flags: {}, decisions: {}, confiscated: [],
    nightStart: {}, reached: 1, ending: null,
  };
}
export function newGame() {
  return startNight(baseState(), 1);
}
export function startNight(s0, n) {
  const s = clone(s0);
  s.flags = Object.fromEntries(Object.entries(s.flags).filter(([k]) => !k.startsWith("n:")));
  s.flags.power = true;
  if (n >= 6) s.flags.uv = true; // the lamp stays on the desk after night 5
  s.night = n;
  s.step = 0;
  s.queue = [];
  s.phase = "intro";
  s.ending = null;
  if (n > 1) s.stats.suspicion = Math.round(s.stats.suspicion * 0.6);
  s.reached = Math.max(s.reached || 1, n);
  s.decisions = Object.fromEntries(Object.entries(s.decisions).filter(([id]) => GUESTS[id] && GUESTS[id].night < n));
  s.nightStart = Object.fromEntries(Object.entries(s.nightStart || {}).filter(([k]) => Number(k) < n));
  s.nightStart[n] = snapshot(s);
  return s;
}
/** Restore the snapshot taken when night `n` began (retry / night select). */
export function restartNight(s, n = s.night) {
  const snap = s.nightStart?.[n];
  if (!snap) return s;
  const keep = Object.fromEntries(Object.entries(s.nightStart).filter(([k]) => Number(k) <= n));
  return { ...clone(snap), nightStart: clone(keep), reached: Math.max(s.reached || 1, snap.reached || 1) };
}
export function beginShift(s0) {
  const s = { ...clone(s0), phase: "play" };
  if (!currentStep(s)) s.phase = "summary";
  return s;
}

export function currentStep(s) {
  if (s.queue.length) return s.queue[0];
  return NIGHTS[s.night].steps[s.step] || null;
}
function advance(s) {
  if (s.queue.length) s.queue.shift();
  else s.step += 1;
  if (s.phase === "play" && !currentStep(s)) s.phase = "summary";
  return s;
}
export function completeStep(s0) {
  return advance(clone(s0));
}

/* ------------------------------------------------------------------ evidence */
function grant(s, id) {
  if (!EVIDENCE_BY_ID[id] || s.evidence.includes(id)) return false;
  s.evidence.push(id);
  s.evNight[id] = s.night;
  return true;
}
export const criticalCount = (s) => CRITICAL.filter((id) => s.evidence.includes(id)).length;
export const hasAllCritical = (s) => criticalCount(s) === CRITICAL.length;

/* ------------------------------------------------------------------ effects */
export function applyFx(s0, fx) {
  const s = clone(s0);
  if (fx === "outage") s.flags.power = false;
  if (fx === "door13") s.flags["n:door13"] = true;
  if (fx === "dorsey") {
    s.flags.keyDropped = true;
    s.flags["n:missing5"] = true;
  }
  if (fx === "vanish" && s.decisions.n4_brooks?.d === "accept") s.flags["n:vanish4"] = true;
  return advance(s);
}
/** A blocking task finishes as soon as its flag is set. */
export function settleTask(s0) {
  const st = currentStep(s0);
  if (!st || st.t !== "task" || !s0.flags[st.flag]) return s0;
  return completeStep(s0);
}

/* ------------------------------------------------------------------ world props */
export function propVisible(s, id) {
  switch (id) {
    case "drawer": return !s.evidence.includes("c_note");
    case "brochures": return true;
    case "photo": return !s.evidence.includes("x_photo");
    case "key5": return !!s.flags.keyDropped && !s.evidence.includes("c_key");
    case "diary": return s.night >= 5 && !s.evidence.includes("c_diary");
    case "lockbox": return !s.evidence.includes("c_register");
    default: return true;
  }
}
/** Examine a prop in the world. Returns { state, msg, got?: evidenceId, keypad?: true } */
export function interact(s0, id) {
  const s = clone(s0);
  let msg = "", got = null;
  switch (id) {
    case "drawer":
      if (grant(s, "c_note")) { got = "c_note"; msg = "Under the drawer liner: a folded note."; }
      else msg = "Rubber bands, a dead pen, a roll of mints.";
      break;
    case "brochures":
      if (s.night >= 2 && grant(s, "c_brochure")) { got = "c_brochure"; msg = "Behind the new brochures: an old, yellowed one."; }
      else if (s.night < 2) msg = "Brochures: the reservoir, a dinosaur museum, a corn maze. Something is stuck behind the rack, but you can't reach it tonight.";
      else msg = "Brochures for places nobody visits.";
      break;
    case "photo":
      if (grant(s, "x_photo")) { got = "x_photo"; msg = "An old staff photograph. You take it down for a closer look."; }
      break;
    case "key5":
      if (s.flags.keyDropped && grant(s, "c_key")) { got = "c_key"; msg = "A room key on the carpet. Tag: 5."; }
      break;
    case "door5":
      if (s.night === 4 && s.flags["n:missing5"]) {
        s.flags["n:room5"] = true;
        msg = "Room 5 is ajar. The bed is made, the suitcase is open, the TV is on with no signal. Nobody is inside.";
      } else msg = "Room 5. Silence.";
      break;
    case "diary":
      if (grant(s, "c_diary")) { got = "c_diary"; msg = "A torn diary page, tucked behind the breaker box."; }
      break;
    case "breaker":
      if (!s.flags.power) {
        s.flags.power = true;
        msg = "You throw the main switch. The building shudders back to life.";
        if (!s.flags.uv && s.night >= 5) {
          s.flags.uv = true;
          msg += " In the toolbox beside the panel: a UV lamp. You take it to the desk.";
        }
      } else msg = "The breaker panel hums. Everything is on.";
      break;
    case "lockbox":
      if (s.evidence.includes("c_register")) msg = "The lockbox is empty now.";
      else return { state: s, msg: "A rusted lockbox with a four-digit dial.", keypad: true };
      break;
    case "frontdoor":
      msg = "The rule is simple: you don't leave the building at night. The rain hammers the glass.";
      break;
    case "door13wall":
      msg = s.night >= 3 ? "A painted-over doorframe at the end of the hall. The paint is cold. Something on the other side is breathing." : "The end of the hallway. Under the paint you can see the outline of a door frame.";
      break;
    default:
      if (id.startsWith("door")) {
        const r = Number(id.slice(4));
        const b = boardFor(s)[r];
        msg = !b ? "A door." : b.status === "ooo" ? `Room ${r} — OUT OF ORDER. Water stains spread from under the door.` : b.status === "occupied" ? `Room ${r}. A TV murmurs inside.` : `Room ${r}. Vacant.`;
      }
  }
  const out = settleTask(s);
  return { state: out, msg, got };
}
export function tryLockbox(s0, code) {
  if (String(code) !== LOCKBOX_CODE) return { state: s0, ok: false };
  const s = clone(s0);
  grant(s, "c_register");
  return { state: s, ok: true, got: "c_register" };
}
/** CCTV still capture. cam: 1 lobby · 2 lot · 3 hallway · 4 storage */
export function capture(s0, cam) {
  const s = clone(s0);
  const st = currentStep(s);
  if (cam === 3 && s.flags["n:door13"] && grant(s, "c_tape")) return { state: s, got: "c_tape", msg: "Captured: a door that isn't there." };
  if (cam === 1 && st && st.t === "final" && grant(s, "c_face")) return { state: s, got: "c_face", msg: "Captured. The still frame shows what the live feed hides." };
  return { state: s, got: null, msg: "Still saved. Nothing unusual on this frame." };
}

/* ------------------------------------------------------------------ decisions */
const ACCEPT_PENALTY = { invalid: 8, forger: 15, entity: 30 };
export function decide(s0, guestId, decision, reason = null) {
  const s = clone(s0);
  const g = GUESTS[guestId];
  const v = checkGuest(g, s.night);
  const reject = decision === "reject";
  const correct = reject === v.length > 0;
  const cited = reject && v.some((x) => x.rule === reason);
  const queue = [];
  const st = s.stats;
  if (correct) {
    st.correct += 1;
    st.suspicion = Math.max(0, st.suspicion - 4);
    if (reject && !cited) st.suspicion += 3;
    if (cited && g.truth === "forger") {
      s.confiscated.push(g.doc.name);
      grant(s, "x_ids");
    }
  } else {
    st.mistakes += 1;
    if (reject) {
      st.suspicion += 10;
      if (!s.flags["n:complaint"]) { s.flags["n:complaint"] = true; queue.push({ t: "call", id: "complaint" }); }
    } else {
      st.suspicion += ACCEPT_PENALTY[g.truth] || 8;
      if (g.truth === "entity") {
        queue.push({ t: "fx", fx: "flicker" });
        if (!s.flags["n:scare"]) { s.flags["n:scare"] = true; queue.push({ t: "fx", fx: "scare_face" }); }
        if (!s.flags["n:consOutage"] && s.flags.power) {
          s.flags["n:consOutage"] = true;
          queue.push({ t: "fx", fx: "outage" }, { t: "task", flag: "power", objective: "Something you let in cut the power. Reset the breaker in the storage room." });
        }
      } else if (g.truth === "forger") queue.push({ t: "fx", fx: "incident" });
      else if (!s.flags["n:writeup"]) { s.flags["n:writeup"] = true; queue.push({ t: "call", id: "writeup" }); }
    }
  }
  st.suspicion = Math.min(FAIL_SUSPICION, st.suspicion);
  s.decisions[guestId] = { d: decision, reason: reject ? reason : null, correct, cited, night: s.night };
  // the guest step is never queued, so advancing moves the script on
  if (s.queue.length === 0) s.step += 1;
  s.queue.push(...queue);
  if (st.suspicion >= FAIL_SUSPICION) s.phase = "failed";
  else if (!currentStep(s)) s.phase = "summary";
  return { state: s, result: { correct, cited, violations: v, truth: g.truth, decision } };
}
export function decideFinal(s0, choice) {
  const s = clone(s0);
  const g = GUESTS.n7_voss;
  if (choice === "name" && !hasAllCritical(s)) choice = "reject";
  const ending = choice === "accept" ? "bad" : choice === "name" ? "secret" : "good";
  s.decisions[g.id] = { d: choice, reason: null, correct: choice !== "accept", cited: false, night: 7 };
  if (choice === "accept") s.stats.mistakes += 1;
  else s.stats.correct += 1;
  s.phase = "ended";
  s.ending = ending;
  s.step = NIGHTS[7].steps.length;
  s.queue = [];
  return s;
}
export function nextNight(s) {
  if (s.night >= NIGHT_COUNT) return s;
  return startNight(s, s.night + 1);
}

/* ------------------------------------------------------------------ summary */
export function nightGuests(n) {
  return NIGHTS[n].steps.filter((x) => x.t === "guest" || x.t === "final").map((x) => GUESTS[x.id]);
}
export function nightSummary(s, n = s.night) {
  const rows = nightGuests(n).map((g) => {
    const d = s.decisions[g.id];
    const v = checkGuest(g, n);
    return {
      id: g.id, name: g.doc.name, truth: g.truth, decision: d?.d || null, correct: d ? d.correct : null, cited: d?.cited || false,
      reason: d?.reason ? RULES.find((r) => r.id === d.reason)?.title : null,
      explain: v.length ? v.map((x) => x.detail) : ["All documents were in order."],
    };
  });
  const found = s.evidence.filter((id) => s.evNight[id] === n);
  return { rows, found, stats: { ...s.stats }, critical: criticalCount(s) };
}

/* ------------------------------------------------------------------ save validation */
const PHASES = new Set(["intro", "play", "summary", "failed", "ended"]);
const FX = new Set(["flicker", "knock", "outage", "door13", "scare_window", "scare_face", "dorsey", "vanish", "incident", "knock13", "whispers"]);
const int = (v, lo, hi, d) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
function cleanStep(x) {
  if (!x || typeof x !== "object") return null;
  if (x.t === "fx" && FX.has(x.fx)) return { t: "fx", fx: x.fx };
  if (x.t === "call" && CALLS[x.id]) return { t: "call", id: x.id };
  if (x.t === "note" && NOTES[x.id]) return { t: "note", id: x.id };
  if (x.t === "task" && typeof x.flag === "string" && x.flag.length < 40) return { t: "task", flag: x.flag, objective: String(x.objective || "Restore power.").slice(0, 200) };
  return null;
}
function cleanCore(r) {
  const night = int(r.night, 1, NIGHT_COUNT, 1);
  const steps = NIGHTS[night].steps.length;
  const s = baseState();
  s.night = night;
  s.step = int(r.step, 0, steps, 0);
  s.queue = (Array.isArray(r.queue) ? r.queue : []).map(cleanStep).filter(Boolean).slice(0, 8);
  s.phase = PHASES.has(r.phase) ? r.phase : "intro";
  const st = r.stats || {};
  s.stats = { correct: int(st.correct, 0, 999, 0), mistakes: int(st.mistakes, 0, 999, 0), suspicion: int(st.suspicion, 0, FAIL_SUSPICION, 0) };
  s.evidence = [...new Set((Array.isArray(r.evidence) ? r.evidence : []).filter((id) => EVIDENCE_BY_ID[id]))];
  for (const id of s.evidence) s.evNight[id] = int(r.evNight?.[id], 1, NIGHT_COUNT, night);
  if (r.flags && typeof r.flags === "object") {
    for (const [k, v] of Object.entries(r.flags)) if (typeof k === "string" && k.length < 40 && typeof v === "boolean") s.flags[k] = v;
  }
  if (typeof s.flags.power !== "boolean") s.flags.power = true;
  if (r.decisions && typeof r.decisions === "object") {
    for (const [id, d] of Object.entries(r.decisions)) {
      const g = GUESTS[id];
      if (!g || g.night > night || !d || !["accept", "reject", "name"].includes(d.d)) continue;
      s.decisions[id] = { d: d.d, reason: RULES.some((x) => x.id === d.reason) ? d.reason : null, correct: !!d.correct, cited: !!d.cited, night: g.night };
    }
  }
  s.confiscated = (Array.isArray(r.confiscated) ? r.confiscated : []).filter((x) => typeof x === "string").slice(0, 40);
  s.reached = int(r.reached, night, NIGHT_COUNT, night);
  s.ending = ENDING_BY_ID[r.ending] ? r.ending : null;
  if (s.phase === "ended" && !s.ending) s.phase = "intro";
  if (s.phase !== "ended") s.ending = null;
  if (s.phase === "failed" && s.stats.suspicion < FAIL_SUSPICION) s.phase = "play";
  // the finale can't be skipped: night 7 always ends through decideFinal()
  if (night === 7 && s.phase !== "ended" && !currentStep(s)) {
    s.step = NIGHTS[7].steps.findIndex((x) => x.t === "final");
    if (s.phase !== "intro") s.phase = "play";
  }
  if (s.phase === "play" && !currentStep(s)) s.phase = "summary";
  if (s.phase === "summary" && currentStep(s) && s.queue.length === 0 && s.step < steps) s.phase = "play";
  return s;
}
/** Validate anything that came out of localStorage. Returns a playable state or null. */
export function sanitize(raw) {
  try {
    if (!raw || typeof raw !== "object" || raw.v !== SAVE_VERSION) return null;
    const s = cleanCore(raw);
    s.nightStart = {};
    const ns = raw.nightStart && typeof raw.nightStart === "object" ? raw.nightStart : {};
    for (let n = 1; n <= s.night; n++) {
      const snap = ns[n];
      if (snap && typeof snap === "object" && int(snap.night, 1, 7, 0) === n) {
        const c = cleanCore(snap);
        c.step = 0; c.queue = []; c.phase = "intro"; c.ending = null;
        delete c.nightStart;
        s.nightStart[n] = c;
      }
    }
    if (!s.nightStart[s.night]) {
      // rebuild the current night's start from what we have, so Retry always works
      const c = cleanCore({ ...raw, step: 0, queue: [], phase: "intro", ending: null });
      c.decisions = Object.fromEntries(Object.entries(c.decisions).filter(([id]) => GUESTS[id].night < s.night));
      delete c.nightStart;
      s.nightStart[s.night] = c;
    }
    return s;
  } catch {
    return null;
  }
}
export function sanitizeRecords(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    endings: [...new Set((Array.isArray(r.endings) ? r.endings : []).filter((e) => ENDING_BY_ID[e]))],
    runs: int(r.runs, 0, 9999, 0),
    best: int(r.best, 0, NIGHT_COUNT, 0),
  };
}
