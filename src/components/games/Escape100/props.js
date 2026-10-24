/**
 * Escape 100 — interactive 3D objects. Each builder makes a group facing +Z
 * (base at y = 0; wall-mounted things have their back on z = 0) and returns a
 * "visual": { group, hits, size, update(st, s), tick(dt, t), anchors }.
 * `update` receives the engine state and sets animation targets; `tick`
 * eases toward them. Raycast targets carry userData { oid, part }.
 */
import * as THREE from "three";
import { itemModel, gearGeo } from "./models.js";
import { paintClue, GLYPHS, COLORS } from "./art.js";
import { traceBeam } from "./engine.js";

const ease = (cur, target, dt, k = 8) => cur + (target - cur) * Math.min(1, dt * k);

export function makeKit(theme, owned) {
  const cache = new Map();
  const mat = (key, make) => {
    if (!cache.has(key)) {
      const m = make();
      cache.set(key, m);
      owned.push(m);
    }
    return cache.get(key);
  };
  const std = (color, r = 0.6, m = 0, extra = {}) => mat(`s${color}${r}${m}${JSON.stringify(extra)}`, () => new THREE.MeshStandardMaterial({ color, roughness: r, metalness: m, ...extra }));
  const tex = (canvas) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    owned.push(t);
    return t;
  };
  return {
    theme,
    std,
    metal: (c = theme.metal, r = 0.35) => std(c, r, 0.85),
    wood: (c = theme.wood) => std(c, 0.65, 0),
    dark: () => std("#18181c", 0.6, 0.2),
    glow: (c, i = 2) => mat(`g${c}${i}`, () => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.4 })),
    unique: (o) => {
      const m = new THREE.MeshStandardMaterial(o);
      owned.push(m);
      return m;
    },
    tex,
    clueTex: (content, w = 512, h = 384) => tex(paintClue(content, w, h)),
  };
}

function box(w, h, d, m, x = 0, y = 0, z = 0, parent) {
  const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  me.position.set(x, y, z);
  me.castShadow = me.receiveShadow = true;
  parent?.add(me);
  return me;
}
function cyl(rt, rb, h, m, x = 0, y = 0, z = 0, seg = 16, parent) {
  const me = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  me.position.set(x, y, z);
  me.castShadow = me.receiveShadow = true;
  parent?.add(me);
  return me;
}
function plane(w, h, m, x = 0, y = 0, z = 0, parent) {
  const me = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  me.position.set(x, y, z);
  parent?.add(me);
  return me;
}
const tag = (mesh, oid, part = null) => {
  mesh.traverse((n) => {
    if (n.isMesh) n.userData = { ...n.userData, oid, part };
  });
  return mesh;
};

