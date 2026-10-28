/**
 * In-game HUD (React, refreshed ~10×/s from a snapshot; the minimap canvas
 * and compass are redrawn imperatively by the shell).
 */
import { Icon } from "./icons.jsx";

const pct = (a, b) => `${Math.max(0, Math.min(100, (a / Math.max(1, b)) * 100))}%`;

function Bar({ v, max, lag, cls, label }) {
  return (
    <div className={`coa-bar ${cls}`}>
      {lag != null && <i className="coa-bar__lag" style={{ width: pct(lag, max) }} />}
      <b style={{ width: pct(v, max) }} />
      <span>{label ?? `${Math.ceil(v)} / ${Math.round(max)}`}</span>
    </div>
  );
}

export function Hud({ h, minimapRef, compassRef, feed, banner, touch, hidden }) {
  if (!h) return null;
  return (
    <div className={`coa-hud${hidden ? " coa-hud--hidden" : ""}`}>
      {/* vitals */}
      <div className="coa-vitals">
        <div className="coa-vitals__crest">
          <Icon name={h.heroIcon} size={22} />
          <em>{h.level}</em>
        </div>
        <div className="coa-vitals__bars">
          <Bar v={h.hp} max={h.maxHp} lag={h.hpLag} cls={`coa-bar--hp${h.lowHp ? " coa-bar--low" : ""}`} />
          <Bar v={h.st} max={h.maxSt} cls="coa-bar--st" label="" />
          <Bar v={h.res} max={h.maxRes} cls="coa-bar--res" label={`${h.resName} ${Math.floor(h.res)}`} />
          <div className="coa-xp" title={`${h.xp} / ${h.xpNext} XP`}>
            <b style={{ width: pct(h.xp, h.xpNext) }} />
          </div>
        </div>
        {h.buffs.length > 0 && (
          <div className="coa-buffs">
            {h.buffs.map((b) => (
              <span key={b.id} className={`coa-buff coa-buff--${b.kind}`} title={b.label}>
                <Icon name={b.icon} size={14} /> {b.t > 0 ? Math.ceil(b.t) : ""}
              </span>
            ))}
          </div>
        )}
        {h.companion && (
          <div className={`coa-comp${h.companion.downed ? " coa-comp--down" : ""}`}>
            <span>{h.companion.name}</span>
            <div className="coa-comp__bar">
              <b style={{ width: pct(h.companion.hp, h.companion.max) }} />
            </div>
          </div>
        )}
      </div>
      {/* compass */}
      <div className="coa-compass" ref={compassRef} />
      {h.region && <div className="coa-region">{h.region}</div>}
      {/* minimap */}
      <div className="coa-mini">
        <canvas ref={minimapRef} width={180} height={180} />
        <div className="coa-mini__info">
          <span title="Time of day">{h.clock}</span>
          <span className="coa-gold">
            <Icon name="coin" size={13} /> {h.gold}
          </span>
        </div>
      </div>
      {/* quest tracker */}
      {h.quest && (
        <div className="coa-tracker">
          <div className="coa-tracker__name">
            <Icon name={h.quest.kind === "main" ? "crown" : "scroll"} size={14} /> {h.quest.name}
          </div>
          {h.quest.objectives.map((o, i) => (
            <div key={i} className={`coa-tracker__obj${o.done ? " is-done" : ""}${o.optional ? " is-opt" : ""}`}>
              <i>{o.done ? "✓" : "◇"}</i> {o.text}
              {o.of ? ` (${o.n}/${o.of})` : ""}
              {o.optional ? " (optional)" : ""}
            </div>
          ))}
          {h.questDist != null && <div className="coa-tracker__dist">{h.questDist} m{h.questVia ? ` · via ${h.questVia}` : ""}</div>}
        </div>
      )}
      {/* boss */}
      {h.boss && (
        <div className="coa-boss">
          <div className="coa-boss__name">{h.boss.name}</div>
          <div className="coa-boss__bar">
            <i style={{ width: pct(h.boss.lag, h.boss.max) }} />
            <b style={{ width: pct(h.boss.hp, h.boss.max) }} />
            {h.boss.marks?.map((m) => (
              <s key={m} style={{ left: `${m * 100}%` }} />
            ))}
          </div>
          {h.boss.note && <div className="coa-boss__note">{h.boss.note}</div>}
        </div>
      )}
      {/* crosshair */}
      <div className={`coa-cross${h.aiming ? " coa-cross--aim" : ""}${h.charge > 0 ? " coa-cross--charge" : ""}`} style={{ "--c": h.charge || 0 }}>
        <i />
      </div>
      {/* interaction prompt */}
      {h.focus && !touch && (
        <div className="coa-prompt">
          <kbd>E</kbd> {h.focus.verb} <b>{h.focus.label}</b>
        </div>
      )}
      {/* hotbar */}
      <div className="coa-hotbar">
        {h.abilities.map((a) => (
          <div key={a.key} className={`coa-skill${a.ready ? " is-ready" : ""}${a.locked ? " is-locked" : ""}`} title={`${a.name} — ${a.desc}`}>
            <Icon name={a.locked ? "lock" : a.icon} size={26} />
            {a.cd > 0 && <div className="coa-skill__cd" style={{ "--p": a.cd / a.cdMax }}>{Math.ceil(a.cd)}</div>}
            {!touch && <kbd>{a.key}</kbd>}
            <small>{a.cost}</small>
          </div>
        ))}
        <div className="coa-hotbar__sep" />
        <div className={`coa-skill coa-skill--potion${h.potions.heal ? "" : " is-empty"}`} title="Healing potion">
          <Icon name="potion" size={24} />
          {!touch && <kbd>1</kbd>}
          <small>{h.potions.heal}</small>
        </div>
        <div className={`coa-skill coa-skill--tonic${h.potions.tonic ? "" : " is-empty"}`} title="Ember Tonic">
          <Icon name="tonic" size={24} />
          {!touch && <kbd>2</kbd>}
          <small>{h.potions.tonic}</small>
        </div>
      </div>
      {h.sp > 0 && !touch && (
        <div className="coa-sp">
          <Icon name="skill" size={14} /> {h.sp} skill point{h.sp > 1 ? "s" : ""} — press <kbd>K</kbd>
        </div>
      )}
      {/* feed */}
      <div className="coa-feed">
        {feed.map((f) => (
          <div key={f.id} className={`coa-feed__i coa-feed__i--${f.kind}`}>
            {f.who && <b>{f.who}: </b>}
            {f.text}
          </div>
        ))}
      </div>
      {banner && (
        <div key={banner.id} className={`coa-banner coa-banner--${banner.kind}`}>
          <small>{banner.kicker}</small>
          <div>{banner.title}</div>
          {banner.sub && <p>{banner.sub}</p>}
        </div>
      )}
    </div>
  );
}

