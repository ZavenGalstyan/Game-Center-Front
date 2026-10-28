/**
 * In-game HUD (React, refreshed ~10×/s from a snapshot; the minimap and
 * floating numbers are imperative): portrait + health / magic / XP, the
 * spell hotbar with cooldowns, Protego and the two signature spells, potion
 * counts, quest tracker, minimap, interaction prompt, boss / ally bars,
 * banners, the message feed and screen-edge vignettes.
 */
import { Icon } from "./icons.jsx";

export function Bar({ v, max, lag, cls }) {
  const f = max > 0 ? Math.max(0, Math.min(1, v / max)) : 0;
  const l = lag != null && max > 0 ? Math.max(0, Math.min(1, lag / max)) : 0;
  return (
    <div className={`hwa-bar ${cls || ""}`}>
      {lag != null && <i className="hwa-bar__lag" style={{ width: `${l * 100}%` }} />}
      <i className="hwa-bar__fill" style={{ width: `${f * 100}%` }} />
      <span>
        {Math.ceil(v)} / {Math.round(max)}
      </span>
    </div>
  );
}

function Slot({ s, keyLabel, onClick, touch }) {
  const cdF = s.cdMax > 0 ? Math.min(1, s.cd / s.cdMax) : 0;
  return (
    <button className={`hwa-slot${s.equipped ? " is-on" : ""}${s.noMana ? " is-dry" : ""}${s.active ? " is-active" : ""}`} style={{ "--c": s.color }} onClick={onClick} title={`${s.name}${s.cost ? ` · ${s.cost} magic` : ""}`} tabIndex={-1}>
      <Icon name={s.icon} size={touch ? 20 : 22} />
      {cdF > 0 && <i className="hwa-slot__cd" style={{ height: `${cdF * 100}%` }} />}
      {cdF > 0 && s.cd > 0.6 && <b className="hwa-slot__t">{s.cd.toFixed(s.cd < 3 ? 1 : 0)}</b>}
      {keyLabel && !touch && <kbd>{keyLabel}</kbd>}
    </button>
  );
}

