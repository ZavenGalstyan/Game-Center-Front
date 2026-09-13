/**
 * Stonewild — Create World. Name, optional seed (blank = random), difficulty.
 */

import { useState } from "react";
import { DIFFICULTIES } from "../utils/storage.js";

const DIFFICULTY_INFO = {
  peaceful: { label: "Peaceful", blurb: "No hostile creatures. Hunger fades slower. Build and explore freely." },
  survival: { label: "Survival", blurb: "The default Stonewild experience — balanced danger and pace." },
  hard: { label: "Hard", blurb: "Stronger creatures, faster hunger, scarcer loot." },
};

export default function WorldCreate({ onCreate, onBack }) {
  const [name, setName] = useState("");
  const [seed, setSeed] = useState("");
  const [difficulty, setDifficulty] = useState("survival");

  const submit = (e) => {
    e.preventDefault();
    onCreate({ name: name.trim() || "New World", seed, difficulty });
  };

  return (
    <div className="sw-screen sw-panelscreen">
      <form className="sw-panel sw-panel--narrow" onSubmit={submit}>
        <div className="sw-panel__header">
          <h2 className="sw-panel__title">Create World</h2>
          <button type="button" className="sw-btn" onClick={onBack}>Back</button>
        </div>

        <label className="sw-field">
          <span className="sw-field__label">World Name</span>
          <input
            className="sw-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Stonewild"
            maxLength={40}
            autoFocus
          />
        </label>

        <label className="sw-field">
          <span className="sw-field__label">Seed (optional)</span>
          <input
            className="sw-input"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="Leave blank for a random world"
            maxLength={32}
          />
        </label>

        <div className="sw-field">
          <span className="sw-field__label">Difficulty</span>
          <div className="sw-difficulty-grid">
            {DIFFICULTIES.map((d) => (
              <button
                type="button"
                key={d}
                className={`sw-difficulty-card${difficulty === d ? " is-selected" : ""}`}
                onClick={() => setDifficulty(d)}
              >
                <span className="sw-difficulty-card__label">{DIFFICULTY_INFO[d].label}</span>
                <span className="sw-difficulty-card__blurb">{DIFFICULTY_INFO[d].blurb}</span>
              </button>
            ))}
          </div>
        </div>

        <button type="submit" className="sw-btn sw-btn--primary sw-btn--lg sw-panel__cta">
          Create &amp; Play
        </button>
      </form>
    </div>
  );
}
