/**
 * Urban Skate Rush — Beachside Boulevard Level Data
 *
 * District 3: Massive coastal city with boardwalk, beach, and skate parks
 */

export const GROUNDS = [
  // Main boardwalk - extended
  { id: "boardwalk", minX: -120, maxX: 120, minZ: -15, maxZ: 15, y: 0.3 },

  // Beach skate park - larger
  { id: "skatePark", minX: -80, maxX: 80, minZ: 25, maxZ: 100, y: 0 },

  // Pro skate bowl area
  { id: "proBowl", minX: -40, maxX: 40, minZ: 100, maxZ: 150, y: 0 },

  // Beach areas (sand - slower)
  { id: "beach1", minX: -120, maxX: -40, minZ: -80, maxZ: -15, y: -0.1 },
  { id: "beach2", minX: -40, maxX: 40, minZ: -100, maxZ: -15, y: -0.1 },
  { id: "beach3", minX: 40, maxX: 120, minZ: -80, maxZ: -15, y: -0.1 },

  // Piers
  { id: "pier1", minX: -10, maxX: 10, minZ: -100, maxZ: -15, y: 0.5 },
  { id: "pier2", minX: -90, maxX: -70, minZ: -60, maxZ: -15, y: 0.5 },
  { id: "pier3", minX: 70, maxX: 90, minZ: -60, maxZ: -15, y: 0.5 },

  // Side streets
  { id: "street1", minX: -150, maxX: -120, minZ: -30, maxZ: 30, y: 0 },
  { id: "street2", minX: 120, maxX: 150, minZ: -30, maxZ: 30, y: 0 },

  // Parking lots
  { id: "parking1", minX: -150, maxX: -120, minZ: 30, maxZ: 80, y: 0 },
  { id: "parking2", minX: 120, maxX: 150, minZ: 30, maxZ: 80, y: 0 },

  // Beach volleyball courts
  { id: "volleyball", minX: 50, maxX: 100, minZ: -70, maxZ: -40, y: -0.1 },
];

