/**
 * Mario Adventure 3D — enemy models (original cartoon designs) and their
 * per-state animation:
 *
 *   walker   "Mushroom Trooper" — brown cap, angry brows, stomping feet
 *   jumper   "Hopper"           — round green frog with big eyes
 *   flyer    "Buzzer"           — striped beetle-bee with whirring wings
 *   armored  "Spike Shell"      — red spiked shell; hides inside when stomped
 *   fast     "Charger"          — stocky boar with tusks and a mohawk
 *
 * Every model is a THREE.Group whose origin is the enemy's feet; animate()
 * reads the engine enemy (state, timers, alive/defeat) and poses it.
 */
import * as THREE from "three";

function eye(G, bank, parent, x, y, z, s = 1, angry = 0) {
  const w = new THREE.Mesh(G.get("eW", () => new THREE.SphereGeometry(1, 14, 10)), bank.color("#ffffff", { roughness: 0.3 }));
  w.scale.set(0.11 * s, 0.15 * s, 0.07 * s);
  w.position.set(x, y, z);
  const p = new THREE.Mesh(G.get("eP", () => new THREE.SphereGeometry(1, 10, 8)), bank.color("#111111", { roughness: 0.3 }));
  p.scale.set(0.055 * s, 0.085 * s, 0.04 * s);
  p.position.set(x * 0.92, y - 0.01 * s, z + 0.045 * s);
  parent.add(w, p);
  if (angry) {
    const b = new THREE.Mesh(G.get("eB", () => new THREE.BoxGeometry(1, 1, 1)), bank.color("#1a0f08"));
    b.scale.set(0.16 * s, 0.045 * s, 0.04 * s);
    b.position.set(x, y + 0.15 * s, z + 0.03);
    b.rotation.z = -angry * Math.sign(x || 1) * 0.5;
    parent.add(b);
  }
  return w;
}

const sph = (G) => G.get("unitSph", () => new THREE.SphereGeometry(1, 20, 14));
function part(G, bank, parent, color, pos, scale, rot, o = {}) {
  const m = new THREE.Mesh(o.geo || sph(G), bank.color(color, { roughness: o.rough ?? 0.6, ...(o.mat || {}) }));
  m.position.set(pos[0], pos[1], pos[2]);
  m.scale.set(scale[0], scale[1], scale[2]);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  m.castShadow = o.shadow !== false;
  parent.add(m);
  return m;
}