export function Hud({ h, minimapRef, feed, banner, touch, hidden, onSlot }) {
  if (!h) return null;
  return (
    <div className={`hwa-hud${hidden ? " is-hidden" : ""}`}>
      {/* vignettes */}
      <div className="hwa-vig hwa-vig--hurt" style={{ opacity: h.hurtV }} />
      {h.lowHp && <div className="hwa-vig hwa-vig--low" />}
      <div className="hwa-vig hwa-vig--chill" style={{ opacity: h.chill }} />
      {h.edurus > 0 && <div className="hwa-vig hwa-vig--gold" />}

      {/* portrait + bars */}
      <div className="hwa-who">
        <div className={`hwa-crest hwa-crest--${h.house}`}>
          <span>{h.initial}</span>
          <em>{h.level}</em>
        </div>
        <div className="hwa-who__bars">
          <div className="hwa-who__name">
            {h.name}
            {h.sp > 0 && <b className="hwa-pill">+{h.sp} skill point{h.sp > 1 ? "s" : ""}</b>}
          </div>
          <Bar v={h.hp} max={h.maxHp} lag={h.hpLag} cls="hwa-bar--hp" />
          <Bar v={h.mana} max={h.maxMana} cls="hwa-bar--mp" />
          <div className="hwa-xp">
            <i style={{ width: `${Math.min(100, (h.xp / h.xpNext) * 100)}%` }} />
          </div>
          <div className="hwa-buffs">
            {h.buffs.map((b) => (
              <span key={b.id} className={`hwa-buff hwa-buff--${b.kind}`} title={b.label}>
                <Icon name={b.icon} size={13} /> {b.t ? Math.ceil(b.t) : ""}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* minimap + quest tracker */}
      <div className="hwa-right">
        <div className="hwa-mini">
          <canvas ref={minimapRef} width={168} height={168} />
          <span className="hwa-mini__region">{h.region}</span>
        </div>
        {h.quest && (
          <div className="hwa-track">
            <div className="hwa-track__name">
              <Icon name="star" size={12} /> {h.quest.name}
            </div>
            {h.quest.objectives.map((o, i) => (
              <div key={i} className={`hwa-track__obj${o.done ? " is-done" : ""}`}>
                <i>{o.done ? "✓" : "◆"}</i> {o.text}
                {o.of > 1 && !o.done ? ` (${o.n}/${o.of})` : ""}
              </div>
            ))}
            {h.target && (
              <div className="hwa-track__dist">
                {h.target.via ? `Via ${h.target.via} · ` : ""}
                {Math.round(h.target.d)} m
              </div>
            )}
          </div>
        )}
      </div>

      {/* boss / ally */}
      {h.boss && (
        <div className="hwa-boss">
          <div className="hwa-boss__name">{h.boss.name}</div>
          <div className="hwa-boss__bar">
            <i className="hwa-boss__lag" style={{ width: `${(h.boss.lag / h.boss.max) * 100}%` }} />
            <i className="hwa-boss__fill" style={{ width: `${(h.boss.hp / h.boss.max) * 100}%` }} />
            {h.boss.marks?.map((m) => <s key={m} style={{ left: `${m * 100}%` }} />)}
          </div>
          {h.boss.note && <div className="hwa-boss__note">{h.boss.note}</div>}
        </div>
      )}
      {h.ally && (
        <div className="hwa-ally">
          <span>{h.ally.name}</span>
          <div className="hwa-ally__bar">
            <i style={{ width: `${(h.ally.hp / h.ally.max) * 100}%` }} />
          </div>
        </div>
      )}

      {/* crosshair + target */}
      <div className={`hwa-cross${h.aiming ? " is-aim" : ""}${h.targetKind ? ` is-${h.targetKind}` : ""}`}>
        <i />
      </div>
      {h.targetInfo && (
        <div className="hwa-tinfo">
          <span>{h.targetInfo.name}</span>
          {h.targetInfo.max > 0 && (
            <div className="hwa-tinfo__bar">
              <i style={{ width: `${(h.targetInfo.hp / h.targetInfo.max) * 100}%` }} />
            </div>
          )}
          {h.targetInfo.tags && <em>{h.targetInfo.tags}</em>}
        </div>
      )}
      {h.combo > 2 && (
        <div className="hwa-combo" key={h.combo}>
          ×{h.combo} <small>chain</small>
        </div>
      )}

      {/* prompt */}
      {h.focus && !touch && (
        <div className={`hwa-prompt${h.focus.deny ? " is-deny" : ""}`}>
          <kbd>E</kbd> {h.focus.verb} <b>{h.focus.label}</b>
        </div>
      )}

      {/* hotbar */}
      <div className="hwa-hotbar">
        <div className="hwa-hotbar__spells">
          {h.slots.map((s, i) => (
            <Slot key={s.id} s={s} keyLabel={String(i + 1)} touch={touch} onClick={() => onSlot?.(i)} />
          ))}
        </div>
        <div className="hwa-hotbar__abil">
          {h.abil.map((s) => (
            <Slot key={s.key} s={s} keyLabel={s.key} touch={touch} />
          ))}
          <div className="hwa-pots">
            <span title="Wiggenweld (H)">
              <Icon name="potion" size={16} /> {h.potions.heal}
              {!touch && <kbd>H</kbd>}
            </span>
            <span title="Invigoration (G)" className="is-mana">
              <Icon name="potion" size={16} /> {h.potions.mana}
              {!touch && <kbd>G</kbd>}
            </span>
          </div>
        </div>
        <div className="hwa-hotbar__name" style={{ color: h.equippedColor }}>
          {h.equippedName}
          {h.equippedHint && <small> — {h.equippedHint}</small>}
        </div>
      </div>

      {/* feed + banner */}
      <div className="hwa-feed">
        {feed.map((f) => (
          <div key={f.id} className={`hwa-feed__i hwa-feed__i--${f.kind}`}>
            {f.who && <b>{f.who}: </b>}
            {f.text}
          </div>
        ))}
      </div>
      {banner && (
        <div className={`hwa-banner hwa-banner--${banner.kind}`} key={banner.id}>
          {banner.kicker && <small>{banner.kicker}</small>}
          <h2>{banner.title}</h2>
          {banner.sub && <p>{banner.sub}</p>}
        </div>
      )}
    </div>
  );
}