export const OBSTACLES = [
  // Beach shops along boardwalk
  { id: "shop1", minX: -110, maxX: -95, minZ: 15, maxZ: 25, minY: 0, maxY: 6 },
  { id: "shop2", minX: -90, maxX: -75, minZ: 15, maxZ: 25, minY: 0, maxY: 5 },
  { id: "shop3", minX: -70, maxX: -55, minZ: 15, maxZ: 25, minY: 0, maxY: 6 },
  { id: "shop4", minX: -50, maxX: -35, minZ: 15, maxZ: 25, minY: 0, maxY: 5 },
  { id: "shop5", minX: 35, maxX: 50, minZ: 15, maxZ: 25, minY: 0, maxY: 5 },
  { id: "shop6", minX: 55, maxX: 70, minZ: 15, maxZ: 25, minY: 0, maxY: 6 },
  { id: "shop7", minX: 75, maxX: 90, minZ: 15, maxZ: 25, minY: 0, maxY: 5 },
  { id: "shop8", minX: 95, maxX: 110, minZ: 15, maxZ: 25, minY: 0, maxY: 6 },

  // Skate park elements - expanded
  { id: "funbox1", minX: -50, maxX: -40, minZ: 40, maxZ: 55, minY: 0, maxY: 1 },
  { id: "funbox2", minX: -35, maxX: -25, minZ: 40, maxZ: 55, minY: 0, maxY: 1.5 },
  { id: "funbox3", minX: 25, maxX: 35, minZ: 40, maxZ: 55, minY: 0, maxY: 1.5 },
  { id: "funbox4", minX: 40, maxX: 50, minZ: 40, maxZ: 55, minY: 0, maxY: 1 },
  { id: "pyramid1", minX: -8, maxX: 8, minZ: 55, maxZ: 75, minY: 0, maxY: 2 },
  { id: "pyramid2", minX: -60, maxX: -50, minZ: 70, maxZ: 85, minY: 0, maxY: 1.5 },
  { id: "pyramid3", minX: 50, maxX: 60, minZ: 70, maxZ: 85, minY: 0, maxY: 1.5 },

  // Pro bowl obstacles
  { id: "bowlIsland", minX: -8, maxX: 8, minZ: 115, maxZ: 135, minY: 0, maxY: 1 },

  // Benches along boardwalk
  { id: "bench1", minX: -100, maxX: -98, minZ: 5, maxZ: 8, minY: 0, maxY: 0.5 },
  { id: "bench2", minX: -80, maxX: -78, minZ: 5, maxZ: 8, minY: 0, maxY: 0.5 },
  { id: "bench3", minX: -60, maxX: -58, minZ: 5, maxZ: 8, minY: 0, maxY: 0.5 },
  { id: "bench4", minX: -40, maxX: -38, minZ: 5, maxZ: 8, minY: 0, maxY: 0.5 },
  { id: "bench5", minX: 38, maxX: 40, minZ: 5, maxZ: 8, minY: 0, maxY: 0.5 },
  { id: "bench6", minX: 58, maxX: 60, minZ: 5, maxZ: 8, minY: 0, maxY: 0.5 },
  { id: "bench7", minX: 78, maxX: 80, minZ: 5, maxZ: 8, minY: 0, maxY: 0.5 },
  { id: "bench8", minX: 98, maxX: 100, minZ: 5, maxZ: 8, minY: 0, maxY: 0.5 },

  // Pier railings
  { id: "pierRail1", minX: -11, maxX: -9, minZ: -100, maxZ: -15, minY: 0.5, maxY: 1.5 },
  { id: "pierRail2", minX: 9, maxX: 11, minZ: -100, maxZ: -15, minY: 0.5, maxY: 1.5 },
  { id: "pierRail3", minX: -91, maxX: -89, minZ: -60, maxZ: -15, minY: 0.5, maxY: 1.5 },
  { id: "pierRail4", minX: -71, maxX: -69, minZ: -60, maxZ: -15, minY: 0.5, maxY: 1.5 },
  { id: "pierRail5", minX: 69, maxX: 71, minZ: -60, maxZ: -15, minY: 0.5, maxY: 1.5 },
  { id: "pierRail6", minX: 89, maxX: 91, minZ: -60, maxZ: -15, minY: 0.5, maxY: 1.5 },

  // Lifeguard towers
  { id: "lifeguard1", minX: -65, maxX: -60, minZ: -50, maxZ: -45, minY: 0, maxY: 5 },
  { id: "lifeguard2", minX: 60, maxX: 65, minZ: -50, maxZ: -45, minY: 0, maxY: 5 },
  { id: "lifeguard3", minX: -5, maxX: 5, minZ: -75, maxZ: -70, minY: 0, maxY: 5 },

  // Volleyball net posts
  { id: "volleyPost1", minX: 74, maxX: 76, minZ: -56, maxZ: -54, minY: 0, maxY: 2.5 },
  { id: "volleyPost2", minX: 74, maxX: 76, minZ: -46, maxZ: -44, minY: 0, maxY: 2.5 },
];

export const RAMPS = [
  // Skate park quarter pipes - expanded
  { id: "quarter1", type: "quarter", centerX: -70, centerZ: 60, radius: 8, height: 3, angle: Math.PI / 2 },
  { id: "quarter2", type: "quarter", centerX: 70, centerZ: 60, radius: 8, height: 3, angle: -Math.PI / 2 },
  { id: "quarter3", type: "quarter", centerX: -60, centerZ: 90, radius: 10, height: 3.5, angle: Math.PI },
  { id: "quarter4", type: "quarter", centerX: 60, centerZ: 90, radius: 10, height: 3.5, angle: Math.PI },
  { id: "quarter5", type: "quarter", centerX: 0, centerZ: 95, radius: 12, height: 4, angle: Math.PI },

  // Pro bowl quarters
  { id: "bowlQuarter1", type: "quarter", centerX: -35, centerZ: 125, radius: 12, height: 4, angle: Math.PI / 2 },
  { id: "bowlQuarter2", type: "quarter", centerX: 35, centerZ: 125, radius: 12, height: 4, angle: -Math.PI / 2 },
  { id: "bowlQuarter3", type: "quarter", centerX: 0, centerZ: 145, radius: 15, height: 5, angle: Math.PI },

  // Mini ramps
  { id: "miniRamp1", startX: -15, startZ: 30, endX: 15, endZ: 30, startY: 0, endY: 1.5, width: 15 },
  { id: "miniRamp2", startX: -15, startZ: 35, endX: 15, endZ: 35, startY: 1.5, endY: 0, width: 15 },

  // Boardwalk to park ramps
  { id: "parkEntry1", startX: -20, startZ: 15, endX: -20, endZ: 25, startY: 0.3, endY: 0, width: 8 },
  { id: "parkEntry2", startX: 20, startZ: 15, endX: 20, endZ: 25, startY: 0.3, endY: 0, width: 8 },
  { id: "parkEntry3", startX: 0, startZ: 15, endX: 0, endZ: 25, startY: 0.3, endY: 0, width: 8 },

  // Pier to beach ramps
  { id: "pierRamp1", startX: 0, startZ: -15, endX: 0, endZ: -20, startY: 0.5, endY: -0.1, width: 6 },
];

