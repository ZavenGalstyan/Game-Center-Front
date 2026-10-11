/**
 * Urban Skate Rush — Downtown Streets Level Data
 *
 * District 1: Large urban environment with multiple plazas and streets
 */

// Ground planes (skateable surfaces) - EXPANDED 3x
export const GROUNDS = [
  // Main central plaza
  { id: "plaza", minX: -60, maxX: 60, minZ: -60, maxZ: 60, y: 0 },

  // North district
  { id: "northPlaza", minX: -40, maxX: 40, minZ: 60, maxZ: 120, y: 0 },
  { id: "northStreet1", minX: -15, maxX: 15, minZ: 120, maxZ: 160, y: 0 },

  // South district
  { id: "southPlaza", minX: -40, maxX: 40, minZ: -120, maxZ: -60, y: 0 },
  { id: "southStreet1", minX: -15, maxX: 15, minZ: -160, maxZ: -120, y: 0 },

  // East district
  { id: "eastPlaza", minX: 60, maxX: 120, minZ: -40, maxZ: 40, y: 0 },
  { id: "eastStreet1", minX: 120, maxX: 160, minZ: -15, maxZ: 15, y: 0 },

  // West district
  { id: "westPlaza", minX: -120, maxX: -60, minZ: -40, maxZ: 40, y: 0 },
  { id: "westStreet1", minX: -160, maxX: -120, minZ: -15, maxZ: 15, y: 0 },

  // Connecting streets
  { id: "street_n", minX: -15, maxX: 15, minZ: 60, maxZ: 120, y: 0 },
  { id: "street_s", minX: -15, maxX: 15, minZ: -120, maxZ: -60, y: 0 },
  { id: "street_e", minX: 60, maxX: 120, minZ: -15, maxZ: 15, y: 0 },
  { id: "street_w", minX: -120, maxX: -60, minZ: -15, maxZ: 15, y: 0 },

  // Sidewalks
  { id: "sidewalk1", minX: -60, maxX: 60, minZ: 60, maxZ: 65, y: 0.15 },
  { id: "sidewalk2", minX: -60, maxX: 60, minZ: -65, maxZ: -60, y: 0.15 },
  { id: "sidewalk3", minX: 60, maxX: 65, minZ: -60, maxZ: 60, y: 0.15 },
  { id: "sidewalk4", minX: -65, maxX: -60, minZ: -60, maxZ: 60, y: 0.15 },

  // Skate park area (northeast)
  { id: "skatePark", minX: 70, maxX: 110, minZ: 70, maxZ: 110, y: 0 },

  // Elevated platform (northwest)
  { id: "platform1", minX: -110, maxX: -70, minZ: 70, maxZ: 100, y: 2 },

  // Underground passage (southeast)
  { id: "tunnel", minX: 70, maxX: 110, minZ: -110, maxZ: -70, y: -1 },
];

