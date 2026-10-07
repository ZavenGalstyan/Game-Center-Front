/**
 * Dungeon Knight — in-game overlays. The bars and the interaction prompt are
 * written straight to DOM nodes by GameScreen's per-frame hook (no React
 * render per frame); everything else here renders on events only.
 */
import { forwardRef } from "react";
import { Icon, RoomIcon, SlotIcon } from "./icons.jsx";
import { RARITIES, itemById, itemLines, compareLines, salvageValue } from "../data/items.js";
import { ROOM_LABEL } from "../data/dungeons.js";

/** Top-left: HP, stamina, level + XP. Bars are driven via the refs object. */
export function Bars({ refs, level, xpK, gold }) {
  return (
    <div className="dk-bars">
      <div className="dk-bar dk-bar--hp">
        <Icon.heart size={15} />
        <div className="dk-bar__track">
          <i className="dk-bar__lag" ref={(el) => (refs.hpLag = el)} />
          <i className="dk-bar__fill" ref={(el) => (refs.hp = el)} />
        </div>
        <b ref={(el) => (refs.hpText = el)}>100</b>
      </div>
      <div className="dk-bar dk-bar--st">
        <Icon.bolt size={15} />
        <div className="dk-bar__track">
          <i className="dk-bar__fill" ref={(el) => (refs.st = el)} />
        </div>
      </div>
      <div className="dk-lvl">
        <span className="dk-lvl__badge">LV {level}</span>
        <div className="dk-lvl__xp">
          <i style={{ width: `${Math.round(xpK * 100)}%` }} />
        </div>
        <span className="dk-lvl__gold">
          <Icon.coin size={13} /> {gold}
        </span>
      </div>
    </div>
  );
}

/** Top-centre: the room objective, or the boss bar. */
export function Objective({ hud, bossRef }) {
  if (hud.boss) {
    return (
      <div className="dk-boss">
        <div className="dk-boss__name">{hud.boss}</div>
        <div className="dk-boss__track">
          <i className="dk-boss__lag" ref={(el) => (bossRef.lag = el)} />
          <i className="dk-boss__fill" ref={(el) => (bossRef.fill = el)} />
        </div>
      </div>
    );
  }
  return (
    <div className={`dk-objective${hud.done ? " is-done" : ""}`}>
      <span className="dk-objective__room">
        <RoomIcon type={hud.roomType} size={14} /> Room {hud.room} / {hud.rooms}
      </span>
      <b>{hud.objective}</b>
      {hud.total > 0 && !hud.done && (
        <span className="dk-objective__count">
          {hud.total - hud.left} / {hud.total}
        </span>
      )}
    </div>
  );
}

export function Potions({ count, max }) {
  return (
    <div className="dk-potions" aria-label={`${count} potions`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`dk-potion${i < count ? " is-full" : ""}`}>
          <Icon.potion size={18} />
        </span>
      ))}
      <kbd>Q</kbd>
    </div>
  );
}

export function ControlHints({ touch }) {
  if (touch) return null;
  return (
    <div className="dk-hints">
      <span><kbd>LMB</kbd> Attack</span>
      <span><kbd>R</kbd> Heavy</span>
      <span><kbd>RMB</kbd> Block</span>
      <span><kbd>Space</kbd> Dodge</span>
      <span><kbd>Shift</kbd> Sprint</span>
      <span><kbd>E</kbd> Use</span>
    </div>
  );
}

export const Prompt = forwardRef(function Prompt({ touch }, ref) {
  return (
    <div className="dk-prompt" ref={ref} style={{ opacity: 0 }}>
      {!touch && <kbd>E</kbd>}
      <span className="dk-prompt__text" />
    </div>
  );
});

