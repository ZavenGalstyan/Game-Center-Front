/**
 * Urban Skate Rush — Neon Downtown Level Data
 *
 * District 4: Massive futuristic city with neon lights and multi-level platforms
 */

export const GROUNDS = [
  // Main plaza - large central area
  { id: "plaza", minX: -100, maxX: 100, minZ: -100, maxZ: 100, y: 0 },

  // Elevated platforms - level 1 (3m high)
  { id: "platform1a", minX: -80, maxX: -40, minZ: -80, maxZ: -40, y: 3 },
  { id: "platform1b", minX: 40, maxX: 80, minZ: -80, maxZ: -40, y: 3 },
  { id: "platform1c", minX: -80, maxX: -40, minZ: 40, maxZ: 80, y: 3 },
  { id: "platform1d", minX: 40, maxX: 80, minZ: 40, maxZ: 80, y: 3 },

  // Elevated platforms - level 2 (6m high)
  { id: "platform2a", minX: -60, maxX: -30, minZ: -60, maxZ: -30, y: 6 },
  { id: "platform2b", minX: 30, maxX: 60, minZ: 30, maxZ: 60, y: 6 },

  // Skybridges
  { id: "skybridge1", minX: -8, maxX: 8, minZ: -40, maxZ: 40, y: 6 },
  { id: "skybridge2", minX: -40, maxX: 40, minZ: -8, maxZ: 8, y: 6 },

  // Underground passage
  { id: "tunnel1", minX: 80, maxX: 140, minZ: -20, maxZ: 20, y: -2 },
  { id: "tunnel2", minX: -140, maxX: -80, minZ: -20, maxZ: 20, y: -2 },

  // North extension
  { id: "northPlaza", minX: -60, maxX: 60, minZ: 100, maxZ: 160, y: 0 },
  { id: "northStreet", minX: -20, maxX: 20, minZ: 160, maxZ: 200, y: 0 },

  // South extension
  { id: "southPlaza", minX: -60, maxX: 60, minZ: -160, maxZ: -100, y: 0 },
  { id: "southStreet", minX: -20, maxX: 20, minZ: -200, maxZ: -160, y: 0 },

  // East/West streets
  { id: "eastStreet", minX: 100, maxX: 160, minZ: -30, maxZ: 30, y: 0 },
  { id: "westStreet", minX: -160, maxX: -100, minZ: -30, maxZ: 30, y: 0 },
];

