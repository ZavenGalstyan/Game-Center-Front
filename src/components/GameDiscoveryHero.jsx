import { Button } from "./ui";

/**
 * GameDiscoveryHero - Main hero/banner for the games discovery page.
 *
 * Uses the existing global Hero tokens from the design system.
 * Includes eyebrow, title, description, and CTA.
 */
export default function GameDiscoveryHero({ onExplore }) {
  const handleExplore = () => {
    // Scroll to games section
    const gamesSection = document.querySelector(".games-page__sections");
    if (gamesSection) {
      gamesSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // Also call onExplore callback if provided
    if (onExplore) {
      onExplore();
    }
  };

  return (
    <section className="hero game-discovery-hero">
      {/* Background artwork overlay */}
      <div className="game-discovery-hero__bg" aria-hidden="true">
        <div className="game-discovery-hero__gradient" />
      </div>

      {/* Content */}
      <div className="game-discovery-hero__content">
        <p className="hero__eyebrow">Discover New Worlds</p>
        <h1 className="hero__title">
          <span className="hero__title-line">Play Beyond</span>
          <span className="hero__title-accent">Limits</span>
        </h1>
        <p className="hero__lead">
          Discover games and find your next favorite.
        </p>
        <div className="hero__actions">
          <Button variant="primary" size="lg" onClick={handleExplore}>
            Explore Games
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Button>
        </div>
      </div>
    </section>
  );
}
