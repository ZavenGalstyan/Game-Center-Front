/**
 * Mario Adventure 3D — the hero model and its procedural animation.
 *
 * Built from primitives in a small rig (feet at the origin, facing +Z):
 *   root ─ body (bob / lean / flip / squash)
 *          ├─ hips ─ legL / legR (thigh → knee → shin → shoe)
 *          └─ torso (shirt + overalls + straps + buttons)
 *               ├─ head (face, nose, mustache, eyes, ears, hair, cap + M)
 *               └─ armL / armR (upper → elbow → forearm → glove)
 *
 * animate(p, dt, ctx) blends toward a target pose per state — idle, walk,
 * run, jump, double (front flip), fall, land (squash), stomp, spring, hurt,
 * victory, pole, dead — with damped joints so every transition is smooth.
 * Power-ups tint/flash the shared materials (star = rainbow).
 */
import * as THREE from "three";

const C = {
  red: "#e3262b",
  redDark: "#b51c22",
  blue: "#2457d6",
  skin: "#ffc999",
  glove: "#ffffff",
  shoe: "#6b3a1e",
  hair: "#3b2214",
  stache: "#1f130c",
  eyeBlue: "#2a6bd8",
  button: "#ffd23a",
};

function emblemTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = C.red;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.arc(64, 64, 46, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = C.red;
  g.font = "900 66px Arial Black, Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("M", 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function createMario({ shadows = true } = {}) {
  const geos = [];
  const mats = [];
  const geo = (g) => (geos.push(g), g);
  const std = (color, o = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, ...o });
    m.userData.base = new THREE.Color(color);
    mats.push(m);
    return m;
  };
  const M = {
    red: std(C.red, { roughness: 0.6 }),
    blue: std(C.blue, { roughness: 0.65 }),
    skin: std(C.skin, { roughness: 0.7 }),
    glove: std(C.glove, { roughness: 0.5 }),
    shoe: std(C.shoe, { roughness: 0.45 }),
    hair: std(C.hair, { roughness: 0.8 }),
    stache: std(C.stache, { roughness: 0.85 }),
    eyeW: std("#ffffff", { roughness: 0.25 }),
    eyeB: std(C.eyeBlue, { roughness: 0.25 }),
    pupil: std("#101010", { roughness: 0.2 }),
    button: std(C.button, { roughness: 0.3, metalness: 0.4 }),
  };
  const emblemTex = emblemTexture();
  const emblemMat = new THREE.MeshStandardMaterial({ map: emblemTex, roughness: 0.6 });
  emblemMat.userData.base = new THREE.Color("#ffffff");
  mats.push(emblemMat);

  const SPH = geo(new THREE.SphereGeometry(1, 24, 18));
  const SPH_LO = geo(new THREE.SphereGeometry(1, 14, 10));
  const CAPS = geo(new THREE.CapsuleGeometry(1, 1, 6, 12));
  const mesh = (g, m, parent, pos, scale, rot) => {
    const o = new THREE.Mesh(g, m);
    if (pos) o.position.set(pos[0], pos[1], pos[2]);
    if (scale) o.scale.set(scale[0], scale[1], scale[2]);
    if (rot) o.rotation.set(rot[0], rot[1], rot[2]);
    o.castShadow = shadows;
    o.receiveShadow = false;
    parent.add(o);
    return o;
  };
  const node = (parent, pos) => {
    const o = new THREE.Group();
    if (pos) o.position.set(pos[0], pos[1], pos[2]);
    parent.add(o);
    return o;
  };

  const root = new THREE.Group();
  root.name = "mario";
  const body = node(root, [0, 0, 0]);
  const hips = node(body, [0, 0.5, 0]);
  const torso = node(hips, [0, 0.02, 0]);

  /* torso: red shirt top, blue overalls belly, straps and buttons */
  mesh(SPH, M.red, torso, [0, 0.3, 0.0], [0.27, 0.24, 0.23]);
  mesh(SPH, M.blue, torso, [0, 0.07, 0.0], [0.3, 0.26, 0.27]);
  mesh(SPH, M.blue, torso, [0, 0.2, 0.06], [0.24, 0.13, 0.2]); // bib
  for (const s of [-1, 1]) {
    const strap = mesh(geo(new THREE.BoxGeometry(0.07, 0.3, 0.05)), M.blue, torso, [0.12 * s, 0.3, 0.17], null, [0.25, 0, 0.08 * s]);
    strap.scale.set(1, 1, 1);
    mesh(SPH_LO, M.button, torso, [0.12 * s, 0.2, 0.235], [0.04, 0.04, 0.02]);
    const strapB = mesh(geo(new THREE.BoxGeometry(0.07, 0.32, 0.05)), M.blue, torso, [0.12 * s, 0.3, -0.17], null, [-0.25, 0, 0.08 * s]);
    strapB.scale.set(1, 1, 1);
  }

  /* head */
  const neck = node(torso, [0, 0.47, 0.02]);
  const head = node(neck, [0, 0.2, 0]);
  mesh(SPH, M.skin, head, [0, 0, 0], [0.31, 0.3, 0.29]);
  // nose + mustache
  mesh(SPH, M.skin, head, [0, -0.03, 0.31], [0.1, 0.09, 0.1]);
  for (const s of [-1, 1]) {
    mesh(SPH, M.stache, head, [0.085 * s, -0.12, 0.25], [0.12, 0.055, 0.07], [0.15, 0.35 * s, 0.35 * s]);
    // eyes
    mesh(SPH, M.eyeW, head, [0.085 * s, 0.08, 0.25], [0.055, 0.085, 0.04]);
    mesh(SPH_LO, M.eyeB, head, [0.083 * s, 0.07, 0.282], [0.032, 0.05, 0.02]);
    mesh(SPH_LO, M.pupil, head, [0.082 * s, 0.07, 0.297], [0.017, 0.03, 0.01]);
    // brows
    mesh(geo(new THREE.CapsuleGeometry(0.018, 0.07, 4, 6)), M.hair, head, [0.09 * s, 0.185, 0.262], null, [0, 0, Math.PI / 2 + 0.12 * s]);
    // ears
    mesh(SPH_LO, M.skin, head, [0.29 * s, -0.01, -0.02], [0.06, 0.09, 0.05]);
    // sideburns
    mesh(SPH_LO, M.hair, head, [0.25 * s, 0.02, 0.08], [0.05, 0.11, 0.06]);
  }
  mesh(SPH, M.hair, head, [0, -0.02, -0.17], [0.27, 0.2, 0.15]); // back hair
  mesh(SPH_LO, M.skin, head, [0, -0.2, 0.16], [0.12, 0.06, 0.08]); // chin peeking

  // cap: dome + brim + emblem
  const cap = node(head, [0, 0.08, -0.01]);
  cap.rotation.x = -0.12;
  const domeG = geo(new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.55));
  mesh(domeG, M.red, cap, [0, 0.0, 0], [0.335, 0.33, 0.33]);
  const brimG = geo(new THREE.CylinderGeometry(1, 1, 1, 28, 1, false, -Math.PI * 0.62, Math.PI * 1.24));
  mesh(brimG, M.red, cap, [0, 0.02, 0.1], [0.3, 0.035, 0.31]);
  const emblem = mesh(geo(new THREE.CircleGeometry(0.105, 24)), emblemMat, cap, [0, 0.19, 0.272], null, [-0.5, 0, 0]);
  emblem.castShadow = false;

  /* arms: shoulder → upper → elbow → forearm → glove */
  function arm(s) {
    const sh = node(torso, [0.29 * s, 0.33, 0]);
    mesh(SPH_LO, M.red, sh, [0, 0, 0], [0.1, 0.1, 0.1]);
    const up = node(sh, [0, 0, 0]);
    mesh(CAPS, M.red, up, [0, -0.11, 0], [0.075, 0.1, 0.075]);
    const el = node(up, [0, -0.22, 0]);
    mesh(CAPS, M.red, el, [0, -0.08, 0], [0.068, 0.07, 0.068]);
    const hand = node(el, [0, -0.2, 0]);
    mesh(SPH, M.glove, hand, [0, 0, 0], [0.105, 0.1, 0.11]);
    mesh(SPH_LO, M.glove, hand, [0.05 * s, 0.04, 0.05], [0.04, 0.05, 0.04]); // thumb
    mesh(CAPS, M.glove, hand, [0, 0.07, 0], [0.085, 0.03, 0.085]); // cuff
    return { sh, up, el, hand };
  }
  function leg(s) {
    const hip = node(hips, [0.13 * s, 0.0, 0]);
    const th = node(hip, [0, 0, 0]);
    mesh(CAPS, M.blue, th, [0, -0.1, 0], [0.105, 0.08, 0.105]);
    const kn = node(th, [0, -0.2, 0]);
    mesh(CAPS, M.blue, kn, [0, -0.07, 0], [0.095, 0.06, 0.095]);
    const foot = node(kn, [0, -0.17, 0]);
    mesh(SPH, M.shoe, foot, [0, -0.06, 0.06], [0.12, 0.085, 0.18]);
    mesh(SPH_LO, M.shoe, foot, [0, -0.12, 0.05], [0.115, 0.03, 0.17]); // sole
    return { hip, th, kn, foot };
  }
  const aL = arm(1);
  const aR = arm(-1);
  const lL = leg(1);
  const lR = leg(-1);

  // rest offsets so the arms hang slightly out from the body
  const J = {
    body: { x: 0, z: 0, y: 0 },
    torso: { x: 0, y: 0, z: 0 },
    head: { x: 0, y: 0, z: 0 },
    aL: { x: 0, z: 0.15, e: 0 },
    aR: { x: 0, z: -0.15, e: 0 },
    lL: { x: 0, z: 0.03, k: 0 },
    lR: { x: 0, z: -0.03, k: 0 },
    bob: 0,
    sq: 1,
    flip: 0,
    spin: 0,
  };
  const target = JSON.parse(JSON.stringify(J));

  let phase = 0;
  let squash = 0;
  let squashV = 0;
  let prevAnim = "idle";
  let animClock = 0;
  let flipT = 1;
  let blinkT = 2;
  let rainbow = 0;
  const tmpC = new THREE.Color();

  function setTarget(o) {
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === "object") Object.assign(target[k], v);
      else target[k] = v;
    }
  }
  const dampObj = (a, b, k) => {
    for (const key of Object.keys(b)) {
      if (typeof b[key] === "number") a[key] += (b[key] - a[key]) * k;
    }
  };

  /**
   * p: player state (anim, speed, vy, grounded, landT, animT, invuln, yaw…)
   * ctx: { t, power: {star, …}, reduced }
   */
  function animate(p, dt, ctx) {
    const a = p.anim;
    if (a !== prevAnim) {
      if (a === "double") flipT = 0;
      if (a === "land" || (a === "idle" && prevAnim === "fall") || (a === "walk" && prevAnim === "fall") || (a === "run" && prevAnim === "fall")) {
        squashV -= 3.5;
      }
      if (a === "jump" || a === "spring") squashV += 2.5;
      if (a === "stomp") squashV -= 2;
      prevAnim = a;
      animClock = 0;
    }
    animClock += dt;
    const sp = p.speed || 0;
    // gait phase: steps per second follow ground speed
    if (a === "walk" || a === "run") phase += dt * (2.2 + sp * 0.95);
    else phase += dt * 1.2;
    const s = Math.sin(phase * 2);
    const c = Math.cos(phase * 2);
    const base = {
      body: { x: 0, y: 0, z: 0 },
      torso: { x: 0, y: 0, z: 0 },
      head: { x: 0, y: 0, z: 0 },
      aL: { x: 0, z: 0.18, e: -0.15 },
      aR: { x: 0, z: -0.18, e: -0.15 },
      lL: { x: 0, z: 0.03, k: 0 },
      lR: { x: 0, z: -0.03, k: 0 },
      bob: 0,
      flip: 0,
    };
    setTarget(base);
    switch (a) {
      case "idle": {
        const br = Math.sin(animClock * 2.2);
        const look = Math.sin(animClock * 0.45) * 0.35 * (Math.sin(animClock * 0.13) > 0.3 ? 1 : 0);
        setTarget({ bob: br * 0.008, head: { y: look, x: br * 0.03 }, aL: { x: br * 0.04, z: 0.2 + br * 0.02 }, aR: { x: -br * 0.04, z: -0.2 - br * 0.02 } });
        break;
      }
      case "walk": {
        const k = Math.min(1, sp / 6.5);
        setTarget({
          bob: Math.abs(c) * 0.05 * k,
          body: { x: 0.06 * k },
          torso: { y: s * 0.12 * k },
          head: { y: -s * 0.08 * k },
          lL: { x: s * 0.75 * k, k: Math.max(0, -c) * 0.9 * k },
          lR: { x: -s * 0.75 * k, k: Math.max(0, c) * 0.9 * k },
          aL: { x: -s * 0.65 * k, e: -0.35, z: 0.14 },
          aR: { x: s * 0.65 * k, e: -0.35, z: -0.14 },
        });
        break;
      }
      case "run": {
        setTarget({
          bob: Math.abs(c) * 0.09,
          body: { x: 0.26 },
          torso: { y: s * 0.22, x: 0.05 },
          head: { x: -0.18, y: -s * 0.12 },
          lL: { x: s * 1.1, k: Math.max(0, -c) * 1.5 + 0.2 },
          lR: { x: -s * 1.1, k: Math.max(0, c) * 1.5 + 0.2 },
          aL: { x: -s * 1.2, e: -1.4, z: 0.22 },
          aR: { x: s * 1.2, e: -1.4, z: -0.22 },
        });
        break;
      }
      case "jump":
      case "spring": {
        // classic: one fist up, one leg tucked
        const spring = a === "spring";
        setTarget({
          body: { x: -0.05 },
          head: { x: -0.15 },
          aL: { x: spring ? -2.9 : -2.7, z: 0.25, e: -0.2 },
          aR: { x: spring ? -2.9 : 0.5, z: spring ? -0.25 : -0.5, e: spring ? -0.2 : -0.8 },
          lL: { x: spring ? 0 : -1.0, k: spring ? 0.1 : 1.4 },
          lR: { x: spring ? 0 : 0.35, k: spring ? 0.1 : 0.3 },
        });
        break;
      }
      case "double": {
        setTarget({
          aL: { x: -1.2, z: 0.6, e: -1.6 },
          aR: { x: -1.2, z: -0.6, e: -1.6 },
          lL: { x: -1.5, k: 2.1 },
          lR: { x: -1.5, k: 2.1 },
          head: { x: 0.2 },
        });
        break;
      }
      case "fall": {
        const f = Math.sin(animClock * 9) * 0.25;
        setTarget({
          head: { x: 0.1 },
          aL: { x: -1.3 + f, z: 0.9, e: -0.4 },
          aR: { x: -1.3 - f, z: -0.9, e: -0.4 },
          lL: { x: -0.3, k: 0.6 },
          lR: { x: 0.25, k: 0.35 },
        });
        break;
      }
      case "land":
        setTarget({ body: { x: 0.18 }, aL: { x: 0.3, z: 0.5, e: -0.5 }, aR: { x: 0.3, z: -0.5, e: -0.5 }, lL: { x: -0.5, k: 1.0 }, lR: { x: -0.5, k: 1.0 } });
        break;
      case "stomp":
        setTarget({ aL: { x: -2.4, z: 0.9, e: -0.2 }, aR: { x: -2.4, z: -0.9, e: -0.2 }, lL: { x: -0.9, z: 0.35, k: 1.3 }, lR: { x: -0.9, z: -0.35, k: 1.3 }, head: { x: -0.2 } });
        break;
      case "hurt": {
        setTarget({ body: { x: -0.45 }, head: { x: -0.35 }, aL: { x: -2.3, z: 0.8, e: -0.6 }, aR: { x: -2.3, z: -0.8, e: -0.6 }, lL: { x: 0.6, k: 0.6 }, lR: { x: 0.2, k: 0.9 } });
        break;
      }
      case "victory": {
        const t = animClock;
        const pump = t > 0.6 ? Math.sin((t - 0.6) * 7) * 0.25 : 0;
        setTarget({
          bob: t < 0.6 ? Math.sin((t / 0.6) * Math.PI) * 0.7 : Math.abs(Math.sin(t * 3.5)) * 0.05,
          head: { x: -0.2, y: 0 },
          aL: { x: -2.95 + pump, z: 0.35, e: -0.1 },
          aR: { x: 0.2, z: -0.45, e: -1.5 },
          lL: { x: -0.1, k: 0.15 },
          lR: { x: 0.15, k: 0.05 },
        });
        break;
      }
      case "pole":
        setTarget({ aL: { x: -2.9, z: 0.1, e: -0.3 }, aR: { x: -2.6, z: -0.1, e: -0.4 }, lL: { x: -0.4, k: 0.7 }, lR: { x: -0.2, k: 0.4 }, head: { x: -0.2 } });
        break;
      case "dead":
        setTarget({ aL: { x: -2.9, z: 0.6, e: -0.9 }, aR: { x: -2.9, z: -0.6, e: -0.9 }, lL: { x: 0.2, k: 0.6 }, lR: { x: 0.2, k: 0.6 }, head: { x: -0.3 } });
        break;
      default:
    }

    // double-jump front flip
    if (flipT < 1) {
      flipT = Math.min(1, flipT + dt / 0.46);
      const e = 1 - Math.pow(1 - flipT, 2.2);
      target.flip = e * Math.PI * 2;
      J.flip = target.flip;
    } else {
      J.flip = 0;
    }
    const k = 1 - Math.exp(-(a === "double" ? 22 : 15) * dt);
    for (const key of ["body", "torso", "head", "aL", "aR", "lL", "lR"]) dampObj(J[key], target[key], k);
    J.bob += (target.bob - J.bob) * k;

    // squash & stretch spring
    squashV += (-squash * 140 - squashV * 13) * dt;
    squash += squashV * dt;
    if (ctx.reduced) squash *= 0.4;
    const sq = 1 + Math.max(-0.35, Math.min(0.35, squash * 0.18));
    const vyStretch = !p.grounded && a !== "double" ? Math.max(-0.08, Math.min(0.1, (p.vy || 0) * 0.006)) : 0;

    // apply
    body.position.y = J.bob;
    body.rotation.set(J.body.x, 0, J.body.z);
    body.scale.set(1 / Math.sqrt(sq + vyStretch), sq + vyStretch, 1 / Math.sqrt(sq + vyStretch));
    if (J.flip) {
      // somersault around the waist (pivot 0.75 up), not around the feet
      body.rotation.x = J.body.x + J.flip;
      body.position.y = 0.75 + J.bob;
      hips.position.y = 0.5 - 0.75;
    } else {
      hips.position.y = 0.5;
    }
    torso.rotation.set(J.torso.x, J.torso.y, J.torso.z);
    head.rotation.set(J.head.x, J.head.y, J.head.z);
    aL.sh.rotation.set(J.aL.x, 0, J.aL.z);
    aR.sh.rotation.set(J.aR.x, 0, J.aR.z);
    aL.el.rotation.set(J.aL.e, 0, 0);
    aR.el.rotation.set(J.aR.e, 0, 0);
    lL.hip.rotation.set(J.lL.x, 0, J.lL.z);
    lR.hip.rotation.set(J.lR.x, 0, J.lR.z);
    lL.kn.rotation.set(J.lL.k, 0, 0);
    lR.kn.rotation.set(J.lR.k, 0, 0);
    lL.foot.rotation.set(-J.lL.x * 0.3 - J.lL.k * 0.5, 0, 0);
    lR.foot.rotation.set(-J.lR.x * 0.3 - J.lR.k * 0.5, 0, 0);

    // blink the eyes now and then (scale the whites)
    blinkT -= dt;
    const eyeS = blinkT < 0.12 ? 0.15 : 1;
    if (blinkT < 0) blinkT = 2.5 + Math.random() * 3;
    head.children.forEach((m) => {
      if (m.material === M.eyeW || m.material === M.eyeB || m.material === M.pupil) {
        if (m.userData.sy == null) m.userData.sy = m.scale.y;
        m.scale.y = m.userData.sy * eyeS;
      }
    });

    // star power: rainbow sheen; invulnerability: flicker
    const star = ctx.power && ctx.power.star > 0;
    if (star) {
      rainbow += dt * 6;
      tmpC.setHSL((rainbow * 0.25) % 1, 0.9, 0.55);
      for (const m of mats) m.emissive.copy(tmpC).multiplyScalar(0.55);
    } else if (rainbow) {
      rainbow = 0;
      for (const m of mats) m.emissive.setRGB(0, 0, 0);
    }
    root.visible = !(p.invuln > 0 && !star && p.hurtT <= 0 && Math.floor(ctx.t * 18) % 2 === 0);
  }

  function dispose() {
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    emblemTex.dispose();
  }

  return { root, animate, dispose, parts: { head, cap, body, hips } };
}
