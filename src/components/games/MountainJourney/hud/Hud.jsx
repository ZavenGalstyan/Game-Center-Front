/**
 * Mountain Journey — the minimal in-level HUD: level + objective (top left),
 * badges found + time (top right), an interaction prompt (bottom centre),
 * and short toasts (checkpoint, badge, viewpoint, tips). Values are sampled
 * from the game at ~12 Hz; nothing here renders per frame.
 */
import { useEffect, useState } from "react";
import { useSample, fmtTime } from "./useTicker.js";
import { STATE } from "../engine/constants.js";

function BadgeIcon({ on, ghost }) {
  return (
    <span className={`mj-hud__badge${on ? " is-on" : ""}${ghost ? " is-ghost" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
        <path d="M5.5 16.5 10 8.5l2.2 3.6 1.6-2.4 4.7 6.8z" />
      </svg>
    </span>
  );
}

export default function Hud({ game, region, toasts, touch }) {
  const s = useSample(
    () => ({
      t: Math.floor(game.levelTime),
      got: [...game.collected],
      prompt: game.prompt ? `${game.prompt.key || ""}|${game.prompt.text}` : "",
      state: game.state,
    }),
    [game],
  );
  const found = game.foundBefore;
  const [key, text] = s.prompt ? s.prompt.split("|") : [null, null];
  const hidden = s.state === STATE.VIEWPOINT || s.state === STATE.LEVEL_COMPLETE;
  return (
    <div className={`mj-hud${hidden ? " is-quiet" : ""}`}>
      <div className="mj-hud__tl">
        <div className="mj-hud__level">
          <span className="mj-hud__num">{game.def.id}</span>
          <div>
            <div className="mj-hud__name">{game.def.name}</div>
            <div className="mj-hud__obj">{game.def.objective}</div>
          </div>
        </div>
      </div>
      <div className="mj-hud__tr">
        <div className="mj-hud__badges" title="Mountain Badges">
          {[0, 1, 2].map((i) => (
            <BadgeIcon key={i} on={s.got.includes(i) || found.has(i)} ghost={found.has(i) && !s.got.includes(i)} />
          ))}
        </div>
        <div className="mj-hud__time">{fmtTime(s.t)}</div>
      </div>
      {text && !hidden && (
        <div className="mj-hud__prompt">
          {key && <kbd>{touch ? (key === "E" ? "✋" : "⤒") : key}</kbd>}
          <span>{text}</span>
        </div>
      )}
      <div className="mj-hud__toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`mj-toast mj-toast--${t.kind}`} style={{ "--accent": region.accent }}>
            {t.icon && <span className="mj-toast__icon">{t.icon}</span>}
            <div>
              <div className="mj-toast__title">{t.title}</div>
              {t.sub && <div className="mj-toast__sub">{t.sub}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Full-stage fade used for respawns (driven from the game, no React per frame). */
export function Fade({ game }) {
  const [o, setO] = useState(0);
  useEffect(() => {
    let raf = 0;
    let alive = true;
    const loop = () => {
      if (!alive) return;
      const R = game.respawn;
      const F = game.fall;
      let v = 0;
      if (R) v = 1 - Math.abs(R.t / 0.75 - 0.5) * 2;
      else if (F) v = Math.min(0.6, F.t * 1.2);
      v = Math.max(0, Math.min(1, v));
      setO((p) => (Math.abs(p - v) > 0.02 ? v : p));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const id = setInterval(loop, 100); // hidden tabs still update
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, [game]);
  return <div className="mj-fade" style={{ opacity: o }} />;
}
