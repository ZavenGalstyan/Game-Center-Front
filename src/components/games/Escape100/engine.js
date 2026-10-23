/**
 * Escape 100 — puzzle engine. Pure JS (no Three.js, no DOM) so the game and
 * the headless level validator (tools/levelTest.mjs) run exactly the same
 * rules.
 *
 * A level is data (see levels/*.js): interactive objects, an item catalog,
 * recipes, rules, an exit lock, progressive hints and a reference solution.
 * `act(level, state, action)` is a reducer: it returns { state, fx } where fx
 * is a list of feedback events for the 3D world / UI / audio.
 *
 * Object kinds and their state:
 *  door       the exit; lock { item } | { cond }               → open
 *  container  drawer/cabinet/chest/safe/locker…; lock, contents → open, locked
 *  pickup     an item lying in the room                         → taken
 *  keypad     code entry (digits/letters/symbols/colors)        → solved
 *  switch     lever/toggle                                      → on
 *  dial       rotating ring / valve / statue with n faces       → value
 *  buttons    panel of buttons pressed in order (memory/sequence) → solved
 *  slot       socket that accepts items (swap allowed)          → placed
 *  movable    painting/rug/vent/crate that slides aside         → moved
 *  clue       readable note/poster/screen/carving (read only)
 *  wires      connect left terminals to right terminals         → solved
 *  mirrors    grid of rotatable mirrors routing a light beam    → solved
 *  timed      button that powers something for a few seconds    → active
 *  machine    visual mechanism that runs while `active` holds
 */

/* ---------------- conditions ---------------- */

export function test(L, s, c) {
  if (!c) return true;
  if (Array.isArray(c)) return c.every((x) => test(L, s, x));
  if (c.all) return c.all.every((x) => test(L, s, x));
  if (c.any) return c.any.some((x) => test(L, s, x));
  if (c.not) return !test(L, s, c.not);
  if (c.flag) return !!s.flags[c.flag];
  if (c.has) return s.inv.includes(c.has);
  if (c.got) return !!s.got[c.got];
  if (c.open) return !!s.obj[c.open]?.open;
  if (c.solved) return !!s.obj[c.solved]?.solved;
  if (c.moved) return !!s.obj[c.moved]?.moved;
  if (c.taken) return !!s.obj[c.taken]?.taken;
  if (c.unlocked) return s.obj[c.unlocked] ? !s.obj[c.unlocked].locked : false;
  if (c.active) return isActive(s, c.active);
  if (c.on) return Object.entries(c.on).every(([id, v]) => !!s.obj[id]?.on === v);
  if (c.dial) return Object.entries(c.dial).every(([id, v]) => s.obj[id]?.value === v);
  if (c.placed)
    return Object.entries(c.placed).every(([id, v]) => {
      const p = s.obj[id]?.placed;
      return v === true ? !!p : v === false ? !p : p === v;
    });
  if (c.sum) {
    const total = c.sum.slots.reduce((t, id) => t + (L.items[s.obj[id]?.placed]?.weight ?? 0), 0);
    return total === c.sum.eq;
  }
  if (c.balance) {
    const w = (ids) => ids.reduce((t, id) => t + (L.items[s.obj[id]?.placed]?.weight ?? 0), 0);
    const a = w(c.balance[0]), b = w(c.balance[1]);
    return a > 0 && a === b;
  }
  throw new Error(`unknown condition ${JSON.stringify(c)}`);
}

const isActive = (s, id) => (s.obj[id]?.until ?? 0) > s.time;

/* ---------------- state ---------------- */

export function initState(L) {
  const obj = {};
  for (const o of L.objects) {
    if (!o.id) continue; // set dressing
    const st = {};
    switch (o.kind) {
      case "container":
        st.open = !!o.startOpen;
        st.locked = !!o.lock;
        st.contents = [...(o.contents ?? [])];
        break;
      case "door":
        st.open = false;
        st.locked = true;
        break;
      case "switch":
        st.on = !!o.start;
        break;
      case "dial":
        st.value = o.start ?? 0;
        break;
      case "buttons":
        st.input = [];
        st.solved = false;
        break;
      case "slot":
        st.placed = o.start ?? null;
        break;
      case "keypad":
      case "wires":
        st.solved = false;
        break;
      case "mirrors":
        st.cells = o.cells.map((c) => ({ ...c }));
        st.solved = false;
        break;
      case "timed":
        st.until = 0;
        break;
      case "pickup":
        st.taken = false;
        break;
      case "movable":
        st.moved = false;
        break;
      default:
    }
    obj[o.id] = st;
  }
  return { obj, inv: [], got: {}, flags: {}, time: 0, won: false, read: {}, fired: {}, moves: 0 };
}

