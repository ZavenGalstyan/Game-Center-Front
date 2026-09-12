/**
 * Blade Rush — procedural target rendering. One function draws every target
 * in the game (100 stages, 5 materials, 10 bosses) from a small palette
 * (data/targets.js) — no image assets. Dimensionality comes from a darker
 * "side" disc offset below the face, a rim ring, a fixed-in-world specular
 * highlight (a real light source, so it does NOT spin with the target) and
 * a radial face gradient; per-material grain/rivets/facets/carvings rotate
 * WITH the target since they're part of its surface.
 */

function ringPath(ctx, x, y, r, from, to) {
  ctx.beginPath();
  ctx.arc(x, y, r, from, to);
}

function drawWoodGrain(ctx, x, y, radius, rotation, target) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.strokeStyle = target.ring;
  ctx.globalAlpha = 0.55;
  for (let i = 1; i <= 5; i++) {
    const r = radius * (i / 6);
    ctx.lineWidth = Math.max(1, radius * 0.012);
    ringPath(ctx, 0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // grain flecks
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = target.grain;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    const r0 = radius * 0.2;
    const r1 = radius * (0.55 + (i % 3) * 0.12);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

function drawMetalDetail(ctx, x, y, radius, rotation, target) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  if (target.riveted) {
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = radius * 0.78;
      const rx = Math.cos(a) * r, ry = Math.sin(a) * r;
      const rivetR = Math.max(1.6, radius * 0.02);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = target.ring;
      ctx.beginPath();
      ctx.arc(rx, ry, rivetR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = target.grain;
      ctx.beginPath();
      ctx.arc(rx - rivetR * 0.3, ry - rivetR * 0.3, rivetR * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (target.geared) {
    ctx.strokeStyle = target.ring;
    ctx.lineWidth = Math.max(2, radius * 0.05);
    ctx.globalAlpha = 0.9;
    const teeth = 14;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * radius * 0.86, Math.sin(a) * radius * 0.86);
      ctx.lineTo(Math.cos(a) * radius * 0.98, Math.sin(a) * radius * 0.98);
      ctx.stroke();
    }
  }
  // brushed radial lines
  ctx.strokeStyle = "#ffffff";
  ctx.globalAlpha = 0.04;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * radius * 0.15, Math.sin(a) * radius * 0.15);
    ctx.lineTo(Math.cos(a) * radius * 0.92, Math.sin(a) * radius * 0.92);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

function drawIceDetail(ctx, x, y, radius, rotation, target) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.strokeStyle = "#ffffff";
  ctx.globalAlpha = 0.4;
  const facets = target.faceted ? 9 : 6;
  for (let i = 0; i < facets; i++) {
    const a = (i / facets) * Math.PI * 2 + 0.2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * radius * 0.95, Math.sin(a) * radius * 0.95);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 1.1;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * radius * 0.5, Math.sin(a) * radius * 0.5, radius * 0.1, radius * 0.03, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawStoneDetail(ctx, x, y, radius, rotation, target) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.strokeStyle = target.ring;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = Math.max(1, radius * 0.02);
  ringPath(ctx, 0, 0, radius * 0.82, 0, Math.PI * 2);
  ctx.stroke();
  ringPath(ctx, 0, 0, radius * 0.55, 0, Math.PI * 2);
  ctx.stroke();
  if (target.runed) {
    ctx.strokeStyle = target.glow;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = Math.max(1, radius * 0.015);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * radius * 0.6, Math.sin(a) * radius * 0.6);
      ctx.lineTo(Math.cos(a) * radius * 0.75, Math.sin(a) * radius * 0.75);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawCrystalDetail(ctx, x, y, radius, rotation, target, glowPulse) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  const facets = target.faceted ? 10 : 7;
  ctx.strokeStyle = target.glow;
  ctx.globalAlpha = 0.35 + glowPulse * 0.25;
  ctx.lineWidth = 1.2;
  for (let i = 0; i < facets; i++) {
    const a = (i / facets) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * radius * 0.9, Math.sin(a) * radius * 0.9);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.32, 0, Math.PI * 2);
  ctx.strokeStyle = target.glow;
  ctx.globalAlpha = 0.5 + glowPulse * 0.4;
  ctx.lineWidth = Math.max(1.5, radius * 0.02);
  ctx.stroke();
  ctx.restore();
}

