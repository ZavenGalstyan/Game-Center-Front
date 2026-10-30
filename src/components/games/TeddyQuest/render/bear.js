/**
 * Toffee — the hero bear, built from simple low-poly primitives.
 * Big round head, round ears, tan muzzle and belly, shiny eyes, a red scarf
 * with a fluttering tail and a little green backpack.
 *
 * createBear() → { root, update(state, dt), setFlash(k), dispose() }
 * The model's feet sit at y = 0 and it faces +z (the sim's face angle 0).
 */
import * as THREE from "three";

const COL = {
  fur: 0x9b5a2c,
  furDark: 0x6e3c1b,
  tan: 0xf0c890,
  nose: 0x3a2214,
  eye: 0x1c1410,
  white: 0xffffff,
  scarf: 0xe8413b,
  scarf2: 0xffd23f,
  pack: 0x3fae5e,
  pack2: 0x2b8446,
  blush: 0xff8a8a,
};

export function createBear() {
  const geos = [];
  const mats = [];
  const mat = (color, extra = {}) => {
    const m = new THREE.MeshLambertMaterial({ color, ...extra });
    mats.push(m);
    return m;
  };
  const geo = (g) => {
    geos.push(g);
    return g;
  };
  const M = {
    fur: mat(COL.fur),
    furDark: mat(COL.furDark),
    tan: mat(COL.tan),
    nose: mat(COL.nose),
    eye: mat(COL.eye),
    white: mat(COL.white, { emissive: 0x222222 }),
    scarf: mat(COL.scarf),
    scarf2: mat(COL.scarf2),
    pack: mat(COL.pack),
    pack2: mat(COL.pack2),
    blush: mat(COL.blush, { transparent: true, opacity: 0.55 }),
  };
  const sphere = geo(new THREE.SphereGeometry(1, 16, 12));
  const sphereLo = geo(new THREE.SphereGeometry(1, 10, 8));
  const mesh = (g, m, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) => {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    o.scale.set(sx, sy, sz);
    return o;
  };

  const root = new THREE.Group();
  const body = new THREE.Group(); // bob / lean / squash
  root.add(body);

  // torso
  const torso = mesh(sphere, M.fur, 0, 0.56, 0, 0.4, 0.42, 0.36);
  const belly = mesh(sphere, M.tan, 0, 0.52, 0.19, 0.28, 0.3, 0.2);
  body.add(torso, belly);
  const tail = mesh(sphereLo, M.furDark, 0, 0.42, -0.34, 0.09);
  body.add(tail);

  // head
  const head = new THREE.Group();
  head.position.set(0, 1.0, 0.02);
  body.add(head);
  head.add(mesh(sphere, M.fur, 0, 0.05, 0, 0.37, 0.34, 0.33));
  head.add(mesh(sphere, M.tan, 0, -0.04, 0.27, 0.17, 0.12, 0.11)); // muzzle
  head.add(mesh(sphere, M.nose, 0, 0.02, 0.38, 0.07, 0.05, 0.05)); // nose
  head.add(mesh(sphereLo, M.white, 0.026, 0.035, 0.41, 0.018)); // nose shine
  const mouth = mesh(sphereLo, M.nose, 0, -0.09, 0.35, 0.05, 0.018, 0.02);
  head.add(mouth);
  const eyes = [];
  for (const sx of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(sx * 0.13, 0.11, 0.27);
    eye.add(mesh(sphere, M.eye, 0, 0, 0, 0.06, 0.075, 0.04));
    eye.add(mesh(sphereLo, M.white, sx * 0.012, 0.03, 0.03, 0.022));
    head.add(eye);
    eyes.push(eye);
    head.add(mesh(sphereLo, M.blush, sx * 0.22, -0.04, 0.22, 0.055, 0.035, 0.02)); // cheeks
    // brows
    const brow = mesh(sphereLo, M.furDark, sx * 0.13, 0.22, 0.27, 0.06, 0.015, 0.02);
    brow.rotation.z = sx * 0.12;
    head.add(brow);
  }
  const ears = [];
  for (const sx of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(sx * 0.26, 0.3, -0.02);
    ear.add(mesh(sphere, M.fur, 0, 0, 0, 0.13, 0.13, 0.08));
    ear.add(mesh(sphereLo, M.tan, 0, -0.01, 0.045, 0.08, 0.08, 0.04));
    head.add(ear);
    ears.push(ear);
  }

  // scarf: ring + fluttering tail
  const scarf = new THREE.Mesh(geo(new THREE.TorusGeometry(0.27, 0.075, 8, 18)), M.scarf);
  scarf.rotation.x = Math.PI / 2;
  scarf.position.set(0, 0.84, 0.0);
  scarf.scale.set(1, 1.1, 1);
  body.add(scarf);
  const stripe = new THREE.Mesh(geo(new THREE.TorusGeometry(0.275, 0.02, 6, 18)), M.scarf2);
  stripe.rotation.x = Math.PI / 2;
  stripe.position.set(0, 0.84, 0.0);
  body.add(stripe);
  const scarfTail = new THREE.Group();
  scarfTail.position.set(0.14, 0.82, -0.22);
  body.add(scarfTail);
  const tailGeo = geo(new THREE.BoxGeometry(0.13, 0.32, 0.04));
  tailGeo.translate(0, -0.16, 0);
  const t1 = new THREE.Mesh(tailGeo, M.scarf);
  scarfTail.add(t1);
  const t2 = new THREE.Mesh(tailGeo, M.scarf);
  t2.position.set(0.06, 0, -0.02);
  t2.rotation.z = -0.3;
  scarfTail.add(t2);

  // backpack
  const pack = new THREE.Group();
  pack.position.set(0, 0.62, -0.33);
  body.add(pack);
  const packBox = geo(new THREE.BoxGeometry(0.4, 0.42, 0.2));
  pack.add(new THREE.Mesh(packBox, M.pack));
  const flap = new THREE.Mesh(geo(new THREE.BoxGeometry(0.42, 0.16, 0.22)), M.pack2);
  flap.position.set(0, 0.16, 0.0);
  pack.add(flap);
  const pocket = new THREE.Mesh(geo(new THREE.BoxGeometry(0.24, 0.14, 0.06)), M.pack2);
  pocket.position.set(0, -0.08, -0.12);
  pack.add(pocket);
  pack.add(mesh(sphereLo, M.scarf2, 0, 0.12, -0.12, 0.04)); // buckle
  for (const sx of [-1, 1]) {
    const strap = new THREE.Mesh(geo(new THREE.BoxGeometry(0.06, 0.4, 0.05)), M.pack2);
    strap.position.set(sx * 0.15, 0.68, 0.27);
    strap.rotation.x = 0.35;
    body.add(strap);
  }

  // limbs (pivot groups)
  const limbGeo = geo(new THREE.CapsuleGeometry(0.1, 0.2, 4, 8));
  limbGeo.translate(0, -0.16, 0);
  const legGeo = geo(new THREE.CapsuleGeometry(0.12, 0.1, 4, 8));
  legGeo.translate(0, -0.13, 0);
  const arms = [];
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(sx * 0.35, 0.74, 0.02);
    arm.add(new THREE.Mesh(limbGeo, M.fur));
    arm.add(mesh(sphereLo, M.tan, 0, -0.33, 0.03, 0.08, 0.07, 0.07)); // paw pad
    body.add(arm);
    arms.push(arm);
  }
  const legs = [];
  for (const sx of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(sx * 0.17, 0.3, 0);
    leg.add(new THREE.Mesh(legGeo, M.fur));
    leg.add(mesh(sphere, M.furDark, 0, -0.27, 0.06, 0.13, 0.07, 0.17)); // foot
    leg.add(mesh(sphereLo, M.tan, 0, -0.26, 0.2, 0.07, 0.05, 0.03)); // toe pad
    root.add(leg);
    legs.push(leg);
  }

  // swipe effect (visible attack): a translucent arc in front of the bear
  const swipeMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  mats.push(swipeMat);
  const swipe = new THREE.Mesh(geo(new THREE.RingGeometry(0.9, 1.7, 24, 1, -Math.PI * 0.92, Math.PI * 0.84)), swipeMat);
  swipe.rotation.x = -Math.PI / 2;
  swipe.position.y = 0.65;
  root.add(swipe);

  root.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });

  let phase = 0;
  let land = 0;
  let blinkT = 2;
  let flash = 0;
  const tint = new THREE.Color(0xff3030);
  const flashables = [M.fur, M.furDark, M.tan];

  function setFlash(k) {
    if (k === flash) return;
    flash = k;
    for (const m of flashables) m.emissive.copy(tint).multiplyScalar(k * 0.6);
  }

  /**
   * s: { speed, grounded, vy, attackT, hitT, inv, mode ('play'|'victory'|'ko'|'menu'), t, landed }
   */
  function update(s, dt) {
    const t = s.t;
    const run = Math.min(1, s.speed / 8);
    const moving = s.grounded && s.speed > 0.4;
    phase += dt * (moving ? 6 + s.speed * 1.6 : 0);
    if (s.landed) land = 1;
    land = Math.max(0, land - dt * 5);

    // reset
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    body.scale.set(1, 1, 1);
    head.rotation.set(0, 0, 0);
    for (const a of arms) a.rotation.set(0, 0, 0);
    for (const l of legs) l.rotation.set(0, 0, 0);
    arms[0].rotation.z = -0.15;
    arms[1].rotation.z = 0.15;

    // blink
    blinkT -= dt;
    const blink = blinkT < 0.12 ? 0.15 : 1;
    if (blinkT < 0) blinkT = 2 + ((t * 7.3) % 2.5);
    for (const e of eyes) e.scale.y = blink;
    mouth.scale.set(0.05, 0.018, 0.02);

    if (s.mode === "ko") {
      body.rotation.x = -1.25;
      body.position.y = 0.15;
      body.position.z = -0.3;
      for (const e of eyes) e.scale.y = 0.15;
      arms[0].rotation.z = -1.2;
      arms[1].rotation.z = 1.2;
      head.rotation.z = Math.sin(t * 6) * 0.2;
    } else if (s.mode === "victory") {
      const h = Math.abs(Math.sin(t * 5));
      body.position.y = h * 0.35;
      arms[0].rotation.z = -2.6 + Math.sin(t * 10) * 0.3;
      arms[1].rotation.z = 2.6 - Math.sin(t * 10) * 0.3;
      legs[0].rotation.x = -h * 0.5;
      legs[1].rotation.x = -h * 0.5;
      mouth.scale.set(0.07, 0.04, 0.03);
      head.rotation.z = Math.sin(t * 5) * 0.12;
    } else if (!s.grounded) {
      // jump: stretch going up, arms up, knees tucked
      const up = s.vy > 0;
      body.scale.set(up ? 0.93 : 1.02, up ? 1.08 : 0.98, up ? 0.93 : 1.02);
      arms[0].rotation.z = up ? -2.3 : -1.6;
      arms[1].rotation.z = up ? 2.3 : 1.6;
      legs[0].rotation.x = up ? -0.7 : -0.3;
      legs[1].rotation.x = up ? -0.2 : 0.2;
      body.rotation.x = 0.12;
      mouth.scale.set(0.06, 0.035, 0.025);
    } else if (moving) {
      const sw = Math.sin(phase);
      const amp = 0.55 + run * 0.4;
      legs[0].rotation.x = sw * amp;
      legs[1].rotation.x = -sw * amp;
      arms[0].rotation.x = -sw * amp * 0.9;
      arms[1].rotation.x = sw * amp * 0.9;
      body.position.y = Math.abs(Math.cos(phase)) * (0.05 + run * 0.06);
      body.rotation.x = 0.08 + run * 0.18;
      body.rotation.z = sw * 0.05;
      head.rotation.x = -run * 0.1;
    } else {
      // idle breathing + look around
      const br = Math.sin(t * 2.2);
      body.scale.set(1 + br * 0.012, 1 - br * 0.012, 1 + br * 0.012);
      head.rotation.y = Math.sin(t * 0.7) * 0.25;
      head.rotation.z = Math.sin(t * 1.1) * 0.05;
      arms[0].rotation.z = -0.15 - br * 0.05;
      arms[1].rotation.z = 0.15 + br * 0.05;
    }
    // landing squash
    if (land > 0 && s.grounded) body.scale.set(1 + land * 0.12, 1 - land * 0.16, 1 + land * 0.12);

    // attack: a quick paw swipe with a body twist + visible arc
    if (s.attackT >= 0) {
      const k = Math.min(1, s.attackT / 0.3);
      const e = Math.sin(k * Math.PI);
      body.rotation.y = -0.9 + k * 1.8;
      arms[1].rotation.x = -1.5;
      arms[1].rotation.z = 0.4 + e * 0.6;
      arms[0].rotation.x = -0.8 * e;
      swipe.rotation.z = -0.9 + k * 1.8;
      swipeMat.opacity = Math.max(0, 0.75 * Math.sin(Math.min(1, k * 1.15) * Math.PI));
      swipe.visible = true;
      mouth.scale.set(0.06, 0.03, 0.025);
    } else {
      swipe.visible = false;
      swipeMat.opacity = 0;
    }
    // hurt flinch
    if (s.hitT > 0) {
      body.rotation.x = -0.4;
      for (const e of eyes) e.scale.y = 0.25;
      arms[0].rotation.z = -1;
      arms[1].rotation.z = 1;
    }

    // ears + scarf tail follow the motion
    ears[0].rotation.z = Math.sin(t * 3) * 0.05 + (s.grounded ? 0 : 0.2);
    ears[1].rotation.z = -Math.sin(t * 3) * 0.05 - (s.grounded ? 0 : 0.2);
    scarfTail.rotation.x = 0.3 + run * 0.9 + Math.sin(t * 12) * 0.12 * (0.3 + run) + (s.grounded ? 0 : s.vy > 0 ? -0.2 : 0.6);
    scarfTail.rotation.z = Math.sin(t * 9) * 0.15;

    // invulnerability blink + hurt tint
    root.visible = !(s.inv > 0 && s.mode === "play" && Math.floor(t * 14) % 2 === 0);
    setFlash(s.hitT > 0 ? 1 : 0);
  }

  function dispose() {
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
  }

  return { root, update, setFlash, dispose };
}
