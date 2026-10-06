/**
 * Lost Toy — the Memories the toy pieces back together. Each unlocks at a
 * total number of Memory Buttons found (150 in the whole game). The scene id
 * picks the little illustration drawn in screens/MemoryArt.jsx.
 */
export const MEMORIES = [
  { id: "shelf", need: 3, title: "The Shelf", scene: "shelf", lines: ["A sunny spot between a wooden train and a stack of picture books.", "That was home."] },
  { id: "tea", need: 9, title: "Tea Party", scene: "tea", lines: ["Tiny cups, a teddy as the guest of honour,", "and pretend cake for everyone."] },
  { id: "rain", need: 18, title: "Rainy Window", scene: "rain", lines: ["Raindrops racing down the glass.", "We cheered for the slow one."] },
  { id: "book", need: 30, title: "Favorite Book", scene: "book", lines: ["The one about the moon.", "Read so often the pages went soft."] },
  { id: "box", need: 45, title: "Toy Box", scene: "box", lines: ["Everyone squeezed in together at night.", "It was never lonely in there."] },
  { id: "garden", need: 60, title: "Garden Day", scene: "garden", lines: ["Grass taller than a tower,", "and a ladybird that waved hello."] },
  { id: "fort", need: 80, title: "Blanket Fort", scene: "fort", lines: ["Two chairs, one blanket, a torch.", "The best castle ever built."] },
  { id: "birthday", need: 100, title: "Birthday", scene: "birthday", lines: ["Candles, wrapping paper, a new friend on the shelf.", "Welcome, little one."] },
  { id: "bedtime", need: 125, title: "Bedtime", scene: "bedtime", lines: ["A goodnight hug and a night light glowing.", "Safe and sound."] },
  { id: "home", need: 150, title: "Home", scene: "home", lines: ["Every button found, every memory whole.", "You were never really lost."] },
];

export function unlockedMemories(totalButtons) {
  return MEMORIES.filter((m) => totalButtons >= m.need).map((m) => m.id);
}
