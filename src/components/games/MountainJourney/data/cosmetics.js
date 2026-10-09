/**
 * Mountain Journey — explorer cosmetics. Purely visual; unlocked by
 * progression (levels completed / badges found). No stats, no purchases.
 */

export const COSMETICS = {
  jacket: [
    { id: "#c8452f", name: "Ember Red", req: null },
    { id: "#2f6fa8", name: "Lake Blue", req: null },
    { id: "#e0a531", name: "Sunrise Gold", req: { levels: 3 } },
    { id: "#3f7f4f", name: "Pine Green", req: { levels: 6 } },
    { id: "#7a4fa0", name: "Twilight", req: { badges: 15 } },
    { id: "#2d3b4f", name: "Storm Navy", req: { levels: 12 } },
    { id: "#d26a8e", name: "Alpenglow", req: { badges: 40 } },
    { id: "#e9e4d8", name: "Snowfield", req: { levels: 24 } },
  ],
  pack: [
    { id: "#4b5a3a", name: "Moss", req: null },
    { id: "#8a4b2a", name: "Canyon", req: null },
    { id: "#2d4f6e", name: "Glacier", req: { levels: 4 } },
    { id: "#b8862f", name: "Brass", req: { badges: 25 } },
    { id: "#5a3d6e", name: "Dusk", req: { levels: 15 } },
    { id: "#2b2b2b", name: "Basalt", req: { levels: 20 } },
  ],
  hat: [
    { id: "none", name: "No Hat", req: null },
    { id: "beanie", name: "Wool Beanie", req: null },
    { id: "cap", name: "Trail Cap", req: { levels: 2 } },
    { id: "bucket", name: "Bucket Hat", req: { badges: 10 } },
    { id: "explorer", name: "Explorer's Hat", req: { levels: 18 } },
  ],
  hatColor: [
    { id: "#7a5a3a", name: "Leather", req: null },
    { id: "#c8452f", name: "Red", req: null },
    { id: "#2f6fa8", name: "Blue", req: { levels: 5 } },
    { id: "#e0a531", name: "Gold", req: { badges: 30 } },
    { id: "#e9e4d8", name: "Cream", req: { levels: 10 } },
  ],
};

export function reqText(req) {
  if (!req) return "Unlocked";
  if (req.levels) return `Complete ${req.levels} levels`;
  if (req.badges) return `Find ${req.badges} badges`;
  return "";
}

export function isUnlocked(req, progress) {
  if (!req) return true;
  if (req.levels && progress.levels < req.levels) return false;
  if (req.badges && progress.badges < req.badges) return false;
  return true;
}
