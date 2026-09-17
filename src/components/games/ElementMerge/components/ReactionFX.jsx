/**
 * Element Merge — lightweight reaction particles. Plain CSS-animated <span>
 * elements (no per-frame React state, no canvas needed at this scale) —
 * each burst is a handful of pooled nodes that remove themselves via
 * onAnimationEnd. Capped particle count keeps hundreds of combinations in a
 * session cheap (see the "no particle buildup" performance requirement).
 */
const FAMILY_PARTICLE_COUNT = { energy: 10, cosmic: 9, fluid: 7, air: 6, mineral: 6, organic: 7, creature: 6, human: 5, mechanical: 6 };

export default function ReactionFX({ bursts, onDone, quality = "medium" }) {
  return (
    <div className="em-fx-layer" aria-hidden="true">
      {bursts.map((b) => {
        const baseCount = FAMILY_PARTICLE_COUNT[b.family] || 6;
        const count = quality === "low" ? Math.ceil(baseCount / 2) : quality === "high" ? baseCount + 3 : baseCount;
        return (
          <div key={b.id} className={`em-fx em-fx--${b.kind}`} style={{ left: `${b.x}%`, top: `${b.y}%` }}>
            <span className={`em-fx-ring em-fx-ring--${b.family || "mineral"}`} />
            {Array.from({ length: count }).map((_, i) => (
              <span
                key={i}
                className={`em-fx-p em-fx-p--${b.family || "mineral"}`}
                style={{ "--i": i, "--n": count }}
                onAnimationEnd={i === count - 1 ? () => onDone(b.id) : undefined}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
