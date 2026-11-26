/**
 * Placeholder for the games grid while the catalog loads. Cards keep the real
 * card's footprint (same grid, height and silhouette), so nothing shifts when
 * the games arrive. `sectioned` mimics the home page's category sections.
 */
export default function GameGridSkeleton({ sectioned = false, label }) {
  const grid = (
    <div className="game-grid">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="game-card-skeleton">
          <div className="game-card-skeleton__art" />
          <div className="game-card-skeleton__body">
            <span className="skeleton-line skeleton-line--title" />
            <span className="skeleton-line skeleton-line--tag" />
            <span className="skeleton-line" />
            <span className="skeleton-line skeleton-line--short" />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="games-skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="gc-visually-hidden">{label}</span>
      {sectioned
        ? [0, 1].map((i) => (
            <div key={i} className="games-skeleton__section">
              <span className="skeleton-line skeleton-line--heading" />
              {grid}
            </div>
          ))
        : grid}
    </div>
  );
}