const clone = (s) => ({
  ...s,
  obj: Object.fromEntries(Object.entries(s.obj).map(([k, v]) => [k, { ...v, contents: v.contents ? [...v.contents] : undefined, input: v.input ? [...v.input] : undefined, cells: v.cells ? v.cells.map((c) => ({ ...c })) : undefined }])),
  inv: [...s.inv],
  flags: { ...s.flags },
  read: { ...s.read },
  got: { ...s.got },
  fired: { ...s.fired },
});

export const objDef = (L, id) => L.objects.find((o) => o.id === id);
export const visible = (L, s, o) => test(L, s, o.showIf) && !(o.kind === "pickup" && s.obj[o.id].taken);
export const itemName = (L, id) => L.items[id]?.name ?? id;

/* ---------------- effects ---------------- */

function apply(L, s, effects, fx) {
  for (const e of [].concat(effects ?? [])) {
    if (e.set) for (const f of [].concat(e.set)) s.flags[f] = true;
    if (e.clear) for (const f of [].concat(e.clear)) delete s.flags[f];
    if (e.give) for (const it of [].concat(e.give)) if (!s.inv.includes(it)) (s.inv.push(it), fx.push({ type: "get", item: it }));
    if (e.unlock) for (const id of [].concat(e.unlock)) if (s.obj[id]?.locked) (s.obj[id].locked = false, fx.push({ type: "unlock", id }));
    if (e.open) for (const id of [].concat(e.open)) if (s.obj[id] && !s.obj[id].open) (s.obj[id].locked = false, s.obj[id].open = true, fx.push({ type: "open", id }));
    if (e.msg) fx.push({ type: "msg", text: e.msg });
  }
}

/** After every action: fire rules whose condition became true, update the exit lock. */
function settle(L, s, fx) {
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const [i, r] of (L.rules ?? []).entries()) {
      const key = `r${i}`;
      if (r.once !== false && s.fired[key]) continue;
      if (test(L, s, r.when)) {
        if (!s.fired[key]) fx.push({ type: "solve", rule: i });
        s.fired[key] = true;
        apply(L, s, r.do, fx);
        changed = true;
      }
    }
    // condition-locked containers unlock themselves (shown with a click/pop)
    for (const o of L.objects) {
      if (o.kind === "container" && s.obj[o.id].locked && o.lock?.cond && test(L, s, o.lock.cond)) {
        s.obj[o.id].locked = false;
        fx.push({ type: "unlock", id: o.id });
        // hidden compartments (no handle) spring open by themselves
        if (o.fixed || o.autoOpen) {
          s.obj[o.id].open = true;
          fx.push({ type: "open", id: o.id });
          apply(L, s, o.onOpen, fx);
        }
        changed = true;
      }
      if (o.kind === "door" && s.obj[o.id].locked && L.exit.cond && test(L, s, L.exit.cond)) {
        s.obj[o.id].locked = false;
        fx.push({ type: "doorUnlock", id: o.id });
        changed = true;
      }
    }
    if (!changed) break;
  }
}

/* ---------------- mirrors ---------------- */

const DIRS = { E: [1, 0], W: [-1, 0], N: [0, -1], S: [0, 1] };
// "/" mirror: E→N, N→E, W→S, S→W ; "\" mirror: E→S, S→E, W→N, N→W
const BOUNCE = { "/": { E: "N", N: "E", W: "S", S: "W" }, "\\": { E: "S", S: "E", W: "N", N: "W" } };

