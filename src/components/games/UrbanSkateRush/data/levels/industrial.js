/**
 * Urban Skate Rush — Industrial Zone Level Data
 *
 * District 2: Large industrial area with warehouses, containers, and loading docks
 */

export const GROUNDS = [
  // Main yard - expanded
  { id: "yard", minX: -80, maxX: 80, minZ: -80, maxZ: 80, y: 0 },

  // Loading dock areas
  { id: "dock1", minX: 80, maxX: 120, minZ: -40, maxZ: 40, y: 0.5 },
  { id: "dock2", minX: -120, maxX: -80, minZ: -40, maxZ: 40, y: 0.5 },

  // Warehouse floors
  { id: "warehouse1", minX: -120, maxX: -80, minZ: 50, maxZ: 100, y: 0 },
  { id: "warehouse2", minX: 80, maxX: 120, minZ: 50, maxZ: 100, y: 0 },
  { id: "warehouse3", minX: -120, maxX: -80, minZ: -100, maxZ: -50, y: 0 },
  { id: "warehouse4", minX: 80, maxX: 120, minZ: -100, maxZ: -50, y: 0 },

  // Container storage areas
  { id: "containerYard1", minX: -60, maxX: 60, minZ: 80, maxZ: 140, y: 0 },
  { id: "containerYard2", minX: -60, maxX: 60, minZ: -140, maxZ: -80, y: 0 },

  // Street connections
  { id: "street1", minX: -20, maxX: 20, minZ: 80, maxZ: 160, y: 0 },
  { id: "street2", minX: -20, maxX: 20, minZ: -160, maxZ: -80, y: 0 },
  { id: "street3", minX: 80, maxX: 160, minZ: -20, maxZ: 20, y: 0 },
  { id: "street4", minX: -160, maxX: -80, minZ: -20, maxZ: 20, y: 0 },

  // Elevated crane platform
  { id: "cranePlatform", minX: -30, maxX: 30, minZ: -30, maxZ: 30, y: 5 },
];

