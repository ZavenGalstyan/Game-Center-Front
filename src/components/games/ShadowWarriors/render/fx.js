/**
 * Shadow Warriors — visual effects driven by sim events: sparks, dust,
 * ink splashes, rings, floating callouts, weapon trails, and drawing of
 * projectiles / ground telegraphs. Particle count is capped for mobile.
 */
import { sx, sy } from "./view.js";
import { fade } from "./arenas.js";
import { strikeCapsule } from "../engine/skeleton.js";
import { movePhase } from "../engine/fighter.js";

const MAX_PARTS = 260;

export function createFx() {
  return { parts: [], rings: [], texts: [], trails: [[], []], hitFlash: [0, 0], flash: 0, flashColor: "#ffffff", t: 0 };
}

function add(fx, p) {
  if (fx.parts.length >= MAX_PARTS) fx.parts.shift();
  fx.parts.push(p);
}

function sparks(fx, x, y, n, color, speed = 420, life = 0.32, dir = 0) {
  for (let i = 0; i < n; i++) {
    const a = dir ? Math.atan2(0.2 - Math.random() * 0.8, dir) + (Math.random() - 0.5) * 1.6 : Math.random() * Math.PI * 2;
    const sp = speed * (0.35 + Math.random() * 0.8);
    add(fx, { k: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, t: 0, c: color, w: 2 + Math.random() * 2 });
  }
}
function dust(fx, x, y, n, color = "rgba(200,190,170,0.5)", spread = 30) {
  for (let i = 0; i < n; i++) add(fx, { k: "dust", x: x + (Math.random() - 0.5) * spread, y: y + Math.random() * 6, vx: (Math.random() - 0.5) * 160, vy: 30 + Math.random() * 70, life: 0.5 + Math.random() * 0.3, t: 0, c: color, r: 6 + Math.random() * 8 });
}
function ink(fx, x, y, n, dir) {
  for (let i = 0; i < n; i++) {
    const a = Math.atan2(Math.random() * 1.2 - 0.3, dir) + (Math.random() - 0.5) * 1.2;
    const sp = 200 + Math.random() * 360;
    add(fx, { k: "ink", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.55, t: 0, c: "#0a080e", r: 2 + Math.random() * 4, g: true });
  }
}
function ring(fx, x, y, color, r0 = 8, r1 = 60, life = 0.3, w = 3) {
  fx.rings.push({ x, y, c: color, r0, r1, life, t: 0, w });
}
export function callout(fx, x, y, text, color) {
  fx.texts.push({ x, y, text, c: color, t: 0, life: 0.9 });
}

