import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api.js";
import { useGameTypes } from "../data/gameTypes.jsx";
import GameCard from "../components/GameCard.jsx";
import { Button, LoadingState, EmptyState, Alert } from "../components/ui";

const PAGE_SIZE = 20;

export default function GamesPage() {
  const [params] = useSearchParams();
  const typeId = params.get("typeId") || undefined;
  const { byId } = useGameTypes();
  const activeType = typeId ? byId[typeId] : null;

  const [games, setGames] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  // Reset and load the first page whenever the filter changes.
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

  const heading = activeType ? activeType.name : "All games";

  return (
    <div className="games-page">
      <div className="games-page__head">
        <h1 className="page-title">{heading}</h1>
        {pagination && (
          <span className="muted">
            {pagination.total} game{pagination.total === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {loading && <LoadingState message="Loading games..." />}
      {error && !loading && <Alert variant="error">{error}</Alert>}

      {!loading && !error && games.length === 0 && (
        <EmptyState
          title={typeId ? "No games in this category yet" : "No games yet"}
          message="Check back soon."
        />
      )}

      {games.length > 0 && (
        <>
          <div className="game-grid">
            {games.map((game) => (
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
  );
}
