/**
 * Blade Rush — the core game engine. Plain JS, no React, no DOM: a single
 * mutable state object advanced by `update(dt)` and driven by `throw()`.
 * <BladeScene> reads its fields directly every animation frame (cheap, no
 * allocation) to draw the canvas; discrete moments (hit/fail/shard/break/
 * complete) are pushed out through `onEvent` so the React screen only
 * re-renders when something actually happened, never once per frame.
 *
 * Being framework-free also makes this headlessly testable/simulable — see
 * systems/validate.js, which throws thousands of blades at every stage with
 * no canvas or React involved at all.
 */
import { stepRotation, normalizeAngle } from "./rotationSystem.js";
import {
  localAngleForImpact,
  findCollision,
  findShardHit,
  COLLISION_THRESHOLD,
  SHARD_THRESHOLD,
} from "./collisionSystem.js";

export const THROW_DURATION = 0.15; // seconds, blade flight time (120-220ms range)
export const HIT_COOLDOWN = 0.11; // brief lock after a clean hit before next throw
export const FAIL_ANIM_DURATION = 0.55; // deflection plays out before STAGE FAILED
export const PHASE_CLEAR_PAUSE = 0.55; // boss: pause between phases
export const FINAL_EMPHASIS = 0.16; // slow beat on the stage-ending blade
export const BREAK_DURATION = 0.75; // target break animation

function buildPhases(stage) {
  if (stage.boss && Array.isArray(stage.bossPhases) && stage.bossPhases.length) {
    return stage.bossPhases.map((p) => ({ requiredBlades: p.requiredBlades, rotation: p.rotation }));
  }
  return [{ requiredBlades: stage.requiredBlades, rotation: stage.rotation }];
}

export class BladeEngine {
  constructor(stage, { onEvent = () => {}, threshold = COLLISION_THRESHOLD } = {}) {
    this.onEvent = onEvent;
    this.threshold = threshold;
    this.load(stage);
  }

  load(stage) {
    this.stage = stage;
    this.phases = buildPhases(stage);
    this.phase = 0;
    this.rotState = { rotation: 0, cycleTime: 0 };
    this.thrownInPhase = 0;
    this.totalThrown = 0;
    this.totalRequired = this.phases.reduce((s, p) => s + p.requiredBlades, 0);
    this.embedded = (stage.embeddedBlades || []).map((angle) => ({ angle, preExisting: true }));
    this.shards = (stage.bonusShards || []).map((angle) => ({ angle, collected: false }));
    this.shardsTotal = this.shards.length;
    this.shardsCollected = 0;
    this.status = "ready"; // ready | throwing | fail-anim | phase-clear | final-emphasis | breaking | complete | failed
    this.thrownBlade = null; // { t, duration, willSucceed, resultLocalAngle }
    this.cooldownT = 0;
    this.phaseClearT = 0;
    this.finalEmphasisT = 0;
    this.failT = 0;
    this.breakT = 0;
    this.particles = [];
    this.fragments = [];
    this.shake = 0;
    this.pulse = 0;
    this.score = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.perfect = true; // no fail this attempt
    this.elapsed = 0;
  }

  get pattern() { return this.phases[this.phase].rotation; }
  get requiredBlades() { return this.phases[this.phase].requiredBlades; }
  get phaseCount() { return this.phases.length; }
  get isBoss() { return Boolean(this.stage.boss); }

  canThrow() {
    return this.status === "ready";
  }

  throw() {
    if (!this.canThrow()) return false;
    this.status = "throwing";
    this.thrownBlade = { t: 0, duration: THROW_DURATION };
    this.onEvent("throw", {});
    return true;
  }

  _emit(type, payload) { this.onEvent(type, payload); }

  _spawnHitParticles(worldAngle, material) {
    const kind = PARTICLE_KIND[material] || "spark";
    const n = 7;
    for (let i = 0; i < n; i++) {
      const spread = (Math.random() - 0.5) * 1.1;
      this.particles.push({
        angle: worldAngle + spread * 0.3,
        localAngle: worldAngle,
        r: 0,
        speed: 60 + Math.random() * 90,
        life: 0.28 + Math.random() * 0.22,
        maxLife: 0.5,
        kind,
        drift: spread,
      });
    }
  }

  _spawnDeflectParticles(worldAngle) {
    for (let i = 0; i < 5; i++) {
      this.particles.push({
        angle: worldAngle + (Math.random() - 0.5) * 1.4,
        localAngle: worldAngle,
        r: 0,
        speed: 90 + Math.random() * 60,
        life: 0.3 + Math.random() * 0.2,
        maxLife: 0.5,
        kind: "metal-spark",
        drift: (Math.random() - 0.5),
      });
    }
  }

