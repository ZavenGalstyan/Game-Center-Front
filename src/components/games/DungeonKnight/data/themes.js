/**
 * Dungeon Knight — the five dungeon atmospheres. Pure data: palette, fog,
 * light colours and which decorations dress the rooms. The room builder and
 * the menus read these; gameplay never does.
 */
export const THEMES = {
  cellar: {
    name: "Forgotten Cellar",
    floor: "#9a8f82", wall: "#8f8475", trim: "#6a5f53", ceiling: "#2a231e", wood: "#8a6340", metal: "#77726b",
    bg: "#0b0908", fog: "#110d0b", fogNear: 12, fogFar: 40,
    hemiSky: "#5a6a8f", hemiGround: "#3a2a1e", hemi: 0.55,
    key: "#ffd9a8", keyI: 0.9, torch: "#ffb35c", torchI: 7, flame: "#ffb35c",
    accent: "#3fa889", decor: { moss: 0.5, cobweb: true, chains: true, rubble: 1, bones: 0.4, beams: true, barrelsExtra: true },
  },
  crypt: {
    name: "Mosswood Crypt",
    floor: "#7f8a74", wall: "#727c68", trim: "#56604c", ceiling: "#1d241a", wood: "#5a4a32", metal: "#6c7468",
    bg: "#070b07", fog: "#0a110a", fogNear: 10, fogFar: 36,
    hemiSky: "#6a8f6a", hemiGround: "#2a3a22", hemi: 0.55,
    key: "#d8ffc8", keyI: 0.75, torch: "#c8ff8a", torchI: 6, flame: "#d8ff7a",
    accent: "#9fe060", decor: { moss: 1.4, roots: true, puddles: true, rubble: 1, bones: 0.6, tombs: true },
  },
  frozen: {
    name: "Frozen Catacombs",
    floor: "#b4c8d6", wall: "#9fb6c8", trim: "#7f97aa", ceiling: "#1a2430", wood: "#6a5a4a", metal: "#9aaab6",
    bg: "#08101a", fog: "#0d1724", fogNear: 12, fogFar: 40,
    hemiSky: "#9fc8ff", hemiGround: "#2a3a4a", hemi: 0.7,
    key: "#cfe8ff", keyI: 0.95, torch: "#8fd8ff", torchI: 6.5, flame: "#9fe8ff",
    accent: "#9fe8ff", decor: { frost: 1.2, crystals: true, chains: true, rubble: 0.6, icicles: true },
  },
  ember: {
    name: "Ember Prison",
    floor: "#5a4a43", wall: "#4d3f39", trim: "#3a2f2a", ceiling: "#140b08", wood: "#4a3020", metal: "#5a524c",
    bg: "#0d0604", fog: "#170a05", fogNear: 10, fogFar: 34,
    hemiSky: "#8f5a3a", hemiGround: "#2a120a", hemi: 0.5,
    key: "#ffb27a", keyI: 0.7, torch: "#ff8a3a", torchI: 7.5, flame: "#ff9a4a",
    accent: "#ff7a2a", decor: { lava: true, ash: true, chains: true, rubble: 1.2, bars: true },
  },
  shadow: {
    name: "Shadow Keep",
    floor: "#57536e", wall: "#4b4766", trim: "#38344e", ceiling: "#100e1a", wood: "#3a2e3a", metal: "#6a6688",
    bg: "#07060f", fog: "#0c0a18", fogNear: 11, fogFar: 38,
    hemiSky: "#7a7aff", hemiGround: "#1a1630", hemi: 0.55,
    key: "#b8c4ff", keyI: 1.0, torch: "#b49bff", torchI: 6, flame: "#c8b0ff",
    accent: "#c39bff", decor: { banners: true, moonbeams: true, rubble: 0.5, fogFloor: true },
  },
};
export const themeOf = (key) => THEMES[key] || THEMES.cellar;
