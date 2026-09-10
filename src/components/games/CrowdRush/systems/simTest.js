import { LEVELS } from "../data/levels.js";
import { autoPlay } from "./autoplay.js";

let fails = 0;
for (const level of LEVELS) {
  const r = autoPlay(level);
  const ok = r.success;
  if (!ok) fails++;
  console.log(
    `L${String(r.id).padStart(2)} ${ok ? "WIN " : "LOSS"} ` +
    `crowd ${String(r.finalCrowd).padStart(3)}  ${"★".repeat(r.stars).padEnd(3)}  ` +
    `${r.seconds}s  enemies ${r.enemiesDefeated}  ${ok ? "" : "<- " + r.reason}`,
  );
}
console.log(`\n${LEVELS.length - fails}/${LEVELS.length} levels completed by the headless player`);
process.exit(fails ? 1 : 0);
