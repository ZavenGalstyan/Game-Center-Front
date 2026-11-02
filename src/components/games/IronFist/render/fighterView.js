/**
 * Maps one simulated fighter onto its rig every rendered frame:
 *  • transform — interpolated x/y between the last two sim steps, a sidestep
 *    into the background while dodging, yaw toward the opponent (turns pass
 *    through "facing the camera"), and a mirror so the open side of the stance
 *    always faces the camera whichever way the fighter looks;
 *  • animation — state → blended clips, attack / reaction / fall clips DRIVEN
 *    from the simulation timers (clip time = move time / tempo);
 *  • extras — Inferno Kick body spin, Shadow Step vanish, special aura, hit flash.
 */
import { createFighterRig } from "./fighterRig.js";
import { createAnimator } from "./animator.js";
import { MOVE_CLIP } from "./clips.js";
import { DODGE, KNOCKDOWN } from "../engine/constants.js";
import { lookFor } from "../engine/fighters.js";

const WIN_CLIP = { ryuzen: "Bow", blaze: "VictoryFist", titan: "Victory", kira: "VictoryFist", shadow: "Bow", storm: "Victory" };
const REACT = { high: "HitHigh", mid: "HitMid", low: "HitLow" };

export function createFighterView(assets, def, { alt = false, boss = false } = {}) {
  const look = lookFor(def, alt);
  const rig = createFighterRig(assets, look);
  const anim = createAnimator(rig.model, assets.clips[rig.body]);
  const walkSpeed = assets.clips[rig.body].Step.userData.speed || 1.5;
  const glowCol = look.glow || def.accent;
  let yaw = Math.PI / 2;
  let z = 0;
  let hit = 0;
  let lastHitSeq = 0;
  let aura = 0;
  let time = 0;

  function targets(F, m) {
    const T = F.stats.tempo;
    switch (F.state) {
      case "intro":
        return m.round === 1 && WIN_CLIP[F.id] === "Bow" && m.phaseT < 1.9 ? [{ clip: "Bow", w: 1, time: m.phaseT, fade: 0.2 }] : [{ clip: "Stance", w: 1, speed: 1, fade: 0.25 }];
      case "idle":
        return [{ clip: "Stance", w: 1, speed: 1, fade: 0.14 }];
      case "walk": {
        const v = F.vx * F.facing; // + forward, − back
        return [{ clip: "Step", w: 1, speed: v / walkSpeed, fade: 0.1 }];
      }
      case "block":
        return [{ clip: "Block", w: 1, speed: 1, fade: 0.06 }];
      case "blockstun":
        return [{ clip: "BlockHit", w: 1, time: F.st, fade: 0.03 }];
      case "jump":
        return [{ clip: "JumpAir", w: 1, speed: 1, fade: 0.1 }];
      case "attack": {
        const clip = MOVE_CLIP[F.move?.id] || "Jab";
        return [{ clip, w: 1, time: F.mt / T, fade: F.move?.kind === "special" ? 0.05 : 0.04 }];
      }
      case "hitstun":
        return [{ clip: REACT[F.lastHit?.level] || "HitHigh", w: 1, time: F.st, fade: 0.03 }];
      case "knockdown":
        return F.st < KNOCKDOWN.fall ? [{ clip: "Fall", w: 1, time: F.st, fade: 0.04 }] : [{ clip: "Down", w: 1, speed: 1, fade: 0.08 }];
      case "getup":
        return [{ clip: "GetUp", w: 1, time: (F.st / KNOCKDOWN.getup) * 1.1, fade: 0.05 }];
      case "dodge":
        return [{ clip: "Sidestep", w: 1, time: F.st, fade: 0.04 }];
      case "ko":
        return F.st < KNOCKDOWN.fall ? [{ clip: "Fall", w: 1, time: F.st, fade: 0.04 }] : [{ clip: "KOLie", w: 1, speed: 1, fade: 0.1 }];
      case "win": {
        const c = WIN_CLIP[F.id] || "Victory";
        return c === "Bow" ? [{ clip: "Bow", w: 1, time: Math.min(F.st, 1.98), fade: 0.25 }] : [{ clip: c, w: 1, speed: 1, fade: 0.25 }];
      }
      case "lose":
        return [{ clip: "Defeat", w: 1, speed: 1, fade: 0.3 }];
      default:
        return [{ clip: "Stance", w: 1, speed: 1 }];
    }
  }

  return {
    rig,
    anim,
    root: rig.root,
    def,
    /** Snap pose & transform (new round, showcase). */
    reset(F) {
      yaw = F.facing * (Math.PI / 2);
      z = 0;
      hit = 0;
      lastHitSeq = F.hitSeq;
      rig.root.position.set(F.x, F.y, 0);
      anim.snap(targets(F, { round: 2, phaseT: 9 }));
    },
    /**
     * F: sim fighter · m: match (or a stub {round, phaseT}) · dt: real frame time
     * prev: {x, y} at the previous sim step · alpha: interpolation factor
     */
    update(F, m, dt, prev, alpha = 1) {
      time += dt;
      const x = prev ? prev.x + (F.x - prev.x) * alpha : F.x;
      const y = prev ? prev.y + (F.y - prev.y) * alpha : F.y;
      // sidestep into the background
      const zt = F.state === "dodge" ? -0.62 * Math.sin(Math.PI * Math.min(1, F.st / DODGE.total)) : 0;
      z += (zt - z) * Math.min(1, dt * 22);
      // turn through "facing the camera" (yaw 0)
      const yt = F.facing * (Math.PI / 2);
      const turn = 16 * dt;
      yaw = Math.abs(yt - yaw) <= turn ? yt : yaw + Math.sign(yt - yaw) * turn;
      let spin = 0;
      const mv = F.state === "attack" ? F.move : null;
      if (mv?.id === "infernoKick") {
        const T = F.stats.tempo;
        const k = Math.min(1, Math.max(0, (F.mt / T - mv.startup * 0.25) / (mv.startup + mv.active * 0.7 - mv.startup * 0.25)));
        spin = -F.facing * Math.PI * 2 * (k * k * (3 - 2 * k));
      }
      const R = rig.root;
      R.position.set(x, y, z);
      R.rotation.set(0, yaw + spin, 0);
      R.scale.set(yaw < 0 ? -1 : 1, 1, 1);
      // vanish (Shadow Step)
      R.visible = !(mv?.vanish && F.mt >= mv.vanish[0] * F.stats.tempo && F.mt <= mv.vanish[1] * F.stats.tempo);
      // hit flash
      if (F.hitSeq !== lastHitSeq) {
        lastHitSeq = F.hitSeq;
        hit = F.state === "blockstun" ? 0.35 : 1;
      }
      hit = Math.max(0, hit - dt * 6);
      rig.setHit(hit);
      // aura: charging / using the special; bosses smoulder
      const want = mv?.kind === "special" ? 1 : boss ? 0.16 + 0.06 * Math.sin(time * 3) : 0;
      aura += (want - aura) * Math.min(1, dt * (want > aura ? 14 : 4));
      rig.setGlow(glowCol, aura * 0.55);
      rig.tick(time);
      anim.update(targets(F, m), dt);
    },
    /** World position of a bone (fx anchors). */
    bonePos(name, out) {
      return rig.bones[name].getWorldPosition(out);
    },
    dispose() {
      anim.dispose();
      rig.dispose();
    },
  };
}
