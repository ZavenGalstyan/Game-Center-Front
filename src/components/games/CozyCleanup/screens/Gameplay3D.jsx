/**
 * Cozy Cleanup 3D — the real 3D gameplay screen. Owns the WebGL canvas
 * (React Three Fiber), all cleaning/organizing task state (same shape as
 * the old 2D Gameplay.jsx — trash/dust/floor/glass/stains/organize/bed —
 * so storage.js, progress.js and the room data in data/rooms.js are all
 * reused untouched), the tool tray / HUD DOM overlay, the tutorial, hint
 * and completion sequence. The 2D `Gameplay.jsx` is no longer wired into
 * play (see CozyCleanup.jsx) but is left in the tree for reference.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import Scene3D from "../three/Scene3D.jsx";
import { buildGenericLayout } from "../engine/coords3d.js";
import { roomCategories } from "../data/rooms.js";
import { overallCompletion, starsForRun, clampPct } from "../engine/progress.js";
import { sfx } from "../engine/sound.js";
import "./Gameplay3D.css";

const CLEAN_CATS = ["trash", "dust", "floor", "glass", "stains", "dishes"];
const ORG_CATS = ["organize", "bed"];
const CATEGORY_LABEL = { trash: "Trash", dust: "Dust", floor: "Floor", glass: "Windows", stains: "Stains", organize: "Organize", bed: "Bed", dishes: "Dishes" };
const CATEGORY_TOAST = { trash: "Trash Collected ✓", dust: "Dust Clean ✓", floor: "Floor Clean ✓", glass: "Window Complete ✓", stains: "Stain Removed ✓", dishes: "Dishes Done ✓", organize: "All Organized ✓", bed: "Bed Made ✓" };
const TOOL_LABEL = { hand: "Hand", duster: "Duster", vacuum: "Vacuum", mop: "Mop", spray: "Spray", cloth: "Cloth", sponge: "Sponge", brush: "Brush" };
const TOOLS_ALL = ["hand", "duster", "vacuum", "mop", "spray", "cloth", "sponge", "brush"];

function avg(nums) { return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 100; }
function countDone(map, list) { return (list || []).filter((s) => (map[s.id] || 0) >= 99.5).length; }
function pick(obj, keys) { const out = {}; for (const k of keys) if (obj[k] != null) out[k] = obj[k]; return out; }

const TOOL_ICON = {
  hand: "M9 13V6a2 2 0 1 1 4 0v5m0-3a2 2 0 1 1 4 0v3m0-1a2 2 0 1 1 4 0v4m-12-1v-1a2 2 0 1 1 4 0v1m-4 0c0 6 3 9 7 9s7-3 7-8v-3",
};

function ToolIcon({ id, active }) {
  const c = active ? "#e53935" : "#6b5642";
  switch (id) {
    case "hand": return <path d={TOOL_ICON.hand} fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />;
    case "duster": return <g fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round"><path d="M8 20 L15 13" /><path d="M14 4 Q10 6 12 10 Q14 6 18 6 Q17 10 20 11 Q15 12 14 4Z" fill={c} stroke="none" opacity="0.85" /></g>;
    case "vacuum": return <g fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="4" width="7" height="11" rx="2" /><path d="M9 9 L4 12 L4 18" /><path d="M4 18 L8 18" /></g>;
    case "mop": return <g fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round"><path d="M12 3 L8 19" /><path d="M5 19 Q8 22 11 19" /></g>;
    case "spray": return <g fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="9" width="8" height="12" rx="2" /><path d="M11 9 V6 M9 6 H14 L16 3" /><path d="M18 3 L20 1 M19 5 L21 5 M17 6 L18.5 7.5" /></g>;
    case "cloth": return <path d="M5 8 L19 8 L16 19 Q12 21 8 19 Z" fill={c} opacity="0.85" stroke="none" />;
    case "sponge": return <g><rect x="4" y="8" width="16" height="9" rx="3" fill={c} opacity="0.85" /><circle cx="8" cy="11.5" r="0.9" fill="#fff" opacity="0.7" /><circle cx="14" cy="13.5" r="0.9" fill="#fff" opacity="0.7" /></g>;
    case "brush": return <g fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round"><path d="M13 3 L8 17" /><path d="M6 17 Q6 21 10 21 Q13 21 12 17 Z" fill={c} stroke="none" opacity="0.85" /></g>;
    default: return null;
  }
}

export default function Gameplay3D({ room, settings, muted, tutorialSeen = true, onTutorialDone, onComplete, onExit }) {
  const soundEnabled = settings.sound && !muted;
  const particleApi = useRef(null);
  const [tool, setTool] = useState("hand");
  const [trashDone, setTrashDone] = useState(() => new Set());
  const [trashHidden, setTrashHidden] = useState(() => new Set());
  const [dustPct, setDustPct] = useState({});
  const [floorPct, setFloorPct] = useState({});
  const [glassPct, setGlassPct] = useState({});
  const [stainPct, setStainPct] = useState({});
  const [dishPct, setDishPct] = useState({});
  const [placedSet, setPlacedSet] = useState(() => new Set());
  const [bedMade, setBedMade] = useState(false);
  const [pillowPlaced, setPillowPlaced] = useState(() => new Set());
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintText, setHintText] = useState(null);
  const [hintToolId, setHintToolId] = useState(null);
  const [finishing, setFinishing] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [tutStep, setTutStep] = useState(room.id === 1 && !tutorialSeen ? 0 : -1);

  const startTimeRef = useRef(performance.now());
  const completedRef = useRef(false);
  const hintTimerRef = useRef(null);
  const seenCompleteRef = useRef(new Set());
  const toastIdRef = useRef(0);
  useEffect(() => () => { if (hintTimerRef.current) clearTimeout(hintTimerRef.current); }, []);

  const layout = useMemo(() => buildGenericLayout(room), [room]);
  const categories = useMemo(() => roomCategories(room), [room]);

  const pushToast = useCallback((text) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev.slice(-2), { id, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2200);
  }, []);

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
    particleApi.current?.spawn?.([0, layout.dims.height * 0.4, 0], "sparkle");
    const timer = setTimeout(() => {
      const timeSec = (performance.now() - startTimeRef.current) / 1000;
      const run = {
        id: room.id, timeSec, hintsUsed,
        cleanliness: Math.round(cleanliness), organization: Math.round(organization),
        trashCollected: trashDone.size, dustCleaned: countDone(dustPct, room.dust),
        floorAreaCleaned: countDone(floorPct, room.floor), windowsCleaned: countDone(glassPct, room.glass),
        itemsOrganized: placedSet.size, clothesFolded: (room.organize || []).filter((o) => o.kind === "clothing" && placedSet.has(o.id)).length,
        dishesWashed: countDone(dishPct, room.dishes), bedsMade: bedMade ? 1 : 0,
        requiredComplete: true, optionalPct: overall,
      };
      onComplete({ ...run, stars: starsForRun(run) });
    }, 2200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requiredComplete]);

  const onTrashPlace = useCallback((id) => {
    setTrashDone((prev) => new Set(prev).add(id));
    sfx.trashDrop(soundEnabled);
    setTimeout(() => setTrashHidden((prev) => new Set(prev).add(id)), 220);
  }, [soundEnabled]);

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
  const onOrganizePlace = useCallback((id) => { setPlacedSet((prev) => new Set(prev).add(id)); sfx.taskDone(soundEnabled); }, [soundEnabled]);
  const onBedMade = useCallback(() => { setBedMade(true); sfx.bedSettle(soundEnabled); }, [soundEnabled]);
  const onPillowPlace = useCallback((id) => { setPillowPlaced((prev) => new Set(prev).add(id)); sfx.taskDone(soundEnabled); }, [soundEnabled]);

  /* -------------------------------------------------- guidance target --- */
  const findTaskFor = useCallback((toolId) => {
    if (toolId === "hand") {
      const t = room.trash?.find((x) => !trashDone.has(x.id));
      if (t) { const it = layout.trash.find((x) => x.id === t.id); return it && { id: t.id, position3: it.position3, label: "trash" }; }
      for (const o of room.organize || []) {
        if (placedSet.has(o.id)) continue;
        const it = layout.organize.find((x) => x.id === o.id);
        return it && { id: o.id, position3: it.from3, label: o.label?.toLowerCase() || "item" };
      }
      if (room.bed && !bedMade) return { id: "bed-blanket", position3: layout.bed.blanket.from3, label: "blanket" };
      if (room.bed) {
        const p = room.bed.pillows.find((x) => !pillowPlaced.has(x.id));
        if (p) { const it = layout.bed.pillows.find((x) => x.id === p.id); return it && { id: p.id, position3: it.from3, label: "pillow" }; }
      }
      return null;
    }
    if (toolId === "duster") {
      const s = (room.dust || []).find((x) => (dustPct[x.id] || 0) < 92);
      if (!s) return null;
      const it = layout.dust.find((x) => x.id === s.id);
      return it && { id: s.id, position3: it.plane.position, label: s.label.toLowerCase() };
    }
    if (toolId === "vacuum" || toolId === "mop") {
      const s = (room.floor || []).find((x) => x.tool === toolId && (floorPct[x.id] || 0) < 92);
      if (!s) return null;
      const it = layout.floor.find((x) => x.id === s.id);
      return it && { id: s.id, position3: it.plane.position, label: s.label.toLowerCase() };
    }
    if (toolId === "spray" || toolId === "cloth") {
      const s = (room.glass || []).find((x) => (glassPct[x.id] || 0) < 92);
      if (!s) return null;
      const it = layout.glass.find((x) => x.id === s.id);
      return it && { id: s.id, position3: it.plane.position, label: s.label.toLowerCase() };
    }
    if (toolId === "sponge" || toolId === "brush") {
      const s1 = (room.stains || []).find((x) => (x.tool || "sponge") === toolId && (stainPct[x.id] || 0) < 92);
      if (s1) { const it = layout.stains.find((x) => x.id === s1.id); return it && { id: s1.id, position3: it.plane.position, label: "stain" }; }
      if (toolId === "sponge") {
        const d1 = (room.dishes || []).find((x) => (dishPct[x.id] || 0) < 92);
        if (d1) { const it = layout.dishes.find((x) => x.id === d1.id); return it && { id: d1.id, position3: it.plane.position, label: "dishes" }; }
      }
    }
    return null;
  }, [room, layout, trashDone, dustPct, floorPct, glassPct, stainPct, dishPct, placedSet, bedMade, pillowPlaced]);

  const passiveTarget = useMemo(() => findTaskFor(tool), [findTaskFor, tool]);

  /* --------------------------------------------------------- tutorial --- */
  const tutorialActive = tutStep >= 0 && !finishing;
  const vacuumSurfaceId = room.floor?.find((s) => s.tool === "vacuum")?.id;
  const firstClothing = room.organize?.find((o) => o.kind === "clothing" && !placedSet.has(o.id));
  useEffect(() => {
    if (!tutorialActive) return;
    if (tutStep === 0 && tool === "vacuum") setTutStep(1);
    else if (tutStep === 1 && vacuumSurfaceId && (floorPct[vacuumSurfaceId] || 0) >= 92) setTutStep(2);
    else if (tutStep === 2 && tool === "hand" && !firstClothing) { setTutStep(-1); onTutorialDone?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorialActive, tutStep, tool, floorPct]);

  let tutorialText = null, tutorialHighlightTool = null, tutorialArrow = null;
  if (tutorialActive) {
    if (tutStep === 0) { tutorialText = "Select the Vacuum"; tutorialHighlightTool = "vacuum"; }
    else if (tutStep === 1) { tutorialText = "Clean the carpet"; }
    else if (tutStep === 2) {
      if (tool !== "hand") { tutorialText = "Pick up the shirt"; tutorialHighlightTool = "hand"; }
      else if (firstClothing) {
        const it = layout.organize.find((x) => x.id === firstClothing.id);
        tutorialText = "Drag the shirt to the wardrobe"; tutorialArrow = it?.from3;
      } else tutorialText = "Pick up the shirt";
    }
  }

  /* -------------------------------------------------------------- hint --- */
  const onHint = useCallback(() => {
    if (finishing) return;
    // scan every tool, first incomplete category wins — same priority as before
    const order = ["hand", "duster", "vacuum", "mop", "spray", "cloth", "sponge"];
    let picked = null, pickedTool = null;
    for (const t of order) {
      const f = findTaskFor(t);
      if (f) { picked = f; pickedTool = t; break; }
    }
    if (!picked) return;
    setHintsUsed((n) => n + 1);
    setTool(pickedTool);
    setHintToolId(pickedTool);
    setHintText(pickedTool === "hand" ? `Move the ${picked.label} where it belongs.` : `Use the ${TOOL_LABEL[pickedTool]} on the ${picked.label}.`);
    sfx.hint(soundEnabled);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => { setHintText(null); setHintToolId(null); }, 4000);
  }, [finishing, findTaskFor, soundEnabled]);

  const hasAnyTask = Boolean(findTaskFor("hand") || TOOLS_ALL.some((t) => findTaskFor(t)));

  const dpr = settings.graphics === "low" ? [0.75, 1] : settings.graphics === "medium" ? [1, 1.5] : [1, 2];
  const shadowsOn = settings.graphics !== "low";

  const onCreated = useCallback(({ gl }) => {
    gl.shadowMap.enabled = shadowsOn;
    gl.shadowMap.type = settings.graphics === "high" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
    gl.outputColorSpace = THREE.SRGBColorSpace;
  }, [shadowsOn, settings.graphics]);

  const cleanBonus = clampPct(overall) / 100;
  const activeToolHighlight = tutorialHighlightTool || (hintToolId && hintText ? hintToolId : null);
  const arrowTarget = tutorialArrow || passiveTarget?.position3 || null;
  const nearestId = tutorialActive && tutStep === 2 && firstClothing ? firstClothing.id : passiveTarget?.id;
  const bubbleText = hintText || tutorialText;
  const bubbleVariant = hintText ? "hint" : "tutorial";

  return (
    <div className="cc3d">
      <div className="cc3d-hud">
        <button type="button" className="cc3d-hud__exit" onClick={onExit} aria-label="Back to rooms">‹</button>
        <div className="cc3d-hud__info">
          <div className="cc3d-hud__row">
            <span className="cc3d-hud__room">{room.name}</span>
            <span className="cc3d-hud__pct">{Math.round(overall)}% clean</span>
          </div>
          <div className="cc3d-hud__bar"><div className="cc3d-hud__bar-fill" style={{ width: `${Math.min(100, overall)}%` }} /></div>
          <div className="cc3d-hud__cats">
            {Object.entries(categoryPct).map(([k, v]) => (
              <span key={k} className={`cc3d-hud__cat${v >= 92 ? " cc3d-hud__cat--done" : ""}`}>
                {CATEGORY_LABEL[k] || k}{v >= 92 ? " ✓" : ` ${Math.round(v)}%`}
              </span>
            ))}
          </div>
        </div>
        <button type="button" className="cc3d-hud__hint" onClick={onHint} disabled={finishing || !hasAnyTask} title="Hint">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4.9 1 .9 1.7V16h5.2v-.4c0-.7.3-1.3.9-1.7A6 6 0 0 0 12 3Z" />
          </svg>
          Hint
        </button>
      </div>

      {bubbleText && <div className={`cc3d-bubble cc3d-bubble--${bubbleVariant}`}>{bubbleText}</div>}

      <div className="cc3d-toasts">{toasts.map((t) => <div key={t.id} className="cc3d-toast">{t.text}</div>)}</div>

      <div className="cc3d-canvas-wrap">
        <Canvas
          dpr={dpr}
          shadows={shadowsOn}
          gl={{ antialias: settings.graphics !== "low", powerPreference: "high-performance" }}
          camera={{ fov: 48, near: 0.1, far: 60 }}
          onCreated={onCreated}
        >
          <Scene3D
            room={room} layout={layout} tool={tool} disabled={finishing}
            trash={{ done: trashDone, hidden: trashHidden }} onTrashPlace={onTrashPlace}
            dustPct={dustPct} onDustProgress={onDustProgress} onDustComplete={onDustComplete}
            floorPct={floorPct} onFloorProgress={onFloorProgress} onFloorComplete={onFloorComplete}
            glassPct={glassPct} onGlassProgress={onGlassProgress} onGlassComplete={onGlassComplete}
            stainPct={stainPct} onStainProgress={onStainProgress} onStainComplete={onStainComplete}
            dishPct={dishPct} onDishProgress={onDishProgress} onDishComplete={onDishComplete}
            placedSet={placedSet} onOrganizePlace={onOrganizePlace}
            bedMade={bedMade} onBedMade={onBedMade} pillowPlaced={pillowPlaced} onPillowPlace={onPillowPlace}
            nearestId={nearestId} arrowTarget={arrowTarget}
            settings={settings} soundEnabled={soundEnabled} particleApi={particleApi}
            cameraEnabled={!finishing} cleanBonus={cleanBonus}
          />
        </Canvas>
      </div>

      <div className="cc3d-tray" role="toolbar" aria-label="Cleaning tools">
        {room.tools.map((id) => {
          const isActive = tool === id;
          const isHighlighted = activeToolHighlight === id && !isActive;
          return (
            <button
              key={id} type="button"
              className={`cc3d-tray__tool${isActive ? " cc3d-tray__tool--active" : ""}${isHighlighted ? " cc3d-tray__tool--highlight" : ""}`}
              onClick={() => !finishing && setTool(id)}
              aria-pressed={isActive} title={TOOL_LABEL[id]} disabled={finishing}
            >
              <svg viewBox="0 0 24 24" width="22" height="22"><ToolIcon id={id} active={isActive} /></svg>
              <span>{TOOL_LABEL[id]}</span>
            </button>
          );
        })}
      </div>

      {finishing && <div className="cc3d-finish-veil" aria-hidden="true" />}
    </div>
  );
}
