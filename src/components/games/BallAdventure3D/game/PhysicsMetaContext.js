import { createContext, useContext } from "react";

/**
 * Maps a Rapier collider handle -> gameplay metadata the ball controller's
 * ground raycast needs (surface type, and for moving platforms a way to read
 * that platform's current per-frame velocity so the ball can be carried by
 * it). Populated by PlatformMesh/MovingPlatformMesh on mount, read by
 * BallController every frame. A plain ref (not React state) — this changes
 * only on level load/unload, never mid-frame.
 */
export const ColliderMetaContext = createContext(null);

export function useColliderMeta() {
  const ctx = useContext(ColliderMetaContext);
  if (!ctx) throw new Error("useColliderMeta must be used within a LevelWorld");
  return ctx;
}
