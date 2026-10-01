/**
 * Helix Drop — 50 handcrafted towers (pure data; ONE engine plays them all).
 *
 * A ring is authored as  r(offsetDeg, "tokens", move?)  where the tokens
 * partition the full 360° starting at offsetDeg:
 *   g = gap   s = safe   d = danger   b = breakable        e.g. "g90 s200 d70"
 * move: sway(ampDeg, periodS, phase?) or spin(degPerS).
 * Design blocks (every argument chosen per tower, nothing random):
 *   stack(n, off, tokens)            n rings with aligned gaps → a multi-floor drop /
 *                                    Smash opportunity (reward, never required)
 *   spiral(n, off, step, tokens)     n rings, each turned by `step` → a helix stair
 * The ball sits at tower-local 90° when the tower is unrotated.
 *
 * Every tower is proven by tools/validateLevels.mjs: rings partition 360°,
 * every ring has a real gap ≥ 36°, danger ≤ 60%, finish last, the ball starts
 * over safe ground, a bot turning the tower at 35% of your max speed with a
 * late reaction finishes WITHOUT Smash, the ★★★ route (time + drop streak)
 * is reachable, and the next two rings are always on screen.
 */
function parse(tokens) {
  return tokens
    .trim()
    .split(/\s+/)
    .map((t) => [{ g: "gap", s: "safe", d: "danger", b: "break" }[t[0]], Number(t.slice(1))]);
}

const r = (off, tokens, move) => [{ off, tokens, move }];
const stack = (n, off, tokens) => Array.from({ length: n }, () => ({ off, tokens }));
const spiral = (n, off, step, tokens) => Array.from({ length: n }, (_, i) => ({ off: (off + i * step + 3600) % 360, tokens }));
const sway = (amp, period, phase = 0) => ({ amp, period, phase });
const spin = (deg) => ({ spin: deg });

/**
 * Designer nudges (ring id → offset°): after authoring, some rings were turned
 * so every gap offers a drop window that lands clear of danger and ring 0 starts
 * the ball on safe ground. Suggested by tools/nudge.mjs, reviewed, validated.
 */
const TUNE = {"T6L10":85,"T9L0":165,"T9L2":0,"T9L9":285,"T12L0":185,"T13L0":175,"T14L0":165,"T14L3":130,"T14L7":85,"T14L9":300,"T14L11":190,"T16L0":165,"T17L7":310,"T17L12":55,"T18L1":10,"T18L8":85,"T18L10":75,"T20L1":240,"T20L9":295,"T20L11":115,"T21L7":105,"T24L0":195,"T24L2":35,"T24L4":220,"T24L10":115,"T25L1":235,"T25L3":130,"T25L7":80,"T25L9":335,"T27L1":225,"T27L3":105,"T27L8":355,"T27L10":270,"T28L6":220,"T28L10":255,"T29L3":350,"T29L7":350,"T30L1":250,"T30L9":50,"T30L11":105,"T30L18":205,"T32L0":165,"T32L2":45,"T32L6":310,"T32L8":235,"T32L10":115,"T33L0":165,"T34L0":135,"T35L0":135,"T37L0":135,"T39L0":20,"T39L2":300,"T39L10":110,"T40L0":245,"T40L11":100,"T41L0":135,"T41L3":235,"T41L10":300,"T42L0":135,"T43L8":150,"T44L0":135,"T45L0":20,"T45L2":265,"T45L7":60,"T45L9":50,"T46L0":5,"T47L0":135,"T48L3":75,"T48L10":265,"T49L9":355,"T50L1":305,"T50L10":75,"T50L12":190,"T50L19":95,"T13L1":135,"T13L3":340,"T14L5":295,"T16L2":265,"T16L8":325,"T17L5":155,"T18L5":105,"T20L6":95,"T20L8":65,"T21L1":265,"T21L5":285,"T21L9":320,"T23L2":335,"T23L8":205,"T23L10":205,"T23L12":25,"T24L1":220,"T24L7":175,"T24L9":230,"T27L5":285,"T27L7":300,"T28L4":65,"T29L1":155,"T29L5":155,"T30L10":20,"T30L16":5,"T32L4":165,"T34L7":125,"T39L1":280,"T41L11":95,"T45L8":45,"T49L6":135,"T49L8":90,"T50L7":235,"T50L16":295,"T50L18":295};

