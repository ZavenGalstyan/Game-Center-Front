/**
 * Delivery Rush — zone palette to render theme.
 *
 * Zones author colour as readable hex in data/zones.js. This turns that into
 * the linear RGB triples the geometry accumulators write per vertex, and fills
 * in the derived colours every district shares (metal, rubber, tail lights,
 * traffic-light lenses, snow, ...) shifted to suit the district's light.
 *
 * The `night` and `snow` flags are what let one building kit read as five
 * different cities: they switch window emission, snow caps and lamp pools on.
 */

import { rgb, shade, mix } from "./palette.js";

export function makeTheme(zone, weather) {
  const p = zone.palette;
  const night = zone.timeOfDay === "night";
  const snow = weather?.snow > 0;
  const wet = (weather?.wetness ?? 0) > 0.25;

  const asphalt = rgb(p.asphalt);
  const trim = rgb(p.trim);
  const metalBase = mix(rgb("#8a949c"), rgb(p.trim), 0.35);

  const theme = {
    night,
    snow,
    wet,
    zoneId: zone.id,

    // ground & road
    ground: rgb(p.ground),
    groundAlt: rgb(p.groundAlt),
    grass: mix(rgb(p.ground), rgb("#4f8a3f"), snow ? 0.0 : 0.45),
    sand: rgb(p.groundAlt),
    path: mix(rgb(p.sidewalk), rgb("#b9a684"), 0.5),
    asphalt: wet ? shade(asphalt, 0.78) : asphalt,
    asphaltAlt: wet ? shade(rgb(p.asphaltAlt), 0.74) : rgb(p.asphaltAlt),
    marking: rgb(p.marking),
    curb: rgb(p.curb),
    sidewalk: rgb(p.sidewalk),
    sidewalkAlt: rgb(p.sidewalkAlt),
    water: rgb(p.water),

    // buildings
    buildings: p.buildings.map(rgb),
    roofs: p.roofs.map(rgb),
    trim,
    window: rgb(p.window),
    windowEmissive: rgb(p.windowEmissive),
    windowGlow: p.windowGlow,
    signs: p.signs.map(rgb),
    signTint: night ? [1.35, 1.3, 1.25] : [1, 1, 1],
    accent: rgb(p.accent),

    // planting
    trees: p.trees.map(rgb),
    trunk: rgb(p.trunk),
    soil: rgb("#4a3a2c"),
    snowCol: rgb("#f2f7fc"),

    // shared material colours
    metal: metalBase,
    wood: rgb("#9a7346"),
    rubber: rgb("#1c1d20"),
    hydrant: rgb("#c9403a"),
    mailbox: rgb("#2f6f9e"),
    warning: rgb("#ff5a3c"),
    lampLight: night ? rgb("#ffe3a8") : rgb("#e8e4d8"),
    lampPool: night ? shade(rgb("#ffd08a"), 0.22) : [0, 0, 0],
    busGlow: night ? rgb("#9fd8ff") : rgb("#5a6b78"),
    headlight: night ? rgb("#fff4d8") : rgb("#d8d4c8"),
    taillight: rgb("#d6392c"),
    tlRed: rgb("#ff4530"),
    tlAmber: rgb("#ffb02e"),
    tlGreen: rgb("#3ce07a"),

    // vehicle fleets
    carPaint: [
      "#d8d9dd", "#2f3b4a", "#b23a2f", "#2f6f9e", "#c9a227",
      "#3f7a4f", "#8a8f96", "#e8e2d4", "#5a4a6e", "#c96a2f",
    ].map(rgb),
    carGlass: night ? rgb("#0f1622") : rgb("#2b3644"),
    containers: ["#b7452f", "#2f6f8f", "#3f7a4f", "#c9a227", "#8a4f7a", "#5a6570"].map(rgb),
  };

  if (snow) {
    // everything gets a cold cast and the roads keep a packed-snow tint
    theme.asphalt = mix(theme.asphalt, rgb("#c8d4de"), 0.28);
    theme.asphaltAlt = mix(theme.asphaltAlt, rgb("#c8d4de"), 0.22);
    theme.path = mix(theme.path, theme.snowCol, 0.6);
  }
  return theme;
}