export function makeEnemy(e, ctx) {
  const { G, bank, world } = ctx;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const U = { body, type: e.type };
  const tint = world.key;
  switch (e.type) {
    case "walker": {
      const capCol = tint === "desert" ? "#b5763a" : tint === "snow" ? "#6a7fa8" : tint === "lava" ? "#6a2a22" : tint === "ocean" ? "#a0522d" : "#8b4a22";
      // a big round head (the face IS the head) over a little tan body
      part(G, bank, body, "#f1d2a0", [0, 0.28, 0], [0.3, 0.24, 0.28]);
      U.cap = part(G, bank, body, capCol, [0, 0.66, 0], [0.6, 0.46, 0.54]);
      part(G, bank, body, capCol, [0, 0.47, 0.05], [0.55, 0.22, 0.5]);
      part(G, bank, body, "#e8b98a", [0, 0.55, 0.36], [0.34, 0.2, 0.14]);
      eye(G, bank, body, 0.14, 0.74, 0.45, 1, 1);
      eye(G, bank, body, -0.14, 0.74, 0.45, 1, 1);
      // fangs
      const f = G.get("fang", () => new THREE.ConeGeometry(0.04, 0.08, 5));
      for (const s of [-1, 1]) {
        const m = new THREE.Mesh(f, bank.color("#ffffff"));
        m.position.set(0.08 * s, 0.5, 0.48);
        m.rotation.x = Math.PI;
        body.add(m);
      }
      U.feet = [part(G, bank, root, "#3a2414", [0.18, 0.1, 0.05], [0.18, 0.11, 0.24]), part(G, bank, root, "#3a2414", [-0.18, 0.1, 0.05], [0.18, 0.11, 0.24])];
      break;
    }
    case "jumper": {
      const g = tint === "desert" ? "#c9a640" : tint === "snow" ? "#5fb3d9" : tint === "lava" ? "#d9542a" : "#4cc24a";
      part(G, bank, body, g, [0, 0.45, 0], [0.5, 0.42, 0.52]);
      part(G, bank, body, "#fff3c4", [0, 0.38, 0.22], [0.38, 0.3, 0.32]);
      for (const s of [-1, 1]) {
        part(G, bank, body, g, [0.2 * s, 0.85, 0.12], [0.16, 0.16, 0.16]);
        eye(G, bank, body, 0.2 * s, 0.88, 0.25, 0.9, 0);
      }
      part(G, bank, body, "#7a1a1a", [0, 0.48, 0.47], [0.2, 0.03, 0.05]);
      U.legs = [part(G, bank, root, g, [0.32, 0.15, -0.05], [0.18, 0.13, 0.32]), part(G, bank, root, g, [-0.32, 0.15, -0.05], [0.18, 0.13, 0.32])];
      break;
    }
    case "flyer": {
      const yel = tint === "snow" ? "#9fd8ff" : tint === "lava" ? "#ff8a2a" : "#ffcf2a";
      part(G, bank, body, yel, [0, 0.4, 0], [0.42, 0.38, 0.48]);
      const ring = G.get("bandRing", () => new THREE.TorusGeometry(1, 0.18, 8, 24));
      for (const z of [-0.12, 0.08]) {
        const r = new THREE.Mesh(ring, bank.color("#2a2018"));
        r.scale.set(0.4, 0.37, 0.4);
        r.position.set(0, 0.4, z);
        body.add(r);
      }
      eye(G, bank, body, 0.14, 0.5, 0.4, 0.9, 1);
      eye(G, bank, body, -0.14, 0.5, 0.4, 0.9, 1);
      const sting = new THREE.Mesh(G.get("sting", () => new THREE.ConeGeometry(0.08, 0.3, 8)), bank.color("#2a2018"));
      sting.position.set(0, 0.32, -0.55);
      sting.rotation.x = -Math.PI / 2;
      body.add(sting);
      const wingG = G.get("wing", () => {
        const geo = new THREE.SphereGeometry(1, 12, 8);
        geo.scale(0.5, 0.05, 0.28);
        geo.translate(0.5, 0, 0);
        return geo;
      });
      const wm = bank.color("#e8f6ff", { transparent: true, opacity: 0.6, roughness: 0.1, depthWrite: false });
      U.wings = [];
      for (const s of [-1, 1]) {
        const piv = new THREE.Group();
        piv.position.set(0.2 * s, 0.72, -0.05);
        piv.scale.x = s;
        const w = new THREE.Mesh(wingG, wm);
        piv.add(w);
        body.add(piv);
        U.wings.push(piv);
      }
      break;
    }
    case "armored": {
      const shellC = tint === "snow" ? "#3a7ad9" : tint === "desert" ? "#c96a2a" : "#e3262b";
      U.head = new THREE.Group();
      body.add(U.head);
      part(G, bank, U.head, "#ffd27a", [0, 0.55, 0.52], [0.26, 0.26, 0.26]);
      eye(G, bank, U.head, 0.1, 0.62, 0.72, 0.8, 1);
      eye(G, bank, U.head, -0.1, 0.62, 0.72, 0.8, 1);
      U.shell = new THREE.Group();
      body.add(U.shell);
      const dome = new THREE.Mesh(G.get("shellDome", () => new THREE.SphereGeometry(1, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2)), bank.color(shellC, { roughness: 0.35 }));
      dome.scale.set(0.62, 0.6, 0.66);
      dome.position.y = 0.32;
      dome.castShadow = true;
      const rim = new THREE.Mesh(G.get("shellRim", () => new THREE.TorusGeometry(1, 0.12, 8, 24)), bank.color("#fff3dc"));
      rim.rotation.x = Math.PI / 2;
      rim.scale.set(0.64, 0.68, 0.64);
      rim.position.y = 0.33;
      U.shell.add(dome, rim);
      const spike = G.get("spikeC", () => new THREE.ConeGeometry(0.09, 0.28, 8));
      const sm = bank.color("#ffffff", { roughness: 0.3 });
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const sp = new THREE.Mesh(spike, sm);
        sp.position.set(Math.cos(a) * 0.38, 0.72, Math.sin(a) * 0.4);
        sp.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
        U.shell.add(sp);
      }
      const top = new THREE.Mesh(spike, sm);
      top.position.y = 0.98;
      U.shell.add(top);
      U.feet = [part(G, bank, root, "#ffd27a", [0.28, 0.12, 0.2], [0.14, 0.12, 0.16]), part(G, bank, root, "#ffd27a", [-0.28, 0.12, 0.2], [0.14, 0.12, 0.16]), part(G, bank, root, "#ffd27a", [0.28, 0.12, -0.25], [0.14, 0.12, 0.16]), part(G, bank, root, "#ffd27a", [-0.28, 0.12, -0.25], [0.14, 0.12, 0.16])];
      break;
    }
    case "fast": {
      const fur = tint === "snow" ? "#c9d4e2" : tint === "desert" ? "#b0844a" : tint === "lava" ? "#4a3a3a" : "#7a5a44";
      part(G, bank, body, fur, [0, 0.55, -0.05], [0.48, 0.42, 0.62]);
      part(G, bank, body, fur, [0, 0.62, 0.48], [0.33, 0.3, 0.3]);
      part(G, bank, body, "#f2a6a0", [0, 0.56, 0.76], [0.16, 0.12, 0.08]);
      eye(G, bank, body, 0.14, 0.74, 0.69, 0.75, 1);
      eye(G, bank, body, -0.14, 0.74, 0.69, 0.75, 1);
      const tusk = G.get("tusk", () => new THREE.ConeGeometry(0.05, 0.22, 6));
      for (const s of [-1, 1]) {
        const t = new THREE.Mesh(tusk, bank.color("#fffdf0"));
        t.position.set(0.15 * s, 0.5, 0.74);
        t.rotation.set(-0.6, 0, -0.3 * s);
        body.add(t);
      }
      for (let i = 0; i < 4; i++) part(G, bank, body, "#2a1a14", [0, 0.98 - i * 0.03, 0.36 - i * 0.2], [0.07, 0.14, 0.09]);
      U.legs = [];
      for (const [x, z] of [
        [0.25, 0.3],
        [-0.25, 0.3],
        [0.25, -0.38],
        [-0.25, -0.38],
      ]) {
        const piv = new THREE.Group();
        piv.position.set(x, 0.32, z);
        part(G, bank, piv, "#3a2a20", [0, -0.17, 0], [0.1, 0.17, 0.1]);
        root.add(piv);
        U.legs.push(piv);
      }
      // dizzy stars
      U.dizzy = new THREE.Group();
      const st = G.get("dizzyStar", () => new THREE.OctahedronGeometry(0.09, 0));
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(st, bank.color("#ffe14a", { emissive: "#a07000" }));
        U.dizzy.add(m);
      }
      U.dizzy.position.y = 1.15;
      U.dizzy.visible = false;
      root.add(U.dizzy);
      break;
    }
    default:
  }
  // "!" alert badge
  U.alert = new THREE.Sprite(ctx.alertMat);
  U.alert.scale.set(0.55, 0.55, 1);
  U.alert.position.y = (e.cfg.h || 1) + 0.8;
  U.alert.visible = false;
  root.add(U.alert);
  root.traverse((o) => {
    if (o.isMesh) o.castShadow = ctx.shadows;
  });
  root.userData = U;
  return root;
}

