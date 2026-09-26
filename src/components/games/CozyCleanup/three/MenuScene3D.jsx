/**
 * Cozy Cleanup — the 3D main menu scene. Purely decorative: the same
 * furniture kit, room shell and particle pool the real 3D gameplay uses
 * (see Scene3D.jsx) so the menu visually belongs to the same game, but with
 * none of gameplay's interactive machinery — no CameraRig3D (that's the
 * player's drag-to-orbit rig), no DirtPlane3D/GlassSurface3D/
 * DraggableObject3D, no raycasting, no task state. This file is additive
 * only; nothing in Scene3D.jsx, CameraRig3D.jsx or Gameplay3D.jsx is
 * touched, so the working 3D gameplay is unaffected.
 *
 * A few organize/trash items sit at their level-1 "from" (messy) spots as
 * plain static meshes — enough to say "this room needs cleaning" without
 * needing the coverage/dirt system, per the brief's own instruction to
 * keep the menu attractive rather than actually dirty.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import RoomShell3D from "./RoomShell3D.jsx";
import Particles3D from "./Particles3D.jsx";
import { KIND_TO_3D, GenericFurniture3D } from "./FurnitureKit3D.jsx";
import { BookMesh3D, ClothingMesh3D, PillowMesh3D, TrashMesh3D } from "./MovableMeshes3D.jsx";
import { buildGenericLayout, pointPosition } from "../engine/coords3d.js";

/**
 * A gentle, non-interactive camera: a slow autonomous azimuth drift plus a
 * heavily-limited mouse parallax on desktop. No drag/wheel/touch orbit —
 * this is a presentation camera, not the gameplay rig.
 */
function MenuCameraRig3D({ target, radius, baseAzimuth = 0, basePolar = 1.05 }) {
  const { camera, gl } = useThree();
  const mouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = gl.domElement;
    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      mouse.current.x = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1));
      mouse.current.y = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height) * 2 - 1));
    };
    const onLeave = () => { mouse.current.x = 0; mouse.current.y = 0; };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [gl]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const drift = Math.sin(t * 0.12) * 0.05;
    const parallaxAz = mouse.current.x * 0.045;
    const parallaxPolar = mouse.current.y * 0.02;
    const az = baseAzimuth + drift + parallaxAz;
    const polar = basePolar + parallaxPolar;
    const dist = radius + Math.sin(t * 0.08) * 0.12;
    camera.position.set(
      target[0] + dist * Math.sin(polar) * Math.sin(az),
      target[1] + dist * Math.cos(polar),
      target[2] + dist * Math.sin(polar) * Math.cos(az),
    );
    camera.lookAt(target[0], target[1] + mouse.current.y * 0.06, target[2]);
  });

  return null;
}

export default function MenuScene3D({ room, particleApi, graphics = "high" }) {
  const layout = useMemo(() => buildGenericLayout(room), [room]);
  const target = [0, layout.dims.height * 0.34, 0];
  const motesRef = useRef(0);

  const clutter = useMemo(() => {
    const items = [];
    (room.organize || []).slice(0, 2).forEach((o) => {
      items.push({ id: o.id, kind: o.kind, color: o.color, spriteKind: o.spriteKind, position3: pointPosition(o.from.x, o.from.y, layout.dims, 0.03) });
    });
    (room.trash || []).slice(0, 2).forEach((t) => {
      items.push({ id: t.id, kind: "trash", trashKind: t.kind, position3: pointPosition(t.x, t.y, layout.dims, 0.01) });
    });
    if (room.bed) {
      items.push({ id: "menu-pillow", kind: "clothing-pillow", position3: pointPosition(room.bed.pillows?.[0]?.from.x ?? 70, room.bed.pillows?.[0]?.from.y ?? 68, layout.dims, 0.05), color: room.bed.pillows?.[0]?.color });
    }
    return items;
  }, [room, layout.dims]);

  // A few drifting dust motes in the sunlight — subtle, reuses the same
  // pooled particle system gameplay uses.
  useFrame((_, delta) => {
    motesRef.current += delta;
    if (motesRef.current > 0.9) {
      motesRef.current = 0;
      const x = target[0] + 1.6 + (Math.random() - 0.5) * 1.2;
      const y = layout.dims.height * (0.35 + Math.random() * 0.3);
      const z = -layout.dims.depth / 2 + 1.2 + Math.random() * 1.5;
      particleApi?.current?.spawn?.([x, y, z], "mote");
    }
  });

  return (
    <>
      <MenuCameraRig3D target={target} radius={6.6} baseAzimuth={-0.18} basePolar={1.08} />

      <ambientLight intensity={0.6} color="#fff3e0" />
      <directionalLight
        position={[3.4, 4.6, -2.2]} intensity={1.2} color="#fff6e0"
        castShadow={graphics !== "low"}
        shadow-mapSize={graphics === "high" ? [1024, 1024] : [512, 512]}
        shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={5} shadow-camera-bottom={-5}
        shadow-camera-near={0.5} shadow-camera-far={14}
        shadow-bias={-0.0025}
      />
      <hemisphereLight args={["#dceeff", "#8a6b4a", 0.38]} />
      <pointLight position={[0, layout.dims.height - 0.3, 0]} intensity={0.28} color="#ffe3b8" distance={7} />

      <RoomShell3D dims={layout.dims} palette={room.palette} />

      {layout.furniture.map((f) => {
        const Comp = KIND_TO_3D[f.type] || GenericFurniture3D;
        return (
          <group key={f.id} position={f.position3}>
            <Comp footprint={f.footprint} {...(f.props || {})} />
          </group>
        );
      })}

      {clutter.map((c) => (
        <group key={c.id} position={c.position3}>
          {c.kind === "book" && <BookMesh3D color={c.color} />}
          {c.kind === "clothing" && <ClothingMesh3D color={c.color} />}
          {c.kind === "clothing-pillow" && <PillowMesh3D color={c.color} />}
          {c.kind === "trash" && <TrashMesh3D kind={c.trashKind} />}
        </group>
      ))}

      <Particles3D apiRef={particleApi} />
    </>
  );
}