const DETAIL_BY_MATERIAL = {
  wood: drawWoodGrain,
  metal: drawMetalDetail,
  ice: drawIceDetail,
  stone: drawStoneDetail,
};

function drawCracks(ctx, x, y, radius, rotation, damage, target) {
  if (damage <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation * 0.15); // cracks drift only slightly — they read as "on" the surface, subtly
  ctx.strokeStyle = target.material === "crystal" ? target.glow : (target.rim || "#000");
  ctx.globalAlpha = Math.min(0.75, 0.15 + damage * 0.6);
  const cracks = Math.round(damage * 7);
  let seed = 1337;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let i = 0; i < cracks; i++) {
    const a0 = rnd() * Math.PI * 2;
    let a = a0, r = radius * 0.15;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.lineWidth = Math.max(1, radius * 0.012);
    const steps = 3 + Math.floor(rnd() * 2);
    for (let s = 0; s < steps; s++) {
      r += radius * (0.18 + rnd() * 0.12);
      a += (rnd() - 0.5) * 0.7;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * @param opts.damage 0..1 — fraction of this phase's required blades landed
 * @param opts.glowPulse 0..1 — ambient pulse for crystal/rune materials
 * @param opts.hitPulse 0..1 — decays fast after each successful hit (scale bump)
 */
export function drawTarget(ctx, { x, y, radius, rotation, target, damage = 0, glowPulse = 0, hitPulse = 0, quality = "high" }) {
  const scale = 1 + hitPulse * 0.035;
  const r = radius * scale;

  // contact shadow — two soft layers read as more dimensional than one hard one
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.95, r * 1.08, r * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.9, r * 0.86, r * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // side/rim disc (thickness illusion)
  const thickness = Math.max(4, r * 0.07);
  ctx.fillStyle = target.rim;
  ctx.beginPath();
  ctx.arc(x, y + thickness, r, 0, Math.PI * 2);
  ctx.fill();

  // face
  const grad = ctx.createRadialGradient(x - r * 0.32, y - r * 0.38, r * 0.05, x, y, r);
  grad.addColorStop(0, target.base[0]);
  grad.addColorStop(1, target.base[1]);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // outer rim ring
  ctx.strokeStyle = target.rim;
  ctx.lineWidth = Math.max(2, r * 0.045);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.985, 0, Math.PI * 2);
  ctx.stroke();

  if (target.glow && quality !== "low") {
    ctx.save();
    ctx.globalAlpha = 0.2 + glowPulse * 0.25;
    ctx.strokeStyle = target.glow;
    ctx.lineWidth = Math.max(2, r * 0.06);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.99, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const detailFn = DETAIL_BY_MATERIAL[target.material];
  if (detailFn) detailFn(ctx, x, y, r, rotation, target);
  if (target.material === "crystal") drawCrystalDetail(ctx, x, y, r, rotation, target, glowPulse);

  // center hub
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  const hub = ctx.createRadialGradient(-r * 0.05, -r * 0.05, 0, 0, 0, r * 0.16);
  hub.addColorStop(0, target.grain || "#fff");
  hub.addColorStop(1, target.ring || target.base[1]);
  ctx.fillStyle = hub;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (quality !== "low") drawCracks(ctx, x, y, r, rotation, damage, target);

  // fixed specular highlight (a real light source — does not rotate)
  ctx.save();
  ctx.globalAlpha = 0.22;
  const spec = ctx.createRadialGradient(x - r * 0.36, y - r * 0.42, 0, x - r * 0.36, y - r * 0.42, r * 0.5);
  spec.addColorStop(0, "#ffffff");
  spec.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = spec;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  return r;
}
