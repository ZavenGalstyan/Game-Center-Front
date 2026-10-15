/**
 * Throw Masters — procedural character and weapon artwork (Canvas 2D).
 * Fighters are posed with two-bone IK from hand targets, so the same rig
 * covers idle / aim / throw / hit / victory / defeat. Everything is drawn
 * facing right with the feet at the origin; callers flip with scale(-1, 1).
 */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (amt >= 0) {
    r += (255 - r) * amt;
    g += (255 - g) * amt;
    b += (255 - b) * amt;
  } else {
    r *= 1 + amt;
    g *= 1 + amt;
    b *= 1 + amt;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/* ======================================================================
   Weapons — centred on the origin, pointing along +x.
   ====================================================================== */

const STEEL = "#d7dee6";

export function drawWeapon(c, id, skin, time = 0) {
  const metal = skin?.metal || STEEL;
  const acc = skin?.accent;
  c.lineJoin = "round";
  c.lineCap = "round";
  switch (id) {
    case "axe": {
      c.fillStyle = acc || "#8a5a2e";
      rr(c, -26, -3.5, 46, 7, 3.5);
      c.fill();
      c.fillStyle = "#5d3a1c";
      for (let x = -22; x < -8; x += 5) c.fillRect(x, -3.5, 2.2, 7);
      const g = c.createLinearGradient(8, -26, 26, 8);
      g.addColorStop(0, shade(metal, 0.5));
      g.addColorStop(1, shade(metal, -0.25));
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(6, -4);
      c.quadraticCurveTo(10, -14, 6, -24);
      c.quadraticCurveTo(28, -26, 30, -2);
      c.quadraticCurveTo(28, 14, 8, 12);
      c.quadraticCurveTo(12, 6, 6, 4);
      c.closePath();
      c.fill();
      c.strokeStyle = "rgba(0,0,0,0.35)";
      c.lineWidth = 1.5;
      c.stroke();
      c.strokeStyle = "rgba(255,255,255,0.85)";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(9, -22);
      c.quadraticCurveTo(27, -22, 28, -2);
      c.stroke();
      break;
    }
    case "arrow": {
      c.strokeStyle = acc || "#b7864b";
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(-30, 0);
      c.lineTo(24, 0);
      c.stroke();
      c.fillStyle = metal;
      c.beginPath();
      c.moveTo(36, 0);
      c.lineTo(22, -6);
      c.lineTo(25, 0);
      c.lineTo(22, 6);
      c.closePath();
      c.fill();
      c.fillStyle = skin?.glow || "#e8433a";
      c.beginPath();
      c.moveTo(-18, 0);
      c.lineTo(-30, -8);
      c.lineTo(-34, -8);
      c.lineTo(-26, 0);
      c.lineTo(-34, 8);
      c.lineTo(-30, 8);
      c.closePath();
      c.fill();
      break;
    }
    case "knives": {
      c.fillStyle = acc || "#3a2d4f";
      rr(c, -16, -3, 14, 6, 3);
      c.fill();
      c.fillStyle = "#c9a34a";
      c.fillRect(-3, -6, 3, 12);
      const g = c.createLinearGradient(0, -5, 0, 5);
      g.addColorStop(0, shade(metal, 0.6));
      g.addColorStop(1, shade(metal, -0.2));
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(0, -4);
      c.lineTo(18, -3);
      c.lineTo(26, 1);
      c.lineTo(0, 4);
      c.closePath();
      c.fill();
      break;
    }
    case "hammer": {
      c.fillStyle = acc || "#7a4b25";
      rr(c, -30, -4, 50, 8, 4);
      c.fill();
      c.fillStyle = "#3b2a1e";
      c.fillRect(-28, -4, 10, 8);
      const g = c.createLinearGradient(10, -20, 34, 20);
      g.addColorStop(0, shade(metal === STEEL ? "#9aa3ad" : metal, 0.35));
      g.addColorStop(1, shade(metal === STEEL ? "#9aa3ad" : metal, -0.4));
      c.fillStyle = g;
      rr(c, 12, -19, 24, 38, 5);
      c.fill();
      c.strokeStyle = "rgba(0,0,0,0.35)";
      c.lineWidth = 2;
      c.stroke();
      c.fillStyle = "rgba(0,0,0,0.22)";
      c.fillRect(12, -9, 24, 4);
      c.fillRect(12, 5, 24, 4);
      c.fillStyle = "rgba(255,255,255,0.45)";
      c.fillRect(15, -17, 4, 34);
      break;
    }
    case "fireball": {
      const glow = skin?.glow || "#ff9a2e";
      c.save();
      c.globalCompositeOperation = "lighter";
      const g = c.createRadialGradient(0, 0, 2, 0, 0, 30);
      g.addColorStop(0, "rgba(255,255,220,1)");
      g.addColorStop(0.35, glow);
      g.addColorStop(1, "rgba(255,60,0,0)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, 30, 0, TAU);
      c.fill();
      for (let i = 0; i < 5; i++) {
        const a = Math.PI + (i - 2) * 0.35;
        const l = 22 + Math.sin(time * 30 + i * 2) * 6;
        c.fillStyle = i % 2 ? "rgba(255,120,30,0.7)" : "rgba(255,210,80,0.7)";
        c.beginPath();
        c.moveTo(Math.cos(a - 0.5) * 12, Math.sin(a - 0.5) * 12);
        c.quadraticCurveTo(Math.cos(a) * l * 1.3, Math.sin(a) * l * 1.3, Math.cos(a + 0.5) * 12, Math.sin(a + 0.5) * 12);
        c.fill();
      }
      c.restore();
      c.fillStyle = "#fff6c8";
      c.beginPath();
      c.arc(2, 0, 9, 0, TAU);
      c.fill();
      break;
    }
    case "shuriken": {
      const g = c.createRadialGradient(-4, -4, 2, 0, 0, 18);
      g.addColorStop(0, shade(metal, 0.6));
      g.addColorStop(1, shade(metal, -0.35));
      c.fillStyle = g;
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const r = i % 2 ? 6 : 18;
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath();
      c.fill();
      c.strokeStyle = "rgba(0,0,0,0.4)";
      c.lineWidth = 1.2;
      c.stroke();
      c.fillStyle = acc || "#2a2f3c";
      c.beginPath();
      c.arc(0, 0, 3.5, 0, TAU);
      c.fill();
      break;
    }
    case "spear": {
      c.strokeStyle = acc || "#8b5e34";
      c.lineWidth = 4.5;
      c.beginPath();
      c.moveTo(-54, 0);
      c.lineTo(36, 0);
      c.stroke();
      c.strokeStyle = "#e9d8a6";
      c.lineWidth = 6;
      c.beginPath();
      c.moveTo(28, 0);
      c.lineTo(34, 0);
      c.stroke();
      const g = c.createLinearGradient(34, -7, 34, 7);
      g.addColorStop(0, shade(metal, 0.55));
      g.addColorStop(1, shade(metal, -0.3));
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(34, 0);
      c.quadraticCurveTo(42, -9, 60, 0);
      c.quadraticCurveTo(42, 9, 34, 0);
      c.fill();
      c.fillStyle = skin?.glow || "#c0392b";
      c.beginPath();
      c.moveTo(-50, 0);
      c.lineTo(-58, -6);
      c.lineTo(-56, 0);
      c.lineTo(-58, 6);
      c.closePath();
      c.fill();
      break;
    }
    case "crystal": {
      const glow = skin?.glow || "#7ef0ff";
      c.save();
      c.globalCompositeOperation = "lighter";
      const g = c.createRadialGradient(0, 0, 2, 0, 0, 28);
      g.addColorStop(0, "rgba(255,255,255,0.9)");
      g.addColorStop(0.4, glow);
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.globalAlpha = 0.55 + Math.sin(time * 8) * 0.15;
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, 28, 0, TAU);
      c.fill();
      c.restore();
      const m = skin?.metal || "#a77bff";
      c.fillStyle = m;
      c.beginPath();
      c.moveTo(18, 0);
      c.lineTo(5, -11);
      c.lineTo(-12, -7);
      c.lineTo(-18, 0);
      c.lineTo(-12, 7);
      c.lineTo(5, 11);
      c.closePath();
      c.fill();
      c.fillStyle = "rgba(255,255,255,0.55)";
      c.beginPath();
      c.moveTo(18, 0);
      c.lineTo(5, -11);
      c.lineTo(0, 0);
      c.closePath();
      c.fill();
      c.fillStyle = "rgba(255,255,255,0.25)";
      c.beginPath();
      c.moveTo(-12, -7);
      c.lineTo(0, 0);
      c.lineTo(-12, 7);
      c.lineTo(-18, 0);
      c.closePath();
      c.fill();
      break;
    }
    case "bomb": {
      const body = skin?.metal ? shade(skin.metal, -0.55) : "#23232b";
      const g = c.createRadialGradient(-6, -6, 2, 0, 0, 19);
      g.addColorStop(0, shade(body.startsWith("#") ? body : "#3a3a48", 0.5));
      g.addColorStop(0.5, body);
      g.addColorStop(1, "#0b0b10");
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, 18, 0, TAU);
      c.fill();
      c.fillStyle = "rgba(255,255,255,0.7)";
      c.beginPath();
      c.ellipse(-6, -7, 5, 3, -0.6, 0, TAU);
      c.fill();
      c.save();
      c.rotate(-1.2);
      c.fillStyle = skin?.accent || "#6a6a78";
      c.fillRect(14, -5, 7, 10);
      c.strokeStyle = "#c8a46a";
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(20, 0);
      c.quadraticCurveTo(26, -6, 28, 2);
      c.stroke();
      c.fillStyle = Math.sin(time * 40) > 0 ? "#fff3a0" : "#ff9a2e";
      c.beginPath();
      c.arc(28, 2, 3 + Math.sin(time * 50) * 1.2, 0, TAU);
      c.fill();
      c.restore();
      break;
    }
    case "boomerang": {
      const wood = skin?.metal || "#c47a35";
      c.fillStyle = wood;
      c.beginPath();
      c.moveTo(-22, 14);
      c.quadraticCurveTo(-4, -2, 2, -20);
      c.quadraticCurveTo(8, -24, 12, -18);
      c.quadraticCurveTo(10, 0, 24, 14);
      c.quadraticCurveTo(22, 20, 15, 18);
      c.quadraticCurveTo(4, 4, 1, -6);
      c.quadraticCurveTo(-4, 6, -16, 20);
      c.quadraticCurveTo(-24, 20, -22, 14);
      c.closePath();
      c.fill();
      c.strokeStyle = "rgba(0,0,0,0.35)";
      c.lineWidth = 1.5;
      c.stroke();
      c.strokeStyle = skin?.accent || "#40e0b0";
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(-15, 13);
      c.quadraticCurveTo(-2, 2, 4, -14);
      c.stroke();
      break;
    }
    default:
      break;
  }
}

