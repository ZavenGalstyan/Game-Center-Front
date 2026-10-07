import { useCallback, useEffect, useState, useMemo } from "react";
import { useSearchParams, useOutletContext } from "react-router-dom";
import { api } from "../lib/api.js";
import { useGameTypes } from "../data/gameTypes.jsx";
import { organizeGamesByCategory } from "../lib/gameHelpers.jsx";
import GameCard from "../components/GameCard.jsx";
import GameDiscoveryHero from "../components/GameDiscoveryHero.jsx";
import { Button, LoadingState, EmptyState, CategoryEmptyState, Alert, Section } from "../components/ui";

const PAGE_SIZE = 100; // Load all games for better section organization

export default function GamesPage() {
  const [params] = useSearchParams();
  const typeId = params.get("typeId") || undefined;
  const { byId } = useGameTypes();
  const activeType = typeId ? byId[typeId] : null;
  const context = useOutletContext();
  const searchQuery = context?.searchQuery || "";

  const [games, setGames] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  // Reset and load games whenever the filter changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setGames([]);
    setPagination(null);
    api
      .listGames({ limit: PAGE_SIZE, offset: 0, typeId })
      .then(({ data, pagination }) => {
        if (cancelled) return;
        setGames(data);
        setPagination(pagination);
      })
      .catch((e) => !cancelled && setError(e.message || "Could not load games"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [typeId]);

  const loadMore = useCallback(async () => {
    if (!pagination || pagination.nextOffset === null) return;
    setLoadingMore(true);
    try {
      const { data, pagination: next } = await api.listGames({
        limit: PAGE_SIZE,
        offset: pagination.nextOffset,
        typeId,
      });
      setGames((prev) => [...prev, ...data]);
      setPagination(next);
    } catch (e) {
      setError(e.message || "Could not load more games");
    } finally {
      setLoadingMore(false);
    }
  }, [pagination, typeId]);

  // Filter games by search query
  const filteredGames = useMemo(() => {
    if (!searchQuery.trim()) return games;

    const query = searchQuery.toLowerCase().trim();
    return games.filter((game) => {
      const name = (game.name || "").toLowerCase();
      const description = (game.description || "").toLowerCase();
      const category = (game.type?.name || "").toLowerCase();

      return (
        name.includes(query) ||
        description.includes(query) ||
        category.includes(query)
      );
    });
  }, [games, searchQuery]);

  // Organize games into sections (when showing all games)
  const sections = useMemo(() => {
    if (typeId || searchQuery.trim()) {
      // When filtered by category or search, show as single list
      return null;
    }
    return organizeGamesByCategory(filteredGames);
  }, [filteredGames, typeId, searchQuery]);

  // Page heading
  const heading = activeType
    ? activeType.name
    : searchQuery.trim()
    ? `Search: "${searchQuery}"`
    : "All Games";

  // Show hero only on main games page (no category filter, no search)
  const showHero = !typeId && !searchQuery.trim();

  return (
    <div className="games-page">
      {/* Hero Section */}
      {showHero && <GameDiscoveryHero />}

      {/* Games Content */}
      <div className="games-page__sections">
        {/* Page Header */}
        <div className="games-page__head">
          <h1 className="page-title">{heading}</h1>
          {pagination && (
            <span className="muted">
              {filteredGames.length}
              {searchQuery.trim() && filteredGames.length !== pagination.total
                ? ` of ${pagination.total}`
                : ""}{" "}
              game{filteredGames.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {loading && <LoadingState message="Loading games..." />}
        {error && !loading && <Alert variant="error">{error}</Alert>}

        {!loading && !error && filteredGames.length === 0 && (
          typeId && !searchQuery.trim() ? (
            <CategoryEmptyState />
          ) : (
            <EmptyState
              title={
                searchQuery.trim()
                  ? "No games found"
                  : "No games yet"
              }
              message={
                searchQuery.trim()
                  ? `No games match "${searchQuery}". Try a different search.`
                  : "Check back soon."
              }
            />
          )
        )}

        {/* Sectioned view (when not filtered) */}
        {sections && sections.length > 0 && (
          <div className="games-page__category-sections">
            {sections.map((section, index) => (
              <Section
                key={section.category || index}
                title={section.title}
                spacing={index === sections.length - 1 ? "none" : "lg"}
              >
                <div className="game-grid">
                  {section.games.slice(0, 6).map((game) => (
                    <GameCard key={game.id} game={game} />
                  ))}
                </div>
                {section.games.length > 6 && (
                  <div className="games-page__section-more">
                    <span className="muted">
                      +{section.games.length - 6} more {section.category || ""} games
                    </span>
                  </div>
                )}
              </Section>
            ))}
          </div>
        )}

        {/* Flat view (when filtered by category or search) */}
        {!sections && filteredGames.length > 0 && (
          <>
            <div className="game-grid">
              {filteredGames.map((game) => (
                <GameCard key={game.id} game={game} />
              ))}
            </div>

            {pagination?.hasMore && (
              <div className="load-more">
                <Button
                  variant="ghost"
                  onClick={loadMore}
                  loading={loadingMore}
                >
                  {loadingMore
                    ? "Loading..."
                    : `Load more (${pagination.total - games.length} left)`}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
