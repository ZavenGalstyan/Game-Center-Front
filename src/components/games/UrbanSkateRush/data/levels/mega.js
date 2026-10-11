/**
 * Urban Skate Rush — Mega Skate City Level Data
 *
 * District 5: Ultimate massive skate paradise - championship arena
 */

export const GROUNDS = [
  // Central mega arena
  { id: "megaArena", minX: -100, maxX: 100, minZ: -100, maxZ: 100, y: 0 },

  // Pro street course - West
  { id: "streetCourse", minX: -180, maxX: -100, minZ: -60, maxZ: 60, y: 0 },

  // Vert ramp area - East
  { id: "vertArea", minX: 100, maxX: 180, minZ: -60, maxZ: 60, y: 0 },

  // Flow section - North
  { id: "flowSection", minX: -60, maxX: 60, minZ: 100, maxZ: 180, y: 0 },

  // Tech zone - South
  { id: "techZone", minX: -60, maxX: 60, minZ: -180, maxZ: -100, y: 0 },

  // Championship bowl - center elevated
  { id: "champBowl", minX: -40, maxX: 40, minZ: -40, maxZ: 40, y: 2 },

  // Elevated viewing decks
  { id: "viewDeck1", minX: -200, maxX: -180, minZ: -40, maxZ: 40, y: 6 },
  { id: "viewDeck2", minX: 180, maxX: 200, minZ: -40, maxZ: 40, y: 6 },

  // Corner plazas
  { id: "nwPlaza", minX: -180, maxX: -100, minZ: 100, maxZ: 150, y: 0 },
  { id: "nePlaza", minX: 100, maxX: 180, minZ: 100, maxZ: 150, y: 0 },
  { id: "swPlaza", minX: -180, maxX: -100, minZ: -150, maxZ: -100, y: 0 },
  { id: "sePlaza", minX: 100, maxX: 180, minZ: -150, maxZ: -100, y: 0 },

  // Connecting paths
  { id: "pathN", minX: -30, maxX: 30, minZ: 180, maxZ: 220, y: 0 },
  { id: "pathS", minX: -30, maxX: 30, minZ: -220, maxZ: -180, y: 0 },
  { id: "pathE", minX: 180, maxX: 220, minZ: -30, maxZ: 30, y: 0 },
  { id: "pathW", minX: -220, maxX: -180, minZ: -30, maxZ: 30, y: 0 },
];