function tower(id, world, name, targetTime, blocks, streakGoal = 3) {
  const rows = blocks.flat();
  const layers = rows.map((row, i) => {
    const lid = `T${id}L${i}`;
    return { id: lid, off: TUNE[lid] ?? row.off, segs: parse(row.tokens), ...(row.move ? { move: row.move } : {}) };
  });
  layers.push({ id: `T${id}F`, finish: true, segs: [["safe", 360]] });
  return { id, world, name, targetTime, streakGoal, layers };
}

export const LEVELS = [
  /* ============================================== WORLD 1 — SKY TOWER */
  tower(1, 1, "FIRST DROP", 14, [
    r(120, "g110 s250"), // the gap sits right beside the ball
    r(200, "g110 s250"), // slightly offset
    r(300, "g100 s260"), // needs an intentional turn
    r(60, "g120 s240"), //  ┐ stacked gaps:
    r(70, "g120 s240"), //  ┘ a 2-floor drop opportunity
    r(250, "g100 s260"),
    r(10, "g100 s260"),
    r(160, "g90 s210 d60"), // first small danger, far from the gap
    r(300, "g100 s260"),
    r(90, "g90 s200 d70"),
    r(220, "g100 s260"),
    r(20, "g140 s220"), // large, clear final opening
  ], 2),
  tower(2, 1, "SIDE STEP", 14, [
    r(150, "g100 s260"), r(240, "g100 s260"), r(330, "g100 s260"), r(60, "g100 s260"),
    r(150, "g95 s215 d50"), r(240, "g100 s260"), r(330, "g95 s215 d50"), r(60, "g100 s260"),
    stack(3, 150, "g100 s260"), r(250, "g95 s205 d60"), r(340, "g110 s250"),
  ]),
  tower(3, 1, "TURN AROUND", 15, [
    r(140, "g100 s260"), r(320, "g100 s260"), r(140, "g100 s260"), r(320, "g95 s205 d60"),
    r(150, "g95 s265"), r(330, "g90 s210 d60"), stack(3, 150, "g100 s260"),
    r(330, "g95 s205 d60"), r(150, "g95 s265"), r(330, "g100 s260"), r(150, "g120 s240"),
  ]),
  tower(4, 1, "DOUBLE DIP", 16, [
    r(130, "g100 s260"), stack(2, 220, "g100 s260"), r(20, "g95 s215 d50"), stack(2, 110, "g100 s260"),
    r(250, "g95 s205 d60"), stack(3, 350, "g100 s260"), r(160, "g90 s210 d60"), r(260, "g100 s260"),
    stack(2, 40, "g100 s260"), r(200, "g120 s240"),
  ]),
  tower(5, 1, "FIRST SMASH", 14, [
    r(130, "g100 s260"),
    stack(4, 210, "g100 s260"), // four aligned gaps: drop three, SMASH the fourth
    r(40, "g90 s200 d70"), r(160, "g95 s215 d50"), r(280, "g100 s260"),
    stack(4, 20, "g100 s260"), r(200, "g90 s210 d60"), r(320, "g110 s250"),
  ]),
  tower(6, 1, "DANGER ZONE", 11, [
    r(140, "g95 s155 d40 s70"), r(260, "g95 s115 d50 s100"), r(20, "g90 s120 d50 s50 d40 s10"),
    r(150, "g95 s205 d60"), stack(3, 280, "g95 s145 d45 s75"), r(60, "g90 s110 d60 s100"),
    r(190, "g95 s125 d45 s95"), r(310, "g90 s200 d70"), r(80, "g95 s155 d50 s60"), r(210, "g120 s240"),
  ]),
  tower(7, 1, "SPIRAL STAIRS", 17, [
    spiral(8, 130, 40, "g85 s275"),
    spiral(6, 30, -45, "g85 s215 d60"),
    r(200, "g120 s240"),
  ]),
  tower(8, 1, "TWO WAYS", 10, [
    r(130, "g70 s110 g70 s110"), r(220, "g70 s90 d40 s20 g70 s70"), r(310, "g70 s110 g70 s110"),
    r(40, "g70 s50 d40 s20 g70 s110"), stack(3, 130, "g70 s110 g70 s110"), r(220, "g70 s110 g70 s60 d50"),
    r(10, "g70 s110 g70 s110"), r(100, "g70 s80 d40 s30 g70 s70"), r(200, "g110 s250"),
  ]),
  tower(9, 1, "HIGH WIND", 12, [
    r(140, "g80 s220 d60"), r(260, "g75 s155 d60 s70"), r(20, "g80 s160 d70 s50"),
    r(150, "g75 s225 d60"), stack(3, 270, "g80 s280"), r(40, "g75 s135 d60 s90"),
    r(170, "g80 s210 d70"), r(290, "g75 s165 d60 s60"), r(50, "g80 s280"), r(190, "g75 s215 d70"), r(310, "g110 s250"),
  ]),
  tower(10, 1, "SKY SUMMIT", 19, [
    r(140, "g90 s270"), r(250, "g85 s215 d60"), spiral(4, 0, 35, "g85 s275"),
    stack(4, 150, "g90 s270"), r(330, "g80 s160 d60 s60"), r(80, "g85 s205 d70"),
    r(200, "g80 s150 d50 s80"), spiral(3, 320, -40, "g85 s215 d60"), r(160, "g120 s240"),
  ]),

  /* ============================================ WORLD 2 — SUNSET SPIRE */
  tower(11, 2, "GOLDEN HOUR", 13, [
    r(140, "g80 s280"), r(320, "g75 s225 d60"), r(140, "g80 s280"), r(320, "g75 s225 d60"),
    stack(3, 150, "g80 s280"), r(330, "g75 s155 d60 s70"), r(150, "g75 s225 d60"), r(330, "g80 s280"),
    r(150, "g75 s165 d60 s60"), r(330, "g80 s280"), r(150, "g100 s260"),
  ]),
  tower(12, 2, "SWITCHBACK", 13, [
    r(130, "g75 s205 d80"), r(310, "g75 s205 d80"), r(130, "g75 s135 d70 s80"), r(310, "g75 s135 d70 s80"),
    stack(3, 140, "g80 s280"), r(320, "g70 s150 d70 s70"), r(140, "g75 s205 d80"), r(320, "g70 s150 d70 s70"),
    r(140, "g75 s205 d80"), r(320, "g70 s140 d80 s70"), r(140, "g100 s260"),
  ]),
  tower(13, 2, "EMBER STEPS", 17, [
    spiral(6, 130, 50, "g75 s215 d70"), stack(3, 70, "g80 s280"), spiral(6, 250, -50, "g70 s150 d70 s70"), r(330, "g100 s260"),
  ]),
  tower(14, 2, "NARROW PASS", 15, [
    r(140, "g65 s235 d60"), r(260, "g65 s155 d70 s70"), r(20, "g65 s225 d70"), r(150, "g65 s165 d60 s70"),
    stack(3, 280, "g70 s290"), r(60, "g65 s155 d70 s70"), r(190, "g65 s225 d70"), r(310, "g65 s165 d60 s70"),
    r(80, "g65 s225 d70"), r(210, "g65 s155 d70 s70"), r(330, "g100 s260"),
  ]),
  tower(15, 2, "TWIN FLAMES", 11, [
    r(130, "g60 s90 d30 g60 s120"), r(250, "g60 s120 g60 s90 d30"), r(10, "g60 s90 d30 g60 s120"),
    stack(3, 130, "g60 s120 g60 s120"), r(250, "g60 s90 d30 g60 s90 d30"), r(10, "g60 s120 g60 s120"),
    r(130, "g60 s90 d30 g60 s90 d30"), r(250, "g60 s120 g60 s120"), r(10, "g60 s90 d30 g60 s120"), r(130, "g100 s260"),
  ]),
  tower(16, 2, "DUSK DIVE", 15, [
    r(140, "g70 s230 d60"), stack(4, 250, "g75 s285"), r(70, "g65 s155 d70 s70"), r(190, "g70 s220 d70"),
    stack(4, 310, "g75 s285"), r(130, "g65 s155 d70 s70"), r(250, "g70 s220 d70"), r(10, "g100 s260"),
  ]),
  tower(17, 2, "TERRACES", 16, [
    r(140, "g70 s110 d50 s130"), r(230, "g70 s110 d50 s130"), r(320, "g70 s110 d50 s130"), r(50, "g70 s110 d50 s130"),
    stack(3, 140, "g75 s285"), r(320, "g65 s115 d60 s120"), r(50, "g65 s115 d60 s120"), r(140, "g65 s115 d60 s120"),
    r(230, "g65 s115 d60 s120"), r(320, "g65 s115 d60 s120"), r(50, "g65 s225 d70"), r(140, "g100 s260"),
  ]),
  tower(18, 2, "SUNBURN", 16, [
    r(140, "g65 s145 d80 s70"), r(310, "g65 s145 d80 s70"), r(110, "g60 s160 d80 s60"), r(290, "g60 s160 d80 s60"),
    stack(3, 90, "g70 s290"), r(270, "g60 s150 d90 s60"), r(80, "g60 s150 d90 s60"), r(260, "g60 s150 d90 s60"),
    r(70, "g60 s150 d90 s60"), r(250, "g60 s210 d90"), r(60, "g100 s260"),
  ]),
  tower(19, 2, "LANTERN WALK", 20, [
    spiral(5, 140, 60, "g65 s155 d70 s70"), stack(3, 80, "g70 s290"), spiral(5, 260, 60, "g60 s160 d80 s60"),
    stack(3, 200, "g70 s290"), r(20, "g65 s215 d80"), r(140, "g100 s260"),
  ]),
  tower(20, 2, "SPIRE CROWN", 21, [
    r(140, "g65 s145 d80 s70"), spiral(4, 260, 45, "g60 s160 d80 s60"), stack(4, 80, "g70 s290"),
    r(260, "g60 s110 d60 s70 d60"), r(20, "g60 s150 d90 s60"), spiral(4, 140, -50, "g60 s160 d80 s60"),
    stack(3, 320, "g70 s290"), r(140, "g60 s210 d90"), r(260, "g100 s260"),
  ]),

  /* ============================================= WORLD 3 — FROZEN CORE */
  tower(21, 3, "COLD START", 14, [
    r(140, "g75 s285"), r(260, "g70 s230 d60", sway(20, 3.2)), r(20, "g75 s285"), r(150, "g70 s230 d60", sway(20, 3.2, 0.5)),
    stack(3, 270, "g75 s285"), r(60, "g70 s160 d60 s70", sway(18, 3)), r(190, "g75 s285"), r(310, "g70 s230 d60", sway(22, 3.4)),
    r(80, "g75 s285"), r(200, "g100 s260"),
  ]),
  tower(22, 3, "CRACKED ICE", 11, [
    r(140, "g75 s105 b80 s100"), r(260, "g70 s110 b80 s100"), r(20, "g70 s150 d60 b80"), r(150, "g70 s110 b80 s100"),
    stack(3, 270, "g75 b285"), r(60, "g70 s120 b80 d60 s30"), r(190, "g70 s110 b80 s100"), r(310, "g70 s150 d60 b80"),
    r(80, "g70 s110 b80 s100"), r(200, "g100 s260"),
  ]),
  tower(23, 3, "GLACIER DROP", 14, [
    r(140, "g75 s285"), stack(5, 250, "g75 s225 d60"), r(70, "g70 s160 d60 s70"), stack(5, 190, "g75 s285"),
    r(10, "g70 s160 d60 s70", sway(20, 3)), r(130, "g70 s230 d60"), r(250, "g100 s260"),
  ]),
  tower(24, 3, "DRIFTING", 14, [
    r(140, "g70 s230 d60", sway(25, 3)), r(260, "g70 s160 d60 s70", sway(25, 3.2, 0.3)), r(20, "g70 s230 d60", sway(25, 2.8, 0.6)),
    r(150, "g75 s285"), r(270, "g70 s160 d60 s70", sway(25, 3.4)), r(40, "g70 s230 d60", sway(28, 3, 0.2)),
    stack(3, 160, "g75 s285"), r(340, "g70 s160 d60 s70", sway(25, 3)), r(100, "g70 s230 d60", sway(25, 3.3, 0.5)), r(220, "g100 s260"),
  ]),
  tower(25, 3, "FROST BITE", 13, [
    r(140, "g65 s105 b60 d60 s70"), r(260, "g65 s155 d70 b70"), r(20, "g65 b90 s85 d60 s60"), r(150, "g65 s155 d70 b70"),
    stack(3, 270, "g70 b290"), r(60, "g65 s105 b60 d60 s70"), r(190, "g65 s155 d70 b70"), r(310, "g65 b90 s85 d60 s60"),
    r(80, "g65 s155 d70 b70"), r(200, "g65 s225 d70"), r(320, "g100 s260"),
  ]),
  tower(26, 3, "SNOWFALL", 20, [
    spiral(6, 140, 45, "g70 s160 d60 s70"), stack(4, 50, "g75 s285"), spiral(6, 230, -45, "g65 s165 d70 s60"),
    r(310, "g70 s230 d60", sway(22, 3)), r(70, "g100 s260"),
  ]),
  tower(27, 3, "BLIZZARD", 14, [
    r(140, "g65 s155 d70 s70", sway(25, 2.8)), r(260, "g65 b155 d70 s70"), r(20, "g65 s225 d70", sway(25, 3, 0.4)),
    r(150, "g65 s155 d70 b70"), stack(4, 270, "g70 s290"), r(90, "g65 s155 d70 s70", sway(28, 3.2)),
    r(210, "g65 b225 d70"), r(330, "g65 s155 d70 s70", sway(25, 2.9, 0.7)), r(90, "g65 s225 d70"), r(210, "g100 s260"),
  ]),
  tower(28, 3, "ICE SHELVES", 14, [
    r(140, "g70 s110 d50 b130"), r(230, "g70 s110 d50 b130"), r(320, "g70 s110 d50 b130"), stack(3, 50, "g75 b285"),
    r(230, "g65 s115 d60 b120"), r(320, "g65 s115 d60 b120", sway(20, 3)), r(50, "g65 s115 d60 b120"),
    r(140, "g65 s115 d60 b120", sway(20, 3.2, 0.5)), r(230, "g65 s225 d70"), r(320, "g100 s260"),
  ]),
  tower(29, 3, "CRYSTAL SHAFT", 17, [
    stack(3, 140, "g75 s285"), r(320, "g65 s155 d70 s70", sway(22, 3)), stack(3, 140, "g75 b285"),
    r(320, "g65 s155 d70 s70", sway(22, 3.1, 0.3)), stack(3, 140, "g75 s285"), r(320, "g65 s225 d70", sway(24, 3, 0.6)),
    stack(3, 140, "g75 b285"), r(320, "g100 s260"),
  ]),
  tower(30, 3, "FROZEN HEART", 21, [
    r(140, "g65 s155 d70 s70"), spiral(4, 260, 50, "g65 b155 d70 s70"), stack(4, 100, "g70 s290"),
    r(280, "g60 s160 d80 s60", sway(25, 2.8)), r(40, "g60 b120 d60 s60 d60", sway(20, 3)), spiral(4, 160, -50, "g65 s155 d70 s70"),
    stack(3, 350, "g70 b290"), r(170, "g60 s160 d80 s60", sway(25, 3, 0.5)), r(290, "g100 s260"),
  ]),

  /* ========================================== WORLD 4 — ANCIENT ABYSS */
  tower(31, 4, "RUIN GATE", 10, [
    r(140, "g70 s290"), r(260, "g65 s165 d60 s70", spin(18)), r(20, "g65 s235 d60"), r(150, "g65 s165 d60 s70", spin(-18)),
    stack(3, 270, "g70 s290"), r(60, "g65 s165 d60 s70", spin(20)), r(190, "g65 s235 d60"), r(310, "g65 s165 d60 s70", spin(-20)),
    r(80, "g65 s235 d60"), r(200, "g100 s260"),
  ]),
  tower(32, 4, "SUNKEN HALLS", 14, [
    r(140, "g60 s120 d60 s60 d60"), r(260, "g60 s120 d60 s60 d60"), r(20, "g60 s180 d60 s60"), stack(3, 150, "g65 s295"),
    r(330, "g60 s120 d60 s60 d60"), r(90, "g60 s120 d60 s60 d60"), r(210, "g60 s180 d60 s60"), r(330, "g60 s120 d60 s60 d60"),
    r(90, "g60 s180 d60 s60"), r(210, "g100 s260"),
  ]),
  tower(33, 4, "TURNING STONES", 14, [
    r(140, "g65 s235 d60", spin(22)), r(260, "g65 s165 d60 s70", spin(-22)), r(20, "g65 s235 d60", spin(24)),
    r(150, "g70 s290"), r(270, "g65 s165 d60 s70", spin(-24)), stack(3, 30, "g70 s290"), r(210, "g65 s235 d60", spin(24)),
    r(330, "g65 s165 d60 s70", spin(-22)), r(90, "g65 s235 d60", spin(22)), r(210, "g100 s260"),
  ]),
  tower(34, 4, "GILDED DESCENT", 19, [
    spiral(6, 140, 55, "g60 s160 d80 s60"), stack(4, 110, "g65 s295"), spiral(6, 290, -55, "g60 s160 d80 s60"), r(330, "g100 s260"),
  ]),
  tower(35, 4, "MIST TEMPLE", 10, [
    r(140, "g60 s120 b60 d60 s60"), r(260, "g60 s150 d70 b80", spin(20)), r(20, "g60 b100 s80 d70 s50"), stack(4, 150, "g65 b295"),
    r(330, "g60 s150 d70 s80", spin(-22)), r(90, "g60 s120 b60 d60 s60"), r(210, "g60 s150 d70 b80", spin(22)),
    r(330, "g60 s220 d80"), r(90, "g100 s260"),
  ]),
  tower(36, 4, "PILLAR MAZE", 11, [
    r(140, "g55 s70 d40 s70 d40 s85"), r(250, "g55 s70 d40 s70 d40 s85"), r(0, "g55 s110 d50 s145"), stack(3, 130, "g60 s300"),
    r(310, "g55 s70 d40 s70 d40 s85"), r(60, "g55 s70 d40 s70 d40 s85"), r(170, "g55 s110 d50 s145"),
    r(280, "g55 s70 d40 s70 d40 s85"), r(30, "g55 s235 d70"), r(150, "g100 s260"),
  ]),
  tower(37, 4, "ABYSS WHEEL", 10, [
    r(140, "g60 s180 d60 s60", spin(28)), r(260, "g60 s180 d60 s60", spin(-28)), r(20, "g60 s180 d60 s60", spin(28)),
    stack(3, 150, "g65 s295"), r(330, "g60 s180 d60 s60", spin(-30)), r(90, "g60 s180 d60 s60", spin(30)),
    r(210, "g60 s180 d60 s60", spin(-28)), r(330, "g60 s240 d60", spin(26)), r(90, "g100 s260"),
  ]),
  tower(38, 4, "BROKEN AQUEDUCT", 10, [
    stack(3, 140, "g65 b295"), r(320, "g60 s160 d80 s60"), stack(3, 140, "g65 b295"), r(320, "g60 s160 d80 s60", spin(20)),
    stack(3, 140, "g65 s295"), r(320, "g60 b160 d80 s60"), r(80, "g60 s220 d80", spin(-22)), r(200, "g100 s260"),
  ]),
  tower(39, 4, "CATACOMBS", 11, [
    r(140, "g55 s120 d70 s60 d55"), r(260, "g55 s120 d70 s60 d55", sway(25, 3)), r(20, "g55 s180 d70 s55"), r(150, "g55 s120 d70 s60 d55"),
    stack(4, 270, "g60 s300"), r(90, "g55 s120 d70 s60 d55", spin(24)), r(210, "g55 s180 d70 s55"),
    r(330, "g55 s120 d70 s60 d55", sway(25, 3.2, 0.5)), r(90, "g55 s235 d70"), r(210, "g100 s260"),
  ]),
  tower(40, 4, "THE DEEP", 22, [
    r(140, "g60 s160 d80 s60"), spiral(4, 260, 50, "g55 s165 d80 s60"), stack(4, 100, "g60 b300"),
    r(280, "g55 s120 d70 s60 d55", spin(26)), r(40, "g55 s165 d80 s60", sway(28, 3)), spiral(4, 160, -50, "g55 s165 d80 s60"),
    stack(4, 350, "g60 s300"), r(170, "g55 s120 d70 s60 d55", spin(-26)), r(290, "g100 s260"),
  ]),

  /* ============================================== WORLD 5 — NEON VOID */
  tower(41, 5, "SIGNAL", 11, [
    r(140, "g60 s160 d80 s60"), r(260, "g55 s165 d80 s60", spin(24)), r(20, "g55 b165 d80 s60"), r(150, "g55 s165 d80 s60", sway(25, 2.8)),
    stack(4, 270, "g60 s300"), r(90, "g55 s165 d80 s60", spin(-26)), r(210, "g55 b120 d70 s60 d55"), r(330, "g55 s165 d80 s60"),
    r(90, "g55 s225 d80", sway(25, 3)), r(210, "g100 s260"),
  ]),
  tower(42, 5, "PULSE", 20, [
    spiral(5, 140, 60, "g55 s165 d80 s60"), stack(3, 80, "g60 b300"), r(260, "g55 s165 d80 s60", spin(28)),
    spiral(5, 20, -60, "g55 s120 d70 s60 d55"), stack(3, 140, "g60 s300"), r(320, "g100 s260"),
  ]),
  tower(43, 5, "CIRCUIT", 10, [
    r(140, "g50 s70 d40 s70 d40 s90"), r(250, "g50 s70 d40 s70 d40 s90", spin(22)), r(0, "g50 s120 d60 s130"),
    stack(3, 130, "g55 s305"), r(310, "g50 s70 d40 s70 d40 s90", spin(-24)), r(60, "g50 s120 d60 s130", sway(25, 3)),
    r(170, "g50 s70 d40 s70 d40 s90"), r(280, "g50 s240 d70"), r(30, "g100 s260"),
  ]),
  tower(44, 5, "OVERCLOCK", 9, [
    r(140, "g55 s165 d80 s60", spin(32)), r(260, "g55 s165 d80 s60", spin(-32)), stack(4, 20, "g60 s300"),
    r(200, "g55 s165 d80 s60", spin(34)), r(320, "g55 s165 d80 s60", spin(-34)), stack(4, 80, "g60 b300"),
    r(260, "g55 s225 d80", spin(30)), r(20, "g100 s260"),
  ]),
  tower(45, 5, "STATIC", 10, [
    r(140, "g55 s305"), r(260, "g55 b165 d80 s60", sway(28, 2.8, 0.4)), r(20, "g55 s165 d80 s60", sway(28, 2.7, 0.8)),
    stack(4, 150, "g60 s300"), r(330, "g55 s120 d70 s60 d55", sway(30, 2.6)), r(90, "g55 b165 d80 s60", sway(28, 2.9, 0.3)),
    r(210, "g55 s165 d80 s60", sway(28, 2.7, 0.6)), r(330, "g55 s225 d80"), r(90, "g100 s260"),
  ]),
  tower(46, 5, "FIREWALL", 13, [
    r(140, "g50 s80 d90 s50 d90"), r(260, "g50 s80 d90 s50 d90"), stack(3, 20, "g55 s305"), r(200, "g50 s80 d90 s50 d90", spin(22)),
    r(320, "g50 s80 d90 s50 d90"), stack(3, 80, "g55 b305"), r(260, "g50 s80 d90 s50 d90", spin(-22)), r(20, "g50 s220 d90"),
    r(140, "g100 s260"),
  ]),
  tower(47, 5, "VOLTAGE", 21, [
    spiral(6, 140, 50, "g55 s165 d80 s60"), stack(4, 80, "g60 s300"), r(260, "g55 s120 d70 s60 d55", spin(30)),
    spiral(6, 20, -50, "g55 b165 d80 s60"), r(80, "g55 s225 d80", sway(28, 2.8)), r(200, "g100 s260"),
  ]),
  tower(48, 5, "NULL SECTOR", 11, [
    r(140, "g50 s130 d90 s90"), r(260, "g50 s130 d90 s90", spin(28)), r(20, "g50 b130 d90 s90"), r(150, "g50 s130 d90 s90", sway(28, 2.8)),
    stack(4, 270, "g55 s305"), r(90, "g50 s130 d90 s90", spin(-30)), r(210, "g50 b130 d90 s90"), r(330, "g50 s130 d90 s90", sway(30, 2.7)),
    stack(3, 90, "g55 s305"), r(270, "g50 s220 d90"), r(30, "g100 s260"),
  ]),
  tower(49, 5, "EVENT GRID", 21, [
    r(140, "g50 s70 d40 s70 d40 s90", spin(24)), spiral(4, 260, 55, "g50 s130 d90 s90"), stack(4, 120, "g55 b305"),
    r(300, "g50 s130 d90 s90", sway(30, 2.7)), r(60, "g50 s70 d40 s70 d40 s90", spin(-28)), spiral(4, 180, -55, "g50 s130 d90 s90"),
    stack(4, 0, "g55 s305"), r(180, "g50 s220 d90", spin(26)), r(300, "g100 s260"),
  ]),
  tower(50, 5, "THE CORE", 30, [
    // the mastery tower: every mechanic, longer, but always a fair read
    r(140, "g60 s300"), // breathe
    r(260, "g55 s165 d80 s60"), // danger
    spiral(4, 20, 50, "g55 s165 d80 s60"), // read the helix
    stack(4, 220, "g60 s300"), // earn a Smash…
    r(40, "g50 s130 d90 s90"), // …and use it (or land carefully)
    r(160, "g55 b165 d80 s60"), // breakables
    r(280, "g55 s165 d80 s60", sway(28, 2.8)), // sway
    r(40, "g55 s120 d70 s60 d55", spin(26)), // spin
    r(160, "g60 s300"),
    stack(4, 280, "g60 b300"), // a long drop through ice…
    r(100, "g50 s80 d90 s50 d90"), // …into a firewall
    r(220, "g55 s165 d80 s60", spin(-28)),
    spiral(4, 340, -55, "g50 s130 d90 s90"),
    r(120, "g55 s165 d80 s60", sway(30, 2.7)),
    stack(3, 240, "g60 s300"),
    r(60, "g50 s70 d40 s70 d40 s90", spin(24)),
    r(180, "g50 s220 d90"),
    r(300, "g120 s240"), // the last opening
  ]),
];

export const getLevel = (id) => LEVELS.find((L) => L.id === id) || null;
export const levelsOfWorld = (w) => LEVELS.filter((L) => L.world === w);