/** Grip offset per weapon (the point held in the hand, in weapon space). */
const GRIP = { axe: -18, arrow: -6, knives: -9, hammer: -20, spear: -14, shuriken: 0, crystal: 0, fireball: 0, bomb: 0, boomerang: 0 };
/** Weapons that float over the palm instead of being gripped. */
const FLOAT = { fireball: true, crystal: true };

/* ======================================================================
   Fighters
   ====================================================================== */

function ik(sx, sy, tx, ty, a, b, bend) {
  let dx = tx - sx;
  let dy = ty - sy;
  let d = Math.hypot(dx, dy);
  const max = a + b - 0.5;
  if (d > max) {
    dx *= max / d;
    dy *= max / d;
    d = max;
  }
  d = Math.max(d, 4);
  const th = Math.atan2(dy, dx);
  const ca = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const ph = Math.acos(ca) * bend;
  const ex = sx + Math.cos(th + ph) * a;
  const ey = sy + Math.sin(th + ph) * a;
  return { ex, ey, hx: sx + dx, hy: sy + dy };
}

/**
 * Work out the pose for a fighter state: {bob, lean, jump, fall, front, back,
 * expr, look, legs, weaponRot}. Hand targets are in body space.
 */
function pose(f, time) {
  const t = f.animT;
  const breath = Math.sin(time * 2.6 + f.side * 2) * 1.6;
  const a = (f.aimAngle * Math.PI) / 180;
  const ad = { x: Math.cos(a), y: -Math.sin(a) };
  const p = f.aimPower;
  const P = {
    bob: breath,
    lean: 0,
    jump: 0,
    fall: 0,
    stance: 0,
    front: { x: 17, y: -52 + breath * 0.5 },
    back: { x: -13, y: -50 + breath * 0.5 },
    expr: "normal",
    look: { x: 1, y: 0 },
    weaponRot: -Math.PI / 2 + 0.25,
    held: f.holding,
    bowString: 0,
  };
  const bow = f.weapon === "arrow";
  switch (f.anim) {
    case "aim": {
      P.expr = p > 0.04 ? "focus" : "normal";
      P.look = ad;
      P.stance = 1;
      P.lean = -0.06 - p * 0.08;
      if (bow) {
        P.back = { x: -6 + ad.x * 44, y: -88 + ad.y * 44 };
        P.front = { x: P.back.x - ad.x * (18 + 26 * p), y: P.back.y - ad.y * (18 + 26 * p) };
        P.bowString = p;
        P.weaponRot = Math.atan2(ad.y, ad.x);
      } else {
        P.back = { x: -6 + ad.x * 40, y: -86 + ad.y * 40 };
        P.front = { x: 6 - ad.x * (26 + 14 * p), y: -100 - ad.y * (20 + 10 * p) - 8 };
        P.weaponRot = Math.atan2(-ad.y, -ad.x) + Math.PI * 0.85;
      }
      break;
    }
    case "throw": {
      P.expr = t < 0.35 ? "shout" : "normal";
      P.look = ad;
      P.stance = 1;
      if (bow) {
        P.back = { x: -6 + ad.x * 44, y: -88 + ad.y * 44 };
        P.front = { x: P.back.x - ad.x * 14, y: P.back.y - ad.y * 14 + Math.min(t, 0.2) * 40 };
        P.weaponRot = Math.atan2(ad.y, ad.x);
      } else {
        const k1 = ease(clamp(t / 0.12, 0, 1));
        const k2 = ease(clamp((t - 0.12) / 0.3, 0, 1));
        const cock = { x: 6 - ad.x * 36, y: -110 - ad.y * 26 };
        const rel = { x: 6 + ad.x * 46, y: -88 + ad.y * 46 };
        const fol = { x: 30, y: -40 };
        const m = { x: lerp(cock.x, rel.x, k1), y: lerp(cock.y, rel.y, k1) };
        P.front = { x: lerp(m.x, fol.x, k2), y: lerp(m.y, fol.y, k2) };
        P.back = { x: -16, y: -60 };
        P.lean = 0.12 * (1 - k2) + 0.04;
      }
      break;
    }
    case "hit": {
      const k = 1 - clamp(t / 0.55, 0, 1);
      P.expr = "hurt";
      P.lean = -0.32 * k;
      P.front = { x: lerp(17, 18, k), y: lerp(-52, -132, k) };
      P.back = { x: lerp(-13, -26, k), y: lerp(-50, -122, k) };
      P.look = { x: -0.5, y: -0.4 };
      break;
    }
    case "win": {
      P.expr = "happy";
      P.jump = Math.abs(Math.sin(t * 5.2)) * 26 * Math.min(1, t * 2);
      const w = Math.sin(t * 10) * 8;
      P.front = { x: 16 + w, y: -150 };
      P.back = { x: -14 - w, y: -148 };
      P.weaponRot = -Math.PI / 2;
      P.look = { x: 0.6, y: -0.6 };
      break;
    }
    case "lose": {
      const k = ease(clamp(t / 0.55, 0, 1));
      P.expr = "ko";
      P.fall = k;
      P.front = { x: 26, y: -60 + k * 18 };
      P.back = { x: -22, y: -66 + k * 10 };
      P.held = false;
      break;
    }
    default:
      if (f.blink < 0) P.expr = "blink";
      break;
  }
  return P;
}

