/**
 * Lost Toy — names of all 50 levels (the journey home), by world.
 */
export const LEVEL_NAMES = [
  // World 1 — Cozy Bedroom
  "The First Step",
  "Under the Bed",
  "Pillow Mountain",
  "The Bookshelf Climb",
  "Desk Expedition",
  "Toy Train Junction",
  "The Blanket Fort",
  "Windowsill Walk",
  "Wardrobe Heights",
  "The Open Door",
  // World 2 — Giant Kitchen
  "Tile Plains",
  "Under the Table",
  "Chair Tower",
  "Countertop Cliffs",
  "The Dish Rack",
  "Spoon Bridges",
  "Sink Canyon",
  "The Busy Trolley",
  "Fridge Magnets",
  "Cookie Jar Summit",
  // World 3 — Busy Garage
  "Toolbox Town",
  "The Workbench",
  "Paint Can Hop",
  "Tire Tumble",
  "Shelf Scramble",
  "Rolling Wheels",
  "Conveyor Crossing",
  "Bicycle Spokes",
  "The Machine Corner",
  "The Garage Door",
  // World 4 — Backyard Giants
  "Grass Jungle",
  "Stepping Stones",
  "Flower Towers",
  "Puddle Lake",
  "Sprinkler Season",
  "Garden Wagon Ride",
  "Sandbox Dunes",
  "The Windy Fence",
  "Leaf Boats",
  "Under the Old Tree",
  // World 5 — Nighttime Journey
  "Back Door at Dusk",
  "Moonlit Hallway",
  "Sofa Sea",
  "Lamplight Islands",
  "The Sleeping Cat",
  "The Grand Staircase",
  "Bookshelf by Moonlight",
  "Night Light Trail",
  "The Bedroom Door",
  "Home Again",
];

export const levelName = (id) => LEVEL_NAMES[id - 1] || `Level ${id}`;
export const worldOf = (id) => Math.min(5, Math.max(1, Math.ceil(id / 10)));
