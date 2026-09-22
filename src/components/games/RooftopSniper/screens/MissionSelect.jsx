/**
 * Rooftop Sniper — Mission Select: all 6 locations / 60 mission slots.
 * A tile is playable only when it's unlocked (`state.unlockedMission`) AND
 * actually built (`data/missions.js` — only Mission 1 right now). Unlocked-
 * but-unbuilt tiles show "Coming soon" so the full 60-mission structure is
 * visible without claiming content that doesn't exist yet.
 */
import { LOCATIONS } from "../data/locations.js";
import { missionsForLocation, isMissionBuilt } from "../data/missions.js";
import { missionBest } from "../engine/storage.js";

export default function MissionSelect({ state, onPick, onBack }) {
  return (
    <div className="rs-select">
      <header className="rs-select__header">
        <button type="button" className="rs-btn rs-btn--icon" onClick={onBack}>&larr;</button>
        <h1>MISSIONS</h1>
        <div />
      </header>

      <div className="rs-select__locations">
        {LOCATIONS.map((loc) => {
          const missions = missionsForLocation(loc.id);
          const locUnlocked = state.unlockedMission >= loc.range[0];
          return (
            <section key={loc.id} className={`rs-select__location${locUnlocked ? "" : " rs-select__location--locked"}`}>
              <div className="rs-select__location-head" style={{ "--accent": loc.accent }}>
                <h2>{loc.name}</h2>
                <p>{loc.tagline}</p>
              </div>
              <div className="rs-select__grid">
                {missions.map((m) => {
                  const unlocked = state.unlockedMission >= m.id;
                  const built = isMissionBuilt(m.id);
                  const best = missionBest(state, m.id);
                  const playable = unlocked && built;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`rs-tile${playable ? "" : " rs-tile--disabled"}${best.completed ? " rs-tile--done" : ""}`}
                      disabled={!playable}
                      onClick={() => playable && onPick(m.id)}
                      title={!unlocked ? "Locked" : !built ? "Coming soon" : m.name}
                    >
                      <span className="rs-tile__num">{m.id}</span>
                      {!unlocked && <span className="rs-tile__lock">&#128274;</span>}
                      {unlocked && !built && <span className="rs-tile__soon">SOON</span>}
                      {best.completed && (
                        <span className="rs-tile__stars">
                          {"★".repeat(best.stars)}
                          {"☆".repeat(3 - best.stars)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
