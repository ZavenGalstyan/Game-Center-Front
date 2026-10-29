/**
 * Quest guidance + map drawing.
 *
 *   questTarget(G, questId)  where the tracked objective is (with a simple
 *                            gateway route: hidden passage / castle gate)
 *   drawMinimap(canvas, G, target)  rotating, player-centred minimap
 *   drawWorldMap(canvas, G, target) the full map (M)
 */
import { LAYOUT, REGIONS, FOREST, PITCH, forestTrees, ARENA } from "../data/layout.js";
import { QUESTS } from "../data/quests.js";
import { NPCS } from "../data/npcs.js";

const FLAG_TARGET = { duelBlock: "duel", pillarsSolved: "pillar_2", mirrorVision: "mirror", braziersSolved: "brazier_1", sigilsPlaced: "ancient_door" };
const ITEM_SOURCE = { founders_book: "founders_book", dark_mask: "mask", sigil_lion: "chest_gh", sigil_eagle: "chest_tower", sigil_badger: "shrine_lid", aegis_stone: "pedestal" };
const REGION_CENTER = { library: [-38, 0], classrooms: [30, 0], grounds: [0, 32], corridor: [-80, 0], mirrorhall: [-87, -45], antechamber: [-136, -51], greathall: [0, -40] };

function area(x, z) {
  if (z < -300) return "arena";
  if (x < -66 && z < 12) return "hidden";
  if (z > 21) return "grounds";
  return "castle";
}
/** Next waypoint from the player's area toward a target point. */
function route(G, tx, tz) {
  const p = G.player;
  const a = area(p.x, p.z);
  const b = area(tx, tz);
  if (a === b) return { x: tx, z: tz, via: null };
  if (a === "hidden") return { x: -63.5, z: 0, via: "the hidden passage" };
  if (b === "hidden") return a === "grounds" ? { x: 0, z: 18, via: "the castle gate" } : { x: -64.5, z: 0, via: "the Restricted Section" };
  if (a === "grounds") return { x: 0, z: 18, via: "the castle gate" };
  return { x: 0, z: 24, via: "the castle gate" };
}

export function questTarget(G, qid) {
  const q = QUESTS[qid];
  const s = G.P.quests[qid];
  if (!q || !s || s.state !== "active") return null;
  const stage = q.stages[s.stage];
  const p = G.player;
  let best = null;
  stage.obj.forEach((o, i) => {
    if ((s.prog[i] || 0) >= (o.n || 1)) return;
    let pt = null;
    switch (o.type) {
      case "talk": {
        const n = G.npcs.find((x) => x.id === o.npc || (o.npc === "companion" && x.companion));
        if (n) pt = [n.x, n.z, NPCS[o.npc]?.name || n.def.name];
        break;
      }
      case "region":
        pt = REGION_CENTER[o.region] ? [...REGION_CENTER[o.region], REGIONS.find((r) => r.id === o.region)?.name] : null;
        break;
      case "spell":
      case "use": {
        const objs = G.objects.list.filter((x) => x.id.startsWith(o.obj) && !x.gone && G.objects.visible(x) && (o.type === "use" || !G.objects.invalid(x, o.spell)));
        objs.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
        if (objs[0]) pt = [objs[0].x, objs[0].z, objs[0].def.label];
        break;
      }
      case "reveal": {
        const objs = G.objects.list.filter((x) => x.id.startsWith(o.obj) && !x.st.revealed && G.objects.visible(x));
        objs.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
        if (objs[0]) pt = [objs[0].x, objs[0].z, objs[0].def.label];
        break;
      }
      case "kill": {
        const es = G.enemies.filter((e) => !e.dead && ((o.group && e.group === o.group) || (o.etype && e.type === o.etype)));
        es.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
        if (es[0]) pt = [es[0].x, es[0].z, es[0].name || es[0].def.name];
        break;
      }
      case "have": {
        const src = G.objects.byId[ITEM_SOURCE[o.item]];
        if (src) pt = [src.x, src.z, src.def.label];
        break;
      }
      case "flag": {
        const id = FLAG_TARGET[o.flag];
        if (id === "duel") {
          const e = G.enemies.find((x) => x.group === "duel" && !x.dead);
          if (e) pt = [e.x, e.z, e.name || "your partner"];
        } else if (id) {
          const ob = G.objects.byId[id];
          if (ob) pt = [ob.x, ob.z, ob.def.label];
        }
        break;
      }
      default:
        break;
    }
    if (!pt) return;
    const d = Math.hypot(pt[0] - p.x, pt[1] - p.z);
    if (!best || d < best.d) best = { x: pt[0], z: pt[1], label: pt[2], d };
  });
  if (!best) return null;
  const r = route(G, best.x, best.z);
  return { ...best, x: r.x, z: r.z, via: r.via, final: { x: best.x, z: best.z } };
}

