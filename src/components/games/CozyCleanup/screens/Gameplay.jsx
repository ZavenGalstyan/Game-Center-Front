/**
 * Cozy Cleanup — Gameplay screen. Orchestrates one room: the stage, every
 * interactive surface/object the room's data calls for, the tool tray, the
 * HUD, hints, and the completion sequence. Remounted by a `key` in
 * CozyCleanup.jsx whenever Restart fires, so all local state resets for
 * free — nothing here needs its own reset logic.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RoomStage from "../components/RoomStage.jsx";
import ToolTray from "../components/ToolTray.jsx";
import Hud from "../components/Hud.jsx";
import CleaningCanvas from "../components/CleaningCanvas.jsx";
import GlassSurface from "../components/GlassSurface.jsx";
import DraggableItem, { ZoneHint } from "../components/DragDrop.jsx";
import BedMaker from "../components/BedMaker.jsx";
import ClothFold from "../components/ClothFold.jsx";
import GuidanceOverlay from "../components/GuidanceOverlay.jsx";
import ToastStack, { useToasts } from "../components/Toast.jsx";
import { useTutorial, GuideBubble } from "../components/Tutorial.jsx";
import { ParticleLayer, useParticleLayer } from "../components/ParticleLayer.jsx";
import { TrashSprite, BagSprite, BookSprite, ToySprite, CosmeticSprite, ShoeSprite, ClothingSprite, PillowSprite, DishSprite } from "../components/ObjectSprites.jsx";
import { roomCategories } from "../data/rooms.js";
import { overallCompletion, starsForRun, clampPct } from "../engine/progress.js";
import { sfx } from "../engine/sound.js";

const CATEGORY_TOAST = {
  trash: "Trash Collected ✓", dust: "Dust Clean ✓", floor: "Floor Clean ✓", glass: "Window Complete ✓",
  stains: "Stain Removed ✓", dishes: "Dishes Done ✓", organize: "All Organized ✓", bed: "Bed Made ✓",
};
const TOOL_LABEL = {
  hand: "Hand", duster: "Duster", vacuum: "Vacuum", mop: "Mop", spray: "Spray", cloth: "Cloth", sponge: "Sponge", brush: "Brush",
};

const CLEAN_CATS = ["trash", "dust", "floor", "glass", "stains", "dishes"];
const ORG_CATS = ["organize", "bed"];

function avg(nums) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 100;
}
function countDone(map, list) {
  return (list || []).filter((s) => (map[s.id] || 0) >= 99.5).length;
}
function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] != null) out[k] = obj[k];
  return out;
}

const ORG_RENDER = {
  book: (item) => <BookSprite color={item.color} />,
  toy: (item) => <ToySprite kind={item.spriteKind} color={item.color} />,
  cosmetic: (item) => <CosmeticSprite kind={item.spriteKind} color={item.color} />,
  shoe: (item) => <ShoeSprite color={item.color} />,
  clothing: (item) => <ClothingSprite kind={item.spriteKind} color={item.color} folded />,
};

const TOOL_FOR = { dust: "duster", stains: "sponge" };

export default function Gameplay({ room, settings, muted, cosmetics, tutorialSeen = true, onTutorialDone, onComplete, onExit }) {
  const soundEnabled = settings.sound && !muted;
  const stageWrapRef = useRef(null);
  const gameplayRef = useRef(null);
  const trayRef = useRef(null);
  const { layerRef, spawn } = useParticleLayer();
  const { toasts, push: pushToast } = useToasts();
  const seenCompleteRef = useRef(new Set());

  const [tool, setTool] = useState("hand");
  const [trashDone, setTrashDone] = useState(() => new Set());
  const [trashHidden, setTrashHidden] = useState(() => new Set());
  const [dustPct, setDustPct] = useState({});
  const [floorPct, setFloorPct] = useState({});
  const [glassPct, setGlassPct] = useState({});
  const [stainPct, setStainPct] = useState({});
  const [dishPct, setDishPct] = useState({});
  const [foldedSet, setFoldedSet] = useState(() => new Set());
  const [placedSet, setPlacedSet] = useState(() => new Set());
  const [bedMade, setBedMade] = useState(false);
  const [pillowPlaced, setPillowPlaced] = useState(() => new Set());
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintTarget, setHintTarget] = useState(null);
  const [hintText, setHintText] = useState(null);
  const [finishing, setFinishing] = useState(false);

  const startTimeRef = useRef(performance.now());
  const completedRef = useRef(false);
  const hintTimerRef = useRef(null);
  useEffect(() => () => { if (hintTimerRef.current) clearTimeout(hintTimerRef.current); }, []);

  const categories = roomCategories(room);

  const categoryPct = useMemo(() => {
    const m = {};
    if (room.trash?.length) m.trash = clampPct((trashDone.size / room.trash.length) * 100);
    if (room.dust?.length) m.dust = clampPct(avg(room.dust.map((s) => dustPct[s.id] || 0)));
    if (room.floor?.length) m.floor = clampPct(avg(room.floor.map((s) => floorPct[s.id] || 0)));
    if (room.glass?.length) m.glass = clampPct(avg(room.glass.map((s) => glassPct[s.id] || 0)));
    if (room.stains?.length) m.stains = clampPct(avg(room.stains.map((s) => stainPct[s.id] || 0)));
    if (room.dishes?.length) m.dishes = clampPct(avg(room.dishes.map((s) => dishPct[s.id] || 0)));
    if (room.organize?.length) m.organize = clampPct((placedSet.size / room.organize.length) * 100);
    if (room.bed) {
      const totalPillows = room.bed.pillows.length;
      const pillowPct = totalPillows ? (pillowPlaced.size / totalPillows) * 100 : 100;
      m.bed = clampPct((bedMade ? 50 : 0) + pillowPct / 2);
    }
    return m;
  }, [room, trashDone, dustPct, floorPct, glassPct, stainPct, dishPct, placedSet, bedMade, pillowPlaced]);

  const overall = overallCompletion(categoryPct, {});
  const cleanliness = overallCompletion(pick(categoryPct, CLEAN_CATS), {});
  const organization = overallCompletion(pick(categoryPct, ORG_CATS), {});
  const requiredComplete = categories.length > 0 && categories.every((c) => (categoryPct[c] || 0) >= 99.5);

  // A small premium "Floor Clean ✓" toast the first time each category crosses 100%.
  useEffect(() => {
    for (const c of categories) {
      if ((categoryPct[c] || 0) >= 99.5 && !seenCompleteRef.current.has(c)) {
        seenCompleteRef.current.add(c);
        pushToast(CATEGORY_TOAST[c] || `${c} ✓`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryPct]);

  useEffect(() => {
    if (!requiredComplete || completedRef.current) return;
    completedRef.current = true;
    setFinishing(true);
    sfx.roomComplete(soundEnabled);
    for (let i = 0; i < 6; i++) {
      setTimeout(() => spawn(22 + Math.random() * 56, 18 + Math.random() * 50, "sparkle"), i * 100);
    }
    const timer = setTimeout(() => {
      const timeSec = (performance.now() - startTimeRef.current) / 1000;
      const run = {
        id: room.id,
        timeSec,
        hintsUsed,
        cleanliness: Math.round(cleanliness),
        organization: Math.round(organization),
        trashCollected: trashDone.size,
        dustCleaned: countDone(dustPct, room.dust),
        floorAreaCleaned: countDone(floorPct, room.floor),
        windowsCleaned: countDone(glassPct, room.glass),
        itemsOrganized: placedSet.size,
        clothesFolded: foldedSet.size,
        dishesWashed: countDone(dishPct, room.dishes),
        bedsMade: bedMade ? 1 : 0,
        requiredComplete: true,
        optionalPct: overall,
      };
      onComplete({ ...run, stars: starsForRun(run) });
    }, 1600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requiredComplete]);

  /* ------------------------------------------------------------ trash --- */
  const onTrashPlace = useCallback((id) => {
    setTrashDone((prev) => new Set(prev).add(id));
    sfx.trashDrop(soundEnabled);
    spawn(room.bagPos.x, room.bagPos.y, "mote");
    setTimeout(() => setTrashHidden((prev) => new Set(prev).add(id)), 240);
  }, [soundEnabled, spawn, room.bagPos]);

  /* --------------------------------------------------------- surfaces --- */
  const onDustProgress = useCallback((id, pct) => setDustPct((p) => ({ ...p, [id]: pct })), []);
  const onDustComplete = useCallback(() => sfx.taskDone(soundEnabled), [soundEnabled]);
  const onFloorProgress = useCallback((id, pct) => setFloorPct((p) => ({ ...p, [id]: pct })), []);
  const onFloorComplete = useCallback(() => sfx.taskDone(soundEnabled), [soundEnabled]);
  const onGlassProgress = useCallback((id, pct) => setGlassPct((p) => ({ ...p, [id]: pct })), []);
  const onGlassComplete = useCallback(() => sfx.taskDone(soundEnabled), [soundEnabled]);
  const onStainProgress = useCallback((id, pct) => setStainPct((p) => ({ ...p, [id]: pct })), []);
  const onStainComplete = useCallback(() => sfx.taskDone(soundEnabled), [soundEnabled]);
  const onDishProgress = useCallback((id, pct) => setDishPct((p) => ({ ...p, [id]: pct })), []);
  const onDishComplete = useCallback(() => { sfx.dishClink(soundEnabled); sfx.taskDone(soundEnabled); }, [soundEnabled]);

  /* -------------------------------------------------------- organize --- */
  const onOrganizePlace = useCallback((id) => {
    setPlacedSet((prev) => new Set(prev).add(id));
    sfx.taskDone(soundEnabled);
    const item = room.organize?.find((o) => o.id === id);
    if (item) { spawn(item.to.x, item.to.y, "sparkle"); spawn(item.to.x + 3, item.to.y - 2, "mote"); }
  }, [soundEnabled, room.organize, spawn]);
  const onFolded = useCallback((id) => setFoldedSet((prev) => new Set(prev).add(id)), []);

  /* --------------------------------------------------------------- bed --- */
  const onBedMade = useCallback(() => {
    setBedMade(true);
    if (room.bed) spawn(room.bed.blanket.to.x, room.bed.blanket.to.y, "sparkle");
  }, [room.bed, spawn]);
  const onPillowPlace = useCallback((id) => {
    setPillowPlaced((prev) => new Set(prev).add(id));
    sfx.taskDone(soundEnabled);
    const p = room.bed?.pillows.find((x) => x.id === id);
    if (p) spawn(p.to.x, p.to.y, "sparkle");
  }, [soundEnabled, room.bed, spawn]);

  /* -------------------------------------------------------------- hint --- */
  const findHint = useCallback(() => {
    if (room.trash?.length) {
      const t = room.trash.find((x) => !trashDone.has(x.id));
      if (t) return { region: { x: t.x - 3, y: t.y - 3, w: 6, h: 6 }, tool: "hand", text: "Use the Hand to pick up the trash." };
    }
    for (const s of room.dust || []) {
      if ((dustPct[s.id] || 0) < 92) return { region: s, tool: "duster", text: `Use the Duster on the ${s.label.toLowerCase()}.` };
    }
    for (const s of room.floor || []) {
      if ((floorPct[s.id] || 0) < 92) return { region: s, tool: s.tool, text: `Use the ${TOOL_LABEL[s.tool]} on the ${s.label.toLowerCase()}.` };
    }
    for (const s of room.glass || []) {
      if ((glassPct[s.id] || 0) < 92) return { region: s, tool: "spray", text: `Use the Spray to clean the ${s.label.toLowerCase()}.` };
    }
    for (const s of room.stains || []) {
      if ((stainPct[s.id] || 0) < 92) return { region: s, tool: s.tool || "sponge", text: `Use the ${TOOL_LABEL[s.tool || "sponge"]} on that stubborn stain.` };
    }
    for (const s of room.dishes || []) {
      if ((dishPct[s.id] || 0) < 92) return { region: s, tool: "sponge", text: "Use the Sponge to wash the dishes." };
    }
    for (const o of room.organize || []) {
      if (!placedSet.has(o.id)) {
        return { region: { x: o.from.x - 4, y: o.from.y - 4, w: 8, h: 8 }, tool: "hand", text: `Use the Hand to move the ${o.label?.toLowerCase() || "item"} where it belongs.` };
      }
    }
    if (room.bed && !bedMade) {
      return { region: { x: room.bed.blanket.from.x - 10, y: room.bed.blanket.from.y - 6, w: 20, h: 12 }, tool: "hand", text: "Use the Hand to pull up the blanket." };
    }
    if (room.bed) {
      const p = room.bed.pillows.find((x) => !pillowPlaced.has(x.id));
      if (p) return { region: { x: p.from.x - 5, y: p.from.y - 4, w: 10, h: 8 }, tool: "hand", text: "Use the Hand to place the pillow." };
    }
    return null;
  }, [room, trashDone, dustPct, floorPct, glassPct, stainPct, dishPct, placedSet, bedMade, pillowPlaced]);

  const onHint = useCallback(() => {
    const found = findHint();
    if (!found) return;
    setHintsUsed((n) => n + 1);
    setTool(found.tool);
    setHintTarget(found.region);
    setHintText(found.text);
    sfx.hint(soundEnabled);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => { setHintTarget(null); setHintText(null); }, 4000);
  }, [findHint, soundEnabled]);

  /* ---------------------------------------------------- passive guidance --- *
   * Whenever a tool is selected (with or without Hint), find that tool's own
   * nearest unfinished target so the arrow/glow system always has something
   * to point at — this is what section 3/4 of the brief calls "tool becomes
   * active, valid targets glow, arrows point toward them".                    */
  const findTaskFor = useCallback((toolId) => {
    if (toolId === "hand") {
      const t = room.trash?.find((x) => !trashDone.has(x.id));
      if (t) return { id: t.id, from: { x: t.x, y: t.y }, region: { x: room.bagPos.x - 5, y: room.bagPos.y - 6, w: 10, h: 12 }, label: "Trash" };
      for (const o of room.organize || []) {
        if (placedSet.has(o.id)) continue;
        if (o.needsFold && !foldedSet.has(o.id)) {
          return { id: o.id, from: o.from, region: { x: o.from.x - o.size.w / 2, y: o.from.y - o.size.h / 2, w: o.size.w, h: o.size.h }, label: o.label };
        }
        return { id: o.id, from: o.from, region: { x: o.to.x - o.size.w / 2, y: o.to.y - o.size.h / 2, w: o.size.w, h: o.size.h }, label: o.label };
      }
      if (room.bed && !bedMade) {
        return { id: "bed-blanket", from: room.bed.blanket.from, region: { x: room.bed.blanket.to.x - 15, y: room.bed.blanket.to.y - 8, w: 30, h: 16 }, label: "Bed" };
      }
      if (room.bed) {
        const p = room.bed.pillows.find((x) => !pillowPlaced.has(x.id));
        if (p) return { id: p.id, from: p.from, region: { x: p.to.x - 8, y: p.to.y - 8, w: 16, h: 16 }, label: "Pillow" };
      }
      return null;
    }
    if (toolId === "duster") {
      const s = (room.dust || []).find((x) => (dustPct[x.id] || 0) < 92);
      return s ? { id: s.id, region: s, label: s.label } : null;
    }
    if (toolId === "vacuum" || toolId === "mop") {
      const s = (room.floor || []).find((x) => x.tool === toolId && (floorPct[x.id] || 0) < 92);
      return s ? { id: s.id, region: s, label: s.label } : null;
    }
    if (toolId === "spray" || toolId === "cloth") {
      const s = (room.glass || []).find((x) => (glassPct[x.id] || 0) < 92);
      return s ? { id: s.id, region: s, label: s.label } : null;
    }
    if (toolId === "sponge" || toolId === "brush") {
      const s1 = (room.stains || []).find((x) => (x.tool || "sponge") === toolId && (stainPct[x.id] || 0) < 92);
      if (s1) return { id: s1.id, region: s1, label: s1.label };
      if (toolId === "sponge") {
        const d1 = (room.dishes || []).find((x) => (dishPct[x.id] || 0) < 92);
        if (d1) return { id: d1.id, region: d1, label: d1.label };
      }
    }
    return null;
  }, [room, trashDone, dustPct, floorPct, glassPct, stainPct, dishPct, placedSet, foldedSet, bedMade, pillowPlaced]);

  const passiveTarget = useMemo(() => findTaskFor(tool), [findTaskFor, tool]);

  const tutorial = useTutorial({
    active: room.id === 1 && !tutorialSeen && !finishing,
    room, tool, floorPct, placedSet,
    onDone: onTutorialDone,
  });

  const guideMode = tool === "hand" ? "object" : "tool";
  const guideTarget = tutorial?.arrowOverride ? tutorial.arrowOverride.target : passiveTarget;
  const guideModeActive = tutorial?.arrowOverride ? tutorial.arrowOverride.mode : guideMode;
  // The arrow itself is treated as an assist (Settings → Cleaning Assist);
  // the softer target glow (cc-surface--active/--nearest, ZoneHint) stays on
  // regardless — that one's core guidance, not an optional aid.
  const guideVisible = !finishing && Boolean(guideTarget) && settings.cleaningAssist !== false;

  const cleanBonus = clampPct(overall) / 100;

  // An explicit Hint click always wins the bubble while its timer is live —
  // otherwise the (still-active) tutorial text would silently mask it.
  const bubbleText = hintText || tutorial?.text;
  const bubbleVariant = hintText ? "hint" : "tutorial";

  return (
    <div className="cc-gameplay" ref={gameplayRef}>
      <Hud
        roomName={room.name}
        overallPct={overall}
        categories={categoryPct}
        onHint={onHint}
        hintDisabled={finishing || !findHint()}
        onExit={onExit}
      />

      <GuideBubble text={bubbleText} variant={bubbleVariant} />
      <ToastStack toasts={toasts} />

      <div className="cc-stage">
        <RoomStage room={room} cleanBonus={cleanBonus} ref={stageWrapRef}>
          {/* ---- dust ---- */}
          {(room.dust || []).map((s) => (
            <div key={s.id} className="cc-region" style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%` }}>
              <CleaningCanvas
                id={s.id} label={s.label} tool={tool} requiredTool="duster" loopKind={null} puff="dustPuff"
                soundEnabled={soundEnabled} particlesEnabled={settings.particles} assist={settings.cleaningAssist}
                isNearest={passiveTarget?.id === s.id}
                disabled={finishing} onProgress={onDustProgress} onComplete={onDustComplete} onParticle={spawn}
                drawDirt={(ctx, w, h) => {
                  ctx.fillStyle = "rgba(150,120,80,0.28)"; ctx.fillRect(0, 0, w, h);
                  for (let i = 0; i < 26; i++) { ctx.fillStyle = `rgba(120,95,60,${0.12 + Math.random() * 0.12})`; ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h, 4 + Math.random() * 8, 0, Math.PI * 2); ctx.fill(); }
                }}
              />
            </div>
          ))}
          {/* ---- floor (vacuum / mop) ---- */}
          {(room.floor || []).map((s) => (
            <div key={s.id} className="cc-region" style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%` }}>
              <CleaningCanvas
                id={s.id} label={s.label} tool={tool} requiredTool={s.tool} loopKind={s.tool}
                puff={s.tool === "vacuum" ? "dustPuff" : "clothWipe"}
                radius={0.13} dabAmount={0.14} eraseAlpha={0.7}
                soundEnabled={soundEnabled} particlesEnabled={settings.particles} assist={settings.cleaningAssist}
                isNearest={passiveTarget?.id === s.id}
                disabled={finishing} onProgress={onFloorProgress} onComplete={onFloorComplete} onParticle={spawn}
                drawDirt={(ctx, w, h) => {
                  if (s.tool === "vacuum") {
                    for (let i = 0; i < 34; i++) { ctx.fillStyle = `rgba(90,65,40,${0.15 + Math.random() * 0.18})`; ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 4, 0, Math.PI * 2); ctx.fill(); }
                  } else {
                    ctx.fillStyle = "rgba(70,55,35,0.22)"; ctx.fillRect(0, 0, w, h);
                    for (let i = 0; i < 16; i++) { ctx.fillStyle = `rgba(60,45,28,${0.1 + Math.random() * 0.14})`; ctx.beginPath(); ctx.ellipse(Math.random() * w, Math.random() * h, 14 + Math.random() * 18, 6 + Math.random() * 8, Math.random() * Math.PI, 0, Math.PI * 2); ctx.fill(); }
                  }
                }}
              />
            </div>
          ))}
          {/* ---- glass ---- */}
          {(room.glass || []).map((s) => (
            <div key={s.id} className="cc-region" style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%` }}>
              <GlassSurface
                id={s.id} tool={tool} soundEnabled={soundEnabled} particlesEnabled={settings.particles}
                isNearest={passiveTarget?.id === s.id}
                disabled={finishing} onProgress={onGlassProgress} onComplete={onGlassComplete} onParticle={spawn}
              />
            </div>
          ))}
          {/* ---- stains ---- */}
          {(room.stains || []).map((s) => (
            <div key={s.id} className="cc-region" style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%` }}>
              <CleaningCanvas
                id={s.id} label={s.label} tool={tool} requiredTool={s.tool || "sponge"}
                radius={0.22} dabAmount={0.075} eraseAlpha={0.4} gridCols={10} gridRows={7}
                puff="scrub" soundEnabled={soundEnabled} particlesEnabled={settings.particles} assist={settings.cleaningAssist}
                isNearest={passiveTarget?.id === s.id}
                disabled={finishing} onProgress={onStainProgress} onComplete={onStainComplete} onParticle={spawn}
                drawDirt={(ctx, w, h) => {
                  ctx.fillStyle = "rgba(110,70,40,0.5)";
                  ctx.beginPath(); ctx.ellipse(w / 2, h / 2, w * 0.42, h * 0.38, 0, 0, Math.PI * 2); ctx.fill();
                  ctx.fillStyle = "rgba(80,50,28,0.3)";
                  ctx.beginPath(); ctx.ellipse(w * 0.4, h * 0.45, w * 0.2, h * 0.18, 0, 0, Math.PI * 2); ctx.fill();
                }}
              />
            </div>
          ))}
          {/* ---- dishes ---- */}
          {(room.dishes || []).map((s) => (
            <div key={s.id} className="cc-region" style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%` }}>
              <div className="cc-dish-backdrop"><DishSprite dirty={1 - (dishPct[s.id] || 0) / 100} /></div>
              <CleaningCanvas
                id={s.id} label={s.label} tool={tool} requiredTool="sponge"
                radius={0.24} dabAmount={0.09} eraseAlpha={0} gridCols={8} gridRows={8}
                puff="scrub" soundEnabled={soundEnabled} particlesEnabled={settings.particles} assist={settings.cleaningAssist}
                isNearest={passiveTarget?.id === s.id}
                disabled={finishing} onProgress={onDishProgress} onComplete={onDishComplete} onParticle={spawn}
                drawDirt={() => {}}
              />
            </div>
          ))}

          {/* ---- bag ---- */}
          <div className="cc-region cc-region--bag" style={{ left: `${room.bagPos.x - 5}%`, top: `${room.bagPos.y - 6}%`, width: "11%", height: "13%" }}>
            <BagSprite fill={room.trash?.length ? trashDone.size / room.trash.length : 0} />
          </div>

          {/* ---- trash ---- */}
          {(room.trash || []).filter((t) => !trashHidden.has(t.id)).map((t) => (
            <DraggableItem
              key={t.id} id={t.id}
              from={{ x: t.x, y: t.y }} to={{ x: room.bagPos.x, y: room.bagPos.y }}
              zone={{ x: room.bagPos.x - 7, y: room.bagPos.y - 9, w: 14, h: 16 }}
              size={{ w: 5, h: 5 }} placed={trashDone.has(t.id)} disabled={finishing}
              tool={tool} requiredTool="hand" containerRef={stageWrapRef} soundEnabled={soundEnabled}
              onPlace={onTrashPlace} label="Trash" nearest={passiveTarget?.id === t.id}
            >
              <TrashSprite kind={t.kind} />
            </DraggableItem>
          ))}

          {/* ---- organize zone hints (shown while hand tool is selected) ---- */}
          {tool === "hand" && (room.organize || []).filter((o) => !placedSet.has(o.id)).map((o) => (
            <ZoneHint key={`zh-${o.id}`} zone={o.zone} visible nearest={passiveTarget?.id === o.id} />
          ))}

          {/* ---- organize items ---- */}
          {(room.organize || []).map((o) => {
            if (o.needsFold && !foldedSet.has(o.id)) {
              return (
                <ClothFold
                  key={o.id} id={o.id} kind={o.spriteKind} color={o.color}
                  box={{ x: o.from.x - (o.size.w / 2), y: o.from.y - (o.size.h / 2), w: o.size.w, h: o.size.h }}
                  tool={tool} containerRef={stageWrapRef} soundEnabled={soundEnabled} disabled={finishing}
                  onFolded={onFolded}
                />
              );
            }
            const renderFn = ORG_RENDER[o.kind];
            return (
              <DraggableItem
                key={o.id} id={o.id} from={o.from} to={o.to} zone={o.zone} size={o.size}
                placed={placedSet.has(o.id)} disabled={finishing} tool={tool} requiredTool="hand"
                containerRef={stageWrapRef} soundEnabled={soundEnabled} onPlace={onOrganizePlace} label={o.label}
                nearest={passiveTarget?.id === o.id}
              >
                {renderFn?.(o)}
              </DraggableItem>
            );
          })}

          {/* ---- bed ---- */}
          {room.bed && (
            <>
              {tool === "hand" && !bedMade && (
                <ZoneHint
                  zone={{ x: room.bed.blanket.to.x - 15, y: room.bed.blanket.to.y - 8, w: 30, h: 16 }}
                  visible nearest={passiveTarget?.id === "bed-blanket"}
                />
              )}
              <BedMaker
                from={room.bed.blanket.from} to={room.bed.blanket.to} color={room.bed.color}
                made={bedMade} tool={tool} containerRef={stageWrapRef} soundEnabled={soundEnabled}
                disabled={finishing} onMade={onBedMade}
              />
              {room.bed.pillows.map((p) => (
                <DraggableItem
                  key={p.id} id={p.id} from={p.from} to={p.to}
                  zone={{ x: p.to.x - 8, y: p.to.y - 8, w: 16, h: 16 }}
                  size={{ w: 13, h: 9 }} placed={pillowPlaced.has(p.id)} disabled={finishing}
                  tool={tool} requiredTool="hand" containerRef={stageWrapRef} soundEnabled={soundEnabled}
                  onPlace={onPillowPlace} label="Pillow" nearest={passiveTarget?.id === p.id}
                >
                  <PillowSprite color={p.color} />
                </DraggableItem>
              ))}
              {tool === "hand" && room.bed.pillows.filter((p) => !pillowPlaced.has(p.id)).map((p) => (
                <ZoneHint key={`zh-${p.id}`} zone={{ x: p.to.x - 8, y: p.to.y - 8, w: 16, h: 16 }} visible nearest={passiveTarget?.id === p.id} />
              ))}
            </>
          )}

          {hintTarget && (
            <div
              className="cc-hint-ring"
              style={{ left: `${hintTarget.x}%`, top: `${hintTarget.y}%`, width: `${hintTarget.w}%`, height: `${hintTarget.h}%` }}
            />
          )}

          <ParticleLayer layerRef={layerRef} />
        </RoomStage>
      </div>

      <ToolTray
        tools={room.tools} active={tool} onSelect={setTool} cosmetics={cosmetics} disabled={finishing}
        containerRef={trayRef} highlightToolId={tutorial?.highlightToolId ?? null}
      />

      <GuidanceOverlay
        gameplayRef={gameplayRef} roomRef={stageWrapRef} trayRef={trayRef}
        target={guideTarget} mode={guideModeActive} visible={guideVisible}
      />

      {finishing && <div className="cc-finish-veil" aria-hidden="true" />}
    </div>
  );
}
