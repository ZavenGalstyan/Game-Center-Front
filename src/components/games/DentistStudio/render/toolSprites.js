/**
 * Dentist Studio — procedurally drawn dental tools (Canvas 2D).
 *
 * Every tool is drawn in its own frame: the WORKING TIP is at the origin
 * and the handle runs along +x. Gameplay places the origin exactly on the
 * logical treatment point (the pointer) and rotates the frame so the handle
 * trails down-right toward the hand; the same functions draw the tray icons,
 * so the tray and the cursor always show the same object.
 *
 * state: { set, contact 0..1, spin (radians), open, snapped, foam, time, lens }
 */
import { shade } from "./color.js";

function capsule(ctx, x0, x1, r, set, { shine = true } = {}) {
  const g = ctx.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, set.light);
  g.addColorStop(0.35, set.main);
  g.addColorStop(1, set.dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x0, -r, x1 - x0, r * 2, r);
  ctx.fill();
  if (shine) {
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.beginPath();
    ctx.roundRect(x0 + r * 0.8, -r * 0.72, (x1 - x0) - r * 1.6, r * 0.34, r * 0.17);
    ctx.fill();
  }
}

function steel(ctx, pathFn, w) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#7f8b98";
  ctx.lineWidth = w;
  pathFn();
  ctx.stroke();
  ctx.strokeStyle = "#dfe6ed";
  ctx.lineWidth = w * 0.55;
  pathFn();
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = w * 0.18;
  pathFn();
  ctx.stroke();
}

function line(ctx, pts) {
  return () => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  };
}

