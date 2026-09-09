/**
 * Delivery Rush — the player's car.
 *
 * One parametric builder covers all five vehicles. The `body` block in
 * data/vehicles.js gives real automotive proportions — sill height, waist
 * (door) height, greenhouse height and where the cabin starts and ends — and
 * this assembles them into a car with the silhouette you expect:
 *
 *   wheels + arches  ->  sill  ->  body tub  ->  bonnet and boot lids
 *   ->  cowl  ->  raked windscreen  ->  A/B/C pillars  ->  roof
 *
 * Building the greenhouse from pillars and glass rather than one opaque box is
 * what stops the car reading as a brick: you can see through it, and the roof
 * sits on visible posts.
 *
 * It is assembled per material — paint, dark trim, glass, chrome, plus three
 * separately switchable light materials — so the whole car is nine draw calls
 * and the brake lights brighten without touching geometry.
 *
 * Local frame: +Z is forward, +X is right, y = 0 is the road.
 */

import * as THREE from "three";
import { MeshAcc } from "./geom.js";
import { rgb, shade, mix } from "./palette.js";

export function buildVehicle(body, paintHex, opts = {}) {
  const { livery = true } = opts;
  const paint = rgb(paintHex);
  const dark = rgb("#20242a");
  const chrome = rgb("#aeb6bd");
  const glassCol = rgb("#16212c");
  const trimDark = shade(dark, 1.45);

  const A = {
    paint: new MeshAcc(3072),
    dark: new MeshAcc(1536),
    glass: new MeshAcc(768),
    chrome: new MeshAcc(768),
    head: new MeshAcc(128),
    tail: new MeshAcc(128),
    reverse: new MeshAcc(64),
    sign: new MeshAcc(192),
  };

  const L = body.length;
  const W = body.width;
  const wr = body.wheelR;
  const sill = body.sill; // underside of the doors
  const waist = body.waist; // door height
  const belt = sill + waist; // beltline: where the glass starts
  const cabinH = body.cabinH;
  const roofY = belt + cabinH;
  const cs = body.cabinBack;
  const ce = body.cabinFront;
  const cabinLen = ce - cs;
  const cabinZ = (cs + ce) / 2;
  const boxy = body.kind === "van" || body.kind === "boxvan";
  const cabinW = W * (boxy ? 0.985 : 0.9);
  const nose = L / 2;
  const tail = -L / 2;

  const axleF = L * 0.315;
  const axleR = body.kind === "boxvan" ? -L * 0.26 : -L * 0.315;

  /* ------------------------------------------------------------- body tub */

  // main volume: doors and flanks
  A.paint.add("box", [0, sill + waist / 2, 0], [W, waist, L * 0.99], paint);
  // shoulder: a slightly narrower cap so the flanks are not a single slab
  A.paint.add("box", [0, belt - 0.05, 0], [W * 1.005, 0.12, L * 0.94], shade(paint, 1.07));
  // sill / rocker panel
  A.dark.add("box", [0, sill + 0.03, 0], [W * 1.004, 0.14, L * 0.8], trimDark);
  // underbody
  A.dark.add("box", [0, sill * 0.55, 0], [W * 0.88, sill * 0.9, L * 0.9], shade(dark, 0.7));

  /* --------------------------------------------------------------- bonnet */

  const bonnetLen = nose - ce;
  if (bonnetLen > 0.3) {
    const bz = (ce + nose) / 2;
    // lid sits a touch below the beltline and noses down toward the bumper
    A.paint.add("box", [0, belt - 0.02, bz], [W * 0.965, 0.11, bonnetLen], shade(paint, 1.04), [-0.045, 0, 0]);
    A.dark.add("box", [0, belt - 0.02, ce + 0.02], [W * 0.9, 0.05, 0.1], trimDark); // shut line
    // cowl / wiper trough at the base of the windscreen
    A.dark.add("box", [0, belt + 0.03, ce + 0.06], [cabinW * 0.94, 0.07, 0.2], shade(dark, 1.2));
  }

  /* ------------------------------------------------------- boot / tailgate */

  const bootLen = cs - tail;
  if (bootLen > 0.3 && !boxy) {
    const bz = (tail + cs) / 2;
    A.paint.add("box", [0, belt - 0.02, bz], [W * 0.965, 0.11, bootLen], shade(paint, 1.02), [0.03, 0, 0]);
  }

  /* ------------------------------------------------------------ greenhouse */

  const rakeF = Math.atan2(Math.min(0.55, cabinLen * 0.32), cabinH);
  const rakeR = Math.atan2(Math.min(body.rearSlope ?? 0.3, cabinLen * 0.36), cabinH);
  const pillar = boxy ? 0.11 : 0.085;

  // roof panel
  A.paint.add(
    "box",
    [0, roofY - 0.035, cabinZ + (rakeF - rakeR) * 0.12],
    [cabinW * 0.99, 0.08, cabinLen * 0.86],
    shade(paint, 1.11),
  );
  A.chrome.add("box", [0, roofY - 0.09, 0], [cabinW + 0.015, 0.03, cabinLen * 0.9], chrome); // drip rail

  // windscreen and rear screen, raked
  const wsY = belt + cabinH * 0.5;
  A.glass.add(
    "box",
    [0, wsY, ce - Math.tan(rakeF) * cabinH * 0.5 + 0.02],
    [cabinW * 0.9, cabinH / Math.cos(rakeF) - 0.04, 0.05],
    glassCol,
    [-rakeF, 0, 0],
  );
  A.glass.add(
    "box",
    [0, wsY, cs + Math.tan(rakeR) * cabinH * 0.5 - 0.02],
    [cabinW * 0.88, cabinH / Math.cos(rakeR) - 0.05, 0.05],
    glassCol,
    [rakeR, 0, 0],
  );

  // pillars: A at the windscreen, C at the rear screen, B in between
  for (const sx of [-1, 1]) {
    const px = sx * (cabinW / 2 - pillar * 0.45);
    A.paint.add(
      "box",
      [px, wsY, ce - Math.tan(rakeF) * cabinH * 0.5],
      [pillar, cabinH / Math.cos(rakeF), pillar * 1.5],
      shade(paint, 0.96),
      [-rakeF, 0, 0],
    );
    A.paint.add(
      "box",
      [px, wsY, cs + Math.tan(rakeR) * cabinH * 0.5],
      [pillar, cabinH / Math.cos(rakeR), pillar * 1.6],
      shade(paint, 0.92),
      [rakeR, 0, 0],
    );
    if (cabinLen > 1.5) {
      A.paint.add("box", [px, wsY, cabinZ + cabinLen * 0.02], [pillar, cabinH, pillar * 1.3], shade(paint, 0.9));
    }
    // side glass between the pillars
    const gz0 = cs + Math.tan(rakeR) * cabinH + pillar;
    const gz1 = ce - Math.tan(rakeF) * cabinH - pillar;
    if (gz1 - gz0 > 0.2) {
      A.glass.add(
        "box",
        [sx * (cabinW / 2 - 0.012), belt + cabinH * 0.47, (gz0 + gz1) / 2],
        [0.05, cabinH * 0.78, gz1 - gz0],
        glassCol,
      );
    }
    // door mirror on a short stalk
    A.dark.add("box", [sx * (cabinW / 2 + 0.09), belt + 0.1, ce - 0.16], [0.14, 0.05, 0.05], trimDark);
    A.paint.add("box", [sx * (cabinW / 2 + 0.19), belt + 0.11, ce - 0.18], [0.07, 0.12, 0.16], shade(paint, 0.94));
  }

  /* ---------------------------------------------------- cargo box (vans) */

  if (body.cargoBox) {
    const boxLen = cs - tail;
    const bz = (tail + cs) / 2 + 0.05;
    A.paint.add("box", [0, sill + body.cargoBox / 2 + 0.12, bz], [W * 1.01, body.cargoBox, boxLen], shade(paint, 1.05));
    A.dark.add("box", [0, sill + body.cargoBox + 0.08, bz], [W * 1.03, 0.1, boxLen + 0.04], trimDark);
    A.dark.add("box", [0, sill + body.cargoBox / 2 + 0.12, tail + 0.06], [W * 0.9, body.cargoBox * 0.86, 0.08], shade(dark, 1.35));
    for (let i = -3; i <= 3; i++) {
      A.paint.add("box", [W / 2 + 0.01, sill + body.cargoBox / 2 + 0.12, bz + i * (boxLen / 8)], [0.03, body.cargoBox * 0.9, 0.06], shade(paint, 0.9));
      A.paint.add("box", [-W / 2 - 0.01, sill + body.cargoBox / 2 + 0.12, bz + i * (boxLen / 8)], [0.03, body.cargoBox * 0.9, 0.06], shade(paint, 0.9));
    }
  } else if (body.panel) {
    // panel van: blanked-out rear side, one small window
    A.paint.add("box", [0, belt + cabinH / 2, (tail + cs) / 2 + 0.4], [cabinW, cabinH, cs - tail - 0.6], shade(paint, 1.0));
    A.paint.add("box", [0, roofY - 0.04, (tail + cs) / 2 + 0.4], [cabinW * 0.99, 0.08, cs - tail - 0.7], shade(paint, 1.1));
    A.dark.add("box", [0, belt + cabinH / 2, tail + 0.08], [cabinW * 0.94, cabinH * 0.92, 0.08], shade(dark, 1.3));
    for (const sx of [-1, 1]) {
      A.glass.add("box", [sx * (cabinW / 2 - 0.01), belt + cabinH * 0.62, tail + 0.55], [0.05, cabinH * 0.42, 0.7], glassCol);
    }
  }

  /* ---------------------------------------------------- arches and wheels */

  for (const sx of [-1, 1]) {
    for (const az of [axleF, axleR]) {
      // flared arch lip
      A.paint.add("box", [sx * (W / 2 + 0.02), sill + 0.16, az], [0.075, 0.2, wr * 2.55], shade(paint, 0.86));
      // wheel well shadow
      A.dark.add("box", [sx * (W / 2 - 0.03), wr * 0.92, az], [0.09, wr * 0.8, wr * 2.35], shade(dark, 0.6));
    }
  }

  /* --------------------------------------------------- bumpers and lights */

  const bumperY = sill + 0.16;
  A.dark.add("box", [0, bumperY, nose - 0.07], [W * 0.99, 0.34, 0.2], trimDark);
  A.dark.add("box", [0, bumperY, tail + 0.07], [W * 0.99, 0.34, 0.2], trimDark);
  A.dark.add("box", [0, bumperY - 0.16, nose - 0.14], [W * 0.8, 0.12, 0.24], shade(dark, 0.8)); // air dam
  // grille
  const grillY = belt - 0.16;
  A.dark.add("box", [0, grillY, nose - 0.04], [W * 0.52, 0.2, 0.12], shade(dark, 1.35));
  A.chrome.add("box", [0, grillY, nose - 0.01], [W * 0.56, 0.05, 0.1], chrome);
  // plates
  A.chrome.add("box", [0, bumperY + 0.02, nose + 0.03], [0.5, 0.16, 0.03], rgb("#e8e6dc"));
  A.chrome.add("box", [0, bumperY + 0.02, tail - 0.03], [0.5, 0.16, 0.03], rgb("#e8e6dc"));

  const hy = belt - 0.14;
  for (const sx of [-1, 1]) {
    A.chrome.add("box", [sx * (W * 0.325), hy, nose - 0.05], [W * 0.26, 0.19, 0.09], shade(chrome, 0.55));
    A.head.add("box", [sx * (W * 0.325), hy, nose - 0.01], [W * 0.23, 0.15, 0.06], rgb("#fff6e0"));
    A.tail.add("box", [sx * (W * 0.33), hy + 0.05, tail + 0.01], [W * 0.22, 0.18, 0.06], rgb("#ff3020"));
    A.chrome.add("box", [sx * (W * 0.46), hy - 0.02, nose - 0.13], [0.06, 0.11, 0.14], rgb("#e8a33a"));
  }
  A.reverse.add("box", [0, hy - 0.02, tail + 0.01], [W * 0.18, 0.09, 0.05], rgb("#f4f6ff"));

  /* --------------------------------------------------------------- detail */

  for (const sx of [-1, 1]) {
    // door shut line + handle
    A.dark.add("box", [sx * (W / 2 + 0.004), belt - waist * 0.45, cs + cabinLen * 0.06], [0.012, waist * 0.8, 0.03], shade(dark, 1.7));
    A.chrome.add("box", [sx * (W / 2 + 0.018), belt - 0.13, cabinZ - 0.08], [0.028, 0.05, 0.2], chrome);
    // wiper
    A.dark.add("box", [sx * 0.2, belt + 0.08, ce - 0.02], [0.035, 0.03, 0.38], shade(dark, 1.6), [0, sx * -0.26, 0]);
  }
  // exhaust
  A.chrome.add("box", [W * 0.3, sill * 0.7, tail - 0.02], [0.1, 0.09, 0.12], shade(chrome, 0.7));

  if (body.spoiler) {
    A.paint.add("box", [0, roofY - 0.02, cs + 0.02], [cabinW * 0.94, 0.05, 0.26], shade(paint, 0.93), [0.2, 0, 0]);
    A.dark.add("box", [0, bumperY - 0.06, tail - 0.06], [W * 0.74, 0.1, 0.2], shade(dark, 1.15), [0.28, 0, 0]);
  }

  if (body.emissiveTrim) {
    A.sign.add("box", [0, sill * 0.5, 0], [W * 0.82, 0.045, L * 0.66], rgb("#5ce8ff"));
    for (const sx of [-1, 1]) {
      A.sign.add("box", [sx * (W / 2 + 0.008), belt - waist * 0.55, cabinZ], [0.025, 0.045, cabinLen * 0.75], rgb("#5ce8ff"));
    }
  }

  // delivery livery: a lit rooftop sign box and a body stripe
  if (livery && body.boxSign) {
    const sy = roofY + 0.17;
    A.paint.add("box", [0, sy, cabinZ + 0.06], [0.62, 0.3, 0.22], rgb("#f2f4f7"));
    A.sign.add("box", [0, sy, cabinZ + 0.18], [0.56, 0.22, 0.03], rgb("#ffcf5a"));
    A.dark.add("box", [0, sy - 0.18, cabinZ + 0.06], [0.09, 0.1, 0.09], dark);
  }
  if (livery) {
    for (const sx of [-1, 1]) {
      A.chrome.add(
        "box",
        [sx * (W / 2 + 0.01), belt - waist * 0.4, cabinZ + 0.05],
        [0.016, waist * 0.34, Math.min(1.2, cabinLen * 0.6)],
        mix(rgb("#ffffff"), paint, 0.1),
      );
    }
  }

  /* --------------------------------------------------------------- meshes */

  const group = new THREE.Group();
  const materials = {};
  const geometries = [];

  // Real-time shadow-casting from the vehicle is intentionally off — see the
  // fake ground blob below. In testing, a shadow-casting car (small, fast-
  // moving, followed every frame by the shadow camera) produced a uniform
  // false-shadow wash across the entire visible ground that no amount of
  // bias/resolution tuning fixed, the signature of a renderer edge case
  // rather than a real per-pixel shadow — not a risk worth keeping for a
  // handful of self-shadowed body panels.
  const add = (acc, mat) => {
    if (acc.empty) return null;
    const geo = acc.build();
    geometries.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = false;
    m.receiveShadow = false;
    group.add(m);
    return m;
  };

  // envMapIntensity is kept low on the paint so the player's chosen colour
  // stays true rather than washing toward the sky's own tint; glass and
  // chrome want the opposite — that's what makes them read as glass and metal.
  materials.paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.32, envMapIntensity: 0.3 });
  materials.dark = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.18, envMapIntensity: 0.1 });
  materials.glass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.06, metalness: 0.9, envMapIntensity: 1.5 });
  materials.chrome = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.85, envMapIntensity: 1.3 });
  materials.head = new THREE.MeshBasicMaterial({ vertexColors: true });
  materials.tail = new THREE.MeshBasicMaterial({ vertexColors: true });
  materials.reverse = new THREE.MeshBasicMaterial({ vertexColors: true });
  materials.sign = new THREE.MeshBasicMaterial({ vertexColors: true });

  add(A.paint, materials.paint);
  add(A.dark, materials.dark);
  add(A.glass, materials.glass);
  add(A.chrome, materials.chrome);
  add(A.head, materials.head);
  add(A.tail, materials.tail);
  add(A.reverse, materials.reverse);
  add(A.sign, materials.sign);

  /* --------------------------------------------------------------- wheels */

  const wheelGeo = makeWheelGeometry(wr, W * 0.125 + 0.05);
  geometries.push(wheelGeo);
  const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.15, envMapIntensity: 0.15 });
  materials.wheel = wheelMat;

  // pivot (steers about Y) -> spinner (rolls about X) -> mesh (axle laid flat)
  const wheels = [];
  const steered = [];
  for (const sx of [-1, 1]) {
    for (const az of [axleF, axleR]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * (W / 2 - 0.075), wr, az);
      const spinner = new THREE.Group();
      const mesh = new THREE.Mesh(wheelGeo, wheelMat);
      mesh.castShadow = false;
      mesh.rotation.z = Math.PI / 2;
      spinner.add(mesh);
      pivot.add(spinner);
      group.add(pivot);
      wheels.push(spinner);
      if (az > 0) steered.push(pivot);
    }
  }

  const shadow = createShadowBlob(L, W);

  const dispose = () => {
    for (const g of geometries) g.dispose();
    for (const k of Object.keys(materials)) materials[k].dispose();
    shadow.dispose();
  };

  return {
    group,
    materials,
    wheels,
    steered,
    // A flat ground decal, not a child of `group` — the body's drive-feel
    // pitch/roll must never tilt a shadow that is supposed to lie flat on
    // the road. The caller positions/rotates it (x, z, yaw) each frame.
    shadow,
    dims: { L, W, wr, belt, top: roofY, roofY },
    setPaint(hex) {
      materials.paint.color.set(hex);
    },
    dispose,
  };
}

