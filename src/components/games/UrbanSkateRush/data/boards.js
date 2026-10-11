/**
 * Urban Skate Rush — Skateboard definitions
 *
 * Six unique boards with different stats and visual styles.
 */

export const BOARDS = [
  {
    id: "street-classic",
    name: "Street Classic",
    description: "A balanced starter board for all-around skating",
    unlocked: true,
    price: 0,
    stats: {
      speed: 3,
      handling: 3,
      jump: 3,
      grind: 3,
    },
    colors: {
      deck: 0x2d2d2d,
      grip: 0x1a1a1a,
      trucks: 0xc0c0c0,
      wheels: 0xf5f5f5,
    },
    design: "classic",
  },
  {
    id: "speedster",
    name: "Speedster",
    description: "Built for speed with higher acceleration",
    unlocked: false,
    price: 500,
    unlockRequirement: { type: "missions", value: 6 },
    stats: {
      speed: 5,
      handling: 2,
      jump: 3,
      grind: 2,
    },
    colors: {
      deck: 0xff3333,
      grip: 0x1a1a1a,
      trucks: 0xffd700,
      wheels: 0xff6600,
    },
    design: "flames",
  },
  {
    id: "grind-master",
    name: "Grind Master",
    description: "Enhanced stability for longer grinds",
    unlocked: false,
    price: 750,
    unlockRequirement: { type: "grindDistance", value: 100 },
    stats: {
      speed: 3,
      handling: 3,
      jump: 2,
      grind: 5,
    },
    colors: {
      deck: 0x444444,
      grip: 0x1a1a1a,
      trucks: 0x888888,
      wheels: 0x666666,
    },
    design: "industrial",
  },
  {
    id: "air-rider",
    name: "Air Rider",
    description: "Lightweight design for better aerial tricks",
    unlocked: false,
    price: 1000,
    unlockRequirement: { type: "missions", value: 12 },
    stats: {
      speed: 3,
      handling: 4,
      jump: 5,
      grind: 2,
    },
    colors: {
      deck: 0x00bcd4,
      grip: 0x006064,
      trucks: 0xc0c0c0,
      wheels: 0x4dd0e1,
    },
    design: "sky",
  },
  {
    id: "neon-flash",
    name: "Neon Flash",
    description: "High-speed advanced board with neon style",
    unlocked: false,
    price: 1500,
    unlockRequirement: { type: "missions", value: 18 },
    stats: {
      speed: 4,
      handling: 4,
      jump: 4,
      grind: 3,
    },
    colors: {
      deck: 0x1a1a2e,
      grip: 0x0a0a14,
      trucks: 0xe040fb,
      wheels: 0x00ff88,
    },
    design: "neon",
  },
  {
    id: "urban-legend",
    name: "Urban Legend",
    description: "The ultimate board for true street skating legends",
    unlocked: false,
    price: 2500,
    unlockRequirement: { type: "missions", value: 30 },
    stats: {
      speed: 5,
      handling: 5,
      jump: 5,
      grind: 5,
    },
    colors: {
      deck: 0xffd700,
      grip: 0x8b6914,
      trucks: 0xffd700,
      wheels: 0xff6b35,
    },
    design: "legendary",
  },
];

export function boardById(id) {
  return BOARDS.find((b) => b.id === id) || BOARDS[0];
}

export function isBoardUnlocked(progress, boardId) {
  const board = boardById(boardId);
  if (!board) return false;
  if (board.unlocked) return true;
  if (progress.purchasedBoards?.includes(boardId)) return true;
  return false;
}

export function canPurchaseBoard(progress, boardId) {
  const board = boardById(boardId);
  if (!board) return false;
  if (isBoardUnlocked(progress, boardId)) return false;
  if (progress.coins < board.price) return false;

  // Check unlock requirements
  if (board.unlockRequirement) {
    const req = board.unlockRequirement;
    if (req.type === "missions") {
      const completedCount = Object.keys(progress.completed || {}).length;
      if (completedCount < req.value) return false;
    }
    if (req.type === "grindDistance") {
      if ((progress.totalGrindDistance || 0) < req.value) return false;
    }
  }

  return true;
}
