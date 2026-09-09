/**
 * Delivery Rush — the traffic fleet.
 *
 * Five silhouettes (compact, sedan, taxi, van, box truck) built with the same
 * accumulator as everything else, but kept as bare geometry so the traffic
 * system can render each type with an InstancedMesh.
 *
 * Paint is the one thing that varies per car, so the paint channel is authored
 * in near-white shading values and tinted at runtime through instanceColor —
 * ten cars of one type, ten colours, one draw call.
 */

import * as THREE from "three";
import { MeshAcc } from "./geom.js";
import { rgb, shade } from "./palette.js";

const WHITE = [1, 1, 1];
const DARK = rgb("#20242a");
const TYRE = rgb("#141618");
const GLASS = rgb("#1d2a36");
const CHROME = rgb("#a8b0b8");

export const TRAFFIC_TYPES = [
  { id: "compact", L: 3.75, W: 1.76, H: 0.98, wr: 0.31, cabin: [-0.35, 0.85], speed: 1.0 },
  { id: "sedan", L: 4.5, W: 1.84, H: 1.04, wr: 0.33, cabin: [-0.55, 0.95], speed: 1.05 },
  { id: "taxi", L: 4.45, W: 1.84, H: 1.08, wr: 0.33, cabin: [-0.55, 0.95], speed: 1.0, taxi: true },
  { id: "van", L: 5.1, W: 2.0, H: 1.62, wr: 0.36, cabin: [0.4, 1.75], speed: 0.9 },
  { id: "truck", L: 7.3, W: 2.32, H: 2.5, wr: 0.45, cabin: [2.0, 3.3], speed: 0.78, truck: true },
];

/** Build every type once. Returns geometries + the per-type collision size. */
export function buildTrafficGeometries() {
  return TRAFFIC_TYPES.map((t) => {
    const A = {
      paint: new MeshAcc(1024),
      dark: new MeshAcc(512),
      glass: new MeshAcc(256),
      lights: new MeshAcc(128),
    };
    if (t.truck) drawTruck(A, t);
    else drawCar(A, t);
    return {
      id: t.id,
      paint: A.paint.build(),
      dark: A.dark.build(),
      glass: A.glass.build(),
      lights: A.lights.build(),
      L: t.L,
      W: t.W,
      hw: t.W / 2 + 0.15,
      hd: t.L / 2 + 0.15,
      speed: t.speed,
    };
  });
}

function wheels(A, t) {
  const axleF = t.L * 0.32;
  const axleR = -t.L * 0.32;
  for (const sx of [-1, 1]) {
    for (const az of [axleF, axleR]) {
      A.dark.add(
        "cyl8",
        [sx * (t.W / 2 - 0.08), t.wr, az],
        [t.wr * 2, t.W * 0.15, t.wr * 2],
        TYRE,
        [0, 0, Math.PI / 2],
      );
    }
  }
}

function drawCar(A, t) {
  const floor = t.wr * 0.62;
  const bodyY = floor + t.H / 2;
  const top = floor + t.H;
  const [cs, ce] = t.cabin;
  const cabinH = t.H * (t.H > 1.3 ? 0.62 : 0.72);
  const cabinW = t.W * (t.H > 1.3 ? 0.98 : 0.92);

  A.paint.add("box", [0, bodyY, 0], [t.W, t.H, t.L], WHITE);
  A.paint.add("box", [0, top + cabinH / 2, (cs + ce) / 2], [cabinW, cabinH, ce - cs], [0.94, 0.94, 0.94]);
  A.paint.add("box", [0, top + cabinH - 0.03, (cs + ce) / 2], [cabinW * 0.96, 0.07, (ce - cs) * 0.96], [1.06, 1.06, 1.06]);

  A.glass.add("box", [0, top + cabinH * 0.55, ce - 0.03], [cabinW * 0.9, cabinH * 0.82, 0.05], GLASS, [-0.3, 0, 0]);
  A.glass.add("box", [0, top + cabinH * 0.55, cs + 0.03], [cabinW * 0.88, cabinH * 0.76, 0.05], GLASS, [0.28, 0, 0]);
  for (const sx of [-1, 1]) {
    A.glass.add(
      "box",
      [sx * (cabinW / 2 - 0.01), top + cabinH * 0.56, (cs + ce) / 2],
      [0.05, cabinH * 0.6, (ce - cs) * 0.78],
      GLASS,
    );
  }

  A.dark.add("box", [0, floor + 0.06, 0], [t.W * 1.01, 0.14, t.L * 0.85], [0.8, 0.8, 0.8]);
  A.dark.add("box", [0, floor + 0.26, t.L / 2 - 0.05], [t.W * 0.97, 0.3, 0.18], DARK);
  A.dark.add("box", [0, floor + 0.26, -t.L / 2 + 0.05], [t.W * 0.97, 0.3, 0.18], DARK);
  A.dark.add("box", [0, floor + 0.56, t.L / 2 - 0.03], [t.W * 0.44, 0.2, 0.1], shade(DARK, 1.3));

  for (const sx of [-1, 1]) {
    A.lights.add("box", [sx * t.W * 0.32, floor + 0.62, t.L / 2 - 0.01], [t.W * 0.22, 0.14, 0.08], rgb("#fff2d6"));
    A.lights.add("box", [sx * t.W * 0.32, floor + 0.66, -t.L / 2 + 0.01], [t.W * 0.2, 0.15, 0.08], rgb("#d63a2a"));
  }

  if (t.taxi) {
    A.lights.add("box", [0, top + cabinH + 0.14, (cs + ce) / 2], [0.62, 0.2, 0.24], rgb("#ffd24a"));
    for (const sx of [-1, 1]) {
      A.dark.add("box", [sx * (t.W / 2 + 0.01), top - 0.26, 0], [0.02, 0.26, t.L * 0.42], [1.4, 1.4, 1.4]);
    }
  }
  wheels(A, t);
}

