/** The survival HUD: day + objective, the five resources, danger, tonight's defence, conditions. */
import { memo } from "react";
import { CAPS } from "../engine/rules.js";
import { dayOf, DAY_COUNT } from "../engine/days.js";
import { totalDefense } from "../engine/rules.js";
import { Icon } from "./Icons.jsx";
import { RES_NAME } from "./Card.jsx";

const ORDER = ["food", "water", "power", "scrap"];

/** Resource deltas as icon chips (+2 Food …). Order is stable. */
export function FxChips({ fx, big = false }) {
  const keys = ["hp", ...ORDER, "threat", "defense"].filter((k) => fx && fx[k]);
  if (!keys.length) return null;
  return (
    <span className={`dds-fx ${big ? "big" : ""}`}>
      {keys.map((k) => {
        const v = fx[k];
        const good = k === "threat" ? v < 0 : v > 0;
        return (
          <span key={k} className={`dds-fxc ${good ? "good" : "bad"}`}>
            <Icon name={k} />
            <b>{v > 0 ? `+${v}` : `${v}`}</b>
            <span>{RES_NAME[k]}</span>
          </span>
        );
      })}
    </span>
  );
}

function HudView({ S, pulse, onPause, showActions }) {
  const D = dayOf(S.day);
  const hp = S.res.hp;
  const def = totalDefense(S);
  return (
    <div className="dds-hud">
      <div className="dds-hud-day">
        <div className="dds-hud-dayn">
          <span>Day</span>
          <b>{S.day}</b>
          <i>/ {DAY_COUNT}</i>
        </div>
        <div className="dds-hud-dayt">
          <b>{D.title}</b>
          <span className="dds-hud-obj">{D.objective}</span>
        </div>
      </div>

      <div className="dds-hud-res">
        <div className={`dds-hp ${hp <= 30 ? "low" : ""}`} title={RES_NAME.hp}>
          <Icon name="hp" />
          <span className="dds-hp-bar">
            <i style={{ width: `${hp}%` }} />
          </span>
          <b>{hp}</b>
          {pulse?.hp ? <em key={pulse.n + "hp"} className={pulse.hp > 0 ? "up" : "down"}>{pulse.hp > 0 ? `+${pulse.hp}` : pulse.hp}</em> : null}
        </div>
        {ORDER.map((k) => (
          <div key={k} className={`dds-res r-${k} ${S.res[k] <= 1 ? "low" : ""}`} title={RES_NAME[k]}>
            <Icon name={k} />
            <b>{S.res[k]}</b>
            <i className="dds-res-cap">/{CAPS[k]}</i>
            <span className="dds-res-name">{RES_NAME[k]}</span>
            {pulse?.[k] ? <em key={pulse.n + k} className={pulse[k] > 0 ? "up" : "down"}>{pulse[k] > 0 ? `+${pulse[k]}` : pulse[k]}</em> : null}
          </div>
        ))}
        <div className={`dds-res r-threat ${S.threat >= 6 ? "low" : ""}`} title={RES_NAME.threat}>
          <Icon name="threat" />
          <b>{S.threat}</b>
          <span className="dds-res-name">Danger</span>
        </div>
        <div className="dds-res r-defense" title={RES_NAME.defense}>
          <Icon name="defense" />
          <b>{def}</b>
          <span className="dds-res-name">Defense</span>
        </div>
      </div>

      <div className="dds-hud-right">
        {showActions && (
          <div className="dds-actions" title="Actions left today">
            {[0, 1].map((i) => (
              <i key={i} className={i < S.actions ? "on" : ""} />
            ))}
            <span>Actions</span>
          </div>
        )}
        <button type="button" className="dds-iconbtn" onClick={onPause} aria-label="Pause">
          <Icon name="pause" />
        </button>
      </div>

      <div className="dds-status">
        {S.status.sick > 0 && (
          <span className="dds-chip bad">
            <Icon name="sick" />
            Sick
          </span>
        )}
        {S.status.generatorBroken && (
          <span className="dds-chip bad">
            <Icon name="gen" />
            Generator broken
          </span>
        )}
        {S.status.contaminated && (
          <span className="dds-chip bad">
            <Icon name="toxic" />
            Water contaminated
          </span>
        )}
        {S.fortify > 0 && (
          <span className="dds-chip">
            <Icon name="fortify" />
            Fortified {S.fortify}
          </span>
        )}
        {S.companion && (
          <span className="dds-chip good">
            <Icon name="person" />
            Mara is with you
          </span>
        )}
        {S.flags.radioContact && (
          <span className="dds-chip good">
            <Icon name="radio" />
            Rescue contacted
          </span>
        )}
      </div>
    </div>
  );
}

export const Hud = memo(HudView);