const SH_F = { x: 7, y: -88 };
const SH_B = { x: -7, y: -89 };

/**
 * Draw a fighter. `f` is a battle fighter (or a stub with the same fields);
 * the context should already be translated to the fighter's feet.
 */
export function drawFighter(c, f, time, opts = {}) {
  const ch = f.char;
  const L = ch.look;
  const P = pose(f, time);
  const k = f.k || 1;
  c.save();
  c.scale(f.dir * k, k);

  // ground shadow
  if (!opts.noShadow) {
    c.fillStyle = "rgba(0,0,0,0.22)";
    c.beginPath();
    c.ellipse(P.fall * -40, 2, 30 + P.fall * 30 - P.jump * 0.3, 7, 0, 0, TAU);
    c.fill();
  }

  c.translate(0, -P.jump);
  if (P.fall) {
    // tip over backwards, pivoting at the heels, and slump to the ground
    c.translate(-6 * P.fall, -4 * P.fall);
    c.rotate(-P.fall * 1.45);
  }

  const lean = P.lean;
  const hipY = -40;

  // cape behind everything
  if (L.extra === "cape") {
    c.save();
    c.translate(0, hipY);
    c.rotate(lean);
    const wv = Math.sin(time * 3 + f.side) * 4;
    c.fillStyle = shade(L.shirt2, -0.2);
    c.beginPath();
    c.moveTo(-14, -50);
    c.quadraticCurveTo(-34 + wv, -10, -30 + wv * 1.5, 34);
    c.lineTo(-2, 30);
    c.lineTo(8, -50);
    c.closePath();
    c.fill();
    c.restore();
  }

  // legs
  const st = P.stance;
  const legs = [
    { hx: -6, fx: -12 - st * 6, col: shade(L.pants, -0.18) },
    { hx: 6, fx: 12 + st * 6, col: L.pants },
  ];
  for (const g of legs) {
    c.strokeStyle = g.col;
    c.lineWidth = 12;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(g.hx, hipY + P.bob * 0.2);
    c.quadraticCurveTo((g.hx + g.fx) / 2 + 3, -18, g.fx, -6);
    c.stroke();
    c.fillStyle = L.shoe;
    c.beginPath();
    c.ellipse(g.fx + 5, -4, 11, 6, 0, 0, TAU);
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.15)";
    c.fillRect(g.fx - 4, -3, 18, 2);
  }

  // upper body (leans around the hips)
  c.save();
  c.translate(0, hipY + P.bob * 0.4);
  c.rotate(lean);
  c.translate(0, -hipY);

  // quiver (Robin) / bomb bag (Boom) on the back
  if (f.weapon === "arrow") {
    c.save();
    c.translate(-16, -76);
    c.rotate(-0.4);
    c.fillStyle = "#7a4a26";
    rr(c, -7, -16, 14, 38, 5);
    c.fill();
    c.strokeStyle = "#e8e0c8";
    c.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      c.beginPath();
      c.moveTo(i * 4, -16);
      c.lineTo(i * 4, -26);
      c.stroke();
    }
    c.fillStyle = "#e8433a";
    for (let i = -1; i <= 1; i++) c.fillRect(i * 4 - 2, -30, 4, 6);
    c.restore();
  }

  // back arm
  drawArm(c, SH_B, P.back, L, true, ch);
  if (f.weapon === "arrow" && P.held) drawBow(c, P, L, f);

  // torso
  drawTorso(c, L, ch, time, f);

  // head
  drawHead(c, L, P, time, f);

  // front arm + held weapon
  const hand = drawArm(c, SH_F, P.front, L, false, ch);
  if (P.held && f.weapon !== "arrow") {
    c.save();
    c.translate(hand.x, hand.y);
    if (FLOAT[f.weapon]) {
      c.translate(0, -16 + Math.sin(time * 4) * 2);
      c.scale(0.8, 0.8);
      drawWeapon(c, f.weapon, f.skin, time);
    } else {
      c.rotate(P.weaponRot);
      c.translate(-GRIP[f.weapon] * 0.9, 0);
      c.scale(0.9, 0.9);
      drawWeapon(c, f.weapon, f.skin, time);
    }
    c.restore();
  }
  // fist on top of the grip
  c.fillStyle = L.skin;
  c.beginPath();
  c.arc(hand.x, hand.y, 5.5, 0, TAU);
  c.fill();
  c.restore();

  // dizzy stars
  if (P.expr === "ko" && P.fall > 0.9) {
    for (let i = 0; i < 3; i++) {
      const a = time * 3 + (i * TAU) / 3;
      star(c, 3 + Math.cos(a) * 30, -118 + Math.sin(a) * 12, 5, "#ffe066");
    }
  }
  c.restore();
}