/** Traces the beam on a mirrors board. Returns { path: [[x,y]…], hit: targetIndex|-1 } */
export function traceBeam(o, cells) {
  const at = (x, y) => cells.find((c) => c.x === x && c.y === y);
  let [x, y] = o.source.at;
  let dir = o.source.dir;
  const path = [[x, y]];
  for (let n = 0; n < 200; n++) {
    x += DIRS[dir][0];
    y += DIRS[dir][1];
    if (x < 0 || y < 0 || x >= o.size[0] || y >= o.size[1]) {
      path.push([x, y]);
      return { path, hit: -1 };
    }
    path.push([x, y]);
    const t = o.targets.findIndex((t) => t[0] === x && t[1] === y);
    if (t >= 0) return { path, hit: t };
    const c = at(x, y);
    if (c) {
      if (c.block) return { path, hit: -1 };
      dir = BOUNCE[c.m][dir];
    }
  }
  return { path, hit: -1 };
}

/* ---------------- the reducer ---------------- */

const fail = (s, fx, text, sound = "deny") => (fx.push({ type: "msg", text, bad: true }, { type: "sfx", name: sound }), { state: s, fx, ok: false });

export function act(L, s0, a) {
  const r = act0(L, s0, a);
  for (const it of r.state.inv) if (!r.state.got[it]) (r.state === s0 ? null : (r.state.got[it] = true));
  return r;
}