export const OBSTACLES = [
  // Warehouse buildings
  { id: "warehouse1", minX: -130, maxX: -82, minZ: 52, maxZ: 98, minY: 0, maxY: 15 },
  { id: "warehouse2", minX: 82, maxX: 130, minZ: 52, maxZ: 98, minY: 0, maxY: 12 },
  { id: "warehouse3", minX: -130, maxX: -82, minZ: -98, maxZ: -52, minY: 0, maxY: 14 },
  { id: "warehouse4", minX: 82, maxX: 130, minZ: -98, maxZ: -52, minY: 0, maxY: 13 },

  // Main factory building
  { id: "factory", minX: -50, maxX: 50, minZ: -50, maxZ: -30, minY: 0, maxY: 20 },

  // Shipping containers - row 1
  { id: "container1", minX: -50, maxX: -44, minZ: 90, maxZ: 102, minY: 0, maxY: 2.6 },
  { id: "container2", minX: -42, maxX: -36, minZ: 90, maxZ: 102, minY: 0, maxY: 2.6 },
  { id: "container3", minX: -34, maxX: -28, minZ: 90, maxZ: 102, minY: 0, maxY: 5.2 },
  { id: "container4", minX: -26, maxX: -20, minZ: 90, maxZ: 102, minY: 0, maxY: 2.6 },
  { id: "container5", minX: 20, maxX: 26, minZ: 90, maxZ: 102, minY: 0, maxY: 2.6 },
  { id: "container6", minX: 28, maxX: 34, minZ: 90, maxZ: 102, minY: 0, maxY: 5.2 },
  { id: "container7", minX: 36, maxX: 42, minZ: 90, maxZ: 102, minY: 0, maxY: 2.6 },
  { id: "container8", minX: 44, maxX: 50, minZ: 90, maxZ: 102, minY: 0, maxY: 2.6 },

  // Shipping containers - row 2
  { id: "container9", minX: -50, maxX: -44, minZ: 110, maxZ: 122, minY: 0, maxY: 2.6 },
  { id: "container10", minX: -42, maxX: -36, minZ: 110, maxZ: 122, minY: 0, maxY: 2.6 },
  { id: "container11", minX: 36, maxX: 42, minZ: 110, maxZ: 122, minY: 0, maxY: 2.6 },
  { id: "container12", minX: 44, maxX: 50, minZ: 110, maxZ: 122, minY: 0, maxY: 2.6 },

  // South containers
  { id: "container13", minX: -40, maxX: -34, minZ: -130, maxZ: -118, minY: 0, maxY: 2.6 },
  { id: "container14", minX: -32, maxX: -26, minZ: -130, maxZ: -118, minY: 0, maxY: 5.2 },
  { id: "container15", minX: 26, maxX: 32, minZ: -130, maxZ: -118, minY: 0, maxY: 2.6 },
  { id: "container16", minX: 34, maxX: 40, minZ: -130, maxZ: -118, minY: 0, maxY: 2.6 },

  // Concrete barriers
  { id: "barrier1", minX: -60, maxX: -58, minZ: -10, maxZ: 10, minY: 0, maxY: 0.8 },
  { id: "barrier2", minX: 58, maxX: 60, minZ: -10, maxZ: 10, minY: 0, maxY: 0.8 },
  { id: "barrier3", minX: -10, maxX: 10, minZ: -60, maxZ: -58, minY: 0, maxY: 0.8 },
  { id: "barrier4", minX: -10, maxX: 10, minZ: 58, maxZ: 60, minY: 0, maxY: 0.8 },

  // Pallets and crates
  { id: "pallet1", minX: 60, maxX: 65, minZ: 60, maxZ: 65, minY: 0, maxY: 0.3 },
  { id: "crate1", minX: 61, maxX: 64, minZ: 61, maxZ: 64, minY: 0.3, maxY: 1.3 },
  { id: "pallet2", minX: -65, maxX: -60, minZ: -65, maxZ: -60, minY: 0, maxY: 0.3 },
  { id: "crate2", minX: -64, maxX: -61, minZ: -64, maxZ: -61, minY: 0.3, maxY: 1.3 },
  { id: "pallet3", minX: 90, maxX: 95, minZ: 20, maxZ: 25, minY: 0.5, maxY: 0.8 },
  { id: "pallet4", minX: -95, maxX: -90, minZ: -25, maxZ: -20, minY: 0.5, maxY: 0.8 },

  // Oil drums
  { id: "drums1", minX: 65, maxX: 68, minZ: 25, maxZ: 28, minY: 0, maxY: 1 },
  { id: "drums2", minX: -68, maxX: -65, minZ: -28, maxZ: -25, minY: 0, maxY: 1 },
  { id: "drums3", minX: 100, maxX: 103, minZ: -35, maxZ: -32, minY: 0.5, maxY: 1.5 },
  { id: "drums4", minX: -103, maxX: -100, minZ: 32, maxZ: 35, minY: 0.5, maxY: 1.5 },

  // Forklifts
  { id: "forklift1", minX: 70, maxX: 74, minZ: 10, maxZ: 14, minY: 0, maxY: 2.5 },
  { id: "forklift2", minX: -74, maxX: -70, minZ: -14, maxZ: -10, minY: 0, maxY: 2.5 },

  // Crane support pillars
  { id: "cranePillar1", minX: -32, maxX: -28, minZ: -32, maxZ: -28, minY: 0, maxY: 5 },
  { id: "cranePillar2", minX: 28, maxX: 32, minZ: -32, maxZ: -28, minY: 0, maxY: 5 },
  { id: "cranePillar3", minX: -32, maxX: -28, minZ: 28, maxZ: 32, minY: 0, maxY: 5 },
  { id: "cranePillar4", minX: 28, maxX: 32, minZ: 28, maxZ: 32, minY: 0, maxY: 5 },
];