function drawArm(c, sh, hand, L, back, ch) {
  const a = 22;
  const b = 22;
  const j = ik(sh.x, sh.y, hand.x, hand.y, a, b, back ? -1 : 1);
  const sleeve = back ? shade(L.shirt, -0.22) : L.shirt;
  const skin = back ? shade(L.skin, -0.12) : L.skin;
  const thick = ch.id === "bruno" ? 12 : 10;
  c.lineCap = "round";
  c.strokeStyle = ch.id === "bruno" ? skin : sleeve;
  c.lineWidth = thick + 1;
  c.beginPath();
  c.moveTo(sh.x, sh.y);
  c.lineTo(j.ex, j.ey);
  c.stroke();
  c.strokeStyle = ["kai", "shadow", "luna"].includes(ch.id) ? sleeve : skin;
  c.lineWidth = thick - 1;
  c.beginPath();
  c.moveTo(j.ex, j.ey);
  c.lineTo(j.hx, j.hy);
  c.stroke();
  if (back) {
    c.fillStyle = skin;
    c.beginPath();
    c.arc(j.hx, j.hy, 5, 0, TAU);
    c.fill();
  }
  return { x: j.hx, y: j.hy };
}

function drawBow(c, P, L, f) {
  const h = P.back;
  const rot = f.anim === "aim" || f.anim === "throw" ? P.weaponRot : -0.25;
  c.save();
  c.translate(h.x, h.y);
  c.rotate(rot);
  c.strokeStyle = f.skin?.metal || "#8b5a2b";
  c.lineWidth = 4.5;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(-4, -36);
  c.quadraticCurveTo(16, 0, -4, 36);
  c.stroke();
  const pull = 6 + P.bowString * 30;
  c.strokeStyle = "rgba(255,255,255,0.85)";
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(-4, -36);
  c.lineTo(-pull, 0);
  c.lineTo(-4, 36);
  c.stroke();
  if (f.anim === "aim" || f.anim === "idle") {
    c.save();
    c.translate(-pull + 32, 0);
    c.scale(0.9, 0.9);
    drawWeapon(c, "arrow", f.skin, 0);
    c.restore();
  }
  c.restore();
}