function act0(L, s0, a) {
  const fx = [];
  if (s0.won) return { state: s0, fx, ok: false };
  const s = clone(s0);
  s.moves++;
  const o = a.id ? objDef(L, a.id) : null;
  if (a.id && !o) throw new Error(`no object ${a.id}`);
  if (o && !visible(L, s, o)) return fail(s0, fx, "There's nothing there.");
  const st = o ? s.obj[o.id] : null;
  if (o?.needs && !test(L, s, o.needs.cond)) return fail(s0, fx, o.needs.msg || "It doesn't respond.");

  switch (a.a) {
    case "click": {
      switch (o.kind) {
        case "door":
          if (st.locked) return fail(s0, fx, L.exit.lockedMsg || "The door is locked.", "locked");
          st.open = true;
          s.won = true;
          fx.push({ type: "doorOpen", id: o.id }, { type: "win" });
          break;
        case "container":
          if (st.open) {
            if (o.fixed) return fail(s0, fx, "It's already open.", "tap");
            st.open = false;
            fx.push({ type: "close", id: o.id });
            break;
          }
          if (st.locked) return fail(s0, fx, o.lockedMsg || (o.lock?.item ? "It's locked. Maybe something here fits." : "It won't open yet."), "locked");
          st.open = true;
          fx.push({ type: "open", id: o.id });
          apply(L, s, o.onOpen, fx);
          break;
        case "pickup":
          st.taken = true;
          if (!s.inv.includes(o.item)) s.inv.push(o.item);
          fx.push({ type: "get", item: o.item, id: o.id });
          apply(L, s, o.onTake, fx);
          break;
        case "switch":
          st.on = !st.on;
          fx.push({ type: "toggle", id: o.id, on: st.on });
          // linked switches (lights-out style puzzles) flip too
          for (const id of o.flip ?? []) {
            s.obj[id].on = !s.obj[id].on;
            fx.push({ type: "toggle", id, on: s.obj[id].on });
          }
          break;
        case "dial":
          st.value = (st.value + (a.dir === -1 ? o.faces.length - 1 : 1)) % o.faces.length;
          fx.push({ type: "turn", id: o.id, value: st.value });
          // geared discs drag their linked neighbours one step too
          for (const id of o.links ?? []) {
            const d = objDef(L, id);
            s.obj[id].value = (s.obj[id].value + 1) % d.faces.length;
            fx.push({ type: "turn", id, value: s.obj[id].value });
          }
          break;
        case "movable":
          if (st.moved) return fail(s0, fx, "You've already moved it.", "tap");
          if (o.lock?.item) return fail(s0, fx, o.lockedMsg || "It's fastened tight. You need a tool.", "locked");
          st.moved = true;
          fx.push({ type: "move", id: o.id });
          apply(L, s, o.onMove, fx);
          break;
        case "clue":
          s.read[o.id] = true;
          fx.push({ type: "read", id: o.id });
          break;
        case "timed":
          st.until = s.time + (o.seconds ?? 6);
          fx.push({ type: "timed", id: o.id, seconds: o.seconds ?? 6 });
          break;
        case "slot":
          if (st.placed && o.swap !== false) {
            if (!s.inv.includes(st.placed)) s.inv.push(st.placed);
            fx.push({ type: "unplace", id: o.id, item: st.placed });
            st.placed = null;
            break;
          }
          return fail(s0, fx, o.emptyMsg || "Something should go here.", "tap");
        case "keypad":
        case "wires":
        case "buttons":
        case "mirrors":
          // opens the close-up UI; no state change
          fx.push({ type: "panel", id: o.id });
          return { state: s0, fx, ok: true };
        case "machine":
          return fail(s0, fx, o.msg || (test(L, s, o.active) ? "It's running." : "It isn't running."), "tap");
        default:
          return fail(s0, fx, "Nothing happens.", "tap");
      }
      break;
    }
    case "take": {
      // take an item out of an open container
      if (o.kind !== "container" || !st.open) return fail(s0, fx, "You can't reach it.");
      const i = st.contents.indexOf(a.item);
      if (i < 0) return fail(s0, fx, "It isn't there.");
      st.contents.splice(i, 1);
      s.inv.push(a.item);
      fx.push({ type: "get", item: a.item, id: o.id });
      break;
    }
    case "use": {
      if (!s.inv.includes(a.item)) return fail(s0, fx, "You don't have that.");
      const used = (consume = true) => {
        if (consume) s.inv.splice(s.inv.indexOf(a.item), 1);
      };
      if (o.kind === "door" && L.exit.item === a.item && st.locked) {
        used(L.exit.keep !== true);
        st.locked = false;
        fx.push({ type: "doorUnlock", id: o.id }, { type: "sfx", name: "unlock" });
        break;
      }
      if (o.kind === "container" && o.lock?.item === a.item && st.locked) {
        used(o.lock.keep !== true);
        st.locked = false;
        st.open = true;
        fx.push({ type: "unlock", id: o.id }, { type: "open", id: o.id });
        apply(L, s, o.onOpen, fx);
        break;
      }
      if (o.kind === "movable" && o.lock?.item === a.item && !st.moved) {
        used(o.lock.keep === false);
        st.moved = true;
        fx.push({ type: "move", id: o.id });
        apply(L, s, o.onMove, fx);
        break;
      }
      if (o.kind === "slot") {
        const ok = [].concat(o.accepts ?? []).includes(a.item) || o.accepts === "*";
        if (!ok) return fail(s0, fx, o.wrongMsg || "That doesn't fit here.");
        if (st.placed) {
          if (o.swap === false) return fail(s0, fx, "Something is already there.");
          s.inv.push(st.placed);
        }
        used();
        st.placed = a.item;
        fx.push({ type: "place", id: o.id, item: a.item });
        apply(L, s, o.onPlace, fx);
        break;
      }
      if (o.useWith?.[a.item]) {
        const u = o.useWith[a.item];
        if (u.cond && !test(L, s, u.cond)) return fail(s0, fx, u.failMsg || "Not yet.");
        if (s.fired[`use:${o.id}:${a.item}`]) return fail(s0, fx, "You've already done that.", "tap");
        s.fired[`use:${o.id}:${a.item}`] = true;
        used(u.keep !== true);
        apply(L, s, u.do, fx);
        fx.push({ type: "useOk", id: o.id, item: a.item });
        break;
      }
      return fail(s0, fx, "That doesn't work here.");
    }
    case "combine": {
      const r = (L.recipes ?? []).find((r) => (r.a === a.x && r.b === a.y) || (r.a === a.y && r.b === a.x));
      if (!r || !s.inv.includes(a.x) || !s.inv.includes(a.y)) return fail(s0, fx, "Those don't go together.");
      s.inv = s.inv.filter((i) => i !== a.x && i !== a.y);
      s.inv.push(r.out);
      fx.push({ type: "combine", item: r.out }, { type: "get", item: r.out });
      break;
    }
    case "inspect": {
      if (!s.inv.includes(a.item)) return fail(s0, fx, "You don't have that.");
      s.read[`item:${a.item}`] = true;
      const it = L.items[a.item];
      if (it?.onInspect && !s.fired[`insp:${a.item}`]) {
        s.fired[`insp:${a.item}`] = true;
        apply(L, s, it.onInspect, fx);
      }
      break;
    }
    case "code": {
      if (o.kind !== "keypad") throw new Error("code on non-keypad");
      if (st.solved) return fail(s0, fx, "It's already unlocked.", "tap");
      if (String(a.v).toUpperCase() !== String(o.code).toUpperCase()) return fail(s0, fx, o.wrongMsg || "Wrong code.", "buzz");
      st.solved = true;
      fx.push({ type: "solved", id: o.id }, { type: "sfx", name: "unlock" });
      apply(L, s, o.onSolve, fx);
      break;
    }
    case "press": {
      if (o.kind !== "buttons") throw new Error("press on non-buttons");
      if (st.solved) return fail(s0, fx, "It's done.", "tap");
      if (!o.buttons.some((b) => b.id === a.b)) throw new Error(`no button ${a.b}`);
      st.input.push(a.b);
      fx.push({ type: "press", id: o.id, b: a.b });
      const n = st.input.length;
      if (st.input[n - 1] !== o.answer[n - 1]) {
        st.input = [];
        fx.push({ type: "msg", text: o.wrongMsg || "Wrong order — it resets.", bad: true }, { type: "sfx", name: "buzz" }, { type: "seqReset", id: o.id });
        return { state: s, fx, ok: true };
      }
      if (n === o.answer.length) {
        st.solved = true;
        fx.push({ type: "solved", id: o.id }, { type: "sfx", name: "unlock" });
        apply(L, s, o.onSolve, fx);
      }
      break;
    }
    case "wire": {
      if (o.kind !== "wires") throw new Error("wire on non-wires");
      if (st.solved) return fail(s0, fx, "It's already wired.", "tap");
      const ok = Object.entries(o.answer).every(([k, v]) => a.map[k] === v) && Object.keys(a.map).length === Object.keys(o.answer).length;
      if (!ok) return fail(s0, fx, o.wrongMsg || "Sparks fly — that's not right.", "buzz");
      st.solved = true;
      fx.push({ type: "solved", id: o.id }, { type: "sfx", name: "power" });
      apply(L, s, o.onSolve, fx);
      break;
    }
    case "rotate": {
      if (o.kind !== "mirrors") throw new Error("rotate on non-mirrors");
      if (st.solved) return fail(s0, fx, "The beam is locked in.", "tap");
      const c = st.cells[a.cell];
      if (!c || c.block || c.fixed) return fail(s0, fx, "That one won't turn.", "tap");
      c.m = c.m === "/" ? "\\" : "/";
      fx.push({ type: "mirror", id: o.id, cell: a.cell });
      if (traceBeam(o, st.cells).hit >= 0) {
        st.solved = true;
        fx.push({ type: "solved", id: o.id }, { type: "sfx", name: "power" });
        apply(L, s, o.onSolve, fx);
      }
      break;
    }
    case "turn": {
      // convenience: click a dial until it shows `to` (what a player does by clicking)
      if (o.kind !== "dial") throw new Error("turn on non-dial");
      let r = { state: s0, fx: [] };
      for (let k = 0; k < o.faces.length && r.state.obj[o.id].value !== a.to; k++) r = act0(L, r.state, { a: "click", id: o.id });
      return r;
    }
    case "wait": {
      s.time += a.s;
      break;
    }
    default:
      throw new Error(`unknown action ${a.a}`);
  }
  settle(L, s, fx);
  return { state: s, fx, ok: true };
}

/** Advance real time (timed buttons expire). */
export function tick(L, s, dt) {
  const before = (L.objects ?? []).filter((o) => o.kind === "timed" && isActive(s, o.id)).map((o) => o.id);
  s.time += dt;
  const expired = before.filter((id) => !isActive(s, id));
  return expired;
}

/* ---------------- hints ---------------- */

/** The hint stage that applies right now (first stage whose `until` isn't met). */
export function hintStage(L, s) {
  for (const [i, h] of L.hints.entries()) if (!test(L, s, h.until)) return i;
  return L.hints.length - 1;
}

/** What the exit door needs, for UI ("locked" / "unlocked") */
export const doorLocked = (L, s) => s.obj.door?.locked ?? true;
