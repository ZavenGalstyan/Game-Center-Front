/**
 * Cozy Cleanup — the first-time tutorial for Level 1 only. Three short,
 * silent-movie-style beats taught entirely through the guidance system
 * (highlighted tool + arrow) plus one line of text — never a popup wall of
 * text. Finishes itself the moment its condition is met; never blocks the
 * player from just playing past it.
 */
import { useEffect, useRef, useState } from "react";

export function useTutorial({ active, room, tool, floorPct, placedSet, onDone }) {
  const [step, setStep] = useState(0); // 0: select vacuum, 1: clean carpet, 2: pick up clothes
  const doneRef = useRef(false);

  const vacuumSurface = (room.floor || []).find((s) => s.tool === "vacuum") || null;
  const clothingItem = (room.organize || []).find((o) => o.kind === "clothing" && !placedSet.has(o.id)) || null;

  useEffect(() => {
    if (!active || doneRef.current) return;
    if (step === 0 && tool === "vacuum") { setStep(1); return; }
    if (step === 1 && vacuumSurface && (floorPct[vacuumSurface.id] || 0) >= 92) { setStep(2); return; }
    if (step === 2 && tool === "hand" && !clothingItem) { doneRef.current = true; onDone?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step, tool, floorPct]);

  if (!active || doneRef.current) return null;

  if (step === 0) return { text: "Select the Vacuum", highlightToolId: "vacuum" };
  if (step === 1) return { text: "Clean the dusty carpet" };
  if (step === 2) {
    if (tool !== "hand") return { text: "Great! Now pick up the clothes.", highlightToolId: "hand" };
    if (clothingItem) {
      return {
        text: "Drag the clothes to the wardrobe.",
        arrowOverride: {
          mode: "object",
          target: {
            from: clothingItem.from,
            region: { x: clothingItem.to.x - clothingItem.size.w / 2, y: clothingItem.to.y - clothingItem.size.h / 2, w: clothingItem.size.w, h: clothingItem.size.h },
          },
        },
      };
    }
    return { text: "Great! Now pick up the clothes." };
  }
  return null;
}

export function GuideBubble({ text, variant = "hint" }) {
  if (!text) return null;
  return (
    <div className={`cc-guide-bubble cc-guide-bubble--${variant}`}>
      {text}
    </div>
  );
}
