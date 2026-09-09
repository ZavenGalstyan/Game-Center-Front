/**
 * Delivery Rush — traffic rendering.
 *
 * Each of the five vehicle types gets four InstancedMeshes (paint, dark trim,
 * glass, lamps). Cars are assigned a type permanently at spawn, so the slot a
 * car occupies in its type's instance buffer never changes and syncing the
 * whole fleet is one matrix write per car per frame.
 *
 * Paint colour rides on instanceColor, which multiplies the near-white vertex
 * shading baked into the paint channel — ten different colours, one draw call.
 * Brake lights are handled by nudging the lamp instance colour instead of
 * swapping geometry.
 */

import * as THREE from "three";
import { buildTrafficGeometries, trafficMaterials } from "../world/trafficModel.js";

/**
 * Traffic never casts a real-time shadow — see the note on the player car's
 * `add()` in vehicleModel.js. Each type instead gets one InstancedMesh of the
 * same flat ground-decal used for the player, sized to that type's footprint.
 */
function shadowGeometry() {
  return new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2);
}

export function createTrafficRenderer(cars, theme) {
  const types = buildTrafficGeometries();
  const materials = trafficMaterials(theme);
  const group = new THREE.Group();
  group.name = "traffic";
  const shadowGeo = shadowGeometry();
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    toneMapped: false,
  });

  // how many cars use each type
  const counts = types.map(() => 0);
  for (const c of cars) counts[c.type] += 1;

  const perType = types.map((t, i) => {
    const n = Math.max(1, counts[i]);
    const make = (geo, mat, colored) => {
      const im = new THREE.InstancedMesh(geo, mat, n);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = false;
      im.receiveShadow = false;
      im.frustumCulled = false;
      if (colored) {
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
        im.instanceColor.setUsage(THREE.DynamicDrawUsage);
      }
      group.add(im);
      return im;
    };
    const shadowMesh = make(shadowGeo, shadowMat, false);
    shadowMesh.renderOrder = 1;
    return {
      paint: make(t.paint, materials.paint, true),
      dark: make(t.dark, materials.dark, false),
      glass: make(t.glass, materials.glass, false),
      lights: make(t.lights, materials.lights, true),
      shadow: shadowMesh,
      // width on X, length on Z — see the note in vehicleModel.js's createShadowBlob
      shadowScale: new THREE.Vector3(t.W * 0.56, 1, t.L * 0.5),
      slots: 0,
    };
  });

  // permanent slot per car
  const slotOf = new Map();
  const used = types.map(() => 0);
  for (const c of cars) {
    slotOf.set(c.id, used[c.type]);
    used[c.type] += 1;
  }

  // one-time paint colours
  const col = new THREE.Color();
  for (const c of cars) {
    const p = theme.carPaint[c.color % theme.carPaint.length];
    col.setRGB(p[0], p[1], p[2]);
    perType[c.type].paint.setColorAt(slotOf.get(c.id), col);
  }
  for (const t of perType) if (t.paint.instanceColor) t.paint.instanceColor.needsUpdate = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const lampCol = new THREE.Color();

  return {
    group,
    types,
    /** Copy the simulation's car states into the instance buffers. */
    sync(carList, night) {
      for (const c of carList) {
        const slot = slotOf.get(c.id);
        const t = perType[c.type];
        pos.set(c.x, 0, c.z);
        e.set(0, c.yaw, 0);
        q.setFromEuler(e);
        m.compose(pos, q, one);
        t.paint.setMatrixAt(slot, m);
        t.dark.setMatrixAt(slot, m);
        t.glass.setMatrixAt(slot, m);
        t.lights.setMatrixAt(slot, m);
        pos.y = 0.026;
        m.compose(pos, q, t.shadowScale);
        t.shadow.setMatrixAt(slot, m);
        // brake lights brighten, and at night everything is turned up
        const k = c.braking ? 1.45 : night ? 1.0 : 0.55;
        lampCol.setScalar(k);
        t.lights.setColorAt(slot, lampCol);
      }
      for (const t of perType) {
        t.paint.instanceMatrix.needsUpdate = true;
        t.dark.instanceMatrix.needsUpdate = true;
        t.glass.instanceMatrix.needsUpdate = true;
        t.lights.instanceMatrix.needsUpdate = true;
        if (t.lights.instanceColor) t.lights.instanceColor.needsUpdate = true;
        t.shadow.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      // dispose geometries/materials, not the InstancedMesh objects — Object3D
      // has no dispose() of its own, and calling one that doesn't exist would
      // throw during teardown.
      for (const t of types) {
        t.paint.dispose();
        t.dark.dispose();
        t.glass.dispose();
        t.lights.dispose();
      }
      shadowGeo.dispose();
      shadowMat.dispose();
      for (const k of Object.keys(materials)) materials[k].dispose();
      group.clear();
    },
  };
}
