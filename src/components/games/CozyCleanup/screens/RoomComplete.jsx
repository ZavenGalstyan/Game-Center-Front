/**
 * Cozy Cleanup — Room Complete. The before/after reveal is the moment;
 * everything else here is a quiet summary underneath it.
 */
import { useEffect } from "react";
import BeforeAfter from "../components/BeforeAfter.jsx";
import { sfx } from "../engine/sound.js";

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function RoomComplete({ room, result, hasNext, soundEnabled, onNext, onReplay, onRoomSelect }) {
  useEffect(() => {
    const t = setTimeout(() => {
      for (let i = 0; i < result.stars; i++) setTimeout(() => sfx.star(soundEnabled), i * 160);
    }, 900);
    return () => clearTimeout(t);
  }, [result.stars, soundEnabled]);

  return (
    <div className="cc-complete">
      <div className="cc-complete__reveal"><BeforeAfter room={room} /></div>
      <div className="cc-complete__panel">
        <h2>Room Complete</h2>
        <p className="cc-complete__name">{room.name}</p>
        <div className="cc-complete__stars">
          {[0, 1, 2].map((i) => (
            <svg key={i} width="30" height="30" viewBox="0 0 24 24" className={i < result.stars ? "cc-star cc-star--on cc-star--big" : "cc-star cc-star--big"}>
              <path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.1 20.9l1.1-6.5L2.5 9.8l6.5-.9z" />
            </svg>
          ))}
        </div>
        <div className="cc-complete__stats">
          <div><span>Cleanliness</span><b>{result.cleanliness}%</b></div>
          <div><span>Organization</span><b>{result.organization}%</b></div>
          <div><span>Time</span><b>{formatTime(result.timeSec)}</b></div>
        </div>
        <div className="cc-complete__actions">
          {hasNext && <button type="button" className="cc-menu__play" onClick={() => { sfx.ui(soundEnabled); onNext(); }}>Next Room</button>}
          <div className="cc-menu__row">
            <button type="button" className="cc-menu__btn" onClick={() => { sfx.ui(soundEnabled); onReplay(); }}>Replay</button>
            <button type="button" className="cc-menu__btn" onClick={() => { sfx.ui(soundEnabled); onRoomSelect(); }}>Room Select</button>
          </div>
        </div>
      </div>
    </div>
  );
}