/* glyph/label texture for buttons, dial faces */
function faceCanvas(face, type, size = 128, bg = "#e8e0c8", ink = "#222") {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  g.fillStyle = type === "color" ? COLORS[face] || face : bg;
  g.fillRect(0, 0, size, size);
  if (type === "glyph" && GLYPHS[face]) {
    g.save();
    g.translate(size * 0.15, size * 0.15);
    g.scale((size * 0.7) / 24, (size * 0.7) / 24);
    g.lineWidth = 2.2;
    g.lineCap = g.lineJoin = "round";
    g.strokeStyle = ink;
    g.stroke(new Path2D(GLYPHS[face]));
    g.restore();
  } else if (type !== "color") {
    g.fillStyle = ink;
    g.font = `bold ${size * 0.62}px Georgia, serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(face), size / 2, size / 2 + size * 0.04);
  }
  return c;
}
const faceType = (o) => o.faceType || (o.faces?.every((f) => GLYPHS[f]) ? "glyph" : o.faces?.every((f) => COLORS[f]) ? "color" : "text");

/* ---------------- items shown in the world ---------------- */
function showItem(L, itemId, oid, part) {
  const m = itemModel(L.items[itemId]);
  m.scale.setScalar(1.6);
  tag(m, oid, part);
  return m;
}

/* ================= DOORS ================= */
const DOOR_STYLE = {
  cell: { frame: "#2a2826", leaf: "bars", swing: "slide" },
  gate: { frame: "#2a2826", leaf: "bars", swing: "up" },
  panel: { frame: "#2c180c", leaf: "panel", swing: "hinge", color: "#5a3018" },
  security: { frame: "#3a454c", leaf: "steel", swing: "slide", color: "#8d989f" },
  stone: { frame: "#5a4528", leaf: "stone", swing: "down", color: "#8a7350" },
  blast: { frame: "#333b30", leaf: "steel", swing: "up", color: "#59614f" },
  hotel: { frame: "#1e140c", leaf: "panel", swing: "hinge", color: "#4a2a18" },
  vault: { frame: "#3a2e1e", leaf: "vault", swing: "hinge", color: "#a8843a" },
  airlock: { frame: "#2a3038", leaf: "steel", swing: "split", color: "#c0c8d0" },
  portal: { frame: "#6a4ad0", leaf: "portal", swing: "fade", color: "#b46aff" },
  grand: { frame: "#c9a54a", leaf: "panel", swing: "hinge", color: "#3a2a1a" },
};

export function buildDoor(kit, o, L, theme) {
  const st = DOOR_STYLE[o.style || theme.door] || DOOR_STYLE.panel;
  const g = new THREE.Group();
  const W = 1.25, H = 2.3;
  const frameM = kit.std(st.frame, 0.5, 0.4);
  box(0.14, H + 0.14, 0.18, frameM, -W / 2 - 0.07, (H + 0.14) / 2, 0.02, g);
  box(0.14, H + 0.14, 0.18, frameM, W / 2 + 0.07, (H + 0.14) / 2, 0.02, g);
  box(W + 0.28, 0.14, 0.18, frameM, 0, H + 0.07, 0.02, g);
  // light beyond the door
  const beyond = plane(W, H, kit.unique({ color: "#fff4d8", emissive: "#fff4d8", emissiveIntensity: 0, roughness: 1 }), 0, H / 2, -0.02, g);
  beyond.material.emissiveIntensity = 0;
  const leafPivot = new THREE.Group();
  g.add(leafPivot);
  const leaf = new THREE.Group();
  leafPivot.add(leaf);
  if (st.swing === "hinge") {
    leafPivot.position.set(-W / 2, 0, 0.03);
    leaf.position.set(W / 2, 0, 0);
  } else leafPivot.position.set(0, 0, 0.03);
  const lm = kit.std(st.color || theme.metal, st.leaf === "panel" ? 0.55 : 0.4, st.leaf === "panel" || st.leaf === "stone" ? 0 : 0.7);
  const halves = [];
  if (st.leaf === "bars") {
    const bm = kit.metal(theme.metal, 0.55);
    for (let i = 0; i < 9; i++) cyl(0.022, 0.022, H, bm, -W / 2 + 0.07 + i * ((W - 0.14) / 8), H / 2, 0, 8, leaf);
    for (const y of [0.1, H / 2, H - 0.1]) box(W, 0.08, 0.05, bm, 0, y, 0, leaf);
    box(0.16, 0.24, 0.12, kit.metal("#3a3634"), W / 2 - 0.14, 1.05, 0.04, leaf);
  } else if (st.leaf === "panel") {
    box(W, H, 0.07, lm, 0, H / 2, 0, leaf);
    for (const [x, y, w, h] of [[-0.27, 1.65, 0.42, 0.75], [0.27, 1.65, 0.42, 0.75], [-0.27, 0.6, 0.42, 0.85], [0.27, 0.6, 0.42, 0.85]]) box(w, h, 0.03, kit.std(st.color || "#5a3018", 0.5), x, y, 0.045, leaf);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), kit.metal(theme.metal, 0.25));
    knob.position.set(W / 2 - 0.13, 1.05, 0.09);
    leaf.add(knob);
  } else if (st.leaf === "stone") {
    box(W, H, 0.2, lm, 0, H / 2, 0, leaf);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 8, 32), kit.std("#5a4528", 0.9));
    ring.position.set(0, 1.4, 0.11);
    leaf.add(ring);
  } else if (st.leaf === "vault") {
    box(W, H, 0.12, lm, 0, H / 2, 0, leaf);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.03, 8, 30), kit.metal("#d8c070", 0.25));
    wheel.position.set(0, 1.2, 0.09);
    leaf.add(wheel);
    for (let i = 0; i < 3; i++) box(0.5, 0.03, 0.03, kit.metal("#d8c070", 0.25), 0, 1.2, 0.09, wheel).rotation.z = (i * Math.PI) / 3;
  } else if (st.leaf === "portal") {
    const pm = kit.unique({ color: "#7a3aff", emissive: "#b46aff", emissiveIntensity: 1.2, transparent: true, opacity: 0.85, roughness: 0.2 });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.62, 40), pm);
    disc.position.set(0, H / 2, 0);
    disc.scale.y = 1.85;
    leaf.add(disc);
    leaf.userData.spin = disc;
  } else {
    // steel slabs (security / blast / airlock)
    if (st.swing === "split") {
      for (const s of [-1, 1]) {
        const h = new THREE.Group();
        box(W / 2, H, 0.1, lm, (s * W) / 4, H / 2, 0, h);
        box(0.05, H, 0.11, kit.glow("#ffb02a", 0.6), s > 0 ? 0.03 : -0.03, H / 2, 0.01, h);
        leaf.add(h);
        halves.push([h, s]);
      }
    } else {
      box(W, H, 0.1, lm, 0, H / 2, 0, leaf);
      for (let y = 0.4; y < H; y += 0.5) box(W - 0.1, 0.04, 0.02, kit.std("#000", 0.6, 0.2, { transparent: true, opacity: 0.25 }), 0, y, 0.055, leaf);
      if (st.leaf === "steel") box(W, 0.12, 0.02, kit.std("#e8b520", 0.5), 0, 0.15, 0.06, leaf);
    }
  }
  // lock indicator
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), kit.unique({ color: "#ff3020", emissive: "#ff3020", emissiveIntensity: 2 }));
  lamp.position.set(W / 2 + 0.07, H + 0.07, 0.13);
  g.add(lamp);
  tag(g, o.id);
  beyond.userData = {};
  let open = 0, target = 0, unlocked = false;
  return {
    group: g,
    size: { w: W + 0.3, h: H + 0.2, d: 0.2 },
    focus: { dist: 2.4, y: 1.3 },
    update(s) {
      target = s.open ? 1 : 0;
      unlocked = !s.locked;
      lamp.material.color.set(unlocked ? "#30ff60" : "#ff3020");
      lamp.material.emissive.set(unlocked ? "#30ff60" : "#ff3020");
    },
    tick(dt, t) {
      open = ease(open, target, dt, 1.6);
      beyond.material.emissiveIntensity = open * 2.5;
      if (st.swing === "hinge") leafPivot.rotation.y = -open * 1.6;
      else if (st.swing === "slide") leafPivot.position.x = open * (W + 0.05);
      else if (st.swing === "up") leafPivot.position.y = open * (H - 0.1);
      else if (st.swing === "down") leafPivot.position.y = -open * (H + 0.05);
      else if (st.swing === "split") for (const [h, s] of halves) h.position.x = s * open * (W / 2 + 0.05);
      else if (st.swing === "fade") {
        leaf.scale.setScalar(1 + open * 0.4);
        leaf.children.forEach((c) => c.material && (c.material.opacity = 0.85 * (1 - open)));
      }
      if (leaf.userData.spin) leaf.userData.spin.rotation.z = t * 0.8;
      if (!unlocked) lamp.material.emissiveIntensity = 1.5 + Math.sin(t * 4) * 0.6;
    },
  };
}

/* ================= CONTAINERS ================= */
const CONT = {
  deskDrawer: { w: 0.5, h: 0.16, d: 0.42, type: "drawer" },
  drawer: { w: 0.55, h: 0.2, d: 0.45, type: "drawer", body: true },
  wallCabinet: { w: 0.7, h: 0.6, d: 0.3, type: "door" },
  medicine: { w: 0.55, h: 0.65, d: 0.18, type: "door", mirror: true, color: "#e8ece8" },
  footlocker: { w: 0.9, h: 0.45, d: 0.5, type: "lid", color: "#4a5a3a" },
  chest: { w: 0.85, h: 0.5, d: 0.5, type: "lid", color: "#5a3518" },
  toolbox: { w: 0.6, h: 0.28, d: 0.3, type: "lid", color: "#c0302a" },
  case: { w: 0.55, h: 0.15, d: 0.4, type: "lid", color: "#2a2420" },
  bin: { w: 0.45, h: 0.6, d: 0.45, type: "lid", round: true, color: "#6a6e70" },
  basket: { w: 0.55, h: 0.55, d: 0.55, type: "lid", round: true, color: "#b08a50" },
  washer: { w: 0.7, h: 0.9, d: 0.65, type: "porthole", color: "#e8e8e2" },
  altar: { w: 1.4, h: 1.0, d: 0.7, type: "slide", color: "#8a8478" },
  wallSafe: { w: 0.5, h: 0.5, d: 0.3, type: "door", inset: true, color: "#4a4e52" },
  safe: { w: 0.6, h: 0.75, d: 0.55, type: "door", color: "#3a3e42" },
  coat: { w: 0.6, h: 1.0, d: 0.2, type: "coat", color: "#3a4a5a" },
  locker: { w: 0.55, h: 1.9, d: 0.5, type: "door", color: "#5a6a5a" },
  crate: { w: 0.8, h: 0.6, d: 0.6, type: "lid", color: "#8a6a3a" },
  cabinet: { w: 0.9, h: 0.9, d: 0.45, type: "door" },
  fridge: { w: 0.7, h: 1.7, d: 0.6, type: "door", color: "#dde4e8" },
  box: { w: 0.35, h: 0.22, d: 0.28, type: "lid", color: "#7a4a2a" },
  coffer: { w: 0.5, h: 0.3, d: 0.32, type: "lid", color: "#6a3a1a" },
  urn: { w: 0.5, h: 0.75, d: 0.5, type: "lid", round: true, color: "#9a6a3a" },
  clock: { w: 0.6, h: 2.0, d: 0.35, type: "door", color: "#4a2a14" },
  piano: { w: 1.4, h: 1.1, d: 0.55, type: "lid", color: "#1a1410" },
  sarcophagus: { w: 1.9, h: 0.75, d: 0.8, type: "slide", color: "#b0905a" },
  vent: { w: 0.6, h: 0.4, d: 0.25, type: "door", color: "#8a9096" },
  console: { w: 0.8, h: 0.9, d: 0.55, type: "drawer", body: true, color: "#c0c8d0" },
  panelBox: { w: 0.55, h: 0.55, d: 0.15, type: "door", color: "#7a8288" },
};

export function buildContainer(kit, o, L, theme) {
  const sp = CONT[o.style] || CONT.cabinet;
  const g = new THREE.Group();
  const col = sp.color || theme.wood;
  const body = kit.std(col, sp.mirror ? 0.3 : 0.6, o.style === "safe" || o.style === "wallSafe" || o.style === "locker" || o.style === "toolbox" ? 0.6 : 0);
  const { w, h, d } = sp;
  const mover = new THREE.Group();
  const anchors = [];
  let openTarget = 0, openCur = 0;
  if (sp.type === "drawer") {
    if (sp.body) box(w + 0.06, h + 0.1, d, body, 0, (h + 0.1) / 2, d / 2, g);
    const dr = new THREE.Group();
    box(w, 0.02, d - 0.04, kit.wood(), 0, 0.02, 0, dr);
    box(w, h, 0.03, body, 0, h / 2, d / 2 - 0.02, dr);
    box(0.03, h * 0.8, d - 0.04, kit.wood(), -w / 2 + 0.015, h / 2, 0, dr);
    box(0.03, h * 0.8, d - 0.04, kit.wood(), w / 2 - 0.015, h / 2, 0, dr);
    box(0.14, 0.025, 0.03, kit.metal(), 0, h / 2, d / 2 + 0.01, dr);
    dr.position.set(0, sp.body ? 0.05 : 0, d / 2);
    mover.add(dr);
    g.add(mover);
    anchors.push(new THREE.Vector3(-0.1, 0.06, 0), new THREE.Vector3(0.1, 0.06, 0));
    anchors.forEach((a) => a.add(dr.position));
    mover.userData.apply = (k) => (mover.position.z = k * d * 0.75);
  } else if (sp.type === "lid") {
    if (sp.round) {
      const c = cyl(w / 2, w / 2.3, h, body, 0, h / 2, d / 2, 18, g);
      if (o.style === "basket") c.material = kit.std(col, 0.95);
      const lid = new THREE.Group();
      lid.position.set(-w / 2, h, d / 2);
      cyl(w / 2 + 0.02, w / 2 + 0.02, 0.04, body, w / 2, 0.02, 0, 18, lid);
      cyl(0.04, 0.04, 0.05, kit.metal(), w / 2, 0.06, 0, 8, lid);
      mover.add(lid);
      g.add(mover);
      mover.userData.apply = (k) => (lid.rotation.z = k * 2.2);
      anchors.push(new THREE.Vector3(-0.07, h - 0.05, d / 2), new THREE.Vector3(0.08, h - 0.05, d / 2));
    } else {
      box(w, h, d, body, 0, h / 2, d / 2, g);
      box(w - 0.06, 0.02, d - 0.06, kit.std("#1a1612", 0.9), 0, h + 0.001, d / 2, g);
      const lid = new THREE.Group();
      lid.position.set(0, h, 0.02);
      box(w + 0.02, 0.06, d + 0.02, body, 0, 0.03, d / 2 - 0.01, lid);
      box(0.1, 0.05, 0.03, kit.metal(), 0, -0.01, d, lid);
      mover.add(lid);
      g.add(mover);
      for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) box(0.03, h - 0.04, 0.03, kit.metal(theme.metal, 0.5), x, h / 2, d + 0.005, g);
      mover.userData.apply = (k) => (lid.rotation.x = -k * 1.9);
      anchors.push(new THREE.Vector3(-w * 0.2, h - 0.06, d / 2), new THREE.Vector3(w * 0.2, h - 0.06, d / 2));
    }
  } else if (sp.type === "door" || sp.type === "porthole") {
    // box with a hinged front
    const back = sp.inset ? 0 : 0;
    box(w, h, 0.02, body, 0, h / 2, back + 0.01, g);
    box(0.02, h, d, body, -w / 2 + 0.01, h / 2, d / 2, g);
    box(0.02, h, d, body, w / 2 - 0.01, h / 2, d / 2, g);
    box(w, 0.02, d, body, 0, 0.01, d / 2, g);
    box(w, 0.02, d, body, 0, h - 0.01, d / 2, g);
    box(w - 0.04, 0.015, d - 0.04, body, 0, h * 0.45, d / 2, g);
    box(w - 0.04, h - 0.04, 0.01, kit.std("#141210", 0.9), 0, h / 2, 0.025, g);
    const hinge = new THREE.Group();
    hinge.position.set(-w / 2, 0, d);
    if (sp.type === "porthole") {
      box(w, h, 0.03, body, w / 2, h / 2, 0, hinge);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 28), kit.metal("#aab"));
      ring.position.set(w / 2, h * 0.55, 0.03);
      hinge.add(ring);
      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.19, 28), kit.std("#203040", 0.1, 0.2, { transparent: true, opacity: 0.6 }));
      glass.position.set(w / 2, h * 0.55, 0.031);
      hinge.add(glass);
    } else {
      box(w, h, 0.03, sp.mirror ? kit.std("#cfdde2", 0.05, 0.9) : body, w / 2, h / 2, 0, hinge);
      if (!sp.mirror && h > 0.4) box(w - 0.12, h - 0.12, 0.02, kit.std(col, 0.5), w / 2, h / 2, 0.02, hinge);
      if (o.style === "wallSafe" || o.style === "safe") {
        const dialM = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 20), kit.metal("#ccc", 0.25));
        dialM.rotation.x = Math.PI / 2;
        dialM.position.set(w / 2, h / 2, 0.03);
        hinge.add(dialM);
      }
      if (o.style === "clock") {
        const face = new THREE.Mesh(new THREE.CircleGeometry(0.22, 32), kit.std("#efe6cf", 0.6));
        face.position.set(w / 2, h - 0.35, 0.025);
        hinge.add(face);
      }
      box(0.03, 0.12, 0.03, kit.metal(), w - 0.07, h / 2, 0.03, hinge);
    }
    mover.add(hinge);
    g.add(mover);
    mover.userData.apply = (k) => (hinge.rotation.y = -k * 1.8);
    const ay = Math.min(h * 0.46, h - 0.12) + 0.05;
    anchors.push(new THREE.Vector3(-w * 0.18, Math.max(0.06, ay), d * 0.5), new THREE.Vector3(w * 0.18, Math.max(0.06, ay), d * 0.5));
  } else if (sp.type === "slide") {
    box(w, h, d, body, 0, h / 2, d / 2, g);
    box(w + 0.1, 0.08, d + 0.1, kit.std(col, 0.8), 0, h + 0.04, d / 2, g);
    const panel = new THREE.Group();
    box(w * 0.4, h * 0.45, 0.04, kit.std(col, 0.95), 0, h * 0.5, d + 0.02, panel);
    mover.add(panel);
    g.add(mover);
    box(w * 0.38, h * 0.43, 0.02, kit.std("#120e0a", 0.9), 0, h * 0.5, d - 0.005, g);
    mover.userData.apply = (k) => (panel.position.x = k * w * 0.42);
    anchors.push(new THREE.Vector3(-0.08, h * 0.32, d - 0.08), new THREE.Vector3(0.08, h * 0.32, d - 0.08));
  } else if (sp.type === "coat") {
    const cm = kit.std(col, 0.9);
    box(0.06, 0.06, 0.08, kit.metal(), 0, h, 0.04, g);
    const coatG = new THREE.Group();
    box(w, h * 0.85, 0.14, cm, 0, h * 0.5, 0.1, coatG);
    box(w * 0.3, h * 0.2, 0.15, cm, -w * 0.62, h * 0.65, 0.1, coatG).rotation.z = 0.25;
    box(w * 0.3, h * 0.2, 0.15, cm, w * 0.62, h * 0.65, 0.1, coatG).rotation.z = -0.25;
    const pocket = new THREE.Group();
    box(0.2, 0.06, 0.02, kit.std("#2a3a4a", 0.9), 0.16, h * 0.35, 0.18, pocket);
    coatG.add(pocket);
    for (let i = 0; i < 4; i++) cyl(0.015, 0.015, 0.01, kit.metal("#c9a14a"), 0, h * 0.25 + i * 0.15, 0.18, 8, coatG).rotation.x = Math.PI / 2;
    g.add(coatG);
    mover.add(pocket);
    mover.userData.apply = (k) => (pocket.rotation.x = -k * 1.2);
    anchors.push(new THREE.Vector3(0.16, h * 0.28, 0.26), new THREE.Vector3(-0.12, h * 0.28, 0.26));
  }
  const itemsG = new THREE.Group();
  g.add(itemsG);
  tag(g, o.id);
  let lastKey = "";
  return {
    group: g,
    size: { w: w + 0.1, h, d: d + 0.1 },
    focus: { dist: Math.max(1.0, w * 1.6 + 0.4), y: h * 0.6 },
    update(s) {
      openTarget = s.open ? 1 : 0;
      const key = s.open + "|" + s.contents.join(",");
      if (key === lastKey) return;
      lastKey = key;
      itemsG.clear();
      if (s.open)
        s.contents.forEach((it, i) => {
          const m = showItem(L, it, o.id, "item:" + it);
          const a = anchors[i % anchors.length].clone();
          if (i >= anchors.length) a.z -= 0.08;
          m.position.copy(a);
          m.rotation.y = 0.4 + i;
          if (sp.type === "drawer") m.userData.followDrawer = true;
          itemsG.add(m);
        });
    },
    tick(dt) {
      openCur = ease(openCur, openTarget, dt, 5);
      mover.userData.apply?.(openCur);
      if (sp.type === "drawer") itemsG.position.z = mover.position.z;
    },
  };
}

/* ================= PICKUP ================= */
export function buildPickup(kit, o, L) {
  const g = new THREE.Group();
  const m = showItem(L, o.item, o.id, null);
  m.position.y = 0.05;
  g.add(m);
  // thin items (keys, cranks…) get a generous invisible hit area so taps don't slip through
  const hit = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = 0.05;
  hit.userData = { oid: o.id, part: null, noHilite: true };
  g.add(hit);
  const sparkle = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), kit.glow("#fff6d0", 3));
  sparkle.position.set(0.05, 0.12, 0.05);
  g.add(sparkle);
  return {
    group: g,
    size: { w: 0.3, h: 0.2, d: 0.2 },
    focus: { dist: 0.8, y: 0.05 },
    update() {},
    tick(dt, t) {
      m.rotation.y = Math.sin(t * 0.8) * 0.3;
      sparkle.scale.setScalar(0.5 + Math.abs(Math.sin(t * 3)) * 1.2);
    },
  };
}

/* ================= KEYPAD ================= */
export function buildKeypad(kit, o) {
  const g = new THREE.Group();
  const stoneLike = o.style === "stone" || o.glyphs === "symbols";
  const plate = stoneLike ? kit.std("#8a7a5e", 0.95) : kit.std("#2a2e33", 0.4, 0.6);
  box(0.26, 0.36, 0.04, plate, 0, 0, 0.02, g);
  const screen = box(0.2, 0.06, 0.01, kit.unique({ color: "#08140c", emissive: "#ff3020", emissiveIntensity: 0.35 }), 0, 0.12, 0.045, g);
  const keyM = stoneLike ? kit.std("#a8987a", 0.9) : kit.std("#cfd4d8", 0.35, 0.5);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) box(0.05, 0.04, 0.02, keyM, -0.065 + c * 0.065, 0.045 - r * 0.052, 0.05, g);
  tag(g, o.id);
  let solved = false;
  return {
    group: g,
    size: { w: 0.3, h: 0.4, d: 0.06 },
    focus: { dist: 0.75, y: 0 },
    update(s) {
      solved = s.solved;
      screen.material.emissive.set(solved ? "#30ff60" : "#ff3020");
    },
    tick(dt, t) {
      screen.material.emissiveIntensity = solved ? 1.4 : 0.35 + Math.abs(Math.sin(t * 2)) * 0.4;
    },
  };
}

/* ================= SWITCH / LEVER ================= */
export function buildSwitch(kit, o, L, theme) {
  const g = new THREE.Group();
  const arm = new THREE.Group();
  let cur = 0, target = 0;
  if (o.style === "toggle") {
    box(0.12, 0.18, 0.02, kit.std("#d8d4c8", 0.5), 0, 0, 0.01, g);
    box(0.03, 0.08, 0.03, kit.std("#2a2a2a", 0.4), 0, 0.03, 0, arm);
    arm.position.set(0, 0, 0.03);
  } else {
    box(0.16, 0.34, 0.06, kit.metal(theme.metal, 0.5), 0, 0, 0.03, g);
    box(0.06, 0.26, 0.02, kit.std("#111", 0.8), 0, 0, 0.065, g);
    cyl(0.012, 0.012, 0.28, kit.metal("#aaa", 0.3), 0, 0.14, 0, 8, arm);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), kit.std("#c0302a", 0.4));
    knob.position.y = 0.29;
    arm.add(knob);
    arm.position.set(0, 0, 0.08);
  }
  g.add(arm);
  if (o.num != null) {
    const lbl = plane(0.08, 0.08, new THREE.MeshBasicMaterial({ map: kit.tex(faceCanvas(o.num, "text", 64, "#e8e0c8", "#222")) }), 0, -0.22, 0.062, g);
    lbl.userData = {};
  }
  tag(g, o.id);
  return {
    group: g,
    size: { w: 0.24, h: 0.5, d: 0.1 },
    focus: { dist: 0.9, y: 0 },
    update(s) {
      target = s.on ? 1 : 0;
    },
    tick(dt) {
      cur = ease(cur, target, dt, 10);
      // toggle flips around its pivot; a lever swings from down (off) to up (on)
      arm.rotation.x = o.style === "toggle" ? (0.5 - cur) * 1.2 : Math.PI - 0.6 - cur * (Math.PI - 1.2);
    },
  };
}

/* ================= DIAL ================= */
export function buildDial(kit, o, L, theme) {
  const g = new THREE.Group();
  const n = o.faces.length, ft = faceType(o);
  const rot = new THREE.Group();
  let cur = 0, target = 0;
  if (o.style === "disc" || o.style === "valve") {
    // stone/brass disc turning around its face normal; faces around the rim, marker on top
    const R = o.style === "valve" ? 0.2 : 0.24;
    const disc = cyl(R, R, 0.06, o.style === "valve" ? kit.std("#c0302a", 0.4, 0.4) : kit.std("#9a8a6a", 0.95), 0, 0, 0, 32, rot);
    disc.rotation.x = Math.PI / 2;
    o.faces.forEach((f, i) => {
      const a = (i / n) * Math.PI * 2;
      const p = plane(R * 0.42, R * 0.42, new THREE.MeshStandardMaterial({ map: kit.tex(faceCanvas(f, ft, 96, "#c8b88a", "#2d2213")), roughness: 0.9 }), Math.sin(a) * R * 0.68, Math.cos(a) * R * 0.68, 0.032, rot);
      p.rotation.z = -a;
    });
    rot.position.z = 0.06;
    g.add(rot);
    box(R * 2 + 0.1, R * 2 + 0.1, 0.03, kit.std(theme.trim, 0.8), 0, 0, 0.015, g);
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 3), kit.glow("#ffcf60", 1.2));
    marker.rotation.z = Math.PI;
    marker.position.set(0, R + 0.06, 0.08);
    g.add(marker);
  } else if (o.style === "statue") {
    // floor statue that turns to face one of n directions
    box(0.5, 0.4, 0.5, kit.std("#8a7a5e", 0.95), 0, 0.2, 0, g);
    const body = new THREE.Group();
    cyl(0.14, 0.2, 0.8, kit.std("#a8987a", 0.9), 0, 0.8, 0, 12, body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), kit.std("#a8987a", 0.9));
    head.position.y = 1.32;
    body.add(head);
    const nose = box(0.06, 0.06, 0.12, kit.std("#8a7a5e", 0.9), 0, 1.32, 0.15, body);
    const arm = box(0.08, 0.08, 0.45, kit.std("#a8987a", 0.9), 0.12, 1.0, 0.22, body);
    void nose;
    void arm;
    rot.add(body);
    g.add(rot);
  } else {
    // drum wheel: axis along X, faces around the rim, read through a window at the front
    const R = 0.12, Wd = 0.12;
    const drum = cyl(R, R, Wd, kit.std("#d8d0b8", 0.6), 0, 0, 0, 24, rot);
    drum.rotation.z = Math.PI / 2;
    o.faces.forEach((f, i) => {
      const a = (i / n) * Math.PI * 2;
      const p = plane(Wd * 0.85, ((2 * Math.PI * R) / n) * 0.8, new THREE.MeshStandardMaterial({ map: kit.tex(faceCanvas(f, ft, 96)), roughness: 0.6 }), 0, Math.sin(a) * (R + 0.002), Math.cos(a) * (R + 0.002), rot);
      p.rotation.x = -a;
    });
    rot.position.z = R + 0.03;
    g.add(rot);
    const housing = kit.metal(theme.metal, 0.45);
    box(0.04, 0.3, 0.3, housing, -Wd / 2 - 0.03, 0, R + 0.03, g);
    box(0.04, 0.3, 0.3, housing, Wd / 2 + 0.03, 0, R + 0.03, g);
    box(Wd + 0.1, 0.3, 0.03, housing, 0, 0, 0.015, g);
    const win = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 4), kit.glow("#ffcf60", 0.8));
    win.rotation.z = Math.PI / 4;
    win.position.set(0, 0, 2 * R + 0.045);
    win.scale.set(1.3, 1.3, 1);
    g.add(win);
  }
  tag(g, o.id);
  const step = (Math.PI * 2) / n;
  return {
    group: g,
    size: o.style === "statue" ? { w: 0.6, h: 1.5, d: 0.6 } : { w: 0.7, h: 0.7, d: 0.3 },
    focus: { dist: o.style === "statue" ? 2.0 : 1.0, y: o.style === "statue" ? 1.0 : 0 },
    update(s) {
      // unwrap so the wheel always turns forward
      let t = s.value * step;
      while (t < target - 1e-6 - step * 0.01 && target - t > Math.PI) t += Math.PI * 2;
      target = t < target - Math.PI ? t + Math.PI * 2 : t;
    },
    tick(dt) {
      cur = ease(cur, target, dt, 9);
      if (o.style === "disc" || o.style === "valve") rot.rotation.z = -cur;
      else if (o.style === "statue") rot.rotation.y = -cur;
      else rot.rotation.x = cur;
    },
  };
}

/* ================= BUTTONS (sequence / memory) ================= */
export function buildButtons(kit, o, L, theme) {
  const g = new THREE.Group();
  const n = o.buttons.length;
  const presses = new Map();
  const bells = o.style === "bells";
  const spacing = bells ? 0.42 : 0.2;
  const W = n * spacing + 0.15;
  if (!bells) box(W, 0.36, 0.04, kit.std(theme.trim, 0.6, 0.3), 0, 0, 0.02, g);
  else box(W, 0.06, 0.12, kit.wood(), 0, 0.5, 0.08, g);
  o.buttons.forEach((b, i) => {
    const x = (i - (n - 1) / 2) * spacing;
    const ft = b.glyph ? "glyph" : b.color ? "color" : "text";
    const face = b.glyph || b.color || b.label || String(i + 1);
    const bt = new THREE.Group();
    if (bells) {
      const bm = kit.metal(b.color ? COLORS[b.color] : "#c9a14a", 0.25);
      const bell = cyl(0.06, 0.15, 0.22, bm, 0, 0, 0, 20);
      bell.material = bm;
      bt.add(bell);
      cyl(0.01, 0.01, 0.18, kit.std("#3a2a1a"), 0, 0.2, 0, 6, bt);
      const lab = plane(0.13, 0.13, new THREE.MeshStandardMaterial({ map: kit.tex(faceCanvas(face, ft, 96)), roughness: 0.6 }), 0, 0, 0.14, bt);
      lab.rotation.x = -0.12;
      bt.position.set(x, 0.18, 0.12);
    } else {
      cyl(0.065, 0.075, 0.05, kit.std("#222", 0.5), 0, 0, 0, 20, bt).rotation.x = Math.PI / 2;
      const cap = cyl(0.06, 0.06, 0.03, new THREE.MeshStandardMaterial({ map: kit.tex(faceCanvas(face, ft, 96)), roughness: 0.4 }), 0, 0, 0.035, 24, bt);
      cap.rotation.x = Math.PI / 2;
      bt.position.set(x, 0, 0.05);
    }
    tag(bt, o.id, b.id);
    g.add(bt);
    presses.set(b.id, { g: bt, base: bt.position.clone(), t: 0 });
  });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), kit.unique({ color: "#ff3020", emissive: "#ff3020", emissiveIntensity: 1 }));
  lamp.position.set(W / 2 - 0.05, bells ? 0.62 : 0.14, 0.06);
  g.add(lamp);
  tag(g, o.id);
  // restore part tags on buttons (tag(g) overwrote them)
  for (const [id, p] of presses) tag(p.g, o.id, id);
  let solved = false;
  return {
    group: g,
    size: { w: W, h: bells ? 0.8 : 0.4, d: 0.2 },
    focus: { dist: Math.max(1.0, W * 1.3), y: bells ? 0.3 : 0 },
    press(b) {
      const p = presses.get(b);
      if (p) p.t = 1;
    },
    update(s) {
      solved = s.solved;
      lamp.material.color.set(solved ? "#30ff60" : "#ff3020");
      lamp.material.emissive.set(solved ? "#30ff60" : "#ff3020");
    },
    tick(dt, t) {
      for (const p of presses.values()) {
        p.t = Math.max(0, p.t - dt * 3);
        if (bells) p.g.rotation.z = Math.sin(p.t * 18) * p.t * 0.5;
        else p.g.position.z = p.base.z - p.t * 0.025;
      }
      if (!solved) lamp.material.emissiveIntensity = 0.6 + Math.abs(Math.sin(t * 2)) * 0.6;
    },
  };
}

/* ================= SLOT (socket / pedestal / plate / reader…) ================= */
export function buildSlot(kit, o, L, theme) {
  const g = new THREE.Group();
  const anchor = new THREE.Group();
  let size = { w: 0.4, h: 0.4, d: 0.2 }, focus = { dist: 0.9, y: 0 };
  const glowM = kit.unique({ color: "#333", emissive: "#ff9a30", emissiveIntensity: 0.2 });
  switch (o.style) {
    case "fusebox": {
      box(0.4, 0.5, 0.12, kit.std("#7a8288", 0.5, 0.5), 0, 0, 0.06, g);
      box(0.34, 0.44, 0.01, kit.std("#1a1c1e", 0.6), 0, 0, 0.125, g);
      for (let i = 0; i < 3; i++) {
        box(0.07, 0.12, 0.03, kit.std("#3a3a3a", 0.5), -0.1 + i * 0.1, 0.08, 0.135, g);
        if (i !== 1) {
          const f = itemModel(L.items.fuse || { model: "fuse", color: "#ccc" });
          f.rotation.z = Math.PI / 2;
          f.position.set(-0.1 + i * 0.1, 0.08, 0.16);
          g.add(f);
        }
      }
      anchor.position.set(0, 0.08, 0.16);
      anchor.rotation.z = Math.PI / 2;
      box(0.3, 0.04, 0.01, glowM, 0, -0.14, 0.13, g);
      size = { w: 0.44, h: 0.55, d: 0.14 };
      break;
    }
    case "cardReader":
      box(0.14, 0.24, 0.05, kit.std("#2a2e33", 0.4, 0.6), 0, 0, 0.025, g);
      box(0.1, 0.012, 0.02, kit.std("#000", 0.5), 0, 0.04, 0.055, g);
      box(0.06, 0.03, 0.01, glowM, 0, -0.06, 0.052, g);
      anchor.position.set(0, 0.07, 0.07);
      anchor.rotation.x = Math.PI / 2;
      size = { w: 0.2, h: 0.3, d: 0.06 };
      focus = { dist: 0.6, y: 0 };
      break;
    case "crankSocket":
      box(0.3, 0.3, 0.1, kit.metal(theme.metal, 0.5), 0, 0, 0.05, g);
      cyl(0.04, 0.04, 0.04, kit.std("#111"), 0, 0, 0.11, 12, g).rotation.x = Math.PI / 2;
      anchor.position.set(0, 0, 0.14);
      anchor.rotation.y = -Math.PI / 2;
      break;
    case "pedestal":
      cyl(0.18, 0.22, 1.0, kit.std(o.color || "#8a7a5e", 0.85), 0, 0.5, 0, 16, g);
      cyl(0.22, 0.22, 0.06, kit.std(o.color || "#7a6a4e", 0.85), 0, 1.03, 0, 16, g);
      box(0.2, 0.01, 0.2, glowM, 0, 1.065, 0, g);
      anchor.position.set(0, 1.13, 0);
      size = { w: 0.5, h: 1.1, d: 0.5 };
      focus = { dist: 1.2, y: 1.0 };
      break;
    case "plate":
      cyl(0.32, 0.34, 0.05, kit.std("#6a5a40", 0.9), 0, 0.025, 0, 24, g);
      cyl(0.26, 0.26, 0.02, glowM, 0, 0.055, 0, 24, g);
      anchor.position.set(0, 0.11, 0);
      size = { w: 0.7, h: 0.1, d: 0.7 };
      focus = { dist: 1.3, y: 0.1 };
      break;
    case "peg":
      box(0.32, 0.32, 0.03, kit.std(theme.trim, 0.7, 0.3), 0, 0, 0.015, g);
      cyl(0.015, 0.015, 0.08, kit.metal("#aaa"), 0, 0, 0.06, 8, g).rotation.x = Math.PI / 2;
      anchor.position.set(0, 0, 0.06);
      break;
    case "scale":
      cyl(0.3, 0.3, 0.03, kit.metal(theme.metal, 0.3), 0, 0.02, 0, 24, g);
      anchor.position.set(0, 0.08, 0);
      size = { w: 0.65, h: 0.1, d: 0.65 };
      focus = { dist: 1.0, y: 0.1 };
      break;
    case "holder":
      box(0.24, 0.06, 0.16, kit.metal(theme.metal, 0.4), 0, -0.06, 0.08, g);
      box(0.24, 0.22, 0.02, kit.metal(theme.metal, 0.4), 0, 0.04, 0.01, g);
      anchor.position.set(0, 0.02, 0.1);
      break;
    case "lamp":
      cyl(0.08, 0.1, 0.12, kit.metal(theme.metal, 0.4), 0, 0, 0.06, 12, g).rotation.x = Math.PI / 2;
      anchor.position.set(0, 0, 0.18);
      break;
    default:
      box(0.32, 0.32, 0.06, kit.std(theme.trim, 0.6, 0.4), 0, 0, 0.03, g);
      box(0.2, 0.2, 0.02, kit.std("#0e0e10", 0.8), 0, 0, 0.065, g);
      box(0.2, 0.02, 0.01, glowM, 0, -0.13, 0.065, g);
      anchor.position.set(0, 0, 0.1);
  }
  g.add(anchor);
  tag(g, o.id);
  let last = undefined;
  return {
    group: g,
    size,
    focus,
    update(s) {
      glowM.emissive.set(s.placed ? "#30ff60" : "#ff9a30");
      glowM.emissiveIntensity = s.placed ? 1.2 : 0.35;
      if (s.placed === last) return;
      last = s.placed;
      anchor.clear();
      if (s.placed) {
        const m = showItem(L, s.placed, o.id, null);
        m.scale.setScalar(o.style === "pedestal" || o.style === "plate" || o.style === "scale" ? 2 : 1.4);
        anchor.add(m);
      }
    },
    tick() {},
  };
}

/* ================= MOVABLE ================= */
export function buildMovable(kit, o, L, theme) {
  const g = new THREE.Group();
  const mover = new THREE.Group();
  let moveFn = () => {};
  let size = { w: 0.5, h: 0.5, d: 0.2 }, focus = { dist: 1.0, y: 0 };
  switch (o.style) {
    case "brick": {
      box(0.32, 0.14, 0.12, kit.std("#7a6a5a", 0.95), 0, 0, 0.04, mover);
      box(0.36, 0.18, 0.02, kit.std("#0c0a08", 1), 0, 0, 0.0, g);
      moveFn = (k) => {
        mover.position.z = k * 0.35;
        mover.position.y = -k * 0.9;
        mover.rotation.x = k * 0.8;
      };
      size = { w: 0.4, h: 0.2, d: 0.15 };
      focus = { dist: 0.8, y: 0 };
      break;
    }
    case "tray":
      box(0.45, 0.025, 0.32, kit.metal("#9aa0a6", 0.4), 0, 0.012, 0, mover);
      for (const [x, z, c] of [[-0.1, 0, "#c8a060"], [0.1, 0.05, "#6a8a3a"]]) cyl(0.07, 0.06, 0.03, kit.std(c, 0.8), x, 0.04, z, 12, mover);
      moveFn = (k) => {
        mover.position.x = k * 0.5;
        mover.rotation.y = k * 0.6;
      };
      size = { w: 0.5, h: 0.1, d: 0.35 };
      focus = { dist: 0.9, y: 0.05 };
      break;
    case "painting":
    case "poster": {
      const frame = kit.std(theme.trim === "#2c2a27" ? "#4a3a24" : "#6a4a1e", 0.5, 0.3);
      box(0.8, 1.0, 0.05, frame, 0, 0, 0.025, mover);
      const art = plane(0.66, 0.86, new THREE.MeshStandardMaterial({ map: kit.tex(o.canvas || paintClue({ style: "card", title: o.title || "", big: o.big || "" }, 256, 320)), roughness: 0.7 }), 0, 0, 0.052, mover);
      if (!o.canvas && !o.big) {
        // a stern portrait
        art.material.map = kit.tex(portraitCanvas(o.seed ?? 1));
      }
      moveFn = (k) => {
        mover.rotation.y = k * 1.2;
        mover.position.x = k * 0.35;
        mover.position.z = k * 0.25;
      };
      size = { w: 0.85, h: 1.05, d: 0.08 };
      focus = { dist: 1.3, y: 0 };
      break;
    }
    case "crate":
      box(0.8, 0.8, 0.8, kit.std("#8a6a3a", 0.85), 0, 0.4, 0.4, mover);
      for (const y of [0.1, 0.7]) box(0.82, 0.08, 0.82, kit.std("#6a4a22", 0.85), 0, y, 0.4, mover);
      moveFn = (k) => (mover.position.x = k * 1.0);
      size = { w: 0.85, h: 0.8, d: 0.85 };
      focus = { dist: 1.6, y: 0.4 };
      break;
    case "vent":
      box(0.5, 0.36, 0.02, kit.std("#0a0a0a", 1), 0, 0, 0.0, g);
      box(0.5, 0.36, 0.03, kit.metal("#8a9096", 0.4), 0, 0, 0.02, mover);
      for (let i = 0; i < 6; i++) box(0.44, 0.02, 0.02, kit.std("#3a3e42", 0.5), 0, -0.13 + i * 0.052, 0.04, mover);
      for (const [x, y] of [[-0.22, 0.15], [0.22, 0.15], [-0.22, -0.15], [0.22, -0.15]]) cyl(0.012, 0.012, 0.02, kit.metal("#ccc"), x, y, 0.04, 6, mover).rotation.x = Math.PI / 2;
      moveFn = (k) => {
        mover.position.y = -k * 0.4;
        mover.position.z = k * 0.4;
        mover.rotation.x = -k * 1.4;
      };
      size = { w: 0.55, h: 0.4, d: 0.06 };
      focus = { dist: 0.9, y: 0 };
      break;
    case "rug":
      box(1.6, 0.012, 1.1, kit.std("#7a2a2a", 0.95), 0, 0.006, 0, mover);
      box(1.4, 0.014, 0.9, kit.std("#b08a3a", 0.95), 0, 0.007, 0, mover);
      moveFn = (k) => {
        mover.position.x = k * 0.9;
        mover.scale.x = 1 - k * 0.45;
      };
      size = { w: 1.6, h: 0.02, d: 1.1 };
      focus = { dist: 1.8, y: 0 };
      break;
    case "plank":
      box(0.9, 0.18, 0.04, kit.std("#6a4a2a", 0.9), 0, 0, 0.02, mover).rotation.z = 0.1;
      moveFn = (k) => {
        mover.position.y = -k * 0.8;
        mover.rotation.z = k * 1.2;
      };
      size = { w: 0.9, h: 0.25, d: 0.05 };
      break;
    case "books":
      for (let i = 0; i < 5; i++) box(0.06, 0.24, 0.18, kit.std(["#7a2a2a", "#2a4a7a", "#2a6a3a", "#6a5a2a", "#4a2a5a"][i], 0.8), -0.12 + i * 0.065, 0.12, 0.09, mover);
      moveFn = (k) => (mover.position.x = k * 0.4);
      size = { w: 0.35, h: 0.25, d: 0.2 };
      break;
    case "curtain":
      box(1.2, 1.8, 0.04, kit.std("#6a1a2a", 0.95), 0, 0, 0.05, mover);
      moveFn = (k) => {
        mover.scale.x = 1 - k * 0.8;
        mover.position.x = -k * 0.5;
      };
      size = { w: 1.2, h: 1.8, d: 0.08 };
      focus = { dist: 1.8, y: 0 };
      break;
    case "tile":
      box(0.5, 0.04, 0.5, kit.std("#8a7a5e", 0.95), 0, 0.02, 0, mover);
      box(0.52, 0.01, 0.52, kit.std("#0a0806", 1), 0, 0.002, 0, g);
      moveFn = (k) => {
        mover.position.x = k * 0.55;
        mover.position.y = k * 0.02;
      };
      size = { w: 0.55, h: 0.05, d: 0.55 };
      focus = { dist: 1.1, y: 0 };
      break;
    case "panel":
    default:
      box(0.5, 0.5, 0.03, kit.std(theme.trim, 0.5, 0.5), 0, 0, 0.02, mover);
      for (const [x, y] of [[-0.21, 0.21], [0.21, 0.21], [-0.21, -0.21], [0.21, -0.21]]) cyl(0.012, 0.012, 0.02, kit.metal("#ccc"), x, y, 0.04, 6, mover).rotation.x = Math.PI / 2;
      box(0.46, 0.46, 0.02, kit.std("#08080a", 1), 0, 0, 0.0, g);
      moveFn = (k) => {
        mover.position.x = k * 0.55;
        mover.rotation.y = k * 0.3;
      };
      size = { w: 0.55, h: 0.55, d: 0.05 };
  }
  g.add(mover);
  tag(g, o.id);
  let cur = 0, target = 0;
  return {
    group: g,
    size,
    focus,
    update(s) {
      target = s.moved ? 1 : 0;
    },
    tick(dt) {
      cur = ease(cur, target, dt, 4);
      moveFn(cur);
    },
  };
}

function portraitCanvas(seed) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 320;
  const g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 320);
  bg.addColorStop(0, "#2a2018");
  bg.addColorStop(1, "#0e0a06");
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 320);
  g.fillStyle = ["#2a2a3a", "#3a1a1a", "#1a2a1a"][seed % 3];
  g.beginPath();
  g.ellipse(128, 300, 100, 110, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#c8a080";
  g.beginPath();
  g.ellipse(128, 140, 52, 66, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#3a2a1a";
  g.beginPath();
  g.ellipse(128, 92, 56, 30, 0, Math.PI, 0);
  g.fill();
  g.fillStyle = "#1a1008";
  for (const x of [108, 148]) {
    g.beginPath();
    g.arc(x, 136, 5, 0, 7);
    g.fill();
  }
  g.fillRect(110, 176, 36, 4);
  return c;
}

/* ================= CLUE ================= */
const CLUE_SHAPE = {
  carving: { w: 0.7, h: 0.55, frame: "#5a4a32", depth: 0.04 },
  sign: { w: 0.7, h: 0.5, frame: "#222", depth: 0.03 },
  poster: { w: 0.6, h: 0.8, frame: null, depth: 0.005 },
  note: { w: 0.32, h: 0.26, frame: null, depth: 0.004, pin: true },
  tableCarving: { w: 0.42, h: 0.3, frame: null, depth: 0.003, flat: true },
  stainedGlass: { w: 0.9, h: 1.1, frame: "#2a2a2a", depth: 0.05, glow: true },
  calendar: { w: 0.45, h: 0.55, frame: null, depth: 0.01, pin: true },
  plaque: { w: 0.5, h: 0.3, frame: "#6d5220", depth: 0.02 },
  monitor: { w: 0.5, h: 0.36, frame: "#1a1c1e", depth: 0.06, stand: true, glow: true },
  screen: { w: 0.9, h: 0.55, frame: "#1a1c1e", depth: 0.05, glow: true },
  chalkboard: { w: 1.2, h: 0.8, frame: "#6b4a2a", depth: 0.04 },
  book: { w: 0.45, h: 0.32, frame: null, depth: 0.03, flat: true, stand: true },
  mirror: { w: 0.7, h: 0.95, frame: "#b8954a", depth: 0.04 },
  painting: { w: 0.8, h: 0.62, frame: "#6a4a1e", depth: 0.05 },
  holo: { w: 0.7, h: 0.5, frame: null, depth: 0.0, glow: true, holo: true },
  floor: { w: 0.8, h: 0.6, frame: null, depth: 0.003, flat: true },
  tag: { w: 0.18, h: 0.12, frame: null, depth: 0.004 },
};

export function buildClue(kit, o) {
  const sp = CLUE_SHAPE[o.style] || CLUE_SHAPE.sign;
  const g = new THREE.Group();
  const aspect = sp.w / sp.h;
  const tex = kit.clueTex(o.content, 512, Math.round(512 / aspect));
  const glow = sp.glow || ["screen", "holo", "neon"].includes(o.content.style);
  const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, emissive: glow ? "#ffffff" : "#000000", emissiveMap: glow ? tex : null, emissiveIntensity: glow ? 0.8 : 0, transparent: !!sp.holo, opacity: sp.holo ? 0.9 : 1, side: sp.holo ? THREE.DoubleSide : THREE.FrontSide });
  const holder = new THREE.Group();
  if (sp.frame) box(sp.w + 0.06, sp.h + 0.06, sp.depth, kit.std(sp.frame, 0.6, 0.3), 0, 0, sp.depth / 2, holder);
  const p = plane(sp.w, sp.h, face, 0, 0, sp.depth + 0.002, holder);
  p.castShadow = false;
  if (sp.pin) {
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), kit.std("#c0302a", 0.4));
    pin.position.set(0, sp.h / 2 - 0.03, sp.depth + 0.01);
    holder.add(pin);
  }
  if (sp.flat) {
    holder.rotation.x = -Math.PI / 2;
    if (sp.stand) holder.rotation.x = -Math.PI / 2 + 0.35;
  }
  if (sp.stand && !sp.flat) {
    holder.position.y = sp.h / 2 + 0.12;
    box(0.06, 0.12, 0.06, kit.std("#1a1c1e"), 0, 0.06, 0.04, g);
    box(0.24, 0.02, 0.16, kit.std("#1a1c1e"), 0, 0.01, 0.06, g);
  }
  g.add(holder);
  tag(g, o.id);
  g.userData.ownMat = face;
  return {
    group: g,
    size: { w: sp.w + 0.1, h: sp.h + 0.1, d: sp.depth + 0.05 },
    focus: { dist: Math.max(0.7, sp.w * 1.35 + 0.2), y: sp.stand && !sp.flat ? sp.h / 2 + 0.12 : 0, flat: sp.flat },
    material: face,
    update() {},
    tick(dt, t) {
      if (sp.holo) p.position.y = Math.sin(t * 1.5) * 0.01;
    },
  };
}

/* ================= WIRES PANEL ================= */
export function buildWires(kit, o, L, theme) {
  const g = new THREE.Group();
  const n = Math.max(o.left.length, o.right.length);
  const H = 0.12 + n * 0.1;
  box(0.6, H, 0.08, kit.std("#7a8288", 0.5, 0.5), 0, 0, 0.04, g);
  box(0.54, H - 0.06, 0.01, kit.std("#15171a", 0.7), 0, 0, 0.085, g);
  const wiresG = new THREE.Group();
  g.add(wiresG);
  const ty = (i, m) => (H - 0.12) / 2 - i * ((H - 0.12) / Math.max(1, m - 1));
  o.left.forEach((c, i) => cyl(0.02, 0.02, 0.03, kit.std(COLORS[c] || c, 0.4), -0.22, ty(i, o.left.length), 0.1, 10, g).rotation.x = Math.PI / 2);
  o.right.forEach((c, i) => {
    const m = cyl(0.02, 0.02, 0.03, kit.std(o.rightColors ? COLORS[o.rightColors[i]] || "#888" : "#c9c9c9", 0.4, 0.4), 0.22, ty(i, o.right.length), 0.1, 10, g);
    m.rotation.x = Math.PI / 2;
  });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), kit.unique({ color: "#ff3020", emissive: "#ff3020", emissiveIntensity: 1.2 }));
  lamp.position.set(0, H / 2 - 0.02, 0.1);
  g.add(lamp);
  tag(g, o.id);
  let drawn = false;
  return {
    group: g,
    size: { w: 0.65, h: H, d: 0.1 },
    focus: { dist: 0.9, y: 0 },
    update(s) {
      lamp.material.color.set(s.solved ? "#30ff60" : "#ff3020");
      lamp.material.emissive.set(s.solved ? "#30ff60" : "#ff3020");
      if (s.solved && !drawn) {
        drawn = true;
        for (const [li, ri] of Object.entries(o.answer)) {
          const a = new THREE.Vector3(-0.22, ty(o.left.indexOf(li), o.left.length), 0.11);
          const b = new THREE.Vector3(0.22, ty(o.right.indexOf(ri), o.right.length), 0.11);
          const mid = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, -0.03, 0.04));
          const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
          const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.008, 6), kit.std(COLORS[li] || li, 0.4));
          wiresG.add(tube);
        }
      }
    },
    tick() {},
  };
}

/* ================= MIRRORS BOARD ================= */
export function buildMirrors(kit, o, L, theme) {
  const g = new THREE.Group();
  const [cw, ch] = o.size;
  const cs = 0.16;
  const W = cw * cs + 0.12, D = ch * cs + 0.12;
  // a table-top board (lying flat), standing on legs
  const top = new THREE.Group();
  top.position.y = 0.85;
  g.add(top);
  box(W, 0.05, D, kit.wood(), 0, -0.025, 0, top);
  for (const [x, z] of [[-W / 2 + 0.05, -D / 2 + 0.05], [W / 2 - 0.05, -D / 2 + 0.05], [-W / 2 + 0.05, D / 2 - 0.05], [W / 2 - 0.05, D / 2 - 0.05]]) box(0.05, 0.85, 0.05, kit.wood(), x, -0.45, z, top);
  const cx = (x) => -W / 2 + 0.06 + cs / 2 + x * cs;
  const cz = (y) => -D / 2 + 0.06 + cs / 2 + y * cs;
  for (let x = 0; x <= cw; x++) box(0.004, 0.003, ch * cs, kit.std("#222", 0.8), -W / 2 + 0.06 + x * cs, 0.002, 0, top);
  for (let y = 0; y <= ch; y++) box(cw * cs, 0.003, 0.004, kit.std("#222", 0.8), 0, 0.002, -D / 2 + 0.06 + y * cs, top);
  // emitter
  const [sx, sy] = o.source.at;
  const em = cyl(0.04, 0.05, 0.08, kit.metal("#444", 0.3), cx(sx), 0.04, cz(sy), 12, top);
  void em;
  const tgts = o.targets.map(([x, y]) => {
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), kit.unique({ color: "#9ae0ff", emissive: "#2a8aff", emissiveIntensity: 0.3, roughness: 0.1 }));
    c.position.set(cx(x), 0.07, cz(y));
    top.add(c);
    return c;
  });
  const mirrorsG = [];
  o.cells.forEach((c, i) => {
    const m = new THREE.Group();
    m.position.set(cx(c.x), 0.0, cz(c.y));
    if (c.block) box(cs * 0.7, 0.12, cs * 0.7, kit.std("#3a3a3a", 0.9), 0, 0.06, 0, m);
    else {
      box(cs * 0.8, 0.1, 0.012, kit.std("#dfeff8", 0.05, 0.95), 0, 0.06, 0, m);
      box(cs * 0.84, 0.02, 0.03, kit.std(c.fixed ? "#555" : "#c9a14a", 0.5, 0.6), 0, 0.01, 0, m);
    }
    tag(m, o.id, "cell:" + i);
    top.add(m);
    mirrorsG.push({ g: m, cell: c, cur: 0 });
  });
  const beamM = kit.unique({ color: "#ff3a3a", emissive: "#ff2020", emissiveIntensity: 3, transparent: true, opacity: 0.85 });
  const beamG = new THREE.Group();
  top.add(beamG);
  // invisible click surface for the whole board
  const hitPlane = box(W, 0.02, D, new THREE.MeshBasicMaterial({ visible: false }), 0, 0.01, 0, top);
  void hitPlane;
  tag(g, o.id);
  mirrorsG.forEach((mg, i) => tag(mg.g, o.id, "cell:" + i));
  let solved = false;
  const yaw = (m) => (m === "/" ? Math.PI / 4 : -Math.PI / 4);
  return {
    group: g,
    size: { w: W, h: 1.0, d: D },
    focus: { dist: Math.max(1.4, W * 1.5), y: 0.9, top: true },
    update(s) {
      solved = s.solved;
      s.cells.forEach((c, i) => (mirrorsG[i].target = c.block ? 0 : yaw(c.m)));
      // beam
      beamG.clear();
      const { path, hit } = traceBeam(o, s.cells);
      for (let k = 1; k < path.length; k++) {
        const [x0, y0] = path[k - 1], [x1, y1] = path[k];
        const a = new THREE.Vector3(cx(x0), 0.06, cz(y0)), b = new THREE.Vector3(cx(x1), 0.06, cz(y1));
        const len = a.distanceTo(b);
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, len, 6), beamM);
        seg.position.copy(a).add(b).multiplyScalar(0.5);
        seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        beamG.add(seg);
      }
      tgts.forEach((t, i) => (t.material.emissiveIntensity = i === hit ? 3 : 0.3));
    },
    tick(dt, t) {
      for (const mg of mirrorsG) {
        if (mg.target == null) continue;
        mg.cur = ease(mg.cur || mg.target, mg.target, dt, 10);
        mg.g.rotation.y = mg.cur;
      }
      beamM.emissiveIntensity = 2.5 + Math.sin(t * 8) * 0.5;
      tgts.forEach((x) => (x.rotation.y = t));
      void solved;
    },
  };
}

/* ================= TIMED BUTTON ================= */
export function buildTimed(kit, o, L, theme) {
  const g = new THREE.Group();
  box(0.3, 0.3, 0.06, kit.std("#e8b520", 0.5), 0, 0, 0.03, g);
  const btn = cyl(0.09, 0.1, 0.06, kit.std("#c0302a", 0.4), 0, 0, 0.09, 20, g);
  btn.rotation.x = Math.PI / 2;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 8, 32), kit.unique({ color: "#333", emissive: "#30ff60", emissiveIntensity: 0 }));
  ring.position.z = 0.065;
  g.add(ring);
  tag(g, o.id);
  let until = 0, press = 0;
  return {
    group: g,
    size: { w: 0.32, h: 0.32, d: 0.12 },
    focus: { dist: 0.8, y: 0 },
    update(s, gs) {
      if (s.until > until) press = 1;
      until = s.until;
      this.gs = gs;
    },
    tick(dt, t) {
      press = Math.max(0, press - dt * 4);
      btn.position.z = 0.09 - press * 0.03;
      const left = until - (this.gs?.time ?? 0);
      ring.material.emissiveIntensity = left > 0 ? 1.5 + Math.sin(t * (left < 3 ? 14 : 6)) * 0.8 : 0;
    },
  };
}

/* ================= MACHINE ================= */
export function buildMachine(kit, o, L, theme) {
  const g = new THREE.Group();
  const spinners = [];
  let size = { w: 0.6, h: 0.6, d: 0.3 };
  if (o.style === "deadMonitor") {
    box(0.5, 0.36, 0.06, kit.std("#1a1c1e", 0.6), 0, 0.3, 0.03, g);
    box(0.44, 0.3, 0.01, kit.std("#050607", 0.2, 0.3), 0, 0.3, 0.065, g);
    box(0.06, 0.12, 0.06, kit.std("#1a1c1e"), 0, 0.06, 0.04, g);
    box(0.24, 0.02, 0.16, kit.std("#1a1c1e"), 0, 0.01, 0.06, g);
    size = { w: 0.55, h: 0.5, d: 0.2 };
  } else if (o.style === "generator") {
    box(1.0, 0.7, 0.6, kit.std("#4a5a3a", 0.6, 0.4), 0, 0.35, 0.3, g);
    box(1.04, 0.08, 0.64, kit.metal("#333"), 0, 0.72, 0.3, g);
    const fly = new THREE.Group();
    fly.position.set(0.55, 0.4, 0.3);
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 8, 24), kit.metal("#666", 0.4));
    w.rotation.y = Math.PI / 2;
    fly.add(w);
    for (let i = 0; i < 3; i++) box(0.02, 0.42, 0.03, kit.metal("#666"), 0, 0, 0, fly).rotation.x = (i * Math.PI) / 3;
    g.add(fly);
    spinners.push([fly, "x", 6]);
    size = { w: 1.3, h: 0.8, d: 0.65 };
  } else {
    // gear train
    box(1.1, 0.8, 0.05, kit.std(theme.trim, 0.6, 0.4), 0, 0.4, 0.025, g);
    for (const [x, y, r, dir] of [[-0.3, 0.45, 0.2, 1], [0.08, 0.5, 0.14, -1.43], [0.33, 0.32, 0.12, 1.67]]) {
      const gm = new THREE.Mesh(gearGeo(r, Math.round(r * 70), 0.04, r * 0.25), kit.metal(theme.metal, 0.35));
      gm.position.set(x, y, 0.08);
      g.add(gm);
      spinners.push([gm, "z", dir]);
    }
    size = { w: 1.1, h: 0.85, d: 0.15 };
  }
  tag(g, o.id);
  let on = false, speed = 0;
  return {
    group: g,
    size,
    focus: { dist: 1.4, y: size.h / 2 },
    update(s, gs, test) {
      on = test(o.active);
    },
    tick(dt) {
      speed = ease(speed, on ? 1 : 0, dt, 1.5);
      for (const [m, ax, k] of spinners) m.rotation[ax] += dt * speed * k;
    },
  };
}

export const BUILDERS = {
  door: buildDoor,
  container: buildContainer,
  pickup: buildPickup,
  keypad: buildKeypad,
  switch: buildSwitch,
  dial: buildDial,
  buttons: buildButtons,
  slot: buildSlot,
  movable: buildMovable,
  clue: buildClue,
  wires: buildWires,
  mirrors: buildMirrors,
  timed: buildTimed,
  machine: buildMachine,
};
