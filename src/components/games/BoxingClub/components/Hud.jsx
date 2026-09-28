/**
 * Boxing Club — broadcast-style fight HUD. React renders the static frame
 * once; `update(fight)` (called every frame by FightScreen) writes the bar
 * widths and the clock straight to the DOM. The health bar shows the exact
 * logical health; a lighter "damage trail" behind it catches up a moment
 * later so a big hit reads clearly without the bar ever showing a wrong value.
 */
import { forwardRef, useImperativeHandle, useRef } from "react";

function Side({ side, name, sub, refs }) {
  return (
    <div className={`bc-hud__side bc-hud__side--${side}`}>
      <div className="bc-hud__name">
        <b>{name}</b>
        {sub && <small>{sub}</small>}
      </div>
      <div className="bc-hud__bar bc-hud__bar--hp">
        <i className="bc-hud__trail" ref={refs.trail} />
        <i className="bc-hud__fill" ref={refs.hp} />
      </div>
      <div className="bc-hud__bar bc-hud__bar--st" ref={refs.stWrap}>
        <i className="bc-hud__fill" ref={refs.st} />
      </div>
    </div>
  );
}

const Hud = forwardRef(function Hud({ player, opponent, rounds, title }, ref) {
  const p = { hp: useRef(null), trail: useRef(null), st: useRef(null), stWrap: useRef(null) };
  const o = { hp: useRef(null), trail: useRef(null), st: useRef(null), stWrap: useRef(null) };
  const roundRef = useRef(null);
  const clockRef = useRef(null);
  const mem = useRef({ p: { trail: 1, trailT: 0, hp: -1, st: -1, low: null }, o: { trail: 1, trailT: 0, hp: -1, st: -1, low: null }, clock: "", round: "", last: performance.now() });

  useImperativeHandle(ref, () => ({
    update(fight) {
      const now = performance.now();
      const dt = Math.min(100, now - mem.current.last);
      mem.current.last = now;
      for (const [key, f, r] of [["p", fight.player, p], ["o", fight.opponent, o]]) {
        const m = mem.current[key];
        const hp = f.health / f.maxHealth;
        const st = f.stamina / f.maxStamina;
        if (Math.abs(hp - m.hp) > 0.0005) {
          if (hp < m.hp) m.trailT = 450;
          m.hp = hp;
          r.hp.current.style.transform = `scaleX(${hp.toFixed(4)})`;
          r.hp.current.dataset.level = hp < 0.25 ? "low" : hp < 0.5 ? "mid" : "ok";
        }
        if (m.trailT > 0) m.trailT -= dt;
        else if (m.trail > hp) m.trail = Math.max(hp, m.trail - dt / 900);
        if (m.trail < hp) m.trail = hp;
        r.trail.current.style.transform = `scaleX(${m.trail.toFixed(4)})`;
        if (Math.abs(st - m.st) > 0.002) {
          m.st = st;
          r.st.current.style.transform = `scaleX(${st.toFixed(3)})`;
        }
        const low = f.stamina < 20;
        if (low !== m.low) {
          m.low = low;
          r.stWrap.current.classList.toggle("is-low", low);
        }
      }
      const s = Math.ceil(fight.clock / 1000);
      const clock = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
      if (clock !== mem.current.clock) {
        mem.current.clock = clock;
        clockRef.current.textContent = clock;
        clockRef.current.classList.toggle("is-late", s <= 10 && fight.phase === "fight");
      }
      const round = `ROUND ${fight.round}/${rounds}`;
      if (round !== mem.current.round) {
        mem.current.round = round;
        roundRef.current.textContent = round;
      }
    },
  }), [rounds]);

  return (
    <div className="bc-hud" aria-hidden="true">
      <Side side="p" name={player.name} sub={player.recordText} refs={p} />
      <div className="bc-hud__mid">
        {title && <span className="bc-hud__title">{title}</span>}
        <span className="bc-hud__round" ref={roundRef}>ROUND 1/{rounds}</span>
        <span className="bc-hud__clock" ref={clockRef}>1:15</span>
      </div>
      <Side side="o" name={`${opponent.name}`} sub={opponent.nickname ? `“${opponent.nickname}”` : null} refs={o} />
    </div>
  );
});

export default Hud;
