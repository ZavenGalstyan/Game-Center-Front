/**
 * Zombie Outbreak — the player's arsenal (state only; the shot itself is
 * cast by engine/game.js).
 *
 *   ready ──fire──▶ ready (cooldown)       ready ──R──▶ reload ──▶ ready
 *   any ──1/2/3──▶ switch (lower+raise) ──▶ ready   (cancels a reload)
 *
 * Rules enforced here, so no UI can break them:
 *   - can't fire while reloading (except a shotgun mid shell-reload, which
 *     interrupts it), switching, or with an empty magazine
 *   - a reload only starts with room in the mag AND rounds in reserve, and
 *     only once; rounds move from reserve when it completes (mag reload) or
 *     shell by shell — counts can never go negative or exceed capacity
 *   - semi-auto clicks are buffered for a short window, so a click that lands
 *     a few ms before the cooldown ends still fires (no swallowed inputs)
 */
import { getWeapon } from "../data/weapons.js";

const SEMI_BUFFER = 0.16;

export function createArsenal(loadout) {
  const ids = (loadout && loadout.length ? loadout : ["pistol"]).slice(0, 3);
  const slots = ids.map((id) => {
    const def = getWeapon(id);
    return { def, mag: def.mag, reserve: def.reserve };
  });
  return {
    slots,
    cur: 0,
    state: "raise",
    t: 0.35,
    dur: 0.35,
    cd: 0,
    bloom: 0,
    buffered: -1,
    prev: -1,
    reloadShell: false,
    sinceShot: 9,
    get slot() {
      return this.slots[this.cur];
    },
    get def() {
      return this.slots[this.cur].def;
    },
  };
}

/** Advances timers. Returns the list of state transitions that happened (for events). */
export function tickArsenal(a, dt, out) {
  a.cd = Math.max(0, a.cd - dt);
  a.sinceShot += dt;
  const def = a.def;
  a.bloom = Math.max(0, a.bloom - dt * (def.bloomMax > 0 ? def.bloomMax * 4 : 1));
  if (a.buffered >= 0) {
    a.buffered -= dt;
    if (a.buffered < 0) a.buffered = -1;
  }
  if (a.state === "raise" || a.state === "lower") {
    a.t -= dt;
    if (a.t <= 0) {
      if (a.state === "lower") {
        a.cur = a.next;
        a.state = "raise";
        a.t = a.dur = a.def.switchTime * 0.55;
        out.push({ type: "switch", w: a.def.id, phase: "raise" });
      } else {
        a.state = "ready";
        a.t = 0;
      }
    }
  } else if (a.state === "reload") {
    a.t -= dt;
    const s = a.slot;
    if (def.reloadMode === "shell") {
      if (a.t <= 0) {
        if (s.mag < def.mag && s.reserve > 0) {
          s.mag += 1;
          s.reserve -= 1;
          out.push({ type: "reload", w: def.id, phase: "shell" });
        }
        if (s.mag >= def.mag || s.reserve <= 0) {
          a.state = "ready";
          out.push({ type: "reload", w: def.id, phase: "end" });
        } else {
          a.t = a.dur = def.reload;
        }
      }
    } else if (a.t <= 0) {
      const need = def.mag - s.mag;
      const take = Math.min(need, s.reserve);
      s.mag += take;
      s.reserve -= take;
      a.state = "ready";
      out.push({ type: "reload", w: def.id, phase: "end" });
    }
  }
}

export function canReload(a) {
  const s = a.slot;
  return a.state === "ready" && s.mag < s.def.mag && s.reserve > 0;
}

export function startReload(a, out) {
  if (!canReload(a)) return false;
  const def = a.def;
  a.state = "reload";
  a.t = a.dur = def.reloadMode === "shell" ? (def.reloadStart || 0) + def.reload : def.reload;
  a.buffered = -1;
  out.push({ type: "reload", w: def.id, phase: "start", dur: a.dur });
  return true;
}

/** Switch to slot i (no-op if it's current or doesn't exist). Cancels a reload. */
export function switchTo(a, i, out) {
  if (i < 0 || i >= a.slots.length) return false;
  if (a.state === "lower" && a.next === i) return false;
  if (i === a.cur && a.state !== "lower") return false;
  if (a.state === "reload") out.push({ type: "reload", w: a.def.id, phase: "cancel" });
  a.prev = a.cur;
  a.next = i;
  a.state = "lower";
  a.t = a.dur = a.def.switchTime * 0.45;
  a.buffered = -1;
  out.push({ type: "switch", w: a.slots[i].def.id, phase: "lower" });
  return true;
}

/** Records a semi-auto click (buffered briefly). */
export function pressTrigger(a) {
  a.buffered = SEMI_BUFFER;
}

/**
 * Returns true if a round should be fired now, consuming it. `held` is the
 * trigger state (auto weapons), presses come via pressTrigger().
 * Emits "dry" on an empty magazine (once per press).
 */
export function wantShot(a, held, out) {
  const def = a.def;
  const s = a.slot;
  const pressed = a.buffered >= 0;
  const trying = def.mode === "auto" ? held || pressed : pressed;
  if (!trying) return false;
  // Shotgun shells can interrupt their own reload.
  if (a.state === "reload" && def.reloadMode === "shell" && s.mag > 0 && pressed) {
    a.state = "ready";
    out.push({ type: "reload", w: def.id, phase: "end" });
  }
  if (a.state !== "ready") return false;
  if (a.cd > 0) return false;
  if (s.mag <= 0) {
    if (pressed) {
      a.buffered = -1;
      out.push({ type: "dry", w: def.id, reserve: s.reserve });
    }
    return false;
  }
  s.mag -= 1;
  a.cd += 60 / def.rpm;
  if (a.cd < 0) a.cd = 0;
  a.buffered = -1;
  a.sinceShot = 0;
  a.bloom = Math.min(def.bloomMax, a.bloom + def.bloom);
  return true;
}

export function totalAmmoFraction(a) {
  let have = 0;
  let cap = 0;
  for (const s of a.slots) {
    have += s.mag + s.reserve;
    cap += s.def.mag + s.def.reserveMax;
  }
  return cap > 0 ? have / cap : 0;
}

/** Ammo box: +40 % of each equipped weapon's reserve cap (+1 magazine at least). */
export function addAmmo(a, frac = 0.4) {
  let added = 0;
  for (const s of a.slots) {
    const room = s.def.reserveMax - s.reserve;
    const give = Math.min(room, Math.max(s.def.mag, Math.ceil(s.def.reserveMax * frac)));
    if (give > 0) {
      s.reserve += give;
      added += give;
    }
  }
  return added;
}

export function ammoFull(a) {
  return a.slots.every((s) => s.reserve >= s.def.reserveMax);
}
