/**
 * Farm Life — top-down player and chicken sprites, drawn procedurally
 * (small primitive shapes, no image assets) with a directional indicator so
 * facing reads clearly from directly above, plus the currently-held tool
 * (spec: "tools must be visible, not just a HUD icon") and a watering
 * stream while actively watering.
 */
import { ITEM } from "../data/items.js";
import { PALETTE as P } from "./palette.js";

const TOOL_TIP_COLOR = {
  [ITEM.HOE]: "#c9c9c9",
  [ITEM.AXE]: "#b7bcc4",
  [ITEM.PICKAXE]: "#b7bcc4",
  [ITEM.SHOVEL]: "#b7bcc4",
};

export function drawPlayer(ctx, player, selectedItemId, isBusy, time) {
  const { x, z, facing, moving, sprinting } = player;
  const gait = sprinting ? 11 : 7.5;
  const bob = moving && !isBusy ? Math.abs(Math.sin(time * gait)) * 0.03 : 0;
  const swing = isBusy ? Math.sin(time * 16) * 0.35 : moving ? Math.sin(time * gait) * 0.18 : 0;

  ctx.save();
  ctx.translate(x, z);

  // Shadow
  ctx.fillStyle = P.shadow;
  ctx.beginPath();
  ctx.ellipse(0, 0.2, 0.26, 0.14, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.rotate(facing);
  ctx.translate(0, -bob);

  // Legs (small offset ovals, alternate via swing)
  ctx.fillStyle = "#2f4a63";
  ctx.beginPath();
  ctx.ellipse(-0.09, 0.14 + swing * 0.05, 0.08, 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0.09, 0.14 - swing * 0.05, 0.08, 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Held tool / watering can, drawn behind the body so it reads as "in hand"
  if (selectedItemId && selectedItemId !== ITEM.WATERING_CAN) {
    const tip = TOOL_TIP_COLOR[selectedItemId];
    if (tip) {
      ctx.strokeStyle = "#6b4526";
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.moveTo(0.16, 0.08 + swing * 0.4);
      ctx.lineTo(0.16, -0.32 + swing * 0.4);
      ctx.stroke();
      ctx.fillStyle = tip;
      ctx.beginPath();
      ctx.arc(0.16, -0.34 + swing * 0.4, 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (selectedItemId === ITEM.WATERING_CAN) {
    ctx.fillStyle = "#4f7fae";
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(0.1, -0.02, 0.16, 0.14, 0.03) : ctx.rect(0.1, -0.02, 0.16, 0.14);
    ctx.fill();
    if (isBusy) {
      for (let i = 0; i < 3; i++) {
        const phase = (time * 2.4 + i * 0.33) % 1;
        ctx.fillStyle = "rgba(150,200,240,0.85)";
        ctx.beginPath();
        ctx.arc(0.28 + phase * 0.12, 0.02 + phase * 0.22, 0.018, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Body
  ctx.fillStyle = P.playerShirt;
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.17, 0.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head + hat
  ctx.fillStyle = P.playerSkin;
  ctx.beginPath();
  ctx.arc(0, -0.22, 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = P.playerHat;
  ctx.beginPath();
  ctx.arc(0, -0.22, 0.155, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -0.22, 0.17, 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // Facing wedge (small nose so direction is unambiguous from directly above)
  ctx.fillStyle = "#a9793f";
  ctx.beginPath();
  ctx.moveTo(-0.04, -0.12);
  ctx.lineTo(0.04, -0.12);
  ctx.lineTo(0, -0.02);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

export function drawChicken(ctx, chicken) {
  ctx.save();
  ctx.translate(chicken.x, chicken.z);

  ctx.fillStyle = P.shadow;
  ctx.beginPath();
  ctx.ellipse(0, 0.09, 0.12, 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.rotate(chicken.facing);

  ctx.fillStyle = "#e6ddc4";
  ctx.beginPath();
  ctx.ellipse(-0.08, 0, 0.07, 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0.08, 0, 0.07, 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f2ede0";
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.14, 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -0.1, 0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#c94f3c";
  ctx.beginPath();
  ctx.arc(0, -0.17, 0.025, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#e8a23c";
  ctx.beginPath();
  ctx.moveTo(0, -0.12);
  ctx.lineTo(0.06, -0.1);
  ctx.lineTo(0, -0.07);
  ctx.closePath();
  ctx.fill();

  if (chicken.hasEgg) {
    ctx.fillStyle = P.eggShell;
    ctx.beginPath();
    ctx.ellipse(0, 0.16, 0.035, 0.045, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