export function animateEnemy(root, e, t) {
  const U = root.userData;
  root.position.set(e.x, e.y, e.z);
  root.rotation.set(0, e.yaw, 0);
  const b = U.body;
  root.scale.set(1, 1, 1);
  b.position.set(0, 0, 0);
  b.rotation.set(0, 0, 0);
  b.scale.set(1, 1, 1);
  U.alert.visible = e.alive && (e.state === "alert" || (e.state === "windup" && e.type !== "armored")) && e.st < 0.8;
  if (U.alert.visible) U.alert.position.y = (e.cfg.h || 1) + 0.75 + Math.sin(e.st * 20) * 0.06;

  if (!e.alive) {
    if (e.deathKind === "squash") {
      const k = Math.min(1, e.deadT / 0.12);
      root.scale.set(1 + 0.4 * k, 1 - 0.85 * k, 1 + 0.4 * k);
      root.visible = e.deadT < 0.7;
    } else {
      root.rotation.x = e.deadT * 12;
      root.visible = e.deadT < 1.6;
    }
    return;
  }
  root.visible = true;
  const walking = e.state === "patrol" || e.state === "chase" || e.state === "attack";
  const speed = e.state === "chase" || e.state === "attack" ? 2.2 : 1;
  const ph = e.anim * 9 * speed;
  switch (e.type) {
    case "walker": {
      const s = walking ? Math.sin(ph) : 0;
      U.feet[0].position.z = 0.05 + s * 0.16;
      U.feet[1].position.z = 0.05 - s * 0.16;
      U.feet[0].position.y = 0.1 + Math.max(0, s) * 0.08;
      U.feet[1].position.y = 0.1 + Math.max(0, -s) * 0.08;
      b.rotation.z = s * 0.08;
      b.position.y = Math.abs(s) * 0.05;
      if (e.state === "alert") b.position.y = Math.sin(Math.min(1, e.st / 0.4) * Math.PI) * 0.45;
      break;
    }
    case "jumper": {
      if (!e.grounded) {
        b.scale.set(0.9, 1.18, 0.9);
        U.legs[0].position.y = U.legs[1].position.y = 0.0;
        U.legs[0].scale.z = U.legs[1].scale.z = 0.45;
      } else {
        const crouch = e.land > 0 ? 0.25 : Math.max(0, (e.st - (e.state === "chase" ? 0.6 : 1.3)) * 0.8);
        b.scale.set(1 + crouch * 0.3, 1 - Math.min(0.3, crouch), 1 + crouch * 0.3);
        U.legs[0].scale.z = U.legs[1].scale.z = 0.32;
        U.legs[0].position.y = U.legs[1].position.y = 0.15;
        b.position.y = Math.sin(t * 2 + e.idx) * 0.01;
      }
      break;
    }
    case "flyer": {
      const flap = Math.sin(t * 46 + e.idx) * 0.7;
      U.wings[0].rotation.z = flap;
      U.wings[1].rotation.z = flap;
      if (e.state === "windup") {
        b.position.x = Math.sin(t * 60) * 0.06;
        b.rotation.x = -0.4;
      } else if (e.state === "attack") b.rotation.x = 0.7;
      break;
    }
    case "armored": {
      const shell = e.state === "stunned" || e.state === "attack" || e.state === "windup";
      U.head.visible = !shell;
      for (const f of U.feet) f.visible = !shell || e.state === "attack";
      if (e.state === "attack") {
        U.shell.rotation.y = e.spin;
        b.position.y = 0.05;
      } else if (e.state === "windup") {
        U.shell.rotation.y = 0;
        b.position.x = Math.sin(t * 55) * 0.06;
      } else if (e.state === "stunned") {
        U.shell.rotation.y = 0;
        b.position.y = -0.1;
        // wobble before popping back out
        if (e.st > 2.6) b.rotation.z = Math.sin(t * 30) * 0.15;
      } else {
        U.shell.rotation.y = 0;
        const s = walking ? Math.sin(ph) : 0;
        U.feet[0].position.z = 0.2 + s * 0.08;
        U.feet[1].position.z = 0.2 - s * 0.08;
        U.feet[2].position.z = -0.25 - s * 0.08;
        U.feet[3].position.z = -0.25 + s * 0.08;
        b.rotation.z = s * 0.05;
      }
      if (e.hitT > 0) b.scale.set(1.2, 0.8, 1.2);
      break;
    }
    case "fast": {
      const fastLegs = e.state === "attack" ? 2.6 : walking ? 1 : 0;
      for (let i = 0; i < 4; i++) U.legs[i].rotation.x = Math.sin(ph * fastLegs + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 * Math.min(1, fastLegs);
      if (e.state === "windup") {
        b.rotation.x = 0.18;
        U.legs[0].rotation.x = Math.sin(t * 22) * 0.9; // pawing the ground
        b.position.x = Math.sin(t * 40) * 0.03;
      } else if (e.state === "attack") b.rotation.x = 0.22;
      U.dizzy.visible = e.state === "stunned";
      if (U.dizzy.visible) {
        U.dizzy.children.forEach((m, i) => {
          const a = t * 5 + (i / 3) * Math.PI * 2;
          m.position.set(Math.cos(a) * 0.35, Math.sin(t * 8 + i) * 0.04, Math.sin(a) * 0.35);
        });
        b.rotation.z = Math.sin(t * 6) * 0.12;
      }
      break;
    }
    default:
  }
}

export function alertMaterial() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#ffd23a";
  g.beginPath();
  g.arc(32, 32, 28, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = "#7a4300";
  g.stroke();
  g.fillStyle = "#7a1a00";
  g.font = "900 44px Arial Black, Arial";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("!", 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true });
  m.userData.tex = t;
  return m;
}
