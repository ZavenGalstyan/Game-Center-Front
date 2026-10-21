/**
 * Maps a simulated fighter (engine/fighter.js) onto its rig every frame:
 * root placement (interpolated between sim steps), animation blend targets
 * (via animator.js) and material effects (sweat sheen, facial bruising).
 *
 * Sim state → clips:
 *   idle / move / block   stance (or Tired / Rocked / Block) blended with the
 *                         StepF / StepL footwork cycles, playback rate matched
 *                         to ground speed (negative = stepping back / right)
 *   attack                the move's clip, playhead = sim move timer
 *   dodge · hit · blockHit · shoot · sprawl · takedowns   driven clips
 *   clinch / ground / sub position clips (+ ground action clips)
 *   down / ko / getup     library fall (Knockback) → lying loop → library GetUp
 */
import { MOVES } from "../engine/moves.js";
import { staMax } from "../engine/fighter.js";
import { clinchDom } from "../engine/grapple.js";

export const MOVE_CLIP = { jab: "Jab", jab2: "Jab", cross: "Cross", hookL: "HookL", hookR: "HookR", uppercut: "Uppercut", bodyJab: "BodyJab", bodyCross: "BodyCross", bodyHook: "BodyHook", kickLow: "KickLow", kickBody: "KickBody", kickHead: "KickHead", kickFront: "KickFront", knee: "Knee", elbow: "Elbow", shortPunch: "ShortPunch" };
const POS = { guard: "Guard", half: "Half", side: "Side", mount: "Mount", back: "Back" };
const STEP_V = 1.18; // ground speed of one footwork cycle at timeScale 1

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const scaleTime = (clips, name, t, dur) => (clips[name] ? (t / Math.max(1e-3, dur)) * clips[name].duration : 0);

