/**
 * Cozy Cleanup — the illustrated room backdrop. Purely visual: walls,
 * floor and every furniture piece, positioned from the room's data (see
 * data/rooms.js) and drawn with FurnitureKit. Interactive layers (dirt,
 * draggable objects, the bed, tools) are stacked on top of this by
 * Gameplay.jsx / RoomComplete.jsx — this component never touches pointer
 * events.
 */
import { forwardRef, useCallback, useEffect, useRef } from "react";
import * as Kit from "./FurnitureKit.jsx";

const KIND_TO_COMPONENT = {
  bed: Kit.BedProp,
  nightstand: Kit.NightstandProp,
  desk: Kit.DeskProp,
  chair: Kit.ChairProp,
  bookshelf: Kit.BookshelfProp,
  wardrobe: Kit.WardrobeProp,
  window: Kit.WindowProp,
  lamp: Kit.LampProp,
  plant: Kit.PlantProp,
  wallArt: Kit.WallArtProp,
  rug: Kit.RugProp,
  door: Kit.DoorProp,
  counter: Kit.CounterProp,
  stove: Kit.StoveProp,
  fridge: Kit.FridgeProp,
  sink: Kit.SinkProp,
  cabinet: Kit.CabinetProp,
  bathtub: Kit.BathtubProp,
  mirror: Kit.MirrorProp,
  shower: Kit.ShowerProp,
  washer: Kit.WasherProp,
  basket: Kit.BasketProp,
  rail: Kit.RailProp,
  planter: Kit.PlanterProp,
  toybox: Kit.ToyboxProp,
  crib: Kit.CribProp,
  sofa: Kit.SofaProp,
  table: Kit.TableProp,
  bench: Kit.BenchProp,
  rack: Kit.RackProp,
};

const RoomStage = forwardRef(function RoomStage({ room, children, cleanBonus = 0 }, ref) {
  const pal = room.palette;
  const rafRef = useRef(null);

  // A very subtle 2D parallax on the furniture layer only (never on `.cc-room`
  // itself, and never touching interactive elements) — background pieces
  // drift a couple of px toward the cursor. Skipped entirely under Reduced
  // Motion. Pure imperative style writes, no React state, so it costs
  // nothing on re-render and never fights the pointer math cleaning relies on.
  const onPointerMove = useCallback((e) => {
    const el = ref && "current" in ref ? ref.current : null;
    if (!el) return;
    if (el.closest(".cc")?.dataset.reducedMotion === "1") return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const py = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      el.style.setProperty("--cc-px", String(Math.max(-1, Math.min(1, px))));
      el.style.setProperty("--cc-py", String(Math.max(-1, Math.min(1, py))));
    });
  }, [ref]);

  const onPointerLeave = useCallback(() => {
    const el = ref && "current" in ref ? ref.current : null;
    if (!el) return;
    el.style.setProperty("--cc-px", "0");
    el.style.setProperty("--cc-py", "0");
  }, [ref]);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  return (
    <div
      ref={ref}
      className="cc-room"
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      style={{
        "--cc-wall": pal.wall,
        "--cc-wall-shade": pal.wallShade,
        "--cc-floor": pal.floor,
        "--cc-floor-shade": pal.floorShade,
        filter: `saturate(${1 + cleanBonus * 0.12}) brightness(${1 + cleanBonus * 0.05})`,
      }}
    >
      <div className="cc-room__wall" />
      <div className="cc-room__floor" />
      <div className="cc-room__haze" style={{ opacity: Math.max(0, 0.16 - cleanBonus * 0.16) }} />
      {room.furniture.map((f) => {
        const Comp = KIND_TO_COMPONENT[f.type];
        if (!Comp) return null;
        return (
          <div
            key={f.id}
            className="cc-room__piece"
            style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, height: `${f.h}%`, zIndex: f.z ?? 1 }}
          >
            <Comp {...(f.props || {})} />
          </div>
        );
      })}
      {children}
      <div className="cc-room__vignette" />
    </div>
  );
});

export default RoomStage;
