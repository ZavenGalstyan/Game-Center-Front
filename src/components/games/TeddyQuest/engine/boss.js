/**
 * Baron Bristlesnout — the warthog tyrant of the Dark Castle (level 30).
 *
 * A fixed attack cycle, every attack telegraphed and followed by a damage
 * window in which the boss can't hurt the bear:
 *   charge  → red lane, then a dash into the arena wall  → STUNNED (hit him!)
 *   slam    → leaps at the bear, shockwave ring (jump it) ×2/×3 → DIZZY
 *   thorns  → red circles, thorns crash down ×3 waves     → TIRED
 * Up to 3 hits per window; 12 HP; at 6 HP phase 2 speeds everything up.
 */
import { HW, PH } from "./hazards.js";

const ORDER = ["charge", "slam", "rain"];

export class Boss {
  constructor(g, def) {
    this.g = g;
    this.def = def;
    this.r = 1.35;
    this.h = 2.9;
    this.maxHp = 12;
    this.reset();
  }

  reset() {
    const d = this.def;
    this.hp = this.maxHp;
    this.x = d.cx;
    this.z = d.cz + d.hs * 0.45;
    this.y = d.y;
    this.vy = 0;
    this.face = Math.PI; // looking toward the arena entrance (−z)
    this.state = "sleep";
    this.t = 0;
    this.phase = 1;
    this.next = 0;
    this.hitsWin = 0;
    this.inv = 0;
    this.flash = 0;
    this.ring = null;
    this.marks = [];
    this.lane = null;
    this.slams = 0;
    this.waves = 0;
    this.awake = false;
    this.defeated = false;
    this.deadT = 0;
    this.rand = null; // same thorn pattern after every retry
    const gate = this.g.boxes[d.gate];
    if (gate) gate.solid = false;
  }

  get vulnerable() {
    return this.state === "stun" || this.state === "dizzy" || this.state === "tired";
  }
  targetable() {
    return this.awake && !this.defeated && this.state !== "slamAir";
  }
  fast() {
    return this.phase === 2;
  }

  set(state) {
    this.state = state;
    this.t = 0;
    this.g.emit("bossState", { state });
  }

  clampToArena(x, z, m = this.r + 0.3) {
    const d = this.def;
    return [Math.max(d.cx - d.hs + m, Math.min(d.cx + d.hs - m, x)), Math.max(d.cz - d.hs + m, Math.min(d.cz + d.hs - m, z))];
  }

  nextAttack() {
    const a = ORDER[this.next % ORDER.length];
    this.next++;
    this.hitsWin = 0;
    if (a === "charge") this.set("chargeTele");
    else if (a === "slam") {
      this.slams = 0;
      this.set("slamTele");
    } else {
      this.waves = 0;
      this.set("rainTele");
    }
  }

