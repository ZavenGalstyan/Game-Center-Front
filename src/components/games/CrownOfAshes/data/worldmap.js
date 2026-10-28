/**
 * The overworld of the Kingdom of Valdren (one seamless 1 km² heightfield)
 * plus two interiors placed far outside it (entered through doors with a
 * short fade). +X is east, −Z is north; yaw 0 faces +Z (south).
 *
 *            Frostfang peaks (impassable)
 *     Wintermere Hold ·       · Cinderpeak Sanctum (dragon)
 *        (Northern Wardens)   ╲ mountain path
 *  Mirror Mere                 ·
 *  Elderwood (wolves)    Standing Stones   Ashfall Ruins → crypt
 *  Wolf Den ·  · Hunter's Lodge          ╱  (Ashen Order)
 *  Red Hand camp · ─── Thornwick Village ─ bridge
 *                     (Free Marches)    · Ember Court Pavilion
 */

export const WORLD = { half: 512, cell: 2, play: 440 };

/** Regions: discovery, music, weather and the names on the map. */
export const REGIONS = [
  { id: "thornwick", name: "Thornwick Village", x: 0, z: 150, r: 95, faction: "marches", music: "village" },
  { id: "elderwood", name: "Elderwood", x: -270, z: 40, r: 200, music: "forest" },
  { id: "wintermere", name: "Wintermere Hold", x: 0, z: -300, r: 115, faction: "wardens", music: "castle", snow: true },
  { id: "frostfang", name: "Frostfang Foothills", x: 0, z: -190, r: 150, snow: true, music: "wild" },
  { id: "ashfall", name: "Ashfall Ruins", x: 300, z: 20, r: 110, music: "ruins", ash: true },
  { id: "cinderpeak", name: "Cinderpeak", x: 310, z: -250, r: 150, music: "mountain", ash: true },
  { id: "embercamp", name: "Ember Court Pavilion", x: 170, z: 250, r: 70, faction: "ember", music: "village" },
  { id: "silverrun", name: "Silverrun Vale", x: 120, z: 40, r: 140, music: "wild" },
  { id: "southmarch", name: "South March", x: -60, z: 330, r: 140, music: "wild" },
];

/**
 * Points of interest. `safe` ones are fast-travel camps once discovered.
 * `r` is the discovery radius.
 */
export const LOCATIONS = [
  { id: "thornwick", name: "Thornwick Village", x: 0, z: 152, r: 40, safe: true, icon: "village", spawn: [-6, 160] },
  { id: "lantern", name: "The Rusty Lantern Inn", x: -24, z: 134, r: 14, icon: "inn" },
  { id: "lodge", name: "Hunter's Lodge", x: -185, z: 56, r: 22, safe: true, icon: "camp", spawn: [-178, 62] },
  { id: "wolfden", name: "Greyfang Den", x: -330, z: -80, r: 28, icon: "den" },
  { id: "redhand", name: "Red Hand Camp", x: -300, z: 200, r: 40, icon: "camp-hostile" },
  { id: "watchtower", name: "Old Watchtower", x: -120, z: -40, r: 22, icon: "tower" },
  { id: "mere", name: "Mirror Mere", x: -130, z: -130, r: 40, icon: "lake" },
  { id: "wintermere", name: "Wintermere Hold", x: 0, z: -300, r: 60, safe: true, icon: "castle", spawn: [0, -268] },
  { id: "mines", name: "Frostfang Mines", x: -95, z: -255, r: 30, icon: "mine" },
  { id: "stones", name: "The Standing Stones", x: 150, z: -60, r: 26, icon: "stones" },
  { id: "ashfall", name: "Ashfall Ruins", x: 300, z: 20, r: 60, icon: "ruins" },
  { id: "outpost", name: "Ashfall Outpost", x: 205, z: 62, r: 20, safe: true, icon: "camp", spawn: [200, 66] },
  { id: "tunnel", name: "Smugglers' Grate", x: 334, z: 104, r: 14, icon: "secret", secret: true },
  { id: "cinderpath", name: "Cinderpeak Path", x: 315, z: -120, r: 40, icon: "path" },
  { id: "sanctum", name: "Cinderpeak Sanctum", x: 310, z: -330, r: 50, icon: "dragon" },
  { id: "embercamp", name: "Ember Court Pavilion", x: 170, z: 250, r: 35, safe: true, icon: "pavilion", spawn: [160, 240] },
  { id: "mill", name: "Thornwick Mill", x: -66, z: 206, r: 16, icon: "mill" },
  { id: "falls", name: "Silverrun Bridge", x: 46, z: 150, r: 14, icon: "bridge" },
];