export const OBSTACLES = [
  // Stadium seating walls
  { id: "stadium1", minX: -210, maxX: -200, minZ: -80, maxZ: 80, minY: 0, maxY: 20 },
  { id: "stadium2", minX: 200, maxX: 210, minZ: -80, maxZ: 80, minY: 0, maxY: 20 },
  { id: "stadium3", minX: -80, maxX: 80, minZ: 200, maxZ: 210, minY: 0, maxY: 18 },
  { id: "stadium4", minX: -80, maxX: 80, minZ: -210, maxZ: -200, minY: 0, maxY: 18 },

  // Corner stadium sections
  { id: "corner1", minX: -200, maxX: -150, minZ: 150, maxZ: 180, minY: 0, maxY: 15 },
  { id: "corner2", minX: 150, maxX: 200, minZ: 150, maxZ: 180, minY: 0, maxY: 15 },
  { id: "corner3", minX: -200, maxX: -150, minZ: -180, maxZ: -150, minY: 0, maxY: 15 },
  { id: "corner4", minX: 150, maxX: 200, minZ: -180, maxZ: -150, minY: 0, maxY: 15 },

  // Street course funboxes
  { id: "streetFunbox1", minX: -165, maxX: -150, minZ: -30, maxZ: 30, minY: 0, maxY: 2 },
  { id: "streetFunbox2", minX: -145, maxX: -130, minZ: -20, maxZ: 20, minY: 0, maxY: 1.5 },
  { id: "streetFunbox3", minX: -125, maxX: -110, minZ: -25, maxZ: 25, minY: 0, maxY: 2.5 },

  // Central pyramid
  { id: "pyramid", minX: -15, maxX: 15, minZ: -15, maxZ: 15, minY: 2, maxY: 7 },

  // Championship bowl island
  { id: "bowlIsland", minX: -10, maxX: 10, minZ: -10, maxZ: 10, minY: 2, maxY: 4 },

  // Manual pads throughout
  { id: "manualPad1", minX: -80, maxX: -70, minZ: 120, maxZ: 140, minY: 0, maxY: 0.3 },
  { id: "manualPad2", minX: 70, maxX: 80, minZ: 120, maxZ: 140, minY: 0, maxY: 0.3 },
  { id: "manualPad3", minX: -80, maxX: -70, minZ: -140, maxZ: -120, minY: 0, maxY: 0.3 },
  { id: "manualPad4", minX: 70, maxX: 80, minZ: -140, maxZ: -120, minY: 0, maxY: 0.3 },
  { id: "manualPad5", minX: -50, maxX: -40, minZ: -90, maxZ: -70, minY: 0, maxY: 0.3 },
  { id: "manualPad6", minX: 40, maxX: 50, minZ: 70, maxZ: 90, minY: 0, maxY: 0.3 },

  // Vert area stair sets
  { id: "stairs1", minX: 120, maxX: 135, minZ: -10, maxZ: 10, minY: 0, maxY: 2 },
  { id: "stairs2", minX: 150, maxX: 165, minZ: -10, maxZ: 10, minY: 0, maxY: 3 },

  // Tech zone ledges
  { id: "techLedge1", minX: -50, maxX: 50, minZ: -150, maxZ: -145, minY: 0, maxY: 0.6 },
  { id: "techLedge2", minX: -50, maxX: 50, minZ: -170, maxZ: -165, minY: 0, maxY: 0.6 },
  { id: "techLedge3", minX: -45, maxX: -40, minZ: -175, maxZ: -105, minY: 0, maxY: 0.6 },
  { id: "techLedge4", minX: 40, maxX: 45, minZ: -175, maxZ: -105, minY: 0, maxY: 0.6 },

  // Flow section obstacles
  { id: "flowBox1", minX: -40, maxX: -30, minZ: 130, maxZ: 145, minY: 0, maxY: 1.2 },
  { id: "flowBox2", minX: 30, maxX: 40, minZ: 130, maxZ: 145, minY: 0, maxY: 1.2 },
  { id: "flowBox3", minX: -15, maxX: 15, minZ: 155, maxZ: 170, minY: 0, maxY: 1.5 },

  // View deck supports
  { id: "deckSupport1", minX: -195, maxX: -185, minZ: -35, maxZ: -25, minY: 0, maxY: 6 },
  { id: "deckSupport2", minX: -195, maxX: -185, minZ: 25, maxZ: 35, minY: 0, maxY: 6 },
  { id: "deckSupport3", minX: 185, maxX: 195, minZ: -35, maxZ: -25, minY: 0, maxY: 6 },
  { id: "deckSupport4", minX: 185, maxX: 195, minZ: 25, maxZ: 35, minY: 0, maxY: 6 },
];