/** Imperative compass strip (headings + objective markers). */
export function drawCompass(el, G) {
  if (!el || !G) return;
  const W = el.clientWidth || 520;
  const fov = Math.PI * 0.9;
  const items = [];
  const heads = [
    ["N", Math.PI],
    ["NE", Math.PI * 0.75],
    ["E", Math.PI / 2],
    ["SE", Math.PI / 4],
    ["S", 0],
    ["SW", -Math.PI / 4],
    ["W", -Math.PI / 2],
    ["NW", -Math.PI * 0.75],
  ];
  const rel = (a) => {
    let d = a - G.camYaw;
    d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    return -d;
  };
  for (const [l, a] of heads) {
    const d = rel(a);
    if (Math.abs(d) < fov / 2) items.push(`<span class="coa-compass__h${l.length > 1 ? " is-minor" : ""}" style="left:${(0.5 + d / fov) * W}px">${l}</span>`);
  }
  const p = G.player;
  for (const m of G.hudMarkers || []) {
    const a = Math.atan2(m.x - p.x, m.z - p.z);
    let d = rel(a);
    const off = Math.abs(d) > fov / 2;
    d = Math.max(-fov / 2, Math.min(fov / 2, d));
    items.push(`<span class="coa-compass__m${m.tracked ? " is-tracked" : ""}${off ? " is-edge" : ""}" style="left:${(0.5 + d / fov) * W}px">◆</span>`);
  }
  el.innerHTML = items.join("");
}
