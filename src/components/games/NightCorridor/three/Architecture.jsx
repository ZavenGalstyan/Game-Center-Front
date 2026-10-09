/**
 * Night Corridor — the corridor kit: wall faces, floors, ceilings and
 * doorway frames for a level, as a handful of InstancedMeshes (one per
 * texture variant) so a whole section costs a few draw calls.
 *
 * Wall faces are only emitted where open space meets a wall — never
 * hidden faces. Doorway cells get jambs + a lintel so every doorway reads
 * as a real opening in a thick wall.
 */
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { CELL, WALL_H, DOOR_JAMB } from "../engine/constants.js";
import { T_SOLID, T_DOOR, SIDES } from "../engine/level.js";
import { wallTextures, floorTextures, ceilingTextures } from "./textures.js";
import { hashStr } from "../engine/rng.js";

const WALL_VARIANTS = 3;
const FLOOR_VARIANTS = 2;

function variantOf(c, r, extra, n) {
  return hashStr(`${c},${r},${extra}`) % n;
}

export default function Architecture({ level, shadows = false }) {
  const theme = level.theme;

  const built = useMemo(() => {
    const group = new THREE.Group();
    const disposables = [];
    const dummy = new THREE.Object3D();

    // ------------------------------------------------------------ walls
    const wallFaces = Array.from({ length: WALL_VARIANTS }, () => []);
    const floorCells = Array.from({ length: FLOOR_VARIANTS }, () => []);
    const ceilCells = [];
    const doorCells = [];
    for (let r = 0; r < level.H; r++) {
      for (let c = 0; c < level.W; c++) {
        const t = level.type[level.idx(c, r)];
        if (t === T_SOLID) continue;
        const x = (c + 0.5) * CELL;
        const z = (r + 0.5) * CELL;
        floorCells[variantOf(c, r, "f", FLOOR_VARIANTS)].push({ x, z, rot: (hashStr(`${c}${r}`) % 4) * (Math.PI / 2) });
        ceilCells.push({ x, z });
        if (t === T_DOOR) {
          doorCells.push(level.doorAtCell.get(level.idx(c, r)));
          continue;
        }
        for (const s of SIDES) {
          const nc = c + s.dc;
          const nr = r + s.dr;
          const solid = !level.inside(nc, nr) || level.type[level.idx(nc, nr)] === T_SOLID;
          if (!solid) continue;
          wallFaces[variantOf(c, r, s.name, WALL_VARIANTS)].push({ x: x + s.dc * (CELL / 2), z: z + s.dr * (CELL / 2), yaw: s.faceYaw });
        }
      }
    }

    const wallGeo = new THREE.PlaneGeometry(CELL, WALL_H);
    wallGeo.translate(0, WALL_H / 2, 0);
    disposables.push(wallGeo);
    wallFaces.forEach((faces, v) => {
      if (!faces.length) return;
      const tex = wallTextures(theme, v);
      const mat = new THREE.MeshStandardMaterial({ map: tex.map, bumpMap: tex.bump, bumpScale: 1.4, roughness: 0.93, metalness: 0 });
      disposables.push(mat);
      const mesh = new THREE.InstancedMesh(wallGeo, mat, faces.length);
      faces.forEach((f, i) => {
        dummy.position.set(f.x, 0, f.z);
        dummy.rotation.set(0, f.yaw, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.receiveShadow = shadows;
      mesh.castShadow = false;
      group.add(mesh);
    });

    // ----------------------------------------------------------- floors
    const floorGeo = new THREE.PlaneGeometry(CELL, CELL);
    floorGeo.rotateX(-Math.PI / 2);
    disposables.push(floorGeo);
    floorCells.forEach((cells, v) => {
      if (!cells.length) return;
      const tex = floorTextures(theme, v);
      const metal = theme.floorTex === "grate";
      const mat = new THREE.MeshStandardMaterial({
        map: tex.map,
        bumpMap: tex.bump,
        bumpScale: 1.2,
        roughness: theme.floorTex === "carpet" ? 0.97 : theme.floorTex === "lino" ? 0.58 : 0.8,
        metalness: metal ? 0.35 : 0,
      });
      disposables.push(mat);
      const mesh = new THREE.InstancedMesh(floorGeo, mat, cells.length);
      cells.forEach((f, i) => {
        dummy.position.set(f.x, 0, f.z);
        dummy.rotation.set(0, f.rot, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.receiveShadow = shadows;
      group.add(mesh);
    });

    // ---------------------------------------------------------- ceiling
    const ceilGeo = new THREE.PlaneGeometry(CELL, CELL);
    ceilGeo.rotateX(Math.PI / 2);
    disposables.push(ceilGeo);
    {
      const tex = ceilingTextures(theme, 0);
      const mat = new THREE.MeshStandardMaterial({ map: tex.map, bumpMap: tex.bump, bumpScale: 1, roughness: 0.95 });
      disposables.push(mat);
      const mesh = new THREE.InstancedMesh(ceilGeo, mat, ceilCells.length);
      ceilCells.forEach((f, i) => {
        dummy.position.set(f.x, WALL_H, f.z);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      group.add(mesh);
    }

    // ------------------------------------------------- doorway jambs/lintel
    if (doorCells.length) {
      const tex = wallTextures(theme, 0);
      const jambMat = new THREE.MeshStandardMaterial({ map: tex.map, bumpMap: tex.bump, bumpScale: 1.2, roughness: 0.93 });
      const frameMat = new THREE.MeshStandardMaterial({ color: "#2b2a27", roughness: 0.6, metalness: 0.4 });
      disposables.push(jambMat, frameMat);
      const jambGeo = new THREE.BoxGeometry(DOOR_JAMB, WALL_H, CELL);
      jambGeo.translate(0, WALL_H / 2, 0);
      const opening = CELL - DOOR_JAMB * 2;
      const lintelGeo = new THREE.BoxGeometry(opening, WALL_H - 2.15, CELL);
      lintelGeo.translate(0, 2.15 + (WALL_H - 2.15) / 2, 0);
      const trimV = new THREE.BoxGeometry(0.07, 2.18, 0.12);
      trimV.translate(0, 1.09, 0);
      const trimH = new THREE.BoxGeometry(opening + 0.14, 0.07, 0.12);
      disposables.push(jambGeo, lintelGeo, trimV, trimH);
      for (const d of doorCells) {
        const g = new THREE.Group();
        g.position.set(d.x, 0, d.z);
        g.rotation.y = d.axis === "z" ? 0 : Math.PI / 2;
        const half = CELL / 2 - DOOR_JAMB / 2;
        for (const sx of [-half, half]) {
          const j = new THREE.Mesh(jambGeo, jambMat);
          j.position.x = sx;
          j.receiveShadow = shadows;
          g.add(j);
        }
        const l = new THREE.Mesh(lintelGeo, jambMat);
        g.add(l);
        // metal frame trims on both faces
        for (const fz of [-CELL / 2 + 0.05, CELL / 2 - 0.05]) {
          for (const sx of [-opening / 2 - 0.035, opening / 2 + 0.035]) {
            const tv = new THREE.Mesh(trimV, frameMat);
            tv.position.set(sx, 0, fz);
            g.add(tv);
          }
          const th = new THREE.Mesh(trimH, frameMat);
          th.position.set(0, 2.18, fz);
          g.add(th);
        }
        group.add(g);
      }
    }

    return { group, disposables };
  }, [level, theme, shadows]);

  useEffect(() => () => built.disposables.forEach((d) => d.dispose()), [built]);

  return <primitive object={built.group} />;
}
