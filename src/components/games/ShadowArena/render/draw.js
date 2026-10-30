/**
 * Frame painter: arena backdrop, fighter shadows, projectiles, special
 * effects, fighters, particles, the fight HUD (health, timer, round pips,
 * special meters) and the round banners — all on the one canvas, in the
 * 960×540 view space letterboxed into the stage.
 */
import { VIEW_W, VIEW_H, GROUND, INTRO_F } from "../engine/data.js";
import { secondsLeft, attackBox, hurtBox, projBox } from "../engine/fight.js";
import { ambient } from "./arenas.js";
import { drawFighter, frontHand } from "./fighterArt.js";

const FONT = "'Trebuchet MS', 'Arial Black', Impact, sans-serif";

/* ------------------------------------------------------------------ fx */

export function spawnFx(fx, e, m) {
  const add = (o) => fx.length < 260 && fx.push({ life: 0.4, t: 0, vx: 0, vy: 0, size: 3, ...o });
  const y = e.y != null ? GROUND - e.y : GROUND - 90;
  switch (e.type) {
    case "hit": {
      const col = { fire: "#ffb347", ice: "#bff0ff", bolt: "#fff27a", shadow: "#ff6ad8", rock: "#d6c2a0", wind: "#c8ffe6" }[e.kind] || "#fff3b0";
      add({ kind: "ring", x: e.x, y, life: 0.25, size: e.heavy ? 46 : 30, color: col });
      for (let i = 0; i < (e.heavy ? 14 : 9); i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 140 + Math.random() * 260;
        add({ kind: "spark", x: e.x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.22 + Math.random() * 0.15, color: col, size: e.heavy ? 4 : 3 });
      }
      add({ kind: "num", x: e.x, y: y - 30, vy: -60, life: 0.8, text: `${e.dmg}`, color: "#fff" });
      break;
    }
    case "block":
      add({ kind: "shield", x: e.x, y, life: 0.22, size: 34, color: "#8fd3ff" });
      if (e.dmg) add({ kind: "num", x: e.x, y: y - 30, vy: -50, life: 0.6, text: `${e.dmg}`, color: "#9fd8ff" });
      break;
    case "clash":
      add({ kind: "ring", x: e.x, y, life: 0.4, size: 70, color: "#ffffff" });
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        add({ kind: "spark", x: e.x, y, vx: Math.cos(a) * 320, vy: Math.sin(a) * 320, life: 0.3, color: "#ffe6a0", size: 3 });
      }
      break;
    case "land":
    case "jump":
    case "thud":
      for (let i = 0; i < (e.type === "thud" ? 10 : 5); i++)
        add({ kind: "dust", x: e.x + (Math.random() - 0.5) * 40, y: GROUND - 2, vx: (Math.random() - 0.5) * 120, vy: -20 - Math.random() * 40, life: 0.45, size: 6 + Math.random() * 6, color: "rgba(220,210,190,0.6)" });
      break;
    case "ko":
      add({ kind: "flash", x: 0, y: 0, life: 0.35, color: "#ffffff" });
      break;
    case "special": {
      const f = m?.f[e.side];
      if (f) add({ kind: "aura", x: f.x, y: GROUND - f.y - 70, life: 0.35, size: 60, color: f.pal.accent });
      break;
    }
    default:
  }
}

export function stepFx(fx, dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const p = fx[i];
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.kind === "spark") {
      p.vx *= 0.9;
      p.vy = p.vy * 0.9 + 300 * dt;
    }
    if (p.t >= p.life) fx.splice(i, 1);
  }
}

