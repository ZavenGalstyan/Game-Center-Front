/**
 * Farm Life — the "First Morning" tutorial tracker (spec: "short interactive
 * tutorial... compact objective, not a giant text wall"). Derives the
 * current step from `tutorial` progress flags rather than a rigid step
 * index, so it can't get stuck if the player does things out of order.
 */
const STEPS = [
  { key: "till", label: "Till 3 soil tiles", done: (t) => t.tilledCount >= 3, progress: (t) => `${Math.min(t.tilledCount, 3)}/3` },
  { key: "plant", label: "Plant 3 Wheat Seeds", done: (t) => t.plantedCount >= 3, progress: (t) => `${Math.min(t.plantedCount, 3)}/3` },
  { key: "water", label: "Water your crops", done: (t) => t.watered },
  { key: "harvest", label: "Harvest a mature crop", done: (t) => t.harvested },
  { key: "sell", label: "Sell it at the Shipping Box", done: (t) => t.sold },
  { key: "chicken", label: "Buy a Chicken from the Coop", done: (t) => t.boughtChicken },
  { key: "feed", label: "Feed your Chicken", done: (t) => t.fedChicken },
  { key: "egg", label: "Collect an Egg", done: (t) => t.collectedEgg },
  { key: "sellEgg", label: "Sell the Egg", done: (t) => t.soldEgg },
];

export default function QuestPanel({ tutorial }) {
  if (tutorial.done) return null;
  const current = STEPS.find((s) => !s.done(tutorial));
  if (!current) return null; // all steps complete this render, dismiss next tick
  return (
    <div className="fl-quest">
      <div className="fl-quest__title">First Morning</div>
      <div className="fl-quest__step">
        <span>{current.label}</span>
        {current.progress && <span className="fl-quest__progress">{current.progress(tutorial)}</span>}
      </div>
    </div>
  );
}
