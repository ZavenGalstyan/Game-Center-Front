/**
 * Imperative DOM overlay drawn on top of the canvas (no React re-renders):
 * objective markers (clamped to the screen edge with a direction arrow),
 * floating damage numbers, enemy health bars and awareness indicators.
 */
import * as THREE from "three";

const V = new THREE.Vector3();

export function createOverlay(host) {
  const root = document.createElement("div");
  root.className = "nm-overlay";
  host.appendChild(root);
  const markers = [];
  const nums = [];
  const bars = new Map();
  let W = 1280;
  let H = 720;

  function marker(i) {
    if (!markers[i]) {
      const el = document.createElement("div");
      el.className = "nm-marker";
      el.innerHTML = `<div class="nm-marker__icon"></div><div class="nm-marker__label"></div><div class="nm-marker__dist"></div>`;
      root.appendChild(el);
      markers[i] = { el, icon: el.children[0], label: el.children[1], dist: el.children[2], kind: "" };
    }
    return markers[i];
  }

  function project(cam, x, y, z) {
    V.set(x, y, z).project(cam);
    const behind = V.z > 1;
    return { x: (V.x * 0.5 + 0.5) * W, y: (-V.y * 0.5 + 0.5) * H, behind };
  }

  return {
    resize(w, h) {
      W = w;
      H = h;
    },
    update(G, cam, dt, show = true) {
      root.style.display = show ? "" : "none";
      if (!show) return;
      // markers
      const list = G.missions.markers();
      const p = G.player;
      let n = 0;
      for (const m of list) {
        const k = marker(n++);
        const s = project(cam, m.x, m.y, m.z);
        const d = Math.hypot(m.x - p.x, m.z - p.z);
        let x = s.x;
        let y = s.y;
        const pad = 46;
        let edge = false;
        if (s.behind) {
          x = W - x;
          y = H - pad;
          edge = true;
        }
        if (x < pad || x > W - pad || y < pad || y > H - pad) edge = true;
        x = Math.max(pad, Math.min(W - pad, x));
        y = Math.max(pad, Math.min(H - pad, y));
        k.el.style.display = "";
        k.el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
        const cls = `nm-marker nm-marker--${m.kind}${edge ? " nm-marker--edge" : ""}${m.kind === "enemy" ? " nm-marker--small" : ""}`;
        if (k.el.className !== cls) k.el.className = cls;
        if (k.kind !== m.label) {
          k.label.textContent = m.kind === "enemy" ? "" : m.label || "";
          k.kind = m.label;
        }
        k.dist.textContent = m.kind === "enemy" || d < 3 ? "" : `${Math.round(d)} m`;
        if (edge) {
          const ang = Math.atan2(s.y - H / 2, (s.behind ? W - s.x : s.x) - W / 2);
          k.icon.style.transform = `rotate(${(ang + Math.PI / 2).toFixed(2)}rad)`;
        } else k.icon.style.transform = "";
      }
      for (let i = n; i < markers.length; i++) markers[i].el.style.display = "none";
      // health bars + awareness (enemies that are hurt, alerted or suspicious)
      const seen = new Set();
      for (const e of G.enemies) {
        if (e.state === "dead" || e.boss) continue;
        const d = Math.hypot(e.x - p.x, e.z - p.z);
        const show = d < 40 && (e.hp < e.maxHp || e.state === "combat" || e.aware > 0.05 || e.shield < e.maxShield);
        if (!show) continue;
        const s = project(cam, e.x, e.y + e.h + 0.45, e.z);
        if (s.behind || s.x < 0 || s.x > W || s.y < 0 || s.y > H) continue;
        seen.add(e);
        let b = bars.get(e);
        if (!b) {
          const el = document.createElement("div");
          el.className = "nm-ebar";
          el.innerHTML = `<div class="nm-ebar__aware"></div><div class="nm-ebar__track"><div class="nm-ebar__shield"></div><div class="nm-ebar__hp"></div></div>`;
          root.appendChild(el);
          b = { el, aware: el.children[0], hp: el.children[1].children[1], sh: el.children[1].children[0] };
          bars.set(e, b);
        }
        b.el.style.transform = `translate(${s.x.toFixed(0)}px, ${s.y.toFixed(0)}px)`;
        b.hp.style.width = `${Math.max(0, (e.hp / e.maxHp) * 100).toFixed(1)}%`;
        b.sh.style.width = e.maxShield ? `${((e.shield / e.maxShield) * 100).toFixed(1)}%` : "0%";
        const st = e.state === "combat" || e.state === "retreat" ? "!" : e.aware > 0.05 || e.state === "suspicious" || e.state === "search" ? "?" : "";
        b.aware.textContent = st;
        b.aware.className = `nm-ebar__aware${st === "!" ? " nm-ebar__aware--alert" : ""}`;
        b.aware.style.setProperty("--k", (st === "!" ? 1 : e.aware).toFixed(2));
        b.el.style.opacity = d > 30 ? "0.6" : "1";
      }
      for (const [e, b] of bars)
        if (!seen.has(e)) {
          b.el.remove();
          bars.delete(e);
        }
      // damage numbers
      for (let i = nums.length - 1; i >= 0; i--) {
        const q = nums[i];
        q.t += dt;
        if (q.t > q.max) {
          q.el.remove();
          nums.splice(i, 1);
          continue;
        }
        const s = project(cam, q.x, q.y + q.t * 1.2, q.z);
        if (s.behind) {
          q.el.style.display = "none";
          continue;
        }
        q.el.style.display = "";
        q.el.style.transform = `translate(${(s.x + q.ox).toFixed(0)}px, ${s.y.toFixed(0)}px) scale(${(q.crit ? 1.25 : 1) * (1 - q.t / q.max / 3)})`;
        q.el.style.opacity = String(Math.min(1, (q.max - q.t) * 3));
      }
    },
    damage(ev) {
      if (!ev.amount) return;
      if (nums.length > 28) {
        nums[0].el.remove();
        nums.shift();
      }
      const el = document.createElement("div");
      el.className = `nm-dmg${ev.crit ? " nm-dmg--crit" : ""}`;
      el.textContent = ev.crit ? `${ev.amount}!` : String(ev.amount);
      root.appendChild(el);
      nums.push({ el, x: ev.x, y: ev.y, z: ev.z, t: 0, max: 0.9, crit: ev.crit, ox: (Math.random() - 0.5) * 30 });
    },
    text(ev, cls = "nm-dmg nm-dmg--info") {
      const el = document.createElement("div");
      el.className = cls;
      el.textContent = ev.text;
      root.appendChild(el);
      nums.push({ el, x: ev.x, y: ev.y, z: ev.z, t: 0, max: 1.2, crit: false, ox: 0 });
    },
    clear() {
      for (const q of nums) q.el.remove();
      nums.length = 0;
      for (const [, b] of bars) b.el.remove();
      bars.clear();
    },
    dispose() {
      root.remove();
    },
  };
}
