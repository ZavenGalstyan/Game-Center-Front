/**
 * Downhill Riders — all 30 tracks (5 regions × 6), authored per region.
 * Each def: id, name, seed, heading, width (half-width, m), grade
 * (descent per metre), difficulty (0..1, rivals), blurb, segs, optional
 * shortcut. Region look / surface come from data/regions.js.
 */
import { FOREST } from "./tracksForest.js";
import { CANYON } from "./tracksCanyon.js";
import { ALPINE } from "./tracksAlpine.js";
import { SNOW } from "./tracksSnow.js";
import { SUMMIT } from "./tracksSummit.js";
import { regionOfTrack } from "./regions.js";

const ALL = [...FOREST, ...CANYON, ...ALPINE, ...SNOW, ...SUMMIT];

export const TRACKS = ALL.map((t) => {
  const region = regionOfTrack(t.id);
  return { ...t, region: region.id, surface: t.surface || region.surface };
}).sort((a, b) => a.id - b.id);

export const TOTAL_TRACKS = 30;
const BY_ID = new Map(TRACKS.map((t) => [t.id, t]));
export const getTrack = (id) => BY_ID.get(id) || null;
