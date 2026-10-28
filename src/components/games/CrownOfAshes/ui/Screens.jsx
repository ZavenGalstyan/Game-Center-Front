/**
 * Dialogue, death, ending and loading screens.
 */
import { useEffect, useState } from "react";
import { LOCATIONS } from "../data/worldmap.js";
import { HEROES } from "../data/heroes.js";
import { Icon } from "./icons.jsx";

export function Dialogue({ d, onNext, onChoose, touch }) {
  const text = d.lines[d.line] || "";
  const [shown, setShown] = useState(0);
  const key = `${d.nodeId}:${d.line}`;
  useEffect(() => {
    setShown(0);
    const id = setInterval(() => setShown((n) => (n >= text.length ? (clearInterval(id), n) : n + 2)), 16);
    return () => clearInterval(id);
  }, [key, text]);
  const done = shown >= text.length;
  const last = d.line >= d.lines.length - 1;
  const showChoices = done && last && d.choices.length > 0;
  return (
    <div className="coa-dlg" onClick={() => (!done ? setShown(text.length) : !showChoices && onNext())}>
      <div className="coa-dlg__box">
        <div className="coa-dlg__who">
          <b>{d.name}</b>
          {d.title && <span>{d.title}</span>}
        </div>
        <p className="coa-dlg__text">{text.slice(0, shown)}</p>
        {showChoices ? (
          <ol className="coa-dlg__choices">
            {d.choices.map((c, i) => (
              <li key={i}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onChoose(i);
                  }}
                >
                  <kbd>{i + 1}</kbd> {c.text}
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <div className="coa-dlg__more">{done ? (touch ? "Tap to continue" : "Space / click to continue") : ""}</div>
        )}
      </div>
    </div>
  );
}

export function Death({ lost, camp, onRise }) {
  return (
    <div className="coa-death">
      <h2>You have fallen</h2>
      <p>The realm is not finished with you yet.</p>
      {lost > 0 && <p className="coa-dim">You lose {lost} gold.</p>}
      <button className="coa-btn coa-btn--primary" onClick={onRise}>
        Rise again{camp ? ` at ${camp}` : ""}
      </button>
    </div>
  );
}

const ENDINGS = {
  wardens: {
    title: "Dawn of the Northern Crown",
    text: "In the spring after the siege, Aveline Thorne knelt in the snow of Wintermere's yard, and Lady Commander Isolde set the Crown of Ashes on her brow, its Heartstone burning gold again. The north held. The south grumbled. The realm endured — stern, cold and whole.",
  },
  ember: {
    title: "The Ember Throne",
    text: "Lady Seraphine Vale named herself Regent of Valdren before the ashes of Wintermere had cooled. Under the Court the roads grew safe, the braziers never went out and the old pact was honoured in every square — and no one dared ask how long a regency lasts.",
  },
  marches: {
    title: "The Broken Crown",
    text: "On a bright morning in Thornwick square, Maren Holt struck the Crown of Ashes with a smith's hammer, and the Heartstone was set in the village well for all to see. Valdren became a quarrelsome, free patchwork of councils and captains — and, for the first time in its history, no one died for a throne.",
  },
};
const DRAGON = {
  freed: "Above it all, a red-gold wyrm circles Cinderpeak at dusk. Vaelith keeps the Old Pact now — not with a king, but with you.",
  slain: "In the hall where the crown was decided hangs the skull of the last dragon of Cinderpeak. Children are told she was a monster. You remember the voice in the Heartstone.",
};
const GARRICK = {
  spared: "Garrick Fenn drills the Thornwick militia — louder than anyone, and braver than most.",
  executed: "The Red Hand never rode again.",
  exiled: "Of Garrick Fenn, nothing more was heard, though a red-hooded sellsword is rumoured far in the south.",
};

export function Ending({ P, onMenu, onFree }) {
  const E = P.ended || {};
  const main = ENDINGS[E.crown] || ENDINGS.wardens;
  const lines = [DRAGON[E.dragon], GARRICK[E.garrick]];
  if (E.locket === "returned") lines.push("Elsie Reed still wears her mother's locket.");
  if (E.locket === "sold" || E.locket === "kept") lines.push("Somewhere in Thornwick, a girl still searches the jetty at Mirror Mere.");
  if (E.companion === "wren") lines.push("Wren went back to the Elderwood, but every winter a grey-fletched arrow is left at your door.");
  if (E.companion === "garrick") lines.push("Garrick tells the tale of the siege in every tavern from here to the fens. It gets longer each time.");
  return (
    <div className="coa-ending">
      <div className="coa-ending__inner">
        <small>Ending</small>
        <h2>{main.title}</h2>
        <p className="coa-ending__main">{main.text}</p>
        {lines.filter(Boolean).map((l) => (
          <p key={l}>{l}</p>
        ))}
        <div className="coa-ending__stats">
          <span>
            {HEROES[P.hero].name} · Level {P.level}
          </span>
          <span>Day {P.day}</span>
          <span>{P.stats.kills} foes defeated</span>
          <span>{P.stats.quests} quests</span>
        </div>
        <div className="coa-ending__buttons">
          <button className="coa-btn coa-btn--primary" onClick={onFree}>
            Keep exploring Valdren
          </button>
          <button className="coa-btn" onClick={onMenu}>
            Return to title
          </button>
        </div>
      </div>
    </div>
  );
}

export function Loading({ p, err, onRetry }) {
  return (
    <div className="coa-loading">
      <Icon name="crown" size={40} />
      <div className="coa-loading__title">Crown of Ashes</div>
      {err ? (
        <>
          <p>{err}</p>
          <button className="coa-btn coa-btn--primary" onClick={onRetry}>
            Retry
          </button>
        </>
      ) : (
        <>
          <div className="coa-loading__bar">
            <b style={{ width: `${Math.round(p * 100)}%` }} />
          </div>
          <div className="coa-dim">Raising the realm of Valdren…</div>
        </>
      )}
    </div>
  );
}

export function campName(id) {
  return LOCATIONS.find((l) => l.id === id)?.name || "";
}
