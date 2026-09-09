/**
 * Parking Master — procedural ground texture.
 *
 * One canvas texture per level mapped 1:1 onto the arena floor. Drawing the
 * asphalt, the bay grid, the lane arrows and the target-bay markings straight
 * into a canvas keeps every painted line crisp and costs a single draw call,
 * which matters more than a shader here because each arena is small.
 *
 * World → canvas: px = (x + w/2) * s ,  py = (l/2 - z) * s   (so +Z is "up").
 */

import * as THREE from "three";

export function makeGroundTexture(level, env) {
  const { w, l } = level.arena;
  const s = Math.min(2048 / Math.max(w, l), 40);
  const cw = Math.round(w * s);
  const ch = Math.round(l * s);
  const cv = document.createElement("canvas");
  cv.width = cw;
  cv.height = ch;
  const ctx = cv.getContext("2d");

  const W = (x) => (x + w / 2) * s;
  const H = (z) => (l / 2 - z) * s;

  /* -------------------------------------------------------- asphalt base */

  const g = env.ground;
  ctx.fillStyle = g.color;
  ctx.fillRect(0, 0, cw, ch);

  // large soft patches for tonal variation
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * cw;
    const y = Math.random() * ch;
    const r = (0.06 + Math.random() * 0.16) * cw;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    const tint = Math.random() > 0.5 ? "255,255,255" : "0,0,0";
    grad.addColorStop(0, `rgba(${tint},${0.03 + Math.random() * 0.05})`);
    grad.addColorStop(1, `rgba(${tint},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);
  }
  // fine speckle
  const speckN = Math.round((cw * ch) / 1400);
  for (let i = 0; i < speckN; i++) {
    ctx.fillStyle = `rgba(${Math.random() > 0.5 ? "255,255,255" : "0,0,0"},${0.02 + Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * cw, Math.random() * ch, s * 0.08, s * 0.08);
  }
  // expansion joints
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = Math.max(1, s * 0.03);
  for (let x = -w / 2 + 6; x < w / 2; x += 6) {
    ctx.beginPath();
    ctx.moveTo(W(x), 0);
    ctx.lineTo(W(x), ch);
    ctx.stroke();
  }

  if (g.wet) {
    for (let i = 0; i < 10; i++) {
      const x = Math.random() * cw;
      const y = Math.random() * ch;
      const r = (0.05 + Math.random() * 0.12) * cw;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, "rgba(20,28,38,0.5)");
      grad.addColorStop(1, "rgba(20,28,38,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cw, ch);
    }
  }

  /* ---------------------------------------------------------- bay grid */

  const line = g.line;
  const paint = (fn, color = line, width = 0.12, alpha = 0.9) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1.5, width * s);
    ctx.lineCap = "round";
    fn();
    ctx.restore();
  };

  const zone = level.zone;
  const perpendicular = !zone.parallel;

  if (perpendicular) {
    // a row of bays across the parking side, centred on the target bay
    const bw = zone.size[0] + 0.2;
    const rowZ = zone.pos[1];
    const depth = zone.size[1];
    for (let k = -4; k <= 4; k++) {
      const cx = zone.pos[0] + k * bw;
      if (Math.abs(cx) > w / 2 - 0.5) continue;
      paint(() => {
        ctx.beginPath();
        ctx.moveTo(W(cx - bw / 2), H(rowZ + depth / 2));
        ctx.lineTo(W(cx - bw / 2), H(rowZ - depth / 2));
        ctx.stroke();
      }, line, 0.1, 0.7);
    }
    // back stripe of the row
    paint(() => {
      ctx.beginPath();
      ctx.moveTo(W(zone.pos[0] - 5 * bw), H(rowZ + depth / 2));
      ctx.lineTo(W(zone.pos[0] + 5 * bw), H(rowZ + depth / 2));
      ctx.stroke();
    }, line, 0.1, 0.6);
  } else {
    // parallel bays along the kerb
    const bl = zone.size[1] + 0.3;
    const cx = zone.pos[0];
    for (let k = -3; k <= 3; k++) {
      const cz = zone.pos[1] + k * bl;
      if (Math.abs(cz) > l / 2 - 0.5) continue;
      paint(() => {
        ctx.beginPath();
        ctx.moveTo(W(cx - zone.size[0] / 2), H(cz - bl / 2));
        ctx.lineTo(W(cx + zone.size[0] / 2), H(cz - bl / 2));
        ctx.stroke();
      }, line, 0.1, 0.6);
    }
    // kerb line
    paint(() => {
      ctx.beginPath();
      ctx.moveTo(W(cx + zone.size[0] / 2), 0);
      ctx.lineTo(W(cx + zone.size[0] / 2), ch);
      ctx.stroke();
    }, g.accent, 0.14, 0.8);
  }

  /* ------------------------------------------------------ lane arrows */

  const drawArrow = (cx, cz, ang, size, color = line, alpha = 0.75) => {
    ctx.save();
    ctx.translate(W(cx), H(cz));
    ctx.rotate(-ang);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    const u = size * s;
    ctx.beginPath();
    ctx.moveTo(0, -u);
    ctx.lineTo(u * 0.6, u * 0.2);
    ctx.lineTo(u * 0.22, u * 0.2);
    ctx.lineTo(u * 0.22, u);
    ctx.lineTo(-u * 0.22, u);
    ctx.lineTo(-u * 0.22, u * 0.2);
    ctx.lineTo(-u * 0.6, u * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  const start = level.start;
  drawArrow(start.pos[0], start.pos[1] + 2.4, start.heading, 0.55, line, 0.5);

  /* --------------------------------------------------- target bay paint */

  ctx.save();
  ctx.translate(W(zone.pos[0]), H(zone.pos[1]));
  ctx.rotate(-zone.heading);
  const zw = zone.size[0] * s;
  const zl = zone.size[1] * s;

  // subtle fill
  const fill = ctx.createLinearGradient(0, -zl / 2, 0, zl / 2);
  fill.addColorStop(0, "rgba(120,220,160,0.16)");
  fill.addColorStop(1, "rgba(120,220,160,0.05)");
  ctx.fillStyle = fill;
  ctx.fillRect(-zw / 2, -zl / 2, zw, zl);

  // bright outline
  ctx.strokeStyle = "#f2f6f8";
  ctx.lineWidth = Math.max(2, 0.16 * s);
  ctx.strokeRect(-zw / 2, -zl / 2, zw, zl);

  // entry mouth left open (dashed at the approach end)
  ctx.strokeStyle = env.ground.color;
  ctx.lineWidth = Math.max(3, 0.22 * s);
  const mouthZ = zone.dir === "reverse" ? -zl / 2 : zl / 2;
  ctx.beginPath();
  ctx.moveTo(-zw / 2 - 2, mouthZ);
  ctx.lineTo(zw / 2 + 2, mouthZ);
  ctx.stroke();

  // direction arrow inside the bay
  ctx.fillStyle = "#eaf3ee";
  ctx.globalAlpha = 0.92;
  const dir = zone.dir === "reverse" ? 1 : -1; // canvas +y is world -z
  const au = 0.5 * s;
  const ay = dir * zl * 0.28;
  ctx.beginPath();
  ctx.moveTo(0, ay - dir * au);
  ctx.lineTo(dir * -au * 0.7, ay + dir * au * 0.4);
  ctx.lineTo(dir * -au * 0.26, ay + dir * au * 0.4);
  ctx.lineTo(dir * -au * 0.26, ay + dir * au);
  ctx.lineTo(dir * au * 0.26, ay + dir * au);
  ctx.lineTo(dir * au * 0.26, ay + dir * au * 0.4);
  ctx.lineTo(dir * au * 0.7, ay + dir * au * 0.4);
  ctx.closePath();
  ctx.fill();

  // "P"
  ctx.globalAlpha = 0.9;
  ctx.font = `bold ${Math.round(zw * 0.5)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("P", 0, -dir * zl * 0.24);
  ctx.restore();

  /* ----------------------------------------------------------- output */

  const tex = new THREE.CanvasTexture(cv);
  // our mapping puts +Z (north) at the top of the canvas; with a plane rotated
  // -90° about X that lines up only with flipY disabled
  tex.flipY = false;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