export const RAILS = [
  // Boardwalk rails - long grinds
  { id: "boardwalkRail1", startX: -115, startZ: 0, startY: 0.4, endX: -60, endZ: 0, endY: 0.4, length: 55 },
  { id: "boardwalkRail2", startX: -55, startZ: 0, startY: 0.4, endX: 0, endZ: 0, endY: 0.4, length: 55 },
  { id: "boardwalkRail3", startX: 0, startZ: 0, startY: 0.4, endX: 55, endZ: 0, endY: 0.4, length: 55 },
  { id: "boardwalkRail4", startX: 60, startZ: 0, startY: 0.4, endX: 115, endZ: 0, endY: 0.4, length: 55 },

  // Skate park rails
  { id: "parkRail1", startX: -70, startZ: 40, startY: 0.5, endX: -50, endZ: 40, endY: 0.5, length: 20 },
  { id: "parkRail2", startX: 50, startZ: 40, startY: 0.5, endX: 70, endZ: 40, endY: 0.5, length: 20 },
  { id: "parkRail3", startX: -40, startZ: 55, startY: 0.5, endX: -20, endZ: 55, endY: 0.5, length: 20 },
  { id: "parkRail4", startX: 20, startZ: 55, startY: 0.5, endX: 40, endZ: 55, endY: 0.5, length: 20 },
  { id: "parkRail5", startX: -15, startZ: 70, startY: 0.5, endX: 15, endZ: 70, endY: 0.5, length: 30 },

  // Funbox rails
  { id: "funboxRail1", startX: -50, startZ: 40, startY: 1.1, endX: -40, endZ: 40, endY: 1.1, length: 10 },
  { id: "funboxRail2", startX: -35, startZ: 55, startY: 1.6, endX: -25, endZ: 55, endY: 1.6, length: 10 },
  { id: "funboxRail3", startX: 25, startZ: 55, startY: 1.6, endX: 35, endZ: 55, endY: 1.6, length: 10 },
  { id: "funboxRail4", startX: 40, startZ: 40, startY: 1.1, endX: 50, endZ: 40, endY: 1.1, length: 10 },

  // Pro bowl rails
  { id: "bowlRail1", startX: -30, startZ: 105, startY: 0.5, endX: 30, endZ: 105, endY: 0.5, length: 60 },
  { id: "bowlRail2", startX: -8, startZ: 115, startY: 1.1, endX: 8, endZ: 115, endY: 1.1, length: 16 },

  // Pier rails
  { id: "pierRail1", startX: 0, startZ: -90, startY: 0.6, endX: 0, endZ: -20, endY: 0.6, length: 70 },
  { id: "pierRail2", startX: -80, startZ: -55, startY: 0.6, endX: -80, endZ: -20, endY: 0.6, length: 35 },
  { id: "pierRail3", startX: 80, startZ: -55, startY: 0.6, endX: 80, endZ: -20, endY: 0.6, length: 35 },

  // Diagonal rails
  { id: "diagRail1", startX: -100, startZ: -10, startY: 0.4, endX: -80, endZ: 10, endY: 0.4, length: 28 },
  { id: "diagRail2", startX: 80, startZ: -10, startY: 0.4, endX: 100, endZ: 10, endY: 0.4, length: 28 },
];

