/**
 * Urban Skate Rush — Menu Stage
 *
 * 3D backdrop for the menus: the furthest-reached district's indoor skate
 * room with the skater cruising laps around it (garage view: close-up of the
 * rider rolling slowly so the board and outfit are visible).
 */
import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { getLevel } from "../data/levels/index.js";
import { boardById } from "../data/boards.js";
import { RoomScene } from "../three/Room.jsx";
import Skater from "../three/Skater.jsx";

/** A fake physics player that rides an oval lap and pushes now and then. */
function useCruiser(level, view) {
  const p = useMemo(() => ({ x: 0, y: 0, z: 0, yaw: 0, speed: 4, state: "skating", pitch: 0, roll: 0, pushPhase: 0, wheelRotation: 0, crouching: false }), []);
  const t = useRef(0);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    t.current += dt;
    if (view === "garage") {
      p.x = 0;
      p.z = 0;
      p.yaw = Math.PI / 2 + Math.sin(t.current * 0.4) * 0.3;
      p.speed = 0;
      p.wheelRotation += dt * 2;
      return;
    }
    const rx = level.room.w * 0.3;
    const rz = level.room.d * 0.18;
    const a = t.current * 0.32;
    const nx = Math.sin(a) * rx;
    const nz = Math.cos(a) * rz - 1;
    p.yaw = Math.atan2(nx - p.x, nz - p.z) || p.yaw;
    p.x = nx;
    p.z = nz;
    p.speed = 5;
    const pushing = Math.sin(t.current * 0.5) > 0.6;
    if (pushing) p.pushPhase = (p.pushPhase + dt * 3) % (Math.PI * 2);
    p.wheelRotation += dt * 10;
  });
  return p;
}

function Scene({ level, board, view }) {
  const p = useCruiser(level, view);
  useFrame((state) => {
    const time = state.clock.elapsedTime;
    const cam = state.camera;
    if (view === "garage") {
      cam.position.set(1.6 + Math.sin(time * 0.3) * 0.4, 1.3, 2.4);
      cam.lookAt(0, 0.8, 0);
    } else {
      cam.position.set(Math.sin(time * 0.05) * level.room.w * 0.36, level.room.h * 0.5, -level.room.d * 0.42);
      cam.lookAt(p.x * 0.5, 0.8, p.z * 0.5 + 2);
    }
  });
  return (
    <>
      <RoomScene level={level} shadows />
      <Skater player={p} board={board} />
    </>
  );
}

export default function MenuStage({ districtId, boardId, view }) {
  const level = useMemo(() => getLevel(districtId || 1), [districtId]);
  const board = useMemo(() => boardById(boardId), [boardId]);
  return (
    <div className="usr-canvas">
      <Canvas shadows camera={{ position: [0, 4, 8], fov: 55 }} dpr={[1, 1.5]} gl={{ antialias: true }}>
        <Scene level={level} board={board} view={view} />
      </Canvas>
    </div>
  );
}
