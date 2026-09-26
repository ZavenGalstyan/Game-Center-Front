/**
 * Number Fusion — a single numbered tile. Color is a deterministic function
 * of value (not a hand-authored table past the first few tiers) so any
 * value the board can ever produce still gets a sensible, distinct color —
 * an original dark-premium palette, not a copy of any existing game's.
 */
const NAMED_STOPS = [
  { v: 2, h: 199, s: 72, l: 58 },
  { v: 4, h: 189, s: 75, l: 55 },
  { v: 8, h: 172, s: 65, l: 52 },
  { v: 16, h: 152, s: 60, l: 50 },
  { v: 32, h: 92, s: 55, l: 52 },
  { v: 64, h: 45, s: 80, l: 55 },
  { v: 128, h: 28, s: 85, l: 56 },
  { v: 256, h: 14, s: 82, l: 56 },
  { v: 512, h: 350, s: 75, l: 58 },
  { v: 1024, h: 320, s: 70, l: 60 },
  { v: 2048, h: 271, s: 70, l: 62 },
];

function paletteFor(value) {
  const tierIndex = Math.min(NAMED_STOPS.length - 1, Math.round(Math.log2(value)) - 1);
  const stop = NAMED_STOPS[Math.max(0, tierIndex)];
  // Beyond 2048, keep cycling into violet/white territory so huge tiles still read as "further along".
  const beyond = Math.max(0, Math.log2(value) - 11);
  const h = (stop.h - beyond * 14 + 360) % 360;
  const l = Math.min(78, stop.l + beyond * 3);
  return { h, s: stop.s, l };
}

export default function Tile({ value, r, c, size, isNew, isMerged }) {
  const { h, s, l } = paletteFor(value);
  const light = `hsl(${h}, ${s}%, ${Math.min(88, l + 16)}%)`;
  const base = `hsl(${h}, ${s}%, ${l}%)`;
  const dark = `hsl(${h}, ${s}%, ${Math.max(18, l - 20)}%)`;
  const digits = String(value).length;

  return (
    <div
      className={`nf-tile${isNew ? " nf-tile--new" : ""}${isMerged ? " nf-tile--merged" : ""}`}
      data-digits={digits}
      style={{
        "--nf-tile-light": light,
        "--nf-tile-base": base,
        "--nf-tile-dark": dark,
        left: `${(c / size) * 100}%`,
        top: `${(r / size) * 100}%`,
        width: `${(1 / size) * 100}%`,
        height: `${(1 / size) * 100}%`,
      }}
    >
      <span className="nf-tile__value">{value}</span>
    </div>
  );
}
