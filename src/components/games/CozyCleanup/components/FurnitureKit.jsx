/**
 * Cozy Cleanup — shared illustrated furniture library.
 *
 * Every room scene is built from these pieces. Nothing here is a flat
 * rectangle: `Box3D` is the one shape primitive everything else composes
 * from — a simple isometric-lite block (front face + top face + side face,
 * each shaded differently) that gives every piece of furniture real volume,
 * a highlight edge and a soft contact shadow. Specific furniture just adds
 * type-appropriate details (drawer lines, book spines, a lamp shade, leaves)
 * on top of one or more boxes.
 *
 * Every piece renders inside its own `<svg viewBox="0 0 W H">`; the caller
 * positions it with a percentage-based wrapper (see RoomStage) so the whole
 * scene scales losslessly with the GamePlayer stage.
 */
import { useId } from "react";

function shade(hex, amt) {
  // amt in [-1,1]; negative darkens, positive lightens. Cheap, no color libs.
  const n = hex.replace("#", "");
  const num = parseInt(n.length === 3 ? n.split("").map((c) => c + c).join("") : n, 16);
  let r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
  const mix = (c) => amt >= 0 ? Math.round(c + (255 - c) * amt) : Math.round(c * (1 + amt));
  r = Math.max(0, Math.min(255, mix(r)));
  g = Math.max(0, Math.min(255, mix(g)));
  b = Math.max(0, Math.min(255, mix(b)));
  return `rgb(${r},${g},${b})`;
}

/**
 * The one shape primitive: a shaded block with top + front + side faces.
 * Each face is a soft gradient rather than a flat tint (a single warm
 * light source from the upper-left), there's a two-layer soft contact
 * shadow instead of one hard ellipse, and a thin rim-light catches the
 * top-front edge — together that's what turns "colored rectangle" into
 * "furniture with volume sitting on a floor".
 */
