import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { useToast } from "./Toast.jsx";
import LikedGameCard from "./LikedGameCard.jsx";
import {
  Card,
  CardTitle,
  CardBody,
  LoadingState,
  EmptyState,
  Alert,
  Button,
} from "./ui";

const PAGE_SIZE = 12;

const idOf = (g) => g.id || g._id;

/**
 * Normalises the liked-games endpoint, which may return either the project's
 * standard `{ data, pagination }` envelope or `{ items, total }`.
 */
function normalize(res) {
  const list = res?.items ?? res?.data ?? [];
  const total = res?.total ?? res?.pagination?.total ?? list.length;
  return { list, total };
}

/**
 * "Liked Games" section for the Profile / Account page. Loads independently of
 * the rest of the page (only this card shows a loading state), fetches fresh
 * from the backend on mount so it always reflects the source of truth, and
 * supports optimistic unlike + Load more when the API reports more items.
 */
export default function LikedGamesSection() {
  const toast = useToast();
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [removingId, setRemovingId] = useState(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .getMyLikedGames({ limit: PAGE_SIZE, offset: 0 })
      .then((res) => {
        if (!active) return;
        const { list, total: t } = normalize(res);
        setItems(list);
        setTotal(t);
      })
      .catch((e) => {
        if (active) setError(e.message || "Could not load liked games");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const res = await api.getMyLikedGames({
        limit: PAGE_SIZE,
        offset: items.length,
      });
      if (!mountedRef.current) return;
      const { list, total: t } = normalize(res);
      setItems((prev) => {
        const seen = new Set(prev.map(idOf));
        return [...prev, ...list.filter((g) => !seen.has(idOf(g)))];
      });
      setTotal(t);
    } catch (e) {
      if (mountedRef.current) {
        toast.show(e.message || "Could not load more games", { type: "error" });
      }
    } finally {
      if (mountedRef.current) setLoadingMore(false);
    }
  }, [items.length, toast]);

  const handleUnlike = useCallback(
    async (game) => {
      const id = idOf(game);
      if (removingId) return;
      const snapshot = items;
      const snapshotTotal = total;

      // Optimistic removal.
      setRemovingId(id);
      setItems((prev) => prev.filter((g) => idOf(g) !== id));
      setTotal((t) => Math.max(0, t - 1));

      try {
        await api.unlikeGame(id);
      } catch (e) {
        if (!mountedRef.current) return;
        setItems(snapshot);
        setTotal(snapshotTotal);
        toast.show("Could not remove from liked games. Please try again.", {
          type: "error",
        });
      } finally {
        if (mountedRef.current) setRemovingId(null);
      }
    },
    [items, total, removingId, toast],
  );

  const hasMore = items.length < total;

  return (
    <Card className="card" style={{ maxWidth: 720 }}>
      <CardTitle>
        {total > 0 ? `Liked Games (${total})` : "Liked Games"}
      </CardTitle>
      <CardBody>
        {loading && <LoadingState message="Loading liked games..." />}

        {error && !loading && <Alert variant="error">{error}</Alert>}

        {!loading && !error && items.length === 0 && (
          <EmptyState
            title="No liked games yet"
            message="Like games to save them here."
            action={{ label: "Browse games", onClick: () => navigate("/") }}
          />
        )}

        {items.length > 0 && (
          <>
            <div className="liked-games-grid">
              {items.map((g) => (
                <LikedGameCard
                  key={idOf(g)}
                  game={g}
                  removing={removingId === idOf(g)}
                  onUnlike={handleUnlike}
                />
              ))}
            </div>

            {hasMore && (
              <div className="load-more">
                <Button
                  variant="ghost"
                  onClick={loadMore}
                  loading={loadingMore}
                >
                  {loadingMore ? "Loading..." : "Load more"}
                </Button>
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
