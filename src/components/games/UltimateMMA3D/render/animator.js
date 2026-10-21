/**
 * Animation state machine for one fighter rig.
 *
 * Each frame the caller supplies the desired blend — a list of
 * `{ clip, w, time?, speed?, fade? }` — and the animator eases every action's
 * weight toward its target (per-entry fade time), normalising so the weights
 * always sum to 1 (no bind-pose leaking through mid-blend). Clips with `time`
 * are DRIVEN: their playhead is set from the simulation (attacks, dodges,
 * reactions, transitions) so hit frames and visuals stay in sync. Clips with
 * `speed` free-run (loops: stance breathing, footwork cycles whose rate is
 * matched to ground speed so feet don't slide).
 */
import * as THREE from "three";

export function createAnimator(model, clips) {
  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map(); // name → { action, w }

  function get(name) {
    let e = actions.get(name);
    if (!e) {
      const clip = clips[name];
      if (!clip) return null;
      const action = mixer.clipAction(clip);
      action.setLoop(clip.userData?.loop || isLoopName(name) ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      action.clampWhenFinished = true;
      action.enabled = true;
      action.setEffectiveWeight(0);
      action.play();
      e = { action, w: 0, fade: 0.15 };
      actions.set(name, e);
    }
    return e;
  }

  let lastKey = "";
  return {
    mixer,
    /** targets: [{clip, w, time?, speed?, fade?}] */
    update(targets, dt) {
      const want = new Map();
      for (const t of targets) {
        if (!clips[t.clip] || t.w <= 0) continue;
        const cur = want.get(t.clip);
        if (cur) cur.w += t.w;
        else want.set(t.clip, { ...t });
      }
      if (!want.size) want.set("Stance", { clip: "Stance", w: 1, speed: 1 });
      const key = [...want.keys()].join("|");
      // a brand-new driven action starts from its own time (no stale playhead)
      for (const [name, t] of want) {
        const e = get(name);
        if (!e) continue;
        e.fade = t.fade ?? 0.12;
        if (t.time !== undefined) {
          e.action.timeScale = 0;
          e.action.time = Math.min(Math.max(0, t.time), clips[name].duration - 1e-4);
          e.action.paused = false;
        } else {
          e.action.timeScale = t.speed ?? 1;
          if (e.w <= 0.001 && !isLoopName(name) && !clips[name].userData?.loop) e.action.time = 0;
        }
        e.target = t.w;
      }
      let sum = 0;
      for (const [name, e] of actions) {
        const target = want.has(name) ? e.target : 0;
        const fade = want.has(name) ? e.fade : Math.max(0.06, e.fade);
        const k = fade <= 0 ? 1 : Math.min(1, dt / fade);
        e.w += (target - e.w) * k;
        if (!want.has(name) && e.w < 0.004) e.w = 0;
        sum += e.w;
      }
      for (const [, e] of actions) e.action.setEffectiveWeight(sum > 0 ? e.w / sum : 0);
      mixer.update(dt);
      lastKey = key;
    },
    /** Snap: immediately show exactly these targets (used after teleports / replays). */
    snap(targets) {
      for (const [, e] of actions) e.w = 0;
      for (const t of targets) {
        const e = get(t.clip);
        if (e) e.w = t.w;
      }
      this.update(targets, 0);
    },
    current: () => lastKey,
    /** Exact mixer state (for replays): [{clip, w, time}] */
    capture() {
      const out = [];
      for (const [name, e] of actions) if (e.w > 0.002) out.push({ clip: name, w: e.w, time: e.action.time });
      return out;
    },
    /** Show a captured state exactly. */
    restore(list) {
      for (const [, e] of actions) {
        e.w = 0;
        e.action.setEffectiveWeight(0);
      }
      let sum = 0;
      for (const s of list) sum += s.w;
      for (const s of list) {
        const e = get(s.clip);
        if (!e) continue;
        e.w = s.w;
        e.action.timeScale = 0;
        e.action.time = s.time;
        e.action.setEffectiveWeight(s.w / (sum || 1));
      }
      mixer.update(0);
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
    },
  };
}

const LOOPS = new Set(["Idle", "Walk", "Jog", "Dance", "Crouch", "Talk", "SwordIdle", "ShieldIdle", "FoldArms", "Yes", "No"]);
const isLoopName = (n) => LOOPS.has(n);
