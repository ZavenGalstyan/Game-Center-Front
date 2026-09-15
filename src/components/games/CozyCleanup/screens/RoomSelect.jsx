/**
 * Cozy Cleanup — Room Select. Cards for every room in every collection.
 * Collection 1 (Cozy Home) is fully playable; Collections 2-5 show as
 * "Coming soon" rather than pretending to have content.
 */
import { Snapshot } from "../components/BeforeAfter.jsx";
import { roomsInCollection } from "../data/rooms.js";
import { COLLECTIONS } from "../data/collections.js";
import { sfx } from "../engine/sound.js";

function Stars({ value }) {
  return (
    <span className="cc-stars">
      {[0, 1, 2].map((i) => (
        <svg key={i} width="13" height="13" viewBox="0 0 24 24" className={i < value ? "cc-star cc-star--on" : "cc-star"}>
          <path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.1 20.9l1.1-6.5L2.5 9.8l6.5-.9z" />
        </svg>
      ))}
    </span>
  );
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export default function RoomSelect({ state, soundEnabled, onPick, onBack }) {
  const cozyHome = roomsInCollection(1);

  return (
    <div className="cc-roomselect">
      <div className="cc-roomselect__head">
        <button type="button" className="cc-hud__exit" onClick={() => { sfx.back(soundEnabled); onBack(); }} aria-label="Back">‹</button>
        <h2>Rooms</h2>
      </div>
      <div className="cc-roomselect__scroll">
        {COLLECTIONS.map((col) => (
          <section key={col.id} className="cc-collection-block" style={{ "--cc-col-accent": col.accent }}>
            <div className="cc-collection-block__head">
              <h3>{col.name}</h3>
              <span>{col.tagline}</span>
            </div>
            {col.available ? (
              <div className="cc-room-grid">
                {(col.id === 1 ? cozyHome : []).map((room) => {
                  const saved = state.rooms[room.id];
                  const unlocked = room.id <= state.unlockedLevel;
                  return (
                    <button
                      type="button"
                      key={room.id}
                      className={`cc-room-card${unlocked ? "" : " cc-room-card--locked"}`}
                      disabled={!unlocked}
                      onClick={() => { sfx.ui(soundEnabled); onPick(room.id); }}
                    >
                      <div className="cc-room-card__preview">
                        <Snapshot room={room} before={!saved?.completed} />
                        {!unlocked && <div className="cc-room-card__lock"><LockIcon /></div>}
                      </div>
                      <div className="cc-room-card__meta">
                        <span className="cc-room-card__name">{room.order}. {room.name}</span>
                        <Stars value={saved?.stars || 0} />
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="cc-collection-block__soon">Coming soon &mdash; {LEVELS_LABEL[col.id]}</div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

const LEVELS_LABEL = { 2: "levels 11-20", 3: "levels 21-30", 4: "levels 31-40", 5: "levels 41-50" };