function drawTorso(c, L, ch, time, f) {
  const g = c.createLinearGradient(-20, -92, 20, -40);
  g.addColorStop(0, shade(L.shirt, 0.12));
  g.addColorStop(1, L.shirt2);
  c.fillStyle = g;
  const wide = ch.id === "bruno" ? 4 : 0;
  c.beginPath();
  c.moveTo(-18 - wide, -92);
  c.quadraticCurveTo(0, -97, 18 + wide, -92);
  c.quadraticCurveTo(22 + wide, -66, 16, -38);
  c.lineTo(-16, -38);
  c.quadraticCurveTo(-22 - wide, -66, -18 - wide, -92);
  c.closePath();
  c.fill();
  c.save();
  c.clip();
  switch (L.extra) {
    case "plaid":
      c.strokeStyle = "rgba(0,0,0,0.22)";
      c.lineWidth = 3;
      for (let x = -20; x < 24; x += 10) {
        c.beginPath();
        c.moveTo(x, -100);
        c.lineTo(x, -36);
        c.stroke();
      }
      for (let y = -88; y < -36; y += 10) {
        c.beginPath();
        c.moveTo(-26, y);
        c.lineTo(26, y);
        c.stroke();
      }
      break;
    case "straps":
      c.strokeStyle = "#5a3618";
      c.lineWidth = 6;
      c.beginPath();
      c.moveTo(-18, -92);
      c.lineTo(16, -44);
      c.stroke();
      c.fillStyle = "#c0c6cc";
      c.beginPath();
      c.arc(0, -66, 4, 0, TAU);
      c.fill();
      break;
    case "coat":
      c.fillStyle = L.accent;
      for (let y = -84; y < -44; y += 12) {
        c.beginPath();
        c.arc(7, y, 2.6, 0, TAU);
        c.fill();
      }
      c.fillStyle = "#f1e7d0";
      c.beginPath();
      c.moveTo(-4, -94);
      c.lineTo(6, -94);
      c.lineTo(2, -74);
      c.closePath();
      c.fill();
      break;
    case "belt":
      c.fillStyle = L.accent;
      c.beginPath();
      c.moveTo(0, -80);
      c.quadraticCurveTo(6, -72, 0, -64);
      c.quadraticCurveTo(-6, -72, 0, -80);
      c.fill();
      break;
    default:
      break;
  }
  if (ch.id === "kai") {
    c.fillStyle = L.accent;
    c.fillRect(-24, -52, 50, 6);
  }
  if (ch.id === "luna") {
    c.fillStyle = L.accent;
    c.beginPath();
    c.arc(4, -72, 5, 0.6, 5.6);
    c.arc(6, -72, 4, 5.4, 0.9, true);
    c.fill();
  }
  if (ch.id === "shadow") {
    c.strokeStyle = L.accent;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-16, -60);
    c.lineTo(16, -76);
    c.stroke();
  }
  c.restore();
  // belt
  c.fillStyle = ch.id === "kai" ? L.accent : shade(L.pants, -0.35);
  c.fillRect(-17, -45, 34, 6);
  if (ch.id !== "kai") {
    c.fillStyle = L.accent;
    c.fillRect(-3, -45, 7, 6);
  }
  // coat tails
  if (L.extra === "coat") {
    c.fillStyle = L.shirt2;
    c.beginPath();
    c.moveTo(-16, -40);
    c.lineTo(-22, -18 + Math.sin(time * 3) * 1.5);
    c.lineTo(-4, -22);
    c.closePath();
    c.fill();
  }
  // scarf
  if (L.extra === "scarf") {
    const wv = Math.sin(time * 6) * 3;
    c.fillStyle = L.accent;
    rr(c, -14, -98, 28, 8, 4);
    c.fill();
    c.beginPath();
    c.moveTo(-10, -94);
    c.quadraticCurveTo(-26, -92 + wv, -38, -84 + wv * 1.5);
    c.lineTo(-34, -78 + wv);
    c.quadraticCurveTo(-22, -86, -8, -88);
    c.fill();
  }
  // fur collar (Rex)
  if (ch.id === "rex") {
    c.fillStyle = "#d9c08a";
    for (let x = -16; x <= 16; x += 8) {
      c.beginPath();
      c.arc(x, -93, 6, 0, TAU);
      c.fill();
    }
  }
}