export const RAMPS = [
  // Loading dock ramps
  { id: "loadingRamp1", startX: 78, startZ: 0, endX: 82, endZ: 0, startY: 0, endY: 0.5, width: 12 },
  { id: "loadingRamp2", startX: -82, startZ: 0, endX: -78, endZ: 0, startY: 0.5, endY: 0, width: 12 },

  // Metal kicker ramps
  { id: "kicker1", startX: -40, startZ: 40, endX: -35, endZ: 40, startY: 0, endY: 1.5, width: 6 },
  { id: "kicker2", startX: 35, startZ: -40, endX: 40, endZ: -40, startY: 0, endY: 1.5, width: 6 },
  { id: "kicker3", startX: 40, startZ: 40, endX: 45, endZ: 40, startY: 0, endY: 1.5, width: 6 },
  { id: "kicker4", startX: -45, startZ: -40, endX: -40, endZ: -40, startY: 0, endY: 1.5, width: 6 },

  // Crane platform access ramp
  { id: "craneRamp1", startX: 0, startZ: 35, endX: 0, endZ: 30, startY: 0, endY: 5, width: 8 },

  // Container ramps (for riding onto containers)
  { id: "containerRamp1", startX: -30, startZ: 85, endX: -30, endZ: 90, startY: 0, endY: 2.6, width: 4 },
  { id: "containerRamp2", startX: 30, startZ: 85, endX: 30, endZ: 90, startY: 0, endY: 2.6, width: 4 },

  // Quarter pipes
  { id: "quarter1", type: "quarter", centerX: -70, centerZ: 70, radius: 8, height: 3, angle: Math.PI / 4 },
  { id: "quarter2", type: "quarter", centerX: 70, centerZ: -70, radius: 8, height: 3, angle: -Math.PI * 3/4 },
];

export const RAILS = [
  // Main yard rails
  { id: "yardRail1", startX: -70, startZ: 0, startY: 0.6, endX: -30, endZ: 0, endY: 0.6, length: 40 },
  { id: "yardRail2", startX: 30, startZ: 0, startY: 0.6, endX: 70, endZ: 0, endY: 0.6, length: 40 },
  { id: "yardRail3", startX: 0, startZ: -70, startY: 0.6, endX: 0, endZ: -55, endY: 0.6, length: 15 },
  { id: "yardRail4", startX: 0, startZ: 55, startY: 0.6, endX: 0, endZ: 70, endY: 0.6, length: 15 },

  // Container top rails
  { id: "containerRail1", startX: -50, startZ: 96, startY: 2.7, endX: -20, endZ: 96, endY: 5.3, length: 30 },
  { id: "containerRail2", startX: 20, startZ: 96, startY: 2.7, endX: 50, endZ: 96, endY: 5.3, length: 30 },

  // Loading dock rails
  { id: "dockRail1", startX: 82, startZ: -35, startY: 0.6, endX: 115, endZ: -35, endY: 0.6, length: 33 },
  { id: "dockRail2", startX: 82, startZ: 35, startY: 0.6, endX: 115, endZ: 35, endY: 0.6, length: 33 },
  { id: "dockRail3", startX: -115, startZ: -35, startY: 0.6, endX: -82, endZ: -35, endY: 0.6, length: 33 },
  { id: "dockRail4", startX: -115, startZ: 35, startY: 0.6, endX: -82, endZ: 35, endY: 0.6, length: 33 },

  // Barrier rails
  { id: "barrierRail1", startX: -60, startZ: -10, startY: 0.9, endX: -60, endZ: 10, endY: 0.9, length: 20 },
  { id: "barrierRail2", startX: 60, startZ: -10, startY: 0.9, endX: 60, endZ: 10, endY: 0.9, length: 20 },
  { id: "barrierRail3", startX: -10, startZ: -60, startY: 0.9, endX: 10, endZ: -60, endY: 0.9, length: 20 },
  { id: "barrierRail4", startX: -10, startZ: 60, startY: 0.9, endX: 10, endZ: 60, endY: 0.9, length: 20 },

  // Crane platform rails
  { id: "craneRail1", startX: -28, startZ: 0, startY: 5.5, endX: 28, endZ: 0, endY: 5.5, length: 56 },
  { id: "craneRail2", startX: 0, startZ: -28, startY: 5.5, endX: 0, endZ: 28, endY: 5.5, length: 56 },

  // South container rails
  { id: "southContainerRail1", startX: -40, startZ: -124, startY: 2.7, endX: -26, endZ: -124, endY: 5.3, length: 14 },
  { id: "southContainerRail2", startX: 26, startZ: -124, startY: 2.7, endX: 40, endZ: -124, endY: 2.7, length: 14 },

  // Diagonal rails
  { id: "diagRail1", startX: -50, startZ: -50, startY: 0.6, endX: -30, endZ: -30, endY: 0.6, length: 28 },
  { id: "diagRail2", startX: 30, startZ: 30, startY: 0.6, endX: 50, endZ: 50, endY: 0.6, length: 28 },
];

