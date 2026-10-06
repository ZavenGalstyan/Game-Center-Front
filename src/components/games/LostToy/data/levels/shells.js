/**
 * Lost Toy — shared room shells, so every level of a world sits in the same
 * believable space (same walls, window light, door, little wall details)
 * while each level focuses on a different corner of it.
 */
export function bedroomShell(K, o = {}) {
  const win = o.window || { wall: "back", c: 4, y: 9.6, w: 15, h: 11, sill: 0.9 };
  K.room({ x0: -32, x1: 32, z0: -22, z1: 26, h: 26, windows: [win], doors: o.doors || [{ wall: "front", c: 14, w: 9, h: 21 }], wall: o.wall || "#f3e6d4", ...(o.room || {}) });
  if (o.curtains !== false) K.curtains(win.wall, win.c, win.y, win.w, 12, { color: o.curtainColor || "#f2b8a0" });
  if (o.clock !== false) K.wallClock(o.clockWall || "right", o.clockC ?? -2, 17, 2.4);
  if (o.art !== false) {
    K.wallArt("left", o.artC ?? 4, 13, 7, 9, { art: o.art1 || "sun" });
    K.wallArt("left", (o.artC ?? 4) - 12, 15, 5, 6, { art: o.art2 || "boat" });
  }
  K.ceilingLamp(0, 2);
}

export function kitchenShell(K, o = {}) {
  const win = o.window || { wall: "back", c: -6, y: 12.5, w: 14, h: 9, sill: 0.6 };
  K.room({ x0: -34, x1: 34, z0: -24, z1: 26, h: 27, floorMat: "tile", floor: "tiles", floorColor: "#f4efe6", wall: o.wall || "#e4efe9", wallKind: "paint", trim: "#ffffff", ceiling: "#fbfbf7", windows: [win], doors: o.doors || [{ wall: "front", c: -18, w: 9, h: 21 }] });
  if (o.curtains !== false) K.curtains(win.wall, win.c, win.y, win.w, 9, { color: "#9ed2c6" });
  K.wallClock(o.clockWall || "right", o.clockC ?? 4, 19, 2.6);
  K.ceilingLamp(0, 0, { color: "#f4fbf8" });
}

export function garageShell(K, o = {}) {
  const win = o.window || { wall: "left", c: 0, y: 14, w: 12, h: 6, sill: 0.5 };
  K.room({ x0: -36, x1: 36, z0: -24, z1: 26, h: 30, floorMat: "stone", floor: "concrete", floorColor: "#b9b6b0", wall: o.wall || "#d9dbde", wallKind: "paint", trim: "#9aa0a8", ceiling: "#e1e3e6", windows: [win], doors: o.doors || [] });
  K.ceilingLamp(-10, 0, { color: "#f4f4f4", on: true, intensity: 5 });
  K.ceilingLamp(14, 0, { color: "#f4f4f4", on: true, intensity: 5 });
}

export function nightShell(K, o = {}) {
  const win = o.window || { wall: "back", c: 0, y: 8, w: 12, h: 14, sill: 0.7 };
  K.room({ x0: -34, x1: 34, z0: -22, z1: 26, h: 26, floor: o.floor || "planks", floorColor: o.floorColor || "#b88c62", wall: o.wall || "#c9c2dd", wallKind: "wall", trim: "#e9e4f2", ceiling: "#d8d4e6", windows: [win], doors: o.doors || [{ wall: "front", c: 10, w: 9, h: 21, open: true }], ...(o.room || {}) });
  if (o.curtains !== false) K.curtains(win.wall, win.c, win.y, win.w, 15, { color: "#7f86c9" });
}