/**
 * Roads: [x, z, (y)] control points. A third component pins the road surface
 * height (castle approach, mountain path); otherwise the road follows a
 * smoothed version of the land.
 */
export const ROADS = [
  { id: "kingsroad", w: 4.2, pts: [[0, 150], [-4, 90], [-10, 20], [-16, -50], [-6, -120], [0, -160, 9], [0, -200, 17], [0, -235, 26], [0, -262, 26]] },
  { id: "eastroad", w: 4, pts: [[0, 150], [30, 150], [62, 150], [110, 128], [160, 96], [205, 62], [245, 30]] },
  { id: "westroad", w: 3.6, pts: [[0, 150], [-40, 146], [-90, 132], [-140, 96], [-185, 60], [-240, 36], [-300, 10], [-330, -40]] },
  { id: "campspur", w: 3, pts: [[-140, 96], [-190, 140], [-250, 180], [-290, 196]] },
  { id: "emberroad", w: 3.4, pts: [[110, 128], [140, 175], [160, 220], [170, 248]] },
  { id: "millroad", w: 2.6, pts: [[-14, 170], [-40, 190], [-62, 204]] },
  { id: "stonesroad", w: 2.8, pts: [[-10, 20], [50, -10], [110, -40], [150, -58]] },
  { id: "minesroad", w: 2.8, pts: [[-6, -120], [-40, -170], [-70, -215, 18], [-92, -245, 24]] },
  {
    id: "cinderpath",
    w: 5,
    pts: [[300, -18, 12], [306, -60, 13], [322, -110, 19], [312, -160, 27], [284, -196, 34], [300, -232, 42], [338, -250, 49], [334, -284, 56], [314, -300, 58]],
  },
];

/** The Silverrun: north → south, east of the Kingsroad, under the east-road bridge. */
export const RIVER = {
  w: 11,
  pts: [[66, -262], [64, -250], [60, -170], [44, -90], [52, -10], [40, 70], [46, 150], [62, 230], [84, 320], [96, 440]],
};
/** Still water: Mirror Mere and the castle's frozen pond. */
export const LAKES = [
  { id: "mere", x: -130, z: -130, r: 34, depth: 3.2 },
  { id: "pond", x: -70, z: -300, r: 12, depth: 1.2, frozen: true },
];

/**
 * Flats shape the land under settlements: height `h` inside `r`, smooth
 * falloff over `fall` metres. `h: null` levels to the natural height at the
 * centre; `dh` offsets that (dens, pits).
 */
export const FLATS = [
  { x: 0, z: 150, r: 78, h: 6, fall: 40 },
  { x: 0, z: -300, r: 88, h: 26, fall: 34 },
  { x: 300, z: 20, r: 56, h: 12, fall: 30 },
  { x: 310, z: -330, r: 44, h: 58, fall: 16 },
  { x: 170, z: 250, r: 40, h: 5, fall: 26 },
  { x: -300, z: 200, r: 34, h: 9, fall: 20 },
  { x: -185, z: 56, r: 18, h: null, fall: 14 },
  { x: -330, z: -80, r: 18, h: null, dh: -3.5, fall: 16 },
  { x: -120, z: -40, r: 12, h: null, fall: 10 },
  { x: 150, z: -60, r: 20, h: null, fall: 14 },
  { x: 205, z: 62, r: 14, h: null, fall: 12 },
  { x: -95, z: -255, r: 22, h: 24, fall: 18 },
  { x: -66, z: 206, r: 12, h: 6.5, fall: 14 },
  { x: 334, z: 104, r: 9, h: null, fall: 8 },
];

/** Interiors live far off the heightfield (x ≥ 1800) on flat floors. */
export const INTERIORS = {
  crypt: { id: "crypt", name: "Ashfall Crypt", x: 2000, z: 0, floor: 0, dark: true },
  tunnel: { id: "tunnel", name: "Smugglers' Tunnel", x: 2000, z: 400, floor: 0, dark: true },
};
export const INTERIOR_X = 1800;
