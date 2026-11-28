import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useSearchParams, useOutletContext } from "react-router-dom";
import { useGameTypes } from "../data/gameTypes.jsx";
import {
  cacheEpoch,
  fetchAllGames,
  fetchCategoryGames,
  fetchMoreCategoryGames,
  readCatalog,
  writeCatalog,
} from "../data/catalog.js";
import {
  organizeGamesByCategory,
  getMainCategory,
  getSecondaryCategories,
} from "../lib/gameHelpers.jsx";
import GameCard from "../components/GameCard.jsx";
import GameGridSkeleton from "../components/GameGridSkeleton.jsx";
import CustomGameHero from "../components/custom-game/CustomGameHero.jsx";
import { Button, EmptyState, CategoryEmptyState, Alert, Section } from "../components/ui";
import { useTranslation } from "../i18n/useTranslation.js";
import { gameDescription, gameTitle } from "../i18n/gameInfo.js";

export default function GamesPage() {
  const [params] = useSearchParams();
  const typeId = params.get("typeId") || undefined;
  const { byId } = useGameTypes();
  const activeType = typeId ? byId[typeId] : null;
  const context = useOutletContext();
  const searchQuery = context?.searchQuery || "";
  const { t } = useTranslation();

  // Cached listings paint immediately (no spinner on back-navigation or a
  // repeat visit); stale ones are revalidated in the background.
  const [initial] = useState(() => readCatalog(typeId));
  const [games, setGames] = useState(() => initial?.data.data ?? []);
  const [pagination, setPagination] = useState(() => initial?.data.pagination ?? null);
  const [pageSize, setPageSize] = useState(() => initial?.data.pageSize ?? null);
  const [loading, setLoading] = useState(() => !initial);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  // A failed background refresh: the (older) cached list stays on screen.
  const [refreshError, setRefreshError] = useState(null);
  // Bumped on every filter change so a slow "Load more" for the previous
  // filter can't append to the new one.
  const viewRef = useRef(0);

  // Load (or revalidate) the games whenever the filter changes.
  useEffect(() => {
    const view = ++viewRef.current;
    const cancelled = () => viewRef.current !== view;
    const cached = readCatalog(typeId);
    setError(null);
    setRefreshError(null);
    setLoadingMore(false);
    if (cached) {
      setGames(cached.data.data);
      setPagination(cached.data.pagination);
      setPageSize(cached.data.pageSize ?? null);
      setLoading(false);
      if (cached.fresh) return undefined;
    } else {
      setLoading(true);
      setGames([]);
      setPagination(null);
      setPageSize(null);
    }

    // The unfiltered view groups games into category sections and has no
    // "Load more" button, so it loads the whole catalog. Category views page.
    const epoch = cacheEpoch();
    const load = typeId ? fetchCategoryGames(typeId) : fetchAllGames({ isCancelled: cancelled });
    load
      .then((res) => {
        if (!res) return;
        writeCatalog(typeId, res, epoch);
        if (cancelled()) return;
        setGames(res.data);
        setPagination(res.pagination);
        setPageSize(res.pageSize ?? null);
      })
      .catch((e) => {
        if (cancelled()) return;
        if (cached) setRefreshError(e.message || "Could not load games");
        else setError(e.message || "Could not load games");
      })
      .finally(() => !cancelled() && setLoading(false));
    return () => {
      viewRef.current += 1;
    };
  }, [typeId]);

  const loadMore = useCallback(async () => {
    if (!pagination || pagination.nextOffset == null) return;
    const view = viewRef.current;
    setLoadingMore(true);
    try {
      const { data, pagination: next } = await fetchMoreCategoryGames(typeId, {
        offset: pagination.nextOffset,
        pageSize: pageSize || pagination.limit,
      });
      if (viewRef.current !== view) return;
      // The backend orders category pages main-first; guard against a game
      // shifting between pages (e.g. created meanwhile) showing up twice.
      setGames((prev) => {
        const seen = new Set(prev.map((g) => g.id));
        return [...prev, ...data.filter((g) => !seen.has(g.id))];
      });
      setPagination(next);
    } catch (e) {
      if (viewRef.current === view) setError(e.message || "Could not load more games");
    } finally {
      if (viewRef.current === view) setLoadingMore(false);
    }
  }, [pagination, pageSize, typeId]);

  // Filter games by search query
  const filteredGames = useMemo(() => {
    if (!searchQuery.trim()) return games;

    const query = searchQuery.toLowerCase().trim();
    return games.filter((game) => {
      const name = `${game.name || ""} ${gameTitle(game)}`.toLowerCase();
      const description = `${game.description || ""} ${gameDescription(game)}`.toLowerCase();
      const categories = [getMainCategory(game), ...getSecondaryCategories(game)].map((c) =>
        `${c?.name || ""} ${t(c?.name || "")}`.toLowerCase()
      );

      return (
        name.includes(query) ||
        description.includes(query) ||
        categories.some((c) => c.includes(query))
      );
    });
  }, [games, searchQuery, t]);

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
    ? t(activeType.name)
    : searchQuery.trim()
    ? t('Search: "{query}"', { query: searchQuery })
    : t("All Games");

  // Show hero only on main games page (no category filter, no search)
  const showHero = !typeId && !searchQuery.trim();

  return (
    <div className="games-page">
      {/* Hero Section */}
      {showHero && <CustomGameHero />}

      {/* Games Content */}
      <div className="games-page__sections">
        {/* Page Header */}
        <div className="games-page__head">
          <h1 className="page-title">{heading}</h1>
          {pagination && (
            <span className="muted">
              {(searchQuery.trim() || typeId) && filteredGames.length !== pagination.total
                ? t("{count} of {total} games", { count: filteredGames.length, total: pagination.total })
                : t("{count} games", { count: filteredGames.length })}
            </span>
          )}
        </div>

        {loading && <GameGridSkeleton sectioned={!typeId && !searchQuery.trim()} label={t("Loading games...")} />}
        {error && !loading && <Alert variant="error">{t(error)}</Alert>}
        {refreshError && !error && (
          <Alert variant="warning">{t("Couldn’t refresh the games list. Showing saved results.")}</Alert>
        )}

        {!loading && !error && filteredGames.length === 0 && (
          typeId && !searchQuery.trim() ? (
            <CategoryEmptyState />
          ) : (
            <EmptyState
              title={
                searchQuery.trim()
                  ? t("No games found")
                  : t("No games yet")
              }
              message={
                searchQuery.trim()
                  ? t('No games match "{query}". Try a different search.', { query: searchQuery })
                  : t("Check back soon.")
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
                title={section.category ? t("{category} Games", { category: t(section.category) }) : t("Other Games")}
                spacing={index === sections.length - 1 ? "none" : "lg"}
              >
                <div className="game-grid">
                  {section.games.slice(0, 6).map((game) => (
                    <GameCard key={game.id} game={game} priority={index === 0} />
                  ))}
                </div>
                {section.games.length > 6 && (
                  <div className="games-page__section-more">
                    <span className="muted">
                      {t("+{count} more games", { count: section.games.length - 6 })}
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
              {filteredGames.map((game, i) => (
                <GameCard key={game.id} game={game} priority={i < 6} />
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
                    ? t("Loading...")
                    : t("Load more ({count} left)", { count: pagination.total - games.length })}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
