/**
 * Cozy Cleanup — the before/after reveal. Two static snapshots of the SAME
 * room (its real messy starting layout vs. its real finished layout, both
 * built from the level's own data — never a stock image) stacked with a
 * clip-path wipe. On mount it sweeps itself once from messy to clean, then
 * the player can drag the handle back and forth to compare.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import RoomStage from "./RoomStage.jsx";
import { TrashSprite, BookSprite, PillowSprite, BlanketSprite, ClothingSprite, ToySprite, CosmeticSprite, ShoeSprite } from "./ObjectSprites.jsx";

const ORG_SPRITE = { book: BookSprite, clothing: ClothingSprite, toy: ToySprite, cosmetic: CosmeticSprite, shoe: ShoeSprite, pillow: PillowSprite };

export function Snapshot({ room, before }) {
  return (
    <RoomStage room={room} cleanBonus={before ? 0 : 1}>
      {before && (room.dust || []).map((s) => (
        <div key={s.id} className="cc-snap-dirt" style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%` }} />
      ))}
      {before && (room.floor || []).map((s) => (
        <div key={s.id} className="cc-snap-dirt cc-snap-dirt--floor" style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%` }} />
      ))}
      {before && (room.stains || []).map((s) => (
        <div key={s.id} className="cc-snap-stain" style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%` }} />
      ))}
      {before && (room.glass || []).map((s) => (
        <div key={s.id} className="cc-snap-dirt cc-snap-dirt--glass" style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%` }} />
      ))}
      {before && (room.trash || []).map((t) => (
        <div key={t.id} className="cc-snap-obj" style={{ left: `${t.x}%`, top: `${t.y}%`, width: "5%", height: "5%" }}>
          <TrashSprite kind={t.kind} />
        </div>
      ))}
      {(room.organize || []).map((o) => {
        const Sprite = ORG_SPRITE[o.kind];
        const p = before ? o.from : o.to;
        if (!Sprite) return null;
        return (
          <div key={o.id} className="cc-snap-obj" style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${o.size?.w || 6}%`, height: `${o.size?.h || 6}%` }}>
            <Sprite kind={o.spriteKind} color={o.color} folded={o.kind === "clothing" && !before} />
          </div>
        );
      })}
      {room.bed && (
        <>
          <div className="cc-snap-obj" style={{ left: `${(before ? room.bed.blanket.from : room.bed.blanket.to).x}%`, top: `${(before ? room.bed.blanket.from : room.bed.blanket.to).y}%`, width: "34%", height: "16%" }}>
            <BlanketSprite color={room.bed.color} />
          </div>
          {room.bed.pillows.map((p) => (
            <div key={p.id} className="cc-snap-obj" style={{ left: `${(before ? p.from : p.to).x}%`, top: `${(before ? p.from : p.to).y}%`, width: "13%", height: "9%" }}>
              <PillowSprite color={p.color} />
            </div>
          ))}
        </>
      )}
    </RoomStage>
  );
}

export default function BeforeAfter({ room }) {
  const [reveal, setReveal] = useState(0);
  const dragRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    let raf;
    const start = performance.now();
    const dur = 1000;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / dur);
      setReveal(p * 100);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const setFromClientX = useCallback((clientX) => {
    const rect = wrapRef.current.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setReveal(Math.max(0, Math.min(100, pct)));
  }, []);

  const onPointerDown = useCallback((e) => {
    dragRef.current = true;
    try { e.target.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    setFromClientX(e.clientX);
  }, [setFromClientX]);
  const onPointerMove = useCallback((e) => { if (dragRef.current) setFromClientX(e.clientX); }, [setFromClientX]);
  const onPointerUp = useCallback(() => { dragRef.current = false; }, []);

  return (
    <div className="cc-beforeafter" ref={wrapRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <div className="cc-beforeafter__pane"><Snapshot room={room} before /></div>
      <div className="cc-beforeafter__pane cc-beforeafter__pane--after" style={{ clipPath: `inset(0 0 0 ${reveal}%)` }}>
        <Snapshot room={room} before={false} />
      </div>
      <div className="cc-beforeafter__tag cc-beforeafter__tag--before">Before</div>
      <div className="cc-beforeafter__tag cc-beforeafter__tag--after">After</div>
      <div className="cc-beforeafter__handle" style={{ left: `${reveal}%` }} onPointerDown={onPointerDown}>
        <span>↔</span>
      </div>
    </div>
  );
}
