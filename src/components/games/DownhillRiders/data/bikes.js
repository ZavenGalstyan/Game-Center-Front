/**
 * Downhill Riders — the six bikes and the three rivals.
 *
 * Stats are 1–5 on the four axes shown in the Garage; paramsFor() turns
 * them into controller numbers (engine/bike.js). Rival riders ride the same
 * controller with region-scaled stats (engine/race.js), never beyond Legend.
 */

export const BIKES = [
  {
    id: "trailblazer",
    name: "TRAILBLAZER",
    blurb: "A dependable all-rounder. Forgiving on landings, easy through the turns — the bike every champion learns on.",
    stats: { speed: 3, accel: 3, handling: 3, jump: 3 },
    colors: { frame: "#ff6b1f", accent: "#1d2230", rim: "#22252c", tire: "#1a1a1c", jersey: "#ff6b1f", jersey2: "#1d2b4a", helmet: "#ffd21f", visor: "#1b1b22", pants: "#273042", gloves: "#1d2230", shoes: "#2b2f38" },
    unlock: null,
  },
  {
    id: "swift",
    name: "SWIFT",
    blurb: "Featherweight frame and a short gear. Explodes out of the gate and out of every slow corner.",
    stats: { speed: 3, accel: 5, handling: 3, jump: 3 },
    colors: { frame: "#2ec5ff", accent: "#ffffff", rim: "#1c3242", tire: "#191a1c", jersey: "#2ec5ff", jersey2: "#0e2a3e", helmet: "#ffffff", visor: "#0d3a55", pants: "#16283a", gloves: "#ffffff", shoes: "#0e2a3e" },
    unlock: { medals: 3, text: "Earn 3 medals" },
  },
  {
    id: "gravity",
    name: "GRAVITY",
    blurb: "Long travel, slack geometry, planted landings. Tricks spin faster and sketchy landings get saved.",
    stats: { speed: 3, accel: 3, handling: 3, jump: 5 },
    colors: { frame: "#a35cff", accent: "#ffd21f", rim: "#2a1f3d", tire: "#1a1a1c", jersey: "#a35cff", jersey2: "#2a1745", helmet: "#2a1745", visor: "#ffd21f", pants: "#22183a", gloves: "#ffd21f", shoes: "#22183a" },
    unlock: { region: 1, text: "Complete Green Forest" },
  },
  {
    id: "phantom",
    name: "PHANTOM",
    blurb: "Aero carbon built for one thing: the highest top speed on the mountain. Brake early.",
    stats: { speed: 5, accel: 3, handling: 3, jump: 3 },
    colors: { frame: "#20232b", accent: "#ff2d55", rim: "#ff2d55", tire: "#141416", jersey: "#20232b", jersey2: "#ff2d55", helmet: "#20232b", visor: "#ff2d55", pants: "#15171c", gloves: "#ff2d55", shoes: "#15171c" },
    unlock: { golds: 8, text: "Win 8 gold medals" },
  },
  {
    id: "ridgeline",
    name: "RIDGELINE",
    blurb: "Grippy tyres and a razor-sharp front end. Carves hairpins, ice and switchbacks without washing out.",
    stats: { speed: 4, accel: 3, handling: 5, jump: 4 },
    colors: { frame: "#2fd27a", accent: "#103a26", rim: "#103a26", tire: "#1a1a1c", jersey: "#2fd27a", jersey2: "#103a26", helmet: "#103a26", visor: "#2fd27a", pants: "#123024", gloves: "#103a26", shoes: "#123024" },
    unlock: { region: 3, text: "Complete Alpine Heights" },
  },
  {
    id: "legend",
    name: "LEGEND",
    blurb: "The championship machine. Fast, light, sharp and stable in the air — there is no weak spot.",
    stats: { speed: 5, accel: 5, handling: 5, jump: 5 },
    colors: { frame: "#ffc21a", accent: "#ffffff", rim: "#ffc21a", tire: "#151517", jersey: "#ffffff", jersey2: "#ffc21a", helmet: "#ffc21a", visor: "#20232b", pants: "#20232b", gloves: "#ffc21a", shoes: "#20232b" },
    unlock: { golds: 18, text: "Win 18 gold medals" },
  },
];

export const BIKE_BY_ID = new Map(BIKES.map((b) => [b.id, b]));

export const RIVALS = [
  { name: "Mila Storm", colors: { frame: "#e8343a", accent: "#ffffff", rim: "#2a1a1a", tire: "#1a1a1c", jersey: "#e8343a", jersey2: "#ffffff", helmet: "#ffffff", visor: "#e8343a", pants: "#2a2a30", gloves: "#e8343a", shoes: "#2a2a30" } },
  { name: "Rex Boulder", colors: { frame: "#2c6cff", accent: "#ffd21f", rim: "#1a2240", tire: "#1a1a1c", jersey: "#2c6cff", jersey2: "#ffd21f", helmet: "#2c6cff", visor: "#ffd21f", pants: "#1a2240", gloves: "#ffd21f", shoes: "#1a2240" } },
  { name: "Juno Vale", colors: { frame: "#18c29c", accent: "#1d2230", rim: "#0d3a30", tire: "#1a1a1c", jersey: "#18c29c", jersey2: "#1d2230", helmet: "#f3f3f3", visor: "#18c29c", pants: "#1d2230", gloves: "#1d2230", shoes: "#1d2230" } },
];

/** Garage stats (1–5) → controller parameters. */
export function paramsFor(st) {
  const s = st.speed;
  const a = st.accel;
  const h = st.handling;
  const j = st.jump;
  return {
    vmax: 21.5 + s * 1.5, // soft top speed, m/s (Trailblazer ≈ 94 km/h)
    aero: 0.0034 - s * 0.00025, // aero drag coefficient (a = k·v²)
    pedal: 2.8 + a * 0.55, // pedal force, m/s²
    pedalMax: 14 + a * 1.0, // above this pedalling only helps a little
    turn: 1.65 + h * 0.16, // max yaw rate, rad/s
    grip: 6.4 + h * 1.1, // sideways grip
    airCtl: 0.4 + j * 0.08, // steering authority in the air
    trickSpeed: 0.86 + j * 0.05, // trick animation speed
    landTol: 0.9 - j * 0.045, // trick progress that still saves a landing (sketchy)
    landKeep: 0.86 + j * 0.025, // speed kept through a heavy landing
    hop: 4.8 + j * 0.15, // bunny-hop impulse, m/s
    boostAccel: 9,
    boostTime: 1.25,
  };
}
