/**
 * Delivery Rush — headlight beams.
 *
 * Real shadow-casting spotlights on every car would be the obvious approach and
 * the wrong one in a browser. Instead each headlight is a flat additive wedge
 * lying just above the road, fading out along its length, plus (on High only) a
 * single non-shadowing spotlight so nearby geometry genuinely picks up light.
 *
 * At night on wet asphalt this is most of what sells Midnight Metro.
 */

import * as THREE from "three";
import { MeshAcc } from "../world/geom.js";

export function createHeadlights(dims, { quality = "high", night = false } = {}) {
  const group = new THREE.Group();
  group.name = "headlights";

  const acc = new MeshAcc(256);
  const near = dims.L / 2 + 0.2;
  const far = near + 17;
  const halfNear = dims.W * 0.42;
  const halfFar = dims.W * 2.5;
  const y = 0.045;
  const bright = [1, 0.94, 0.78];
  const faded = [0, 0, 0];

  // a wedge per lamp, brightest at the bumper
  for (const sx of [-1, 1]) {
    const nx = sx * dims.W * 0.3;
    acc._quad(
      [nx - halfNear, y, near],
      [nx + halfNear, y, near],
      [nx + halfFar, y, far],
      [nx - halfFar, y, far],
      [0, 1, 0],
      bright,
    );
  }
  const geo = acc.build();
  // fade the far edge out by hand: the last two vertices of each quad
  const colors = geo.attributes.color;
  for (let i = 0; i < colors.count; i++) {
    const z = geo.attributes.position.getZ(i);
    const t = Math.min(1, Math.max(0, (z - near) / (far - near)));
    const k = (1 - t) * (1 - t);
    colors.setXYZ(i, bright[0] * k, bright[1] * k, bright[2] * k);
  }
  colors.needsUpdate = true;

  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,
  });
  const beam = new THREE.Mesh(geo, mat);
  beam.renderOrder = 8;
  group.add(beam);

  let spot = null;
  if (night && quality === "high") {
    spot = new THREE.SpotLight(0xfff0d0, 0, 42, 0.62, 0.55, 1.1);
    spot.position.set(0, dims.top * 0.8, dims.L / 2);
    spot.target.position.set(0, 0, dims.L / 2 + 16);
    spot.castShadow = false;
    group.add(spot);
    group.add(spot.target);
  }

  let level = 0;
  return {
    group,
    /** @param on 0..1 — off in daylight, full at night or in heavy rain */
    set(on, dt = 0.016) {
      level += (on - level) * Math.min(1, dt * 6);
      mat.opacity = level * 0.5;
      beam.visible = level > 0.02;
      if (spot) spot.intensity = level * 3.4;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      spot?.dispose?.();
      group.clear();
    },
  };
}