export const OBSTACLES = [
  // Neon towers - corners
  { id: "tower1", minX: -95, maxX: -82, minZ: -95, maxZ: -82, minY: 0, maxY: 40 },
  { id: "tower2", minX: 82, maxX: 95, minZ: -95, maxZ: -82, minY: 0, maxY: 45 },
  { id: "tower3", minX: -95, maxX: -82, minZ: 82, maxZ: 95, minY: 0, maxY: 35 },
  { id: "tower4", minX: 82, maxX: 95, minZ: 82, maxZ: 95, minY: 0, maxY: 50 },

  // Mid towers
  { id: "tower5", minX: -50, maxX: -42, minZ: 105, maxZ: 115, minY: 0, maxY: 30 },
  { id: "tower6", minX: 42, maxX: 50, minZ: 105, maxZ: 115, minY: 0, maxY: 35 },
  { id: "tower7", minX: -50, maxX: -42, minZ: -115, maxZ: -105, minY: 0, maxY: 32 },
  { id: "tower8", minX: 42, maxX: 50, minZ: -115, maxZ: -105, minY: 0, maxY: 28 },

  // Platform supports level 1
  { id: "support1a", minX: -80, maxX: -77, minZ: -80, maxZ: -77, minY: 0, maxY: 3 },
  { id: "support1b", minX: -43, maxX: -40, minZ: -43, maxZ: -40, minY: 0, maxY: 3 },
  { id: "support1c", minX: 77, maxX: 80, minZ: -80, maxZ: -77, minY: 0, maxY: 3 },
  { id: "support1d", minX: 40, maxX: 43, minZ: -43, maxZ: -40, minY: 0, maxY: 3 },
  { id: "support1e", minX: -80, maxX: -77, minZ: 77, maxZ: 80, minY: 0, maxY: 3 },
  { id: "support1f", minX: -43, maxX: -40, minZ: 40, maxZ: 43, minY: 0, maxY: 3 },
  { id: "support1g", minX: 77, maxX: 80, minZ: 77, maxZ: 80, minY: 0, maxY: 3 },
  { id: "support1h", minX: 40, maxX: 43, minZ: 40, maxZ: 43, minY: 0, maxY: 3 },

  // Platform supports level 2
  { id: "support2a", minX: -60, maxX: -57, minZ: -60, maxZ: -57, minY: 3, maxY: 6 },
  { id: "support2b", minX: -33, maxX: -30, minZ: -33, maxZ: -30, minY: 3, maxY: 6 },
  { id: "support2c", minX: 57, maxX: 60, minZ: 57, maxZ: 60, minY: 3, maxY: 6 },
  { id: "support2d", minX: 30, maxX: 33, minZ: 30, maxZ: 33, minY: 3, maxY: 6 },

  // Skybridge supports
  { id: "bridgeSupport1", minX: -5, maxX: 5, minZ: -42, maxZ: -38, minY: 0, maxY: 6 },
  { id: "bridgeSupport2", minX: -5, maxX: 5, minZ: 38, maxZ: 42, minY: 0, maxY: 6 },
  { id: "bridgeSupport3", minX: -42, maxX: -38, minZ: -5, maxZ: 5, minY: 0, maxY: 6 },
  { id: "bridgeSupport4", minX: 38, maxX: 42, minZ: -5, maxZ: 5, minY: 0, maxY: 6 },

  // Neon kiosks
  { id: "kiosk1", minX: -30, maxX: -25, minZ: 0, maxZ: 5, minY: 0, maxY: 3.5 },
  { id: "kiosk2", minX: 25, maxX: 30, minZ: -5, maxZ: 0, minY: 0, maxY: 3.5 },
  { id: "kiosk3", minX: -5, maxX: 0, minZ: -30, maxZ: -25, minY: 0, maxY: 3.5 },
  { id: "kiosk4", minX: 0, maxX: 5, minZ: 25, maxZ: 30, minY: 0, maxY: 3.5 },

  // Holographic displays
  { id: "display1", minX: -2, maxX: 2, minZ: -90, maxZ: -86, minY: 0, maxY: 5 },
  { id: "display2", minX: -2, maxX: 2, minZ: 86, maxZ: 90, minY: 0, maxY: 5 },
  { id: "display3", minX: -90, maxX: -86, minZ: -2, maxZ: 2, minY: 0, maxY: 5 },
  { id: "display4", minX: 86, maxX: 90, minZ: -2, maxZ: 2, minY: 0, maxY: 5 },

  // Planters with glow
  { id: "planter1", minX: -55, maxX: -50, minZ: 15, maxZ: 20, minY: 0, maxY: 1 },
  { id: "planter2", minX: 50, maxX: 55, minZ: -20, maxZ: -15, minY: 0, maxY: 1 },
  { id: "planter3", minX: 15, maxX: 20, minZ: -55, maxZ: -50, minY: 0, maxY: 1 },
  { id: "planter4", minX: -20, maxX: -15, minZ: 50, maxZ: 55, minY: 0, maxY: 1 },

  // Tunnel walls
  { id: "tunnelWall1", minX: 78, maxX: 80, minZ: -22, maxZ: 22, minY: -2, maxY: 4 },
  { id: "tunnelWall2", minX: 140, maxX: 142, minZ: -22, maxZ: 22, minY: -2, maxY: 4 },
  { id: "tunnelWall3", minX: -142, maxX: -140, minZ: -22, maxZ: 22, minY: -2, maxY: 4 },
  { id: "tunnelWall4", minX: -80, maxX: -78, minZ: -22, maxZ: 22, minY: -2, maxY: 4 },
];