export const RAMPS = [
  // Mega vert ramps
  { id: "megaVert1", type: "quarter", centerX: 175, centerZ: 0, radius: 15, height: 6, angle: -Math.PI / 2 },
  { id: "megaVert2", type: "quarter", centerX: 175, centerZ: -40, radius: 12, height: 5, angle: -Math.PI / 2 },
  { id: "megaVert3", type: "quarter", centerX: 175, centerZ: 40, radius: 12, height: 5, angle: -Math.PI / 2 },

  // Flow section quarter pipes
  { id: "flowQuarter1", type: "quarter", centerX: 0, centerZ: 175, radius: 14, height: 5, angle: Math.PI },
  { id: "flowQuarter2", type: "quarter", centerX: -45, centerZ: 165, radius: 10, height: 4, angle: Math.PI },
  { id: "flowQuarter3", type: "quarter", centerX: 45, centerZ: 165, radius: 10, height: 4, angle: Math.PI },

  // Tech section quarters
  { id: "techQuarter1", type: "quarter", centerX: 0, centerZ: -175, radius: 14, height: 5, angle: 0 },
  { id: "techQuarter2", type: "quarter", centerX: -45, centerZ: -165, radius: 8, height: 3, angle: 0 },
  { id: "techQuarter3", type: "quarter", centerX: 45, centerZ: -165, radius: 8, height: 3, angle: 0 },

  // Street course ramps
  { id: "streetRamp1", startX: -175, startZ: 40, endX: -165, endZ: 40, startY: 0, endY: 3, width: 12 },
  { id: "streetRamp2", startX: -175, startZ: -40, endX: -165, endZ: -40, startY: 0, endY: 3, width: 12 },
  { id: "streetRamp3", startX: -140, startZ: 0, endX: -130, endZ: 0, startY: 0, endY: 2.5, width: 15 },

  // Central pyramid ramps (all 4 sides)
  { id: "pyramidRamp1", startX: -20, startZ: 0, endX: -15, endZ: 0, startY: 2, endY: 7, width: 8 },
  { id: "pyramidRamp2", startX: 15, startZ: 0, endX: 20, endZ: 0, startY: 7, endY: 2, width: 8 },
  { id: "pyramidRamp3", startX: 0, startZ: -20, endX: 0, endZ: -15, startY: 2, endY: 7, width: 8 },
  { id: "pyramidRamp4", startX: 0, startZ: 15, endX: 0, endZ: 20, startY: 7, endY: 2, width: 8 },

  // Championship bowl entry ramps
  { id: "bowlEntry1", startX: -50, startZ: 0, endX: -40, endZ: 0, startY: 0, endY: 2, width: 10 },
  { id: "bowlEntry2", startX: 40, startZ: 0, endX: 50, endZ: 0, startY: 2, endY: 0, width: 10 },
  { id: "bowlEntry3", startX: 0, startZ: -50, endX: 0, endZ: -40, startY: 0, endY: 2, width: 10 },
  { id: "bowlEntry4", startX: 0, startZ: 40, endX: 0, endZ: 50, startY: 2, endY: 0, width: 10 },

  // Launch ramps throughout
  { id: "launch1", startX: -80, startZ: 0, endX: -70, endZ: 0, startY: 0, endY: 2.5, width: 8 },
  { id: "launch2", startX: 70, startZ: 0, endX: 80, endZ: 0, startY: 2.5, endY: 0, width: 8 },
  { id: "launch3", startX: 0, startZ: -80, endX: 0, endZ: -70, startY: 0, endY: 2.5, width: 8 },
  { id: "launch4", startX: 0, startZ: 70, endX: 0, endZ: 80, startY: 2.5, endY: 0, width: 8 },

  // View deck ramps
  { id: "deckRamp1", startX: -190, startZ: 0, endX: -180, endZ: 0, startY: 0, endY: 6, width: 12 },
  { id: "deckRamp2", startX: 180, startZ: 0, endX: 190, endZ: 0, startY: 6, endY: 0, width: 12 },

  // Corner plaza mini ramps
  { id: "cornerRamp1", startX: -140, startZ: 110, endX: -140, endZ: 100, startY: 0, endY: 2, width: 10 },
  { id: "cornerRamp2", startX: 140, startZ: 110, endX: 140, endZ: 100, startY: 0, endY: 2, width: 10 },
  { id: "cornerRamp3", startX: -140, startZ: -100, endX: -140, endZ: -110, startY: 0, endY: 2, width: 10 },
  { id: "cornerRamp4", startX: 140, startZ: -100, endX: 140, endZ: -110, startY: 0, endY: 2, width: 10 },
];