function drawFx(ctx, fx) {
  for (const p of fx) {
    const k = p.t / p.life;
    ctx.globalAlpha = Math.max(0, 1 - k);
    switch (p.kind) {
      case "spark":
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
        break;
      case "ring":
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 5 * (1 - k) + 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.3 + k), 0, Math.PI * 2);
        ctx.stroke();
        break;
      case "shield":
        ctx.strokeStyle = p.color;
        ctx.fillStyle = "rgba(140,210,255,0.25)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
          const r = p.size * (0.8 + k * 0.4);
          ctx.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      case "dust":
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.6 + k), 0, Math.PI * 2);
        ctx.fill();
        break;
      case "num":
        ctx.font = `900 22px ${FONT}`;
        ctx.textAlign = "center";
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#140f1c";
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y);
        break;
      case "aura": {
        const g = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, p.size * (0.6 + k));
        g.addColorStop(0, p.color);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(p.x - 120, p.y - 120, 240, 240);
        break;
      }
      case "flash":
        ctx.globalAlpha = (1 - k) * 0.7;
        ctx.fillStyle = p.color;
        ctx.fillRect(-VIEW_W, -VIEW_H, VIEW_W * 3, VIEW_H * 3);
        break;
      default:
    }
  }
  ctx.globalAlpha = 1;
}

/* ------------------------------------------------------------ projectiles */