export const RAMPS = [
  // Platform access ramps - level 1
  { id: "platformRamp1a", startX: -60, startZ: -35, endX: -60, endZ: -40, startY: 0, endY: 3, width: 8 },
  { id: "platformRamp1b", startX: 60, startZ: -35, endX: 60, endZ: -40, startY: 0, endY: 3, width: 8 },
  { id: "platformRamp1c", startX: -60, startZ: 35, endX: -60, endZ: 40, startY: 0, endY: 3, width: 8 },
  { id: "platformRamp1d", startX: 60, startZ: 35, endX: 60, endZ: 40, startY: 0, endY: 3, width: 8 },

  // Platform access ramps - level 2
  { id: "platformRamp2a", startX: -45, startZ: -25, endX: -45, endZ: -30, startY: 3, endY: 6, width: 6 },
  { id: "platformRamp2b", startX: 45, startZ: 25, endX: 45, endZ: 30, startY: 3, endY: 6, width: 6 },

  // Skybridge access from level 1
  { id: "bridgeRamp1", startX: 0, startZ: -45, endX: 0, endZ: -40, startY: 3, endY: 6, width: 5 },
  { id: "bridgeRamp2", startX: 0, startZ: 40, endX: 0, endZ: 45, startY: 6, endY: 3, width: 5 },
  { id: "bridgeRamp3", startX: -45, startZ: 0, endX: -40, endZ: 0, startY: 3, endY: 6, width: 5 },
  { id: "bridgeRamp4", startX: 40, startZ: 0, endX: 45, endZ: 0, startY: 6, endY: 3, width: 5 },

  // Street kickers
  { id: "kicker1", startX: -20, startZ: 50, endX: -20, endZ: 55, startY: 0, endY: 2, width: 6 },
  { id: "kicker2", startX: 20, startZ: -55, endX: 20, endZ: -50, startY: 0, endY: 2, width: 6 },
  { id: "kicker3", startX: 50, startZ: -20, endX: 55, endZ: -20, startY: 0, endY: 2, width: 6 },
  { id: "kicker4", startX: -55, startZ: 20, endX: -50, endZ: 20, startY: 0, endY: 2, width: 6 },

  // Quarter pipes
  { id: "quarter1", type: "quarter", centerX: -130, centerZ: 0, radius: 10, height: 4, angle: Math.PI / 2 },
  { id: "quarter2", type: "quarter", centerX: 130, centerZ: 0, radius: 10, height: 4, angle: -Math.PI / 2 },
  { id: "quarter3", type: "quarter", centerX: 0, centerZ: 130, radius: 10, height: 4, angle: Math.PI },
  { id: "quarter4", type: "quarter", centerX: 0, centerZ: -130, radius: 10, height: 4, angle: 0 },

  // Tunnel ramps
  { id: "tunnelRamp1", startX: 100, startZ: 0, endX: 80, endZ: 0, startY: 0, endY: -2, width: 15 },
  { id: "tunnelRamp2", startX: 140, startZ: 0, endX: 160, endZ: 0, startY: -2, endY: 0, width: 15 },
  { id: "tunnelRamp3", startX: -100, startZ: 0, endX: -80, endZ: 0, startY: 0, endY: -2, width: 15 },
  { id: "tunnelRamp4", startX: -140, startZ: 0, endX: -160, endZ: 0, startY: -2, endY: 0, width: 15 },
];

