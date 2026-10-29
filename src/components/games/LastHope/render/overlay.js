/**
 * Last Hope — DOM overlay pinned to world positions: floating damage numbers,
 * pickup popups ("+3 Wood"), zombie health bars (shown once hurt; always for
 * bosses), container sparkle markers. Elements are pooled and moved with
 * transforms each frame — no React involvement.
 */
import * as THREE from "three";

const _v = new THREE.Vector3();

export function createOverlay(host) {
  const root = document.createElement("div");
  root.className = "lh-ov";
  host.appendChild(root);
  const pool = { num: [], bar: [], pop: [] };
  const live = [];
  const bars = new Map(); // id → el
  let W = 1;
  let H = 1;

  const make = (cls) => {
    const el = document.createElement("div");
    el.className = cls;
    root.appendChild(el);
    return el;
  };
  const take = (kind, cls) => {
    const el = pool[kind].pop() || make(cls);
    el.style.display = "";
    return el;
  };

  function project(cam, x, y, z) {
    _v.set(x, y, z).project(cam);
    return [(_v.x * 0.5 + 0.5) * W, (-_v.y * 0.5 + 0.5) * H, _v.z < 1];
  }

  return {
    resize(w, h) {
      W = w;
      H = h;
    },
    number(x, y, z, text, kind = "dmg") {
      const el = take("num", "lh-num");
      el.className = `lh-num lh-num--${kind}`;
      el.textContent = text;
      live.push({ el, kind: "num", x: x + (Math.random() - 0.5) * 0.4, y, z: z + (Math.random() - 0.5) * 0.4, t: 0, life: kind === "crit" ? 1.1 : 0.85 });
    },
    popup(x, y, z, text, cls = "") {
      // at most four stacked at once: a burst retires the oldest early
      const pops = live.filter((l) => l.kind === "pop" && l.t < l.life - 0.2);
      if (pops.length >= 4) pops[0].t = pops[0].life - 0.2;
      const el = take("pop", "lh-pop");
      el.className = `lh-pop ${cls}`;
      el.textContent = text;
      const stack = Math.min(3, pops.length);
      live.push({ el, kind: "pop", x, y: y + stack * 0.32, z, t: 0, life: 1.6 });
    },
    /** bars: [{id, x, y, z, hp, max, boss, show}] — call once per frame */
    bars(cam, list) {
      const seen = new Set();
      for (const b of list) {
        if (!b.show) continue;
        seen.add(b.id);
        let el = bars.get(b.id);
        if (!el) {
          el = take("bar", "lh-bar");
          el.innerHTML = "<i></i><b></b>";
          bars.set(b.id, el);
        }
        const [sx, sy, vis] = project(cam, b.x, b.y, b.z);
        el.style.display = vis ? "" : "none";
        el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
        el.className = `lh-bar${b.armored ? " lh-bar--arm" : ""}`;
        const k = Math.max(0, b.hp / b.max);
        el.lastChild.style.transform = `scaleX(${k.toFixed(3)})`;
        el.firstChild.style.transform = `scaleX(${Math.max(k, b.trail ?? k).toFixed(3)})`;
      }
      for (const [id, el] of bars)
        if (!seen.has(id)) {
          el.style.display = "none";
          pool.bar.push(el);
          bars.delete(id);
        }
    },
    update(cam, dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        const l = live[i];
        l.t += dt;
        if (l.t >= l.life) {
          l.el.style.display = "none";
          pool[l.kind].push(l.el);
          live.splice(i, 1);
          continue;
        }
        const k = l.t / l.life;
        const rise = l.kind === "num" ? 0.9 * Math.sqrt(k) : 0.7 * k;
        const [sx, sy, vis] = project(cam, l.x, l.y + rise, l.z);
        const sc = l.kind === "num" ? (k < 0.12 ? 0.6 + (k / 0.12) * 0.7 : 1.3 - Math.min(0.3, (k - 0.12) * 0.6)) : 1;
        l.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) scale(${sc.toFixed(2)})`;
        l.el.style.opacity = vis ? String(Math.min(1, (1 - k) * 2.2)) : "0";
      }
    },
    clear() {
      for (const l of live) {
        l.el.style.display = "none";
        pool[l.kind].push(l.el);
      }
      live.length = 0;
      for (const [, el] of bars) {
        el.style.display = "none";
        pool.bar.push(el);
      }
      bars.clear();
    },
    dispose() {
      root.remove();
    },
  };
}
