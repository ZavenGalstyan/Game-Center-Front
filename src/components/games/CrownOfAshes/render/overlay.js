/**
 * World-anchored DOM overlay drawn over the canvas: floating damage numbers,
 * enemy health bars, NPC names with quest indicators (! new, ? turn in),
 * and the tracked objective's waypoint. Elements are pooled; positions are
 * projected from 3D every frame.
 */
import * as THREE from "three";
import { DIALOGUE } from "../data/dialogue.js";
import { check } from "../engine/conditions.js";
import { questMarkers } from "../engine/game.js";

export function createOverlay(host) {
  const root = document.createElement("div");
  root.className = "coa-ov";
  host.appendChild(root);
  let W = 1280;
  let H = 720;
  const v = new THREE.Vector3();
  const nums = [];
  const bars = new Map();
  const tags = new Map();
  const marks = [];
  let wp = null;

  function project(cam, x, y, z) {
    v.set(x, y, z).project(cam);
    if (v.z > 1 || v.z < -1) return null;
    return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H };
  }
  const el = (cls, parent = root) => {
    const d = document.createElement("div");
    d.className = cls;
    parent.appendChild(d);
    return d;
  };

  function damage(ev) {
    const d = el(`coa-dmg${ev.crit ? " coa-dmg--crit" : ""}${ev.toPlayer ? " coa-dmg--hurt" : ""}${ev.blocked ? " coa-dmg--blocked" : ""}${ev.dot ? ` coa-dmg--${ev.dot}` : ""}${ev.fire && !ev.toPlayer ? " coa-dmg--fire" : ""}${ev.heal ? " coa-dmg--heal" : ""}`);
    d.textContent = ev.text || (ev.heal ? `+${ev.n}` : ev.backstab ? `${ev.n}!` : String(ev.n));
    nums.push({ d, x: ev.x + (Math.random() - 0.5) * 0.6, y: ev.y, z: ev.z + (Math.random() - 0.5) * 0.6, t: 0, life: ev.crit ? 1.2 : 0.9, vy: ev.toPlayer ? 0.6 : 1.3 });
    if (nums.length > 40) {
      nums[0].d.remove();
      nums.shift();
    }
  }

  function npcIndicator(G, n) {
    if (!n.npc) return null;
    const P = G.P;
    // turn-in: an active objective wants to talk to them
    for (const id of G.quests.active()) {
      const st = G.quests.stage(id);
      for (const o of st.objectives) if (o.type === "talk" && o.npc === n.npc && !P.quests[id].done[o.id]) return "?";
    }
    const tree = DIALOGUE[n.npc];
    if (!tree) return null;
    for (const id of tree.entries) {
      if (id === "hub" || id === "pledged" || id === "castle" || id === "later") continue;
      const node = tree.nodes[id];
      if (node?.cond && Object.keys(node.cond).length && check(P, node.cond, G)) return node.cond.q || node.cond.qn ? "!" : null;
    }
    return null;
  }

  function update(G, cam, dt, on) {
    root.style.display = on ? "" : "none";
    if (!on) return;
    const p = G.player;
    // damage numbers
    for (let i = nums.length - 1; i >= 0; i--) {
      const n = nums[i];
      n.t += dt;
      n.y += n.vy * dt;
      const s = project(cam, n.x, n.y, n.z);
      if (!s || n.t > n.life) {
        n.d.remove();
        nums.splice(i, 1);
        continue;
      }
      n.d.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%) scale(${1 + Math.max(0, 0.25 - n.t) * 2})`;
      n.d.style.opacity = String(Math.min(1, (n.life - n.t) * 3));
    }
    // enemy bars
    const seen = new Set();
    const list = [...G.enemies, ...G.objects];
    for (const e of list) {
      if (e.dead || e.boss || e.interior !== p.interior) continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      const show = (e.hp < e.maxHp || e.target === p || e.kind === "object") && d < 38;
      if (!show) continue;
      const s = project(cam, e.x, e.y + (e.h || 1.8) + 0.45 + (e.yOff || 0), e.z);
      if (!s) continue;
      seen.add(e);
      let b = bars.get(e);
      if (!b) {
        b = el("coa-ebar");
        b.innerHTML = `<i></i><b></b><span></span>`;
        bars.set(e, b);
      }
      b.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
      const f = Math.max(0, e.hp / e.maxHp);
      b.children[1].style.width = `${f * 100}%`;
      b.children[2].textContent = e.kind === "object" ? e.name : e.def?.poise >= 100 || e.unique ? e.name : e.state === "suspicious" ? "?" : "";
      b.className = `coa-ebar${e.state === "suspicious" ? " coa-ebar--sus" : ""}${e.def?.poise >= 100 ? " coa-ebar--elite" : ""}${e.state === "yield" ? " coa-ebar--yield" : ""}`;
      b.style.opacity = d > 30 ? String(Math.max(0, (38 - d) / 8)) : "1";
    }
    for (const [e, b] of bars)
      if (!seen.has(e)) {
        b.remove();
        bars.delete(e);
      }
    // NPC tags
    const seenT = new Set();
    for (const n of [...G.npcs, ...G.allies.filter((a) => a.companion)]) {
      if (n.interior !== p.interior) continue;
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      const ind = n.kind === "npc" ? npcIndicator(G, n) : null;
      if (d > (ind ? 45 : 11)) continue;
      const s = project(cam, n.x, n.y + 2.15, n.z);
      if (!s) continue;
      seenT.add(n);
      let t = tags.get(n);
      if (!t) {
        t = el("coa-tag");
        t.innerHTML = `<em></em><span></span>`;
        tags.set(n, t);
      }
      t.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
      t.children[0].textContent = ind || "";
      t.children[0].className = ind === "?" ? "coa-tag__q coa-tag__q--turn" : ind ? "coa-tag__q" : "";
      t.children[1].textContent = d < 11 ? n.name : "";
      t.style.opacity = d < 11 ? "1" : "0.9";
    }
    for (const [n, t] of tags)
      if (!seenT.has(n)) {
        t.remove();
        tags.delete(n);
      }
    // objective waypoint (tracked quest)
    const ms = G.P.settingsMarkers === false ? [] : questMarkers(G).filter((m) => m.tracked);
    while (marks.length < ms.length) marks.push(el("coa-wp"));
    marks.forEach((m, i) => {
      const q = ms[i];
      if (!q || (q.interior || null) !== (p.interior || null)) {
        m.style.display = "none";
        return;
      }
      const gy = q.interior ? 2.6 : G.ground(q.x, q.z) + 2.6;
      const s = project(cam, q.x, gy, q.z);
      if (!s) {
        m.style.display = "none";
        return;
      }
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      m.style.display = "";
      m.style.transform = `translate(${Math.max(20, Math.min(W - 20, s.x))}px, ${Math.max(30, Math.min(H - 30, s.y))}px) translate(-50%, -100%)`;
      m.textContent = d > 4 ? `${Math.round(d)} m` : "";
    });
    void wp;
  }

  return {
    root,
    resize(w, h) {
      W = w;
      H = h;
    },
    damage,
    text(ev, cls) {
      damage({ ...ev, text: ev.text, n: 0, cls });
    },
    update,
    clear() {
      nums.forEach((n) => n.d.remove());
      nums.length = 0;
      bars.forEach((b) => b.remove());
      bars.clear();
      tags.forEach((t) => t.remove());
      tags.clear();
    },
    dispose() {
      this.clear();
      root.remove();
    },
  };
}