export const RAILS = [
  // Ground level plaza rails
  { id: "plazaRail1", startX: -90, startZ: 0, startY: 0.6, endX: -50, endZ: 0, endY: 0.6, length: 40 },
  { id: "plazaRail2", startX: 50, startZ: 0, startY: 0.6, endX: 90, endZ: 0, endY: 0.6, length: 40 },
  { id: "plazaRail3", startX: 0, startZ: -90, startY: 0.6, endX: 0, endZ: -50, endY: 0.6, length: 40 },
  { id: "plazaRail4", startX: 0, startZ: 50, startY: 0.6, endX: 0, endZ: 90, endY: 0.6, length: 40 },

  // Diagonal plaza rails
  { id: "diagRail1", startX: -70, startZ: -70, startY: 0.6, endX: -40, endZ: -40, endY: 0.6, length: 42 },
  { id: "diagRail2", startX: 40, startZ: 40, startY: 0.6, endX: 70, endZ: 70, endY: 0.6, length: 42 },
  { id: "diagRail3", startX: 70, startZ: -70, startY: 0.6, endX: 40, endZ: -40, endY: 0.6, length: 42 },
  { id: "diagRail4", startX: -40, startZ: 40, startY: 0.6, endX: -70, endZ: 70, endY: 0.6, length: 42 },

  // Platform level 1 rails
  { id: "platform1Rail1", startX: -78, startZ: -60, startY: 3.5, endX: -42, endZ: -60, endY: 3.5, length: 36 },
  { id: "platform1Rail2", startX: 42, startZ: -60, startY: 3.5, endX: 78, endZ: -60, endY: 3.5, length: 36 },
  { id: "platform1Rail3", startX: -78, startZ: 60, startY: 3.5, endX: -42, endZ: 60, endY: 3.5, length: 36 },
  { id: "platform1Rail4", startX: 42, startZ: 60, startY: 3.5, endX: 78, endZ: 60, endY: 3.5, length: 36 },

  // Platform level 2 rails
  { id: "platform2Rail1", startX: -58, startZ: -45, startY: 6.5, endX: -32, endZ: -45, endY: 6.5, length: 26 },
  { id: "platform2Rail2", startX: 32, startZ: 45, startY: 6.5, endX: 58, endZ: 45, endY: 6.5, length: 26 },

  // Skybridge rails
  { id: "skybridgeRail1", startX: -6, startZ: -35, startY: 6.5, endX: -6, endZ: 35, endY: 6.5, length: 70 },
  { id: "skybridgeRail2", startX: 6, startZ: -35, startY: 6.5, endX: 6, endZ: 35, endY: 6.5, length: 70 },
  { id: "skybridgeRail3", startX: -35, startZ: -6, startY: 6.5, endX: 35, endZ: -6, endY: 6.5, length: 70 },
  { id: "skybridgeRail4", startX: -35, startZ: 6, startY: 6.5, endX: 35, endZ: 6, endY: 6.5, length: 70 },

  // North/South extension rails
  { id: "northRail1", startX: -50, startZ: 120, startY: 0.6, endX: 50, endZ: 120, endY: 0.6, length: 100 },
  { id: "northRail2", startX: 0, startZ: 140, startY: 0.6, endX: 0, endZ: 180, endY: 0.6, length: 40 },
  { id: "southRail1", startX: -50, startZ: -120, startY: 0.6, endX: 50, endZ: -120, endY: 0.6, length: 100 },
  { id: "southRail2", startX: 0, startZ: -180, startY: 0.6, endX: 0, endZ: -140, endY: 0.6, length: 40 },

  // Tunnel rails
  { id: "tunnelRail1", startX: 90, startZ: -15, startY: -1.5, endX: 130, endZ: -15, endY: -1.5, length: 40 },
  { id: "tunnelRail2", startX: 90, startZ: 15, startY: -1.5, endX: 130, endZ: 15, endY: -1.5, length: 40 },
  { id: "tunnelRail3", startX: -130, startZ: -15, startY: -1.5, endX: -90, endZ: -15, endY: -1.5, length: 40 },
  { id: "tunnelRail4", startX: -130, startZ: 15, startY: -1.5, endX: -90, endZ: 15, endY: -1.5, length: 40 },
];