export const RAILS = [
  // Long mega grind rails
  { id: "megaRail1", startX: -175, startZ: 0, startY: 0.6, endX: -105, endZ: 0, endY: 0.6, length: 70 },
  { id: "megaRail2", startX: 105, startZ: 0, startY: 0.6, endX: 175, endZ: 0, endY: 0.6, length: 70 },
  { id: "megaRail3", startX: 0, startZ: -175, startY: 0.6, endX: 0, endZ: -105, endY: 0.6, length: 70 },
  { id: "megaRail4", startX: 0, startZ: 105, startY: 0.6, endX: 0, endZ: 175, endY: 0.6, length: 70 },

  // Street course funbox rails
  { id: "funboxRail1", startX: -165, startZ: -30, startY: 2.1, endX: -150, endZ: -30, endY: 2.1, length: 15 },
  { id: "funboxRail2", startX: -165, startZ: 30, startY: 2.1, endX: -150, endZ: 30, endY: 2.1, length: 15 },
  { id: "funboxRail3", startX: -145, startZ: -20, startY: 1.6, endX: -130, endZ: -20, endY: 1.6, length: 15 },
  { id: "funboxRail4", startX: -145, startZ: 20, startY: 1.6, endX: -130, endZ: 20, endY: 1.6, length: 15 },
  { id: "funboxRail5", startX: -125, startZ: -25, startY: 2.6, endX: -110, endZ: -25, endY: 2.6, length: 15 },
  { id: "funboxRail6", startX: -125, startZ: 25, startY: 2.6, endX: -110, endZ: 25, endY: 2.6, length: 15 },

  // Flow section rails
  { id: "flowRail1", startX: -50, startZ: 120, startY: 0.6, endX: 50, endZ: 120, endY: 0.6, length: 100 },
  { id: "flowRail2", startX: -40, startZ: 140, startY: 0.6, endX: 40, endZ: 140, endY: 0.6, length: 80 },
  { id: "flowRail3", startX: -30, startZ: 160, startY: 0.6, endX: 30, endZ: 160, endY: 0.6, length: 60 },

  // Tech section rails
  { id: "techRail1", startX: -50, startZ: -120, startY: 0.6, endX: 50, endZ: -120, endY: 0.6, length: 100 },
  { id: "techRail2", startX: -40, startZ: -140, startY: 0.6, endX: 40, endZ: -140, endY: 0.6, length: 80 },
  { id: "techRail3", startX: -30, startZ: -160, startY: 0.6, endX: 30, endZ: -160, endY: 0.6, length: 60 },

  // Ledge rails
  { id: "ledgeRail1", startX: -50, startZ: -147, startY: 0.7, endX: 50, endZ: -147, endY: 0.7, length: 100 },
  { id: "ledgeRail2", startX: -50, startZ: -167, startY: 0.7, endX: 50, endZ: -167, endY: 0.7, length: 100 },
  { id: "ledgeRail3", startX: -42, startZ: -175, startY: 0.7, endX: -42, endZ: -105, endY: 0.7, length: 70 },
  { id: "ledgeRail4", startX: 42, startZ: -175, startY: 0.7, endX: 42, endZ: -105, endY: 0.7, length: 70 },

  // Pyramid rails (diagonal)
  { id: "pyramidRail1", startX: -15, startZ: -15, startY: 7.1, endX: 15, endZ: 15, endY: 7.1, length: 42 },
  { id: "pyramidRail2", startX: 15, startZ: -15, startY: 7.1, endX: -15, endZ: 15, endY: 7.1, length: 42 },

  // Championship bowl rails
  { id: "bowlRail1", startX: -38, startZ: 0, startY: 2.5, endX: -20, endZ: 0, endY: 2.5, length: 18 },
  { id: "bowlRail2", startX: 20, startZ: 0, startY: 2.5, endX: 38, endZ: 0, endY: 2.5, length: 18 },
  { id: "bowlRail3", startX: 0, startZ: -38, startY: 2.5, endX: 0, endZ: -20, endY: 2.5, length: 18 },
  { id: "bowlRail4", startX: 0, startZ: 20, startY: 2.5, endX: 0, endZ: 38, endY: 2.5, length: 18 },

  // Stair rails
  { id: "stairRail1", startX: 120, startZ: -10, startY: 0.6, endX: 135, endZ: -10, endY: 2.1, length: 15 },
  { id: "stairRail2", startX: 150, startZ: 10, startY: 0.6, endX: 165, endZ: 10, endY: 3.1, length: 15 },

  // View deck rails
  { id: "deckRail1", startX: -198, startZ: -35, startY: 6.5, endX: -198, endZ: 35, endY: 6.5, length: 70 },
  { id: "deckRail2", startX: 198, startZ: -35, startY: 6.5, endX: 198, endZ: 35, endY: 6.5, length: 70 },

  // Diagonal arena rails
  { id: "arenaRail1", startX: -90, startZ: -90, startY: 0.6, endX: -60, endZ: -60, endY: 0.6, length: 42 },
  { id: "arenaRail2", startX: 60, startZ: 60, startY: 0.6, endX: 90, endZ: 90, endY: 0.6, length: 42 },
  { id: "arenaRail3", startX: 90, startZ: -90, startY: 0.6, endX: 60, endZ: -60, endY: 0.6, length: 42 },
  { id: "arenaRail4", startX: -60, startZ: 60, startY: 0.6, endX: -90, endZ: 90, endY: 0.6, length: 42 },
];