  _resolveImpact() {
    const rotation = this.rotState.rotation;
    const localAngle = localAngleForImpact(rotation);
    const hitBlade = findCollision(localAngle, this.embedded, this.threshold);

    if (hitBlade) {
      this.status = "fail-anim";
      this.failT = 0;
      this.perfect = false;
      this.streak = 0;
      this.thrownBlade.resultLocalAngle = localAngle;
      this.thrownBlade.willSucceed = false;
      this.thrownBlade.failWorldAngle = rotation + localAngle;
      this._spawnDeflectParticles(rotation + localAngle);
      this.shake = Math.min(1, this.shake + 0.35);
      this._emit("fail", { stageId: this.stage.id });
      return;
    }

    // success — embed
    this.embedded.push({ angle: localAngle, preExisting: false });
    this.thrownInPhase += 1;
    this.totalThrown += 1;
    this.streak += 1;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.score += 100 + this.streak * 5;
    this.pulse = 1;
    this.shake = Math.min(1, this.shake + 0.12);
    this._spawnHitParticles(rotation + localAngle, this.stage.material);

    const shard = findShardHit(localAngle, this.shards, SHARD_THRESHOLD);
    if (shard) {
      shard.collected = true;
      this.shardsCollected += 1;
      this.score += 50;
      this._emit("shard", { angle: rotation + localAngle });
    }

    this.thrownBlade.willSucceed = true;
    this.thrownBlade.resultLocalAngle = localAngle;
    this._emit("hit", { streak: this.streak, stageId: this.stage.id });

    const phaseDone = this.thrownInPhase >= this.requiredBlades;
    const isLastPhase = this.phase >= this.phases.length - 1;

    if (phaseDone && isLastPhase) {
      this.status = "final-emphasis";
      this.finalEmphasisT = 0;
    } else if (phaseDone) {
      this.status = "phase-clear";
      this.phaseClearT = 0;
      this._emit("phase", { phase: this.phase + 1, of: this.phases.length });
    } else {
      this.status = "cooldown";
      this.cooldownT = 0;
    }
  }

  update(dt) {
    if (dt <= 0) return;
    this.elapsed += dt;

    // rotation always advances except while the target is mid-break/broken
    if (this.status !== "breaking" && this.status !== "complete") {
      const scale = this.status === "final-emphasis" ? 0.3 : 1;
      this.rotState = stepRotation(this.pattern, this.rotState, dt * scale);
    }

    this.shake *= Math.max(0, 1 - dt * 9);
    if (this.shake < 0.001) this.shake = 0;
    this.pulse *= Math.max(0, 1 - dt * 7);
    if (this.pulse < 0.001) this.pulse = 0;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.r += p.speed * dt;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.fragments.length - 1; i >= 0; i--) {
      const f = this.fragments[i];
      f.vy += 420 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot += f.vrot * dt;
      f.life -= dt;
      if (f.life <= 0) this.fragments.splice(i, 1);
    }

    if (this.status === "throwing") {
      this.thrownBlade.t += dt;
      if (this.thrownBlade.t >= this.thrownBlade.duration) {
        this.thrownBlade.t = this.thrownBlade.duration;
        this._resolveImpact();
      }
      return;
    }

    if (this.status === "cooldown") {
      this.cooldownT += dt;
      if (this.cooldownT >= HIT_COOLDOWN) {
        this.status = "ready";
        this.thrownBlade = null;
      }
      return;
    }

    if (this.status === "fail-anim") {
      this.failT += dt;
      if (this.failT >= FAIL_ANIM_DURATION) {
        this.status = "failed";
        this._emit("failed", this._results());
      }
      return;
    }

    if (this.status === "phase-clear") {
      this.phaseClearT += dt;
      if (this.phaseClearT >= PHASE_CLEAR_PAUSE) {
        this.phase += 1;
        this.thrownInPhase = 0;
        this.rotState.cycleTime = 0;
        this.status = "ready";
        this.thrownBlade = null;
      }
      return;
    }

    if (this.status === "final-emphasis") {
      this.finalEmphasisT += dt;
      if (this.finalEmphasisT >= FINAL_EMPHASIS) {
        this.status = "breaking";
        this.breakT = 0;
        this._spawnFragments();
        this.shake = 1;
        this._emit("break", { stageId: this.stage.id });
      }
      return;
    }

    if (this.status === "breaking") {
      this.breakT += dt;
      if (this.breakT >= BREAK_DURATION) {
        this.status = "complete";
        this._emit("complete", this._results());
      }
      return;
    }
  }

  _spawnFragments() {
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      this.fragments.push({
        angle: a,
        x: 0, y: 0,
        vx: Math.cos(a) * (90 + Math.random() * 70),
        vy: Math.sin(a) * (90 + Math.random() * 70) - 60,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 6,
        scale: 0.4 + Math.random() * 0.5,
        life: 0.85,
        maxLife: 0.85,
      });
    }
  }

  _results() {
    return {
      stageId: this.stage.id,
      success: this.status === "complete" || this.status === "breaking" || this.status === "final-emphasis",
      shardsCollected: this.shardsCollected,
      shardsTotal: this.shardsTotal,
      perfect: this.perfect,
      score: this.score,
      bestStreak: this.bestStreak,
      totalThrown: this.totalThrown,
      totalRequired: this.totalRequired,
      boss: this.isBoss,
    };
  }
}

const PARTICLE_KIND = {
  wood: "wood-chip",
  metal: "spark",
  ice: "ice-shard",
  stone: "stone-chip",
  crystal: "crystal-shard",
};
