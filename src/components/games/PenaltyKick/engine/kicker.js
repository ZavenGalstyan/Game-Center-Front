/**
 * Penalty Kick — the penalty taker. ONE timeline drives the 3D body AND the
 * moment the ball leaves the spot:
 *
 *   0 ……… T_PLANT   short curved run-up (3 strides) from behind-left of the spot
 *   T_PLANT          plant foot lands beside the ball
 *   T_PLANT→T_CONTACT  kicking leg swings through
 *   T_CONTACT        the instep reaches the back of the ball  ← ball is launched
 *                    on exactly this sim time, never before, never after
 *   → T_END          follow-through along the shot line
 *
 * Right-footed. The approach angle and a hip "open/closed" lean are the only
 * visual tells an AI taker gives away (see aiShooter.js).
 */
import { PK, clamp, lerp } from "./constants.js";
import { SPOT } from "./shot.js";

export const T_PLANT = 0.86;
export const T_CONTACT = 245 / 240; // an exact physics step (≈1.021 s): the launch happens ON the contact frame
export const T_END = 1.5;

const smooth = (s) => s * s * (3 - 2 * s);

/** Point where the instep meets the ball (back surface, slightly low & right). */
export const CONTACT_POINT = [SPOT[0] + 0.03, SPOT[1] - 0.02, SPOT[2] + PK.BALL_R + 0.02];

export class KickTimeline {
  /**
   * approach: run-up angle in degrees (0 = straight, 30 = classic from the left)
   * lean: −1…1 hip opening (visual only), dir: shot unit vector for follow-through
   */
  constructor({ approach = 28, lean = 0, dir = [0, 0.05, -1] } = {}) {
    this.approach = (approach * Math.PI) / 180;
    this.lean = clamp(lean, -1, 1);
    this.dir = dir;
  }

  /** Right (kicking) foot position at time t (world). */
  footR(t) {
    const back = [CONTACT_POINT[0] + 0.12, 0.42, CONTACT_POINT[2] + 0.7];
    if (t <= T_PLANT) {
      // running: the foot cycles with the strides, arriving behind for the swing
      const s = t / T_PLANT;
      const base = this.runPos(t);
      const stride = Math.sin(s * Math.PI * 3);
      return [base[0] + 0.12, 0.06 + Math.max(0, stride) * 0.22, base[2] + stride * 0.35 - 0.1 + smooth(s) * (back[2] - base[2] - 0.0) * 0];
    }
    if (t <= T_CONTACT) {
      // swing: a pendulum arc from behind/up down to the contact point
      const s = (t - T_PLANT) / (T_CONTACT - T_PLANT);
      const e = s * s; // accelerating leg
      const arcY = Math.sin(e * Math.PI) * 0.1;
      return [lerp(back[0], CONTACT_POINT[0], e), lerp(back[1], CONTACT_POINT[1], e) + arcY, lerp(back[2], CONTACT_POINT[2], e)];
    }
    // follow-through along the shot line, rising
    const s = clamp((t - T_CONTACT) / (T_END - T_CONTACT), 0, 1);
    const k = 1 - (1 - s) * (1 - s);
    return [CONTACT_POINT[0] + this.dir[0] * 0.9 * k, CONTACT_POINT[1] + 0.75 * k, CONTACT_POINT[2] + this.dir[2] * 0.9 * k];
  }

  /** Pelvis ground position during the run-up (curved approach from behind-left). */
  runPos(t) {
    const s = smooth(clamp(t / T_PLANT, 0, 1));
    const dist = 2.9 * (1 - s) + 0.42 * s; // ends beside/behind the ball
    const ang = this.approach * (1 - s * 0.35);
    return [SPOT[0] - Math.sin(ang) * dist - 0.3 * s, 0, SPOT[2] + Math.cos(ang) * dist];
  }