export const TOKENS = [
  // Central arena
  { id: "token1", x: 0, y: 7.5, z: 0 },
  { id: "token2", x: -60, y: 0.5, z: 0 },
  { id: "token3", x: 60, y: 0.5, z: 0 },
  { id: "token4", x: 0, y: 0.5, z: -60 },
  { id: "token5", x: 0, y: 0.5, z: 60 },
  { id: "token6", x: -70, y: 0.5, z: -70 },
  { id: "token7", x: 70, y: 0.5, z: 70 },
  { id: "token8", x: 70, y: 0.5, z: -70 },
  { id: "token9", x: -70, y: 0.5, z: 70 },

  // Championship bowl
  { id: "token10", x: 0, y: 3, z: 0 },
  { id: "token11", x: -30, y: 2.5, z: 0 },
  { id: "token12", x: 30, y: 2.5, z: 0 },
  { id: "token13", x: 0, y: 2.5, z: -30 },
  { id: "token14", x: 0, y: 2.5, z: 30 },

  // Street course
  { id: "token15", x: -140, y: 3, z: 0 },
  { id: "token16", x: -155, y: 2.5, z: -25 },
  { id: "token17", x: -155, y: 2.5, z: 25 },
  { id: "token18", x: -120, y: 3, z: 0 },

  // Vert area
  { id: "token19", x: 165, y: 6.5, z: 0 },
  { id: "token20", x: 165, y: 5.5, z: -35 },
  { id: "token21", x: 165, y: 5.5, z: 35 },

  // Flow section
  { id: "token22", x: 0, y: 5.5, z: 165 },
  { id: "token23", x: -40, y: 0.5, z: 130 },
  { id: "token24", x: 40, y: 0.5, z: 130 },
  { id: "token25", x: 0, y: 2, z: 155 },

  // Tech zone
  { id: "token26", x: 0, y: 5.5, z: -165 },
  { id: "token27", x: -40, y: 0.5, z: -130 },
  { id: "token28", x: 40, y: 0.5, z: -130 },
  { id: "token29", x: 0, y: 0.5, z: -155 },

  // View decks
  { id: "token30", x: -190, y: 7, z: 0 },
  { id: "token31", x: 190, y: 7, z: 0 },
  { id: "token32", x: -190, y: 7, z: 20 },
  { id: "token33", x: 190, y: 7, z: -20 },

  // Corner plazas
  { id: "token34", x: -140, y: 0.5, z: 125 },
  { id: "token35", x: 140, y: 0.5, z: 125 },
  { id: "token36", x: -140, y: 0.5, z: -125 },
  { id: "token37", x: 140, y: 0.5, z: -125 },

  // Paths
  { id: "token38", x: 0, y: 0.5, z: 200 },
  { id: "token39", x: 0, y: 0.5, z: -200 },
  { id: "token40", x: 200, y: 0.5, z: 0 },
];

export const CHECKPOINTS = {
  mission25: [
    { id: "cp1", x: 0, y: 2.5, z: 0, radius: 6 },
    { id: "cp2", x: -140, y: 0.5, z: 0, radius: 6 },
    { id: "cp3", x: 140, y: 0.5, z: 0, radius: 6 },
    { id: "cp4", x: 0, y: 0.5, z: 140, radius: 6 },
    { id: "cp5", x: 0, y: 0.5, z: -140, radius: 6 },
  ],
  mission26: [
    { id: "cp1", x: 160, y: 0.5, z: 0, radius: 15 },
  ],
  mission27: [
    { id: "cp1", x: 0, y: 2.5, z: 0, radius: 25 },
  ],
  mission28: [
    { id: "cp1", x: -140, y: 0.5, z: 0, radius: 4 },
    { id: "cp2", x: 140, y: 0.5, z: 0, radius: 4 },
    { id: "cp3", x: 0, y: 0.5, z: 140, radius: 4 },
    { id: "cp4", x: 0, y: 0.5, z: -140, radius: 4 },
    { id: "cp5", x: 0, y: 7.5, z: 0, radius: 4 },
    { id: "cp6", x: -190, y: 6.5, z: 0, radius: 4 },
    { id: "cp7", x: -70, y: 0.5, z: 130, radius: 4 },
    { id: "cp8", x: 70, y: 0.5, z: 130, radius: 4 },
  ],
  mission29: [
    { id: "cp1", x: 0, y: 2.5, z: 0, radius: 40 },
  ],
  mission30: [
    { id: "cp1", x: 0, y: 2.5, z: 0, radius: 60 },
  ],
};