  update(dt) {
    const g = this.g, p = g.player, d = this.def;
    this.t += dt;
    this.inv = Math.max(0, this.inv - dt);
    this.flash = Math.max(0, this.flash - dt);
    const tele = this.fast() ? 0.75 : 1.05;

    if (this.state === "sleep") {
      // wakes once the bear is well inside the arena; the gate shuts behind
      const inside = Math.abs(p.x - d.cx) < d.hs - 1 && p.z > d.cz - d.hs + 2.5 && g.status === "play";
      if (inside) {
        this.awake = true;
        const gate = g.boxes[d.gate];
        if (gate) gate.solid = true;
        g.emit("bossWake");
        this.set("intro");
      }
      return;
    }
    if (this.state === "gone") return;
    if (this.state === "defeat") {
      this.deadT += dt;
      if (this.t > 2.2) {
        this.set("gone");
        g.freeFriend();
        g.portal.open = true;
        g.emit("bossGone");
      }
      return;
    }

    // marks (thorn rain) and ring (shockwave) live independently of the state
    this.updateRing(dt);
    this.updateMarks(dt);

    const face = (tx, tz, k = 6) => {
      const want = Math.atan2(tx - this.x, tz - this.z);
      let df = want - this.face;
      while (df > Math.PI) df -= Math.PI * 2;
      while (df < -Math.PI) df += Math.PI * 2;
      this.face += Math.max(-k * dt, Math.min(k * dt, df));
    };

    switch (this.state) {
      case "intro":
        face(p.x, p.z);
        if (this.t > 1.8) this.nextAttack();
        break;
      case "chargeTele": {
        face(p.x, p.z, 8);
        const dx = Math.sin(this.face), dz = Math.cos(this.face);
        this.lane = { x: this.x, z: this.z, dx, dz, len: this.wallDistance(dx, dz) };
        if (this.t > tele) {
          this.cdx = dx;
          this.cdz = dz;
          this.set("charge");
        }
        break;
      }
      case "charge": {
        const sp = this.fast() ? 15 : 12.5;
        this.x += this.cdx * sp * dt;
        this.z += this.cdz * sp * dt;
        const [cx, cz] = this.clampToArena(this.x, this.z);
        if (cx !== this.x || cz !== this.z) {
          this.x = cx;
          this.z = cz;
          this.lane = null;
          g.emit("bossWall", { x: this.x, z: this.z });
          this.set("stun");
        }
        break;
      }
      case "slamTele":
        face(p.x, p.z, 8);
        if (this.t > (this.fast() ? 0.5 : 0.7)) {
          const [tx, tz] = this.clampToArena(p.x, p.z);
          this.from = [this.x, this.z];
          this.to = [tx, tz];
          this.set("slamAir");
          g.emit("bossLeap");
        }
        break;
      case "slamAir": {
        const T = 0.95;
        const k = Math.min(1, this.t / T);
        this.x = this.from[0] + (this.to[0] - this.from[0]) * k;
        this.z = this.from[1] + (this.to[1] - this.from[1]) * k;
        this.y = d.y + Math.sin(Math.PI * k) * 5;
        if (k >= 1) {
          this.y = d.y;
          this.ring = { x: this.x, z: this.z, r: 0.5, hit: false };
          g.emit("bossSlam", { x: this.x, z: this.z });
          if (Math.hypot(p.x - this.x, p.z - this.z) < this.r + 0.9 && p.y < d.y + 1.2) this.hurtPlayer();
          this.slams++;
          this.set("slamLand");
        }
        break;
      }
      case "slamLand":
        if (this.t > (this.fast() ? 0.85 : 1.1)) {
          if (this.slams < (this.fast() ? 3 : 2)) this.set("slamTele");
          else this.set("dizzy");
        }
        break;
      case "rainTele":
        face(p.x, p.z);
        if (this.t > tele * 0.8) {
          this.spawnMarks();
          this.waves++;
          this.set("rain");
        }
        break;
      case "rain":
        face(p.x, p.z);
        if (this.t > 1.35) {
          if (this.waves < 3) {
            this.spawnMarks();
            this.waves++;
            this.t = 0;
          } else if (!this.marks.length) this.set("tired");
        }
        break;
      case "stun":
      case "dizzy":
      case "tired": {
        const len = this.state === "stun" ? 3 : 2.6;
        if (this.t > len || this.hitsWin >= 3) this.set("recover");
        break;
      }
      case "recover":
        face(p.x, p.z);
        // walk back toward the middle between attacks
        if (this.t > 0.2) {
          const dx = d.cx - this.x, dz = d.cz - this.z;
          const l = Math.hypot(dx, dz);
          if (l > 0.2) {
            this.x += (dx / l) * Math.min(l, 4 * dt);
            this.z += (dz / l) * Math.min(l, 4 * dt);
          }
        }
        if (this.t > 1.1) this.nextAttack();
        break;
      default:
        break;
    }

    if (g.status !== "play") return;
    // the bear's swing / stomp
    const top = this.y + this.h;
    if (this.vulnerable && this.inv <= 0) {
      const stomp = p.vy < -1 && p.y > top - 0.6 && p.y < top + 0.3 && Math.hypot(p.x - this.x, p.z - this.z) < this.r + HW;
      const swing = p.attackT >= 0 && !p.attackHit.has(this) && g.swingHits(this.x, this.y, this.z, this.r);
      if (swing || stomp) {
        if (swing) p.attackHit.add(this);
        if (stomp) {
          p.vy = 10;
          p.grounded = false;
        }
        this.takeHit();
      }
    }
    // touching him outside a damage window hurts
    const dxz = Math.hypot(p.x - this.x, p.z - this.z);
    if (dxz < this.r + HW && p.y < top - 0.2 && p.y + PH > this.y) {
      if (!this.vulnerable && this.state !== "recover") this.hurtPlayer();
      // never let the bear stand inside him
      const k = (this.r + HW - dxz) / (dxz || 1);
      if (p.y < top - 0.5) {
        p.x += (p.x - this.x) * k;
        p.z += (p.z - this.z) * k;
      }
    }
  }

