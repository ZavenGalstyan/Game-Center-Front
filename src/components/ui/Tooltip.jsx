import { useState, useRef, useEffect } from "react";

/**
 * Tooltip component for displaying contextual information.
 *
 * @param {object} props
 * @param {string|React.ReactNode} props.content
 * @param {"top" | "bottom" | "left" | "right"} [props.position="top"]
 * @param {number} [props.delay=200] - Delay in ms before showing
 * @param {string} [props.className]
 * @param {React.ReactNode} props.children
 */
export default function Tooltip({
  content,
  position = "top",
  delay = 200,
  className = "",
  children,
}) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef(null);

  const showTooltip = () => {
    timeoutRef.current = setTimeout(() => {
      setVisible(true);
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const wrapperClassNames = ["ui-tooltip-wrapper", className]
    .filter(Boolean)
    .join(" ");

  const tooltipClassNames = [
    "ui-tooltip",
    `ui-tooltip--${position}`,
    visible && "ui-tooltip--visible",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={wrapperClassNames}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      <span className={tooltipClassNames} role="tooltip" aria-hidden={!visible}>
        {content}
      </span>
    </span>
  );
}
