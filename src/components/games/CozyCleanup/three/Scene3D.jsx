/**
 * Cozy Cleanup 3D — composes one playable room: the shell, lighting,
 * furniture, every interactive dirt/glass/movable-object layer the room's
 * data calls for, the red guidance arrow and the particle pool. Pure
 * presentation + event wiring; all the actual task state lives in
 * Gameplay3D (mirrors the old 2D Gameplay.jsx split).
 */
import { useRef } from "react";
import RoomShell3D from "./RoomShell3D.jsx";
import CameraRig3D, { RoomInputCatcher3D } from "./CameraRig3D.jsx";
import DirtPlane3D from "./DirtPlane3D.jsx";
import GlassSurface3D from "./GlassSurface3D.jsx";
import DraggableObject3D from "./DraggableObject3D.jsx";
import GuideArrow3D from "./GuideArrow3D.jsx";
import Particles3D from "./Particles3D.jsx";
import { KIND_TO_3D, GenericFurniture3D } from "./FurnitureKit3D.jsx";
import { TrashMesh3D, TrashBagMesh3D, ORG_MESH_3D, PillowMesh3D, BlanketMesh3D, DishMesh3D } from "./MovableMeshes3D.jsx";

function dustDirt(ctx, w, h) {
  ctx.fillStyle = "rgba(150,120,80,0.32)"; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 22; i++) { ctx.fillStyle = `rgba(120,95,60,${0.12 + Math.random() * 0.12})`; ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h, 3 + Math.random() * 6, 0, Math.PI * 2); ctx.fill(); }
}
function vacuumDirt(ctx, w, h) {
  for (let i = 0; i < 30; i++) { ctx.fillStyle = `rgba(90,65,40,${0.16 + Math.random() * 0.18})`; ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h, 1.6 + Math.random() * 3, 0, Math.PI * 2); ctx.fill(); }
}
function mopDirt(ctx, w, h) {
  ctx.fillStyle = "rgba(70,55,35,0.26)"; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 14; i++) { ctx.fillStyle = `rgba(60,45,28,${0.1 + Math.random() * 0.14})`; ctx.beginPath(); ctx.ellipse(Math.random() * w, Math.random() * h, 10 + Math.random() * 14, 5 + Math.random() * 6, Math.random() * Math.PI, 0, Math.PI * 2); ctx.fill(); }
}
function stainDirt(ctx, w, h) {
  ctx.fillStyle = "rgba(110,70,40,0.55)";
  ctx.beginPath(); ctx.ellipse(w / 2, h / 2, w * 0.4, h * 0.36, 0, 0, Math.PI * 2); ctx.fill();
}

