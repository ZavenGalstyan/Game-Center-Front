/**
 * DEV-only: draw every move of a weapon at the middle of its active frames
 * (red = strike capsule, cyan = target hurtboxes at typical range) into one
 * canvas and return a PNG data URL. Run in a dev page:
 *   (await import('/src/components/games/ShadowWarriors/tools/poseSheet.mjs')).sheet('katana')
 */
import { createFighter, computePose } from "../engine/fighter.js";
import { weaponById, armorById } from "../data/gear.js";
import { strikeCapsule } from "../engine/skeleton.js";
import { drawFighter } from "../render/fighterArt.js";
import { arenaPalette } from "../render/arenas.js";

const IDS = ["jab", "cross", "hook", "lowPunch", "uppercut", "kick", "roundhouse", "sweep", "pushKick", "airPunch", "airKick", "w1", "w2", "w3", "w4", "wHeavy", "wLow", "wAir", "__block", "__cblock", "__crouch", "__hit", "__down", "__walk"];

export function sheet(weapon = "fists", { cols = 6, cell = 260, extra = [] } = {}) {
  const ids = [...IDS, ...extra];
  const rows = Math.ceil(ids.length / cols);
  const c = document.createElement("canvas");
  c.width = cols * cell;
  c.height = rows * cell;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#cbb8a8";
  ctx.fillRect(0, 0, c.width, c.height);
  const P = arenaPalette("temple", 0);
  const cfg = { weapon: weaponById(weapon), armor: armorById("lamellar"), look: { hat: "headband", eye: "#e4f6ff" } };
  ids.forEach((id, i) => {
    const f = createFighter(cfg, 0, 1);
    const m = id.startsWith("__") ? null : f.set[id];
    if (id.startsWith("__")) {
      f.state = id.slice(2) === "down" ? "down" : id.slice(2);
      if (f.state === "hit") f.stun = 20;
      if (f.state === "walk") f.walkPhase = 1;
      f.t = 2;
    } else if (m) {
      f.state = "attack";
      f.move = m;
      f.mf = m.s + Math.floor(m.a / 2);
      if (m.air) f.y = 90;
    } else return;
    f.blendT = f.blendN = 99;
    f.poseKey = f.state === "attack" ? `a:${f.atkId}` : f.state;
    computePose(f);
    const ox = (i % cols) * cell;
    const oy = Math.floor(i / cols) * cell;
    const v = { W: cell, H: cell, s: 0.95, s0: 0.95, cx: 70, groundY: cell - 30, shakeX: 0, shakeY: 0, dpr: 1 };
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, cell, cell);
    ctx.clip();
    ctx.translate(ox, oy);
    ctx.fillStyle = "#3a2a2e";
    ctx.fillRect(0, v.groundY, cell, 30);
    drawFighter(ctx, v, f, { P });
    const X = (x) => cell / 2 + (x - v.cx) * v.s;
    const Y = (y) => v.groundY - y * v.s;
    if (m && m.limb) {
      for (const l of m.limbs || [m.limb]) {
        const cap = strikeCapsule(f.J, l);
        if (!cap) continue;
        ctx.strokeStyle = "rgba(255,0,0,0.75)";
        ctx.lineWidth = cap[4] * 2 * v.s;
        ctx.lineCap = "round";
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        ctx.moveTo(X(cap[0]), Y(cap[1]));
        ctx.lineTo(X(cap[2]), Y(cap[3]));
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.fillStyle = "#000";
    ctx.font = "bold 13px system-ui";
    ctx.fillText(`${id} ${m ? `${m.s}/${m.a}/${m.r} d${m.dmg.toFixed(1)} ${m.height}` : ""}`, 6, 16);
    ctx.restore();
  });
  return c.toDataURL("image/png");
}
