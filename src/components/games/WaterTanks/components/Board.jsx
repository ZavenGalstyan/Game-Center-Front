/**
 * Water Tanks — the lab counter with its tanks. Pure view: everything it
 * shows comes from the session (engine/session.js) plus the pour phase.
 *
 * Interaction is tap/click only: tap a source, tap a destination. Each tank
 * (and its label below) is one big button; fill taps and drains are their
 * own buttons. Nothing here mutates puzzle state — it reports taps upward.
 */
import { memo, useMemo } from "react";
import TankGlass from "./TankGlass.jsx";
import { Icon } from "./icons.jsx";
import { levelY, pourPose } from "./geometry.js";
import { pourBlockReason, satisfiedTanks, fillBlockReason, drainBlockReason } from "../engine/rules.js";
import { shownAmount } from "../engine/session.js";

function Board({ session, layout, D, settings, uid, onTap, onFixture, compact }) {
  const { level, state, pour, selected, hint, feedback, status } = session;
  const reduced = settings.reducedMotion;
  const phase = pour?.phase ?? null;
  const solvedSet = useMemo(() => (status === "solved" && !pour ? satisfiedTanks(level, state) : new Set()), [status, pour, level, state]);

  const pose = useMemo(() => {
    if (!pour || pour.kind !== "pour" || !layout) return null;
    return pourPose(layout.tanks[pour.from], layout.tanks[pour.to]);
  }, [pour, layout]);

  if (!layout) return null;

  const hintMove = hint?.move ?? null;
  const fb = feedback;

  /* target guide lines per tank */
  const linesFor = (i) => {
    const out = [];
    const seen = new Set();
    level.targets.forEach((t) => {
      const now = shownAmount(session, i);
      if (t.tank === i) out.push({ amount: t.amount, bound: true, met: !pour && now === t.amount });
      else if (t.tank === null && level.tanks[i].capacity >= t.amount && !seen.has(t.amount)) {
        seen.add(t.amount);
        out.push({ amount: t.amount, bound: false, met: !pour && now === t.amount });
      }
    });
    return out;
  };

  /* stream geometry (board px) */
  let stream = null;
  if (pour && (phase === "flow" || phase === "return")) {
    if (pour.kind === "pour" && pose) {
      const dst = layout.tanks[pour.to];
      const bottom = dst.y + Math.min(levelY(dst.geo, pour.before[pour.to], level.tanks[pour.to].capacity), dst.geo.yBottom);
      const sw = Math.max(4, Math.min(11, layout.H * 0.022 + Math.min(4, pour.amount * 0.35)));
      stream = { x: (reduced ? dst.x + dst.w / 2 : pose.spout.x), top: reduced ? dst.y - 10 : pose.spout.y + 2, bottom, w: sw };
    } else if (pour.kind === "fill") {
      const t = layout.tanks[pour.tank];
      const bottom = t.y + Math.min(levelY(t.geo, pour.before[pour.tank], level.tanks[pour.tank].capacity), t.geo.yBottom);
      stream = { x: t.x + t.w / 2, top: tapY(t), bottom, w: Math.max(5, Math.min(12, layout.H * 0.026)) };
    }
  }

  const involved = (i) => pour && (pour.kind === "pour" ? i === pour.from || i === pour.to : i === pour.tank);

  return (
    <div className={`wt-board${pour ? " is-pouring" : ""}${selected !== null ? " has-selection" : ""}`} style={{ "--wt-H": `${layout.H}px` }}>
      {/* counter */}
      <div className="wt-counter" style={{ top: layout.baseY - 2 }}>
        <div className="wt-counter__edge" />
      </div>
      {layout.tanks.map((t, i) => (
        <div key={`glow${i}`} className={`wt-pool${solvedSet.has(i) ? " is-success" : ""}${selected === i ? " is-selected" : ""}`} style={{ left: t.x - t.w * 0.25, width: t.w * 1.5, top: layout.baseY - t.w * 0.12 }} />
      ))}

      {/* fill taps hang from the top of the board */}
      {level.tanks.map((tk, i) => tk.fill ? (
        <div key={`tap${i}`} className={`wt-tap${pour?.kind === "fill" && pour.tank === i ? " is-open" : ""}`} style={{ left: layout.tanks[i].x + layout.tanks[i].w / 2, height: tapY(layout.tanks[i]) }} aria-hidden="true">
          <span className="wt-tap__pipe" />
          <span className="wt-tap__nozzle" />
        </div>
      ) : null)}

      {/* tanks */}
      {level.tanks.map((tk, i) => {
        const t = layout.tanks[i];
        const amountNow = shownAmount(session, i);
        const visualAmount = pour && (phase === "lift" || phase === "move") ? pour.before[i] : state.amounts[i];
        const flowing = pour && phase === "flow" && involved(i);
        const isSource = pour?.kind === "pour" && pour.from === i;
        const isSel = selected === i;
        const locked = !state.unlocked[i];
        let transform = "none";
        let transition = "transform 200ms cubic-bezier(.3,.7,.3,1)";
        let tilt = 0;
        let tiltMs = 0;
        if (isSource && !reduced && pose) {
          if (phase === "lift") {
            transform = `translateY(${-Math.round(layout.H * 0.06)}px)`;
            transition = `transform ${D.lift}ms cubic-bezier(.2,.8,.3,1)`;
          } else if (phase === "move" || phase === "flow") {
            transform = `translate(${pose.dx}px, ${pose.dy}px) rotate(${pose.deg}deg)`;
            transition = `transform ${D.move}ms cubic-bezier(.45,.05,.35,1)`;
            tilt = pose.deg;
            tiltMs = D.move;
          } else if (phase === "return") {
            transition = `transform ${D.ret}ms cubic-bezier(.45,.05,.35,1)`;
            tiltMs = D.ret;
          }
        } else if (isSel) {
          transform = `translateY(${-Math.round(layout.H * 0.035)}px)`;
          transition = "transform 160ms cubic-bezier(.2,.9,.3,1.3)";
        }
        const validDest = selected !== null && !isSel && pourBlockReason(level, state, selected, i) === null;
        const invalidDest = selected !== null && !isSel && !validDest;
        const hintRole = hintMove?.kind === "pour" ? (hintMove.from === i ? 1 : hintMove.to === i ? 2 : 0) : 0;
        const shaking = fb && fb.tank === i;
        const receiveX = pour?.kind === "pour" && pour.to === i && pose ? (reduced ? t.w / 2 : pose.spout.x - t.x) : null;
        const cls = [
          "wt-tank",
          isSel && "is-selected",
          validDest && "is-valid",
          invalidDest && "is-invalid",
          isSource && "is-source",
          locked && "is-locked",
          hintRole && "is-hint",
          solvedSet.has(i) && "is-success",
        ].filter(Boolean).join(" ");
        const label = `Tank ${tk.id}, ${tk.capacity} litre capacity, currently ${amountNow} litre${amountNow === 1 ? "" : "s"}${locked ? ", sealed" : ""}${isSel ? ", selected as source" : ""}`;
        return (
          <div
            key={i}
            className={cls}
            style={{ left: t.x, top: t.y, width: t.w, height: t.h, transform, transition, zIndex: isSource ? 6 : isSel ? 4 : 2 }}
            role="button"
            tabIndex={0}
            aria-label={label}
            aria-pressed={isSel}
            data-tank={i}
            onClick={() => onTap(i)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onTap(i);
              }
            }}
          >
            <div className={`wt-tank__inner${shaking ? " is-shaking" : ""}`} key={shaking ? `s${fb.seq}` : "s"}>
              <TankGlass
                uid={`${uid}-${i}`}
                geo={t.geo}
                capacity={tk.capacity}
                amount={visualAmount}
                tilt={tilt}
                tiltMs={tiltMs}
                waterMs={flowing ? D.flow : 380}
                waterEase={flowing ? "linear" : "cubic-bezier(.3,.7,.3,1)"}
                receiving={Boolean(flowing && pour.kind !== "drain" && (pour.kind === "fill" || pour.to === i))}
                receiveX={receiveX}
                draining={Boolean(flowing && pour.kind === "drain")}
                targets={linesFor(i)}
                showNumbers={settings.measureLabels}
                locked={locked}
                success={solvedSet.has(i)}
              />
            </div>
            {locked && (
              <div className="wt-tank__lock" aria-hidden="true">
                <span className="wt-tank__lock-icon"><Icon.lock /></span>
                {tk.lock && <span className="wt-tank__lock-cond">{level.tanks[tk.lock.tank].id} = {tk.lock.amount} L</span>}
              </div>
            )}
            {!tk.pourOut && <div className="wt-tank__inlet" aria-hidden="true">INLET<br />ONLY</div>}
            {isSel && <div className="wt-tank__chevron" aria-hidden="true"><span>FROM</span></div>}
            {validDest && <div className="wt-tank__drop" aria-hidden="true" />}
            {hintRole > 0 && <div className="wt-tank__hint" aria-hidden="true">{hintRole}</div>}
          </div>
        );
      })}

      {stream && (
        <div
          key={pour.token}
          className={`wt-stream${phase === "return" ? " is-ending" : ""}`}
          style={{ left: stream.x - stream.w / 2, top: stream.top, width: stream.w, height: Math.max(4, stream.bottom - stream.top), "--wt-stream-in": `${Math.min(110, D.flow * 0.25)}ms`, "--wt-stream-out": `${Math.max(90, D.ret * 0.6)}ms` }}
          aria-hidden="true"
        >
          <span className="wt-stream__core" />
          {settings.particles && <span className="wt-stream__drop" />}
          {settings.particles && <span className="wt-stream__drop wt-stream__drop--b" />}
        </div>
      )}

      {/* labels + fixtures under the counter */}
      {level.tanks.map((tk, i) => {
        const t = layout.tanks[i];
        const amt = shownAmount(session, i);
        const locked = !state.unlocked[i];
        const bound = level.targets.find((g) => g.tank === i);
        const met = solvedSet.has(i);
        const lw = Math.min(t.slot - 4, Math.max(t.w + 16, compact ? 64 : 84));
        const left = Math.max(2, Math.min(layout.bw - lw - 2, t.x + t.w / 2 - lw / 2));
        return (
          <div key={`lab${i}`} className="wt-label-col" style={{ left, width: lw, top: layout.baseY + 6 }}>
            <button
              type="button"
              tabIndex={-1}
              className={`wt-label${selected === i ? " is-selected" : ""}${met ? " is-met" : ""}${locked ? " is-locked" : ""}`}
              style={{ height: layout.labelH - 6 }}
              onClick={() => onTap(i)}
              aria-hidden="true"
            >
              <span className="wt-label__id">{tk.id}</span>
              <span className="wt-label__amt"><b>{amt}</b><small>/{tk.capacity} L</small></span>
              {bound && <span className={`wt-label__goal${met ? " is-met" : ""}`}><Icon.target />{bound.amount}</span>}
            </button>
            {(tk.fill > 0 || tk.drain > 0) && (
              <div className="wt-fixtures" style={{ height: layout.fixtureH }}>
                {tk.fill > 0 && (
                  <FixtureBtn kind="fill" i={i} tk={tk} uses={state.fillLeft[i]} disabled={fillBlockReason(level, state, i) !== null}
                    hinted={hintMove?.kind === "fill" && hintMove.tank === i} onFixture={onFixture} />
                )}
                {tk.drain > 0 && (
                  <FixtureBtn kind="drain" i={i} tk={tk} uses={state.drainLeft[i]} disabled={drainBlockReason(level, state, i) !== null}
                    hinted={hintMove?.kind === "drain" && hintMove.tank === i} onFixture={onFixture} />
                )}
              </div>
            )}
          </div>
        );
      })}

      {level.valves.length > 0 && <Valves level={level} layout={layout} />}
    </div>
  );
}

