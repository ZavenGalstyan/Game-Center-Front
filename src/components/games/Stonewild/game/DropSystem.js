/**
 * Stonewild — world item drops.
 *
 * Plain JS class managing an array of small meshes added straight to the
 * scene group (imperative, like ChunkManager) — not one React component per
 * dropped item. Each drop: pops up, falls, settles on the voxel grid,
 * spins slowly, drifts toward the player once close ("magnet"), and is
 * collected exactly once (removal only happens when the caller's
 * `onCollect` reports the item actually fit in the inventory — a full
 * inventory leaves the drop in the world, per spec).
 */

import * as THREE from "three";
import { getItem } from "./items.js";
import {
  DROP_PICKUP_RADIUS,
  DROP_MAGNET_RADIUS,
  DROP_MAGNET_SPEED,
  DROP_GRAVITY,
  DROP_DESPAWN_SEC,
} from "./constants.js";

const SHARED_GEOMETRY = new THREE.BoxGeometry(0.28, 0.28, 0.28);
const materialCache = new Map();
function materialFor(color) {
  let mat = materialCache.get(color);
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ color });
    materialCache.set(color, mat);
  }
  return mat;
}

export class DropSystem {
  constructor(group) {
    this.group = group;
    this.drops = [];
  }

  spawn(itemId, count, x, y, z) {
    const def = getItem(itemId);
    if (!def) return;
    const mesh = new THREE.Mesh(SHARED_GEOMETRY, materialFor(def.icon?.color || "#ffffff"));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    this.group.add(mesh);
    const angle = Math.random() * Math.PI * 2;
    this.drops.push({
      mesh,
      itemId,
      count,
      x,
      y,
      z,
      vx: Math.cos(angle) * 1.1,
      vy: 3.0 + Math.random() * 0.6,
      vz: Math.sin(angle) * 1.1,
      age: 0,
      spin: 1.2 + Math.random() * 1.2,
    });
  }

  /** `isSolid(bx,by,bz)`; `onCollect(itemId,count) -> bool` (true = actually added, remove the drop). */
  update(dt, playerPos, isSolid, onCollect) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;

      const dx = playerPos.x - d.x;
      const dy = playerPos.y + 0.9 - d.y;
      const dz = playerPos.z - d.z;
      const dist = Math.hypot(dx, dy, dz);

      if (dist < DROP_PICKUP_RADIUS && d.age > 0.25) {
        if (onCollect(d.itemId, d.count)) {
          this._remove(i);
          continue;
        }
      } else if (dist < DROP_MAGNET_RADIUS) {
        const inv = 1 / Math.max(dist, 0.001);
        d.x += dx * inv * DROP_MAGNET_SPEED * dt;
        d.y += dy * inv * DROP_MAGNET_SPEED * dt * 0.6;
        d.z += dz * inv * DROP_MAGNET_SPEED * dt;
      } else {
        d.vy += DROP_GRAVITY * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.z += d.vz * dt;
        d.vx *= 0.92;
        d.vz *= 0.92;
        const floor = Math.floor(d.y - 0.14);
        if (isSolid(Math.floor(d.x), floor, Math.floor(d.z))) {
          d.y = floor + 1 + 0.14;
          d.vy = 0;
          d.vx *= 0.4;
          d.vz *= 0.4;
        }
      }

      d.mesh.position.set(d.x, d.y + Math.sin(d.age * 3) * 0.03, d.z);
      d.mesh.rotation.y += d.spin * dt;

      if (d.age > DROP_DESPAWN_SEC) this._remove(i);
    }
  }

  _remove(i) {
    const d = this.drops[i];
    this.group.remove(d.mesh);
    this.drops.splice(i, 1);
  }

  dispose() {
    for (const d of this.drops) this.group.remove(d.mesh);
    this.drops.length = 0;
  }
}
