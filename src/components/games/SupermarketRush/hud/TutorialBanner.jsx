/**
 * Supermarket Rush — Level 1's short, contextual tutorial. No text wall:
 * one short line at a time, driven entirely by what the player has/hasn't
 * done yet (see engine/tasks.js), so it never needs its own state machine
 * kept in sync with the real one.
 */
import { useSyncExternalStore } from "react";

export default function TutorialBanner({ store }) {
  const state = useSyncExternalStore(store.subscribe, store.get);
  if (state.finished) return null;

  let text = "Welcome to your first shift.";
  if (state.heldBox) {
    text = "Follow the red arrow to the shelf, then hold E to restock.";
  } else {
    const remaining = state.tasks.filter((t) => t.type === "restock" && !t.done).length;
    const total = state.tasks.filter((t) => t.type === "restock").length;
    if (remaining === total) text = "Go to the warehouse and press E to pick up a box.";
    else if (remaining > 0) text = "Nicely done! Grab the next box the same way.";
    else text = "All stocked up — nice work!";
  }

  return (
    <div className="sr-tutorial">
      <span>{text}</span>
    </div>
  );
}