export function Toasts({ toasts }) {
  return (
    <div className="dk-toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`dk-toast dk-toast--${t.tone || "info"}`}>
          {t.icon}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

export function Banner({ banner }) {
  if (!banner) return null;
  return (
    <div className={`dk-banner dk-banner--${banner.kind || "room"}`} key={banner.id}>
      {banner.kicker && <small>{banner.kicker}</small>}
      <b>{banner.title}</b>
      {banner.sub && <span>{banner.sub}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ loot card */
export function LootCard({ loot, equipped, bagFull, onEquip, onKeep, onSalvage, onSwapOut, inventory, equipLabel }) {
  const it = loot.item ? itemById(loot.item) : null;
  const R = it ? RARITIES[it.rarity] : null;
  const eq = it ? itemById(equipped[it.slot]) : null;
  return (
    <div className="dk-loot" role="dialog" aria-label="Treasure">
      <div className="dk-loot__head">
        <Icon.chest size={18} /> {loot.title || "Treasure"}
      </div>
      <div className="dk-loot__gains">
        {loot.gold > 0 && (
          <span className="dk-gain dk-gain--gold">
            <Icon.coin size={14} /> +{loot.gold} gold
          </span>
        )}
        {loot.potion && (
          <span className={`dk-gain dk-gain--potion${loot.potionKept ? "" : " is-muted"}`}>
            <Icon.potion size={14} /> {loot.potionKept ? "+1 potion" : "Potion (pouch full)"}
          </span>
        )}
        {loot.dupe && (
          <span className="dk-gain dk-gain--gold">
            <Icon.coin size={14} /> +{loot.dupe.gold} ({loot.dupe.name} — already owned)
          </span>
        )}
      </div>
      {it && (
        <div className="dk-item" style={{ "--rar": R.color }}>
          <div className="dk-item__icon">
            <SlotIcon slot={it.slot} size={26} />
          </div>
          <div className="dk-item__body">
            <b>{it.name}</b>
            <small style={{ color: R.color }}>{R.name} {it.slot}</small>
            <ul className="dk-item__stats">
              {itemLines(it).map((l) => (
                <li key={l.k}>
                  {l.k} <b>{l.v}</b>
                </li>
              ))}
            </ul>
            {eq && (
              <ul className="dk-item__cmp">
                {compareLines(it, eq).map((c) => (
                  <li key={c.k} className={c.d > 0 ? "is-up" : c.d < 0 ? "is-down" : ""}>
                    {c.d > 0 ? "+" : ""}
                    {c.d}
                    {c.pct ? "%" : ""} {c.k} <small>vs {eq.name}</small>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {it && !bagFull && (
        <div className="dk-loot__actions">
          <button type="button" className="dk-btn dk-btn--primary" onClick={onEquip}>
            <Icon.check size={16} /> Equip
          </button>
          <button type="button" className="dk-btn" onClick={onKeep}>
            <Icon.bag size={16} /> Keep
          </button>
        </div>
      )}
      {it && bagFull && (
        <>
          <p className="dk-loot__warn">Your bag is full. Equip it now, drop something for it, or sell it.</p>
          <div className="dk-loot__actions">
            <button type="button" className="dk-btn dk-btn--primary" onClick={onEquip}>
              <Icon.check size={16} /> {equipLabel || "Equip"}
            </button>
            <button type="button" className="dk-btn" onClick={onSalvage}>
              <Icon.coin size={16} /> Sell +{salvageValue(it)}
            </button>
          </div>
          <div className="dk-loot__swap">
            <small>Drop from bag:</small>
            <div>
              {inventory.map((id) => {
                const b = itemById(id);
                if (!b) return null;
                return (
                  <button key={id} type="button" className="dk-chip" style={{ "--rar": RARITIES[b.rarity].color }} onClick={() => onSwapOut(id)} title={`Drop ${b.name} and keep the new item`}>
                    <SlotIcon slot={b.slot} size={13} /> {b.name}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
      {!it && (
        <div className="dk-loot__actions">
          <button type="button" className="dk-btn dk-btn--primary" onClick={onKeep}>
            <Icon.check size={16} /> Collect
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ cards */
export function DeathCard({ onRetry, onRestart, onLeave }) {
  return (
    <div className="dk-card dk-card--death" role="dialog" aria-label="Defeated">
      <Icon.skull size={34} />
      <h2>Defeated</h2>
      <p>The room resets to how you found it. Your level, gear and gold from earlier rooms are kept.</p>
      <div className="dk-card__actions">
        <button type="button" className="dk-btn dk-btn--primary" onClick={onRetry} autoFocus>
          <Icon.retry size={16} /> Retry Room
        </button>
        <button type="button" className="dk-btn" onClick={onRestart}>
          Restart Dungeon
        </button>
        <button type="button" className="dk-btn dk-btn--ghost" onClick={onLeave}>
          Leave
        </button>
      </div>
    </div>
  );
}

export function PauseCard({ dungeon, roomLabel, onResume, onSettings, onControls, onLeave }) {
  return (
    <div className="dk-card" role="dialog" aria-label="Paused">
      <small className="dk-card__kicker">{dungeon}</small>
      <h2>Paused</h2>
      <p>{roomLabel}</p>
      <div className="dk-card__actions dk-card__actions--col">
        <button type="button" className="dk-btn dk-btn--primary" onClick={onResume} autoFocus>
          <Icon.play size={14} /> Resume
        </button>
        <button type="button" className="dk-btn" onClick={onSettings}>
          <Icon.gear size={16} /> Settings
        </button>
        <button type="button" className="dk-btn" onClick={onControls}>
          <Icon.hand size={16} /> Controls
        </button>
        <button type="button" className="dk-btn dk-btn--ghost" onClick={onLeave}>
          <Icon.door size={16} /> Save &amp; leave dungeon
        </button>
      </div>
    </div>
  );
}

export function CompleteCard({ summary, hasNext, onNext, onSelect, onMenu }) {
  const m = Math.floor(summary.time / 60);
  const s = Math.floor(summary.time % 60);
  return (
    <div className="dk-card dk-card--win" role="dialog" aria-label="Dungeon complete">
      <Icon.crown size={34} />
      <small className="dk-card__kicker">Dungeon complete</small>
      <h2>{summary.name}</h2>
      <div className="dk-summary">
        <div><span>Time</span><b>{m}:{String(s).padStart(2, "0")}</b></div>
        <div><span>Rooms</span><b>{summary.rooms}</b></div>
        <div><span>Enemies</span><b>{summary.enemies}</b></div>
        <div><span>Gold</span><b>{summary.gold}</b></div>
        <div><span>XP</span><b>{summary.xp}</b></div>
        <div><span>Deaths</span><b>{summary.deaths}</b></div>
      </div>
      {summary.unlocked && <p className="dk-card__unlock"><Icon.door size={15} /> {summary.unlocked} is now open.</p>}
      <div className="dk-card__actions">
        {hasNext && (
          <button type="button" className="dk-btn dk-btn--primary" onClick={onNext} autoFocus>
            <Icon.play size={14} /> Next dungeon
          </button>
        )}
        <button type="button" className={`dk-btn${hasNext ? "" : " dk-btn--primary"}`} onClick={onSelect}>
          <Icon.map size={16} /> Dungeons
        </button>
        <button type="button" className="dk-btn dk-btn--ghost" onClick={onMenu}>
          Main menu
        </button>
      </div>
    </div>
  );
}

export function StartGate({ onStart, touch, dungeon, roomLabel }) {
  return (
    <button type="button" className="dk-start" onClick={onStart}>
      <small>{dungeon}</small>
      <b>{touch ? "Tap to begin" : "Click to begin"}</b>
      <span>{roomLabel}</span>
      {!touch && <em>The mouse turns the camera · Esc pauses</em>}
    </button>
  );
}

export function roomObjective(type, cleared, hasChest, chestOpen, shrineUsed) {
  if (type === "treasure") return chestOpen ? "Choose your next door" : "Open the chest";
  if (type === "healing") return shrineUsed ? "Choose your next door" : "Drink from the shrine";
  if (!cleared) return type === "boss" ? "Defeat the guardian" : type === "elite" ? "Defeat the elite" : "Defeat the enemies";
  if (hasChest && !chestOpen) return "Room cleared — open the chest";
  return type === "boss" ? "Leave the dungeon" : "Room cleared — choose a door";
}

export { ROOM_LABEL };
