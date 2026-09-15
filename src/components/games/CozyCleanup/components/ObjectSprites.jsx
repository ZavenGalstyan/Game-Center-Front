/**
 * Cozy Cleanup — small illustrated object sprites: trash, the trash bag,
 * books, pillows, blanket, clothing, toys, cosmetics, shoes, dishes.
 * These are the pieces the player actually picks up, drags, folds and
 * places — kept visually simple but dimensional (shading + outline) so
 * they read clearly at small sizes.
 */

const wrap = (vb) => (Comp) => (props) => (
  <svg viewBox={vb} width="100%" height="100%" style={{ overflow: "visible" }}>
    <Comp {...props} />
  </svg>
);

/* ------------------------------------------------------------- trash --- */
export const TrashSprite = wrap("0 0 40 40")(({ kind = "paper" }) => {
  switch (kind) {
    case "cup":
      return (
        <g>
          <path d="M12 10 L28 10 L25 34 L15 34 Z" fill="#f3e2c8" stroke="#c9a86a" strokeWidth="1.2" />
          <ellipse cx={20} cy={10} rx={8} ry={2.4} fill="#fbf1de" />
          <path d="M28 14 Q36 14 34 22 Q32 27 26 25" fill="none" stroke="#c9a86a" strokeWidth="1.6" />
        </g>
      );
    case "wrapper":
      return (
        <g transform="rotate(-8 20 20)">
          <path d="M8 16 Q20 4 32 16 Q26 28 20 34 Q14 28 8 16Z" fill="#e8a0a8" stroke="#c97a86" strokeWidth="1" />
          <path d="M14 18 Q20 14 26 18" fill="none" stroke="#fff" strokeWidth="1.2" opacity="0.6" />
        </g>
      );
    case "box":
      return (
        <g>
          <rect x={7} y={14} width={26} height={18} rx={2} fill="#e2c19a" stroke="#b98a5a" strokeWidth="1.2" />
          <path d="M7 14 L20 20 L33 14" fill="none" stroke="#b98a5a" strokeWidth="1.2" />
        </g>
      );
    case "tissue":
      return (
        <g transform="rotate(12 20 20)">
          <rect x={9} y={13} width={22} height={16} rx={7} fill="#fbf7ee" stroke="#dcd4c2" strokeWidth="1" />
          <path d="M14 21 Q20 15 26 21" fill="none" stroke="#dcd4c2" strokeWidth="1.2" />
        </g>
      );
    default:
      return (
        <g transform="rotate(-10 20 20)">
          <path d="M10 12 L28 10 L30 26 Q20 34 10 26 Z" fill="#fbf7ee" stroke="#d8cfb8" strokeWidth="1.2" />
          <path d="M13 16 L26 15" stroke="#d8cfb8" strokeWidth="1" />
          <path d="M13 20 L25 19" stroke="#d8cfb8" strokeWidth="1" />
        </g>
      );
  }
});

export const BagSprite = wrap("0 0 60 70")(({ fill = 0 }) => (
  <g>
    <path d="M12 24 L48 24 L44 66 Q30 72 16 66 Z" fill="#8fae86" stroke="#6f8b68" strokeWidth="1.6" />
    <path d="M18 24 Q18 10 30 10 Q42 10 42 24" fill="none" stroke="#6f8b68" strokeWidth="3" />
    {fill > 0 && <ellipse cx={30} cy={30 + (1 - fill) * 20} rx={13} ry={7} fill="#5e7a58" opacity={Math.min(0.9, 0.3 + fill * 0.6)} />}
    {fill > 0.5 && <ellipse cx={30} cy={26} rx={15} ry={6} fill="#5e7a58" opacity="0.5" />}
  </g>
));

/* --------------------------------------------------------------- book --- */
export const BookSprite = wrap("0 0 30 44")(({ color = "#e08a7c" }) => (
  <g>
    <rect x={2} y={2} width={26} height={40} rx={2.5} fill={color} />
    <rect x={2} y={2} width={26} height={40} rx={2.5} fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth="1" />
    <rect x={6} y={6} width={18} height={2} fill="rgba(255,255,255,0.5)" />
    <rect x={2} y={2} width={5} height={40} fill="rgba(0,0,0,0.08)" />
  </g>
));

/* ------------------------------------------------------------ pillow --- */
export const PillowSprite = wrap("0 0 70 50")(({ color = "#faf3e8" }) => (
  <g>
    <rect x={3} y={3} width={64} height={44} rx={16} fill={color} stroke="rgba(120,90,60,0.18)" strokeWidth="1.2" />
    <path d="M35 8 Q30 25 35 42" stroke="rgba(120,90,60,0.14)" strokeWidth="1.4" fill="none" />
  </g>
));

