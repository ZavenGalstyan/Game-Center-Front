/**
 * Night Corridor — small world effects driven by engine events:
 * a pipe dropping from the ceiling, sparks from a bursting tube, and a few
 * slow dust motes hanging in the air around you.
 */
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { WALL_H } from "../engine/constants.js";
import { getMaterials } from "./materials.js";

const MAX_SPARKS = 48;
const DUST = 220;

const Effects = forwardRef(function Effects({ paused, quality }, ref) {
  const { camera } = useThree();
  const falls = useRef([]);
  const fallGroup = useRef();
  const sparks = useRef({ list: [] });
  const sparkGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_SPARKS * 3), 3));
    g.setDrawRange(0, 0);
    return g;
  }, []);
  const dustGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 1] = Math.random() * WALL_H;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 10;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  const dustRef = useRef();

  useImperativeHandle(ref, () => ({
    handle(events) {
      for (const e of events) {
        if (e.type === "fall" && falls.current.length < 6) {
          const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 10), getMaterials().pipeRust);
          mesh.position.set(e.x, WALL_H - 0.15, e.z);
          mesh.rotation.set(0, Math.random() * Math.PI, Math.PI / 2 + 0.6);
          mesh.castShadow = true;
          fallGroup.current?.add(mesh);
          falls.current.push({ mesh, vy: 0, spin: 3 + Math.random() * 2, bounces: 0, rest: false });
        }
        if (e.type === "lamp" && e.action === "pop") {
          for (let i = 0; i < 24; i++) {
            if (sparks.current.list.length >= MAX_SPARKS) break;
            sparks.current.list.push({ x: e.x, y: WALL_H - 0.1, z: e.z, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 1.5, vz: (Math.random() - 0.5) * 3, life: 0.5 + Math.random() * 0.6 });
          }
        }
      }
    },
  }));

  useFrame((_, rawDt) => {
    if (paused) return;
    const dt = Math.min(rawDt, 0.05);
    for (const f of falls.current) {
      if (f.rest) continue;
      f.vy -= 9.8 * dt;
      f.mesh.position.y += f.vy * dt;
      f.mesh.rotation.z += f.spin * dt * (f.bounces ? 0.3 : 1);
      if (f.mesh.position.y <= 0.07) {
        f.mesh.position.y = 0.07;
        f.bounces++;
        f.vy = -f.vy * 0.28;
        f.spin *= 0.4;
        if (f.bounces > 2 || Math.abs(f.vy) < 0.4) {
          f.rest = true;
          f.mesh.rotation.set(0, f.mesh.rotation.y, Math.PI / 2);
        }
      }
    }
    // sparks
    const list = sparks.current.list;
    const arr = sparkGeo.attributes.position.array;
    let n = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const sp = list[i];
      sp.life -= dt;
      if (sp.life <= 0 || sp.y < 0) {
        list.splice(i, 1);
        continue;
      }
      sp.vy -= 9.8 * dt;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.z += sp.vz * dt;
    }
    for (const sp of list) {
      arr[n * 3] = sp.x;
      arr[n * 3 + 1] = sp.y;
      arr[n * 3 + 2] = sp.z;
      n++;
    }
    sparkGeo.setDrawRange(0, n);
    sparkGeo.attributes.position.needsUpdate = true;

    // dust drifts with you, wrapping in a box around the camera
    if (dustRef.current) {
      const pos = dustGeo.attributes.position.array;
      const t = performance.now() * 0.0001;
      for (let i = 0; i < DUST; i++) {
        pos[i * 3 + 1] -= dt * 0.03;
        pos[i * 3] += Math.sin(t * 3 + i) * dt * 0.02;
        if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] = WALL_H;
      }
      dustGeo.attributes.position.needsUpdate = true;
      dustRef.current.position.set(Math.round(camera.position.x / 10) * 10, 0, Math.round(camera.position.z / 10) * 10);
    }
  });

  return (
    <group>
      <group ref={fallGroup} />
      <points geometry={sparkGeo} frustumCulled={false}>
        <pointsMaterial color="#ffd27a" size={0.05} transparent opacity={0.95} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </points>
      {quality !== "low" && (
        <points ref={dustRef} geometry={dustGeo} frustumCulled={false}>
          <pointsMaterial color="#9a9284" size={0.014} transparent opacity={0.35} depthWrite={false} />
        </points>
      )}
    </group>
  );
});

export default Effects;