  /**
   * Full-body joints at time t (world). Keys match the keeper rig so one 3D
   * figure builder draws both.
   */
  pose(t) {
    const tt = Math.max(0, t);
    const root = t < T_PLANT ? this.runPos(tt) : this.runPos(T_PLANT);
    const plantL = [CONTACT_POINT[0] - 0.3, 0.05, SPOT[2] + 0.12];
    // facing: along the run-up, turning square to goal at the plant (+ hip lean)
    const s = clamp(tt / T_PLANT, 0, 1);
    const yaw = this.approach * (1 - s) * 0.9 + this.lean * 0.35 * s; // 0 = facing −z (the goal)
    const fwd = [-Math.sin(-yaw) * 0, 0, -1];
    fwd[0] = Math.sin(yaw);
    fwd[2] = -Math.cos(yaw);
    const right = [-fwd[2], 0, fwd[0]];
    const runPhase = Math.sin((s * 3) * Math.PI);
    const bob = t < T_PLANT ? Math.abs(runPhase) * 0.05 : 0;
    // body leans back slightly into the strike, then over the ball after contact
    const lean = t < T_PLANT ? 0.12 : t < T_CONTACT ? -0.1 : 0.12 * clamp((t - T_CONTACT) / 0.3, 0, 1);
    // planted: hips over the plant foot, LEFT of the ball (right-footed strike), so
    // the ball and the striking boot stay visible from the camera behind-right
    const pelvisBase = t < T_PLANT ? [root[0], 0.95 + bob, root[2]] : [plantL[0] + 0.07, 0.9, plantL[2] + 0.12];
    const pelvis = [pelvisBase[0], pelvisBase[1], pelvisBase[2]];
    const up = [fwd[0] * lean, 1, fwd[2] * lean];
    const ul = Math.hypot(...up);
    const u = up.map((c) => c / ul);
    const chest = [pelvis[0] + u[0] * 0.34, pelvis[1] + u[1] * 0.34, pelvis[2] + u[2] * 0.34];
    const neck = [pelvis[0] + u[0] * 0.55, pelvis[1] + u[1] * 0.55, pelvis[2] + u[2] * 0.55];
    const head = [pelvis[0] + u[0] * 0.75, pelvis[1] + u[1] * 0.75, pelvis[2] + u[2] * 0.75];
    const shL = [neck[0] - right[0] * 0.2, neck[1], neck[2] - right[2] * 0.2];
    const shR = [neck[0] + right[0] * 0.2, neck[1], neck[2] + right[2] * 0.2];
    // arms: counter-swing while running; left arm out for balance in the strike
    const armSwing = t < T_PLANT ? runPhase * 0.3 : 0;
    const strike = t >= T_PLANT ? clamp((t - T_PLANT) / 0.2, 0, 1) : 0;
    const hL = [shL[0] - right[0] * (0.1 + strike * 0.45) + fwd[0] * armSwing, shL[1] - 0.55 + strike * 0.3, shL[2] - right[2] * (0.1 + strike * 0.45) + fwd[2] * armSwing];
    const hR = [shR[0] + right[0] * (0.08 + strike * 0.2) - fwd[0] * armSwing, shR[1] - 0.58 + strike * 0.1, shR[2] + right[2] * (0.08 + strike * 0.2) - fwd[2] * armSwing];
    const elL = [(shL[0] + hL[0]) / 2 - right[0] * 0.05, (shL[1] + hL[1]) / 2, (shL[2] + hL[2]) / 2];
    const elR = [(shR[0] + hR[0]) / 2 + right[0] * 0.05, (shR[1] + hR[1]) / 2, (shR[2] + hR[2]) / 2];
    const hipL = [pelvis[0] - right[0] * 0.11, pelvis[1] - 0.05, pelvis[2] - right[2] * 0.11];
    const hipR = [pelvis[0] + right[0] * 0.11, pelvis[1] - 0.05, pelvis[2] + right[2] * 0.11];
    // feet: left foot runs then plants; right foot runs, swings, strikes
    let ftL;
    if (t < T_PLANT) {
      const st = Math.sin(s * Math.PI * 3 + Math.PI);
      ftL = [root[0] - right[0] * 0.12 + fwd[0] * st * 0.35, 0.06 + Math.max(0, st) * 0.22, root[2] - right[2] * 0.12 + fwd[2] * st * 0.35];
      // arrive exactly on the plant spot
      const k = smooth(clamp((s - 0.7) / 0.3, 0, 1));
      ftL = [lerp(ftL[0], plantL[0], k), lerp(ftL[1], plantL[1], k), lerp(ftL[2], plantL[2], k)];
    } else ftL = plantL;
    let ftR = this.footR(tt);
    if (t < T_PLANT) {
      const st = Math.sin(s * Math.PI * 3);
      ftR = [root[0] + right[0] * 0.12 + fwd[0] * st * 0.35, 0.06 + Math.max(0, st) * 0.22, root[2] + right[2] * 0.12 + fwd[2] * st * 0.35];
      // blend into the back-swing start so the leg is loaded at the plant
      const k = smooth(clamp((s - 0.75) / 0.25, 0, 1));
      const back = this.footR(T_PLANT + 1e-6);
      ftR = [lerp(ftR[0], back[0], k), lerp(ftR[1], back[1], k), lerp(ftR[2], back[2], k)];
    }
    const knee = (hip, ft, bendDir) => {
      const m = [(hip[0] + ft[0]) / 2, (hip[1] + ft[1]) / 2, (hip[2] + ft[2]) / 2];
      const d = Math.hypot(hip[0] - ft[0], hip[1] - ft[1], hip[2] - ft[2]);
      const bend = Math.sqrt(Math.max(0, 0.46 * 0.46 - (d / 2) ** 2));
      return [m[0] + bendDir[0] * bend, m[1] + bendDir[1] * bend * 0.3, m[2] + bendDir[2] * bend];
    };
    const knL = knee(hipL, ftL, fwd);
    const knR = knee(hipR, ftR, fwd);
    return { pelvis, chest, neck, head, shL, shR, elL, elR, hL, hR, hipL, hipR, knL, ftL, knR, ftR, up: u, fwd, right };
  }
}