// Obstacles (collision boxes)
export const OBSTACLES = [
  // Central plaza buildings
  { id: "building1", minX: -70, maxX: -62, minZ: -70, maxZ: -62, minY: 0, maxY: 25 },
  { id: "building2", minX: 62, maxX: 70, minZ: -70, maxZ: -62, minY: 0, maxY: 20 },
  { id: "building3", minX: 62, maxX: 70, minZ: 62, maxZ: 70, minY: 0, maxY: 30 },
  { id: "building4", minX: -70, maxX: -62, minZ: 62, maxZ: 70, minY: 0, maxY: 18 },

  // North district buildings
  { id: "building5", minX: -50, maxX: -42, minZ: 110, maxZ: 125, minY: 0, maxY: 22 },
  { id: "building6", minX: 42, maxX: 50, minZ: 110, maxZ: 125, minY: 0, maxY: 28 },

  // South district buildings
  { id: "building7", minX: -50, maxX: -42, minZ: -125, maxZ: -110, minY: 0, maxY: 20 },
  { id: "building8", minX: 42, maxX: 50, minZ: -125, maxZ: -110, minY: 0, maxY: 24 },

  // East district buildings
  { id: "building9", minX: 110, maxX: 125, minZ: -50, maxZ: -42, minY: 0, maxY: 26 },
  { id: "building10", minX: 110, maxX: 125, minZ: 42, maxZ: 50, minY: 0, maxY: 22 },

  // West district buildings
  { id: "building11", minX: -125, maxX: -110, minZ: -50, maxZ: -42, minY: 0, maxY: 18 },
  { id: "building12", minX: -125, maxX: -110, minZ: 42, maxZ: 50, minY: 0, maxY: 24 },

  // Central plaza features
  { id: "fountain", minX: -8, maxX: 8, minZ: -8, maxZ: 8, minY: 0, maxY: 1.5 },

  // Benches throughout
  { id: "bench1", minX: -20, maxX: -18, minZ: 25, maxZ: 27, minY: 0, maxY: 0.5 },
  { id: "bench2", minX: 18, maxX: 20, minZ: 25, maxZ: 27, minY: 0, maxY: 0.5 },
  { id: "bench3", minX: -20, maxX: -18, minZ: -27, maxZ: -25, minY: 0, maxY: 0.5 },
  { id: "bench4", minX: 18, maxX: 20, minZ: -27, maxZ: -25, minY: 0, maxY: 0.5 },
  { id: "bench5", minX: 25, maxX: 27, minZ: -20, maxZ: -18, minY: 0, maxY: 0.5 },
  { id: "bench6", minX: 25, maxX: 27, minZ: 18, maxZ: 20, minY: 0, maxY: 0.5 },
  { id: "bench7", minX: -27, maxX: -25, minZ: -20, maxZ: -18, minY: 0, maxY: 0.5 },
  { id: "bench8", minX: -27, maxX: -25, minZ: 18, maxZ: 20, minY: 0, maxY: 0.5 },

  // Planters
  { id: "planter1", minX: -35, maxX: -30, minZ: -35, maxZ: -30, minY: 0, maxY: 0.8 },
  { id: "planter2", minX: 30, maxX: 35, minZ: -35, maxZ: -30, minY: 0, maxY: 0.8 },
  { id: "planter3", minX: -35, maxX: -30, minZ: 30, maxZ: 35, minY: 0, maxY: 0.8 },
  { id: "planter4", minX: 30, maxX: 35, minZ: 30, maxZ: 35, minY: 0, maxY: 0.8 },

  // Ledges for grinding
  { id: "ledge1", minX: -45, maxX: -25, minZ: 15, maxZ: 16, minY: 0, maxY: 0.5 },
  { id: "ledge2", minX: 25, maxX: 45, minZ: -16, maxZ: -15, minY: 0, maxY: 0.5 },
  { id: "ledge3", minX: 15, maxX: 16, minZ: -45, maxZ: -25, minY: 0, maxY: 0.5 },
  { id: "ledge4", minX: -16, maxX: -15, minZ: 25, maxZ: 45, minY: 0, maxY: 0.5 },

  // Skate park elements
  { id: "funbox1", minX: 80, maxX: 90, minZ: 80, maxZ: 90, minY: 0, maxY: 1 },
  { id: "funbox2", minX: 95, maxX: 105, minZ: 85, maxZ: 95, minY: 0, maxY: 1.5 },
  { id: "pyramid", minX: 85, maxX: 95, minZ: 95, maxZ: 105, minY: 0, maxY: 2 },

  // Platform supports
  { id: "support1", minX: -108, maxX: -105, minZ: 72, maxZ: 75, minY: 0, maxY: 2 },
  { id: "support2", minX: -75, maxX: -72, minZ: 72, maxZ: 75, minY: 0, maxY: 2 },
  { id: "support3", minX: -108, maxX: -105, minZ: 97, maxZ: 100, minY: 0, maxY: 2 },
  { id: "support4", minX: -75, maxX: -72, minZ: 97, maxZ: 100, minY: 0, maxY: 2 },

  // Tunnel walls
  { id: "tunnelWall1", minX: 68, maxX: 70, minZ: -110, maxZ: -70, minY: -1, maxY: 3 },
  { id: "tunnelWall2", minX: 110, maxX: 112, minZ: -110, maxZ: -70, minY: -1, maxY: 3 },
];