export const TOKENS = [
  // Ground level center
  { id: "token1", x: 0, y: 0.5, z: 0 },
  { id: "token2", x: -70, y: 0.5, z: 0 },
  { id: "token3", x: 70, y: 0.5, z: 0 },
  { id: "token4", x: 0, y: 0.5, z: -70 },
  { id: "token5", x: 0, y: 0.5, z: 70 },

  // Diagonal positions
  { id: "token6", x: -55, y: 0.5, z: -55 },
  { id: "token7", x: 55, y: 0.5, z: 55 },
  { id: "token8", x: 55, y: 0.5, z: -55 },
  { id: "token9", x: -55, y: 0.5, z: 55 },

  // Platform level 1
  { id: "token10", x: -60, y: 4, z: -60 },
  { id: "token11", x: 60, y: 4, z: -60 },
  { id: "token12", x: -60, y: 4, z: 60 },
  { id: "token13", x: 60, y: 4, z: 60 },

  // Platform level 2
  { id: "token14", x: -45, y: 7, z: -45 },
  { id: "token15", x: 45, y: 7, z: 45 },

  // Skybridge
  { id: "token16", x: 0, y: 7, z: 0 },
  { id: "token17", x: 0, y: 7, z: -25 },
  { id: "token18", x: 0, y: 7, z: 25 },
  { id: "token19", x: -25, y: 7, z: 0 },
  { id: "token20", x: 25, y: 7, z: 0 },

  // Extensions
  { id: "token21", x: 0, y: 0.5, z: 130 },
  { id: "token22", x: 0, y: 0.5, z: -130 },
  { id: "token23", x: 0, y: 0.5, z: 180 },
  { id: "token24", x: 0, y: 0.5, z: -180 },

  // Tunnels
  { id: "token25", x: 110, y: -1, z: 0 },
  { id: "token26", x: -110, y: -1, z: 0 },

  // Quarter pipe tops
  { id: "token27", x: -130, y: 4.5, z: 0 },
  { id: "token28", x: 130, y: 4.5, z: 0 },
  { id: "token29", x: 0, y: 4.5, z: 130 },
  { id: "token30", x: 0, y: 4.5, z: -130 },
];

export const CHECKPOINTS = {
  mission19: [
    { id: "cp1", x: -70, y: 0.5, z: 0, radius: 5 },
    { id: "cp2", x: 70, y: 0.5, z: 0, radius: 5 },
    { id: "cp3", x: 0, y: 0.5, z: -70, radius: 5 },
    { id: "cp4", x: 0, y: 0.5, z: 70, radius: 5 },
    { id: "cp5", x: -60, y: 3.5, z: -60, radius: 5 },
    { id: "cp6", x: 60, y: 3.5, z: 60, radius: 5 },
  ],
  mission20: [
    { id: "cp1", x: 0, y: 6.5, z: 0, radius: 8 },
  ],
  mission21: [
    { id: "cp1", x: -45, y: 6.5, z: -45, radius: 10 },
  ],
  mission22: [
    { id: "cp1", x: 0, y: 0.5, z: 0, radius: 18 },
  ],
  mission23: [
    { id: "cp1", x: -80, y: 0.5, z: 0, radius: 4 },
    { id: "cp2", x: 80, y: 0.5, z: 0, radius: 4 },
    { id: "cp3", x: 0, y: 0.5, z: -80, radius: 4 },
    { id: "cp4", x: 0, y: 0.5, z: 80, radius: 4 },
    { id: "cp5", x: -60, y: 3.5, z: -60, radius: 4 },
    { id: "cp6", x: 60, y: 3.5, z: 60, radius: 4 },
    { id: "cp7", x: 0, y: 7, z: 0, radius: 4 },
    { id: "cp8", x: 0, y: 0.5, z: 130, radius: 4 },
    { id: "cp9", x: 0, y: 0.5, z: -130, radius: 4 },
    { id: "cp10", x: 110, y: -1, z: 0, radius: 4 },
  ],
  mission24: [
    { id: "cp1", x: 0, y: 0.5, z: 0, radius: 35 },
  ],
};