function drawProj(ctx, p, time) {
  const x = p.x;
  const y = GROUND - p.y;
  const dir = Math.sign(p.vx);
  if (p.fx === "fire") {
    for (let i = 5; i >= 1; i--) {
      ctx.globalAlpha = 0.18 * (6 - i) / 5;
      ctx.fillStyle = "#ff6a1f";
      ctx.beginPath();
      ctx.arc(x - dir * i * 9, y + Math.sin(time * 30 + i) * 2, 15 - i * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const g = ctx.createRadialGradient(x, y, 2, x, y, 22);
    g.addColorStop(0, "#fffbe0");
    g.addColorStop(0.35, "#ffd23f");
    g.addColorStop(0.7, "#ff6a1f");
    g.addColorStop(1, "rgba(255,60,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 22 + Math.sin(time * 40) * 1.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.fx === "ice") {
    ctx.strokeStyle = "rgba(200,240,255,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 1; i < 5; i++) {
      ctx.moveTo(x - dir * (14 + i * 10), y + (i % 2 ? -5 : 5));
      ctx.lineTo(x - dir * (20 + i * 10), y + (i % 2 ? -5 : 5));
    }
    ctx.stroke();
    ctx.fillStyle = "#bff0ff";
    ctx.strokeStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(x + dir * 22, y);
    ctx.lineTo(x, y - 8);
    ctx.lineTo(x - dir * 18, y);
    ctx.lineTo(x, y + 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#5fb8ff";
    ctx.beginPath();
    ctx.moveTo(x + dir * 12, y);
    ctx.lineTo(x, y - 3);
    ctx.lineTo(x - dir * 8, y);
    ctx.lineTo(x, y + 3);
    ctx.fill();
  }
}

/* ------------------------------------------------- per-move special effects */

function zigzag(ctx, x0, y0, x1, y1, seed, segs = 9, amp = 16) {
  let s = seed;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280 - 0.5) * 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  for (let i = 1; i < segs; i++) {
    const k = i / segs;
    ctx.lineTo(x0 + (x1 - x0) * k + r() * amp, y0 + (y1 - y0) * k + r() * amp * 0.3);
  }
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function specialFx(ctx, m, f, time) {
  const a = f.atk;
  if (!a || a.name !== "special") return;
  const mv = a.move;
  const S = mv.startup;
  const act = a.t > S && a.t <= S + mv.active;
  const hand = frontHand(f, time);
  const hx = hand.x;
  const hy = GROUND - hand.y;
  ctx.save();
  switch (mv.fx) {
    case "fire":
    case "ice":
      if (a.t <= S) {
        const k = a.t / S;
        const g = ctx.createRadialGradient(hx, hy, 1, hx, hy, 8 + k * 16);
        g.addColorStop(0, "#ffffff");
        g.addColorStop(0.5, mv.fx === "fire" ? "#ffb347" : "#9fe0ff");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(hx, hy, 8 + k * 16, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "bolt": {
      ctx.strokeStyle = "#fff6a0";
      ctx.shadowColor = "#ffe066";
      ctx.shadowBlur = 12;
      if (a.t <= S) {
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) zigzag(ctx, hx, hy, hx + Math.sin(time * 40 + i * 2) * 20, hy - 20 - i * 6, m.frame * 3 + i, 4, 8);
      }
      if (act || (a.t > S && a.t <= S + mv.active + 6)) {
        const b = mv.box;
        const sc = f.def.scale;
        const cx = f.x + f.face * ((b.x0 + b.x1) / 2) * sc;
        ctx.globalAlpha = act ? 1 : 0.4;
        ctx.lineWidth = 6;
        zigzag(ctx, cx - 20, 0, cx, GROUND - 4, m.frame * 7, 10, 30);
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#ffffff";
        zigzag(ctx, cx + 10, 30, cx + 30, GROUND - 4, m.frame * 11, 8, 24);
        ctx.strokeStyle = "#fff6a0";
        zigzag(ctx, hx, hy, cx, GROUND - 60, m.frame * 5, 6, 14);
        const g = ctx.createRadialGradient(cx, GROUND - 10, 4, cx, GROUND - 10, 90);
        g.addColorStop(0, "rgba(255,250,200,0.8)");
        g.addColorStop(1, "rgba(255,230,100,0)");
        ctx.fillStyle = g;
        ctx.fillRect(cx - 90, GROUND - 100, 180, 100);
      }
      break;
    }
    case "shadow":
      if (act) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = "#3a1a52";
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.arc(f.x - f.face * (20 + i * 22), GROUND - f.y - 50 + Math.sin(time * 20 + i) * 8, 16 - i * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    case "rock": {
      const k = Math.min(1, a.t / S);
      if (a.t <= S + mv.active + 4) {
        ctx.translate(hx, hy);
        ctx.rotate(time * 3);
        const r = 6 + k * 12;
        ctx.fillStyle = "#8d8478";
        ctx.strokeStyle = "#3a352f";
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < 7; i++) {
          const ang = (i / 7) * Math.PI * 2;
          const rr = r * (0.8 + ((i * 37) % 10) / 25);
          ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case "wind":
      if (a.t > S && a.t <= S + mv.active + 4) {
        const cy = GROUND - f.y - 70;
        ctx.strokeStyle = "rgba(200,255,230,0.75)";
        for (let i = 0; i < 3; i++) {
          ctx.lineWidth = 4 - i;
          ctx.beginPath();
          ctx.ellipse(f.x, cy + i * 14, 70 - i * 8, 16, 0, time * 12 + i, time * 12 + i + Math.PI * 1.3);
          ctx.stroke();
        }
      }
      break;
    default:
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ HUD */

function hud(ctx, m, names) {
  const W = 360;
  const top = 22;
  ctx.save();
  for (const side of [0, 1]) {
    const f = m.f[side];
    const x0 = side === 0 ? 46 : VIEW_W - 46 - W;
    // frame
    ctx.fillStyle = "rgba(10,6,18,0.75)";
    ctx.beginPath();
    ctx.roundRect(x0 - 4, top - 4, W + 8, 30, 8);
    ctx.fill();
    const ratio = f.hp / f.maxHp;
    const lag = f.lag / f.maxHp;
    const fill = (r, col) => {
      const w = W * Math.max(0, r);
      ctx.fillStyle = col;
      ctx.fillRect(side === 0 ? x0 : x0 + W - w, top, w, 22);
    };
    fill(lag, "#ff4a4a");
    const g = ctx.createLinearGradient(0, top, 0, top + 22);
    if (ratio > 0.3) {
      g.addColorStop(0, "#fff27a");
      g.addColorStop(1, "#ffb21a");
    } else {
      g.addColorStop(0, "#ff9a7a");
      g.addColorStop(1, "#e2322a");
    }
    fill(ratio, g);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(x0, top + 2, W, 4);
    // name + player tag
    ctx.font = `900 italic 17px ${FONT}`;
    ctx.textBaseline = "top";
    ctx.textAlign = side === 0 ? "left" : "right";
    const nx = side === 0 ? x0 : x0 + W;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#140f1c";
    ctx.strokeText(names[side], nx, top + 31);
    ctx.fillStyle = side === 0 ? "#ffd27a" : "#9fd8ff";
    ctx.fillText(names[side], nx, top + 31);
    // special meter (own row under the name)
    const mv = f.def.moves.special;
    const ready = f.cd === 0;
    const k = ready ? 1 : 1 - f.cd / mv.cd;
    const mw = 150;
    const mx = side === 0 ? x0 : x0 + W - mw;
    const my = top + 53;
    ctx.fillStyle = "rgba(10,6,18,0.75)";
    ctx.fillRect(mx - 2, my - 2, mw + 4, 11);
    ctx.fillStyle = ready ? f.pal.accent : "rgba(160,150,190,0.7)";
    ctx.fillRect(side === 0 ? mx : mx + mw * (1 - k), my, mw * k, 7);
    ctx.font = `800 11px ${FONT}`;
    ctx.textAlign = side === 0 ? "left" : "right";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#140f1c";
    const label = ready ? `${f.def.special.toUpperCase()} READY` : f.def.special.toUpperCase();
    const lx = side === 0 ? mx + mw + 8 : mx - 8;
    ctx.strokeText(label, lx, my + 4);
    ctx.fillStyle = ready ? "#fff" : "rgba(220,210,240,0.6)";
    ctx.fillText(label, lx, my + 4);
    // round pips (centre end of the name row)
    for (let i = 0; i < 2; i++) {
      const px = side === 0 ? x0 + W - 10 - i * 22 : x0 + 10 + i * 22;
      ctx.beginPath();
      ctx.arc(px, top + 40, 7, 0, Math.PI * 2);
      ctx.fillStyle = m.wins[side] > i ? "#ffd23f" : "rgba(10,6,18,0.7)";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ffe9a8";
      ctx.stroke();
    }
  }
  // timer
  ctx.fillStyle = "rgba(10,6,18,0.82)";
  ctx.beginPath();
  ctx.roundRect(VIEW_W / 2 - 40, top - 10, 80, 54, 10);
  ctx.fill();
  ctx.font = `900 34px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const secs = secondsLeft(m);
  ctx.fillStyle = secs <= 10 && m.phase === "fight" && m.frame % 30 < 15 ? "#ff5a4a" : "#fff";
  ctx.fillText(String(secs), VIEW_W / 2, top + 18);
  ctx.font = `800 10px ${FONT}`;
  ctx.fillStyle = "#c9bfe0";
  ctx.fillText(`ROUND ${m.round}`, VIEW_W / 2, top + 38);
  ctx.restore();
}

function banner(ctx, text, k, color = "#ffd23f", sub = null) {
  const s = k < 0.15 ? 2.2 - (k / 0.15) * 1.2 : 1;
  ctx.save();
  ctx.translate(VIEW_W / 2, VIEW_H / 2 - 40);
  ctx.scale(s, s);
  ctx.globalAlpha = Math.min(1, k * 8);
  ctx.font = `900 italic 82px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 12;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#140f1c";
  ctx.strokeText(text, 0, 0);
  const g = ctx.createLinearGradient(0, -40, 0, 40);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.45, color);
  g.addColorStop(1, "#b34a12");
  ctx.fillStyle = g;
  ctx.fillText(text, 0, 0);
  if (sub) {
    ctx.font = `900 italic 30px ${FONT}`;
    ctx.lineWidth = 7;
    ctx.strokeText(sub, 0, 64);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(sub, 0, 64);
  }
  ctx.restore();
}

function banners(ctx, m, names) {
  if (m.phase === "intro") {
    const final = m.wins[0] === 1 && m.wins[1] === 1;
    if (m.t < INTRO_F - 40) banner(ctx, final ? "FINAL ROUND" : `ROUND ${m.round}`, m.t / 60);
    else banner(ctx, "FIGHT!", (m.t - (INTRO_F - 40)) / 40, "#ff6a3d");
  } else if (m.phase === "ko" || m.phase === "timeup") {
    if (m.t < 75) banner(ctx, m.phase === "timeup" ? "TIME!" : m.roundReason === "double" ? "DOUBLE K.O." : "K.O.", m.t / 75, "#ff4a3a");
    else banner(ctx, m.roundWinner < 0 ? "DRAW" : `${names[m.roundWinner]} WINS`, (m.t - 75) / 80, "#ffd23f", m.roundWinner < 0 ? "No point awarded" : null);
  } else if (m.phase === "over" && m.t < 80) {
    banner(ctx, m.winner < 0 ? "DRAW" : `${names[m.winner]} WINS`, m.t / 80, "#ffd23f");
  }
}

/* ------------------------------------------------------------------ frame */

export function drawFrame(ctx, m, view, fx, bake, time, opts = {}) {
  const { dpr, scale, ox, oy, w, h } = view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#06040a";
  ctx.fillRect(0, 0, w, h);
  const sh = m.shake > 0 ? m.shake : 0;
  const sx = sh ? (Math.random() - 0.5) * sh : 0;
  const sy = sh ? (Math.random() - 0.5) * sh * 0.6 : 0;
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (ox + sx * scale), dpr * (oy + sy * scale));
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, VIEW_W, VIEW_H);
  ctx.clip();
  // world layer through the camera: (cam.x, GROUND) maps to (VIEW_W / 2, gy)
  const cam = opts.cam || { x: VIEW_W / 2, z: 1 };
  ctx.save();
  ctx.translate(VIEW_W / 2, GROUND + (cam.z - 1) * 100);
  ctx.scale(cam.z, cam.z);
  ctx.translate(-cam.x, -GROUND);
  if (bake) ctx.drawImage(bake, 0, 0, VIEW_W, VIEW_H);
  ambient(ctx, m.cfg.arena, time);

  // shadows
  for (const f of m.f) {
    const k = Math.max(0.35, 1 - f.y / 220);
    ctx.fillStyle = `rgba(0,0,0,${0.32 * k})`;
    ctx.beginPath();
    ctx.ellipse(f.x, GROUND + 3, 34 * f.def.scale * k * (f.state === "ko" && f.t > 20 ? 2 : 1), 7 * k, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // the attacking fighter is drawn on top
  const order = [...m.f].sort((a, b) => (a.state === "attack" ? 1 : 0) - (b.state === "attack" ? 1 : 0));
  for (const f of order) {
    if (f.state === "attack" && f.atk.name === "special" && f.atk.move.kind === "dash" && f.atk.t > f.atk.move.startup) {
      for (let i = 3; i >= 1; i--) drawFighter(ctx, f, GROUND, time, { alpha: 0.22, dx: -f.face * i * 22 });
    }
    drawFighter(ctx, f, GROUND, time);
    specialFx(ctx, m, f, time);
  }
  for (const p of m.projs) drawProj(ctx, p, time);
  drawFx(ctx, fx);
  if (opts.hitboxes) debugBoxes(ctx, m);
  ctx.restore();
  if (!opts.noHud) {
    const short = m.f.map((f) => f.def.short.toUpperCase());
    hud(ctx, m, opts.names || short);
    banners(ctx, m, opts.bannerNames || short);
  }
  ctx.restore();
}

export const MAX_ZOOM = 1.3;

/** camera target: zoom in while the fighters are close, keep both on screen */
export function camTarget(m) {
  const [a, b] = m.f;
  const z = Math.max(1, Math.min(MAX_ZOOM, VIEW_W / (Math.abs(a.x - b.x) + 190)));
  const half = VIEW_W / 2 / z;
  return { x: Math.max(half, Math.min(VIEW_W - half, (a.x + b.x) / 2)), z };
}

/** ease the camera toward its target (call once per rendered frame) */
export function followCam(cam, m, dt, snap = false) {
  const t = camTarget(m);
  const k = snap ? 1 : 1 - Math.exp(-dt * 6);
  cam.z += (t.z - cam.z) * k;
  const half = VIEW_W / 2 / cam.z;
  cam.x = Math.max(half, Math.min(VIEW_W - half, cam.x + (t.x - cam.x) * k));
  return cam;
}

/** DEV aid: hurtboxes green, live hitboxes red */
function debugBoxes(ctx, m) {
  ctx.lineWidth = 1.5;
  const rect = (b, col) => {
    ctx.strokeStyle = col;
    ctx.strokeRect(b.x0, GROUND - b.y1, b.x1 - b.x0, b.y1 - b.y0);
  };
  for (const f of m.f) {
    rect(hurtBox(f), "#4aff7a");
    const a = attackBox(f);
    if (a) rect(a, "#ff3a3a");
  }
  for (const p of m.projs) rect(projBox(p), "#ff3a3a");
}