// Ramps
export const RAMPS = [
  // Central plaza ramps
  { id: "ramp1", startX: -50, startZ: 0, endX: -45, endZ: 0, startY: 0, endY: 1, width: 6 },
  { id: "ramp2", startX: 45, startZ: 0, endX: 50, endZ: 0, startY: 1, endY: 0, width: 6 },
  { id: "ramp3", startX: 0, startZ: -50, endX: 0, endZ: -45, startY: 0, endY: 1, width: 6 },
  { id: "ramp4", startX: 0, startZ: 45, endX: 0, endZ: 50, startY: 1, endY: 0, width: 6 },

  // Quarter pipes
  { id: "quarter1", type: "quarter", centerX: -45, centerZ: -45, radius: 6, height: 2.5, angle: Math.PI / 4 },
  { id: "quarter2", type: "quarter", centerX: 45, centerZ: 45, radius: 6, height: 2.5, angle: -Math.PI * 3 / 4 },
  { id: "quarter3", type: "quarter", centerX: 45, centerZ: -45, radius: 6, height: 2.5, angle: -Math.PI / 4 },
  { id: "quarter4", type: "quarter", centerX: -45, centerZ: 45, radius: 6, height: 2.5, angle: Math.PI * 3 / 4 },

  // Skate park ramps
  { id: "parkQuarter1", type: "quarter", centerX: 75, centerZ: 90, radius: 8, height: 3, angle: Math.PI / 2 },
  { id: "parkQuarter2", type: "quarter", centerX: 105, centerZ: 90, radius: 8, height: 3, angle: -Math.PI / 2 },
  { id: "parkRamp1", startX: 85, startZ: 75, endX: 95, endZ: 75, startY: 0, endY: 1.5, width: 8 },

  // Platform access ramp
  { id: "platformRamp", startX: -90, startZ: 65, endX: -90, endZ: 70, startY: 0, endY: 2, width: 8 },

  // Tunnel entry ramps
  { id: "tunnelRamp1", startX: 90, startZ: -65, endX: 90, endZ: -70, startY: 0, endY: -1, width: 10 },
  { id: "tunnelRamp2", startX: 90, startZ: -110, endX: 90, endZ: -115, startY: -1, endY: 0, width: 10 },
];

// Rails
export const RAILS = [
  // Central plaza rails
  { id: "rail1", startX: -55, startZ: 0, startY: 0.5, endX: -25, endZ: 0, endY: 0.5, length: 30 },
  { id: "rail2", startX: 25, startZ: 0, startY: 0.5, endX: 55, endZ: 0, endY: 0.5, length: 30 },
  { id: "rail3", startX: 0, startZ: -55, startY: 0.5, endX: 0, endZ: -25, endY: 0.5, length: 30 },
  { id: "rail4", startX: 0, startZ: 25, startY: 0.5, endX: 0, endZ: 55, endY: 0.5, length: 30 },

  // Ledge rails
  { id: "ledgeRail1", startX: -45, startZ: 15.5, startY: 0.6, endX: -25, endZ: 15.5, endY: 0.6, length: 20 },
  { id: "ledgeRail2", startX: 25, startZ: -15.5, startY: 0.6, endX: 45, endZ: -15.5, endY: 0.6, length: 20 },

  // Diagonal rails
  { id: "diagRail1", startX: -40, startZ: -40, startY: 0.5, endX: -25, endZ: -25, endY: 0.5, length: 21 },
  { id: "diagRail2", startX: 25, startZ: 25, startY: 0.5, endX: 40, endZ: 40, endY: 0.5, length: 21 },

  // North plaza rails
  { id: "northRail1", startX: -30, startZ: 80, startY: 0.5, endX: 30, endZ: 80, endY: 0.5, length: 60 },
  { id: "northRail2", startX: 0, startZ: 90, startY: 0.5, endX: 0, endZ: 110, endY: 0.5, length: 20 },

  // South plaza rails
  { id: "southRail1", startX: -30, startZ: -80, startY: 0.5, endX: 30, endZ: -80, endY: 0.5, length: 60 },
  { id: "southRail2", startX: 0, startZ: -110, startY: 0.5, endX: 0, endZ: -90, endY: 0.5, length: 20 },

  // East plaza rails
  { id: "eastRail1", startX: 80, startZ: -30, startY: 0.5, endX: 80, endZ: 30, endY: 0.5, length: 60 },
  { id: "eastRail2", startX: 90, startZ: 0, startY: 0.5, endX: 110, endZ: 0, endY: 0.5, length: 20 },

  // West plaza rails
  { id: "westRail1", startX: -80, startZ: -30, startY: 0.5, endX: -80, endZ: 30, endY: 0.5, length: 60 },
  { id: "westRail2", startX: -110, startZ: 0, startY: 0.5, endX: -90, endZ: 0, endY: 0.5, length: 20 },

  // Skate park rails
  { id: "parkRail1", startX: 75, startZ: 85, startY: 0.5, endX: 75, endZ: 105, endY: 0.5, length: 20 },
  { id: "parkRail2", startX: 105, startZ: 85, startY: 0.5, endX: 105, endZ: 105, endY: 0.5, length: 20 },
  { id: "parkRail3", startX: 80, startZ: 80, startY: 1.1, endX: 90, endZ: 80, endY: 1.1, length: 10 },

  // Platform rails
  { id: "platformRail1", startX: -108, startZ: 85, startY: 2.5, endX: -72, endZ: 85, endY: 2.5, length: 36 },

  // Tunnel rails
  { id: "tunnelRail1", startX: 80, startZ: -105, startY: -0.5, endX: 80, endZ: -75, endY: -0.5, length: 30 },
  { id: "tunnelRail2", startX: 100, startZ: -105, startY: -0.5, endX: 100, endZ: -75, endY: -0.5, length: 30 },
];