export const TOKENS = [
  // Main yard
  { id: "token1", x: 0, y: 0.5, z: 0 },
  { id: "token2", x: -50, y: 0.5, z: 0 },
  { id: "token3", x: 50, y: 0.5, z: 0 },
  { id: "token4", x: 0, y: 0.5, z: -40 },
  { id: "token5", x: 0, y: 0.5, z: 40 },

  // Container tops
  { id: "token6", x: -30, y: 5.5, z: 96 },
  { id: "token7", x: 30, y: 5.5, z: 96 },
  { id: "token8", x: -30, y: 5.5, z: -124 },

  // Loading docks
  { id: "token9", x: 100, y: 1, z: 0 },
  { id: "token10", x: -100, y: 1, z: 0 },
  { id: "token11", x: 100, y: 1, z: -35 },
  { id: "token12", x: -100, y: 1, z: 35 },

  // Crane platform
  { id: "token13", x: 0, y: 6, z: 0 },
  { id: "token14", x: -20, y: 6, z: 0 },
  { id: "token15", x: 20, y: 6, z: 0 },

  // Streets
  { id: "token16", x: 0, y: 0.5, z: 120 },
  { id: "token17", x: 0, y: 0.5, z: -120 },
  { id: "token18", x: 120, y: 0.5, z: 0 },
  { id: "token19", x: -120, y: 0.5, z: 0 },

  // Container yards
  { id: "token20", x: -40, y: 0.5, z: 100 },
  { id: "token21", x: 40, y: 0.5, z: 100 },
  { id: "token22", x: -40, y: 0.5, z: -100 },
  { id: "token23", x: 40, y: 0.5, z: -100 },
];

export const CHECKPOINTS = {
  mission7: [
    { id: "cp1", x: -50, y: 0.5, z: 0, radius: 5 },
    { id: "cp2", x: 0, y: 0.5, z: 60, radius: 5 },
    { id: "cp3", x: 100, y: 1, z: 0, radius: 5 },
    { id: "cp4", x: 0, y: 0.5, z: -60, radius: 5 },
  ],
  mission8: [
    { id: "cp1", x: -50, y: 0.5, z: 0, radius: 6 },
  ],
  mission9: [
    { id: "cp1", x: -30, y: 5.5, z: 96, radius: 4 },
    { id: "cp2", x: 100, y: 1, z: -30, radius: 4 },
    { id: "cp3", x: 100, y: 1, z: 30, radius: 4 },
    { id: "cp4", x: -60, y: 0.5, z: -30, radius: 4 },
    { id: "cp5", x: 40, y: 0.5, z: -100, radius: 4 },
    { id: "cp6", x: 0, y: 0.5, z: 120, radius: 4 },
  ],
  mission10: [
    { id: "cp1", x: 0, y: 0.5, z: 0, radius: 12 },
  ],
  mission11: [
    { id: "cp1", x: -60, y: 0.5, z: 0, radius: 4 },
    { id: "cp2", x: 0, y: 5.5, z: 0, radius: 4 },
    { id: "cp3", x: 100, y: 1, z: 0, radius: 4 },
    { id: "cp4", x: 40, y: 0.5, z: -100, radius: 4 },
    { id: "cp5", x: -40, y: 0.5, z: -100, radius: 4 },
    { id: "cp6", x: 0, y: 0.5, z: 120, radius: 4 },
    { id: "cp7", x: 0, y: 0.5, z: -120, radius: 4 },
  ],
  mission12: [
    { id: "cp1", x: 0, y: 0.5, z: 0, radius: 20 },
  ],
};

