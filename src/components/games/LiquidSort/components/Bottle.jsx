/**
 * Liquid Sort — one glass bottle: shell + liquid + interaction chrome.
 *
 * Purely presentational + a click handler; all puzzle logic lives in
 * systems/pourRules.js. Selection lift, invalid-move shake, hint glow and
 * the completed-bottle sparkle are CSS-driven (see LiquidSort.css) so they
 * stay smooth even when the rest of the board is busy animating a pour.
 *
 * `ghost` hides this grid slot's own glass while keeping its layout space —
 * used for the source bottle while its floating clone is mid-pour in the
 * overlay layer, so nothing is ever rendered twice.
 */
import { forwardRef } from "react";
import { BottleGlassBack, BottleGlassFront, VB_W, VB_H } from "./BottleGlass.jsx";
import LiquidLayer from "./LiquidLayer.jsx";
import { isBottleCompleted, CAPACITY } from "../systems/pourRules.js";

const Bottle = forwardRef(function Bottle(
  {
    colors,
    displayUnits,
    styleId = "classic",
    capacity = CAPACITY,
    selected = false,
    hint = null, // "from" | "to" | null
    shakeNonce = 0,
    completedNonce = 0,
    pourLandedNonce = 0,
    ghost = false,
    disabled = false,
    colorAssist = false,
    animationsOn = true,
    label = null,
    className = "",
    interactive = true,
    onClick,
  },
  ref,
) {
  const completed = isBottleCompleted(colors, capacity);

  const classes = [
    "ls-bottle",
    className,
    selected && "ls-bottle--selected",
    hint && `ls-bottle--hint-${hint}`,
    ghost && "ls-bottle--ghost",
    disabled && "ls-bottle--disabled",
    completed && "ls-bottle--completed",
    animationsOn ? "" : "ls-bottle--reduced-motion",
  ].filter(Boolean).join(" ");

  // `interactive=false` renders a plain <div> instead of a <button> — used
  // for decorative/preview bottles that sit inside someone else's own
  // <button> (e.g. the Settings style swatches), so the DOM never nests one
  // button inside another.
  const Tag = interactive ? "button" : "div";
  const tagProps = interactive
    ? { type: "button", onClick, disabled, "aria-pressed": selected }
    : {};

  return (
    <Tag
      ref={ref}
      className={classes}
      aria-label={label || `Bottle ${colors.length ? `with ${colors.length} units` : "empty"}`}
      {...tagProps}
    >
      {/* keyed by shakeNonce so the CSS shake animation restarts on every new invalid attempt */}
      <span className={shakeNonce > 0 ? "ls-bottle--shake" : undefined} key={shakeNonce} style={{ display: "block", width: "100%", height: "100%" }}>
        {selected && <span className="ls-bottle__glow" aria-hidden="true" />}
        {hint && <span className={`ls-bottle__hint-ring ls-bottle__hint-ring--${hint}`} aria-hidden="true" />}
        {shakeNonce > 0 && <span key={`rim-${shakeNonce}`} className="ls-bottle__rim-flash" aria-hidden="true" />}
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="ls-bottle__svg" aria-hidden="true">
          <BottleGlassBack styleId={styleId} />
          <LiquidLayer
            colors={colors}
            displayUnits={displayUnits}
            styleId={styleId}
            capacity={capacity}
            colorAssist={colorAssist}
            pourLandedNonce={pourLandedNonce}
            animationsOn={animationsOn}
          />
          <BottleGlassFront styleId={styleId} />
        </svg>
        {completedNonce > 0 && (
          <span key={completedNonce} aria-hidden="true">
            <span className="ls-bottle__complete-flash" />
            <span className="ls-bottle__sparkle">
              {Array.from({ length: 5 }).map((_, i) => (
                <i key={i} style={{ "--i": i }} />
              ))}
            </span>
          </span>
        )}
      </span>
    </Tag>
  );
});

export default Bottle;