/** React to one sim event. `opt` = { shake: bool, P: palette } */
export function fxEvent(fx, v, e, opt) {
  const P = opt.P;
  const shake = (n) => {
    if (opt.shake) v.shake = Math.max(v.shake, n);
  };
  switch (e.type) {
    case "hit": {
      const dir = Math.sign(e.who.x - e.by.x) || 1;
      const c = e.kind === "weapon" ? "#fff2c8" : "#ffffff";
      sparks(fx, e.x, e.y, e.heavy ? 18 : 10, c, e.heavy ? 560 : 420, 0.3, dir);
      ring(fx, e.x, e.y, e.counter ? "#ffd84a" : fade(P.rim, 0.9), 6, e.heavy ? 70 : 44, 0.25, e.heavy ? 4 : 2.5);
      if (e.heavy || e.kind === "weapon") ink(fx, e.x, e.y, e.heavy ? 12 : 6, dir);
      fx.hitFlash[e.who.side] = 1;
      if (e.heavy) {
        fx.flash = Math.max(fx.flash, 0.16);
        fx.flashColor = "#ffffff";
      }
      shake(e.heavy ? 9 : 3.5);
      if (e.counter) callout(fx, e.x, e.y + 40, "COUNTER", "#ffd84a");
      if (e.armor) callout(fx, e.x, e.y + 40, "ARMOR", "#ffa040");
      break;
    }
    case "block":
      sparks(fx, e.x, e.y, e.heavy ? 14 : 8, "#bfe6ff", 360, 0.25, Math.sign(e.who.x - e.by.x) || 1);
      ring(fx, e.x, e.y, "rgba(150,210,255,0.9)", 6, 38, 0.22, 2.5);
      shake(e.heavy ? 4 : 1.5);
      break;
    case "parry":
      ring(fx, e.x, e.y, "#7af0ff", 10, 110, 0.4, 5);
      sparks(fx, e.x, e.y, 22, "#d8fbff", 600, 0.4);
      fx.flash = Math.max(fx.flash, 0.12);
      fx.flashColor = "#9af4ff";
      callout(fx, e.x, e.y + 46, "PARRY", "#7af0ff");
      shake(5);
      break;
    case "guardbreak":
      sparks(fx, e.x, e.y, 26, "#ffe08a", 520, 0.45);
      ring(fx, e.x, e.y, "#ffb04a", 10, 90, 0.35, 5);
      callout(fx, e.x, e.y + 46, "GUARD BREAK", "#ffb04a");
      shake(6);
      break;
    case "clash":
      sparks(fx, e.x, e.y, 20, "#e8d8ff", 500, 0.35);
      ring(fx, e.x, e.y, "#c8a8ff", 10, 80, 0.3, 4);
      break;
    case "jump":
    case "land":
    case "dash":
      dust(fx, e.who.x, 2, e.type === "land" ? 6 : 4, fade(P.pc === "#ffffff" ? "#ffffff" : "#cfc4b0", 0.4));
      break;
    case "thud":
    case "knockdown":
      if (e.type === "thud") {
        dust(fx, e.who.x, 2, 12, fade("#cfc4b0", 0.45), 70);
        shake(5);
      }
      break;
    case "ko":
      fx.flash = 0.35;
      fx.flashColor = "#ffffff";
      shake(10);
      break;
    case "zone":
      if (e.kind === "geyser") {
        for (let i = 0; i < 26; i++) add(fx, { k: "dust", x: e.x + (Math.random() - 0.5) * 100, y: Math.random() * 40, vx: (Math.random() - 0.5) * 120, vy: 500 + Math.random() * 600, life: 0.7, t: 0, c: fade("#e8c080", 0.7), r: 6 + Math.random() * 10 });
        shake(7);
      } else if (e.kind === "spike") {
        sparks(fx, e.x, 20, 10, "#d8f4ff", 400, 0.4);
      }
      break;
    case "buff":
      ring(fx, e.who.x, 90, e.kind === "iron" ? "#ffd75a" : e.kind === "vamp" ? "#ff3a5a" : "#ffa040", 20, 130, 0.5, 5);
      break;
    case "special":
      ring(fx, e.who.x, 100, "#a070ff", 20, 110, 0.4, 4);
      callout(fx, e.who.x, 210, e.name.toUpperCase(), "#c8a8ff");
      break;
    case "appear":
      for (let i = 0; i < 18; i++) add(fx, { k: "leaf", x: e.who.x + (Math.random() - 0.5) * 60, y: 40 + Math.random() * 120, vx: (Math.random() - 0.5) * 300, vy: (Math.random() - 0.3) * 260, life: 0.8, t: 0, c: "#4ac85a", r: 4 });
      break;
    case "phase":
      fx.flash = 0.25;
      fx.flashColor = "#ff5a3a";
      ring(fx, e.who.x, 100, "#ff6a3a", 30, 220, 0.6, 6);
      shake(8);
      break;
    case "shake":
      shake(e.power);
      break;
    case "rush":
      dust(fx, e.who.x, 2, 10, "rgba(160,120,255,0.45)", 40);
      break;
  }
}

