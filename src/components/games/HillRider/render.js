/**
 * Hill Rider canvas renderer: parallax sky / mountains / hills, terrain with
 * a grass (sand, snow) crust, scenery, pickups, the vehicle and driver,
 * particles and the HUD. World units are metres (y up); the camera maps them
 * to pixels and follows the car smoothly.
 */
import { toWorld } from "./physics.js";
import { rng } from "./terrain.js";

const TAU = Math.PI * 2;

export function createView(canvas) {
  const ctx = canvas.getContext("2d");
  const v = { ctx, w: 1, h: 1, dpr: 1, cam: null, ppm: 40, fx: [], pops: [], shake: 0, clouds: null };

  v.resize = (w, h, dpr) => {
    Object.assign(v, { w, h, dpr });
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  };
  v.reset = () => ((v.cam = null), (v.fx = []), (v.pops = []));

  /* ---------- effects ---------- */
  v.puff = (x, y, color, n, spread = 1, up = 1.5) => {
    for (let k = 0; k < n && v.fx.length < 400; k++)
      v.fx.push({ x, y, vx: (Math.random() - 0.5) * 4 * spread, vy: Math.random() * up * 2, life: 0.5 + Math.random() * 0.6, max: 1.1, r: 0.12 + Math.random() * 0.2, color, g: 3 });
  };
  v.sparkle = (x, y, color) => {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU;
      v.fx.push({ x, y, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, life: 0.45, max: 0.45, r: 0.07, color, g: 0, spark: true });
    }
  };
  v.pop = (text, color = "#fff", big = false) => v.pops.push({ text, color, big, life: 1.6 });

  const S = () => v.ppm;
  const sx = (x) => (x - v.cam.x) * S() + v.w * 0.36;
  const sy = (y) => v.h * 0.6 - (y - v.cam.y) * S();

  function follow(w, dt) {
    const c = w.chassis;
    const base = v.w > v.h ? Math.min(v.w / 24, v.h / 12.5) : v.w / 13;
    const speed = Math.hypot(c.vx, c.vy);
    // look ahead along the road so climbs and drops stay in view
    const ahead = c.x + Math.max(-6, Math.min(10, c.vx * 0.6));
    const ty = (c.y + w.terrain.h(ahead) + w.v.radius) / 2 + 0.6;
    const target = { x: c.x + Math.max(-4, Math.min(5, c.vx * 0.3)), y: ty, z: base * (1 - Math.min(0.2, speed / 110)) };
    if (!v.cam) v.cam = { ...target };
    const k = 1 - Math.exp(-dt * 4), kz = 1 - Math.exp(-dt * 1.5);
    v.cam.x += (target.x - v.cam.x) * k;
    v.cam.y += (target.y - v.cam.y) * (1 - Math.exp(-dt * 3));
    v.cam.z += (target.z - v.cam.z) * kz;
    v.ppm = v.cam.z;
  }

  /* ---------- background ---------- */
  function sky(map, t) {
    const g = ctx.createLinearGradient(0, 0, 0, v.h);
    g.addColorStop(0, map.sky[0]);
    g.addColorStop(1, map.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, v.w, v.h);
    // sun
    const sunX = v.w * 0.78, sunY = v.h * 0.2, r = Math.min(v.w, v.h) * 0.07;
    const glow = ctx.createRadialGradient(sunX, sunY, r * 0.5, sunX, sunY, r * 3);
    glow.addColorStop(0, "rgba(255,250,220,.75)");
    glow.addColorStop(1, "rgba(255,250,220,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - r * 3, sunY - r * 3, r * 6, r * 6);
    ctx.fillStyle = "#fffbe6";
    ctx.beginPath();
    ctx.arc(sunX, sunY, r, 0, TAU);
    ctx.fill();
    // clouds (slow parallax + drift)
    if (!v.clouds) {
      const r2 = rng(5);
      v.clouds = Array.from({ length: 7 }, () => ({ x: r2() * 1.4, y: 0.06 + r2() * 0.3, s: 0.6 + r2() * 0.8 }));
    }
    ctx.fillStyle = "rgba(255,255,255,.85)";
    for (const cl of v.clouds) {
      const span = v.w * 1.4;
      const x = ((((cl.x * span - v.cam.x * S() * 0.05 - t * 8) % span) + span) % span) - v.w * 0.2;
      const y = cl.y * v.h, s = cl.s * Math.min(v.w, v.h) * 0.06;
      ctx.beginPath();
      ctx.ellipse(x, y, s * 1.6, s * 0.55, 0, 0, TAU);
      ctx.ellipse(x - s * 0.7, y + s * 0.1, s * 0.8, s * 0.45, 0, 0, TAU);
      ctx.ellipse(x + s * 0.4, y - s * 0.3, s * 0.85, s * 0.6, 0, 0, TAU);
      ctx.fill();
    }
  }

  /** A parallax ridge: heights from a few sines of world x at that depth. */
  function ridge(par, base, amp, freqs, color, cap, peaks = false) {
    const step = 6;
    const pts = [];
    for (let px = -step; px <= v.w + step; px += step) {
      const wx = (px - v.w * 0.36) / S() + v.cam.x * par;
      let hgt = 0;
      freqs.forEach(([f, a, ph]) => (hgt += (peaks ? 1 - 2 * Math.abs(Math.sin(wx * f + ph)) : Math.sin(wx * f + ph)) * a));
      pts.push([px, v.h * base - hgt * amp * S() + v.cam.y * S() * par * 0.4]);
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-step, v.h);
    pts.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(v.w + step, v.h);
    ctx.fill();
    if (cap) {
      // snow caps on the high points
      ctx.fillStyle = cap;
      const top = Math.min(...pts.map((p) => p[1]));
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(-step, v.h);
      pts.forEach(([x, y]) => ctx.lineTo(x, y));
      ctx.lineTo(v.w + step, v.h);
      ctx.clip();
      ctx.fillRect(0, top - 2, v.w, (v.h * base - top) * 0.35 + 2);
      ctx.restore();
    }
  }

  /* ---------- world ---------- */
  function prop(map, x, y, k, s) {
    const X = sx(x), Y = sy(y), u = S() * s;
    if (map.tree === "round") {
      ctx.fillStyle = "#6b4226";
      ctx.fillRect(X - u * 0.12, Y - u * 1.4, u * 0.24, u * 1.5);
      ctx.fillStyle = k < 0.5 ? "#2e8b3e" : "#3aa04a";
      for (const [dx, dy, r] of [[0, 2.1, 0.9], [-0.55, 1.6, 0.65], [0.55, 1.65, 0.7]]) {
        ctx.beginPath();
        ctx.arc(X + dx * u, Y - dy * u, r * u, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(255,255,255,.18)";
      ctx.beginPath();
      ctx.arc(X - 0.25 * u, Y - 2.35 * u, 0.35 * u, 0, TAU);
      ctx.fill();
    } else if (map.tree === "cactus") {
      ctx.strokeStyle = "#3f8f4f";
      ctx.lineCap = "round";
      ctx.lineWidth = u * 0.36;
      ctx.beginPath();
      ctx.moveTo(X, Y);
      ctx.lineTo(X, Y - u * 2.1);
      ctx.moveTo(X, Y - u * 1.1);
      ctx.lineTo(X - u * 0.55, Y - u * 1.1);
      ctx.lineTo(X - u * 0.55, Y - u * 1.6);
      if (k > 0.4) {
        ctx.moveTo(X, Y - u * 1.4);
        ctx.lineTo(X + u * 0.5, Y - u * 1.4);
        ctx.lineTo(X + u * 0.5, Y - u * 1.85);
      }
      ctx.stroke();
    } else {
      ctx.fillStyle = "#5a3d2b";
      ctx.fillRect(X - u * 0.1, Y - u * 0.6, u * 0.2, u * 0.7);
      for (let i = 0; i < 3; i++) {
        const w = (1 - i * 0.25) * u, y0 = Y - u * (0.4 + i * 0.75);
        ctx.fillStyle = "#2f5d50";
        ctx.beginPath();
        ctx.moveTo(X - w, y0);
        ctx.lineTo(X + w, y0);
        ctx.lineTo(X, y0 - u * 1.1);
        ctx.fill();
        ctx.fillStyle = "#f4f8ff";
        ctx.beginPath();
        ctx.moveTo(X - w * 0.35, y0 - u * 0.7);
        ctx.lineTo(X + w * 0.35, y0 - u * 0.7);
        ctx.lineTo(X, y0 - u * 1.1);
        ctx.fill();
      }
    }
  }

  function ground(w, x0, x1) {
    const { terrain: T, map } = w;
    const step = Math.max(0.25, 6 / S());
    ctx.beginPath();
    ctx.moveTo(sx(x0), v.h + 10);
    for (let x = x0; x <= x1; x += step) ctx.lineTo(sx(x), sy(T.h(x)));
    ctx.lineTo(sx(x1), v.h + 10);
    const g = ctx.createLinearGradient(0, sy(T.h(v.cam.x)), 0, v.h);
    g.addColorStop(0, map.ground[0]);
    g.addColorStop(1, map.ground[1]);
    ctx.fillStyle = g;
    ctx.fill();
    // pebbles
    ctx.fillStyle = "rgba(0,0,0,.12)";
    for (let x = Math.floor(x0 / 2.3) * 2.3; x < x1; x += 2.3) {
      const r = rng(Math.floor(x * 10))();
      const depth = 0.6 + r * 3;
      ctx.beginPath();
      ctx.ellipse(sx(x + r), sy(T.h(x + r) - depth), S() * (0.08 + r * 0.12), S() * 0.07, 0, 0, TAU);
      ctx.fill();
    }
    // crust: thick top band + highlight
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let x = x0; x <= x1; x += step) ctx[x === x0 ? "moveTo" : "lineTo"](sx(x), sy(T.h(x)) + S() * 0.16);
    ctx.strokeStyle = map.top;
    ctx.lineWidth = S() * 0.34;
    ctx.stroke();
    ctx.beginPath();
    for (let x = x0; x <= x1; x += step) ctx[x === x0 ? "moveTo" : "lineTo"](sx(x), sy(T.h(x)) + S() * 0.04);
    ctx.strokeStyle = map.topHi;
    ctx.lineWidth = Math.max(1.5, S() * 0.08);
    ctx.stroke();
  }

  function marker(w, x, label, color) {
    const y = w.terrain.h(x), X = sx(x), Y = sy(y), u = S();
    ctx.fillStyle = "#5b4636";
    ctx.fillRect(X - u * 0.05, Y - u * 2.2, u * 0.1, u * 2.2);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(X + u * 0.05, Y - u * 2.2);
    ctx.lineTo(X + u * 1.3, Y - u * 1.9);
    ctx.lineTo(X + u * 0.05, Y - u * 1.55);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `800 ${Math.max(10, u * 0.32)}px Nunito, system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(label, X + u * 0.12, Y - u * 1.78);
  }

  function coin(x, y, t, val) {
    const X = sx(x), Y = sy(y + Math.sin(t * 3 + x) * 0.08), r = S() * (val > 5 ? 0.42 : 0.3);
    const squash = Math.abs(Math.cos(t * 3 + x * 0.7));
    ctx.save();
    ctx.translate(X, Y);
    ctx.scale(Math.max(0.12, squash), 1);
    ctx.fillStyle = "#b8860b";
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = val > 5 ? "#ffe066" : "#ffd23f";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.82, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#e0a800";
    ctx.font = `900 ${r * 1.1}px Nunito, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(val > 5 ? "25" : "★", 0, r * 0.05);
    ctx.restore();
  }

  function can(x, y, t) {
    const X = sx(x), Y = sy(y + Math.sin(t * 2.5) * 0.1), u = S();
    ctx.save();
    ctx.translate(X, Y);
    ctx.rotate(Math.sin(t * 2) * 0.08);
    ctx.shadowColor = "rgba(255,80,60,.8)";
    ctx.shadowBlur = u * 0.5;
    ctx.fillStyle = "#e63946";
    ctx.beginPath();
    ctx.roundRect(-u * 0.38, -u * 0.48, u * 0.76, u * 0.96, u * 0.1);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#b71c2c";
    ctx.fillRect(-u * 0.12, -u * 0.62, u * 0.24, u * 0.16);
    ctx.strokeStyle = "#ffd6d6";
    ctx.lineWidth = u * 0.07;
    ctx.beginPath();
    ctx.moveTo(-u * 0.22, -u * 0.25);
    ctx.lineTo(u * 0.22, u * 0.3);
    ctx.moveTo(u * 0.22, -u * 0.25);
    ctx.lineTo(-u * 0.22, u * 0.3);
    ctx.stroke();
    ctx.restore();
  }

  /* ---------- vehicle ---------- */
  function wheel(wh, veh) {
    const X = sx(wh.x), Y = sy(wh.y), r = wh.r * S();
    ctx.save();
    ctx.translate(X, Y);
    ctx.rotate(wh.phi); // positive spin rolls clockwise on screen
    ctx.fillStyle = "#1d1d24";
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    // tread blocks
    ctx.fillStyle = "#2d2d38";
    const n = veh.id === "monster" ? 14 : 10;
    for (let k = 0; k < n; k++) {
      ctx.rotate(TAU / n);
      ctx.fillRect(-r * 0.12, -r, r * 0.24, r * 0.16);
    }
    ctx.fillStyle = "#c9ced8";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#7d8597";
    ctx.lineWidth = r * 0.1;
    for (let k = 0; k < 5; k++) {
      ctx.rotate(TAU / 5);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -r * 0.5);
      ctx.stroke();
    }
    ctx.fillStyle = veh.trim;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.16, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function driver(hx, hy, color, lean = 0) {
    // body (in vehicle-local metres, y up — caller set the transform)
    ctx.fillStyle = "#2b2d42";
    ctx.beginPath();
    ctx.roundRect(hx - 0.2 + lean, hy - 0.85, 0.42, 0.6, 0.12);
    ctx.fill();
    ctx.fillStyle = "#ffcf9f";
    ctx.beginPath();
    ctx.arc(hx, hy, 0.24, 0, TAU);
    ctx.fill();
    // helmet + goggles
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(hx, hy + 0.03, 0.27, 0.15 * Math.PI, 1.05 * Math.PI);
    ctx.fill();
    ctx.fillStyle = "#264653";
    ctx.beginPath();
    ctx.roundRect(hx + 0.02, hy - 0.04, 0.24, 0.12, 0.05);
    ctx.fill();
    ctx.fillStyle = "#8ecae6";
    ctx.fillRect(hx + 0.06, hy - 0.01, 0.16, 0.06);
  }

  function body(w) {
    const c = w.chassis, veh = w.v, u = S();
    // suspension struts (world space)
    ctx.lineCap = "round";
    for (const wh of w.wheels) {
      const [ax, ay] = toWorld(c, wh.ax, wh.ay);
      ctx.strokeStyle = "#9aa3b5";
      ctx.lineWidth = u * (veh.id === "monster" ? 0.16 : 0.1);
      ctx.beginPath();
      ctx.moveTo(sx(ax), sy(ay));
      ctx.lineTo(sx(wh.x), sy(wh.y));
      ctx.stroke();
      ctx.strokeStyle = "#e9c46a";
      ctx.lineWidth = u * 0.05;
      ctx.setLineDash([u * 0.06, u * 0.05]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.save();
    ctx.translate(sx(c.x), sy(c.y));
    ctx.rotate(-c.a);
    ctx.scale(u, -u);
    const col = veh.color, trim = veh.trim;
    ctx.lineJoin = "round";
    if (veh.id === "bike") {
      // legs to the footpegs, then the rider
      ctx.strokeStyle = "#2b2d42";
      ctx.lineWidth = 0.15;
      ctx.beginPath();
      ctx.moveTo(veh.head[0] - 0.05, veh.head[1] - 0.8);
      ctx.lineTo(0.25, 0.35);
      ctx.lineTo(0.1, 0.0);
      ctx.stroke();
      driver(veh.head[0], veh.head[1], col, 0.12);
      // arms to the bars
      ctx.strokeStyle = "#2b2d42";
      ctx.lineWidth = 0.13;
      ctx.beginPath();
      ctx.moveTo(veh.head[0] + 0.05, veh.head[1] - 0.45);
      ctx.lineTo(0.62, 0.72);
      ctx.stroke();
      // frame
      ctx.strokeStyle = "#30343f";
      ctx.lineWidth = 0.12;
      ctx.beginPath();
      ctx.moveTo(-0.8, -0.2);
      ctx.lineTo(-0.1, 0.25);
      ctx.lineTo(0.55, 0.62);
      ctx.moveTo(-0.1, 0.25);
      ctx.lineTo(0.85, -0.2);
      ctx.stroke();
      // tank + seat + fender
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(-0.55, 0.3);
      ctx.quadraticCurveTo(0.1, 0.62, 0.55, 0.45);
      ctx.lineTo(0.5, 0.2);
      ctx.lineTo(-0.35, 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#1f2430";
      ctx.beginPath();
      ctx.roundRect(-0.75, 0.28, 0.6, 0.12, 0.06);
      ctx.fill();
      ctx.fillStyle = trim;
      ctx.beginPath();
      ctx.moveTo(0.65, 0.35);
      ctx.quadraticCurveTo(0.95, 0.4, 1.15, 0.2);
      ctx.lineTo(0.95, 0.18);
      ctx.fill();
      ctx.fillStyle = "#8d99ae";
      ctx.beginPath();
      ctx.roundRect(-0.35, -0.05, 0.5, 0.28, 0.06); // engine
      ctx.fill();
      ctx.strokeStyle = "#adb5bd";
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      ctx.moveTo(-0.15, 0);
      ctx.quadraticCurveTo(-0.6, -0.05, -0.95, 0.15); // exhaust
      ctx.stroke();
      ctx.strokeStyle = "#30343f";
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      ctx.moveTo(0.55, 0.62);
      ctx.lineTo(0.7, 0.8); // bars
      ctx.stroke();
    } else {
      const big = veh.id === "monster";
      const lift = big ? 0.1 : 0;
      driver(veh.head[0], veh.head[1], big ? "#ef476f" : "#118ab2");
      // roll cage / cab
      ctx.strokeStyle = "#2b2d42";
      ctx.lineWidth = 0.09;
      ctx.beginPath();
      ctx.moveTo(-0.95, 0.4 + lift);
      ctx.lineTo(-0.8, veh.head[1] + 0.25);
      ctx.lineTo(0.25, veh.head[1] + 0.2);
      ctx.lineTo(0.45, 0.45 + lift);
      ctx.stroke();
      // windshield
      ctx.fillStyle = "rgba(170,220,255,.55)";
      ctx.beginPath();
      ctx.moveTo(0.42, 0.45 + lift);
      ctx.lineTo(0.22, veh.head[1] + 0.15);
      ctx.lineTo(0.3, veh.head[1] + 0.15);
      ctx.lineTo(0.55, 0.45 + lift);
      ctx.fill();
      // body shell
      const x0 = veh.body[0][0], x1 = veh.body[1][0];
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(x0, -0.22 + lift);
      ctx.lineTo(x1 - 0.1, -0.22 + lift);
      ctx.quadraticCurveTo(x1 + 0.05, -0.2 + lift, x1, 0.15 + lift);
      ctx.lineTo(x1 - 0.15, 0.35 + lift);
      ctx.lineTo(0.5, 0.48 + lift);
      ctx.lineTo(-0.6, 0.48 + lift);
      ctx.lineTo(-0.75, 0.32 + lift);
      ctx.lineTo(x0 + 0.05, 0.35 + lift);
      ctx.closePath();
      ctx.fill();
      // wheel arches
      ctx.fillStyle = "rgba(0,0,0,.28)";
      for (const [ax] of veh.anchors) {
        ctx.beginPath();
        ctx.arc(ax, -0.22 + lift, veh.radius * 0.95, 0, Math.PI);
        ctx.fill();
      }
      // stripe, lights, bumpers
      ctx.fillStyle = trim;
      ctx.fillRect(x0 + 0.1, 0.08 + lift, x1 - x0 - 0.3, 0.09);
      ctx.fillStyle = "#fff3b0";
      ctx.beginPath();
      ctx.arc(x1 - 0.12, 0.2 + lift, 0.08, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#e63946";
      ctx.fillRect(x0 - 0.02, 0.12 + lift, 0.08, 0.14);
      ctx.fillStyle = "#3d405b";
      ctx.fillRect(x1 - 0.05, -0.25 + lift, 0.18, 0.12);
      ctx.fillRect(x0 - 0.12, -0.25 + lift, 0.18, 0.12);
      if (!big) {
        // spare tyre
        ctx.fillStyle = "#1d1d24";
        ctx.beginPath();
        ctx.arc(x0 - 0.05, 0.42, 0.24, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#c9ced8";
        ctx.beginPath();
        ctx.arc(x0 - 0.05, 0.42, 0.11, 0, TAU);
        ctx.fill();
      } else {
        // flames decal
        ctx.fillStyle = "#ffd166";
        ctx.beginPath();
        ctx.moveTo(-0.8, 0.0 + lift);
        for (let k = 0; k < 4; k++) ctx.quadraticCurveTo(-0.6 + k * 0.38, 0.32 + lift, -0.45 + k * 0.38, 0.05 + lift);
        ctx.lineTo(0.9, 0.0 + lift);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /* ---------- HUD ---------- */
  function hud(w, best, t) {
    const pad = Math.max(10, v.h * 0.025), u = Math.max(12, Math.min(v.w, v.h) * 0.045);
    ctx.textBaseline = "middle";
    // fuel gauge
    const gw = u * 6.5, gh = u * 0.7, gx = pad, gy = pad;
    const low = w.fuel < 0.25;
    ctx.fillStyle = "rgba(20,24,40,.55)";
    ctx.beginPath();
    ctx.roundRect(gx, gy, gw + u * 1.6, gh + u * 0.5, u * 0.4);
    ctx.fill();
    ctx.fillStyle = "#e63946";
    ctx.beginPath();
    ctx.roundRect(gx + u * 0.3, gy + u * 0.22, u * 0.8, gh + u * 0.06, u * 0.12);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `900 ${u * 0.5}px Nunito, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("F", gx + u * 0.7, gy + u * 0.25 + gh / 2);
    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.beginPath();
    ctx.roundRect(gx + u * 1.3, gy + u * 0.25, gw, gh, gh / 2);
    ctx.fill();
    const fg = ctx.createLinearGradient(gx + u * 1.3, 0, gx + u * 1.3 + gw, 0);
    fg.addColorStop(0, "#ef233c");
    fg.addColorStop(0.35, "#ffb703");
    fg.addColorStop(1, "#52d273");
    ctx.fillStyle = low && Math.floor(t * 4) % 2 ? "#ff4d6d" : fg;
    ctx.beginPath();
    ctx.roundRect(gx + u * 1.3, gy + u * 0.25, Math.max(gh, gw * w.fuel), gh, gh / 2);
    ctx.fill();
    // coins
    const cy = gy + gh + u * 1.15;
    ctx.fillStyle = "#ffd23f";
    ctx.beginPath();
    ctx.arc(gx + u * 0.7, cy, u * 0.36, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.font = `900 ${u * 0.62}px Nunito, system-ui, sans-serif`;
    ctx.fillText(String(w.coins + w.bonus), gx + u * 1.3, cy + 1);
    // distance
    ctx.textAlign = "center";
    ctx.font = `900 ${u * 0.95}px Nunito, system-ui, sans-serif`;
    ctx.lineWidth = u * 0.16;
    ctx.strokeStyle = "rgba(20,24,40,.45)";
    ctx.strokeText(`${w.dist} m`, v.w / 2, pad + u * 0.6);
    ctx.fillStyle = "#fff";
    ctx.fillText(`${w.dist} m`, v.w / 2, pad + u * 0.6);
    ctx.font = `800 ${u * 0.45}px Nunito, system-ui, sans-serif`;
    ctx.fillStyle = w.dist > best && best > 0 ? "#ffd23f" : "rgba(255,255,255,.85)";
    ctx.fillText(w.dist > best && best > 0 ? "NEW BEST!" : `BEST ${best} m`, v.w / 2, pad + u * 1.45);
    // popups (flips, airtime, fuel)
    let k = 0;
    for (const p of v.pops) {
      ctx.globalAlpha = Math.min(1, p.life * 1.5);
      const size = u * (p.big ? 1.1 : 0.75) * (1 + Math.max(0, p.life - 1.35) * 2);
      ctx.font = `900 ${size}px Nunito, system-ui, sans-serif`;
      const y = v.h * 0.3 + k * u * 1.2 - (1.6 - p.life) * u * 0.8;
      ctx.lineWidth = size * 0.18;
      ctx.strokeStyle = "rgba(20,24,40,.6)";
      ctx.strokeText(p.text, v.w / 2, y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, v.w / 2, y);
      k++;
    }
    ctx.globalAlpha = 1;
    if (low && w.fuel > 0 && !w.over) {
      ctx.font = `900 ${u * 0.6}px Nunito, system-ui, sans-serif`;
      ctx.fillStyle = Math.floor(t * 3) % 2 ? "#ff4d6d" : "#fff";
      ctx.fillText("LOW FUEL", v.w / 2, pad + u * 2.25);
    }
  }

  /** Draw a frame of world `w`. */
  v.draw = (w, { dt = 0, t = 0, best = 0, hud: showHud = true } = {}) => {
    follow(w, dt);
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    const map = w.map;
    sky(map, t);
    ridge(0.12, 0.52, 1.3, [[0.04, 3, 1], [0.11, 1.5, 2], [0.29, 0.4, 0]], map.far, map.tree === "cactus" ? null : "rgba(255,255,255,.85)", map.tree !== "cactus");
    ridge(0.35, 0.6, 1.1, [[0.09, 1.8, 4], [0.21, 1, 1], [0.5, 0.3, 2]], map.mid);
    ctx.save();
    if (v.shake > 0) ctx.translate((Math.random() - 0.5) * v.shake * 10, (Math.random() - 0.5) * v.shake * 10);
    v.shake = Math.max(0, v.shake - dt * 3);
    const x0 = v.cam.x - (v.w * 0.36) / S() - 2, x1 = v.cam.x + (v.w * 0.64) / S() + 2;
    const T = w.terrain;
    T.extend(x1 + 10);
    for (const p of T.props) if (p.x > x0 - 3 && p.x < x1 + 3) prop(map, p.x, T.h(p.x) - 0.15, p.k, p.s);
    ground(w, x0, x1);
    // distance markers every 100 m + best
    for (let m = Math.ceil((x0 - 6) / 100) * 100; m + 6 < x1; m += 100) if (m > 0) marker(w, m + 6, `${m} m`, "#ff9f1c");
    if (best > 0 && best + 6 > x0 && best + 6 < x1) marker(w, best + 6, "BEST", "#ef476f");
    for (const c of T.coins) if (!c.got && c.x > x0 && c.x < x1) coin(c.x, T.h(c.x) + 1.1, t, c.v);
    for (const c of T.cans) if (!c.got && c.x > x0 && c.x < x1) can(c.x, T.h(c.x) + 0.9, t);
    // particles behind the car
    for (const p of v.fx) {
      p.vy -= p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max)) * (p.spark ? 1 : 0.7);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(sx(p.x), sy(p.y), p.r * S() * (p.spark ? 1 : 1.6 - p.life / p.max), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    v.fx = v.fx.filter((p) => p.life > 0);
    body(w);
    for (const wh of w.wheels) wheel(wh, w.v);
    ctx.restore();
    for (const p of v.pops) p.life -= dt;
    v.pops = v.pops.filter((p) => p.life > 0);
    if (showHud) hud(w, best, t);
  };

  /** Dust and exhaust from the current state (call once per frame while driving). */
  v.emit = (w, dt) => {
    const map = w.map;
    for (const wh of w.wheels) {
      if (!wh.contact) continue;
      const spin = Math.abs(wh.s * wh.r), slip = wh.slip || 0;
      const rate = (slip > 1.5 ? 40 : 0) + (spin > 6 ? spin * 0.8 : 0);
      if (Math.random() < rate * dt) v.puff(wh.x - Math.sign(wh.s) * wh.r * 0.5, wh.y - wh.r * 0.8, map.dust, 1, 0.6, 1);
    }
    if (w.throttle && Math.random() < dt * 14) {
      const [ex, ey] = toWorld(w.chassis, w.v.body[0][0] - 0.1, 0);
      v.fx.push({ x: ex, y: ey, vx: -1.5, vy: 0.8, life: 0.6, max: 0.6, r: 0.1, color: "rgba(120,120,130,.6)", g: -1 });
    }
  };

  return v;
}
