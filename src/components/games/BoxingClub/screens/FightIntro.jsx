/**
 * Boxing Club — pre-fight card: YOU vs HIM with records and style, over the
 * venue. ~3 s, skippable with any key or click.
 */
import { useEffect } from "react";
import FighterCanvas from "../components/FighterCanvas.jsx";
import GymBackdrop from "../components/GymBackdrop.jsx";
import { TIERS } from "../data/opponents.js";
import { audio } from "../audio/audio.js";

export default function FightIntro({ player, opponent, record, rounds, reduced, onDone }) {
  useEffect(() => {
    audio.roar(0.4);
    const id = setTimeout(onDone, reduced ? 1600 : 3200);
    const key = (e) => {
      if (["Enter", "Space", "Escape", "KeyJ", "KeyK"].includes(e.code)) {
        e.preventDefault();
        onDone();
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      clearTimeout(id);
      window.removeEventListener("keydown", key);
    };
  }, [onDone, reduced]);
  const tier = TIERS[opponent.tier - 1];
  return (
    <div className="bc-intro" onClick={onDone} role="dialog" aria-label="Fight introduction">
      <GymBackdrop venue={opponent.arena} ring={false} />
      <div className="bc-intro__shade" />
      <div className="bc-intro__venue">{tier.name.toUpperCase()} · {rounds} ROUNDS</div>
      <div className="bc-intro__row">
        <div className="bc-intro__fighter is-left">
          <FighterCanvas look={player.look} facing={1} animate={!reduced} />
          <div className="bc-intro__name">
            <b>{player.name}</b>
            <small>{record}</small>
          </div>
        </div>
        <div className="bc-intro__vs">VS</div>
        <div className="bc-intro__fighter is-right">
          <FighterCanvas look={opponent.look} facing={-1} animate={!reduced} />
          <div className="bc-intro__name">
            <b>{opponent.name}</b>
            <small>“{opponent.nickname}” · {opponent.record} · {opponent.style}</small>
          </div>
        </div>
      </div>
      <p className="bc-intro__skip">Click or press Enter to skip</p>
    </div>
  );
}
