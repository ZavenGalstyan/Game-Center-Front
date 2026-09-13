/**
 * Stonewild — loading screen between "Play" and the gameplay canvas.
 *
 * Does the real one-time work of preparing a world: load any existing save
 * from IndexedDB, sample the height field, find spawn (or resume the saved
 * position), then generate + mesh the chunks immediately around it — so the
 * gameplay canvas mounts onto an already-standing world instead of popping
 * in. Each stage below corresponds to real work finishing, not a fake timer.
 */

import { useEffect, useState } from "react";
import * as THREE from "three";
import { ChunkManager } from "../game/ChunkManager.js";
import { createTerrainSampler, findSpawn } from "../game/worldgen.js";
import { RENDER_DISTANCE } from "../game/constants.js";
import { loadWorldContent } from "../utils/worldSave.js";

const STAGES = ["Loading Save Data…", "Generating Terrain…", "Loading Chunks…", "Preparing World…"];
const PRELOAD_RADIUS = 2;

export default function LoadingScreen({ world, renderDistance, onReady }) {
  const [stage, setStage] = useState(0);

  // No "already started" ref guard here on purpose: React StrictMode's dev-only
  // mount -> cleanup -> mount double-invoke must be able to run this effect a
  // second time and have it actually do the work. The `cancelled` flag below
  // is what makes the throwaway first invocation harmless.
  useEffect(() => {
    let cancelled = false;
    const raf = [];
    const nextFrame = (fn) => raf.push(requestAnimationFrame(fn));

    (async () => {
      const save = await loadWorldContent(world.id);
      if (cancelled) return;
      setStage(1);

      nextFrame(() => {
        if (cancelled) return;
        const sampler = createTerrainSampler(world.seed);
        setStage(2);

        nextFrame(() => {
          if (cancelled) return;
          const group = new THREE.Group();
          const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
          const chunkManager = new ChunkManager(sampler, group, material);
          if (save?.modifications?.length) chunkManager.loadModifications(save.modifications);
          chunkManager.setLoadRadius(RENDER_DISTANCE[renderDistance] ?? RENDER_DISTANCE.medium);

          const spawn = save?.player
            ? { x: save.player.x, y: save.player.y, z: save.player.z }
            : findSpawn(sampler);
          chunkManager.preload(spawn.x, spawn.z, PRELOAD_RADIUS);
          setStage(3);

          nextFrame(() => {
            if (cancelled) return;
            onReady({
              sampler,
              spawn,
              yaw: save?.player?.yaw ?? 0,
              pitch: save?.player?.pitch ?? 0,
              group,
              material,
              chunkManager,
              savedInventory: save?.inventory ?? null,
              savedHealth: save?.health ?? null,
              savedHunger: save?.hunger ?? null,
              resumed: Boolean(save),
            });
          });
        });
      });
    })();

    return () => {
      cancelled = true;
      raf.forEach((id) => cancelAnimationFrame(id));
    };
    // world.id/seed/renderDistance are fixed for the lifetime of one loading screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="sw-screen sw-loading">
      <h1 className="sw-loading__logo">STONEWILD</h1>
      <p className="sw-loading__stage">{STAGES[stage]}</p>
      <div className="sw-loading__bar">
        <div className="sw-loading__bar-fill" style={{ width: `${((stage + 1) / STAGES.length) * 100}%` }} />
      </div>
    </div>
  );
}
