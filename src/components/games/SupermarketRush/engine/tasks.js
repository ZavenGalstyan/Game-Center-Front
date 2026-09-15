/**
 * Supermarket Rush — the shift task list: building it from a level + its
 * built world, and folding gameplay events (a carton placed, a customer
 * served, a cart returned, a spill mopped) into progress. Also the shift
 * scoring — stars and pay — read by the results screen.
 */
import { getProduct } from "../data/products.js";
import { currentSatisfaction } from "./gameStore.js";

export function buildTasks(world, level) {
  const tasks = [];
  for (const s of world.shelves) {
    if (s.deco) continue;
    const plan = level.stock[s.shelfId];
    const need = Math.max(0, plan.capacity - plan.start);
    if (need <= 0) continue;
    tasks.push({
      id: `restock-${s.shelfId}`,
      type: "restock",
      shelfId: s.shelfId,
      productId: s.productId,
      label: `Restock ${getProduct(s.productId).name}`,
      current: 0,
      required: need,
      done: false,
    });
  }
  if (level.customers > 0) {
    tasks.push({ id: "serve", type: "serve", label: "Help Customers", current: 0, required: level.customers, done: false });
  }
  if (level.carts) {
    tasks.push({ id: "carts", type: "carts", label: "Collect Carts", current: 0, required: level.cartsTarget || 3, done: false });
  }
  if (level.spill) {
    tasks.push({ id: "spill", type: "spill", label: "Clean Spill", current: 0, required: 1, done: false });
  }
  if (level.fallen) {
    tasks.push({ id: "fallen", type: "fallen", label: "Fix Fallen Item", current: 0, required: 1, done: false });
  }
  return tasks;
}

/** Applies one progress event to the task list. Returns { tasks, task, justCompleted }. */
export function applyTaskEvent(tasks, id, amount = 1) {
  let justCompleted = false;
  let touched = null;
  const next = tasks.map((t) => {
    if (t.id !== id || t.done) return t;
    const current = Math.min(t.required, t.current + amount);
    const done = current >= t.required;
    if (done) justCompleted = true;
    touched = { ...t, current, done };
    return touched;
  });
  return { tasks: next, task: touched, justCompleted };
}

export function restockTaskId(shelfId) {
  return `restock-${shelfId}`;
}

export function allTasksComplete(tasks) {
  return tasks.length > 0 && tasks.every((t) => t.done);
}

export function tasksSummary(tasks) {
  const done = tasks.filter((t) => t.done).length;
  return { done, total: tasks.length };
}

/** Finds the first incomplete task, for the passive guidance / hint system. */
export function nextIncompleteTask(tasks) {
  return tasks.find((t) => !t.done) || null;
}

/**
 * Final shift scoring: stars + pay breakdown. `timeSec` is total shift
 * duration; `satisfaction` 0-100 from the running satisfaction log.
 */
export function computeShiftResult(level, world, store, timeSec) {
  const state = store.get();
  const satisfaction = Math.round(currentSatisfaction(state));
  const stats = state.shiftStats;

  const underTarget = level.targetTimeSec != null && timeSec <= level.targetTimeSec;
  const star1 = true; // reaching results at all means every required task is done
  const star2 = level.targetTimeSec != null ? underTarget : satisfaction >= 70;
  const star3 = satisfaction >= 90;
  const stars = 1 + (star2 ? 1 : 0) + (star3 ? 1 : 0);

  const bonusCustomers = stats.customersServed * 8;
  const bonusFast = stats.fastCheckouts * 5;
  const bonusClean = (level.spill ? stats.spillsCleaned * 15 : 0) + (level.carts ? stats.cartsCollected * 4 : 0);
  const bonusTime = underTarget ? 20 : 0;
  const totalPay = Math.round(level.basePay + bonusCustomers + bonusFast + bonusClean + bonusTime);

  return {
    levelId: level.id,
    timeSec,
    satisfaction,
    stars,
    tasksComplete: tasksSummary(state.tasks),
    productsRestocked: stats.productsRestocked,
    customersServed: stats.customersServed,
    itemsScanned: stats.itemsScanned,
    cartsCollected: stats.cartsCollected,
    fastCheckouts: stats.fastCheckouts,
    basePay: level.basePay,
    bonusCustomers,
    bonusFast,
    bonusClean,
    bonusTime,
    totalPay,
  };
}
