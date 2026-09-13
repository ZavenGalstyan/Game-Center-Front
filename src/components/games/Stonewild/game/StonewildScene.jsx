/**
 * Stonewild — the gameplay scene: voxel world, player body, first-person
 * camera, block targeting/breaking/placing, world drops, the held item, and
 * the survival tick (hunger/health). One component, one `useFrame` — see
 * the file-level rationale in the previous revision's header; it still
 * applies: React only re-renders for discrete state changes (inventory,
 * health, hunger, toasts), never per frame for world/physics state.
 *
 * `worldBundle` ({ sampler, spawn, yaw, pitch, group, material, chunkManager,
 * savedInventory, savedHealth, savedHunger }) is built once by
 * <LoadingScreen> — see its header for why. `store` is the gameStore created
 * by Gameplay.jsx; `actions` is a plain ref array Gameplay pushes discrete
 * command tokens into ("place", "interact") from mouse/keyboard hooks it
 * owns, drained here once per frame — see input.js's header for why those
 * two actions can't be wired directly as pointer-lock-gated hold state.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { createPlayer, stepPlayer } from "./PlayerController.js";
import { raycastVoxels } from "./raycast.js";
import { getBreakSeconds, isSolidBlock, BLOCKS, BLOCK } from "./blocks.js";
import { DropSystem } from "./DropSystem.js";
import { HeldItemRig } from "./HeldItemRig.js";
import { getCrackTextures, stageForProgress } from "./crackTextures.js";
import {
  PLAYER_EYE_HEIGHT,
  PITCH_LIMIT,
  FIXED_DT,
  MAX_FRAME_DT,
  MAX_SUBSTEPS,
  REACH_DISTANCE,
  SURVIVAL_TICK_INTERVAL,
  HUNGER_DRAIN_IDLE,
  HUNGER_DRAIN_SPRINT_MULT,
  HUNGER_DRAIN_MINING_MULT,
  STARVATION_DAMAGE_PER_SEC,
  HEALTH_REGEN_PER_SEC,
  HUNGER_WELL_FED,
  HUNGER_LOW,
  FALL_DAMAGE_MIN_BLOCKS,
  FALL_DAMAGE_PER_BLOCK,
} from "./constants.js";

export default function StonewildScene({
  worldBundle,
  renderDistance,
  graphics = "high",
  sensitivity = 1,
  fov = 75,
  input,
  store,
  actions,
  paused = false,
  restartSignal = 0,
  onOpenWorkbench,
}) {
  const { camera } = useThree();
  const { spawn, chunkManager } = worldBundle;

  const playerRef = useRef(
    (() => {
      const p = createPlayer(spawn);
      p.yaw = worldBundle.yaw || 0;
      p.pitch = worldBundle.pitch || 0;
      return p;
    })(),
  );
  const accumulatorRef = useRef(0);
  const seenRestart = useRef(restartSignal);
  const forwardRef = useRef(new THREE.Vector3());
  const targetRef = useRef(null); // { x, y, z, blockId, normal }
  const breakProgressRef = useRef(0);
  const swingClockRef = useRef(0);
  const survivalTickRef = useRef(0);
  const miningActiveRef = useRef(false);
  // Backstop only — see the fall-through fix in PlayerController.js's
  // moveAxis for the actual root cause. This is the "if something we didn't
  // anticipate still gets the player stuck below the world, recover them"
  // safety net the spec calls for, never a substitute for correct collision.
  const lastSafeGroundRef = useRef({ x: spawn.x, y: spawn.y, z: spawn.z });

  // One-time init from a resumed save (never re-applied on a later re-render).
  const initedFromSave = useRef(false);
  useEffect(() => {
    if (initedFromSave.current) return;
    initedFromSave.current = true;
    if (worldBundle.savedInventory) store.set({ inventory: worldBundle.savedInventory });
    if (worldBundle.savedHealth != null) store.set({ health: worldBundle.savedHealth });
    if (worldBundle.savedHunger != null) store.set({ hunger: worldBundle.savedHunger });
  }, [worldBundle, store]);

  const isSolid = useMemo(() => (bx, by, bz) => chunkManager.isSolid(bx, by, bz), [chunkManager]);

  useEffect(() => {
    chunkManager.setLoadRadius(renderDistance);
  }, [chunkManager, renderDistance]);

  useEffect(() => {
    if (camera.fov === fov) return;
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }, [camera, fov]);

  // GamePlayer's shared Restart: return to spawn, keep the world exactly as generated.
  useEffect(() => {
    if (restartSignal === seenRestart.current) return;
    seenRestart.current = restartSignal;
    const p = playerRef.current;
    p.x = spawn.x;
    p.y = spawn.y;
    p.z = spawn.z;
    p.vx = p.vy = p.vz = 0;
    p.onGround = false;
    p.fallStartY = null;
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // Dropped world items.
  const dropSystem = useMemo(() => new DropSystem(worldBundle.group), [worldBundle.group]);
  useEffect(() => () => dropSystem.dispose(), [dropSystem]);

  // First-person hand / held tool.
  const heldItem = useMemo(() => new HeldItemRig(camera), [camera]);
  useEffect(() => () => heldItem.dispose(), [heldItem]);

  // Target outline + break-crack overlay — two reusable meshes, not one per block.
  const overlays = useMemo(() => {
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
      new THREE.LineBasicMaterial({ color: 0x0c0c0c, transparent: true, opacity: 0.55 }),
    );
    outline.visible = false;
    outline.renderOrder = 10;
    const textures = getCrackTextures();
    const crack = new THREE.Mesh(
      new THREE.BoxGeometry(1.012, 1.012, 1.012),
      new THREE.MeshBasicMaterial({
        map: textures[0],
        transparent: true,
        opacity: 0.95,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
    );
    crack.visible = false;
    crack.renderOrder = 11;
    worldBundle.group.add(outline, crack);
    return { outline, crack, textures };
  }, [worldBundle.group]);
  useEffect(
    () => () => {
      worldBundle.group.remove(overlays.outline, overlays.crack);
      overlays.outline.geometry.dispose();
      overlays.outline.material.dispose();
      overlays.crack.geometry.dispose();
      overlays.crack.material.dispose();
    },
    [overlays, worldBundle.group],
  );

  function resetBreak() {
    breakProgressRef.current = 0;
    miningActiveRef.current = false;
    overlays.crack.visible = false;
  }

  function doPlace() {
    const target = targetRef.current;
    if (!target) return;
    const sel = store.getSelectedItem();
    if (!sel || sel.def.category !== "block") return;
    const px = target.x + target.normal.x;
    const py = target.y + target.normal.y;
    const pz = target.z + target.normal.z;
    if (py < 0) return;
    const existing = chunkManager.getBlock(px, py, pz);
    if (existing !== BLOCK.AIR && !BLOCKS[existing]?.replaceable) return; // occupied

    // Never place inside the player's own body.
    const p = playerRef.current;
    const overlapsPlayer =
      px < p.x + 0.35 && px + 1 > p.x - 0.35 && pz < p.z + 0.35 && pz + 1 > p.z - 0.35 && py < p.y + 1.82 && py + 1 > p.y;
    if (overlapsPlayer) return;

    if (chunkManager.setBlock(px, py, pz, sel.def.block)) {
      store.consumeSelectedItem();
      heldItem.swing();
    }
  }

  function doInteract() {
    const target = targetRef.current;
    if (!target) return;
    if (target.blockId === BLOCK.WORKBENCH) {
      onOpenWorkbench?.();
    }
  }

  function doBreakComplete(target) {
    const def = BLOCKS[target.blockId];
    chunkManager.setBlock(target.x, target.y, target.z, BLOCK.AIR);
    const dropId = def?.dropItem;
    if (dropId) {
      const chance = def.dropChance ?? 1;
      if (chance >= 1 || Math.random() < chance) {
        dropSystem.spawn(dropId, 1, target.x + 0.5, target.y + 0.4, target.z + 0.5);
      }
    }
    const sel = store.getSelectedItem();
    if (sel && sel.def.category === "tool") store.damageSelectedTool(1);
    resetBreak();
  }

  useFrame((state, rawDt) => {
    const player = playerRef.current;
    const dt = Math.min(rawDt, MAX_FRAME_DT); // clamp — no giant step after a lag spike / tab switch
    const elapsed = state.clock.elapsedTime;

    // Drain queued discrete actions from Gameplay's input hooks regardless of
    // pause state below — they're already gated to "pointer was locked" at
    // the moment they were queued.
    if (actions && actions.current.length) {
      for (const action of actions.current) {
        if (action === "place") doPlace();
        else if (action === "interact") doInteract();
      }
      actions.current.length = 0;
    }

    if (!paused) {
      const [dx, dy] = input.consumeMouse();
      player.yaw -= dx * 0.0022 * sensitivity;
      player.pitch -= dy * 0.0022 * sensitivity;
      player.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, player.pitch));

      const hunger = store.get().hunger;
      const sprintAllowed = hunger > HUNGER_LOW;

      accumulatorRef.current += dt;
      let steps = 0;
      while (accumulatorRef.current >= FIXED_DT && steps < MAX_SUBSTEPS) {
        stepPlayer(player, input, FIXED_DT, isSolid, sprintAllowed);
        accumulatorRef.current -= FIXED_DT;
        steps++;
      }
      if (steps >= MAX_SUBSTEPS) accumulatorRef.current = 0;

      // stepPlayer folds fall distance into lastFallDistance exactly once,
      // the frame it lands — consume and clear it here so it's never
      // double-applied on a later frame while still grounded.
      if (player.onGround && player.lastFallDistance > FALL_DAMAGE_MIN_BLOCKS) {
        const dmg = (player.lastFallDistance - FALL_DAMAGE_MIN_BLOCKS) * FALL_DAMAGE_PER_BLOCK;
        store.damage(dmg);
        player.lastFallDistance = 0;
      }

      // Recovery backstop (see file header / PlayerController.js for the
      // actual fix). Record the last position that was genuinely resting on
      // solid ground with a clear body — never a position mid-collision-
      // resolution — and restore it if the player ever ends up somewhere
      // that can't correspond to standing on generated terrain. This never
      // fires under normal play; it exists purely as a last resort.
      const fx = Math.floor(player.x);
      const fz = Math.floor(player.z);
      const fy = Math.floor(player.y);
      if (
        player.onGround &&
        Number.isFinite(player.x) &&
        Number.isFinite(player.y) &&
        Number.isFinite(player.z) &&
        !isSolid(fx, fy, fz) &&
        !isSolid(fx, fy + 1, fz)
      ) {
        lastSafeGroundRef.current = { x: player.x, y: player.y, z: player.z };
      }

      const positionIsInvalid =
        !Number.isFinite(player.x) || !Number.isFinite(player.y) || !Number.isFinite(player.z) || player.y < -10;
      if (positionIsInvalid) {
        const safe = lastSafeGroundRef.current;
        // eslint-disable-next-line no-console
        console.warn("Stonewild: recovered player from an invalid position", { x: player.x, y: player.y, z: player.z }, "->", safe);
        player.x = safe.x;
        player.y = safe.y;
        player.z = safe.z;
        player.vx = player.vy = player.vz = 0;
        player.onGround = false;
        store.showToast("Recovered — that shouldn't have happened");
      }
    } else {
      input.consumeMouse();
    }

    camera.position.set(player.x, player.y + PLAYER_EYE_HEIGHT, player.z);
    camera.rotation.order = "YXZ";
    camera.rotation.set(player.pitch, player.yaw, 0);

    chunkManager.update(player.x, player.z);
    dropSystem.update(dt, player, isSolid, (itemId, count) => store.addItemToInventory(itemId, count) === 0);
    heldItem.update(dt, elapsed);

    // ---- targeting + breaking (only while actually playing) ----
    if (!paused) {
      camera.getWorldDirection(forwardRef.current);
      const hit = raycastVoxels(camera.position, forwardRef.current, REACH_DISTANCE, isSolid);
      const prevTarget = targetRef.current;

      if (hit.hit) {
        const blockId = chunkManager.getBlock(hit.x, hit.y, hit.z);
        const changed = !prevTarget || prevTarget.x !== hit.x || prevTarget.y !== hit.y || prevTarget.z !== hit.z;
        targetRef.current = { x: hit.x, y: hit.y, z: hit.z, blockId, normal: hit.normal };
        if (changed) resetBreak();

        overlays.outline.visible = true;
        overlays.outline.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);

        if (input.mouseLeft && isSolidBlock(blockId)) {
          if (!miningActiveRef.current) {
            miningActiveRef.current = true;
            swingClockRef.current = 0;
          }
          const sel = store.getSelectedItem();
          const heldTool = sel?.def?.tool || null;
          const seconds = getBreakSeconds(blockId, heldTool);
          breakProgressRef.current = Math.min(1, breakProgressRef.current + dt / Math.max(0.05, seconds));

          swingClockRef.current -= dt;
          if (swingClockRef.current <= 0) {
            heldItem.swing();
            swingClockRef.current = 0.28;
          }

          const stage = stageForProgress(breakProgressRef.current);
          overlays.crack.visible = true;
          overlays.crack.position.copy(overlays.outline.position);
          overlays.crack.material.map = overlays.textures[stage];
          overlays.crack.material.needsUpdate = true;

          if (breakProgressRef.current >= 1) doBreakComplete(targetRef.current);
        } else if (!input.mouseLeft) {
          resetBreak();
        }
      } else {
        if (prevTarget) resetBreak();
        targetRef.current = null;
        overlays.outline.visible = false;
        overlays.crack.visible = false;
      }
    } else {
      if (targetRef.current) resetBreak();
      targetRef.current = null;
      overlays.outline.visible = false;
      overlays.crack.visible = false;
    }

    // ---- survival tick (batched — not every frame) ----
    // Gated by `paused` on purpose: a player sitting in Inventory/Settings/the
    // pause menu must not starve or take starvation damage while the world
    // is genuinely frozen — only real playtime drains hunger.
    if (!paused) {
      survivalTickRef.current += dt;
      if (survivalTickRef.current >= SURVIVAL_TICK_INTERVAL) {
        const t = survivalTickRef.current;
        survivalTickRef.current = 0;
        const s = store.get();
        if (!s.dead) {
          let drain = HUNGER_DRAIN_IDLE;
          if (player.sprinting) drain *= HUNGER_DRAIN_SPRINT_MULT;
          if (miningActiveRef.current) drain *= HUNGER_DRAIN_MINING_MULT;
          const nextHunger = Math.max(0, s.hunger - drain * t);
          store.setHunger(nextHunger);
          if (nextHunger <= 0) store.damage(STARVATION_DAMAGE_PER_SEC * t);
          else if (nextHunger >= HUNGER_WELL_FED) store.heal(HEALTH_REGEN_PER_SEC * t);
        }
        if (store.get().dead) {
          const p = playerRef.current;
          p.x = spawn.x;
          p.y = spawn.y;
          p.z = spawn.z;
          p.vx = p.vy = p.vz = 0;
          store.respawn(spawn);
          store.showToast("You blacked out and woke up back at spawn");
        }
      }
    }

    store.set({
      x: player.x,
      y: player.y,
      z: player.z,
      yaw: player.yaw,
      pitch: player.pitch,
      onGround: player.onGround,
      sprinting: player.sprinting,
      chunks: chunkManager.loadedChunkCount || 0,
    });
  });

  const shadows = graphics !== "low";
  const fogFar = Math.max(48, renderDistance * 16 - 16);

  return (
    <>
      <color attach="background" args={["#bfe3f5"]} />
      <fog attach="fog" args={["#bfe3f5", fogFar * 0.35, fogFar]} />
      <hemisphereLight args={["#bfe3f5", "#3c3120", 0.55]} />
      <ambientLight intensity={0.25} color="#cfe8ff" />
      <directionalLight
        position={[60, 90, 30]}
        intensity={1.15}
        color="#fff4d9"
        castShadow={shadows}
        shadow-mapSize={shadows ? [1024, 1024] : [256, 256]}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
      />
      <primitive object={worldBundle.group} />
    </>
  );
}
