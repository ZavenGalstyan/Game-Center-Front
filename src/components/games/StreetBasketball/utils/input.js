/**
 * Street Basketball — the human controller (keyboard + touch). It produces
 * exactly the intent format the engine's AI produces.
 *
 *   WASD / arrows  move (screen-relative: W = toward the rim)
 *   Shift          sprint
 *   J              hold = shot meter, release = shoot
 *   K              crossover
 *   L              drive (hold) / layup / dunk in range
 *   Space          jump — block, contest, rebound
 *   E              steal
 *
 * Edges are queued and handed to the engine on its next step; held keys are
 * level-triggered. Window blur / tab hide releases everything (and releases
 * a shot that was being held) so nothing stays "stuck".
 */
export function createInput() {
  const keys = { up: false, down: false, left: false, right: false, sprint: false, shoot: false, drive: false };
  const touch = { mx: 0, mz: 0, sprint: false, shoot: false, drive: false };
  let queue = [];
  let yaw = 0; // camera yaw: stick/WASD are screen-relative

  const isField = (t) => t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName));

  function onKeyDown(e) {
    if (isField(e.target)) return;
    const c = e.code;
    let used = true;
    switch (c) {
      case "KeyW": case "ArrowUp": keys.up = true; break;
      case "KeyS": case "ArrowDown": keys.down = true; break;
      case "KeyA": case "ArrowLeft": keys.left = true; break;
      case "KeyD": case "ArrowRight": keys.right = true; break;
      case "ShiftLeft": case "ShiftRight": keys.sprint = true; break;
      case "KeyJ":
        if (!e.repeat && !keys.shoot) { keys.shoot = true; queue.push("shootDown"); }
        break;
      case "KeyK":
        if (!e.repeat) queue.push("cross");
        break;
      case "KeyL":
        if (!e.repeat && !keys.drive) { keys.drive = true; queue.push("driveDown"); }
        break;
      case "Space":
        if (!e.repeat) queue.push("jump");
        break;
      case "KeyE":
        if (!e.repeat) queue.push("steal");
        break;
      default:
        used = false;
    }
    if (used) e.preventDefault();
  }

  function onKeyUp(e) {
    switch (e.code) {
      case "KeyW": case "ArrowUp": keys.up = false; break;
      case "KeyS": case "ArrowDown": keys.down = false; break;
      case "KeyA": case "ArrowLeft": keys.left = false; break;
      case "KeyD": case "ArrowRight": keys.right = false; break;
      case "ShiftLeft": case "ShiftRight": keys.sprint = false; break;
      case "KeyJ": if (keys.shoot) { keys.shoot = false; queue.push("shootUp"); } break;
      case "KeyL": if (keys.drive) { keys.drive = false; queue.push("driveUp"); } break;
      default: break;
    }
  }

  function releaseAll() {
    if (keys.shoot || touch.shoot) queue.push("shootUp");
    if (keys.drive || touch.drive) queue.push("driveUp");
    for (const k of Object.keys(keys)) keys[k] = false;
    touch.mx = 0;
    touch.mz = 0;
    touch.sprint = false;
    touch.shoot = false;
    touch.drive = false;
  }
  const onBlur = () => releaseAll();
  const onVis = () => {
    if (document.visibilityState !== "visible") releaseAll();
  };

  return {
    attach() {
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      window.addEventListener("blur", onBlur);
      document.addEventListener("visibilitychange", onVis);
    },
    detach() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
      releaseAll();
      queue = [];
    },
    releaseAll,
    /* ---- touch API ---- */
    stick(mx, mz) {
      touch.mx = mx;
      touch.mz = mz;
    },
    touchHold(kind, on) {
      if (kind === "shoot") {
        if (on && !touch.shoot) queue.push("shootDown");
        if (!on && touch.shoot) queue.push("shootUp");
        touch.shoot = on;
      } else if (kind === "drive") {
        if (on && !touch.drive) queue.push("driveDown");
        if (!on && touch.drive) queue.push("driveUp");
        touch.drive = on;
      } else if (kind === "sprint") touch.sprint = on;
    },
    tap(ev) {
      queue.push(ev);
    },
    isShootHeld: () => keys.shoot || touch.shoot,
    setYaw(v) {
      yaw = v;
    },
    /** engine controller */
    controller: {
      intent() {
        const sx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0) + touch.mx;
        const sz = (keys.down ? 1 : 0) - (keys.up ? 1 : 0) + touch.mz;
        // screen → world: right = (cos, −sin), down = (sin, cos)
        const c = Math.cos(yaw);
        const s = Math.sin(yaw);
        let mx = sx * c + sz * s;
        let mz = -sx * s + sz * c;
        const l = Math.hypot(mx, mz);
        if (l > 1) { mx /= l; mz /= l; }
        const events = queue;
        queue = [];
        return { mx, mz, sprint: keys.sprint || touch.sprint, events };
      },
    },
  };
}