export default function Scene3D({
  room, layout, tool, disabled,
  trash, onTrashPlace,
  dustPct, onDustProgress, onDustComplete,
  floorPct, onFloorProgress, onFloorComplete,
  glassPct, onGlassProgress, onGlassComplete,
  stainPct, onStainProgress, onStainComplete,
  dishPct, onDishProgress, onDishComplete,
  placedSet, onOrganizePlace,
  bedMade, onBedMade, pillowPlaced, onPillowPlace,
  nearestId,
  arrowTarget,
  settings, soundEnabled, particleApi, cameraEnabled, cleanBonus = 0,
}) {
  const target = [0, layout.dims.height * 0.32, 0];
  const brightness = 0.72 + cleanBonus * 0.5;
  const cameraController = useRef(null);

  const spawn = (pos, variant) => particleApi?.current?.spawn?.(pos, variant);

  return (
    <>
      <CameraRig3D target={target} enabled={cameraEnabled} controllerRef={cameraController} />
      <RoomInputCatcher3D dims={layout.dims} controllerRef={cameraController} />

      <ambientLight intensity={0.55 * brightness} color="#fff3e0" />
      <directionalLight
        position={[3.4, 4.6, -2.2]} intensity={1.15 * brightness} color="#fff6e0"
        castShadow={settings.graphics !== "low"}
        shadow-mapSize={settings.graphics === "high" ? [1024, 1024] : [512, 512]}
        shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={5} shadow-camera-bottom={-5}
        shadow-camera-near={0.5} shadow-camera-far={14}
        shadow-bias={-0.0025}
      />
      <hemisphereLight args={["#dceeff", "#8a6b4a", 0.35 * brightness]} />
      <pointLight position={[0, layout.dims.height - 0.3, 0]} intensity={0.25 * brightness} color="#ffe3b8" distance={7} />

      <RoomShell3D dims={layout.dims} palette={room.palette} />

      {layout.furniture.map((f) => {
        const Comp = KIND_TO_3D[f.type] || GenericFurniture3D;
        return (
          <group key={f.id} position={f.position3}>
            <Comp footprint={f.footprint} {...(f.props || {})} />
          </group>
        );
      })}

      {/* ---- dust ---- */}
      {layout.dust.map((s) => (
        <DirtPlane3D
          key={s.id} id={s.id} label={s.label} tool={tool} requiredTool="duster" orientation="floor"
          position={s.plane.position} size={s.plane.size} soundEnabled={soundEnabled}
          particlesEnabled={settings.particles} disabled={disabled} isNearest={nearestId === s.id}
          onProgress={onDustProgress} onComplete={onDustComplete} onParticle={spawn} drawDirt={dustDirt}
        />
      ))}

      {/* ---- floor (vacuum / mop) ---- */}
      {layout.floor.map((s) => (
        <DirtPlane3D
          key={s.id} id={s.id} label={s.label} tool={tool} requiredTool={s.tool} orientation="floor"
          position={s.plane.position} size={s.plane.size} radius={0.15} dabAmount={0.14}
          loopKind={s.tool} puff={s.tool === "vacuum" ? "dustPuff" : "clothWipe"}
          soundEnabled={soundEnabled} particlesEnabled={settings.particles} disabled={disabled} isNearest={nearestId === s.id}
          onProgress={onFloorProgress} onComplete={onFloorComplete} onParticle={spawn}
          drawDirt={s.tool === "vacuum" ? vacuumDirt : mopDirt}
        />
      ))}

      {/* ---- glass ---- */}
      {layout.glass.map((s) => (
        <GlassSurface3D
          key={s.id} id={s.id} position={s.plane.position} size={s.plane.size} tool={tool}
          soundEnabled={soundEnabled} particlesEnabled={settings.particles} disabled={disabled}
          isNearest={nearestId === s.id} onProgress={onGlassProgress} onComplete={onGlassComplete} onParticle={spawn}
        />
      ))}

      {/* ---- stains ---- */}
      {layout.stains.map((s) => (
        <DirtPlane3D
          key={s.id} id={s.id} label={s.label} tool={tool} requiredTool={s.tool || "sponge"} orientation="floor"
          position={s.plane.position} size={s.plane.size} radius={0.24} dabAmount={0.075} eraseAlpha={0.45}
          gridCols={9} gridRows={7} puff="scrub"
          soundEnabled={soundEnabled} particlesEnabled={settings.particles} disabled={disabled} isNearest={nearestId === s.id}
          onProgress={onStainProgress} onComplete={onStainComplete} onParticle={spawn} drawDirt={stainDirt}
        />
      ))}

      {/* ---- dishes ---- */}
      {layout.dishes.map((s) => (
        <group key={s.id}>
          <group position={[s.plane.position[0], s.plane.position[1] - 0.01, s.plane.position[2]]}>
            <DishMesh3D dirty={1 - (dishPct[s.id] || 0) / 100} />
          </group>
          <DirtPlane3D
            id={s.id} label={s.label} tool={tool} requiredTool="sponge" orientation="floor"
            position={s.plane.position} size={s.plane.size} radius={0.26} dabAmount={0.09} eraseAlpha={0}
            gridCols={7} gridRows={7} puff="scrub"
            soundEnabled={soundEnabled} particlesEnabled={settings.particles} disabled={disabled} isNearest={nearestId === s.id}
            onProgress={onDishProgress} onComplete={onDishComplete} onParticle={spawn} drawDirt={() => {}}
          />
        </group>
      ))}

      {/* ---- trash bag ---- */}
      <group position={layout.bagPos3}>
        <TrashBagMesh3D fill={room.trash?.length ? trash.done.size / room.trash.length : 0} />
      </group>

      {/* ---- trash ---- */}
      {layout.trash.filter((t) => !trash.hidden.has(t.id)).map((t) => (
        <DraggableObject3D
          key={t.id} id={t.id} from={t.position3} to={layout.bagPos3} zoneRadius={0.6}
          tool={tool} requiredTool="hand" disabled={disabled} placed={trash.done.has(t.id)}
          nearest={nearestId === t.id} soundEnabled={soundEnabled} onPlace={onTrashPlace} onParticle={spawn} label="Trash"
        >
          <TrashMesh3D kind={t.kind} />
        </DraggableObject3D>
      ))}

      {/* ---- organize ---- */}
      {layout.organize.map((o) => {
        const Mesh = ORG_MESH_3D[o.kind] || ORG_MESH_3D.book;
        return (
          <DraggableObject3D
            key={o.id} id={o.id} from={o.from3} to={o.to3} zoneRadius={0.7}
            tool={tool} requiredTool="hand" disabled={disabled} placed={placedSet.has(o.id)}
            nearest={nearestId === o.id} soundEnabled={soundEnabled} onPlace={onOrganizePlace} onParticle={spawn} label={o.label}
          >
            <Mesh color={o.color} spriteKind={o.spriteKind} />
          </DraggableObject3D>
        );
      })}

      {/* ---- bed ---- */}
      {layout.bed && (
        <>
          <DraggableObject3D
            id="bed-blanket" from={layout.bed.blanket.from3} to={layout.bed.blanket.to3} zoneRadius={0.55}
            tool={tool} requiredTool="hand" disabled={disabled} placed={bedMade}
            nearest={nearestId === "bed-blanket"} soundEnabled={soundEnabled} onPlace={onBedMade} onParticle={spawn} label="Blanket"
          >
            <BlanketMesh3D color={layout.bed.color} />
          </DraggableObject3D>
          {layout.bed.pillows.map((p) => (
            <DraggableObject3D
              key={p.id} id={p.id} from={p.from3} to={p.to3} zoneRadius={0.4}
              tool={tool} requiredTool="hand" disabled={disabled} placed={pillowPlaced.has(p.id)}
              nearest={nearestId === p.id} soundEnabled={soundEnabled} onPlace={onPillowPlace} onParticle={spawn} label="Pillow"
            >
              <PillowMesh3D color={p.color} />
            </DraggableObject3D>
          ))}
        </>
      )}

      <GuideArrow3D position={arrowTarget || [0, 0, 0]} visible={Boolean(arrowTarget) && settings.cleaningAssist !== false && !disabled} />

      <Particles3D apiRef={particleApi} />
    </>
  );
}
