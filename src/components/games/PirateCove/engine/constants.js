/** Pirate Cove — shared engine constants. */

export const DT = 1 / 60;
export const MAX_FRAME = 0.1;

export const MODE = {
  SAILING: "SAILING",
  DOCKING: "DOCKING",
  ISLAND: "ISLAND",
  BOARDING: "BOARDING",
  ADVENTURE_COMPLETE: "ADVENTURE_COMPLETE",
  SHIP_DESTROYED: "SHIP_DESTROYED",
  DEFEATED: "DEFEATED",
};

export const DOCK_RANGE = 34; // metres from the berth
export const DOCK_MAX_SPEED = 6.5; // m/s
export const BOARD_RANGE = 3.4;
export const INTERACT_RANGE = 2.4;
export const FLOAT_PICKUP = 4.5; // beyond half the hull length
export const FLOAT_MAGNET = 16;
export const MARKER_RADIUS = 22;
export const SINK_REMOVE = 16; // seconds after sinking

/** Converts m/s to knots for the HUD. */
export const KNOTS = 1.94384;
