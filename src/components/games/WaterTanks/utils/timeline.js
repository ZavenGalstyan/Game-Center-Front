/**
 * Water Tanks — a cancellable bundle of timers for one animation sequence.
 * `clear()` cancels everything (restart, undo, unmount); `flush()` runs the
 * pending steps immediately in order — used by the DEV test hook, since a
 * hidden automation tab throttles timers.
 */
export class Timeline {
  constructor() {
    this.items = new Set();
  }
  at(ms, fn) {
    const it = { fn, due: performance.now() + ms, order: this.items.size };
    it.id = setTimeout(() => {
      this.items.delete(it);
      fn();
    }, Math.max(0, ms));
    this.items.add(it);
    return it;
  }
  clear() {
    for (const it of this.items) clearTimeout(it.id);
    this.items.clear();
  }
  flush() {
    let guard = 0;
    while (this.items.size && guard++ < 500) {
      const it = [...this.items].sort((a, b) => a.due - b.due || a.order - b.order)[0];
      clearTimeout(it.id);
      this.items.delete(it);
      it.fn();
    }
  }
  get pending() {
    return this.items.size;
  }
}