export const PROPS = [
  // Streetlights
  { type: "streetlight", x: -70, z: 40 },
  { type: "streetlight", x: -70, z: -40 },
  { type: "streetlight", x: 70, z: 40 },
  { type: "streetlight", x: 70, z: -40 },
  { type: "streetlight", x: -40, z: 70 },
  { type: "streetlight", x: 40, z: 70 },
  { type: "streetlight", x: -40, z: -70 },
  { type: "streetlight", x: 40, z: -70 },
  { type: "streetlight", x: 0, z: 140 },
  { type: "streetlight", x: 0, z: -140 },
  { type: "streetlight", x: 140, z: 0 },
  { type: "streetlight", x: -140, z: 0 },

  // Containers with colors
  { type: "container", x: -47, z: 96, rotation: 0, color: 0x8b4513 },
  { type: "container", x: -39, z: 96, rotation: 0, color: 0x4a6a8a },
  { type: "container", x: -31, z: 96, rotation: 0, color: 0xcc4444 },
  { type: "container", x: -23, z: 96, rotation: 0, color: 0x2a6a2a },
  { type: "container", x: 23, z: 96, rotation: 0, color: 0x6a4a2a },
  { type: "container", x: 31, z: 96, rotation: 0, color: 0x8844aa },
  { type: "container", x: 39, z: 96, rotation: 0, color: 0x44aa88 },
  { type: "container", x: 47, z: 96, rotation: 0, color: 0xaa8844 },

  // Cones
  { type: "cone", x: 78, z: -10 },
  { type: "cone", x: 78, z: 10 },
  { type: "cone", x: -78, z: -10 },
  { type: "cone", x: -78, z: 10 },
  { type: "cone", x: -10, z: 78 },
  { type: "cone", x: 10, z: 78 },
  { type: "cone", x: -10, z: -78 },
  { type: "cone", x: 10, z: -78 },

  // Barrels
  { type: "barrel", x: 66, z: 26 },
  { type: "barrel", x: -66, z: -26 },
  { type: "barrel", x: 101, z: -34 },
  { type: "barrel", x: -101, z: 34 },

  // === Industrial workers (standing) ===
  { type: "pedestrian", x: -50, z: 85, rotation: Math.PI, variant: 0 },
  { type: "pedestrian", x: -30, z: 85, rotation: Math.PI, variant: 1 },
  { type: "pedestrian", x: 30, z: 85, rotation: Math.PI, variant: 2 },
  { type: "pedestrian", x: 50, z: 85, rotation: Math.PI, variant: 3 },
  { type: "pedestrian", x: -60, z: 40, rotation: Math.PI / 2, variant: 4 },
  { type: "pedestrian", x: -60, z: -40, rotation: Math.PI / 2, variant: 5 },
  { type: "pedestrian", x: 60, z: 40, rotation: -Math.PI / 2, variant: 6 },
  { type: "pedestrian", x: 60, z: -40, rotation: -Math.PI / 2, variant: 7 },
  { type: "pedestrian", x: 95, z: 25, rotation: 0, variant: 8 },
  { type: "pedestrian", x: 95, z: -25, rotation: Math.PI, variant: 9 },
  { type: "pedestrian", x: -95, z: 25, rotation: Math.PI, variant: 10 },
  { type: "pedestrian", x: -95, z: -25, rotation: 0, variant: 11 },
  { type: "pedestrian", x: 0, z: -5, y: 5, rotation: Math.PI / 4, variant: 12 },
  { type: "pedestrian", x: -25, z: -100, rotation: 0, variant: 13 },
  { type: "pedestrian", x: 25, z: -100, rotation: Math.PI, variant: 14 },

  // === Walking workers ===
  { type: "walkingPedestrian", x: -60, z: 0, endPosition: [60, 0, 0], speed: 0.7, variant: 15 },
  { type: "walkingPedestrian", x: 60, z: 20, endPosition: [-60, 0, 20], speed: 0.8, variant: 16 },
  { type: "walkingPedestrian", x: -40, z: 75, endPosition: [40, 0, 75], speed: 0.6, variant: 17 },
  { type: "walkingPedestrian", x: 0, z: -70, endPosition: [0, 0, -120], speed: 0.7, variant: 18 },
  { type: "walkingPedestrian", x: 90, z: -40, endPosition: [90, 0, 40], speed: 0.75, variant: 19 },
  { type: "walkingPedestrian", x: -90, z: 40, endPosition: [-90, 0, -40], speed: 0.8, variant: 20 },

  // === Worker groups ===
  { type: "crowd", x: -35, z: 100, count: 3, radius: 3 },
  { type: "crowd", x: 35, z: 100, count: 3, radius: 3 },
  { type: "crowd", x: 0, z: 5, y: 5, count: 2, radius: 2 },

  // === Industrial vehicles - trucks and vans ===
  { type: "van", x: -75, z: 55, rotation: 0, color: 0xffffff },
  { type: "van", x: 75, z: 55, rotation: Math.PI, color: 0x666666 },
  { type: "van", x: -75, z: -55, rotation: 0, color: 0xffcc00 },
  { type: "van", x: 75, z: -55, rotation: Math.PI, color: 0xffffff },
  { type: "van", x: 0, z: 130, rotation: 0, color: 0x336699 },
  { type: "van", x: 0, z: -130, rotation: Math.PI, color: 0xcc6633 },

  // Parked cars for workers
  { type: "car", x: 130, z: -30, rotation: Math.PI / 2, color: 0x333333 },
  { type: "car", x: 130, z: -20, rotation: Math.PI / 2, color: 0xcc3333 },
  { type: "car", x: 130, z: -10, rotation: Math.PI / 2, color: 0x3366cc },
  { type: "car", x: 130, z: 10, rotation: Math.PI / 2, color: 0x666666 },
  { type: "car", x: 130, z: 20, rotation: Math.PI / 2, color: 0xffffff },
  { type: "car", x: 130, z: 30, rotation: Math.PI / 2, color: 0x339933 },
  { type: "car", x: -130, z: -30, rotation: -Math.PI / 2, color: 0xcccc33 },
  { type: "car", x: -130, z: -20, rotation: -Math.PI / 2, color: 0x9933cc },
  { type: "car", x: -130, z: 20, rotation: -Math.PI / 2, color: 0x336699 },
  { type: "car", x: -130, z: 30, rotation: -Math.PI / 2, color: 0xcc6633 },

  // === Bicycles ===
  { type: "bicycle", x: -55, z: 65, rotation: Math.PI / 2, color: 0xff4444 },
  { type: "bicycle", x: 55, z: 65, rotation: -Math.PI / 2, color: 0x44ff44 },
  { type: "bicycle", x: -55, z: -65, rotation: Math.PI / 2, color: 0x4444ff },
  { type: "bicycle", x: 55, z: -65, rotation: -Math.PI / 2, color: 0xffff44 },

  // === Food cart for workers ===
  { type: "foodCart", x: -65, z: 0, rotation: Math.PI / 2, cartType: "hotdog" },
  { type: "foodCart", x: 65, z: 0, rotation: -Math.PI / 2, cartType: "hotdog" },

  // === Birds ===
  { type: "bird", x: 50, z: 90, y: 0.1 },
  { type: "bird", x: 52, z: 92, y: 0.1 },
  { type: "bird", x: -50, z: 90, y: 0.1 },
  { type: "bird", x: -52, z: 88, y: 0.1 },
  { type: "bird", x: 0, z: -60, y: 0.1 },
  { type: "bird", x: 2, z: -58, y: 0.1 },

  // === Dogs ===
  { type: "dog", x: -75, z: 45, rotation: Math.PI / 3, color: 0x8b4513 },
  { type: "dog", x: 75, z: -45, rotation: -Math.PI / 3, color: 0x1a1a1a },
];

export const SPAWNS = {
  default: { x: 0, y: 0.1, z: -60, yaw: 0 },
  mission7: { x: 0, y: 0.1, z: -70, yaw: 0 },
  mission8: { x: -70, y: 0.1, z: 0, yaw: Math.PI / 2 },
  free: { x: 0, y: 0.1, z: 0, yaw: 0 },
};

export const ENVIRONMENT = {
  skyColor: 0x9ca3af,
  groundColor: 0x3a3a3a,
  sunPosition: [60, 80, 30],
  sunColor: 0xffe4c4,
  sunIntensity: 0.9,
  ambientColor: 0x404040,
  ambientIntensity: 0.4,
  fogColor: 0x8a8a8a,
  fogNear: 80,
  fogFar: 350,
  theme: "industrial",
};

export const INDUSTRIAL_LEVEL = {
  id: "industrial",
  name: "Industrial Zone",
  district: 2,
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
