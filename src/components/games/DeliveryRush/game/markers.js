/**
 * Delivery Rush — the delivery marker.
 *
 * One reusable object that gets moved to whatever the current target is: a
 * ground ring, a soft beam, a slowly spinning halo of chevrons, and a floating
 * package/flag icon. Pickup is amber, drops are green, so you can tell at a
 * glance which half of the job you are on.
 *
 * It also carries the "you have arrived, now slow down" feedback: the ring
 * fills toward white as the car gets inside it and the beam contracts once the
 * car is slow enough to actually collect.
 */

import * as THREE from "three";
import { MeshAcc } from "../world/geom.js";
import { rgb, shade } from "../world/palette.js";

const PICKUP = rgb("#ffb52e");
const DROPOFF = rgb("#2ee08a");
const READY = rgb("#ffffff");

export function createMarker() {
  const group = new THREE.Group();
  group.name = "delivery-marker";
  const disposables = [];

  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beamMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  disposables.push(mat, beamMat);

  /* ------------------------------------------------------------ ring mesh */

  const ringAcc = new MeshAcc(2048);
  const R = 1;
  const seg = 44;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const inner = 0.86;
    ringAcc.quadYPoints(
      [Math.cos(a0) * inner, Math.sin(a0) * inner],
      [Math.cos(a1) * inner, Math.sin(a1) * inner],
      [Math.cos(a1) * R, Math.sin(a1) * R],
      [Math.cos(a0) * R, Math.sin(a0) * R],
      0,
      [1, 1, 1],
    );
  }
  // inner disc, faint
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    ringAcc.quadYPoints([0, 0], [Math.cos(a0) * 0.84, Math.sin(a0) * 0.84], [Math.cos(a1) * 0.84, Math.sin(a1) * 0.84], [0, 0], 0, [0.28, 0.28, 0.28]);
  }
  const ringGeo = ringAcc.build();
  disposables.push(ringGeo);
  const ring = new THREE.Mesh(ringGeo, mat);
  ring.position.y = 0.06;
  ring.renderOrder = 5;
  group.add(ring);

  /* ---------------------------------------------------------------- beam */

  const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
  const beamColors = new Float32Array(beamGeo.attributes.position.count * 3);
  for (let i = 0; i < beamGeo.attributes.position.count; i++) {
    const y = beamGeo.attributes.position.getY(i) + 0.5; // 0 bottom, 1 top
    const k = 1 - y;
    beamColors[i * 3] = k;
    beamColors[i * 3 + 1] = k;
    beamColors[i * 3 + 2] = k;
  }
  beamGeo.setAttribute("color", new THREE.BufferAttribute(beamColors, 3));
  disposables.push(beamGeo);
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.renderOrder = 6;
  group.add(beam);

  /* -------------------------------------------------- floating chevrons */

  const chevAcc = new MeshAcc(512);
  for (let i = 0; i < 3; i++) {
    chevAcc.add("cone6", [0, i * 0.55, 0], [1.15 - i * 0.18, 0.42, 1.15 - i * 0.18], [1 - i * 0.22, 1 - i * 0.22, 1 - i * 0.22], 0);
  }
  const chevGeo = chevAcc.build();
  disposables.push(chevGeo);
  const chevMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  disposables.push(chevMat);
  const chevrons = new THREE.Mesh(chevGeo, chevMat);
  chevrons.rotation.x = Math.PI; // point down at the ring
  group.add(chevrons);

  /* ------------------------------------------------------------- package */

  const boxAcc = new MeshAcc(256);
  boxAcc.add("box", [0, 0, 0], [1, 1, 1], rgb("#c99a5e"));
  boxAcc.add("box", [0, 0.02, 0], [1.04, 0.2, 0.34], rgb("#e8dcc4"));
  boxAcc.add("box", [0, 0.02, 0], [0.34, 0.2, 1.04], rgb("#e8dcc4"));
  const boxGeo = boxAcc.build();
  disposables.push(boxGeo);
  const boxMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
  disposables.push(boxMat);
  const parcel = new THREE.Mesh(boxGeo, boxMat);
  parcel.castShadow = false;
  group.add(parcel);

  let t = 0;
  let radius = 6.5;
  let stage = "pickup";
  const colour = new THREE.Color();

  return {
    group,
    setTarget(x, z, r, nextStage) {
      group.position.set(x, 0, z);
      radius = r || 6.5;
      stage = nextStage;
      group.visible = true;
    },
    hide() {
      group.visible = false;
    },
    /**
     * @param near  0..1 how close the car is (1 = inside the ring)
     * @param ready true once the car is slow enough to collect
     */
    update(dt, near, ready) {
      t += dt;
      const base = stage === "pickup" ? PICKUP : DROPOFF;
      const c = ready ? READY : base;
      const pulse = 0.82 + Math.sin(t * (ready ? 9 : 3.4)) * 0.18;

      colour.setRGB(c[0] * pulse, c[1] * pulse, c[2] * pulse);
      mat.color.copy(colour);
      beamMat.color.copy(colour);
      chevMat.color.copy(colour);
      mat.opacity = 0.55 + near * 0.4;
      beamMat.opacity = (ready ? 0.09 : 0.2) * (0.55 + near * 0.55);

      ring.scale.setScalar(radius * (1 + (ready ? 0 : 0.02 * Math.sin(t * 3.4))));
      beam.scale.set(radius * 0.92, ready ? 5 : 11, radius * 0.92);
      beam.position.y = beam.scale.y / 2;

      chevrons.position.y = 5.2 + Math.sin(t * 1.9) * 0.45;
      chevrons.rotation.y = t * 0.9;
      chevrons.scale.setScalar(1 + near * 0.2);

      parcel.visible = stage === "pickup";
      parcel.position.y = 2.5 + Math.sin(t * 1.7) * 0.28;
      parcel.rotation.y = t * 0.8;
      parcel.scale.setScalar(1.05);
    },
    dispose() {
      for (const d of disposables) d.dispose();
      group.clear();
    },
  };
}