// Tokens - spread across the larger map
export const TOKENS = [
  // Central plaza
  { id: "token1", x: 0, y: 2, z: 0 },
  { id: "token2", x: -40, y: 0.5, z: 0 },
  { id: "token3", x: 40, y: 0.5, z: 0 },
  { id: "token4", x: 0, y: 0.5, z: -40 },
  { id: "token5", x: 0, y: 0.5, z: 40 },
  { id: "token6", x: -35, y: 0.5, z: -35 },
  { id: "token7", x: 35, y: 0.5, z: 35 },
  { id: "token8", x: -35, y: 0.5, z: 35 },
  { id: "token9", x: 35, y: 0.5, z: -35 },

  // North plaza
  { id: "token10", x: 0, y: 0.5, z: 90 },
  { id: "token11", x: -25, y: 0.5, z: 100 },
  { id: "token12", x: 25, y: 0.5, z: 100 },
  { id: "token13", x: 0, y: 0.5, z: 140 },

  // South plaza
  { id: "token14", x: 0, y: 0.5, z: -90 },
  { id: "token15", x: -25, y: 0.5, z: -100 },
  { id: "token16", x: 25, y: 0.5, z: -100 },
  { id: "token17", x: 0, y: 0.5, z: -140 },

  // East plaza
  { id: "token18", x: 90, y: 0.5, z: 0 },
  { id: "token19", x: 100, y: 0.5, z: -25 },
  { id: "token20", x: 100, y: 0.5, z: 25 },
  { id: "token21", x: 140, y: 0.5, z: 0 },

  // West plaza
  { id: "token22", x: -90, y: 0.5, z: 0 },
  { id: "token23", x: -100, y: 0.5, z: -25 },
  { id: "token24", x: -100, y: 0.5, z: 25 },
  { id: "token25", x: -140, y: 0.5, z: 0 },

  // Skate park
  { id: "token26", x: 90, y: 3.5, z: 90 },
  { id: "token27", x: 80, y: 1.5, z: 85 },
  { id: "token28", x: 100, y: 2, z: 100 },

  // Platform
  { id: "token29", x: -90, y: 3, z: 85 },
  { id: "token30", x: -80, y: 3, z: 95 },

  // Tunnel
  { id: "token31", x: 90, y: 0, z: -90 },
  { id: "token32", x: 85, y: 0, z: -100 },
];

