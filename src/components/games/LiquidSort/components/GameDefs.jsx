/**
 * Liquid Sort — the one shared <defs> pool for the whole gameplay screen.
 *
 * SVG gradients/clipPaths are addressable across sibling <svg> elements in
 * the same document via url(#id), so instead of every bottle re-declaring
 * its own clip path and every liquid band re-declaring its own gradient,
 * everything reusable is declared exactly once here (rendered invisibly at
 * the top of <LiquidBoard>) and referenced by id everywhere else.
 */
import { BottleStyleDefs, STYLE_IDS } from "./BottleGlass.jsx";
import { COLOR_IDS, COLORS } from "../data/colors.js";

export const liquidGradId = (color) => `ls-liquid-${color}`;
export const streamGradId = (color) => `ls-stream-${color}`;

export default function GameDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        {STYLE_IDS.map((id) => (
          <BottleStyleDefs key={id} styleId={id} />
        ))}
        {/*
          userSpaceOnUse with a fixed span covering the whole liquid region
          (not each band's own bounding box) — so a color's shading reads as
          ONE continuous body of liquid across every unit it occupies,
          instead of every individual unit re-running its own light-to-dark
          gradient and looking like a stack of separate pills.
        */}
        {COLOR_IDS.map((id) => {
          const c = COLORS[id];
          return (
            <linearGradient key={id} id={liquidGradId(id)} x1="0" y1="70" x2="0" y2="186" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={c.top} />
              <stop offset="55%" stopColor={c.top} />
              <stop offset="100%" stopColor={c.bottom} />
            </linearGradient>
          );
        })}
        {COLOR_IDS.map((id) => {
          const c = COLORS[id];
          return (
            <linearGradient key={id} id={streamGradId(id)} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={c.bottom} stopOpacity="0.85" />
              <stop offset="45%" stopColor={c.top} stopOpacity="0.95" />
              <stop offset="100%" stopColor={c.top} stopOpacity="0.85" />
            </linearGradient>
          );
        })}
      </defs>
    </svg>
  );
}