export const PROPS = [
  // Stadium lights
  { type: "stadiumLight", x: -180, z: -70 },
  { type: "stadiumLight", x: -180, z: 70 },
  { type: "stadiumLight", x: 180, z: -70 },
  { type: "stadiumLight", x: 180, z: 70 },
  { type: "stadiumLight", x: -70, z: 180 },
  { type: "stadiumLight", x: 70, z: 180 },
  { type: "stadiumLight", x: -70, z: -180 },
  { type: "stadiumLight", x: 70, z: -180 },

  // Corner stadium lights
  { type: "stadiumLight", x: -150, z: 150 },
  { type: "stadiumLight", x: 150, z: 150 },
  { type: "stadiumLight", x: -150, z: -150 },
  { type: "stadiumLight", x: 150, z: -150 },

  // Sponsor banners
  { type: "banner", x: -205, z: 0, text: "SKATE PRO" },
  { type: "banner", x: 205, z: 0, text: "RUSH BOARDS" },
  { type: "banner", x: 0, z: 205, text: "MEGA CITY" },
  { type: "banner", x: 0, z: -205, text: "CHAMPIONSHIP" },

  // Course marking cones
  { type: "cone", x: -95, z: 50 },
  { type: "cone", x: -95, z: -50 },
  { type: "cone", x: 95, z: 50 },
  { type: "cone", x: 95, z: -50 },
  { type: "cone", x: 50, z: 95 },
  { type: "cone", x: -50, z: 95 },
  { type: "cone", x: 50, z: -95 },
  { type: "cone", x: -50, z: -95 },
  { type: "cone", x: -100, z: 0 },
  { type: "cone", x: 100, z: 0 },
  { type: "cone", x: 0, z: -100 },
  { type: "cone", x: 0, z: 100 },

  // Spectator benches
  { type: "bench", x: -90, z: 75, rotation: -Math.PI / 4 },
  { type: "bench", x: -90, z: -75, rotation: Math.PI / 4 },
  { type: "bench", x: 90, z: 75, rotation: Math.PI + Math.PI / 4 },
  { type: "bench", x: 90, z: -75, rotation: Math.PI - Math.PI / 4 },
  { type: "bench", x: 75, z: 90, rotation: -Math.PI * 3 / 4 },
  { type: "bench", x: -75, z: 90, rotation: Math.PI * 3 / 4 },
  { type: "bench", x: 75, z: -90, rotation: -Math.PI / 4 },
  { type: "bench", x: -75, z: -90, rotation: Math.PI / 4 },

  // Street lights throughout
  { type: "streetlight", x: -100, z: 0 },
  { type: "streetlight", x: 100, z: 0 },
  { type: "streetlight", x: 0, z: 100 },
  { type: "streetlight", x: 0, z: -100 },

  // Trash bins
  { type: "trash", x: -85, z: 85 },
  { type: "trash", x: 85, z: 85 },
  { type: "trash", x: -85, z: -85 },
  { type: "trash", x: 85, z: -85 },
];

export const SPAWNS = {
  default: { x: 0, y: 2.1, z: -35, yaw: 0 },
  mission25: { x: -90, y: 0.1, z: 0, yaw: Math.PI / 2 },
  mission26: { x: 110, y: 0.1, z: 0, yaw: Math.PI / 2 },
  mission27: { x: 0, y: 2.1, z: -35, yaw: 0 },
  mission30: { x: 0, y: 2.1, z: 0, yaw: 0 },
  free: { x: 0, y: 2.1, z: 0, yaw: 0 },
};

export const ENVIRONMENT = {
  skyColor: 0x1a1a3a,
  groundColor: 0x2a2a4a,
  sunPosition: [100, 150, 80],
  sunColor: 0xffffff,
  sunIntensity: 1.2,
  ambientColor: 0x404060,
  ambientIntensity: 0.5,
  fogColor: 0x1a1a3a,
  fogNear: 120,
  fogFar: 500,
  theme: "mega",
  stadiumLights: true,
};

export const MEGA_LEVEL = {
  id: "mega",
  name: "Mega Skate City",
  district: 5,
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