// Checkpoints for missions
export const CHECKPOINTS = {
  mission1: [
    { id: "cp1", x: 30, y: 0.5, z: 0, radius: 4 },
    { id: "cp2", x: 0, y: 0.5, z: 50, radius: 4 },
    { id: "cp3", x: -30, y: 0.5, z: 0, radius: 4 },
  ],
  mission2: [
    { id: "cp1", x: 0, y: 0.5, z: 0, radius: 8 },
  ],
  mission3: [
    { id: "cp1", x: -30, y: 0.5, z: 0, radius: 5 },
  ],
  mission4: [
    { id: "cp1", x: 0, y: 0.5, z: 0, radius: 10 },
  ],
  mission5: [
    { id: "cp1", x: 50, y: 0.5, z: 0, radius: 4 },
    { id: "cp2", x: -50, y: 0.5, z: 0, radius: 4 },
    { id: "cp3", x: 0, y: 0.5, z: 50, radius: 4 },
    { id: "cp4", x: 0, y: 0.5, z: -50, radius: 4 },
    { id: "cp5", x: 90, y: 0.5, z: 90, radius: 4 },
    { id: "cp6", x: -90, y: 2.5, z: 85, radius: 4 },
  ],
  mission6: [
    { id: "cp1", x: 0, y: 0.5, z: 0, radius: 20 },
  ],
};

