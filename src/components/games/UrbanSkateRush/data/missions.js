/**
 * Urban Skate Rush — Mission definitions
 *
 * 30 missions across 5 districts (6 per district)
 */

import { getDistrictForMission } from "./districts.js";

export const MISSION_TYPES = {
  TUTORIAL: "tutorial",
  REACH: "reach",
  COLLECT: "collect",
  TRICK: "trick",
  COMBO: "combo",
  GRIND: "grind",
  TIME: "time",
  COURSE: "course",
  SCORE: "score",
  CHAMPIONSHIP: "championship",
};

export const MISSIONS = [
  // ============================================================
  // DISTRICT 1: Downtown Streets (Missions 1-6)
  // ============================================================
  {
    id: 1,
    name: "First Push",
    district: 1,
    type: MISSION_TYPES.TUTORIAL,
    description: "Learn the basics of urban skateboarding",
    objective: "Follow the tutorial and reach the finish",
    rewards: { coins: 100, stars: 3 },
    requirements: {
      checkpoints: 3,
      tutorial: true,
    },
    spawn: { x: 0, y: 0.1, z: 0, yaw: 0 },
    starThresholds: {
      one: 0, // Complete
      two: 500, // Score 500+
      three: 1000, // Score 1000+
    },
  },
  {
    id: 2,
    name: "Street Jump",
    district: 1,
    type: MISSION_TYPES.TRICK,
    description: "Master the ollie",
    objective: "Perform 5 ollies",
    rewards: { coins: 150, stars: 3 },
    requirements: {
      tricks: { ollie: 5 },
    },
    spawn: { x: 0, y: 0.1, z: 0, yaw: 0 },
    starThresholds: {
      one: 0,
      two: 1000,
      three: 2500,
    },
  },
  {
    id: 3,
    name: "Rail Rookie",
    district: 1,
    type: MISSION_TYPES.GRIND,
    description: "Try your first grind",
    objective: "Grind for 10 meters total",
    rewards: { coins: 200, stars: 3 },
    requirements: {
      grindDistance: 10,
    },
    spawn: { x: 0, y: 0.1, z: 0, yaw: 0 },
    starThresholds: {
      one: 0,
      two: 1500,
      three: 3000,
    },
  },
  {
    id: 4,
    name: "Trick Starter",
    district: 1,
    type: MISSION_TYPES.TRICK,
    description: "Show off your flip tricks",
    objective: "Land a kickflip and a heelflip",
    rewards: { coins: 250, stars: 3 },
    requirements: {
      tricks: { kickflip: 1, heelflip: 1 },
    },
    spawn: { x: 0, y: 0.1, z: 0, yaw: 0 },
    starThresholds: {
      one: 0,
      two: 2000,
      three: 4000,
    },
  },
  {
    id: 5,
    name: "Downtown Dash",
    district: 1,
    type: MISSION_TYPES.TIME,
    description: "Race through the city",
    objective: "Reach all checkpoints before time runs out",
    rewards: { coins: 300, stars: 3 },
    requirements: {
      checkpoints: 5,
      timeLimit: 90,
    },
    spawn: { x: 0, y: 0.1, z: 0, yaw: 0 },
    starThresholds: {
      one: 0,
      two: 2500,
      three: 5000,
    },
  },
  {
    id: 6,
    name: "Plaza Challenge",
    district: 1,
    type: MISSION_TYPES.SCORE,
    description: "Prove your skills in the plaza",
    objective: "Score 5,000 points",
    rewards: { coins: 400, stars: 3 },
    requirements: {
      targetScore: 5000,
    },
    spawn: { x: 0, y: 0.1, z: 0, yaw: 0 },
    starThresholds: {
      one: 5000,
      two: 7500,
      three: 10000,
    },
  },

  // ============================================================
  // DISTRICT 2: Industrial Zone (Missions 7-12)
  // ============================================================
  {
    id: 7,
    name: "Container Park",
    district: 2,
    type: MISSION_TYPES.REACH,
    description: "Navigate the shipping yard",
    objective: "Reach the warehouse loading dock",
    rewards: { coins: 350, stars: 3 },
    requirements: {
      checkpoints: 4,
    },
    spawn: { x: 0, y: 0.1, z: 0, yaw: 0 },
    starThresholds: {
      one: 0,
      two: 3000,
      three: 6000,
    },
  },
  {
    id: 8,
    name: "Metal Rails",
    district: 2,
    type: MISSION_TYPES.GRIND,
    description: "Master industrial grinding",
    objective: "Grind for 25 meters total",
    rewards: { coins: 400, stars: 3 },
    requirements: {
      grindDistance: 25,
    },
    spawn: { x: 0, y: 0.1, z: 0, yaw: 0 },
    starThresholds: {
      one: 0,
      two: 3500,
      three: 7000,
    },
  },
  {
    id: 9,
    name: "Factory Line",
    district: 2,
    type: MISSION_TYPES.COURSE,
    description: "Complete the factory obstacle course",
    objective: "Navigate through all obstacles",
    rewards: { coins: 450, stars: 3 },
    requirements: {
      checkpoints: 6,
      obstacles: true,
    },
    spawn: { x: 0, y: 0.1, z: 0, yaw: 0 },
    starThresholds: {
      one: 0,
      two: 4000,
      three: 8000,
    },
  },
  {
    id: 10,
    name: "Combo Factory",
    district: 2,
    type: MISSION_TYPES.COMBO,
    description: "Chain tricks together",
    objective: "Perform a 5-trick combo",
    rewards: { coins: 500, stars: 3 },
    requirements: {
      comboLength: 5,
    },
    spawn: { x: 0, y: 0.1, z: 0, yaw: 0 },
    starThresholds: {
      one: 0,
      two: 5000,
      three: 10000,
    },
  },
  {
    id: 11,
    name: "Warehouse Rush",
    district: 2,
    type: MISSION_TYPES.TIME,
    description: "Speed through the warehouse district",
    objective: "Complete the route in 75 seconds",
    rewards: { coins: 550, stars: 3 },
    requirements: {
      checkpoints: 7,
      timeLimit: 75,
    },
    spawn: { x: 0, y: 0.1, z: 0, yaw: 0 },
    starThresholds: {
      one: 0,
      two: 5500,
      three: 11000,
    },
  },
  {
    id: 12,
    name: "Industrial Champion",
    district: 2,
    type: MISSION_TYPES.SCORE,
    description: "Dominate the industrial zone",
    objective: "Score 10,000 points",
    rewards: { coins: 600, stars: 3 },
    requirements: {
      targetScore: 10000,
    },
    spawn: { x: 0, y: 0.1, z: 0, yaw: 0 },
    starThresholds: {
      one: 10000,
      two: 15000,
      three: 20000,
    },
  },

  // ============================================================
  // DISTRICT 3: Beachside Boulevard (Missions 13-18)
  // ============================================================
  {
    id: 13,
    name: "Beach Arrival",
    district: 3,
    type: MISSION_TYPES.REACH,
    description: "Explore the beachside",
    objective: "Reach the beach skate park",
    rewards: { coins: 500, stars: 3 },
    requirements: {
      checkpoints: 5,
    },
    spawn: { x: 0, y: 0.1, z: 0, yaw: 0 },
    starThresholds: {
      one: 0,
      two: 6000,
      three: 12000,
    },
  },
  {
    id: 14,
    name: "Boardwalk Grind",
    district: 3,
    type: MISSION_TYPES.GRIND,
    description: "Grind the boardwalk rails",
    objective: "Grind for 40 meters total",
    rewards: { coins: 550, stars: 3 },
    requirements: {
      grindDistance: 40,
    },
    spawn: { x: 0, y: 0.1, z: 0, yaw: 0 },
    starThresholds: {
      one: 0,
      two: 6500,
      three: 13000,
    },
  },
  {
    id: 15,
    name: "Halfpipe Hero",
    district: 3,
    type: MISSION_TYPES.TRICK,
    description: "Master the halfpipe",
    objective: "Perform 3 aerial spins",
    rewards: { coins: 600, stars: 3 },
    requirements: {
      tricks: { spin360: 3 },
    },
    spawn: { x: 0, y: 0.1, z: 0, yaw: 0 },
    starThresholds: {
      one: 0,
      two: 7000,
      three: 14000,
    },
  },
  {
    id: 16,
    name: "Beach Combo",
    district: 3,
    type: MISSION_TYPES.COMBO,
    description: "Chain tricks on the beach",
    objective: "Perform a 7-trick combo",
    rewards: { coins: 650, stars: 3 },
    requirements: {
      comboLength: 7,
    },
    spawn: { x: 0, y: 0.1, z: 0, yaw: 0 },
    starThresholds: {
      one: 0,
      two: 8000,
      three: 16000,
    },
  },
  {
    id: 17,
    name: "Sunset Sprint",
    district: 3,
    type: MISSION_TYPES.TIME,
    description: "Race along the coast",
    objective: "Complete the route in 60 seconds",
    rewards: { coins: 700, stars: 3 },
    requirements: {
      checkpoints: 8,
      timeLimit: 60,
    },
    spawn: { x: 0, y: 0.1, z: 0, yaw: 0 },
    starThresholds: {
      one: 0,
      two: 9000,
      three: 18000,
    },
  },
  {
    id: 18,
    name: "Beach Champion",
    district: 3,
    type: MISSION_TYPES.SCORE,
    description: "Own the beach",
    objective: "Score 20,000 points",
    rewards: { coins: 750, stars: 3 },
    requirements: {
      targetScore: 20000,
    },
    spawn: { x: 0, y: 0.1, z: 0, yaw: 0 },
    starThresholds: {
      one: 20000,
      two: 30000,
      three: 40000,
    },
  },

  // ============================================================
  // DISTRICT 4: Neon Downtown (Missions 19-24)
  // ============================================================
  {
    id: 19,
    name: "Night Arrival",
    district: 4,
    type: MISSION_TYPES.REACH,
    description: "Enter the neon district",
    objective: "Navigate to the rooftop skate spot",
    rewards: { coins: 700, stars: 3 },
    requirements: {
      checkpoints: 6,
    },
    spawn: { x: 0, y: 0.1, z: 0, yaw: 0 },
    starThresholds: {
      one: 0,
      two: 10000,
      three: 20000,
    },
  },
  {
    id: 20,
    name: "Neon Rails",
    district: 4,
    type: MISSION_TYPES.GRIND,
    description: "Grind the glowing rails",
    objective: "Grind for 60 meters total",
    rewards: { coins: 750, stars: 3 },
    requirements: {
      grindDistance: 60,
    },
    spawn: { x: 0, y: 0.1, z: 0, yaw: 0 },
    starThresholds: {
      one: 0,
      two: 12000,
      three: 24000,
    },
  },
  {
    id: 21,
    name: "Rooftop Tricks",
    district: 4,
    type: MISSION_TYPES.TRICK,
    description: "Perform tricks on rooftops",
    objective: "Land 5 different tricks",
    rewards: { coins: 800, stars: 3 },
    requirements: {
      uniqueTricks: 5,
    },
    spawn: { x: 0, y: 0.1, z: 0, yaw: 0 },
    starThresholds: {
      one: 0,
      two: 14000,
      three: 28000,
    },
  },
  {
    id: 22,
    name: "Neon Combo Master",
    district: 4,
    type: MISSION_TYPES.COMBO,
    description: "Chain massive combos",
    objective: "Perform a 10-trick combo",
    rewards: { coins: 850, stars: 3 },
    requirements: {
      comboLength: 10,
    },
    spawn: { x: 0, y: 0.1, z: 0, yaw: 0 },
    starThresholds: {
      one: 0,
      two: 16000,
      three: 32000,
    },
  },
  {
    id: 23,
    name: "Midnight Rush",
    district: 4,
    type: MISSION_TYPES.TIME,
    description: "Race through the neon streets",
    objective: "Complete the route in 50 seconds",
    rewards: { coins: 900, stars: 3 },
    requirements: {
      checkpoints: 10,
      timeLimit: 50,
    },
    spawn: { x: 0, y: 0.1, z: 0, yaw: 0 },
    starThresholds: {
      one: 0,
      two: 18000,
      three: 36000,
    },
  },
  {
    id: 24,
    name: "Neon Champion",
    district: 4,
    type: MISSION_TYPES.SCORE,
    description: "Conquer the night",
    objective: "Score 40,000 points",
    rewards: { coins: 1000, stars: 3 },
    requirements: {
      targetScore: 40000,
    },
    spawn: { x: 0, y: 0.1, z: 0, yaw: 0 },
    starThresholds: {
      one: 40000,
      two: 60000,
      three: 80000,
    },
  },

  // ============================================================
  // DISTRICT 5: Mega Skate City (Missions 25-30)
  // ============================================================
  {
    id: 25,
    name: "Mega Entry",
    district: 5,
    type: MISSION_TYPES.REACH,
    description: "Enter the ultimate skate zone",
    objective: "Reach the championship park",
    rewards: { coins: 900, stars: 3 },
    requirements: {
      checkpoints: 8,
    },
    spawn: { x: 0, y: 0.1, z: 0, yaw: 0 },
    starThresholds: {
      one: 0,
      two: 20000,
      three: 40000,
    },
  },
  {
    id: 26,
    name: "Mega Rails",
    district: 5,
    type: MISSION_TYPES.GRIND,
    description: "Grind the longest rails",
    objective: "Grind for 100 meters total",
    rewards: { coins: 1000, stars: 3 },
    requirements: {
      grindDistance: 100,
    },
    spawn: { x: 0, y: 0.1, z: 0, yaw: 0 },
    starThresholds: {
      one: 0,
      two: 25000,
      three: 50000,
    },
  },
  {
    id: 27,
    name: "Trick Master",
    district: 5,
    type: MISSION_TYPES.TRICK,
    description: "Demonstrate mastery",
    objective: "Land every trick type",
    rewards: { coins: 1100, stars: 3 },
    requirements: {
      allTricks: true,
    },
    spawn: { x: 0, y: 0.1, z: 0, yaw: 0 },
    starThresholds: {
      one: 0,
      two: 30000,
      three: 60000,
    },
  },
  {
    id: 28,
    name: "Mega Combo",
    district: 5,
    type: MISSION_TYPES.COMBO,
    description: "The ultimate combo challenge",
    objective: "Perform a 15-trick combo",
    rewards: { coins: 1200, stars: 3 },
    requirements: {
      comboLength: 15,
    },
    spawn: { x: 0, y: 0.1, z: 0, yaw: 0 },
    starThresholds: {
      one: 0,
      two: 35000,
      three: 70000,
    },
  },
  {
    id: 29,
    name: "Championship Course",
    district: 5,
    type: MISSION_TYPES.COURSE,
    description: "Complete the pro course",
    objective: "Navigate all obstacles perfectly",
    rewards: { coins: 1500, stars: 3 },
    requirements: {
      checkpoints: 12,
      perfectRun: true,
    },
    spawn: { x: 0, y: 0.1, z: 0, yaw: 0 },
    starThresholds: {
      one: 0,
      two: 40000,
      three: 80000,
    },
  },
  {
    id: 30,
    name: "Urban Legend",
    district: 5,
    type: MISSION_TYPES.CHAMPIONSHIP,
    description: "Become the ultimate street skating legend",
    objective: "Score 100,000 points to claim the title",
    rewards: { coins: 2000, stars: 3 },
    requirements: {
      targetScore: 100000,
    },
    spawn: { x: 0, y: 0.1, z: 0, yaw: 0 },
    starThresholds: {
      one: 100000,
      two: 150000,
      three: 200000,
    },
  },
];

// Add district reference to each mission
MISSIONS.forEach((m) => {
  if (!m.district) {
    m.district = getDistrictForMission(m.id);
  }
});

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) || null;
}

export function getMissionsForDistrict(districtId) {
  return MISSIONS.filter((m) => m.district === districtId);
}
