/**
 * Supermarket Rush — every product sitting on every shelf, rendered as one
 * InstancedMesh per (product, part) covering every slot that product could
 * ever occupy in this shift. Shelf stock changes (restocking, a customer
 * taking an item) don't create or destroy meshes — they just move that
 * slot's instance on-shelf or off-screen and bump `updateToken`, which is
 * the only thing that makes this component do any work.
 */
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { productVisual } from "../engine/productVisuals.js";

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3(1, 1, 1);
const tmpMat = new THREE.Matrix4();

function makeGeometry(part) {
  if (!part) return null;
  if (part.type === "cylinder") {
    const [rt, rb, h] = part.size;
    return new THREE.CylinderGeometry(rt, rb, h, 10);
  }
  const [x, y, z] = part.size;
  return new THREE.BoxGeometry(x, y, z);
}

export default function ProductInstances({ shelves, updateToken }) {
  // One entry per product that actually appears this shift: geometry/material
  // for body + optional cap, the total slot count, and which shelf owns
  // which contiguous range of instance indices.
  const groups = useMemo(() => {
    const byProduct = new Map();
    for (const shelf of shelves) {
      if (!byProduct.has(shelf.productId)) byProduct.set(shelf.productId, { shelves: [], total: 0 });
      const g = byProduct.get(shelf.productId);
      g.shelves.push({ shelf, start: g.total });
      g.total += shelf.slots.length;
    }
    const out = [];
    for (const [productId, g] of byProduct) {
      const visual = productVisual(productId);
      out.push({
        productId,
        total: g.total,
        shelves: g.shelves,
        bodyGeom: makeGeometry(visual.body),
        bodyColor: visual.body.color,
        capGeom: visual.cap ? makeGeometry(visual.cap) : null,
        capColor: visual.cap?.color,
        capOffsetY: visual.cap?.offsetY || 0,
      });
    }
    return out;
    // shelves array identity is stable for the lifetime of one shift's world
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelves]);

  useEffect(() => () => {
    for (const g of groups) {
      g.bodyGeom?.dispose();
      g.capGeom?.dispose();
    }
  }, [groups]);

  const bodyRefs = useRef([]);
  const capRefs = useRef([]);
  bodyRefs.current = [];
  capRefs.current = [];

  const refresh = () => {
    groups.forEach((g, gi) => {
      const bodyMesh = bodyRefs.current[gi];
      const capMesh = capRefs.current[gi];
      for (const { shelf, start } of g.shelves) {
        const insetX = shelf.facing === "+x" ? -0.05 : 0.05;
        for (let i = 0; i < shelf.slots.length; i++) {
          const idx = start + i;
          if (i < shelf.stock) {
            const slot = shelf.slots[i];
            tmpPos.set(shelf.x + insetX, slot.y, shelf.z + slot.zOff);
            tmpMat.compose(tmpPos, tmpQuat, tmpScale);
            bodyMesh.setMatrixAt(idx, tmpMat);
            if (capMesh) {
              tmpPos.y += g.capOffsetY;
              tmpMat.compose(tmpPos, tmpQuat, tmpScale);
              capMesh.setMatrixAt(idx, tmpMat);
            }
          } else {
            bodyMesh.setMatrixAt(idx, HIDDEN);
            if (capMesh) capMesh.setMatrixAt(idx, HIDDEN);
          }
        }
      }
      bodyMesh.instanceMatrix.needsUpdate = true;
      if (capMesh) capMesh.instanceMatrix.needsUpdate = true;
    });
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, updateToken]);

  return (
    <group>
      {groups.map((g, gi) => (
        <group key={g.productId}>
          <instancedMesh
            ref={(r) => (bodyRefs.current[gi] = r)}
            args={[g.bodyGeom, undefined, g.total]}
            castShadow
            receiveShadow
            frustumCulled={false}
          >
            <meshStandardMaterial color={g.bodyColor} roughness={0.55} metalness={0.05} />
          </instancedMesh>
          {g.capGeom && (
            <instancedMesh
              ref={(r) => (capRefs.current[gi] = r)}
              args={[g.capGeom, undefined, g.total]}
              castShadow
              frustumCulled={false}
            >
              <meshStandardMaterial color={g.capColor} roughness={0.5} metalness={0.05} />
            </instancedMesh>
          )}
        </group>
      ))}
    </group>
  );
}