export const TOKENS = [
  // Boardwalk
  { id: "token1", x: -100, y: 0.8, z: 0 },
  { id: "token2", x: -60, y: 0.8, z: 0 },
  { id: "token3", x: -20, y: 0.8, z: 0 },
  { id: "token4", x: 20, y: 0.8, z: 0 },
  { id: "token5", x: 60, y: 0.8, z: 0 },
  { id: "token6", x: 100, y: 0.8, z: 0 },

  // Skate park
  { id: "token7", x: -60, y: 0.5, z: 50 },
  { id: "token8", x: 0, y: 0.5, z: 45 },
  { id: "token9", x: 60, y: 0.5, z: 50 },
  { id: "token10", x: -30, y: 1.5, z: 47 },
  { id: "token11", x: 30, y: 1.5, z: 47 },
  { id: "token12", x: 0, y: 2.5, z: 65 },

  // Quarter pipe tops
  { id: "token13", x: -70, y: 3.5, z: 60 },
  { id: "token14", x: 70, y: 3.5, z: 60 },
  { id: "token15", x: -60, y: 4, z: 90 },
  { id: "token16", x: 60, y: 4, z: 90 },
  { id: "token17", x: 0, y: 4.5, z: 95 },

  // Pro bowl
  { id: "token18", x: 0, y: 0.5, z: 125 },
  { id: "token19", x: -25, y: 4.5, z: 125 },
  { id: "token20", x: 25, y: 4.5, z: 125 },
  { id: "token21", x: 0, y: 5.5, z: 140 },

  // Piers
  { id: "token22", x: 0, y: 1, z: -50 },
  { id: "token23", x: 0, y: 1, z: -90 },
  { id: "token24", x: -80, y: 1, z: -40 },
  { id: "token25", x: 80, y: 1, z: -40 },

  // Beach
  { id: "token26", x: -80, y: 0.5, z: -50 },
  { id: "token27", x: 80, y: 0.5, z: -55 },
];

export const CHECKPOINTS = {
  mission13: [
    { id: "cp1", x: -80, y: 0.5, z: 0, radius: 5 },
    { id: "cp2", x: 80, y: 0.5, z: 0, radius: 5 },
    { id: "cp3", x: 0, y: 0.5, z: 60, radius: 5 },
    { id: "cp4", x: 0, y: 0.5, z: 125, radius: 5 },
    { id: "cp5", x: 0, y: 0.5, z: -70, radius: 5 },
  ],
  mission14: [
    { id: "cp1", x: 0, y: 0.5, z: 50, radius: 15 },
  ],
  mission15: [
    { id: "cp1", x: 0, y: 0.5, z: 80, radius: 12 },
  ],
  mission16: [
    { id: "cp1", x: 0, y: 0.5, z: 60, radius: 15 },
  ],
  mission17: [
    { id: "cp1", x: -100, y: 0.5, z: 0, radius: 4 },
    { id: "cp2", x: 100, y: 0.5, z: 0, radius: 4 },
    { id: "cp3", x: 0, y: 0.5, z: 50, radius: 4 },
    { id: "cp4", x: -60, y: 0.5, z: 90, radius: 4 },
    { id: "cp5", x: 60, y: 0.5, z: 90, radius: 4 },
    { id: "cp6", x: 0, y: 0.5, z: 125, radius: 4 },
    { id: "cp7", x: 0, y: 0.5, z: -80, radius: 4 },
    { id: "cp8", x: -80, y: 0.5, z: -40, radius: 4 },
    { id: "cp9", x: 80, y: 0.5, z: -40, radius: 4 },
    { id: "cp10", x: -130, y: 0.5, z: 0, radius: 4 },
  ],
  mission18: [
    { id: "cp1", x: 0, y: 0.5, z: 60, radius: 25 },
  ],
};

