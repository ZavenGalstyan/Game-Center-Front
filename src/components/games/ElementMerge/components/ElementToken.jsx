import { forwardRef } from "react";
import { ElementIcon } from "./icons.jsx";
import { getElement } from "../data/elements.js";

/**
 * One element card/token — used identically in the Library, the Workspace
 * and the Discovery Book (with different `variant`/size via CSS). Forwards
 * its ref so drag code can read/mutate the real DOM node directly (see
 * WorkspaceCanvas.jsx) instead of round-tripping through React state.
 */
const ElementToken = forwardRef(function ElementToken(
  { elementId, variant = "workspace", favorite = false, dimmed = false, className = "", style, ...rest },
  ref,
) {
  const el = getElement(elementId);
  if (!el) return null;
  return (
    <div
      ref={ref}
      className={`em-token em-token--${variant}${dimmed ? " em-token--dimmed" : ""} ${className}`}
      style={style}
      data-element-id={elementId}
      {...rest}
    >
      {favorite && <span className="em-token__fav" aria-hidden="true">★</span>}
      <div className="em-token__art">
        <ElementIcon id={el.id} family={el.family} />
      </div>
      <span className="em-token__name">{el.name}</span>
    </div>
  );
});

export default ElementToken;
