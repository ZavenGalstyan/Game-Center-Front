/**
 * 3D tool models used as the in-scene cursor. Each tool's working tip sits
 * at the origin and the tool extends along +Y (away from the surface), so
 * the world can place the tip on the hit point and align +Y with the
 * surface normal — tools touch the doll instead of passing through it.
 * Sizes are in doll units (the doll is ~1 unit tall).
 */
import * as THREE from "three";
import { revolve, profile, tube, V3 } from "./geo.js";
import { mat } from "./materials.js";
import { fabricTex } from "./textures.js";

export function buildTool(id) {
  const g = new THREE.Group();
  g.name = `tool-${id}`;
  const add = (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.rotation.set(rx, ry, rz);
    o.castShadow = true;
    g.add(o);
    return o;
  };
  const wood = mat("#c58a52", { roughness: 0.5 });
  const steel = new THREE.MeshStandardMaterial({ color: "#d8d6d2", metalness: 1, roughness: 0.22 });
  const pink = mat("#f39ac0", { roughness: 0.35 });
  switch (id) {
    case "brush": {
      // soft brush: bristles at the tip, wooden handle
      add(new THREE.CylinderGeometry(0.02, 0.012, 0.045, 14), mat("#f4ead2", { roughness: 1 }), 0, 0.022, 0);
      add(new THREE.CylinderGeometry(0.016, 0.02, 0.02, 14), steel, 0, 0.055, 0);
      add(new THREE.CylinderGeometry(0.009, 0.013, 0.16, 10), wood, 0, 0.145, 0);
      break;
    }
    case "cloth": {
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 10), mat("#8ec5ec", { map: fabricTex("knit"), roughness: 1 }));
      c.scale.set(1.2, 0.45, 0.9);
      c.position.y = 0.02;
      c.castShadow = true;
      g.add(c);
      add(new THREE.TorusGeometry(0.03, 0.012, 6, 14), mat("#8ec5ec", { map: fabricTex("knit") }), 0, 0.045, 0, Math.PI / 2);
      break;
    }
    case "sponge": {
      add(new THREE.BoxGeometry(0.075, 0.025, 0.05), mat("#9fdcc0", { roughness: 0.9 }), 0, 0.0125, 0);
      add(new THREE.BoxGeometry(0.075, 0.03, 0.05), mat("#f5dc8c", { roughness: 1 }), 0, 0.04, 0);
      break;
    }
    case "spray": {
      add(new THREE.CylinderGeometry(0.004, 0.004, 0.02, 8), mat("#2c2830"), 0, 0.03, 0, Math.PI / 2, 0, 0);
      add(new THREE.BoxGeometry(0.03, 0.035, 0.05), pink, 0, 0.1, -0.015);
      add(revolve(profile([[0.028, 0], [0.032, 0.02], [0.03, 0.09], [0.012, 0.11]], 3), { segs: 20, capBottom: true }), new THREE.MeshPhysicalMaterial({ color: "#bfe3f5", roughness: 0.1, transparent: true, opacity: 0.6, clearcoat: 1 }), 0, 0.12, -0.02);
      add(new THREE.BoxGeometry(0.01, 0.04, 0.012), pink, 0, 0.08, 0.02, 0.3);
      g.userData.offset = 0.06;
      break;
    }
    case "polish": {
      add(new THREE.SphereGeometry(0.03, 16, 10), mat("#fff3e0", { roughness: 1 }), 0, 0.02, 0).scale.set(1, 0.6, 1);
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 18), mat("#d9b25a", { roughness: 0.3, metalness: 0.4 }), 0, 0.05, 0);
      add(new THREE.CylinderGeometry(0.012, 0.016, 0.1, 10), wood, 0, 0.11, 0);
      break;
    }
    case "glue": {
      add(new THREE.ConeGeometry(0.006, 0.035, 10), mat("#f4f1ec", { roughness: 0.3 }), 0, 0.018, 0, Math.PI);
      add(new THREE.CylinderGeometry(0.01, 0.006, 0.02, 10), mat("#f4f1ec"), 0, 0.045, 0);
      add(revolve(profile([[0.01, 0], [0.022, 0.02], [0.024, 0.12], [0.022, 0.125]], 3), { segs: 18, capTop: true }), mat("#e8b86a", { roughness: 0.35 }), 0, 0.055, 0);
      add(new THREE.BoxGeometry(0.05, 0.008, 0.01), mat("#e8b86a"), 0, 0.18, 0);
      break;
    }
    case "needle": {
      add(new THREE.CylinderGeometry(0.0012, 0.0025, 0.07, 6), steel, 0, 0.035, 0);
      add(new THREE.TorusGeometry(0.003, 0.0008, 4, 8), steel, 0, 0.072, 0);
      const thread = tube([V3(0, 0.072, 0), V3(0.015, 0.09, 0.01), V3(0.03, 0.08, 0.025), V3(0.05, 0.1, 0.03)], 0.0009, { radial: 3, tubular: 10 });
      add(thread, mat("#e98aa6"));
      g.userData.thread = true;
      break;
    }
    case "comb": {
      add(new THREE.BoxGeometry(0.09, 0.016, 0.01), mat("#c3a8e6", { roughness: 0.3 }), 0, 0.035, 0);
      for (let k = 0; k < 9; k++) add(new THREE.BoxGeometry(0.004, 0.03, 0.006), mat("#c3a8e6", { roughness: 0.3 }), -0.04 + k * 0.01, 0.014, 0);
      add(new THREE.CylinderGeometry(0.01, 0.012, 0.11, 10), mat("#c3a8e6", { roughness: 0.3 }), 0.08, 0.06, 0, 0, 0, -0.9);
      break;
    }
    case "shampoo": {
      add(new THREE.CylinderGeometry(0.006, 0.01, 0.015, 10), mat("#ffffff"), 0, 0.008, 0);
      add(revolve(profile([[0.012, 0], [0.03, 0.02], [0.032, 0.1], [0.012, 0.115]], 3), { segs: 18, capBottom: true, capTop: true }), mat("#f6b3c9", { roughness: 0.2 }), 0, 0.016, 0);
      g.userData.offset = 0.03;
      break;
    }
    case "dryer": {
      add(new THREE.CylinderGeometry(0.03, 0.035, 0.09, 18), pink, 0, 0.045, 0);
      add(new THREE.SphereGeometry(0.042, 16, 12), pink, 0, 0.1, 0);
      add(new THREE.CylinderGeometry(0.015, 0.015, 0.1, 10), mat("#2c2830"), 0.055, 0.15, 0, 0, 0, -1.1);
      add(new THREE.CircleGeometry(0.026, 16), mat("#2c2830"), 0, 0.001, 0, Math.PI / 2);
      g.userData.offset = 0.1;
      break;
    }
    case "reroot": {
      add(new THREE.CylinderGeometry(0.0015, 0.003, 0.05, 6), steel, 0, 0.025, 0);
      add(new THREE.CylinderGeometry(0.011, 0.011, 0.12, 12), mat("#9fdcc0", { roughness: 0.35 }), 0, 0.11, 0);
      add(new THREE.SphereGeometry(0.012, 10, 8), mat("#9fdcc0"), 0, 0.17, 0);
      break;
    }
    case "paint": {
      add(new THREE.ConeGeometry(0.006, 0.025, 10), mat("#3a2a20"), 0, 0.012, 0, Math.PI);
      add(new THREE.CylinderGeometry(0.006, 0.007, 0.015, 10), steel, 0, 0.032, 0);
      add(new THREE.CylinderGeometry(0.004, 0.007, 0.16, 10), mat("#c7384b", { roughness: 0.3 }), 0, 0.12, 0);
      g.userData.tipMat = g.children[0].material;
      break;
    }
    case "pliers": {
      for (const s of [-1, 1]) {
        add(new THREE.BoxGeometry(0.006, 0.05, 0.008), steel, s * 0.005, 0.025, 0, 0, 0, s * 0.12);
        add(new THREE.CylinderGeometry(0.007, 0.006, 0.09, 8), mat("#c7384b", { roughness: 0.4 }), s * 0.018, 0.1, 0, 0, 0, -s * 0.25);
      }
      add(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 10), steel, 0, 0.052, 0, Math.PI / 2);
      break;
    }
    case "magnifier":
    default: {
      add(new THREE.TorusGeometry(0.05, 0.007, 10, 32), mat("#d9b25a", { metalness: 0.8, roughness: 0.3 }), 0, 0.06, 0, Math.PI / 2);
      const lens = add(new THREE.CircleGeometry(0.048, 28), new THREE.MeshPhysicalMaterial({ color: "#eaf6ff", roughness: 0, transparent: true, opacity: 0.18, clearcoat: 1, depthWrite: false }), 0, 0.06, 0, -Math.PI / 2);
      lens.castShadow = false;
      add(new THREE.CylinderGeometry(0.009, 0.011, 0.1, 10), wood, 0.08, 0.06, 0.04, Math.PI / 2, 0, -0.8);
      g.userData.offset = 0.04;
      break;
    }
  }
  g.traverse((o) => {
    if (o.isMesh) o.raycast = () => {};
  });
  g.scale.setScalar(0.62);
  if (g.userData.offset) g.userData.offset *= 0.62;
  return g;
}