export const PROPS = [
  // Palm trees along boardwalk
  { type: "palm", x: -115, z: 12, scale: 1.2 },
  { type: "palm", x: -95, z: 12, scale: 1 },
  { type: "palm", x: -75, z: 12, scale: 1.1 },
  { type: "palm", x: -55, z: 12, scale: 1 },
  { type: "palm", x: -35, z: 12, scale: 1.2 },
  { type: "palm", x: 35, z: 12, scale: 1 },
  { type: "palm", x: 55, z: 12, scale: 1.1 },
  { type: "palm", x: 75, z: 12, scale: 1 },
  { type: "palm", x: 95, z: 12, scale: 1.2 },
  { type: "palm", x: 115, z: 12, scale: 0.9 },

  // Beach umbrellas
  { type: "umbrella", x: -90, z: -40, color: 0xff6b35 },
  { type: "umbrella", x: -75, z: -35, color: 0x00bcd4 },
  { type: "umbrella", x: -60, z: -45, color: 0xf7c331 },
  { type: "umbrella", x: -30, z: -60, color: 0xff6b35 },
  { type: "umbrella", x: -15, z: -55, color: 0x00bcd4 },
  { type: "umbrella", x: 15, z: -55, color: 0xf7c331 },
  { type: "umbrella", x: 30, z: -60, color: 0xff6b35 },
  { type: "umbrella", x: 90, z: -40, color: 0x00bcd4 },
  { type: "umbrella", x: 75, z: -35, color: 0xf7c331 },

  // Lifeguard towers
  { type: "lifeguard", x: -62, z: -47 },
  { type: "lifeguard", x: 62, z: -47 },
  { type: "lifeguard", x: 0, z: -72 },

  // Street lights
  { type: "streetlight", x: -110, z: 0 },
  { type: "streetlight", x: -70, z: 0 },
  { type: "streetlight", x: -30, z: 0 },
  { type: "streetlight", x: 30, z: 0 },
  { type: "streetlight", x: 70, z: 0 },
  { type: "streetlight", x: 110, z: 0 },
  { type: "streetlight", x: -60, z: 60 },
  { type: "streetlight", x: 60, z: 60 },
  { type: "streetlight", x: 0, z: 100 },

  // Benches
  { type: "bench", x: -99, z: 6, rotation: Math.PI / 2 },
  { type: "bench", x: -79, z: 6, rotation: Math.PI / 2 },
  { type: "bench", x: -59, z: 6, rotation: Math.PI / 2 },
  { type: "bench", x: -39, z: 6, rotation: Math.PI / 2 },
  { type: "bench", x: 39, z: 6, rotation: Math.PI / 2 },
  { type: "bench", x: 59, z: 6, rotation: Math.PI / 2 },
  { type: "bench", x: 79, z: 6, rotation: Math.PI / 2 },
  { type: "bench", x: 99, z: 6, rotation: Math.PI / 2 },

  // Trash bins
  { type: "trash", x: -105, z: -8 },
  { type: "trash", x: -65, z: -8 },
  { type: "trash", x: -25, z: -8 },
  { type: "trash", x: 25, z: -8 },
  { type: "trash", x: 65, z: -8 },
  { type: "trash", x: 105, z: -8 },

  // === Beachgoers on beach (near umbrellas) ===
  { type: "pedestrian", x: -90, z: -42, rotation: Math.PI, variant: 0 },
  { type: "pedestrian", x: -88, z: -44, rotation: Math.PI * 0.8, variant: 1 },
  { type: "pedestrian", x: -76, z: -37, rotation: Math.PI, variant: 2 },
  { type: "pedestrian", x: -62, z: -47, rotation: Math.PI / 2, variant: 3 },
  { type: "pedestrian", x: -32, z: -62, rotation: Math.PI, variant: 4 },
  { type: "pedestrian", x: -17, z: -57, rotation: Math.PI * 0.9, variant: 5 },
  { type: "pedestrian", x: 13, z: -57, rotation: Math.PI * 1.1, variant: 6 },
  { type: "pedestrian", x: 28, z: -62, rotation: Math.PI, variant: 7 },
  { type: "pedestrian", x: 88, z: -42, rotation: Math.PI, variant: 8 },
  { type: "pedestrian", x: 73, z: -37, rotation: Math.PI * 0.8, variant: 9 },

  // Boardwalk pedestrians
  { type: "pedestrian", x: -95, z: 5, rotation: Math.PI / 2, variant: 10 },
  { type: "pedestrian", x: -75, z: 5, rotation: -Math.PI / 2, variant: 11 },
  { type: "pedestrian", x: -55, z: 5, rotation: Math.PI / 2, variant: 12 },
  { type: "pedestrian", x: -35, z: 5, rotation: -Math.PI / 2, variant: 13 },
  { type: "pedestrian", x: 35, z: 5, rotation: Math.PI / 2, variant: 14 },
  { type: "pedestrian", x: 55, z: 5, rotation: -Math.PI / 2, variant: 15 },
  { type: "pedestrian", x: 75, z: 5, rotation: Math.PI / 2, variant: 16 },
  { type: "pedestrian", x: 95, z: 5, rotation: -Math.PI / 2, variant: 17 },

  // Skate park watchers
  { type: "pedestrian", x: -48, z: 45, rotation: Math.PI / 4, variant: 18 },
  { type: "pedestrian", x: 48, z: 45, rotation: -Math.PI / 4, variant: 19 },
  { type: "pedestrian", x: -48, z: 85, rotation: Math.PI / 4, variant: 20 },
  { type: "pedestrian", x: 48, z: 85, rotation: -Math.PI / 4, variant: 21 },

  // Pier visitors
  { type: "pedestrian", x: -85, z: -80, rotation: Math.PI, variant: 22 },
  { type: "pedestrian", x: -85, z: -95, rotation: Math.PI, variant: 23 },
  { type: "pedestrian", x: 0, z: -80, rotation: Math.PI, variant: 24 },
  { type: "pedestrian", x: 0, z: -95, rotation: Math.PI, variant: 25 },
  { type: "pedestrian", x: 85, z: -80, rotation: Math.PI, variant: 26 },
  { type: "pedestrian", x: 85, z: -95, rotation: Math.PI, variant: 27 },

  // === Walking people on boardwalk ===
  { type: "walkingPedestrian", x: -115, z: 3, endPosition: [115, 0, 3], speed: 0.9, variant: 28 },
  { type: "walkingPedestrian", x: 115, z: -3, endPosition: [-115, 0, -3], speed: 0.85, variant: 29 },
  { type: "walkingPedestrian", x: -115, z: 0, endPosition: [115, 0, 0], speed: 1, variant: 30 },
  { type: "walkingPedestrian", x: 80, z: 3, endPosition: [-80, 0, 3], speed: 0.8, variant: 31 },
  { type: "walkingPedestrian", x: -45, z: 55, endPosition: [45, 0, 55], speed: 0.7, variant: 32 },
  { type: "walkingPedestrian", x: 45, z: 75, endPosition: [-45, 0, 75], speed: 0.75, variant: 33 },

  // === Crowds watching skating ===
  { type: "crowd", x: -50, z: 65, count: 5, radius: 4 },
  { type: "crowd", x: 50, z: 65, count: 5, radius: 4 },
  { type: "crowd", x: 0, z: 95, count: 4, radius: 3 },
  { type: "crowd", x: -45, z: 95, count: 3, radius: 3 },
  { type: "crowd", x: 45, z: 95, count: 3, radius: 3 },

  // === Parked cars near boardwalk ===
  { type: "car", x: -115, z: 15, rotation: Math.PI / 2, color: 0xffffff },
  { type: "car", x: -115, z: 22, rotation: Math.PI / 2, color: 0xff6b35 },
  { type: "car", x: -115, z: 29, rotation: Math.PI / 2, color: 0x00bcd4 },
  { type: "car", x: 115, z: 15, rotation: -Math.PI / 2, color: 0x3366cc },
  { type: "car", x: 115, z: 22, rotation: -Math.PI / 2, color: 0xf7c331 },
  { type: "car", x: 115, z: 29, rotation: -Math.PI / 2, color: 0xcc3333 },
  { type: "car", x: -70, z: 115, rotation: 0, color: 0x339933 },
  { type: "car", x: -60, z: 115, rotation: 0, color: 0x666666 },
  { type: "car", x: 60, z: 115, rotation: 0, color: 0xffffff },
  { type: "car", x: 70, z: 115, rotation: 0, color: 0x00bcd4 },

  // === Vans ===
  { type: "van", x: -115, z: 38, rotation: Math.PI / 2, color: 0xffffff },
  { type: "van", x: 115, z: 38, rotation: -Math.PI / 2, color: 0xf7c331 },

  // === Bicycles ===
  { type: "bicycle", x: -107, z: 8, rotation: Math.PI / 4, color: 0xff4444 },
  { type: "bicycle", x: -87, z: 8, rotation: -Math.PI / 4, color: 0x44ff44 },
  { type: "bicycle", x: -67, z: 8, rotation: Math.PI / 4, color: 0x4444ff },
  { type: "bicycle", x: 67, z: 8, rotation: -Math.PI / 4, color: 0xffff44 },
  { type: "bicycle", x: 87, z: 8, rotation: Math.PI / 4, color: 0xff44ff },
  { type: "bicycle", x: 107, z: 8, rotation: -Math.PI / 4, color: 0x44ffff },

  // === Food carts on boardwalk ===
  { type: "foodCart", x: -45, z: 8, rotation: Math.PI, cartType: "icecream" },
  { type: "foodCart", x: 0, z: 8, rotation: Math.PI, cartType: "hotdog" },
  { type: "foodCart", x: 45, z: 8, rotation: Math.PI, cartType: "icecream" },

  // === More bushes and vegetation ===
  { type: "bush", x: -108, z: 12, scale: 1 },
  { type: "bush", x: -88, z: 12, scale: 0.9 },
  { type: "bush", x: -68, z: 12, scale: 1.1 },
  { type: "bush", x: 68, z: 12, scale: 1 },
  { type: "bush", x: 88, z: 12, scale: 0.9 },
  { type: "bush", x: 108, z: 12, scale: 1.1 },
  { type: "bush", x: -55, z: 40, scale: 1 },
  { type: "bush", x: 55, z: 40, scale: 1 },
  { type: "bush", x: -55, z: 100, scale: 0.9 },
  { type: "bush", x: 55, z: 100, scale: 0.9 },

  // === Flower beds ===
  { type: "flowerBed", x: -90, z: 12, width: 3, depth: 1.5 },
  { type: "flowerBed", x: -50, z: 12, width: 3, depth: 1.5 },
  { type: "flowerBed", x: 50, z: 12, width: 3, depth: 1.5 },
  { type: "flowerBed", x: 90, z: 12, width: 3, depth: 1.5 },

  // === Birds - seagulls near beach ===
  { type: "bird", x: -50, z: -50, y: 0.1 },
  { type: "bird", x: -48, z: -52, y: 0.1 },
  { type: "bird", x: -52, z: -48, y: 0.1 },
  { type: "bird", x: 50, z: -50, y: 0.1 },
  { type: "bird", x: 52, z: -52, y: 0.1 },
  { type: "bird", x: 0, z: -65, y: 0.1 },
  { type: "bird", x: 2, z: -67, y: 0.1 },
  { type: "bird", x: -2, z: -63, y: 0.1 },
  { type: "bird", x: -85, z: -90, y: 0.1 },
  { type: "bird", x: 85, z: -90, y: 0.1 },

  // === Dogs on beach ===
  { type: "dog", x: -80, z: -35, rotation: Math.PI * 0.8, color: 0xd4a574 },
  { type: "dog", x: 80, z: -35, rotation: Math.PI * 1.2, color: 0x8b4513 },
  { type: "dog", x: 0, z: -50, rotation: Math.PI, color: 0xffffff },
];