function drawHead(c, L, P, time, f) {
  const hx = 3;
  const hy = -118;
  const R = 25;
  // neck
  c.fillStyle = shade(L.skin, -0.15);
  c.fillRect(-5, -100, 11, 10);

  // hair behind the head
  if (L.hairStyle === "long") {
    c.fillStyle = shade(L.hair, -0.1);
    c.beginPath();
    c.moveTo(hx - 22, hy - 6);
    c.quadraticCurveTo(hx - 34, hy + 22, hx - 20, hy + 34);
    c.lineTo(hx + 4, hy + 18);
    c.closePath();
    c.fill();
  }
  if (L.hairStyle === "ponytail") {
    const sw = Math.sin(time * 4 + f.side) * 4;
    c.fillStyle = L.hair;
    c.beginPath();
    c.moveTo(hx - 18, hy - 14);
    c.quadraticCurveTo(hx - 44, hy - 16 + sw, hx - 40 + sw, hy + 20);
    c.quadraticCurveTo(hx - 30, hy + 2, hx - 14, hy - 2);
    c.closePath();
    c.fill();
    c.fillStyle = L.accent;
    c.beginPath();
    c.arc(hx - 20, hy - 10, 4, 0, TAU);
    c.fill();
  }
  if (L.hat === "hood" || L.hat === "hoodmask") {
    c.fillStyle = shade(L.hatColor, -0.15);
    c.beginPath();
    c.arc(hx - 2, hy - 1, R + 6, 0, TAU);
    c.fill();
    c.beginPath();
    c.moveTo(hx - 20, hy - 18);
    c.quadraticCurveTo(hx - 40, hy - 6, hx - 32, hy + 18);
    c.lineTo(hx - 16, hy + 8);
    c.closePath();
    c.fill();
  }

  // face
  const g = c.createRadialGradient(hx + 6, hy - 8, 4, hx, hy, R + 2);
  g.addColorStop(0, shade(L.skin, 0.12));
  g.addColorStop(1, shade(L.skin, -0.1));
  c.fillStyle = g;
  c.beginPath();
  c.arc(hx, hy, R, 0, TAU);
  c.fill();
  // ear
  c.fillStyle = shade(L.skin, -0.08);
  c.beginPath();
  c.ellipse(hx - 8, hy + 2, 5, 7, 0, 0, TAU);
  c.fill();

  // beard
  if (L.beard) {
    c.fillStyle = L.beard;
    c.beginPath();
    c.moveTo(hx - 12, hy + 2);
    c.quadraticCurveTo(hx - 6, hy + 30, hx + 12, hy + 30);
    c.quadraticCurveTo(hx + 26, hy + 24, hx + 24, hy + 8);
    c.quadraticCurveTo(hx + 14, hy + 14, hx + 2, hy + 8);
    c.closePath();
    c.fill();
  }

  drawFace(c, hx, hy, P, L, f, time);

  // hair / hats on top
  c.fillStyle = L.hair;
  switch (L.hairStyle) {
    case "spiky":
      c.beginPath();
      c.moveTo(hx - 24, hy - 4);
      for (let i = 0; i < 6; i++) {
        const a = Math.PI + 0.25 + (i / 5) * 2.2;
        c.lineTo(hx + Math.cos(a) * 30 - 2, hy + Math.sin(a) * 30 - 4);
        const b = a + 0.22;
        c.lineTo(hx + Math.cos(b) * 21, hy + Math.sin(b) * 21 - 2);
      }
      c.lineTo(hx + 22, hy - 10);
      c.closePath();
      c.fill();
      break;
    case "short":
    case "long":
    case "ponytail":
      if (L.hat) break;
      c.beginPath();
      c.arc(hx, hy - 2, R + 1.5, Math.PI * 0.95, Math.PI * 2.05);
      c.quadraticCurveTo(hx + 10, hy - 12, hx - 4, hy - 8);
      c.quadraticCurveTo(hx - 14, hy - 4, hx - 24, hy + 4);
      c.closePath();
      c.fill();
      break;
    case "flame": {
      const fl = (i) => Math.sin(time * 12 + i * 1.7) * 3;
      const grd = c.createLinearGradient(0, hy - 50, 0, hy);
      grd.addColorStop(0, "#ffe25a");
      grd.addColorStop(1, L.hair);
      c.fillStyle = grd;
      c.beginPath();
      c.moveTo(hx - 25, hy);
      c.quadraticCurveTo(hx - 34, hy - 30 + fl(0), hx - 18, hy - 42 + fl(1));
      c.quadraticCurveTo(hx - 14, hy - 30, hx - 4, hy - 52 + fl(2));
      c.quadraticCurveTo(hx + 4, hy - 32, hx + 14, hy - 46 + fl(3));
      c.quadraticCurveTo(hx + 16, hy - 26, hx + 28, hy - 30 + fl(4));
      c.quadraticCurveTo(hx + 24, hy - 14, hx + 18, hy - 10);
      c.quadraticCurveTo(hx, hy - 18, hx - 25, hy);
      c.fill();
      break;
    }
    case "bald":
      c.fillStyle = "rgba(255,255,255,0.35)";
      c.beginPath();
      c.ellipse(hx + 6, hy - 16, 8, 4, -0.4, 0, TAU);
      c.fill();
      break;
    default:
      break;
  }
  drawHat(c, hx, hy, R, L, time, f);
}

