/**
 * Supermarket Rush — the stateful adapter around engine/customerAI.js: owns
 * the live customer list, spawns them over the course of the shift, and
 * manages checkout queues (a cross-customer concern the pure step function
 * can't decide on its own — see customerAI.js's header). three/CustomersLayer
 * just visualizes whatever's in `.customers`; StoreScene drives checkout
 * completion by calling `completeCheckout`.
 */
import {
  spawnCustomer,
  stepCustomer,
  sendToCheckoutQueue,
  advanceInQueue,
  sendToExit,
  startPaying,
} from "./customerAI.js";

export class CustomerSystem {
  constructor(world, level) {
    this.world = world;
    this.level = level;
    this.customers = [];
    this.queues = new Map(world.checkouts.map((c) => [c.id, []]));
    this.spawned = 0;
    this.total = level.customers || 0;
    this.spawnTimer = this.total > 0 ? 2.5 + Math.random() * 2 : Infinity;
    this.rng = Math.random;
    this.helpGiven = 0;
    this.maxHelp = Math.min(2, Math.ceil(this.total / 4));
  }

  frontOfQueue(checkoutId) {
    const q = this.queues.get(checkoutId);
    if (!q || !q.length) return null;
    return this.customers.find((c) => c.id === q[0]) || null;
  }

  /** Called once the player finishes scanning the front customer's items. */
  completeCheckout(checkoutId, paySeconds = 1.0) {
    const q = this.queues.get(checkoutId);
    if (!q || !q.length) return null;
    const customerId = q.shift();
    const customer = this.customers.find((c) => c.id === customerId);
    if (customer) startPaying(customer, paySeconds);
    this._advanceQueue(checkoutId);
    return customer;
  }

  _advanceQueue(checkoutId) {
    const checkout = this.world.checkouts.find((c) => c.id === checkoutId);
    const q = this.queues.get(checkoutId);
    if (!checkout || !q) return;
    q.forEach((id, i) => {
      const c = this.customers.find((cc) => cc.id === id);
      if (c) advanceInQueue(c, checkout.queuePoint(i));
    });
  }

  _assignAfterShopping(c) {
    if (this.world.checkouts.length > 0) {
      let best = this.world.checkouts[0];
      let bestLen = Infinity;
      for (const checkout of this.world.checkouts) {
        const len = this.queues.get(checkout.id).length;
        if (len < bestLen) { bestLen = len; best = checkout; }
      }
      const q = this.queues.get(best.id);
      const slot = q.length;
      q.push(c.id);
      sendToCheckoutQueue(c, best.id, best.queuePoint(slot), this.world);
    } else {
      sendToExit(c, this.world);
      c.readyToLeaveNoCheckout = true;
    }
  }

  update(dt, callbacks) {
    if (this.spawned < this.total) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        const wantsHelp = this.helpGiven < this.maxHelp && this.rng() < 0.4;
        const c = spawnCustomer(this.world, this.rng, wantsHelp);
        if (wantsHelp) this.helpGiven++;
        this.customers.push(c);
        this.spawned++;
        this.spawnTimer = Math.max(6, 18 - this.total * 0.7) + this.rng() * 4;
        callbacks.onSpawn?.(c);
      }
    }

    for (const c of this.customers) {
      const events = stepCustomer(c, dt, this.world);
      for (const e of events) {
        if (e.type === "takeItem") callbacks.onTakeItem?.(e.shelfId, e.productId, c);
        else if (e.type === "doneShopping") this._assignAfterShopping(c);
        else if (e.type === "exited") {
          callbacks.onExited?.(c);
        } else if (e.type === "paid") {
          // stepCustomer already routed them to the exit; nothing else to do.
        }
      }
    }

    const before = this.customers.length;
    this.customers = this.customers.filter((c) => c.state !== "done");
    if (this.customers.length !== before) callbacks.onDespawn?.();
  }
}