export const SPAWNS = {
  default: { x: -100, y: 0.4, z: 0, yaw: Math.PI / 2 },
  mission13: { x: -115, y: 0.4, z: 0, yaw: Math.PI / 2 },
  mission14: { x: -80, y: 0.4, z: 0, yaw: Math.PI / 2 },
  mission15: { x: 0, y: 0.1, z: 30, yaw: 0 },
  free: { x: 0, y: 0.4, z: 0, yaw: 0 },
};

export const ENVIRONMENT = {
  skyColor: 0x40c4ff,
  groundColor: 0xd4c4a8,
  sunPosition: [80, 120, 60],
  sunColor: 0xffeb3b,
  sunIntensity: 1.4,
  ambientColor: 0x60a0c0,
  ambientIntensity: 0.6,
  fogColor: 0xe0f7fa,
  fogNear: 100,
  fogFar: 400,
  theme: "beach",
};

export const BEACH_LEVEL = {
  id: "beach",
  name: "Beachside Boulevard",
  district: 3,
  grounds: GROUNDS,
  obstacles: OBSTACLES,
  ramps: RAMPS,
  rails: RAILS,
  tokens: TOKENS,
  checkpoints: CHECKPOINTS,
  props: PROPS,
  spawns: SPAWNS,
  environment: ENVIRONMENT,
};