const tapY = (t) => Math.max(14, t.y - Math.max(18, t.h * 0.12));

function FixtureBtn({ kind, i, tk, uses, disabled, hinted, onFixture }) {
  const IconC = kind === "fill" ? Icon.tap : Icon.drain;
  const usesLabel = uses === Infinity ? "" : `×${uses}`;
  return (
    <button
      type="button"
      className={`wt-fixture wt-fixture--${kind}${hinted ? " is-hint" : ""}`}
      aria-disabled={disabled}
      onClick={() => onFixture(kind, i)}
      aria-label={`${kind === "fill" ? "Fill" : "Drain"} tank ${tk.id}${uses === Infinity ? "" : `, ${uses} use${uses === 1 ? "" : "s"} left`}`}
    >
      <IconC />
      <span>{kind === "fill" ? "FILL" : "DRAIN"}</span>
      {usesLabel && <em>{usesLabel}</em>}
    </button>
  );
}

/** One-way valves: pipes under the label row, flow chevrons and a "wheel  A → B" tag. */
function Valves({ level, layout }) {
  const { tanks, baseY, labelH, fixtureH, bw } = layout;
  const y0 = baseY + labelH + fixtureH + 2;
  const step = layout.valveH / level.valves.length;
  return (
    <svg className="wt-valves" width={bw} height={layout.valveH + 2} style={{ top: y0 - 2 }} aria-hidden="true">
      {level.valves.map((v, k) => {
        const a = tanks[v.from];
        const b = tanks[v.to];
        const ax = a.x + a.w / 2 + (k ? 8 : -8);
        const bx = b.x + b.w / 2 + (k ? 8 : -8);
        const y = step * (k + 0.55);
        const dir = bx > ax ? 1 : -1;
        const mid = (ax + bx) / 2;
        const d = `M${ax},0 V${y - 5} Q${ax},${y} ${ax + dir * 5},${y} H${bx - dir * 5} Q${bx},${y} ${bx},${y - 5} V0`;
        const chev = (x) => `M${x - dir * 3},${y - 4} l${dir * 4},4 l${-dir * 4},4`;
        const tagW = 58;
        return (
          <g key={k} className="wt-valve">
            <path className="wt-valve__pipe" d={d} />
            <path className="wt-valve__flow" d={d} />
            {[0.2, 0.8].map((f) => <path key={f} className="wt-valve__chev" d={chev(ax + (bx - ax) * f)} />)}
            <g transform={`translate(${mid - tagW / 2} ${y - 8})`}>
              <rect className="wt-valve__tag" width={tagW} height={16} rx={8} />
              <circle className="wt-valve__wheel" cx={9} cy={8} r={5} />
              <path className="wt-valve__spokes" d="M6,8 H12 M9,5 V11" />
              <text className="wt-valve__label" x={36} y={11.5} textAnchor="middle">{`${level.tanks[v.from].id} → ${level.tanks[v.to].id}`}</text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

export default memo(Board);