  wallDistance(dx, dz) {
    const d = this.def, m = this.r + 0.3;
    let best = 40;
    if (dx > 1e-3) best = Math.min(best, (d.cx + d.hs - m - this.x) / dx);
    if (dx < -1e-3) best = Math.min(best, (d.cx - d.hs + m - this.x) / dx);
    if (dz > 1e-3) best = Math.min(best, (d.cz + d.hs - m - this.z) / dz);
    if (dz < -1e-3) best = Math.min(best, (d.cz - d.hs + m - this.z) / dz);
    return Math.max(0, best) + this.r;
  }

  hurtPlayer() {
    const p = this.g.player;
    if (this.state === "charge") {
      // knocked sideways out of the lane
      const sx = -this.cdz, sz = this.cdx;
      const side = (p.x - this.x) * sx + (p.z - this.z) * sz >= 0 ? 1 : -1;
      return this.g.hurt(p.x - sx * side, p.z - sz * side, "boss");
    }
    return this.g.hurt(this.x, this.z, "boss");
  }

  updateRing(dt) {
    const R = this.ring;
    if (!R) return;
    R.r += (this.fast() ? 9.5 : 8) * dt;
    const g = this.g, p = g.player;
    const d = Math.hypot(p.x - R.x, p.z - R.z);
    if (!R.hit && g.status === "play" && Math.abs(d - R.r) < 0.45 + HW && p.y < this.def.y + 0.5) {
      R.hit = true;
      g.hurt(R.x, R.z, "shockwave");
    }
    if (R.r > this.def.hs * 2.2) this.ring = null;
  }

  spawnMarks() {
    const g = this.g, p = g.player;
    const n = this.fast() ? 7 : 5;
    const rnd = this.rand || (this.rand = mulberry(77));
    const pts = [[p.x + p.vx * 0.35, p.z + p.vz * 0.35]];
    let guard = 0;
    while (pts.length < n && guard++ < 80) {
      const a = rnd() * Math.PI * 2, r = 1.8 + rnd() * 5;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (pts.some(([qx, qz]) => Math.hypot(qx - x, qz - z) < 2.3)) continue;
      pts.push([x, z]);
    }
    for (const [x, z] of pts) {
      const [cx, cz] = this.clampToArena(x, z, 1);
      this.marks.push({ x: cx, z: cz, t: 0, r: 1.15, hit: false });
    }
    g.emit("bossThorns");
  }

  updateMarks(dt) {
    const g = this.g, p = g.player;
    const FALL = 1.15; // warning time before the thorn lands
    for (const m of this.marks) {
      m.t += dt;
      if (!m.hit && m.t >= FALL && m.t < FALL + 0.25) {
        if (g.status === "play" && Math.hypot(p.x - m.x, p.z - m.z) < m.r + HW * 0.5 && p.y < this.def.y + 1.2) {
          m.hit = true;
          g.hurt(m.x, m.z, "thorn");
        }
      }
      if (m.t >= FALL && !m.landed) {
        m.landed = true;
        g.emit("thornLand", { x: m.x, z: m.z });
      }
    }
    this.marks = this.marks.filter((m) => m.t < FALL + 0.6);
  }

  takeHit() {
    const g = this.g;
    this.hp -= 1;
    this.hitsWin++;
    this.inv = 0.35;
    this.flash = 0.25;
    g.emit("bossHit", { hp: this.hp });
    if (this.hp <= this.maxHp / 2 && this.phase === 1) {
      this.phase = 2;
      g.emit("bossPhase2");
    }
    if (this.hp <= 0) {
      this.defeated = true;
      this.ring = null;
      this.marks = [];
      this.lane = null;
      this.set("defeat");
      g.emit("bossDefeated", { x: this.x, z: this.z });
    }
  }
}

function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