/** Animation targets for fighter `f` in match `m`. */
export function targetsFor(f, m, clips) {
  const a = f.act;
  const opp = m.f[1 - f.side];
  const T = [];
  const add = (clip, w, o = {}) => T.push({ clip, w, ...o });
  const ended = m.phase === "stopped" || m.phase === "ended" || m.phase === "decision";
  const roaming = Math.hypot(f.vel.x, f.vel.z) > 0.3;
  if (ended && m.result && a.type !== "ko" && a.type !== "tapped" && a.type !== "down" && a.type !== "getup" && a.type !== "subWin" && m.phaseT > 1.2 && !(m.result.winner === f.side && roaming)) {
    if (m.result.winner === f.side) add("Victory", 1, { speed: 1, fade: 0.5 });
    else if (m.result.winner < 0) add("Stance", 1, { speed: 0.6, fade: 0.5 });
    else add("Defeat", 1, { speed: 1, fade: 0.6 });
    return T;
  }
  if (m.phase === "intro") {
    add("Stance", 1, { speed: 0.8 });
    return T;
  }
  switch (a.type) {
    case "attack": {
      const clip = MOVE_CLIP[a.move];
      add(clip, 1, { time: a.t, fade: a.comboStep ? 0.07 : 0.06 });
      return T;
    }
    case "dodge":
      add({ left: "SlipL", right: "SlipR", duck: "Duck", back: "Backstep" }[a.dir], 1, { time: a.t, fade: 0.05 });
      return T;
    case "hit": {
      const mv = MOVES[a.move];
      let clip = "HitHead";
      if (a.zone === "body") clip = "HitBody";
      else if (a.zone === "legs") clip = "HitLeg";
      else if (a.upper) clip = "HitUpper";
      else if (mv?.arc) clip = a.dir === "fromLeft" ? "HitHeadR" : "HitHeadL";
      add(clip, 1, { time: scaleTime(clips, clip, a.t, a.dur + 0.12), fade: 0.04 });
      return T;
    }
    case "blockHit": {
      const clip = f.guard === "body" ? "BlockBodyHit" : "BlockHit";
      add(clip, 1, { time: scaleTime(clips, clip, a.t, Math.max(a.dur, 0.2)), fade: 0.04 });
      return T;
    }
    case "rocked":
      add("Rocked", 1, { speed: 1, fade: 0.2 });
      return T;
    case "down": {
      const fall = clips.Knockback.duration;
      if (a.t < fall) add("Knockback", 1, { time: a.t, fade: 0.08 });
      else add("Down", 1, { speed: 1, fade: 0.3 });
      return T;
    }
    case "ko": {
      if (a.lying) add("KOLie", 1, { speed: 1, fade: 0.4 });
      else if (a.t < clips.Knockback.duration) add("Knockback", 1, { time: a.t * 0.9, fade: 0.06 });
      else add("KOLie", 1, { speed: 1, fade: 0.5 });
      return T;
    }
    case "getup":
      if (a.from === "top") add("Stance", 1, { speed: 1, fade: 0.35 });
      else if (a.from === "ground") add("StandUp", 1, { time: scaleTime(clips, "StandUp", a.t, a.dur), fade: 0.2 });
      else add("GetUp", 1, { time: scaleTime(clips, "GetUp", a.t, a.dur), fade: 0.15 });
      return T;
    case "shoot":
      add("Shoot", 1, { time: Math.min(0.4, (a.t / a.dur) * 0.4), fade: 0.06 });
      return T;
    case "stuffed":
      add("ShotStuffed", 1, { time: scaleTime(clips, "ShotStuffed", a.t, a.dur), fade: 0.1 });
      return T;
    case "sprawl":
      add("Sprawl", 1, { time: Math.min(clips.Sprawl.duration, a.t), fade: 0.05 });
      return T;
    case "clinchEnter":
      add("Clinch", 1, { speed: 1, fade: 0.22 });
      return T;
    case "clinchTd":
      add("Shoot", 1, { time: 0.15 + (a.t / a.dur) * 0.3, fade: 0.15 });
      return T;
    case "takedown":
      add("TakedownA", 1, { time: scaleTime(clips, "TakedownA", a.t, a.dur), fade: 0.08 });
      return T;
    case "takenDown":
      add("TakedownB", 1, { time: scaleTime(clips, "TakedownB", a.t, a.dur), fade: 0.08 });
      return T;
    case "clinch": {
      const dom = m.clinch ? clinchDom(m, f) : 0;
      add(dom < -0.35 ? "ClinchHeld" : "Clinch", 1, { speed: 1, fade: 0.3 });
      return T;
    }
    case "sub":
    case "tapped":
    case "subWin": {
      const type = a.sub;
      const role = a.type === "subWin" ? "att" : a.type === "tapped" ? "def" : a.role;
      const name = { armbar: "Armbar", guillotine: "Guillotine", rnc: "RNC" }[type] + (role === "att" ? "_Att" : "_Def");
      add(name, 1, { speed: a.type === "sub" ? 1 + (m.sub ? m.sub.prog * 0.8 : 0) : 0.3, fade: 0.35 });
      return T;
    }
    case "ground": {
      const g = m.ground;
      if (!g) {
        add("Stance", 1, { speed: 1 });
        return T;
      }
      const top = g.top === f.side;
      const P = POS[g.pos] + (top ? "T" : "B");
      const ga = g.acts[f.side];
      if (ga) {
        let clip = P;
        if (ga.kind === "gstrike") clip = clips[`${P}_Punch`] ? `${P}_Punch` : P;
        else if (ga.kind === "advance") clip = `${P}_Pass`;
        else if (ga.kind === "escape" || ga.kind === "standup") clip = clips[`${P}_Scramble`] ? `${P}_Scramble` : P;
        if (clips[clip] && clip !== P) {
          add(clip, 1, { time: scaleTime(clips, clip, ga.t, ga.dur), fade: 0.1 });
          return T;
        }
      }
      if (!top && f.guard && clips[`${P}_Cover`]) add(`${P}_Cover`, 1, { speed: 1, fade: 0.15 });
      else add(P, 1, { speed: 1, fade: 0.35 });
      return T;
    }
    default:
      break;
  }
  // ---- standing locomotion (idle / move / block)
  const fw = { x: Math.sin(f.yaw), z: Math.cos(f.yaw) };
  const vf = f.vel.x * fw.x + f.vel.z * fw.z;
  const vl = f.vel.x * fw.z - f.vel.z * fw.x;
  const sp = Math.hypot(vf, vl);
  const tired = f.sta < staMax(f) * 0.18;
  let base = f.guard === "body" ? "BlockBody" : f.guard ? "Block" : f.daze > 55 ? "Rocked" : tired ? "Tired" : "Stance";
  if (m.phase === "rest" || m.phase === "roundEnd" || ended) base = tired ? "Tired" : "Stance";
  const wStep = clamp(sp / 0.5, 0, 1) * (m.phase === "rest" || m.phase === "roundEnd" ? 0.8 : 1);
  const wf = sp > 1e-3 ? Math.abs(vf) / (Math.abs(vf) + Math.abs(vl)) : 0;
  add(base, Math.max(0.02, 1 - wStep * 0.85), { speed: 1, fade: 0.14 });
  if (wStep > 0.01) {
    if (wf > 0.02) add("StepF", wStep * 0.85 * wf, { speed: vf / STEP_V, fade: 0.12 });
    if (wf < 0.98) add("StepL", wStep * 0.85 * (1 - wf), { speed: vl / STEP_V, fade: 0.12 });
  }
  return T;
}

/** Per-frame cosmetic state: sweat sheen and facial bruising. */
export function applyLook(rig, f, m) {
  const fatigue = 1 - f.sta / staMax(f);
  rig.setSweat(clamp((m.time - 4) / 200 + fatigue * 0.35 + (m.round - 1) * 0.2, 0, 1));
  rig.setBruise(clamp((100 - f.hp.head) / 85, 0, 1));
}