/* ================================================================ drawing */
let wallPaths = null;
function walls() {
  if (wallPaths) return wallPaths;
  wallPaths = LAYOUT.boxes.filter((b) => (b.kind === "wall" && !b.lintel && !b.invisible) || b.kind === "thicket");
  return wallPaths;
}
function drawBase(g, G, toX, toY, scale, opts = {}) {
  // grounds
  g.fillStyle = "#3a4a2a";
  g.fillRect(-4000, -4000, 8000, 8000);
  const rect = (x0, z0, x1, z1, col) => {
    const a = toX(x0, z0);
    const b = toY(x0, z0);
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(a, b);
    g.lineTo(toX(x1, z0), toY(x1, z0));
    g.lineTo(toX(x1, z1), toY(x1, z1));
    g.lineTo(toX(x0, z1), toY(x0, z1));
    g.closePath();
    g.fill();
  };
  rect(FOREST.x0, FOREST.z0, FOREST.x1, FOREST.z1, "#1e2a1a");
  rect(-21, -21, 21, 21, "#6a6458");
  rect(-14, -64, 14, -21, "#5a4a3a");
  rect(-66, -26, -21, 26, "#5a4632");
  rect(21, -26, 66, 26, "#5a4632");
  if (G.P.discovered.corridor || opts.full) for (const [x0, x1, z0, z1] of [[-78, -66, -3, 3], [-96, -78, -10, 10], [-91, -83, -40, -10], [-100, -74, -62, -40], [-132, -100, -56, -46], [-156, -132, -64, -38], [-160, -128, -96, -64]]) if (G.P.discovered.corridor) rect(x0, z0, x1, z1, "#3a3a44");
  // pitch
  g.fillStyle = "#4a7a2c";
  g.beginPath();
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const x = PITCH.x + Math.cos(a) * PITCH.rx;
    const z = PITCH.z + Math.sin(a) * PITCH.rz;
    if (i) g.lineTo(toX(x, z), toY(x, z));
    else g.moveTo(toX(x, z), toY(x, z));
  }
  g.fill();
  // lake
  rect(176, 40, 600, 260, "#2a4a5a");
  // trees (full map only — cheap dots)
  if (opts.full) {
    g.fillStyle = "#16201a";
    for (const t of forestTrees()) {
      g.beginPath();
      g.arc(toX(t.x, t.z), toY(t.x, t.z), Math.max(1, 1.6 * scale), 0, 6.3);
      g.fill();
    }
  }
  // walls
  g.strokeStyle = "#d8ccb0";
  g.lineCap = "round";
  for (const b of walls()) {
    if (b.mat === "hidden" && !G.P.discovered.corridor) continue;
    const alongX = b.x1 - b.x0 > b.z1 - b.z0;
    g.lineWidth = Math.max(1, (b.kind === "thicket" ? 1.5 : 1.2) * scale);
    g.strokeStyle = b.kind === "thicket" ? "#0e160c" : b.mat === "hidden" ? "#8a8a98" : "#e0d4b8";
    g.beginPath();
    if (alongX) {
      const z = (b.z0 + b.z1) / 2;
      g.moveTo(toX(b.x0, z), toY(b.x0, z));
      g.lineTo(toX(b.x1, z), toY(b.x1, z));
    } else {
      const x = (b.x0 + b.x1) / 2;
      g.moveTo(toX(x, b.z0), toY(x, b.z0));
      g.lineTo(toX(x, b.z1), toY(x, b.z1));
    }
    g.stroke();
  }
}