function grip(ctx, x0, x1, r, set) {
  ctx.strokeStyle = shade(set.dark, -0.1);
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1.2;
  for (let x = x0; x <= x1; x += 5) {
    ctx.beginPath();
    ctx.moveTo(x, -r * 0.8);
    ctx.lineTo(x, r * 0.8);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/* ------------------------------------------------------------ tools */

const DRAW = {
  mirror(ctx, s) {
    steel(ctx, line(ctx, [[16, 0], [70, 0]]), 5);
    capsule(ctx, 66, 214, 6.5, s.set);
    grip(ctx, 90, 130, 6.5, s.set);
    // head
    ctx.fillStyle = "#8d98a4";
    ctx.beginPath();
    ctx.ellipse(0, 0, 21, 19, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!s.lens) {
      const g = ctx.createLinearGradient(-16, -16, 16, 16);
      g.addColorStop(0, "#f4fbff");
      g.addColorStop(0.5, "#b9d6ea");
      g.addColorStop(1, "#7fa6c4");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, 17.5, 15.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "#e9eef3";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 18.5, 16.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(0, 0, 12, Math.PI * 1.05, Math.PI * 1.45);
    ctx.stroke();
  },

  tweezers(ctx, s) {
    const gap = s.open === false ? 0.6 : 4.2 + (s.contact || 0) * -3.2;
    for (const sg of [-1, 1]) {
      ctx.fillStyle = sg < 0 ? "#dde4ea" : "#aab5c1";
      ctx.beginPath();
      ctx.moveTo(0, sg * gap);
      ctx.lineTo(150, sg * 5.5);
      ctx.lineTo(150, sg * 1.2);
      ctx.lineTo(2, sg * gap - sg * 1.3);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(90,100,115,0.55)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(90,100,115,0.5)";
    ctx.lineWidth = 1;
    for (let x = 84; x < 120; x += 5) {
      ctx.beginPath();
      ctx.moveTo(x, -4.5);
      ctx.lineTo(x, 4.5);
      ctx.stroke();
    }
    capsule(ctx, 146, 186, 6.5, s.set);
  },

  brush(ctx, s) {
    const c = s.contact || 0;
    // handle + neck
    ctx.fillStyle = s.set.main;
    ctx.beginPath();
    ctx.moveTo(18, -5);
    ctx.quadraticCurveTo(46, -4, 64, -7.5);
    ctx.lineTo(64, 7.5);
    ctx.quadraticCurveTo(46, 4, 18, 5);
    ctx.closePath();
    ctx.fill();
    capsule(ctx, 60, 226, 8.5, s.set);
    ctx.fillStyle = s.set.light;
    ctx.beginPath();
    ctx.roundRect(96, -5, 60, 10, 5);
    ctx.fill();
    // head (3/4 view): base plate + bristle block
    ctx.fillStyle = s.set.dark;
    ctx.beginPath();
    ctx.roundRect(-24, -9, 46, 18, 9);
    ctx.fill();
    const lift = 3.4 - c * 2.2; // bristles compress against the tooth
    const spread = 1 + c * 0.12;
    ctx.fillStyle = "#e8f4f8";
    ctx.beginPath();
    ctx.roundRect(-22 * spread, -8.5 * spread - lift, 42 * spread, 17 * spread, 7);
    ctx.fill();
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 7; col++) {
        const x = (-17 + col * 5.6) * spread;
        const y = (-5 + row * 5) * spread - lift;
        ctx.fillStyle = (row + col) % 2 ? "#ffffff" : s.set.light;
        ctx.beginPath();
        ctx.arc(x, y, 2.3 + c * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (s.foam) {
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      for (const [x, y, r] of [[-10, -12, 5], [0, -13, 6], [10, -12, 4.5], [-3, -8, 4], [14, -7, 3.2]]) {
        ctx.beginPath();
        ctx.arc(x, y - lift * 0.4, r * (0.7 + 0.3 * s.foam), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },

  bracesBrush(ctx, s) {
    steel(ctx, line(ctx, [[-10, 0], [34, 0]]), 1.6);
    // bottle-brush bristles
    ctx.fillStyle = s.set.light;
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.quadraticCurveTo(-4, -7.5, 12, -6);
    ctx.lineTo(12, 6);
    ctx.quadraticCurveTo(-4, 7.5, -12, 0);
    ctx.fill();
    ctx.strokeStyle = s.set.main;
    ctx.lineWidth = 1;
    for (let x = -8; x <= 10; x += 3) {
      ctx.beginPath();
      ctx.moveTo(x, -5.5);
      ctx.lineTo(x + 1.5, 5.5);
      ctx.stroke();
    }
    capsule(ctx, 30, 196, 6, s.set);
    grip(ctx, 150, 186, 6, s.set);
  },

  scaler(ctx, s) {
    const j = (s.contact || 0) * Math.sin((s.time || 0) * 60) * 0.8;
    ctx.save();
    ctx.translate(0, j);
    steel(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(1, -1);
      ctx.quadraticCurveTo(4, -9, 14, -7);
      ctx.quadraticCurveTo(28, -4, 44, 0);
    }, 3);
    // sickle point
    ctx.fillStyle = "#c7d1db";
    ctx.beginPath();
    ctx.moveTo(-1, 1);
    ctx.quadraticCurveTo(0, -4, 4, -6);
    ctx.lineTo(3, -2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    capsule(ctx, 42, 212, 6, s.set);
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 0.8;
    for (let x = 66; x < 190; x += 4) {
      ctx.beginPath();
      ctx.moveTo(x, -5.5);
      ctx.lineTo(x + 3, 5.5);
      ctx.stroke();
    }
  },

  water(ctx, s) {
    // nozzle sits a little back from the spray target
    steel(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(46, -20);
      ctx.quadraticCurveTo(62, -30, 92, -26);
    }, 4.5);
    ctx.fillStyle = "#9aa6b2";
    ctx.beginPath();
    ctx.arc(46, -20, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(0, -14);
    capsule(ctx, 86, 226, 10, s.set);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(110, -14, 16, 6, 3);
    ctx.fill();
    ctx.fillStyle = "#7fd0f5";
    ctx.beginPath();
    ctx.roundRect(132, -14, 16, 6, 3);
    ctx.fill();
    ctx.restore();
    // a soft aiming ring where the water lands
    ctx.strokeStyle = "rgba(120, 200, 245, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.stroke();
  },

  suction(ctx, s) {
    // translucent curved tip + hose
    ctx.lineCap = "round";
    const tube = () => {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(26, -18, 64, -12);
      ctx.lineTo(120, 0);
    };
    ctx.strokeStyle = "rgba(160, 205, 235, 0.95)";
    ctx.lineWidth = 11;
    tube();
    ctx.stroke();
    ctx.strokeStyle = "rgba(235, 248, 255, 0.95)";
    ctx.lineWidth = 5;
    tube();
    ctx.stroke();
    ctx.fillStyle = "#4d6c86";
    ctx.beginPath();
    ctx.ellipse(0, 0, 4.2, 5.4, -0.8, 0, Math.PI * 2);
    ctx.fill();
    capsule(ctx, 112, 136, 8, s.set);
    ctx.strokeStyle = s.set.dark;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(134, 0);
    ctx.quadraticCurveTo(170, 6, 220, 30);
    ctx.stroke();
    ctx.strokeStyle = s.set.main;
    ctx.lineWidth = 5;
    ctx.stroke();
  },

  floss(ctx, s) {
    // floss pick: U-shaped prongs, string across the tip
    const dip = s.snapped ? 3.2 : 0;
    ctx.fillStyle = s.set.main;
    ctx.beginPath();
    ctx.moveTo(-3, -15);
    ctx.lineTo(4, -15);
    ctx.quadraticCurveTo(22, -14, 30, -4);
    ctx.lineTo(30, 4);
    ctx.quadraticCurveTo(22, 14, 4, 15);
    ctx.lineTo(-3, 15);
    ctx.lineTo(-3, 11);
    ctx.lineTo(3, 11);
    ctx.quadraticCurveTo(17, 10, 24, 2);
    ctx.lineTo(24, -2);
    ctx.quadraticCurveTo(17, -10, 3, -11);
    ctx.lineTo(-3, -11);
    ctx.closePath();
    ctx.fill();
    capsule(ctx, 26, 176, 5.5, s.set);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-1, -13);
    ctx.quadraticCurveTo(dip, 0, -1, 13);
    ctx.stroke();
  },

  polisher(ctx, s) {
    handpiece(ctx, s);
    // rubber prophy cup
    ctx.fillStyle = "#c9b6f2";
    ctx.beginPath();
    ctx.arc(0, 0, 8.5 - (s.contact || 0) * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e9e0ff";
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#8c73cf";
    ctx.lineWidth = 1.2;
    const sp = s.spin || 0;
    for (let i = 0; i < 4; i++) {
      const a = sp + (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.arc(0, 0, 6.5, a, a + 0.9);
      ctx.stroke();
    }
    if (s.contact > 0.2) {
      ctx.fillStyle = "rgba(255, 245, 230, 0.9)";
      ctx.beginPath();
      ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  stainBrush(ctx, s) {
    handpiece(ctx, s);
    ctx.save();
    ctx.rotate(s.spin || 0);
    ctx.fillStyle = "#fff4d6";
    for (let i = 0; i < 8; i++) {
      ctx.rotate(Math.PI / 4);
      ctx.beginPath();
      ctx.ellipse(4, 0, 4.5, 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = "#e0a95a";
    ctx.beginPath();
    ctx.arc(0, 0, 2.4, 0, Math.PI * 2);
    ctx.fill();
  },

  cavity(ctx, s) {
    handpiece(ctx, s, 0.8);
    // soft pearl bead with a calm glow — deliberately nothing drill-like
    const g = ctx.createRadialGradient(-1.5, -1.5, 0, 0, 0, 6);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.5, "#bfe7ff");
    g.addColorStop(1, "#6fb4e0");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 5.2, 0, Math.PI * 2);
    ctx.fill();
    if (s.contact > 0.2) {
      ctx.strokeStyle = `rgba(140, 215, 255, ${0.4 + 0.3 * Math.sin((s.time || 0) * 20)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  },

  filler(ctx, s) {
    steel(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(2, -1);
      ctx.quadraticCurveTo(12, -12, 34, -8);
    }, 3.2);
    ctx.fillStyle = "#f7f1e2";
    ctx.beginPath();
    ctx.arc(0, 0, 4.6 + (s.contact || 0), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(190, 170, 130, 0.6)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    capsule(ctx, 30, 192, 8, s.set);
    // clear window showing the tooth-coloured material
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.roundRect(62, -4.5, 50, 9, 4.5);
    ctx.fill();
    ctx.fillStyle = "#efe4c8";
    ctx.beginPath();
    ctx.roundRect(64, -3, 34, 6, 3);
    ctx.fill();
  },

  smoother(ctx, s) {
    steel(ctx, line(ctx, [[6, 0], [52, 0]]), 3);
    const g = ctx.createLinearGradient(-8, -5, 8, 5);
    g.addColorStop(0, "#f5f8fb");
    g.addColorStop(1, "#98a5b3");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, 8.5 - (s.contact || 0), 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(90,100,115,0.5)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    capsule(ctx, 48, 206, 6.5, s.set);
    grip(ctx, 70, 110, 6.5, s.set);
  },
};

function handpiece(ctx, s, scale = 1) {
  // contra-angle: small head at the tip, bent neck, long body
  ctx.fillStyle = "#b6c1cc";
  ctx.beginPath();
  ctx.arc(0, 0, 10 * scale, 0, Math.PI * 2);
  ctx.fill();
  steel(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(6, -4);
    ctx.quadraticCurveTo(22, -14, 46, -10);
  }, 9 * scale);
  ctx.save();
  ctx.translate(0, -8);
  capsule(ctx, 40, 220, 9.5, s.set);
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillRect(70, -9.5, 3, 19);
  ctx.fillRect(78, -9.5, 3, 19);
  ctx.restore();
}

/** Default hand angle per tool (radians, handle toward the lower right). */
export const TOOL_ANGLE = {
  mirror: 0.62,
  tweezers: 0.7,
  brush: 0.4,
  bracesBrush: 0.55,
  scaler: 0.72,
  water: 0.5,
  suction: 0.35,
  floss: 1.25,
  polisher: 0.55,
  stainBrush: 0.55,
  cavity: 0.6,
  filler: 0.62,
  smoother: 0.66,
};

/** Soft contact shadow + the tool. Caller sets the (screen) transform. */
export function drawTool(ctx, id, x, y, ang, k, state) {
  const fn = DRAW[id];
  if (!fn) return;
  ctx.save();
  ctx.translate(x, y);
  // shadow: offset silhouette along the tool axis
  if (!state.noShadow) {
    ctx.save();
    ctx.translate(7 * k, 11 * k);
    ctx.rotate(ang);
    ctx.scale(k, k);
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(40, 30, 50, 0.1)";
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(200, 0);
    ctx.stroke();
    ctx.strokeStyle = "rgba(40, 30, 50, 0.1)";
    ctx.lineWidth = 11;
    ctx.stroke();
    ctx.restore();
  }
  ctx.rotate(ang);
  ctx.scale(k, k);
  fn(ctx, state);
  ctx.restore();
}

/** Where the water nozzle is (world/screen space) for a tool placed at x,y. */
export function nozzlePoint(x, y, ang, k) {
  const lx = 46;
  const ly = -20;
  return [x + (lx * Math.cos(ang) - ly * Math.sin(ang)) * k, y + (lx * Math.sin(ang) + ly * Math.cos(ang)) * k];
}
