/**
 * Animation blender for one fighter rig (pattern from UltimateMMA3D).
 *
 * Each frame the view supplies the wanted blend `[{ clip, w, time?, speed?, fade? }]`.
 * Every action's weight eases toward its target (per-entry fade) and weights
 * are normalised so they always sum to 1 — no bind-pose leaking mid-blend.
 * Entries with `time` are DRIVEN (attacks, reactions, falls: the playhead is
 * set from the simulation so hit frames stay in sync); entries with `speed`
 * free-run (stance breathing, footwork matched to ground speed).
 */
import * as THREE from "three";

export function createAnimator(model, clips) {
  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map(); // name → { action, w, target, fade }

  function get(name) {
    let e = actions.get(name);
    if (!e) {
      const clip = clips[name];
      if (!clip) return null;
      const action = mixer.clipAction(clip);
      action.setLoop(clip.userData?.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      action.clampWhenFinished = true;
      action.enabled = true;
      action.setEffectiveWeight(0);
      action.play();
      e = { action, w: 0, target: 0, fade: 0.12 };
      actions.set(name, e);
    }
    return e;
  }

  return {
    mixer,
    update(targets, dt) {
      const want = new Map();
      for (const t of targets) {
        if (!clips[t.clip] || t.w <= 0) continue;
        const cur = want.get(t.clip);
        if (cur) cur.w += t.w;
        else want.set(t.clip, { ...t });
      }
      if (!want.size) want.set("Stance", { clip: "Stance", w: 1, speed: 1 });
      for (const [name, t] of want) {
        const e = get(name);
        if (!e) continue;
        e.fade = t.fade ?? 0.12;
        const dur = clips[name].duration;
        if (t.time !== undefined) {
          e.action.timeScale = 0;
          e.action.time = Math.min(Math.max(0, t.time), dur - 1e-4);
          e.action.paused = false;
        } else {
          e.action.timeScale = t.speed ?? 1;
          if (e.w <= 0.001 && !clips[name].userData?.loop) e.action.time = 0;
        }
        e.target = t.w;
      }
      let sum = 0;
      for (const [name, e] of actions) {
        const on = want.has(name);
        const target = on ? e.target : 0;
        const fade = on ? e.fade : Math.max(0.05, e.fade);
        const k = fade <= 0 ? 1 : Math.min(1, dt / fade);
        e.w += (target - e.w) * k;
        if (!on && e.w < 0.004) e.w = 0;
        sum += e.w;
      }
      for (const [, e] of actions) e.action.setEffectiveWeight(sum > 0 ? e.w / sum : 0);
      mixer.update(dt);
    },
    /** Jump straight to these targets (round resets, teleports). */
    snap(targets) {
      for (const [, e] of actions) e.w = 0;
      for (const t of targets) {
        const e = get(t.clip);
        if (e) e.w = t.w;
      }
      this.update(targets, 0);
    },
    weights() {
      const out = {};
      for (const [n, e] of actions) if (e.w > 0.01) out[n] = +e.w.toFixed(2);
      return out;
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
    },
  };
}