function drawTruck(A, t) {
  const floor = t.wr * 0.7;
  const [cs, ce] = t.cabin;
  const cabH = 1.85;
  const boxH = t.H;

  // chassis
  A.dark.add("box", [0, floor + 0.22, 0], [t.W * 0.86, 0.3, t.L * 0.95], DARK);
  // cab
  A.paint.add("box", [0, floor + 0.3 + cabH / 2, (cs + ce) / 2], [t.W, cabH, ce - cs], WHITE);
  A.glass.add("box", [0, floor + 1.55, ce - 0.04], [t.W * 0.88, 0.85, 0.06], GLASS, [-0.12, 0, 0]);
  for (const sx of [-1, 1]) {
    A.glass.add("box", [sx * (t.W / 2 - 0.02), floor + 1.5, (cs + ce) / 2], [0.05, 0.7, (ce - cs) * 0.55], GLASS);
    A.dark.add("box", [sx * (t.W / 2 + 0.14), floor + 1.75, ce - 0.2], [0.12, 0.4, 0.1], DARK);
  }
  // box body
  const boxZ = (-t.L / 2 + cs) / 2;
  A.paint.add("box", [0, floor + 0.5 + boxH / 2, boxZ], [t.W * 1.02, boxH, cs + t.L / 2 - 0.2], [1.05, 1.05, 1.05]);
  A.dark.add("box", [0, floor + 0.5 + boxH - 0.06, boxZ], [t.W * 1.05, 0.12, cs + t.L / 2 - 0.15], [0.85, 0.85, 0.85]);
  A.dark.add("box", [0, floor + 0.5 + boxH / 2, -t.L / 2 + 0.06], [t.W * 0.92, boxH * 0.86, 0.1], [0.75, 0.75, 0.75]);
  A.dark.add("box", [0, floor + 0.42, t.L / 2 - 0.06], [t.W * 0.94, 0.4, 0.2], DARK);

  for (const sx of [-1, 1]) {
    A.lights.add("box", [sx * t.W * 0.34, floor + 0.72, t.L / 2 - 0.02], [t.W * 0.2, 0.18, 0.08], rgb("#fff2d6"));
    A.lights.add("box", [sx * t.W * 0.34, floor + 0.8, -t.L / 2 + 0.02], [t.W * 0.16, 0.2, 0.08], rgb("#d63a2a"));
    A.lights.add("box", [sx * t.W * 0.3, floor + 0.5 + boxH + 0.06, boxZ + 1.4], [0.12, 0.08, 0.12], rgb("#ffb03a"));
  }
  wheels(A, t);
  // second rear axle
  for (const sx of [-1, 1]) {
    A.dark.add(
      "cyl8",
      [sx * (t.W / 2 - 0.1), t.wr, -t.L * 0.32 + 1.1],
      [t.wr * 2, t.W * 0.15, t.wr * 2],
      TYRE,
      [0, 0, Math.PI / 2],
    );
  }
}

/** Materials shared by every traffic InstancedMesh. */
export function trafficMaterials(theme) {
  return {
    paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.22, envMapIntensity: 0.3 }),
    dark: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.1, envMapIntensity: 0.1 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.8, envMapIntensity: 1.3 }),
    lights: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
}