/** Record weapon/limb trails after each sim step. */
export function updateTrails(fx, F) {
  for (const f of F.fighters) {
    const tr = fx.trails[f.side];
    const ph = movePhase(f);
    if (f.state === "attack" && f.move?.limb && f.move.limb !== "body" && (ph === "active" || (ph === "startup" && f.mf >= f.move.s - 2))) {
      const c = strikeCapsule(f.J, f.move.limbs ? (f.mf % 2 ? f.move.limbs[1] : f.move.limbs[0]) : f.move.limb);
      if (c) tr.push([c[0], c[1], c[2], c[3]]);
      if (tr.length > 6) tr.shift();
    } else if (tr.length) tr.shift();
  }
}

export function stepFx(fx, dt) {
  fx.t += dt;
  for (const p of fx.parts) {
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.k === "spark") {
      p.vx *= 0.9;
      p.vy = p.vy * 0.9 - 300 * dt;
    } else if (p.k === "ink") p.vy -= 900 * dt;
    else if (p.k === "dust") {
      p.vx *= 0.92;
      p.vy *= 0.9;
    } else if (p.k === "leaf") p.vy -= 200 * dt;
  }
  fx.parts = fx.parts.filter((p) => p.t < p.life && p.y > -20);
  for (const r of fx.rings) r.t += dt;
  fx.rings = fx.rings.filter((r) => r.t < r.life);
  for (const t of fx.texts) t.t += dt;
  fx.texts = fx.texts.filter((t) => t.t < t.life);
  fx.hitFlash[0] = Math.max(0, fx.hitFlash[0] - dt * 8);
  fx.hitFlash[1] = Math.max(0, fx.hitFlash[1] - dt * 8);
  fx.flash = Math.max(0, fx.flash - dt * 1.6);
}