function drawHat(c, hx, hy, R, L, time) {
  switch (L.hat) {
    case "hood":
      c.fillStyle = L.hatColor;
      c.beginPath();
      c.arc(hx, hy - 2, R + 4, Math.PI * 0.92, Math.PI * 2.02);
      c.quadraticCurveTo(hx + 14, hy - 16, hx - 2, hy - 14);
      c.quadraticCurveTo(hx - 16, hy - 8, hx - 26, hy + 8);
      c.closePath();
      c.fill();
      c.fillStyle = "#7ccf6a";
      c.beginPath();
      c.ellipse(hx - 10, hy - 30, 7, 3.5, -0.6, 0, TAU);
      c.fill();
      break;
    case "ninja":
      c.fillStyle = L.hatColor;
      c.beginPath();
      c.arc(hx, hy, R + 1.5, Math.PI * 0.9, Math.PI * 2.1);
      c.lineTo(hx + R, hy - 4);
      c.lineTo(hx - R, hy - 2);
      c.closePath();
      c.fill();
      // lower mask
      c.beginPath();
      c.moveTo(hx - R, hy + 4);
      c.lineTo(hx + R + 1, hy + 4);
      c.arc(hx, hy, R + 1.5, 0.1, Math.PI - 0.1);
      c.closePath();
      c.fill();
      c.fillStyle = L.accent;
      c.fillRect(hx - R, hy - 12, R * 2 + 1, 5);
      {
        const wv = Math.sin(time * 7) * 4;
        c.beginPath();
        c.moveTo(hx - R + 2, hy - 12);
        c.quadraticCurveTo(hx - R - 14, hy - 12 + wv, hx - R - 24, hy - 4 + wv);
        c.lineTo(hx - R - 20, hy + wv);
        c.quadraticCurveTo(hx - R - 10, hy - 6, hx - R + 2, hy - 7);
        c.fill();
      }
      break;
    case "viking": {
      c.fillStyle = "#efe3c4";
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(hx + s * 18, hy - 16);
        c.quadraticCurveTo(hx + s * 38, hy - 22, hx + s * 34, hy - 46);
        c.quadraticCurveTo(hx + s * 30, hy - 30, hx + s * 12, hy - 24);
        c.closePath();
        c.fill();
      }
      const g = c.createLinearGradient(hx, hy - 30, hx, hy - 6);
      g.addColorStop(0, shade(L.hatColor, 0.4));
      g.addColorStop(1, shade(L.hatColor, -0.3));
      c.fillStyle = g;
      c.beginPath();
      c.arc(hx, hy - 6, R + 1, Math.PI, 0);
      c.closePath();
      c.fill();
      c.fillStyle = "#8a6a3a";
      c.fillRect(hx - R - 1, hy - 9, R * 2 + 2, 6);
      c.fillStyle = shade(L.hatColor, -0.2);
      c.fillRect(hx + 13, hy - 8, 5, 14);
      break;
    }
    case "witch": {
      c.fillStyle = L.hatColor;
      c.beginPath();
      c.ellipse(hx, hy - 16, 36, 8, -0.05, 0, TAU);
      c.fill();
      c.beginPath();
      c.moveTo(hx - 20, hy - 18);
      c.quadraticCurveTo(hx - 6, hy - 50, hx - 22, hy - 68 + Math.sin(time * 2) * 2);
      c.quadraticCurveTo(hx + 6, hy - 52, hx + 20, hy - 18);
      c.closePath();
      c.fill();
      c.fillStyle = L.accent;
      c.fillRect(hx - 19, hy - 25, 38, 5);
      c.beginPath();
      c.arc(hx + 2, hy - 37, 6, 0.5, 5.8);
      c.arc(hx + 5, hy - 37, 5, 5.5, 0.8, true);
      c.fill();
      // hair fringe under the brim
      c.fillStyle = L.hair;
      c.beginPath();
      c.moveTo(hx - 24, hy - 14);
      c.quadraticCurveTo(hx, hy - 4, hx + 24, hy - 14);
      c.lineTo(hx + 22, hy - 18);
      c.lineTo(hx - 22, hy - 18);
      c.fill();
      break;
    }
    case "pirate": {
      c.fillStyle = L.hatColor;
      c.beginPath();
      c.moveTo(hx - 36, hy - 12);
      c.quadraticCurveTo(hx, hy - 4, hx + 36, hy - 14);
      c.quadraticCurveTo(hx + 22, hy - 52, hx, hy - 46);
      c.quadraticCurveTo(hx - 22, hy - 52, hx - 36, hy - 12);
      c.fill();
      c.strokeStyle = L.accent;
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(hx - 34, hy - 13);
      c.quadraticCurveTo(hx, hy - 5, hx + 34, hy - 15);
      c.stroke();
      c.fillStyle = "#f4f1e8";
      c.beginPath();
      c.arc(hx + 2, hy - 30, 5, 0, TAU);
      c.fill();
      c.fillStyle = L.hatColor;
      c.fillRect(hx, hy - 30, 1.5, 2);
      c.fillRect(hx + 3, hy - 30, 1.5, 2);
      break;
    }
    case "hoodmask": {
      c.fillStyle = L.hatColor;
      c.beginPath();
      c.arc(hx, hy - 1, R + 4, Math.PI * 0.85, Math.PI * 2.08);
      c.quadraticCurveTo(hx + 12, hy - 14, hx - 4, hy - 13);
      c.quadraticCurveTo(hx - 18, hy - 8, hx - 26, hy + 10);
      c.closePath();
      c.fill();
      c.fillStyle = shade(L.hatColor, 0.12);
      c.beginPath();
      c.moveTo(hx - 16, hy + 2);
      c.lineTo(hx + R + 2, hy + 1);
      c.arc(hx, hy, R + 1, 0.05, Math.PI * 0.7);
      c.closePath();
      c.fill();
      c.strokeStyle = L.accent;
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(hx - 14, hy + 3);
      c.lineTo(hx + R, hy + 2);
      c.stroke();
      break;
    }
    default:
      break;
  }
}