export const PROPS = [
  // Neon signs
  { type: "neonSign", x: -88, z: -88, text: "SKATE", color: 0xff00ff },
  { type: "neonSign", x: 88, z: -88, text: "RUSH", color: 0x00ffff },
  { type: "neonSign", x: -88, z: 88, text: "NEON", color: 0xff6b35 },
  { type: "neonSign", x: 88, z: 88, text: "CITY", color: 0x00ff00 },
  { type: "neonSign", x: -46, z: 110, text: "PRO", color: 0xff00ff },
  { type: "neonSign", x: 46, z: 110, text: "ZONE", color: 0x00ffff },
  { type: "neonSign", x: -46, z: -110, text: "TECH", color: 0xff6b35 },
  { type: "neonSign", x: 46, z: -110, text: "HUB", color: 0x00ff00 },

  // Street lights (neon style)
  { type: "streetlight", x: -70, z: 30, color: 0xff00ff },
  { type: "streetlight", x: -70, z: -30, color: 0x00ffff },
  { type: "streetlight", x: 70, z: 30, color: 0xff00ff },
  { type: "streetlight", x: 70, z: -30, color: 0x00ffff },
  { type: "streetlight", x: -30, z: 70, color: 0xff6b35 },
  { type: "streetlight", x: 30, z: -70, color: 0xff6b35 },
  { type: "streetlight", x: 30, z: 70, color: 0x00ff00 },
  { type: "streetlight", x: -30, z: -70, color: 0x00ff00 },
  { type: "streetlight", x: 0, z: 150, color: 0xff00ff },
  { type: "streetlight", x: 0, z: -150, color: 0x00ffff },
  { type: "streetlight", x: 150, z: 0, color: 0xff6b35 },
  { type: "streetlight", x: -150, z: 0, color: 0x00ff00 },

  // Benches
  { type: "bench", x: -52, z: 17, rotation: 0 },
  { type: "bench", x: 52, z: -17, rotation: Math.PI },
  { type: "bench", x: 17, z: -52, rotation: Math.PI / 2 },
  { type: "bench", x: -17, z: 52, rotation: -Math.PI / 2 },

  // Trash bins
  { type: "trash", x: -35, z: 8 },
  { type: "trash", x: 35, z: -8 },
  { type: "trash", x: 8, z: -35 },
  { type: "trash", x: -8, z: 35 },

  // Traffic cones
  { type: "cone", x: -95, z: 10 },
  { type: "cone", x: -95, z: -10 },
  { type: "cone", x: 95, z: 10 },
  { type: "cone", x: 95, z: -10 },
  { type: "cone", x: 10, z: -95 },
  { type: "cone", x: -10, z: -95 },
  { type: "cone", x: 10, z: 95 },
  { type: "cone", x: -10, z: 95 },

  // === Nightlife crowds ===
  // Central plaza
  { type: "pedestrian", x: -15, z: 15, rotation: Math.PI / 4, variant: 0 },
  { type: "pedestrian", x: 15, z: 15, rotation: -Math.PI / 4, variant: 1 },
  { type: "pedestrian", x: -15, z: -15, rotation: Math.PI * 3 / 4, variant: 2 },
  { type: "pedestrian", x: 15, z: -15, rotation: -Math.PI * 3 / 4, variant: 3 },
  { type: "pedestrian", x: -40, z: 0, rotation: Math.PI / 2, variant: 4 },
  { type: "pedestrian", x: 40, z: 0, rotation: -Math.PI / 2, variant: 5 },
  { type: "pedestrian", x: 0, z: -40, rotation: 0, variant: 6 },
  { type: "pedestrian", x: 0, z: 40, rotation: Math.PI, variant: 7 },

  // Near neon signs
  { type: "pedestrian", x: -55, z: 100, rotation: 0, variant: 8 },
  { type: "pedestrian", x: -48, z: 105, rotation: Math.PI / 4, variant: 9 },
  { type: "pedestrian", x: 55, z: 100, rotation: Math.PI, variant: 10 },
  { type: "pedestrian", x: 48, z: 105, rotation: -Math.PI / 4, variant: 11 },
  { type: "pedestrian", x: -55, z: -100, rotation: 0, variant: 12 },
  { type: "pedestrian", x: 55, z: -100, rotation: Math.PI, variant: 13 },

  // On elevated platforms
  { type: "pedestrian", x: -65, z: -65, y: 3, rotation: Math.PI / 4, variant: 14 },
  { type: "pedestrian", x: -55, z: -55, y: 3, rotation: Math.PI / 4, variant: 15 },
  { type: "pedestrian", x: 65, z: -65, y: 3, rotation: -Math.PI / 4, variant: 16 },
  { type: "pedestrian", x: 55, z: -55, y: 3, rotation: -Math.PI / 4, variant: 17 },
  { type: "pedestrian", x: -65, z: 65, y: 3, rotation: Math.PI * 3 / 4, variant: 18 },
  { type: "pedestrian", x: 65, z: 65, y: 3, rotation: -Math.PI * 3 / 4, variant: 19 },

  // High platforms
  { type: "pedestrian", x: 0, z: 0, y: 6, rotation: 0, variant: 20 },
  { type: "pedestrian", x: -5, z: 5, y: 6, rotation: Math.PI / 3, variant: 21 },
  { type: "pedestrian", x: 5, z: -5, y: 6, rotation: -Math.PI / 3, variant: 22 },

  // Tunnel areas
  { type: "pedestrian", x: 75, z: -5, y: -2, rotation: 0, variant: 23 },
  { type: "pedestrian", x: 85, z: 5, y: -2, rotation: Math.PI, variant: 24 },
  { type: "pedestrian", x: -75, z: 5, y: -2, rotation: Math.PI, variant: 25 },
  { type: "pedestrian", x: -85, z: -5, y: -2, rotation: 0, variant: 26 },

  // === Walking nightlife crowds ===
  { type: "walkingPedestrian", x: -80, z: 0, endPosition: [80, 0, 0], speed: 0.9, variant: 27 },
  { type: "walkingPedestrian", x: 80, z: 10, endPosition: [-80, 0, 10], speed: 0.85, variant: 28 },
  { type: "walkingPedestrian", x: 0, z: -80, endPosition: [0, 0, 80], speed: 0.8, variant: 29 },
  { type: "walkingPedestrian", x: 10, z: 80, endPosition: [10, 0, -80], speed: 0.9, variant: 30 },
  { type: "walkingPedestrian", x: -60, z: 90, endPosition: [60, 0, 90], speed: 0.75, variant: 31 },
  { type: "walkingPedestrian", x: 60, z: -90, endPosition: [-60, 0, -90], speed: 0.8, variant: 32 },

  // === Party crowds near clubs/signs ===
  { type: "crowd", x: -50, z: 110, count: 6, radius: 5 },
  { type: "crowd", x: 50, z: 110, count: 5, radius: 4 },
  { type: "crowd", x: -50, z: -110, count: 5, radius: 4 },
  { type: "crowd", x: 50, z: -110, count: 6, radius: 5 },
  { type: "crowd", x: 0, z: 0, count: 4, radius: 4 },
  { type: "crowd", x: -60, z: -60, y: 3, count: 3, radius: 3 },
  { type: "crowd", x: 60, z: -60, y: 3, count: 3, radius: 3 },

  // === Parked cars - nightlife visitors ===
  { type: "car", x: -95, z: 40, rotation: 0, color: 0x000000 },
  { type: "car", x: -95, z: 30, rotation: 0, color: 0x1a1a2e },
  { type: "car", x: -95, z: 20, rotation: 0, color: 0x2a2a3e },
  { type: "car", x: 95, z: -40, rotation: Math.PI, color: 0xff00ff },
  { type: "car", x: 95, z: -30, rotation: Math.PI, color: 0x000000 },
  { type: "car", x: 95, z: -20, rotation: Math.PI, color: 0xffffff },
  { type: "car", x: 40, z: 95, rotation: Math.PI / 2, color: 0x00ffff },
  { type: "car", x: 30, z: 95, rotation: Math.PI / 2, color: 0x1a1a2e },
  { type: "car", x: -40, z: -95, rotation: -Math.PI / 2, color: 0xff6b35 },
  { type: "car", x: -30, z: -95, rotation: -Math.PI / 2, color: 0x000000 },
  { type: "car", x: 130, z: 40, rotation: Math.PI / 2, color: 0x00ff00 },
  { type: "car", x: 130, z: -40, rotation: Math.PI / 2, color: 0x2a2a3e },
  { type: "car", x: -130, z: 40, rotation: -Math.PI / 2, color: 0xffffff },
  { type: "car", x: -130, z: -40, rotation: -Math.PI / 2, color: 0x1a1a2e },

  // === Vans ===
  { type: "van", x: -95, z: 50, rotation: 0, color: 0x1a1a2e },
  { type: "van", x: 95, z: -50, rotation: Math.PI, color: 0x000000 },

  // === Bicycles ===
  { type: "bicycle", x: -75, z: 25, rotation: Math.PI / 4, color: 0xff00ff },
  { type: "bicycle", x: 75, z: -25, rotation: -Math.PI / 4, color: 0x00ffff },
  { type: "bicycle", x: -25, z: 75, rotation: Math.PI * 3 / 4, color: 0xff6b35 },
  { type: "bicycle", x: 25, z: -75, rotation: -Math.PI * 3 / 4, color: 0x00ff00 },

  // === Food carts (late night) ===
  { type: "foodCart", x: -60, z: 95, rotation: Math.PI, cartType: "hotdog" },
  { type: "foodCart", x: 60, z: 95, rotation: Math.PI, cartType: "hotdog" },
  { type: "foodCart", x: -60, z: -95, rotation: 0, cartType: "hotdog" },
  { type: "foodCart", x: 60, z: -95, rotation: 0, cartType: "hotdog" },

  // === ATMs ===
  { type: "atm", x: -55, z: 15, rotation: Math.PI / 2 },
  { type: "atm", x: 55, z: -15, rotation: -Math.PI / 2 },

  // === Lamp posts with neon banners ===
  { type: "lampPostWithBanner", x: -70, z: 0, bannerColor: 0xff00ff, bannerText: "NEON" },
  { type: "lampPostWithBanner", x: 70, z: 0, bannerColor: 0x00ffff, bannerText: "ZONE" },
  { type: "lampPostWithBanner", x: 0, z: 70, bannerColor: 0xff6b35, bannerText: "SKATE" },
  { type: "lampPostWithBanner", x: 0, z: -70, bannerColor: 0x00ff00, bannerText: "FEST" },
];

export const SPAWNS = {
  default: { x: 0, y: 0.1, z: -90, yaw: 0 },
  mission19: { x: -90, y: 0.1, z: 0, yaw: Math.PI / 2 },
  mission20: { x: -60, y: 3.1, z: -60, yaw: Math.PI / 4 },
  mission23: { x: 0, y: 0.1, z: -90, yaw: 0 },
  free: { x: 0, y: 0.1, z: 0, yaw: 0 },
};

export const ENVIRONMENT = {
  skyColor: 0x0a0a1a,
  groundColor: 0x1a1a2e,
  sunPosition: [30, 50, 40],
  sunColor: 0x8080ff,
  sunIntensity: 0.3,
  ambientColor: 0x202040,
  ambientIntensity: 0.3,
  fogColor: 0x0a0a1a,
  fogNear: 60,
  fogFar: 350,
  theme: "neon",
  neonColors: [0xff00ff, 0x00ffff, 0xff6b35, 0x00ff00],
};

export const NEON_LEVEL = {
  id: "neon",
  name: "Neon Downtown",
  district: 4,
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