export function drawFxWorld(ctx, v, fx) {
  const s = v.s;
  for (const p of fx.parts) {
    const k = 1 - p.t / p.life;
    const x = sx(v, p.x);
    const y = sy(v, p.y);
    ctx.globalAlpha = Math.max(0, k);
    if (p.k === "spark") {
      ctx.strokeStyle = p.c;
      ctx.lineWidth = p.w * s * 0.8;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - p.vx * 0.03 * s, y + p.vy * 0.03 * s);
      ctx.stroke();
    } else {
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(x, y, p.r * s * (p.k === "dust" ? 1 + (1 - k) * 0.8 : 1), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const r of fx.rings) {
    const k = r.t / r.life;
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = r.c;
    ctx.lineWidth = r.w * s * (1 - k * 0.6);
    ctx.beginPath();
    ctx.arc(sx(v, r.x), sy(v, r.y), (r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k))) * s, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const t of fx.texts) {
    const k = t.t / t.life;
    ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    ctx.font = `900 ${Math.round(17 * s)}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const x = sx(v, t.x);
    const y = sy(v, t.y + k * 40);
    ctx.lineWidth = 4 * s;
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.strokeText(t.text, x, y);
    ctx.fillStyle = t.c;
    ctx.fillText(t.text, x, y);
  }
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------ projectiles, zones, boss warnings
export function drawHazards(ctx, v, F, P) {
  const s = v.s;
  const now = F.frame;
  // eclipse warning line while the emperor winds up
  const boss = F.p2.boss ? F.p2 : null;
  if (boss && boss.state === "attack" && boss.move?.effect === "eclipse" && boss.mf < boss.move.s) {
    const low = boss.boss.nextLow;
    const y = low ? 22 : 150;
    const k = boss.mf / boss.move.s;
    ctx.strokeStyle = low ? `rgba(74,176,255,${0.25 + 0.5 * k})` : `rgba(255,58,74,${0.25 + 0.5 * k})`;
    ctx.lineWidth = (2 + 3 * k) * s;
    ctx.setLineDash([14 * s, 10 * s]);
    ctx.beginPath();
    ctx.moveTo(sx(v, boss.x), sy(v, y));
    ctx.lineTo(sx(v, boss.x + boss.f * 1200), sy(v, y));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = low ? "#4ab0ff" : "#ff3a4a";
    ctx.font = `800 ${Math.round(12 * s)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(low ? "LOW — JUMP / BLOCK LOW" : "HIGH — DUCK / BLOCK", sx(v, boss.x + boss.f * 220), sy(v, y + 16));
  }
  for (const z of F.zones) {
    const x0 = sx(v, z.x - z.w / 2);
    const x1 = sx(v, z.x + z.w / 2);
    const gy = sy(v, 0);
    if (z.warn > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.5);
      if (z.kind === "leaves") {
        ctx.fillStyle = `rgba(80,200,90,${0.3 + 0.4 * pulse})`;
        for (let i = 0; i < 8; i++) {
          const a = now * 0.2 + i * 0.785;
          ctx.beginPath();
          ctx.ellipse(sx(v, z.x + Math.cos(a) * 30), sy(v, 60 + Math.sin(a) * 40 + i * 6), 5 * s, 2.5 * s, a, 0, Math.PI * 2);
          ctx.fill();
        }
        continue;
      }
      const col = z.kind === "geyser" ? "255,190,90" : "170,230,255";
      ctx.fillStyle = `rgba(${col},${0.12 + 0.2 * pulse})`;
      ctx.fillRect(x0, gy - 4 * s, x1 - x0, 8 * s);
      ctx.strokeStyle = `rgba(${col},${0.5 + 0.4 * pulse})`;
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.ellipse((x0 + x1) / 2, gy, (x1 - x0) / 2, 7 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (z.kind === "geyser") {
        ctx.fillStyle = `rgba(${col},0.5)`;
        for (let i = 0; i < 4; i++) {
          const px = z.x + Math.sin(now * 0.3 + i * 2) * z.w * 0.4;
          ctx.fillRect(sx(v, px), sy(v, ((now * 3 + i * 17) % 40)), 3 * s, 3 * s);
        }
      }
    } else if (z.dmg > 0) {
      if (z.kind === "geyser") {
        const g = ctx.createLinearGradient(0, sy(v, z.h), 0, gy);
        g.addColorStop(0, "rgba(255,210,140,0)");
        g.addColorStop(1, "rgba(230,170,90,0.85)");
        ctx.fillStyle = g;
        ctx.fillRect(x0, sy(v, z.h), x1 - x0, z.h * s);
      } else {
        ctx.fillStyle = "rgba(200,240,255,0.9)";
        for (let i = 0; i < 4; i++) {
          const bx = z.x - z.w / 2 + (i + 0.5) * (z.w / 4);
          ctx.beginPath();
          ctx.moveTo(sx(v, bx - 9), gy);
          ctx.lineTo(sx(v, bx), sy(v, z.h * (0.7 + 0.3 * ((i * 7) % 3) / 2)));
          ctx.lineTo(sx(v, bx + 9), gy);
          ctx.fill();
        }
      }
    }
  }
  for (const p of F.projectiles) {
    const x = sx(v, p.x);
    const yb = sy(v, p.y);
    const yt = sy(v, p.y + p.h);
    const dir = Math.sign(p.vx) || 1;
    if (p.delay > 0) {
      // telegraph: path marker
      if (p.kind === "clone") {
        const k = 1 - p.delay / 30;
        ctx.strokeStyle = `rgba(196,106,255,${0.3 + 0.5 * k})`;
        ctx.lineWidth = 3 * s;
        ctx.setLineDash([12 * s, 8 * s]);
        ctx.beginPath();
        ctx.moveTo(x, sy(v, 50));
        ctx.lineTo(x + dir * 1400 * s, sy(v, 50));
        ctx.stroke();
        ctx.setLineDash([]);
      }
      continue;
    }
    switch (p.kind) {
      case "wave": {
        ctx.fillStyle = "rgba(120,80,255,0.35)";
        ctx.beginPath();
        ctx.ellipse(x - dir * 10 * s, (yb + yt) / 2, 30 * s, 44 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#0c0818";
        ctx.beginPath();
        ctx.moveTo(x + dir * 22 * s, (yb + yt) / 2);
        ctx.quadraticCurveTo(x - dir * 4 * s, yt - 10 * s, x - dir * 18 * s, yt);
        ctx.quadraticCurveTo(x + dir * 2 * s, (yb + yt) / 2, x - dir * 18 * s, yb);
        ctx.quadraticCurveTo(x - dir * 4 * s, yb + 10 * s, x + dir * 22 * s, (yb + yt) / 2);
        ctx.fill();
        ctx.strokeStyle = "#b9a0ff";
        ctx.lineWidth = 2 * s;
        ctx.stroke();
        break;
      }
      case "quake":
      case "ripple": {
        const col = p.kind === "ripple" ? "255,200,90" : "190,160,255";
        ctx.fillStyle = `rgba(${col},0.55)`;
        for (let i = 0; i < 5; i++) {
          const bx = p.x - dir * i * 9;
          const h = (p.h - i * 6) * (0.8 + 0.2 * Math.sin(now + i));
          ctx.beginPath();
          ctx.moveTo(sx(v, bx - 10), sy(v, 0));
          ctx.lineTo(sx(v, bx), sy(v, h));
          ctx.lineTo(sx(v, bx + 10), sy(v, 0));
          ctx.fill();
        }
        break;
      }
      case "thorn": {
        ctx.fillStyle = "#1a3a12";
        ctx.strokeStyle = "#8aff6a";
        ctx.lineWidth = 1.5 * s;
        ctx.beginPath();
        const cy = (yb + yt) / 2;
        ctx.moveTo(x + dir * 20 * s, cy);
        ctx.lineTo(x - dir * 14 * s, cy - 7 * s);
        ctx.lineTo(x - dir * 8 * s, cy);
        ctx.lineTo(x - dir * 14 * s, cy + 7 * s);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case "clone": {
        const src = p.side === 0 ? F.p1 : F.p2;
        ghost(ctx, v, src, p.x - src.x, "rgba(196,106,255,0.55)");
        break;
      }
      case "eclipse": {
        const cy = (yb + yt) / 2;
        const col = p.height === "low" ? "74,176,255" : "255,58,74";
        ctx.fillStyle = `rgba(${col},0.35)`;
        ctx.fillRect(x - dir * 120 * s, yt, dir * 120 * s, yb - yt);
        ctx.fillStyle = "#0a0410";
        ctx.beginPath();
        ctx.moveTo(x + dir * 30 * s, cy);
        ctx.quadraticCurveTo(x, yt - 10 * s, x - dir * 26 * s, yt - 6 * s);
        ctx.quadraticCurveTo(x - dir * 6 * s, cy, x - dir * 26 * s, yb + 6 * s);
        ctx.quadraticCurveTo(x, yb + 10 * s, x + dir * 30 * s, cy);
        ctx.fill();
        ctx.strokeStyle = `rgb(${col})`;
        ctx.lineWidth = 2.5 * s;
        ctx.stroke();
        break;
      }
    }
  }
}

/** Translucent copy of a fighter's skeleton (shadow clone). */
function ghost(ctx, v, f, dx, color) {
  const J = f.J;
  const s = v.s;
  const P = (p) => [sx(v, p.x + dx), sy(v, p.y)];
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";
  const L = (a, b, w) => {
    const A = P(a);
    const B = P(b);
    ctx.lineWidth = w * s;
    ctx.beginPath();
    ctx.moveTo(A[0], A[1]);
    ctx.lineTo(B[0], B[1]);
    ctx.stroke();
  };
  L(J.hip, J.neck, 26);
  L(J.sh, J.elF, 12);
  L(J.elF, J.haF, 10);
  L(J.haF, J.tipF, 4);
  L(J.sh, J.elB, 12);
  L(J.elB, J.haB, 10);
  L(J.hip, J.knF, 17);
  L(J.knF, J.ftF, 13);
  L(J.hip, J.knB, 17);
  L(J.knB, J.ftB, 13);
  const H = P(J.head);
  ctx.beginPath();
  ctx.arc(H[0], H[1], 13 * s, 0, Math.PI * 2);
  ctx.fill();
}
