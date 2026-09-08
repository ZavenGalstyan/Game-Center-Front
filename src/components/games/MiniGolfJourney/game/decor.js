/**
 * Mini Golf Journey — world decorations, drawn on Canvas in logical units.
 *
 * Each decoration is a small layered illustration with its own contact shadow:
 * trees, palms, pines, rocks, ruins, city towers… They sit in the rough band
 * around the course and never on the playable surface, so they add atmosphere
 * without ever confusing a shot.
 */

function shadow(ctx, x, y, w) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(x, y, w, w * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function roundedTri(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

const DRAW = {
  tree(ctx, x, y, s, pal) {
    shadow(ctx, x, y, 9 * s);
    ctx.fillStyle = "#5a3b22";
    ctx.fillRect(x - 1.4 * s, y - 10 * s, 2.8 * s, 12 * s);
    const g = ctx.createRadialGradient(x - 3 * s, y - 20 * s, 1, x, y - 14 * s, 15 * s);
    g.addColorStop(0, "#7bc46a");
    g.addColorStop(1, "#3f7d3c");
    ctx.fillStyle = g;
    for (const [dx, dy, r] of [
      [0, -22, 11],
      [-7, -14, 8],
      [7, -15, 8],
      [0, -12, 9],
    ]) {
      ctx.beginPath();
      ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.beginPath();
    ctx.arc(x - 4 * s, y - 24 * s, 4 * s, 0, Math.PI * 2);
    ctx.fill();
  },

  bush(ctx, x, y, s) {
    shadow(ctx, x, y, 8 * s);
    const g = ctx.createLinearGradient(x, y - 10 * s, x, y);
    g.addColorStop(0, "#6bbf5c");
    g.addColorStop(1, "#3c7d3a");
    ctx.fillStyle = g;
    for (const [dx, r] of [
      [-5, 5.5],
      [0, 7],
      [5, 5.5],
    ]) {
      ctx.beginPath();
      ctx.arc(x + dx * s, y - 3 * s, r * s, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  flower(ctx, x, y, s, pal) {
    ctx.strokeStyle = "#3c7d3a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 6 * s);
    ctx.stroke();
    ctx.fillStyle = pal.accent || "#f4c744";
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * 2.2 * s, y - 6 * s + Math.sin(a) * 2.2 * s, 1.7 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#fff2c0";
    ctx.beginPath();
    ctx.arc(x, y - 6 * s, 1.5 * s, 0, Math.PI * 2);
    ctx.fill();
  },

  rock(ctx, x, y, s) {
    shadow(ctx, x, y, 8 * s);
    const g = ctx.createLinearGradient(x, y - 8 * s, x, y);
    g.addColorStop(0, "#b9bcc2");
    g.addColorStop(1, "#7f838c");
    ctx.fillStyle = g;
    roundedTri(ctx, [
      [x - 8 * s, y],
      [x - 3 * s, y - 7 * s],
      [x + 4 * s, y - 8 * s],
      [x + 8 * s, y],
    ]);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
  },

  palm(ctx, x, y, s) {
    shadow(ctx, x, y, 9 * s);
    ctx.strokeStyle = "#7a5334";
    ctx.lineWidth = 3 * s;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 4 * s, y - 14 * s, x - 1 * s, y - 26 * s);
    ctx.stroke();
    ctx.fillStyle = "#3f9d5b";
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * 0.6;
      ctx.save();
      ctx.translate(x - 1 * s, y - 26 * s);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(11 * s, 0, 12 * s, 3.4 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = "#caa06a";
    ctx.beginPath();
    ctx.arc(x - 1 * s, y - 25 * s, 2.4 * s, 0, Math.PI * 2);
    ctx.fill();
  },

  beachRock(ctx, x, y, s) {
    DRAW.rock(ctx, x, y, s * 1.1);
  },
  shell(ctx, x, y, s) {
    ctx.fillStyle = "#f7e2cf";
    ctx.beginPath();
    ctx.arc(x, y, 3 * s, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = "rgba(150,110,80,0.5)";
    ctx.lineWidth = 0.6;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + i * 2 * s, y - 3 * s);
      ctx.stroke();
    }
  },
  umbrella(ctx, x, y, s) {
    shadow(ctx, x, y, 8 * s);
    ctx.strokeStyle = "#9a8a78";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 16 * s);
    ctx.stroke();
    ctx.fillStyle = "#ef6a58";
    ctx.beginPath();
    ctx.arc(x, y - 16 * s, 10 * s, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.moveTo(x, y - 16 * s);
    ctx.arc(x, y - 16 * s, 10 * s, Math.PI, Math.PI * 1.25);
    ctx.closePath();
    ctx.fill();
  },

  pine(ctx, x, y, s) {
    shadow(ctx, x, y, 8 * s);
    ctx.fillStyle = "#5a3b22";
    ctx.fillRect(x - 1.3 * s, y - 6 * s, 2.6 * s, 7 * s);
    const g = ctx.createLinearGradient(x, y - 30 * s, x, y);
    g.addColorStop(0, "#3f7a56");
    g.addColorStop(1, "#25543c");
    ctx.fillStyle = g;
    for (const [yy, ww] of [
      [-6, 10],
      [-14, 8],
      [-22, 5.5],
    ]) {
      roundedTri(ctx, [
        [x - ww * s, y + yy * s],
        [x, y + (yy - 10) * s],
        [x + ww * s, y + yy * s],
      ]);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (const [yy, ww] of [
      [-6, 10],
      [-14, 8],
      [-22, 5.5],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x - ww * s, y + yy * s);
      ctx.lineTo(x, y + (yy - 10) * s);
      ctx.lineTo(x - ww * 0.3 * s, y + yy * s);
      ctx.closePath();
      ctx.fill();
    }
  },
  snowRock(ctx, x, y, s) {
    DRAW.rock(ctx, x, y, s);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.ellipse(x, y - 7 * s, 6 * s, 2.4 * s, 0, Math.PI, 0);
    ctx.fill();
  },
  snowman(ctx, x, y, s) {
    shadow(ctx, x, y, 7 * s);
    ctx.fillStyle = "#f4f9fc";
    for (const [yy, r] of [
      [-3, 5],
      [-10, 3.6],
      [-16, 2.6],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y + yy * s, r * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#e6702f";
    ctx.beginPath();
    ctx.moveTo(x, y - 16 * s);
    ctx.lineTo(x + 4 * s, y - 15 * s);
    ctx.lineTo(x, y - 14.5 * s);
    ctx.fill();
    ctx.fillStyle = "#26323c";
    ctx.beginPath();
    ctx.arc(x - 1 * s, y - 17 * s, 0.6 * s, 0, Math.PI * 2);
    ctx.arc(x + 1 * s, y - 17 * s, 0.6 * s, 0, Math.PI * 2);
    ctx.fill();
  },
  icicle(ctx, x, y, s) {
    ctx.fillStyle = "rgba(200,235,245,0.85)";
    for (let i = 0; i < 3; i++) {
      roundedTri(ctx, [
        [x + i * 3 * s, y],
        [x + i * 3 * s + 1.6 * s, y],
        [x + i * 3 * s + 0.8 * s, y + (5 + i * 2) * s],
      ]);
      ctx.fill();
    }
  },

  jungle(ctx, x, y, s) {
    DRAW.tree(ctx, x, y, s * 1.05, { accent: "#e0a94a" });
    ctx.strokeStyle = "#4b7d3a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 6 * s, y - 20 * s);
    ctx.quadraticCurveTo(x + 12 * s, y - 12 * s, x + 8 * s, y - 2 * s);
    ctx.stroke();
  },
  pillar(ctx, x, y, s) {
    shadow(ctx, x, y, 8 * s);
    const g = ctx.createLinearGradient(x - 6 * s, 0, x + 6 * s, 0);
    g.addColorStop(0, "#8a7c58");
    g.addColorStop(0.5, "#c2b48c");
    g.addColorStop(1, "#8a7c58");
    ctx.fillStyle = g;
    ctx.fillRect(x - 5 * s, y - 30 * s, 10 * s, 30 * s);
    ctx.fillStyle = "#b0a37c";
    ctx.fillRect(x - 7 * s, y - 34 * s, 14 * s, 4 * s);
    ctx.fillRect(x - 7 * s, y - 3 * s, 14 * s, 3 * s);
    ctx.strokeStyle = "rgba(0,0,0,0.14)";
    ctx.lineWidth = 0.7;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x - 5 * s + (i * 10 * s) / 4, y - 30 * s);
      ctx.lineTo(x - 5 * s + (i * 10 * s) / 4, y);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(90,140,70,0.5)";
    ctx.beginPath();
    ctx.arc(x + 3 * s, y - 8 * s, 3 * s, 0, Math.PI * 2);
    ctx.fill();
  },
  vineRock(ctx, x, y, s) {
    DRAW.rock(ctx, x, y, s * 1.15);
    ctx.strokeStyle = "rgba(70,120,60,0.7)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x - 4 * s, y - 6 * s);
    ctx.quadraticCurveTo(x, y - 2 * s, x + 4 * s, y - 7 * s);
    ctx.stroke();
  },
  brazier(ctx, x, y, s, pal, time = 0) {
    shadow(ctx, x, y, 6 * s);
    ctx.fillStyle = "#5a4a34";
    ctx.fillRect(x - 3 * s, y - 8 * s, 6 * s, 8 * s);
    const fl = 1 + Math.sin(time * 9 + x) * 0.18;
    const g = ctx.createRadialGradient(x, y - 11 * s, 1, x, y - 11 * s, 7 * s * fl);
    g.addColorStop(0, "#ffe7a0");
    g.addColorStop(0.5, "#ff9d3c");
    g.addColorStop(1, "rgba(255,120,40,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y - 11 * s, 7 * s * fl, 0, Math.PI * 2);
    ctx.fill();
  },

  tower(ctx, x, y, s, pal, time = 0) {
    const h = (34 + ((x * 7) % 20)) * s;
    const w = 13 * s;
    const g = ctx.createLinearGradient(x, y - h, x, y);
    g.addColorStop(0, "#2a2f4a");
    g.addColorStop(1, "#141726");
    ctx.fillStyle = g;
    ctx.fillRect(x - w / 2, y - h, w, h);
    ctx.fillStyle = "rgba(110,231,255,0.55)";
    for (let r = 0; r < 6; r++) {
      for (let cc = 0; cc < 3; cc++) {
        if ((r * 3 + cc + Math.floor(x)) % 4 === 0) continue;
        ctx.globalAlpha = 0.3 + ((r + cc) % 3) * 0.22;
        ctx.fillRect(x - w / 2 + 2.2 * s + cc * 3.4 * s, y - h + 3 * s + r * 5 * s, 2 * s, 2.6 * s);
      }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(185,140,255,0.8)";
    ctx.fillRect(x - 1 * s, y - h - 4 * s, 2 * s, 4 * s);
  },
  sign(ctx, x, y, s, pal, time = 0) {
    ctx.strokeStyle = "#3a4670";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 12 * s);
    ctx.stroke();
    const pulse = 0.55 + Math.sin(time * 3 + x) * 0.25;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = pal.accent2 || "#b98cff";
    ctx.fillRect(x - 6 * s, y - 20 * s, 12 * s, 8 * s);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(110,231,255,0.9)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 6 * s, y - 20 * s, 12 * s, 8 * s);
  },
  hover(ctx, x, y, s, pal, time = 0) {
    const fy = y + Math.sin(time * 2 + x) * 2 * s;
    ctx.fillStyle = "rgba(110,231,255,0.25)";
    ctx.beginPath();
    ctx.ellipse(x, fy + 4 * s, 8 * s, 2 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createLinearGradient(x, fy - 3 * s, x, fy + 3 * s);
    g.addColorStop(0, "#cfe8ff");
    g.addColorStop(1, "#5b7fb0");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, fy, 8 * s, 3.4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(185,140,255,0.5)";
    ctx.beginPath();
    ctx.ellipse(x, fy - 1 * s, 4 * s, 2.4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  cityLamp(ctx, x, y, s, pal, time = 0) {
    ctx.strokeStyle = "#3a4670";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 16 * s);
    ctx.stroke();
    const g = ctx.createRadialGradient(x, y - 16 * s, 0, x, y - 16 * s, 8 * s);
    g.addColorStop(0, "rgba(110,231,255,0.8)");
    g.addColorStop(1, "rgba(110,231,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y - 16 * s, 8 * s, 0, Math.PI * 2);
    ctx.fill();
  },
};

export function drawDecoration(ctx, deco, pal, time) {
  const fn = DRAW[deco.type];
  if (!fn) return;
  ctx.save();
  fn(ctx, deco.x, deco.y, deco.s || 1, pal, time);
  ctx.restore();
}