/**
 * A cheap, always-correct stand-in for a real-time vehicle shadow: a soft
 * dark oval decal lying flat on the ground, sized to the vehicle footprint.
 * This is deliberately not a real shadow — see the note above `add()` in
 * buildVehicle. Shared by the player car and the traffic fleet.
 */
export function createShadowBlob(length, width, opacity = 0.34) {
  const geo = new THREE.CircleGeometry(1, 22).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  // CircleGeometry's rotateX(-90°) keeps local X as-is and turns its Y into Z,
  // so X is the "sideways" axis and Z is "forward/back" — width goes on X,
  // length goes on Z, matching this project's +Z-forward convention, so the
  // oval's long axis lines up with the car once `.rotation.y` (yaw) is set.
  mesh.scale.set(width * 0.56, 1, length * 0.5);
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  return {
    mesh,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

/** Tyre + dished rim + spokes, built once and shared by all four corners. */
function makeWheelGeometry(r, width) {
  const acc = new MeshAcc(512);
  const tyre = rgb("#191b1e");
  const rim = rgb("#c2c8ce");
  const hub = rgb("#7d858c");
  // the builder's cylinders run along Y; the caller lays the wheel on its side
  acc.add("cyl16", [0, 0, 0], [r * 2, width, r * 2], tyre);
  acc.add("cyl16", [0, 0, 0], [r * 1.3, width * 1.01, r * 1.3], shade(tyre, 1.4));
  for (const s of [-1, 1]) {
    acc.add("cyl12", [0, s * width * 0.46, 0], [r * 1.16, width * 0.12, r * 1.16], rim);
    acc.add("cyl8", [0, s * width * 0.53, 0], [r * 0.4, width * 0.08, r * 0.4], hub);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      acc.add(
        "box",
        [Math.cos(a) * r * 0.58, s * width * 0.5, Math.sin(a) * r * 0.58],
        [r * 0.66, width * 0.1, r * 0.2],
        shade(rim, 0.94),
        -a,
      );
    }
  }
  return acc.build();
}
