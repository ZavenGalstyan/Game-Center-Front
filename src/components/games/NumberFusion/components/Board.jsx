import Tile from "./Tile.jsx";

/**
 * The board surface. Tiles are absolutely positioned by percentage and keyed
 * by their engine-assigned `id` — a plain slide keeps the same id across a
 * move, so React reuses that DOM node and the CSS `left/top` transition
 * (see NumberFusion.css) animates a real slide "for free". A merge produces
 * a brand-new id, so instead of a slide it gets a "pop" scale-in — see
 * ElementMerge's reveal for the same don't-fight-React philosophy applied
 * to a different game.
 */
export default function Board({ cells, size, spawnedId, mergedIds, reducedMotion }) {
  const tiles = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = cells[r][c];
      if (!cell) continue;
      tiles.push({ ...cell, r, c });
    }
  }

  return (
    <div className={`nf-board${reducedMotion ? " nf-board--reduced" : ""}`} style={{ "--nf-size": size }}>
      <div className="nf-board__grid" aria-hidden="true">
        {Array.from({ length: size * size }).map((_, i) => (
          <div key={i} className="nf-board__cell" />
        ))}
      </div>
      <div className="nf-board__tiles">
        {tiles.map((t) => (
          <Tile
            key={t.id}
            value={t.value}
            r={t.r}
            c={t.c}
            size={size}
            isNew={t.id === spawnedId}
            isMerged={mergedIds.has(t.id)}
          />
        ))}
      </div>
    </div>
  );
}
