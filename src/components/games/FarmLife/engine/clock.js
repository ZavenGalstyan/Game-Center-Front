/**
 * Farm Life — the one authoritative game clock (spec: "one authoritative
 * game clock... crops/animals/production/weather should use the same
 * game-time source, do not create independent random setIntervals").
 *
 * Plain mutable object ticked once per frame from Scene.jsx's useFrame, not
 * a React store — nothing needs a re-render every tick. Systems that DO need
 * to react to a day changing (HUD) read `day`/`minuteOfDay` off it each
 * render; farmGrid/chicken systems just read `totalMinutes`.
 */
import { GAME_MINUTES_PER_REAL_SECOND, MINUTES_PER_DAY, START_MINUTE_OF_DAY, DAYS_PER_SEASON, SEASONS } from "./constants.js";

export function createClock(saved) {
  const clock = {
    totalMinutes: saved?.totalMinutes ?? START_MINUTE_OF_DAY,
    day: saved?.day ?? 1,
    paused: false,

    tick(dt) {
      if (this.paused || dt <= 0) return;
      this.totalMinutes += dt * GAME_MINUTES_PER_REAL_SECOND;
      this.day = 1 + Math.floor(this.totalMinutes / MINUTES_PER_DAY);
    },

    get minuteOfDay() {
      return Math.floor(this.totalMinutes % MINUTES_PER_DAY);
    },

    get season() {
      const seasonIndex = Math.floor((this.day - 1) / DAYS_PER_SEASON) % SEASONS.length;
      return SEASONS[seasonIndex];
    },

    get seasonDay() {
      return 1 + ((this.day - 1) % DAYS_PER_SEASON);
    },

    formatTime() {
      const m = this.minuteOfDay;
      let h = Math.floor(m / 60);
      const min = Math.floor(m % 60);
      const suffix = h >= 12 ? "PM" : "AM";
      let h12 = h % 12;
      if (h12 === 0) h12 = 12;
      return `${String(h12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${suffix}`;
    },

    serialize() {
      return { totalMinutes: this.totalMinutes, day: this.day };
    },
  };
  return clock;
}
