/**
 * Supermarket Rush — the red guidance-arrow target. Pure function: given the
 * world, current tasks, whatever the player is holding, and a few live
 * dynamic lists (loose carts, spills, fallen items), returns the single
 * point the arrow should point at right now, or null if nothing needs it
 * (e.g. the "Help Customers" task has no fixed destination — customers move
 * on their own). Disappears automatically once its task is done because
 * `nextIncompleteTask` simply stops returning it.
 */
import { getProduct } from "../data/products.js";
import { nextIncompleteTask, restockTaskId } from "./tasks.js";

function dist2(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return dx * dx + dz * dz;
}
function nearestOf(player, points) {
  let best = points[0], bestD = Infinity;
  for (const p of points) {
    const d = dist2(player, p);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

export function computeGuidance(world, tasks, heldBox, ctx = {}) {
  const player = ctx.player || { x: 0, z: 0 };
  const carts = ctx.carts || [];
  const spills = ctx.spills || [];
  const fallen = ctx.fallen || [];

  if (heldBox) {
    const shelf = world.shelves.find((s) => !s.deco && s.productId === heldBox.productId);
    if (shelf) {
      const task = tasks.find((t) => t.id === restockTaskId(shelf.shelfId));
      if (!task || !task.done) {
        return {
          x: shelf.interactPoint.x,
          z: shelf.interactPoint.z,
          label: `${getProduct(shelf.productId).name} → ${shelf.aisleLabel || "shelf"}`,
          kind: "shelf",
          shelfId: shelf.shelfId,
        };
      }
    }
    return null;
  }

  const task = nextIncompleteTask(tasks);
  if (!task) return null;

  if (task.type === "restock") {
    const spawn = nearestOf(player, world.warehouse.boxSpawns);
    return { x: spawn.x, z: spawn.z, label: `Get the ${getProduct(task.productId).name} box`, kind: "warehouse", productId: task.productId };
  }
  if (task.type === "carts") {
    const loose = carts.filter((c) => !c.returned && !c.carried);
    if (!loose.length) return null;
    const c = nearestOf(player, loose);
    return { x: c.x, z: c.z, label: "Collect the cart", kind: "cart", cartId: c.id };
  }
  if (task.type === "spill") {
    const active = spills.filter((s) => !s.cleaned);
    if (!active.length) return null;
    const s = nearestOf(player, active);
    return { x: s.x, z: s.z, label: "Clean the spill", kind: "spill", spillId: s.id };
  }
  if (task.type === "fallen") {
    const active = fallen.filter((f) => !f.resolved);
    if (!active.length) return null;
    const f = nearestOf(player, active);
    if (f.state === "onFloor") return { x: f.x, z: f.z, label: "Pick up the item", kind: "fallenItem", fallenId: f.id };
    const shelf = world.shelves.find((s) => s.shelfId === f.shelfId);
    return shelf
      ? { x: shelf.interactPoint.x, z: shelf.interactPoint.z, label: "Put it back", kind: "shelf", shelfId: shelf.shelfId }
      : null;
  }
  return null; // 'serve' — no fixed destination, customers move on their own
}