export function drawMinimap(cv, G, target) {
  if (!cv) return;
  const g = cv.getContext("2d");
  const W = cv.width;
  const H = cv.height;
  const p = G.player;
  const scale = 1.6; // px per metre
  const yaw = G.camYaw;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  // rotate so camera-forward is up
  const toX = (x, z) => W / 2 + ((x - p.x) * -c + (z - p.z) * s) * scale;
  const toY = (x, z) => H / 2 + (-(x - p.x) * s - (z - p.z) * c) * scale;
  g.save();
  g.clearRect(0, 0, W, H);
  g.beginPath();
  g.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2);
  g.clip();
  if (G.flag("arena")) {
    g.fillStyle = "#14101c";
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "#6a5a8a";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(toX(ARENA.x, ARENA.z), toY(ARENA.x, ARENA.z), ARENA.r * scale, 0, 6.3);
    g.stroke();
  } else drawBase(g, G, toX, toY, scale);
  // npcs
  for (const n of G.npcs) {
    if (n.hidden) continue;
    g.fillStyle = n.companion ? "#ffd27a" : "#9fd8ff";
    g.beginPath();
    g.arc(toX(n.x, n.z), toY(n.x, n.z), 2.6, 0, 6.3);
    g.fill();
  }
  // enemies
  for (const e of G.enemies) {
    if (e.dead || e.def.ai === "dummy") continue;
    g.fillStyle = e.def.boss ? "#ff3a6a" : e.aggro ? "#ff5a4a" : "#c87a6a";
    g.beginPath();
    g.arc(toX(e.x, e.z), toY(e.x, e.z), e.def.boss ? 4 : 2.8, 0, 6.3);
    g.fill();
  }
  // target
  if (target) {
    let tx = toX(target.x, target.z);
    let ty = toY(target.x, target.z);
    const dx = tx - W / 2;
    const dy = ty - H / 2;
    const L = Math.hypot(dx, dy);
    const R = W / 2 - 10;
    if (L > R) {
      tx = W / 2 + (dx / L) * R;
      ty = H / 2 + (dy / L) * R;
    }
    g.fillStyle = "#ffd25a";
    g.strokeStyle = "#3a2a08";
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(tx, ty - 7);
    g.lineTo(tx + 5, ty);
    g.lineTo(tx, ty + 7);
    g.lineTo(tx - 5, ty);
    g.closePath();
    g.fill();
    g.stroke();
  }
  g.restore();
  // player arrow (always up = camera forward, rotated by facing offset)
  g.save();
  g.translate(W / 2, H / 2);
  g.rotate(-(p.yaw - yaw));
  g.fillStyle = "#fff4d8";
  g.strokeStyle = "#1a1208";
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(0, -8);
  g.lineTo(5.5, 6);
  g.lineTo(0, 3);
  g.lineTo(-5.5, 6);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}

export function drawWorldMap(cv, G, target) {
  if (!cv) return;
  const g = cv.getContext("2d");
  const W = cv.width;
  const H = cv.height;
  const x0 = -180;
  const x1 = 180;
  const z0 = -100;
  const z1 = 234;
  const scale = Math.min(W / (x1 - x0), H / (z1 - z0));
  const ox = (W - (x1 - x0) * scale) / 2;
  const oy = (H - (z1 - z0) * scale) / 2;
  const toX = (x) => ox + (x - x0) * scale;
  const toY = (x, z) => oy + (z - z0) * scale;
  g.clearRect(0, 0, W, H);
  drawBase(g, G, (x) => toX(x), (x, z) => toY(x, z), scale, { full: true });
  // region labels (discovered only)
  g.font = `600 ${Math.max(10, Math.round(scale * 4.2))}px Georgia, serif`;
  g.textAlign = "center";
  for (const r of REGIONS) {
    if (!G.P.discovered[r.id] || r.id === "arena" || r.id === "grounds" || r.id === "classrooms") continue;
    const [cx, cz] = r.box ? [(r.box[0] + r.box[1]) / 2, (r.box[2] + r.box[3]) / 2] : [r.circle[0], r.circle[1]];
    g.fillStyle = "rgba(10,8,4,0.6)";
    g.fillText(r.name, toX(cx) + 1, toY(cx, cz) + 1);
    g.fillStyle = "#f2e2b8";
    g.fillText(r.name, toX(cx), toY(cx, cz));
  }
  // npcs
  for (const n of G.npcs) {
    if (n.hidden || n.id.startsWith("student")) continue;
    g.fillStyle = n.companion ? "#ffd27a" : "#9fd8ff";
    g.beginPath();
    g.arc(toX(n.x), toY(n.x, n.z), 3.2, 0, 6.3);
    g.fill();
  }
  // target
  const t = target?.final || target;
  if (t) {
    g.fillStyle = "#ffd25a";
    g.strokeStyle = "#3a2a08";
    g.lineWidth = 2;
    g.beginPath();
    const X = toX(t.x);
    const Y = toY(t.x, t.z);
    g.moveTo(X, Y - 10);
    g.lineTo(X + 7, Y);
    g.lineTo(X, Y + 10);
    g.lineTo(X - 7, Y);
    g.closePath();
    g.fill();
    g.stroke();
  }
  // player
  const p = G.player;
  if (!G.flag("arena")) {
    g.save();
    g.translate(toX(p.x), toY(p.x, p.z));
    g.rotate(Math.PI - p.yaw);
    g.fillStyle = "#fff";
    g.strokeStyle = "#1a1208";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -10);
    g.lineTo(7, 8);
    g.lineTo(0, 4);
    g.lineTo(-7, 8);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}
