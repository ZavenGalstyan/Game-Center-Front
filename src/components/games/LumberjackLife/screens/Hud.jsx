/**
 * Lumberjack Life — gameplay HUD. Deliberately small:
 *   top-left   current order (objectives with progress)
 *   top-right  money + region (+ pause button)
 *   centre     contextual: what you're aiming at (tree / trunk + cut progress)
 *              and what E / F will do right now
 *   bottom     current tool, carried log, cart / vehicle load, mill status
 * Plus a one-line tutorial hint, toasts and the order-complete banner.
 * Fed by GameScreen at ~8 Hz — never re-rendered per frame.
 */
import { toolById } from "../data/equipment.js";

const money = (n) => `$${Math.round(n).toLocaleString()}`;

function Bar({ value, tone = "wood" }) {
  return (
    <span className={`ll-bar ll-bar--${tone}`}>
      <span className="ll-bar__fill" style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
    </span>
  );
}

function ToolIcon({ kind }) {
  if (kind === "chainsaw") {
    return (
      <svg viewBox="0 0 32 32" className="ll-icon" aria-hidden="true">
        <rect x="3" y="11" width="11" height="10" rx="2.5" fill="currentColor" opacity="0.9" />
        <path d="M14 14h13a2.5 2.5 0 0 1 0 5H14z" fill="currentColor" opacity="0.55" />
        <path d="M6 11c0-3 2-5 5-5" stroke="currentColor" strokeWidth="2" fill="none" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32" className="ll-icon" aria-hidden="true">
      <path d="M8 28 22 8" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M18 5c4 0 8 2 9 6-3 1-6 0-8-2z" fill="currentColor" />
    </svg>
  );
}

export default function Hud({ hud, region, settings, touch, onPause, toasts, banner }) {
  const tool = toolById(hud.tool);
  const o = hud.order;
  const tg = hud.target;
  const pr = hud.prompt;
  const veh = hud.vehicle;
  return (
    <div className="ll-hud" aria-live="polite">
      {/* order */}
      {o && (
        <div className={`ll-order${o.ready ? " ll-order--ready" : ""}`}>
          <div className="ll-order__head">
            <span className="ll-order__name">{o.order.name}</span>
            <span className="ll-order__reward">{money(o.order.reward)}</span>
          </div>
          <div className="ll-order__client">{o.order.client}</div>
          {o.lines.map((l, i) => (
            <div key={i} className={`ll-order__line${l.done ? " is-done" : ""}`}>
              <span className="ll-order__check">{l.done ? "✓" : ""}</span>
              <span className="ll-order__label">{l.label}</span>
              <span className="ll-order__count">{l.have}/{l.n}</span>
            </div>
          ))}
          {o.ready && <div className="ll-order__go">Ready — hand it in at the order board</div>}
        </div>
      )}

      {/* money + region */}
      <div className="ll-topright">
        <div className="ll-money">{money(hud.money)}</div>
        <div className="ll-region">{region.name}</div>
        <button type="button" className="ll-iconbtn" onClick={onPause} aria-label="Pause">
          <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="4" width="3.4" height="12" rx="1" fill="currentColor" /><rect x="11.6" y="4" width="3.4" height="12" rx="1" fill="currentColor" /></svg>
        </button>
      </div>

      {/* tutorial */}
      {hud.tutorial && settings.controlHelp && <div className="ll-hint">{hud.tutorial.text}</div>}

      {/* contextual target + prompt */}
      <div className="ll-context">
        {tg && (
          <div className={`ll-target${tg.valid ? " is-valid" : ""}`}>
            <span className="ll-target__name">{tg.name}</span>
            <Bar value={tg.progress} tone={tg.kind === "cut" ? "cut" : "wood"} />
            <span className="ll-target__hint">
              {tg.reason
                ? tg.reason
                : tg.kind === "cut"
                  ? `${touch ? "Tap CHOP" : "Click"} the cut mark · ${tg.left} left`
                  : tg.inReach
                    ? `${touch ? "Tap CHOP" : tool.kind === "chainsaw" ? "Hold click" : "Click"} to ${tool.kind === "chainsaw" ? "saw" : "chop"}`
                    : "Step closer"}
            </span>
          </div>
        )}
        {pr && (
          <div className={`ll-prompt${pr.ok ? "" : " is-blocked"}`}>
            <kbd>{touch ? "USE" : "E"}</kbd>
            <span>{pr.label}</span>
            {pr.sub && <em>{pr.sub}</em>}
          </div>
        )}
        {veh && (
          <div className="ll-prompt ll-prompt--veh">
            <kbd>{touch ? "DRIVE" : "F"}</kbd>
            <span>{veh.label}</span>
          </div>
        )}
      </div>

      {/* bottom: tool + loads */}
      <div className="ll-bottom">
        <div className="ll-chip ll-chip--tool">
          <ToolIcon kind={tool.kind} />
          <span>{tool.name}</span>
          {tool.kind === "chainsaw" && <em className={`ll-saw ll-saw--${hud.saw.toLowerCase()}`}>{hud.saw === "OFF" ? "off" : hud.saw === "CUTTING" ? "cutting" : hud.saw === "STARTING" ? "starting…" : "running"}</em>}
        </div>
        {hud.carry && <div className="ll-chip">Carrying a log</div>}
        {hud.driving && (
          <div className="ll-chip">
            {hud.driving.name}: <b>{hud.driving.load}/{hud.driving.cap}</b> logs · {Math.round(hud.driving.speed * 3.6)} km/h
          </div>
        )}
        {!hud.driving && hud.cart && (hud.pulling || hud.cart.load > 0) && <div className="ll-chip">Cart <b>{hud.cart.load}/{hud.cart.cap}</b></div>}
        <div className="ll-chip ll-chip--mill" title="Sawmill: intake deck · timber racks">
          Mill deck <b>{hud.deck}/{hud.deckCap}</b> · racks <b>{hud.storage}/{hud.storeCap}</b>
        </div>
      </div>

      {/* toasts + banner */}
      <div className="ll-toasts">
        {toasts.map((t) => <div key={t.id} className={`ll-toast ll-toast--${t.tone}`}>{t.text}</div>)}
      </div>
      {banner && (
        <div className="ll-banner">
          <div className="ll-banner__title">{banner.title}</div>
          <div className="ll-banner__sub">{banner.sub}</div>
          {banner.unlock && <div className="ll-banner__unlock">{banner.unlock}</div>}
        </div>
      )}
    </div>
  );
}
