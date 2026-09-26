/**
 * Farm Life — the 2D top-down stage. Owns the requestAnimationFrame loop
 * (same pattern as Mini Golf Journey's GolfCanvas.jsx), the camera, and
 * every draw call. Physics/AI/state live in refs and the shared store — a
 * moving player or chicken never triggers a React re-render, matching every
 * other continuous system in this game.
 *
 * Draw order: ground -> vignette -> fences -> ground clutter (rocks/
 * flowers/grass) -> field (tiles+crops) -> a single Y-sorted pass over
 * every "tall" entity (buildings, trees, bushes, props, player, chickens)
 * so standing north of the farmhouse draws you behind it and standing south
 * draws you in front, exactly like Stardew-style top-down games -> tile
 * highlight on top.
 */
import { useEffect, useMemo, useRef } from "react";

import { buildStaticColliders, FIELD_WIDTH } from "../engine/terrain.js";
import { stepPlayer, isToolBusy, nowSeconds } from "../engine/player.js";
import { stepChicken, tickChickenNeeds } from "../engine/chicken.js";
import { findInteraction } from "../engine/interactions.js";
import { GAME_MINUTES_PER_REAL_SECOND, PIXELS_PER_UNIT_MIN, PIXELS_PER_UNIT_MAX, PIXELS_PER_UNIT_DEFAULT } from "../engine/constants.js";

import { buildStaticEntities } from "../render/staticEntities.js";
import { drawGround, drawEdgeVignette, drawSkyBackdrop } from "../render/world.js";
import { drawFences } from "../render/fences.js";
import { drawField, drawTileHighlight } from "../render/field.js";
import { drawPlayer, drawChicken } from "../render/entities.js";
import {
  drawFarmhouse, drawShed, drawBarn, drawCoopBuilding, drawWell, drawMailbox,
  drawSignpost, drawWindmill, drawSeedStand, drawShippingBox, drawTree, drawBush,
  drawRock, drawFlower, drawGrassTuft, drawPond, drawNestBox, drawFeeder,
} from "../render/draw.js";
import { POND } from "../engine/terrain.js";

const KIND_DRAW = {
  farmhouse: (ctx, d) => drawFarmhouse(ctx, d),
  shed: (ctx, d) => drawShed(ctx, d),
  barn: (ctx, d) => drawBarn(ctx, d),
  coopBuilding: (ctx, d) => drawCoopBuilding(ctx, d),
  well: (ctx, d) => drawWell(ctx, d),
  mailbox: (ctx, d) => drawMailbox(ctx, d),
  signpost: (ctx, d) => drawSignpost(ctx, d),
  seedStand: (ctx, d) => drawSeedStand(ctx, d),
  shippingBox: (ctx, d) => drawShippingBox(ctx, d),
  tree: (ctx, d) => drawTree(ctx, d),
  bush: (ctx, d) => drawBush(ctx, d),
  nestBox: (ctx, d) => drawNestBox(ctx, d),
  feeder: (ctx, d) => drawFeeder(ctx, d),
};

export default function GameCanvas({
  store,
  farmTiles,
  selectedItem,
  wateringCan,
  input,
  playerRef,
  chickensRef,
  clockRef,
  currentInteractionRef,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const viewRef = useRef({ w: 1, h: 1, dpr: 1 });
  const cameraRef = useRef({ x: playerRef.current.x, z: playerRef.current.z, scale: PIXELS_PER_UNIT_DEFAULT });
  const trackedDayRef = useRef(clockRef.current.day);
  const lastDisplaySyncRef = useRef(0);

  const colliders = useMemo(() => buildStaticColliders(), []);
  const staticData = useMemo(() => buildStaticEntities(), []);

  // Keep latest props in refs so the RAF loop (mounted once) always reads
  // current values without needing to restart on every store/prop change.
  const propsRef = useRef();
  propsRef.current = { store, farmTiles, selectedItem, wateringCan };

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return undefined;
    const fit = () => {
      const rect = wrap.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      viewRef.current = { w: canvas.width, h: canvas.height, dpr };
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05;

      const { store: s, farmTiles: tiles, selectedItem: item, wateringCan: can } = propsRef.current;
      const player = playerRef.current;
      const nowSec = nowSeconds();

      // Camera zoom (scroll), then follow.
      const wheel = input.consumeWheel();
      if (wheel) {
        cameraRef.current.scale = Math.min(PIXELS_PER_UNIT_MAX, Math.max(PIXELS_PER_UNIT_MIN, cameraRef.current.scale - wheel * 0.05));
      }

      // Player movement/collision.
      stepPlayer(player, input, dt, colliders, nowSec);

      const cam = cameraRef.current;
      const camLerp = Math.min(1, dt * 8);
      cam.x += (player.x - cam.x) * camLerp;
      cam.z += (player.z - cam.z) * camLerp;

      // Game clock.
      const clock = clockRef.current;
      clock.tick(dt);
      if (clock.day !== trackedDayRef.current) {
        trackedDayRef.current = clock.day;
        s.onDayRollover();
      }
      if (nowSec - lastDisplaySyncRef.current > 1) {
        lastDisplaySyncRef.current = nowSec;
        s.setClockDisplay({ day: clock.day, time: clock.formatTime(), season: clock.season, seasonDay: clock.seasonDay });
      }

      // Farm grid growth.
      s.tickGrowth(dt);

      // Chickens.
      const dtGameMinutes = dt * GAME_MINUTES_PER_REAL_SECOND;
      for (const chicken of chickensRef.current) {
        stepChicken(chicken, dt);
        tickChickenNeeds(chicken, dtGameMinutes, clock.totalMinutes);
      }

      // Interaction targeting.
      const interaction = findInteraction(player, tiles, item, can);
      currentInteractionRef.current = interaction;
      s.setInteractPrompt(interaction ? interaction.label : null);

      // --- Draw ---------------------------------------------------------
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const v = viewRef.current;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawSkyBackdrop(ctx, v.w, v.h);

      const scale = cam.scale * v.dpr;
      const tx = v.w / 2 - cam.x * scale;
      const tz = v.h / 2 - cam.z * scale;
      ctx.setTransform(scale, 0, 0, scale, tx, tz);

      drawGround(ctx);
      drawEdgeVignette(ctx);
      drawPond(ctx, POND, nowSec);
      drawFences(ctx);
      for (const r of staticData.rocks) drawRock(ctx, r);
      for (const f of staticData.flowers) drawFlower(ctx, f);
      for (const g of staticData.grassTufts) drawGrassTuft(ctx, g);
      drawField(ctx, tiles, FIELD_WIDTH);

      const sorted = staticData.sortable.slice();
      sorted.push({ z: player.z, kind: "player" });
      for (const c of chickensRef.current) sorted.push({ z: c.z, kind: "chicken", data: c });
      sorted.sort((a, b) => a.z - b.z);

      for (const entity of sorted) {
        if (entity.kind === "player") {
          drawPlayer(ctx, player, item?.id || null, isToolBusy(player, nowSec), nowSec);
        } else if (entity.kind === "chicken") {
          drawChicken(ctx, entity.data);
        } else if (entity.kind === "windmill") {
          drawWindmill(ctx, entity.data, nowSec);
        } else {
          KIND_DRAW[entity.kind]?.(ctx, entity.data);
        }
      }

      if (interaction && interaction.index != null) {
        const col = interaction.index % FIELD_WIDTH;
        const row = Math.floor(interaction.index / FIELD_WIDTH);
        drawTileHighlight(ctx, col, row, nowSec);
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fl-canvas-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} className="fl-canvas" />
    </div>
  );
}