export function Box3D({ x, y, w, h, depth = 10, color, rx = 3, noSide = false, noTop = false, shadowOn = true }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const top = shade(color, 0.32);
  const topLight = shade(color, 0.5);
  const front = shade(color, 0.06);
  const frontShadow = shade(color, -0.16);
  const side = shade(color, -0.2);
  const sideDark = shade(color, -0.38);
  return (
    <g>
      <defs>
        <linearGradient id={`ccbt${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={topLight} />
          <stop offset="100%" stopColor={top} />
        </linearGradient>
        <linearGradient id={`ccbf${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={front} />
          <stop offset="70%" stopColor={color} />
          <stop offset="100%" stopColor={frontShadow} />
        </linearGradient>
        <linearGradient id={`ccbs${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={side} />
          <stop offset="100%" stopColor={sideDark} />
        </linearGradient>
      </defs>
      {shadowOn && (
        <>
          <ellipse cx={x + w / 2 + depth / 2} cy={y + depth + h + 3} rx={(w + depth) * 0.54} ry={Math.max(2.6, h * 0.1)} fill="rgba(25,16,8,0.10)" />
          <ellipse cx={x + w / 2 + depth * 0.6} cy={y + depth + h + 1.5} rx={(w + depth) * 0.4} ry={Math.max(2, h * 0.06)} fill="rgba(25,16,8,0.15)" />
        </>
      )}
      <rect x={x} y={y + depth} width={w} height={h} rx={rx} fill={`url(#ccbf${uid})`} />
      {!noTop && (
        <polygon points={`${x},${y + depth} ${x + depth},${y} ${x + w + depth},${y} ${x + w},${y + depth}`} fill={`url(#ccbt${uid})`} />
      )}
      {!noSide && (
        <polygon points={`${x + w},${y + depth} ${x + w + depth},${y} ${x + w + depth},${y + h} ${x + w},${y + depth + h}`} fill={`url(#ccbs${uid})`} />
      )}
      {!noTop && (
        <line x1={x} y1={y + depth} x2={x + depth} y2={y} stroke="rgba(255,255,255,0.5)" strokeWidth="0.9" strokeLinecap="round" opacity="0.8" />
      )}
      <rect x={x} y={y + depth} width={w} height={h} rx={rx} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="0.6" />
      <rect x={x} y={y + depth} width={w} height={Math.max(1.2, h * 0.1)} rx={rx} fill="rgba(255,255,255,0.16)" />
    </g>
  );
}

// `none` so every piece exactly fills the percentage box RoomStage gives it —
// that keeps interactive overlays (dust/glass/snap zones) aligned to what's
// actually drawn without needing to chase per-piece aspect-ratio letterboxing.
const wrap = (w, h) => (Comp) => (props) => (
  <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" preserveAspectRatio="none" style={{ overflow: "visible" }}>
    <Comp {...props} />
  </svg>
);

/* ---------------------------------------------------------------- BED --- */
export const BedProp = wrap(160, 110)(({ color = "#e7a0ab", frame = "#8a6142", sheet = "#faf3e8" }) => {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <g>
      <Box3D x={4} y={24} w={152} h={46} depth={14} color={frame} rx={6} />
      <Box3D x={10} y={4} w={16} h={40} depth={10} color={frame} rx={4} />
      {/* headboard slats for texture */}
      {[16, 19, 22].map((cx) => <rect key={cx} x={cx} y={8} width={1.4} height={30} rx={0.7} fill="rgba(0,0,0,0.12)" />)}
      <defs>
        <linearGradient id={`ccbed${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(0,0,0,0.08)" />
          <stop offset="18%" stopColor="rgba(0,0,0,0)" />
        </linearGradient>
      </defs>
      <rect x={16} y={30} width={130} height={34} rx={8} fill={sheet} />
      {/* soft contact shadow where the mattress meets the headboard */}
      <rect x={16} y={30} width={130} height={34} rx={8} fill={`url(#ccbed${uid})`} />
      <rect x={16} y={30} width={130} height={11} rx={5} fill={shade(color, 0.12)} />
      {/* faint quilting */}
      <g stroke="rgba(120,90,60,0.1)" strokeWidth="0.8">
        {[0, 1, 2, 3].map((i) => <line key={`a${i}`} x1={30 + i * 30} y1={32} x2={16 + i * 30} y2={62} />)}
        {[0, 1, 2, 3].map((i) => <line key={`b${i}`} x1={16 + i * 30} y1={32} x2={30 + i * 30} y2={62} />)}
      </g>
      <rect x={16} y={30} width={130} height={34} rx={8} fill="none" stroke="rgba(120,90,60,0.2)" strokeWidth="1" />
    </g>
  );
});

export const NightstandProp = wrap(60, 70)(({ color = "#c99a6c" }) => (
  <g>
    <Box3D x={4} y={22} w={48} h={40} depth={8} color={color} rx={5} />
    <rect x={12} y={40} width={32} height={3} rx={1.5} fill="rgba(60,40,20,0.35)" />
    <circle cx={28} cy={41.5} r={1.6} fill="rgba(80,60,30,0.5)" />
  </g>
));

export const DeskProp = wrap(140, 90)(({ color = "#c99a6c", top = "#e2c19a" }) => (
  <g>
    <rect x={22} y={54} width={8} height={30} fill={shade(color, -0.15)} />
    <rect x={104} y={54} width={8} height={30} fill={shade(color, -0.15)} />
    <Box3D x={6} y={30} w={122} h={12} depth={14} color={top} rx={4} />
    <rect x={16} y={48} width={40} height={22} rx={3} fill={shade(color, -0.05)} />
    <rect x={22} y={57} width={28} height={2.4} rx={1.2} fill="rgba(60,40,20,0.4)" />
  </g>
));

export const ChairProp = wrap(60, 90)(({ color = "#8a6142" }) => (
  <g>
    <Box3D x={20} y={4} w={26} h={30} depth={6} color={color} rx={4} noSide />
    <Box3D x={10} y={38} w={40} h={22} depth={8} color={shade(color, 0.08)} rx={5} />
    <rect x={14} y={62} width={4} height={20} fill={shade(color, -0.2)} />
    <rect x={42} y={62} width={4} height={20} fill={shade(color, -0.2)} />
  </g>
));

export const BookshelfProp = wrap(120, 140)(({ color = "#8a6142", books }) => {
  const rows = [30, 70, 110];
  const spineColors = ["#e08a7c", "#8fae86", "#e0b95c", "#7a9cc9", "#c98fae"];
  return (
    <g>
      <Box3D x={4} y={6} w={104} h={128} depth={10} color={color} rx={6} />
      {/* recessed back panel so the shelves read as an interior, not a flat front */}
      <rect x={13} y={17} width={86} height={116} rx={3} fill="rgba(0,0,0,0.14)" />
      {rows.map((ry, i) => (
        <g key={i}>
          <rect x={12} y={ry - 26} width={90} height={2} fill="rgba(255,255,255,0.1)" />
          <rect x={12} y={ry + 10} width={90} height={4} fill={shade(color, -0.28)} />
          <rect x={12} y={ry + 10} width={90} height={1.4} fill="rgba(255,255,255,0.18)" />
        </g>
      ))}
      {(books ?? [0, 1, 2]).map((row) => (
        <g key={row}>
          {Array.from({ length: 7 }).map((_, i) => (
            <g key={i}>
              <rect x={16 + i * 12} y={rows[row] - 24} width={9} height={24} rx={1.5}
                fill={spineColors[(row * 3 + i) % spineColors.length]} opacity={0.94} />
              <rect x={16 + i * 12} y={rows[row] - 24} width={2.2} height={24} rx={1} fill="rgba(255,255,255,0.28)" />
            </g>
          ))}
        </g>
      ))}
    </g>
  );
});

export const WardrobeProp = wrap(110, 150)(({ color = "#b98a5a" }) => (
  <g>
    <Box3D x={4} y={8} w={92} h={134} depth={12} color={color} rx={6} />
    {/* inset door panels */}
    <rect x={12} y={26} width={34} height={100} rx={4} fill="none" stroke="rgba(60,40,20,0.22)" strokeWidth="1.4" />
    <rect x={54} y={26} width={34} height={100} rx={4} fill="none" stroke="rgba(60,40,20,0.22)" strokeWidth="1.4" />
    {/* faint wood grain */}
    <g stroke="rgba(60,40,20,0.08)" strokeWidth="1">
      <path d="M14 34 Q30 50 16 80 Q28 100 14 120" fill="none" />
      <path d="M80 34 Q66 50 80 80 Q68 100 82 120" fill="none" />
    </g>
    <line x1={50} y1={20} x2={50} y2={140} stroke="rgba(60,40,20,0.32)" strokeWidth="1.6" />
    <rect x={41} y={76} width={8} height={3} rx={1.5} fill="#f0e2c8" />
    <rect x={41} y={76} width={8} height={3} rx={1.5} fill="none" stroke="rgba(60,40,20,0.3)" strokeWidth="0.5" />
    <rect x={61} y={76} width={8} height={3} rx={1.5} fill="#f0e2c8" />
    <rect x={61} y={76} width={8} height={3} rx={1.5} fill="none" stroke="rgba(60,40,20,0.3)" strokeWidth="0.5" />
  </g>
));

export const WindowProp = wrap(150, 170)(({ sky = "#bfe0ef", curtain = "#e8a0a8", frame = "#f6efe4" }) => {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <g>
      <defs>
        <linearGradient id={`ccsky${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={shade(sky, 0.25)} />
          <stop offset="100%" stopColor={sky} />
        </linearGradient>
        <radialGradient id={`ccsun${uid}`} cx="72%" cy="20%" r="30%">
          <stop offset="0%" stopColor="#fff6d8" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#fff6d8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`cccurt${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={shade(curtain, -0.18)} />
          <stop offset="55%" stopColor={curtain} />
          <stop offset="100%" stopColor={shade(curtain, 0.14)} />
        </linearGradient>
      </defs>
      <rect x={6} y={6} width={138} height={150} rx={6} fill={`url(#ccsky${uid})`} />
      <rect x={6} y={6} width={138} height={150} rx={6} fill={`url(#ccsun${uid})`} />
      {/* soft vignette so the pane reads as glass, not a flat rectangle */}
      <rect x={6} y={6} width={138} height={150} rx={6} fill="none" stroke="rgba(20,30,30,0.12)" strokeWidth="5" />
      {/* diagonal glass reflection streak */}
      <path d="M20 10 L48 10 L14 130 L-8 130 Z" fill="rgba(255,255,255,0.22)" />
      <path d="M60 10 L72 10 L38 150 L26 150 Z" fill="rgba(255,255,255,0.14)" />
      <rect x={73} y={6} width={4} height={150} fill="rgba(255,255,255,0.55)" />
      <rect x={6} y={78} width={138} height={4} fill="rgba(255,255,255,0.55)" />
      <path d="M2 4 Q30 18 10 76 Q26 100 6 160 L-6 160 L-6 4Z" fill={`url(#cccurt${uid})`} opacity="0.94" />
      <path d="M2 4 Q30 18 10 76 Q26 100 6 160" fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="1.4" />
      <path d="M148 4 Q120 18 140 76 Q124 100 144 160 L156 160 L156 4Z" fill={`url(#cccurt${uid})`} opacity="0.94" />
      <path d="M148 4 Q120 18 140 76 Q124 100 144 160" fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="1.4" />
      <rect x={2} y={0} width={146} height={158} rx={8} fill="none" stroke={frame} strokeWidth="7" />
      <rect x={2} y={0} width={146} height={2.4} rx={1} fill="rgba(255,255,255,0.6)" />
      <Box3D x={0} y={158} w={150} h={10} depth={5} color={frame} rx={2} />
    </g>
  );
});

export const LampProp = wrap(50, 100)(({ shadeColor = "#f0c46a", base = "#8a6142", lit = true }) => (
  <g>
    {lit && <circle cx={25} cy={24} r={22} fill="#fff2c0" opacity="0.28" />}
    <rect x={23} y={28} width={4} height={44} fill={shade(base, -0.1)} />
    <ellipse cx={25} cy={74} rx={14} ry={4} fill={base} />
    <path d="M10 30 L40 30 L34 8 L16 8 Z" fill={shadeColor} />
    <path d="M10 30 L40 30 L34 8 L16 8 Z" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
  </g>
));

export const PlantProp = wrap(60, 100)(({ pot = "#c9825a", leaf = "#7fa66f" }) => (
  <g>
    <path d="M30 42 C10 40 6 16 18 4 C20 20 26 30 30 42Z" fill={leaf} />
    <path d="M30 42 C50 40 54 14 42 2 C40 20 34 30 30 42Z" fill={shade(leaf, -0.12)} />
    <path d="M30 42 C24 30 26 10 30 0 C34 10 36 30 30 42Z" fill={shade(leaf, 0.14)} />
    <Box3D x={10} y={44} w={40} h={30} depth={6} color={pot} rx={4} />
  </g>
));

export const WallArtProp = wrap(90, 70)(({ frame = "#8a6142", art = "#e8a0a8" }) => (
  <g>
    <rect x={2} y={2} width={86} height={66} rx={4} fill={frame} />
    <rect x={9} y={9} width={72} height={52} rx={2} fill="#faf3e8" />
    <circle cx={45} cy={35} r={16} fill={art} opacity="0.85" />
    <path d="M20 55 Q45 20 70 55" fill="none" stroke={shade(art, -0.2)} strokeWidth="3" opacity="0.7" />
  </g>
));

export const RugProp = wrap(200, 120)(({ color = "#e0955f", ring = "#f4d9b0" }) => {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <g>
      <defs>
        <radialGradient id={`ccrug${uid}`} cx="50%" cy="42%" r="65%">
          <stop offset="0%" stopColor={shade(color, 0.12)} />
          <stop offset="75%" stopColor={color} />
          <stop offset="100%" stopColor={shade(color, -0.14)} />
        </radialGradient>
      </defs>
      <ellipse cx={100} cy={62} rx={98} ry={58} fill="rgba(20,12,4,0.1)" />
      <ellipse cx={100} cy={60} rx={98} ry={58} fill={`url(#ccrug${uid})`} />
      <ellipse cx={100} cy={60} rx={80} ry={46} fill="none" stroke={ring} strokeWidth="5" opacity="0.85" />
      <ellipse cx={100} cy={60} rx={58} ry={32} fill="none" stroke={ring} strokeWidth="3" opacity="0.65" />
      <ellipse cx={100} cy={60} rx={34} ry={18} fill="none" stroke={ring} strokeWidth="2" opacity="0.4" />
      {/* woven fringe */}
      {Array.from({ length: 26 }).map((_, i) => {
        const a = (i / 26) * Math.PI * 2;
        const x1 = 100 + Math.cos(a) * 98, y1 = 60 + Math.sin(a) * 58 * 0.98;
        const x2 = 100 + Math.cos(a) * 102, y2 = 60 + Math.sin(a) * 58 * 1.05;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={shade(color, -0.1)} strokeWidth="1.1" opacity="0.5" />;
      })}
    </g>
  );
});

export const DoorProp = wrap(70, 170)(({ color = "#b98a5a" }) => (
  <g>
    <Box3D x={4} y={8} w={54} h={154} depth={8} color={color} rx={4} noTop />
    <circle cx={48} cy={90} r={2.4} fill="#f0e2c8" />
  </g>
));

/* -------------------------------------------------- KITCHEN / CAFÉ --- */
export const CounterProp = wrap(220, 90)(({ color = "#cfe0d6", top = "#8a6142" }) => (
  <g>
    <Box3D x={4} y={26} w={210} h={54} depth={12} color={color} rx={6} />
    <Box3D x={0} y={10} w={218} h={16} depth={12} color={top} rx={4} />
  </g>
));

export const StoveProp = wrap(80, 90)(({ color = "#5c6670" }) => (
  <g>
    <Box3D x={4} y={26} w={68} h={50} depth={10} color={color} rx={6} />
    <circle cx={22} cy={38} r={7} fill="#2c3236" />
    <circle cx={48} cy={38} r={7} fill="#2c3236" />
    <circle cx={22} cy={38} r={3} fill="#4a545c" />
    <circle cx={48} cy={38} r={3} fill="#4a545c" />
  </g>
));

export const FridgeProp = wrap(70, 150)(({ color = "#eef4f0" }) => (
  <g>
    <Box3D x={4} y={8} w={54} h={134} depth={10} color={color} rx={6} />
    <rect x={12} y={46} width={4} height={20} rx={2} fill="rgba(60,60,60,0.35)" />
    <line x1={8} y1={44} x2={60} y2={44} stroke="rgba(60,60,60,0.2)" strokeWidth="1.5" />
  </g>
));

export const SinkProp = wrap(80, 60)(({ color = "#dfe6ea" }) => (
  <g>
    <Box3D x={6} y={16} w={68} h={34} depth={8} color={color} rx={8} />
    <ellipse cx={40} cy={34} rx={22} ry={9} fill="#b9c4cb" />
    <rect x={36} y={6} width={4} height={12} rx={2} fill="#9aa7ad" />
  </g>
));

export const CabinetProp = wrap(120, 100)(({ color = "#b98a5a" }) => (
  <g>
    <Box3D x={4} y={16} w={104} h={78} depth={10} color={color} rx={6} />
    <line x1={56} y1={26} x2={56} y2={88} stroke="rgba(60,40,20,0.3)" strokeWidth="1.2" />
    <circle cx={50} cy={56} r={1.8} fill="#f0e2c8" />
    <circle cx={62} cy={56} r={1.8} fill="#f0e2c8" />
  </g>
));

/* --------------------------------------------------------- BATHROOM --- */
export const BathtubProp = wrap(170, 80)(({ color = "#eef4f7" }) => (
  <g>
    <Box3D x={4} y={22} w={158} h={44} depth={10} color={color} rx={20} />
    <ellipse cx={83} cy={40} rx={68} ry={13} fill="#cfe0e6" />
  </g>
));

export const MirrorProp = wrap(80, 90)(({ frame = "#c9825a" }) => (
  <g>
    <rect x={4} y={4} width={72} height={82} rx={14} fill={frame} />
    <rect x={11} y={11} width={58} height={68} rx={10} fill="#dceef2" />
    <path d="M18 20 L34 66" stroke="#fff" strokeWidth="4" opacity="0.5" strokeLinecap="round" />
  </g>
));

export const ShowerProp = wrap(90, 160)(({ color = "#c9d6da" }) => (
  <g>
    <rect x={4} y={4} width={82} height={150} rx={8} fill="none" stroke={color} strokeWidth="4" opacity="0.8" />
    <rect x={4} y={4} width={82} height={150} rx={8} fill="#eaf3f5" opacity="0.35" />
    <circle cx={70} cy={20} r={5} fill="#9aa7ad" />
  </g>
));

/* ----------------------------------------------------------- LAUNDRY --- */
export const WasherProp = wrap(80, 90)(({ color = "#eef4f0" }) => (
  <g>
    <Box3D x={4} y={16} w={68} h={70} depth={8} color={color} rx={8} />
    <circle cx={38} cy={54} r={20} fill="#9fb5c2" />
    <circle cx={38} cy={54} r={14} fill="#6f8b9b" />
    <rect x={12} y={22} width={10} height={5} rx={2} fill="#c9d6da" />
  </g>
));

export const BasketProp = wrap(70, 60)(({ color = "#c99a6c" }) => (
  <g>
    <Box3D x={6} y={16} w={58} h={34} depth={8} color={color} rx={10} noTop />
    <ellipse cx={35} cy={20} rx={30} ry={8} fill={shade(color, 0.2)} />
  </g>
));

/* ---------------------------------------------------------- BALCONY --- */
export const RailProp = wrap(220, 70)(({ color = "#b98a5a" }) => (
  <g>
    {Array.from({ length: 10 }).map((_, i) => (
      <rect key={i} x={8 + i * 21} y={8} width={5} height={54} rx={2} fill={color} />
    ))}
    <rect x={4} y={4} width={212} height={7} rx={3} fill={shade(color, 0.15)} />
    <rect x={4} y={58} width={212} height={7} rx={3} fill={shade(color, -0.15)} />
  </g>
));

export const PlanterProp = wrap(90, 60)(({ pot = "#c9825a", leaf = "#7fa66f" }) => (
  <g>
    <Box3D x={4} y={26} w={82} h={28} depth={6} color={pot} rx={5} />
    {[14, 32, 50, 68].map((cx, i) => (
      <path key={i} d={`M${cx} 30 C${cx - 10} 20 ${cx - 6} 4 ${cx} 0 C${cx + 6} 4 ${cx + 10} 20 ${cx} 30Z`} fill={i % 2 ? leaf : shade(leaf, -0.1)} />
    ))}
  </g>
));

/* -------------------------------------------------------- KIDS ROOM --- */
export const ToyboxProp = wrap(100, 80)(({ color = "#7a9cc9" }) => (
  <g>
    <Box3D x={4} y={20} w={88} h={54} depth={10} color={color} rx={8} />
    <rect x={4} y={16} width={88} height={10} rx={4} fill={shade(color, 0.3)} />
  </g>
));

export const CribProp = wrap(130, 90)(({ color = "#f0dcc0" }) => (
  <g>
    <Box3D x={6} y={26} w={118} h={40} depth={10} color={color} rx={8} />
    {Array.from({ length: 9 }).map((_, i) => (
      <rect key={i} x={14 + i * 12} y={4} width={4} height={30} rx={2} fill={shade(color, -0.2)} />
    ))}
  </g>
));

/* ----------------------------------------------------------- GENERIC --- */
export const SofaProp = wrap(180, 100)(({ color = "#8fae86" }) => (
  <g>
    <Box3D x={4} y={40} w={172} h={40} depth={10} color={color} rx={10} />
    <Box3D x={4} y={10} w={172} h={26} depth={10} color={shade(color, 0.06)} rx={10} noSide />
    <Box3D x={0} y={30} w={22} h={54} depth={8} color={shade(color, -0.05)} rx={10} />
    <Box3D x={158} y={30} w={22} h={54} depth={8} color={shade(color, -0.05)} rx={10} />
  </g>
));

export const TableProp = wrap(150, 70)(({ color = "#b98a5a", top = "#e2c19a" }) => (
  <g>
    <rect x={20} y={40} width={8} height={26} fill={shade(color, -0.2)} />
    <rect x={122} y={40} width={8} height={26} fill={shade(color, -0.2)} />
    <Box3D x={6} y={18} w={138} h={14} depth={12} color={top} rx={6} />
  </g>
));

export const BenchProp = wrap(140, 60)(({ color = "#b98a5a" }) => (
  <g>
    <Box3D x={4} y={20} w={130} h={14} depth={10} color={color} rx={5} />
    <rect x={12} y={34} width={6} height={20} fill={shade(color, -0.2)} />
    <rect x={122} y={34} width={6} height={20} fill={shade(color, -0.2)} />
  </g>
));

export const RackProp = wrap(120, 130)(({ color = "#8a6142" }) => (
  <g>
    <rect x={16} y={6} width={4} height={120} fill={color} />
    <rect x={100} y={6} width={4} height={120} fill={color} />
    <rect x={12} y={6} width={96} height={5} rx={2.5} fill={shade(color, 0.15)} />
  </g>
));

export const shadeColor = shade;