export const BlanketSprite = wrap("0 0 130 60")(({ color = "#e7a0ab" }) => (
  <g>
    <path d="M2 6 Q65 -4 128 6 L128 54 Q65 64 2 54 Z" fill={color} stroke="rgba(120,60,60,0.15)" strokeWidth="1.2" />
    <path d="M2 20 Q65 12 128 20" stroke="rgba(255,255,255,0.35)" fill="none" strokeWidth="2" />
    <path d="M2 38 Q65 30 128 38" stroke="rgba(255,255,255,0.25)" fill="none" strokeWidth="2" />
  </g>
));

/* ----------------------------------------------------------- clothing --- */
export const ClothingSprite = wrap("0 0 70 60")(({ kind = "shirt", color = "#7a9cc9", folded = false }) => {
  if (folded) {
    return (
      <g>
        <rect x={6} y={14} width={58} height={34} rx={6} fill={color} stroke="rgba(0,0,0,0.12)" strokeWidth="1" />
        <rect x={6} y={14} width={58} height={9} rx={4} fill="rgba(255,255,255,0.25)" />
      </g>
    );
  }
  if (kind === "pants") {
    return (
      <g>
        <path d="M14 4 L56 4 L54 56 L38 56 L35 24 L32 56 L16 56 Z" fill={color} stroke="rgba(0,0,0,0.12)" strokeWidth="1" />
      </g>
    );
  }
  return (
    <g>
      <path d="M20 4 L8 14 L14 24 L20 20 L20 56 L50 56 L50 20 L56 24 L62 14 L50 4 L42 10 L28 10 Z" fill={color} stroke="rgba(0,0,0,0.12)" strokeWidth="1" />
    </g>
  );
});

/* ---------------------------------------------------------------- toy --- */
export const ToySprite = wrap("0 0 40 40")(({ kind = "ball", color = "#e08a7c" }) => {
  if (kind === "block") {
    return <rect x={4} y={4} width={32} height={32} rx={5} fill={color} stroke="rgba(0,0,0,0.15)" strokeWidth="1.2" />;
  }
  if (kind === "bear") {
    return (
      <g>
        <circle cx={20} cy={22} r={13} fill={color} />
        <circle cx={9} cy={9} r={5} fill={color} />
        <circle cx={31} cy={9} r={5} fill={color} />
        <circle cx={16} cy={20} r={1.6} fill="#4a3624" />
        <circle cx={24} cy={20} r={1.6} fill="#4a3624" />
      </g>
    );
  }
  return <circle cx={20} cy={20} r={16} fill={color} stroke="rgba(0,0,0,0.12)" strokeWidth="1.2" />;
});

/* --------------------------------------------------------- cosmetics --- */
export const CosmeticSprite = wrap("0 0 26 40")(({ kind = "bottle", color = "#c98fae" }) => {
  if (kind === "compact") {
    return <rect x={3} y={12} width={20} height={20} rx={4} fill={color} stroke="rgba(0,0,0,0.12)" strokeWidth="1" />;
  }
  return (
    <g>
      <rect x={9} y={2} width={8} height={6} rx={1.5} fill="#8a6142" />
      <rect x={5} y={8} width={16} height={28} rx={4} fill={color} stroke="rgba(0,0,0,0.12)" strokeWidth="1" />
    </g>
  );
});

/* -------------------------------------------------------------- shoe --- */
export const ShoeSprite = wrap("0 0 50 30")(({ color = "#8a6142" }) => (
  <g>
    <path d="M4 24 Q4 12 18 12 Q22 6 30 8 L44 16 Q48 18 46 24 Z" fill={color} stroke="rgba(0,0,0,0.15)" strokeWidth="1" />
    <path d="M4 24 L46 24" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
  </g>
));

/* -------------------------------------------------------------- dish --- */
export const DishSprite = wrap("0 0 50 50")(({ dirty = 0 }) => (
  <g>
    <ellipse cx={25} cy={25} rx={22} ry={22} fill="#eef4f7" stroke="#c9d6da" strokeWidth="1.4" />
    <ellipse cx={25} cy={25} rx={14} ry={14} fill="#dce8ec" />
    {dirty > 0 && (
      <g opacity={dirty}>
        <ellipse cx={20} cy={20} rx={7} ry={5} fill="#c9a86a" />
        <ellipse cx={30} cy={28} rx={5} ry={4} fill="#b98a5a" />
      </g>
    )}
  </g>
));
