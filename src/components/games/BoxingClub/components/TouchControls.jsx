/**
 * Boxing Club — touch controls: movement + dodge on the left thumb,
 * punches + block on the right. Few, large, well-separated buttons.
 * Pointer capture keeps a held button held even if the thumb slides a bit;
 * pointercancel/leave always releases it (no stuck inputs).
 */
function Hold({ className, label, onDown, onUp, children }) {
  const down = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    onDown();
  };
  const up = (e) => {
    e.preventDefault();
    onUp?.();
  };
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

export default function TouchControls({ input }) {
  return (
    <div className="bc-touch">
      <div className="bc-touch__left">
        <Hold className="bc-tbtn bc-tbtn--dir" label="Move back" onDown={() => input.hold("left", true)} onUp={() => input.hold("left", false)}>◀</Hold>
        <Hold className="bc-tbtn bc-tbtn--dodge" label="Dodge" onDown={() => input.press("dodge")}>DODGE</Hold>
        <Hold className="bc-tbtn bc-tbtn--dir" label="Move forward" onDown={() => input.hold("right", true)} onUp={() => input.hold("right", false)}>▶</Hold>
      </div>
      <div className="bc-touch__right">
        <Hold className="bc-tbtn bc-tbtn--body" label="Body (hold)" onDown={() => input.hold("body", true)} onUp={() => input.hold("body", false)}>BODY</Hold>
        <Hold className="bc-tbtn bc-tbtn--block" label="Block (hold)" onDown={() => input.hold("block", true)} onUp={() => input.hold("block", false)}>BLOCK</Hold>
        <Hold className="bc-tbtn bc-tbtn--hook" label="Hook" onDown={() => input.press("attack", "hookL")}>HOOK</Hold>
        <Hold className="bc-tbtn bc-tbtn--cross" label="Cross" onDown={() => input.press("attack", "cross")}>CROSS</Hold>
        <Hold className="bc-tbtn bc-tbtn--jab" label="Jab" onDown={() => input.press("attack", "jab")}>JAB</Hold>
      </div>
    </div>
  );
}