// Props - many more for larger map
export const PROPS = [
  // Central plaza streetlights
  { type: "streetlight", x: -50, z: 50 },
  { type: "streetlight", x: 50, z: 50 },
  { type: "streetlight", x: -50, z: -50 },
  { type: "streetlight", x: 50, z: -50 },
  { type: "streetlight", x: -50, z: 0 },
  { type: "streetlight", x: 50, z: 0 },
  { type: "streetlight", x: 0, z: 50 },
  { type: "streetlight", x: 0, z: -50 },

  // North plaza lights
  { type: "streetlight", x: -30, z: 90 },
  { type: "streetlight", x: 30, z: 90 },
  { type: "streetlight", x: 0, z: 130 },

  // South plaza lights
  { type: "streetlight", x: -30, z: -90 },
  { type: "streetlight", x: 30, z: -90 },
  { type: "streetlight", x: 0, z: -130 },

  // East plaza lights
  { type: "streetlight", x: 90, z: -30 },
  { type: "streetlight", x: 90, z: 30 },
  { type: "streetlight", x: 130, z: 0 },

  // West plaza lights
  { type: "streetlight", x: -90, z: -30 },
  { type: "streetlight", x: -90, z: 30 },
  { type: "streetlight", x: -130, z: 0 },

  // Trees throughout - more trees
  { type: "tree", x: -40, z: 40, scale: 1.2 },
  { type: "tree", x: 40, z: 40, scale: 1 },
  { type: "tree", x: -40, z: -40, scale: 0.9 },
  { type: "tree", x: 40, z: -40, scale: 1.1 },
  { type: "tree", x: -20, z: 80, scale: 1 },
  { type: "tree", x: 20, z: 80, scale: 1.1 },
  { type: "tree", x: -20, z: -80, scale: 1 },
  { type: "tree", x: 20, z: -80, scale: 0.9 },
  { type: "tree", x: 80, z: -20, scale: 1 },
  { type: "tree", x: 80, z: 20, scale: 1.2 },
  { type: "tree", x: -80, z: -20, scale: 0.8 },
  { type: "tree", x: -80, z: 20, scale: 1 },
  { type: "tree", x: -55, z: 35, scale: 1.1 },
  { type: "tree", x: 55, z: 35, scale: 0.9 },
  { type: "tree", x: -55, z: -35, scale: 1 },
  { type: "tree", x: 55, z: -35, scale: 1.2 },
  { type: "tree", x: -35, z: 100, scale: 1 },
  { type: "tree", x: 35, z: 100, scale: 1.1 },
  { type: "tree", x: -35, z: -100, scale: 0.9 },
  { type: "tree", x: 35, z: -100, scale: 1 },
  { type: "tree", x: 100, z: 35, scale: 1.1 },
  { type: "tree", x: 100, z: -35, scale: 1 },
  { type: "tree", x: -100, z: 35, scale: 0.9 },
  { type: "tree", x: -100, z: -35, scale: 1.2 },

  // Bushes for landscaping
  { type: "bush", x: -32, z: 32, scale: 1 },
  { type: "bush", x: 32, z: 32, scale: 0.8 },
  { type: "bush", x: -32, z: -32, scale: 1.1 },
  { type: "bush", x: 32, z: -32, scale: 0.9 },
  { type: "bush", x: -45, z: 55, scale: 1 },
  { type: "bush", x: 45, z: 55, scale: 1.2 },
  { type: "bush", x: -45, z: -55, scale: 0.9 },
  { type: "bush", x: 45, z: -55, scale: 1 },
  { type: "bush", x: 55, z: 45, scale: 1 },
  { type: "bush", x: 55, z: -45, scale: 0.8 },
  { type: "bush", x: -55, z: 45, scale: 1.1 },
  { type: "bush", x: -55, z: -45, scale: 1 },

  // Flower beds
  { type: "flowerBed", x: -15, z: 30, width: 3, depth: 1.5 },
  { type: "flowerBed", x: 15, z: 30, width: 3, depth: 1.5 },
  { type: "flowerBed", x: -15, z: -30, width: 3, depth: 1.5 },
  { type: "flowerBed", x: 15, z: -30, width: 3, depth: 1.5 },
  { type: "flowerBed", x: 30, z: 15, width: 1.5, depth: 3 },
  { type: "flowerBed", x: 30, z: -15, width: 1.5, depth: 3 },
  { type: "flowerBed", x: -30, z: 15, width: 1.5, depth: 3 },
  { type: "flowerBed", x: -30, z: -15, width: 1.5, depth: 3 },

  // Benches
  { type: "bench", x: -19, z: 26, rotation: 0 },
  { type: "bench", x: 19, z: 26, rotation: 0 },
  { type: "bench", x: -19, z: -26, rotation: Math.PI },
  { type: "bench", x: 19, z: -26, rotation: Math.PI },
  { type: "bench", x: 26, z: -19, rotation: Math.PI / 2 },
  { type: "bench", x: 26, z: 19, rotation: Math.PI / 2 },
  { type: "bench", x: -26, z: -19, rotation: -Math.PI / 2 },
  { type: "bench", x: -26, z: 19, rotation: -Math.PI / 2 },

  // Trash bins
  { type: "trash", x: -55, z: 55 },
  { type: "trash", x: 55, z: 55 },
  { type: "trash", x: -55, z: -55 },
  { type: "trash", x: 55, z: -55 },
  { type: "trash", x: 0, z: 85 },
  { type: "trash", x: 0, z: -85 },
  { type: "trash", x: 85, z: 0 },
  { type: "trash", x: -85, z: 0 },

  // Fire hydrants
  { type: "hydrant", x: 58, z: 58 },
  { type: "hydrant", x: -58, z: -58 },
  { type: "hydrant", x: 58, z: -58 },
  { type: "hydrant", x: -58, z: 58 },

  // Parking meters
  { type: "parkingMeter", x: -62, z: 20 },
  { type: "parkingMeter", x: -62, z: 25 },
  { type: "parkingMeter", x: -62, z: 30 },
  { type: "parkingMeter", x: 62, z: -20 },
  { type: "parkingMeter", x: 62, z: -25 },
  { type: "parkingMeter", x: 62, z: -30 },

  // Traffic cones
  { type: "cone", x: 65, z: 0 },
  { type: "cone", x: -65, z: 0 },
  { type: "cone", x: 0, z: 65 },
  { type: "cone", x: 0, z: -65 },

  // === NPCs - Standing pedestrians ===
  // Central plaza pedestrians
  { type: "pedestrian", x: -22, z: 28, rotation: Math.PI / 4, variant: 0 },
  { type: "pedestrian", x: 22, z: 28, rotation: -Math.PI / 4, variant: 1 },
  { type: "pedestrian", x: -22, z: -28, rotation: Math.PI * 3 / 4, variant: 2 },
  { type: "pedestrian", x: 22, z: -28, rotation: -Math.PI * 3 / 4, variant: 3 },
  { type: "pedestrian", x: -12, z: 5, rotation: 0, variant: 4 },
  { type: "pedestrian", x: 12, z: -5, rotation: Math.PI, variant: 5 },
  { type: "pedestrian", x: -5, z: 12, rotation: Math.PI / 2, variant: 6 },
  { type: "pedestrian", x: 5, z: -12, rotation: -Math.PI / 2, variant: 7 },

  // North plaza pedestrians
  { type: "pedestrian", x: -20, z: 85, rotation: 0, variant: 8 },
  { type: "pedestrian", x: 20, z: 85, rotation: Math.PI, variant: 9 },
  { type: "pedestrian", x: -10, z: 95, rotation: Math.PI / 3, variant: 10 },
  { type: "pedestrian", x: 10, z: 95, rotation: -Math.PI / 3, variant: 11 },

  // South plaza pedestrians
  { type: "pedestrian", x: -20, z: -85, rotation: 0, variant: 12 },
  { type: "pedestrian", x: 20, z: -85, rotation: Math.PI, variant: 13 },
  { type: "pedestrian", x: 0, z: -95, rotation: Math.PI / 4, variant: 14 },

  // East plaza pedestrians
  { type: "pedestrian", x: 85, z: 20, rotation: -Math.PI / 2, variant: 15 },
  { type: "pedestrian", x: 85, z: -20, rotation: Math.PI / 2, variant: 16 },
  { type: "pedestrian", x: 95, z: 0, rotation: 0, variant: 17 },

  // West plaza pedestrians
  { type: "pedestrian", x: -85, z: 20, rotation: Math.PI / 2, variant: 18 },
  { type: "pedestrian", x: -85, z: -20, rotation: -Math.PI / 2, variant: 19 },
  { type: "pedestrian", x: -95, z: 0, rotation: Math.PI, variant: 20 },

  // === Walking pedestrians ===
  { type: "walkingPedestrian", x: -50, z: 62, endPosition: [50, 0, 62], speed: 0.8, variant: 21 },
  { type: "walkingPedestrian", x: 50, z: -62, endPosition: [-50, 0, -62], speed: 0.9, variant: 22 },
  { type: "walkingPedestrian", x: 62, z: -50, endPosition: [62, 0, 50], speed: 0.7, variant: 23 },
  { type: "walkingPedestrian", x: -62, z: 50, endPosition: [-62, 0, -50], speed: 1, variant: 24 },
  { type: "walkingPedestrian", x: -10, z: 70, endPosition: [-10, 0, 110], speed: 0.8, variant: 25 },
  { type: "walkingPedestrian", x: 10, z: 110, endPosition: [10, 0, 70], speed: 0.9, variant: 26 },
  { type: "walkingPedestrian", x: -10, z: -110, endPosition: [-10, 0, -70], speed: 0.7, variant: 27 },
  { type: "walkingPedestrian", x: 10, z: -70, endPosition: [10, 0, -110], speed: 0.85, variant: 28 },

  // === Crowds ===
  { type: "crowd", x: 85, z: 90, count: 5, radius: 4 },  // Watching skate park
  { type: "crowd", x: -90, z: 85, y: 2, count: 4, radius: 3 },  // On platform
  { type: "crowd", x: 0, z: 0, count: 3, radius: 5 },  // Around fountain

  // === Parked cars ===
  // East side parking
  { type: "car", x: 68, z: 35, rotation: Math.PI / 2, color: 0x3366cc },
  { type: "car", x: 68, z: 28, rotation: Math.PI / 2, color: 0xcc3333 },
  { type: "car", x: 68, z: 21, rotation: Math.PI / 2, color: 0x33cc33 },
  { type: "car", x: 68, z: -35, rotation: Math.PI / 2, color: 0x666666 },
  { type: "car", x: 68, z: -28, rotation: Math.PI / 2, color: 0xcccc33 },

  // West side parking
  { type: "car", x: -68, z: 35, rotation: -Math.PI / 2, color: 0xffffff },
  { type: "car", x: -68, z: 28, rotation: -Math.PI / 2, color: 0x333333 },
  { type: "car", x: -68, z: -35, rotation: -Math.PI / 2, color: 0x3366cc },
  { type: "car", x: -68, z: -28, rotation: -Math.PI / 2, color: 0xcc6633 },

  // North parking
  { type: "car", x: 35, z: 125, rotation: 0, color: 0x9933cc },
  { type: "car", x: -35, z: 125, rotation: 0, color: 0x336699 },

  // South parking
  { type: "car", x: 35, z: -125, rotation: Math.PI, color: 0xcc9933 },
  { type: "car", x: -35, z: -125, rotation: Math.PI, color: 0x339966 },

  // === Vans ===
  { type: "van", x: 68, z: 45, rotation: Math.PI / 2, color: 0xffffff },
  { type: "van", x: -68, z: -45, rotation: -Math.PI / 2, color: 0x336699 },

  // === Bicycles ===
  { type: "bicycle", x: -57, z: 57, rotation: Math.PI / 4, color: 0xff4444 },
  { type: "bicycle", x: 57, z: 57, rotation: -Math.PI / 4, color: 0x44ff44 },
  { type: "bicycle", x: -57, z: -57, rotation: Math.PI * 3 / 4, color: 0x4444ff },
  { type: "bicycle", x: 57, z: -57, rotation: -Math.PI * 3 / 4, color: 0xffff44 },

  // === Food carts ===
  { type: "foodCart", x: -25, z: 55, rotation: Math.PI, cartType: "hotdog" },
  { type: "foodCart", x: 25, z: -55, rotation: 0, cartType: "icecream" },
  { type: "foodCart", x: -55, z: -25, rotation: Math.PI / 2, cartType: "hotdog" },
  { type: "foodCart", x: 55, z: 25, rotation: -Math.PI / 2, cartType: "icecream" },

  // === Street furniture ===
  { type: "newspaperStand", x: -58, z: 10, rotation: Math.PI / 2 },
  { type: "newspaperStand", x: 58, z: -10, rotation: -Math.PI / 2 },
  { type: "atm", x: -63, z: 0, rotation: Math.PI / 2 },
  { type: "atm", x: 63, z: 0, rotation: -Math.PI / 2 },

  // === Lamp posts with banners ===
  { type: "lampPostWithBanner", x: -40, z: 0, bannerColor: 0xff6b35, bannerText: "SKATE" },
  { type: "lampPostWithBanner", x: 40, z: 0, bannerColor: 0x00d4aa, bannerText: "FEST" },
  { type: "lampPostWithBanner", x: 0, z: 40, bannerColor: 0xff6b35, bannerText: "2024" },
  { type: "lampPostWithBanner", x: 0, z: -40, bannerColor: 0x00d4aa, bannerText: "SKATE" },

  // === Birds ===
  { type: "bird", x: -8, z: 3, y: 0.1 },
  { type: "bird", x: -6, z: 5, y: 0.1 },
  { type: "bird", x: -9, z: 6, y: 0.1 },
  { type: "bird", x: 8, z: -3, y: 0.1 },
  { type: "bird", x: 6, z: -5, y: 0.1 },
  { type: "bird", x: 25, z: 85, y: 0.1 },
  { type: "bird", x: 27, z: 87, y: 0.1 },
  { type: "bird", x: -25, z: -85, y: 0.1 },

  // === Dogs ===
  { type: "dog", x: -24, z: 27, rotation: Math.PI / 3, color: 0x8b4513 },
  { type: "dog", x: 24, z: -27, rotation: -Math.PI / 3, color: 0xd4a574 },
  { type: "dog", x: -85, z: 15, rotation: 0, color: 0x1a1a1a },
];

// Spawn points
export const SPAWNS = {
  default: { x: 0, y: 0.1, z: -20, yaw: 0 },
  mission1: { x: 0, y: 0.1, z: -50, yaw: 0 },
  mission2: { x: 0, y: 0.1, z: -30, yaw: 0 },
  mission5: { x: -50, y: 0.1, z: 0, yaw: Math.PI / 2 },
  free: { x: 0, y: 0.1, z: 0, yaw: 0 },
};

// Environment settings - extended fog for larger map
export const ENVIRONMENT = {
  skyColor: 0x87ceeb,
  groundColor: 0x404040,
  sunPosition: [80, 120, 50],
  sunColor: 0xfff5e6,
  sunIntensity: 1.2,
  ambientColor: 0x404060,
  ambientIntensity: 0.5,
  fogColor: 0xc8dff0,
  fogNear: 100,
  fogFar: 400,
  theme: "downtown",
};

// Export combined level data
export const DOWNTOWN_LEVEL = {
  id: "downtown",
  name: "Downtown Streets",
  district: 1,
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