function drawFace(c, hx, hy, P, L, f, time) {
  const e = P.expr;
  const lx = clamp(P.look.x, -1, 1) * 2.4;
  const ly = clamp(P.look.y, -1, 1) * 2.2;
  const eyes = [
    { x: hx + 15, y: hy - 3 },
    { x: hx + 3, y: hy - 3 },
  ];
  const glow = f.char.id === "shadow" ? f.char.look.accent : null;
  c.lineCap = "round";
  for (const [i, E] of eyes.entries()) {
    const s = i === 0 ? 1 : 0.86;
    if (e === "blink") {
      c.strokeStyle = "#2a1a14";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(E.x - 4 * s, E.y + 1);
      c.lineTo(E.x + 4 * s, E.y + 1);
      c.stroke();
    } else if (e === "happy") {
      c.strokeStyle = "#2a1a14";
      c.lineWidth = 2.6;
      c.beginPath();
      c.arc(E.x, E.y + 2, 4.5 * s, Math.PI * 1.1, Math.PI * 1.9);
      c.stroke();
    } else if (e === "hurt") {
      c.strokeStyle = "#2a1a14";
      c.lineWidth = 2.4;
      const d = i === 0 ? -1 : 1;
      c.beginPath();
      c.moveTo(E.x - 4 * d, E.y - 4);
      c.lineTo(E.x + 3 * d, E.y);
      c.lineTo(E.x - 4 * d, E.y + 4);
      c.stroke();
    } else if (e === "ko") {
      c.strokeStyle = "#2a1a14";
      c.lineWidth = 2.4;
      c.beginPath();
      c.moveTo(E.x - 4, E.y - 4);
      c.lineTo(E.x + 4, E.y + 4);
      c.moveTo(E.x + 4, E.y - 4);
      c.lineTo(E.x - 4, E.y + 4);
      c.stroke();
    } else {
      const sq = e === "focus" ? 0.7 : 1;
      c.fillStyle = glow ? "#0d0f14" : "#fff";
      c.beginPath();
      c.ellipse(E.x, E.y, 5.2 * s, 6.6 * s * sq, 0, 0, TAU);
      c.fill();
      c.fillStyle = glow || "#2a1a14";
      c.beginPath();
      c.arc(E.x + lx, E.y + ly * sq, 3 * s, 0, TAU);
      c.fill();
      if (!glow) {
        c.fillStyle = "#fff";
        c.beginPath();
        c.arc(E.x + lx + 1, E.y + ly * sq - 1.4, 1.1, 0, TAU);
        c.fill();
      }
    }
  }
  // eyepatch (Captain Boom)
  if (f.char.id === "boom") {
    c.fillStyle = "#15121a";
    c.beginPath();
    c.ellipse(hx + 3, hy - 3, 6.5, 7, 0, 0, TAU);
    c.fill();
    c.strokeStyle = "#15121a";
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(hx - 3, hy - 8);
    c.lineTo(hx - 22, hy - 16);
    c.stroke();
  }
  // brows
  const hairBrow = L.hairStyle === "bald" ? "#3a2a20" : L.hair === "#cfd8ff" ? "#8c94c0" : shade(L.hair, -0.2);
  c.strokeStyle = hairBrow;
  c.lineWidth = 2.6;
  const bt = e === "focus" ? 3 : e === "hurt" ? -3 : e === "happy" ? -1 : 0;
  c.beginPath();
  c.moveTo(hx + 10, hy - 12 + bt * 0.2);
  c.lineTo(hx + 20, hy - 13 - bt * 0.6);
  c.moveTo(hx + 8, hy - 12 + bt * 0.2);
  c.lineTo(hx - 1, hy - 13 - bt * 0.6);
  c.stroke();
  // nose
  c.fillStyle = shade(L.skin, -0.12);
  c.beginPath();
  c.ellipse(hx + 21, hy + 3, 3.5, 3, 0, 0, TAU);
  c.fill();
  // cheek
  c.fillStyle = "rgba(255,120,120,0.25)";
  c.beginPath();
  c.ellipse(hx + 16, hy + 8, 4.5, 2.5, 0, 0, TAU);
  c.fill();
  // mouth (hidden behind masks)
  if (f.char.look.hat === "ninja" || f.char.look.hat === "hoodmask") return;
  const my = hy + 12;
  const mx = hx + 12;
  c.strokeStyle = "#5a2418";
  c.fillStyle = "#5a2418";
  c.lineWidth = 2.2;
  switch (e) {
    case "focus":
      c.beginPath();
      c.moveTo(mx - 4, my);
      c.lineTo(mx + 5, my - 1);
      c.stroke();
      break;
    case "shout":
      c.beginPath();
      c.ellipse(mx, my + 1, 5, 6, 0, 0, TAU);
      c.fill();
      c.fillStyle = "#e86a6a";
      c.beginPath();
      c.ellipse(mx, my + 4, 3, 2, 0, 0, TAU);
      c.fill();
      break;
    case "hurt":
      c.beginPath();
      c.moveTo(mx - 5, my + 2);
      for (let i = 0; i < 4; i++) c.lineTo(mx - 3 + i * 3, my + (i % 2 ? 2 : -1));
      c.stroke();
      c.fillStyle = "rgba(120,200,255,0.8)";
      c.beginPath();
      c.ellipse(hx - 14, hy - 14, 2.5, 4, 0.3, 0, TAU);
      c.fill();
      break;
    case "happy":
      c.beginPath();
      c.arc(mx, my - 2, 7, 0.1, Math.PI - 0.1);
      c.closePath();
      c.fill();
      break;
    case "ko":
      c.beginPath();
      c.moveTo(mx - 5, my);
      c.lineTo(mx + 5, my);
      c.stroke();
      c.fillStyle = "#e86a6a";
      c.beginPath();
      c.ellipse(mx + 2, my + 3, 3, 4, 0, 0, TAU);
      c.fill();
      break;
    default:
      c.beginPath();
      c.arc(mx, my - 3, 5, 0.3, Math.PI - 0.5);
      c.stroke();
      break;
  }
}

export function star(c, x, y, r, color) {
  c.fillStyle = color;
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r * 0.45 : r;
    c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  c.closePath();
  c.fill();
}

/** Stub fighter for menus / portraits (no battle needed). */
export function stubFighter(char, skin, anim = "idle", extra = {}) {
  return {
    char,
    weapon: char.weapon,
    skin,
    side: 0,
    dir: 1,
    k: 1,
    anim,
    animT: 0,
    aimAngle: 40,
    aimPower: 0.6,
    holding: true,
    blink: 2,
    ...extra,
  };
}

/** Draw a head-and-shoulders portrait into a square canvas context of size `s`. */
export function drawPortrait(c, char, s, skin = null, bg = true) {
  c.save();
  if (bg) {
    const g = c.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, shade(char.look.shirt, 0.35));
    g.addColorStop(1, shade(char.look.shirt, -0.35));
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  }
  const sc = s / 96;
  c.translate(s * 0.47, s * 1.62);
  c.scale(sc * 1.05, sc * 1.05);
  drawFighter(c, stubFighter(char, skin), 0, { noShadow: true });
  c.restore();
}
