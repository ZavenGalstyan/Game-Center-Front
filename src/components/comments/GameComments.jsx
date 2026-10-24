import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthContext.jsx";
import { api } from "../../lib/api.js";
import { useToast } from "../Toast.jsx";
import { Button } from "../ui";
import CommentCard from "./CommentCard.jsx";
import CommentComposer from "./CommentComposer.jsx";
import CommentDeleteModal from "./CommentDeleteModal.jsx";
import {
  COMMENT_PAGE_SIZE,
  commentErrorMessage,
  fieldError,
  retryAfterSeconds,
} from "./commentUtils.js";
import "./comments.css";

/**
 * Comments section for the single game page (mounted once in GameDetail,
 * keyed by game id, outside the GamePlayer so container fullscreen never
 * shows it).
 *
 * - Everyone can read: newest first, 10 per page, "Load more" via offset.
 * - Logged-in players get a composer and can edit/delete their own comments;
 *   each player may keep at most 5 comments per game (backend-enforced, the
 *   allowance comes from the backend and is refreshed after every write).
 * - Guests get a Log in / Register prompt that opens the existing AuthModal.
 *
 * Offset pagination stays consistent with local writes: our own new comment
 * shifts the server list by +1 and our own delete by -1, so `nextOffset` is
 * adjusted to match. Pages are merged by id so an overlap never duplicates.
 * A login/logout refetches the first page so `isOwner` is right for the new
 * viewer; stale responses (older page loads, previous game) are ignored.
 */

function emptyPagination() {
  return { total: 0, hasMore: false, nextOffset: null };
}

function mergeById(list, incoming) {
  const seen = new Set(list.map((c) => c.id));
  return [...list, ...incoming.filter((c) => c && !seen.has(c.id) && seen.add(c.id))];
}

export default function GameComments({ gameId, onRequestAuth }) {
  const { status, user, isAuthenticated, handleAuthExpired } = useAuth();
  const toast = useToast();

  /* ------------------------------- List state ------------------------------ */
  const [comments, setComments] = useState([]);
  const [pagination, setPagination] = useState(emptyPagination);
  const [listState, setListState] = useState("loading"); // loading | ok | error
  const [listError, setListError] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  /* ----------------------------- Allowance state --------------------------- */
  const [allowance, setAllowance] = useState(null);
  const [allowanceKey, setAllowanceKey] = useState(0);

  /* ------------------------------ Write state ------------------------------ */
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [composeError, setComposeError] = useState(null);
  const [rateLimitedUntil, setRateLimitedUntil] = useState(null);
  const [sessionNotice, setSessionNotice] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // Bumped by every first-page load; older responses are dropped.
  const listGenRef = useRef(0);
  const nextOffsetRef = useRef(0);
  const submittingRef = useRef(false);
  const deletingRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Relative times ("5 minutes ago") stay fresh without refetching.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const expireSession = useCallback(
    (notice) => {
      setSessionNotice(notice);
      setEditingId(null);
      handleAuthExpired();
    },
    [handleAuthExpired],
  );

  /* ---------------------------- First page / refresh ----------------------- */
  // Waits for auth to hydrate so the first request carries the right identity.
  useEffect(() => {
    if (!gameId || status === "loading") return undefined;
    const gen = ++listGenRef.current;
    setListState("loading");
    setListError(null);
    setLoadMoreError(null);
    api
      .listComments(gameId, { limit: COMMENT_PAGE_SIZE, offset: 0, sort: "newest" })
      .then((res) => {
        if (!mountedRef.current || gen !== listGenRef.current) return;
        const page = Array.isArray(res.data) ? res.data : [];
        const meta = res.pagination || {};
        setComments(mergeById([], page));
        setPagination({
          total: meta.total ?? page.length,
          hasMore: Boolean(meta.hasMore),
          nextOffset: meta.nextOffset ?? null,
        });
        nextOffsetRef.current = meta.nextOffset ?? page.length;
        setListState("ok");
        setLoaded(true);
        if (res.authExpired) {
          expireSession("Your session has expired. Log in again to join the conversation.");
        }
      })
      .catch((err) => {
        if (!mountedRef.current || gen !== listGenRef.current) return;
        setListState("error");
        // A 404 is either a missing game or a backend without the comments API.
        setListError(
          err?.status === 404
            ? /game not found/i.test(err.message || "")
              ? "This game no longer exists."
              : "Comments aren't available right now."
            : commentErrorMessage(err, "Couldn't load comments."),
        );
      });
    return undefined;
  }, [gameId, status, reloadKey, expireSession]);

  const refetchFirstPage = useCallback(() => setReloadKey((k) => k + 1), []);
  const refreshAllowance = useCallback(() => setAllowanceKey((k) => k + 1), []);

  /* -------------------------------- Allowance ------------------------------ */
  useEffect(() => {
    if (!gameId || !isAuthenticated) {
      setAllowance(null);
      return undefined;
    }
    let active = true;
    api
      .getMyCommentCount(gameId)
      .then((data) => {
        if (active) setAllowance(data);
      })
      .catch((err) => {
        if (!active) return;
        if (err?.status === 401) {
          expireSession("Your session has expired. Log in again to join the conversation.");
        }
        // Otherwise keep the last known allowance; the backend still enforces the limit.
      });
    return () => {
      active = false;
    };
  }, [gameId, isAuthenticated, allowanceKey, expireSession]);

  useEffect(() => {
    if (isAuthenticated) setSessionNotice(null);
  }, [isAuthenticated]);

  // Drop the "posting too quickly" notice once the wait is over.
  useEffect(() => {
    if (!rateLimitedUntil) return undefined;
    const timer = setTimeout(() => {
      setRateLimitedUntil(null);
      setComposeError(null);
    }, Math.max(0, rateLimitedUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [rateLimitedUntil]);

  // The draft survives an expired session so the same player can log back in
  // and post it, but it must never carry over to a different account.
  const draftOwnerRef = useRef(null);
  useEffect(() => {
    if (!user?.id) return;
    if (draftOwnerRef.current && draftOwnerRef.current !== user.id) setDraft("");
    draftOwnerRef.current = user.id;
  }, [user?.id]);

  /* -------------------------------- Load more ------------------------------ */
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    const gen = listGenRef.current;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const res = await api.listComments(gameId, {
        limit: COMMENT_PAGE_SIZE,
        offset: Math.max(0, nextOffsetRef.current),
        sort: "newest",
      });
      if (!mountedRef.current || gen !== listGenRef.current) return;
      const page = Array.isArray(res.data) ? res.data : [];
      const meta = res.pagination || {};
      setComments((list) => mergeById(list, page));
      setPagination({
        total: meta.total ?? pagination.total,
        hasMore: Boolean(meta.hasMore),
        nextOffset: meta.nextOffset ?? null,
      });
      nextOffsetRef.current = meta.nextOffset ?? nextOffsetRef.current + page.length;
      if (res.authExpired) {
        expireSession("Your session has expired. Log in again to join the conversation.");
      }
    } catch (err) {
      if (mountedRef.current && gen === listGenRef.current) {
        setLoadMoreError(commentErrorMessage(err, "Couldn't load more comments."));
      }
    } finally {
      loadingMoreRef.current = false;
      if (mountedRef.current) setLoadingMore(false);
    }
  }, [gameId, pagination.total, expireSession]);

  /* ---------------------------------- Create ------------------------------- */
  const submitComment = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setComposeError(null);
    try {
      const { comment, allowance: next } = await api.createComment(gameId, draft);
      if (!mountedRef.current) return;
      setDraft("");
      setRateLimitedUntil(null);
      if (next) setAllowance(next);
      if (comment) {
        setComments((list) => [comment, ...list.filter((c) => c.id !== comment.id)]);
        setPagination((p) => ({ ...p, total: p.total + 1 }));
        nextOffsetRef.current += 1;
        setHighlightId(comment.id);
      } else {
        refetchFirstPage();
      }
      toast.show("Comment posted", { type: "success" });
    } catch (err) {
      if (!mountedRef.current) return;
      if (err?.status === 401) {
        expireSession("Your session has expired. Log in again to post your comment. Your draft is saved.");
      } else if (err?.code === "COMMENT_LIMIT_REACHED") {
        // Another tab/device may have posted: resync the allowance and the list.
        refreshAllowance();
        refetchFirstPage();
        toast.show(err.message || "You've reached the comment limit for this game.", { type: "error" });
      } else if (err?.code === "RATE_LIMITED" || err?.status === 429) {
        const seconds = retryAfterSeconds(err);
        setRateLimitedUntil(Date.now() + seconds * 1000);
        setComposeError(`You're posting comments too quickly. Your draft is saved, try again in ${seconds} seconds.`);
      } else if (err?.status === 404) {
        setComposeError("This game no longer exists, so it can't receive comments.");
      } else if (err?.status === 400) {
        setComposeError(fieldError(err) || err.message || "That comment isn't valid.");
      } else {
        // Includes COMMENT_WRITE_CONFLICT: the backend message says to retry.
        setComposeError(commentErrorMessage(err));
      }
    } finally {
      submittingRef.current = false;
      if (mountedRef.current) setSubmitting(false);
    }
  }, [gameId, draft, toast, expireSession, refreshAllowance, refetchFirstPage]);

  const commentsRef = useRef(comments);
  commentsRef.current = comments;

  const removeLocally = useCallback((commentId) => {
    if (!commentsRef.current.some((c) => c.id === commentId)) return;
    setComments((list) => list.filter((c) => c.id !== commentId));
    setPagination((p) => ({ ...p, total: Math.max(0, p.total - 1) }));
    nextOffsetRef.current = Math.max(0, nextOffsetRef.current - 1);
  }, []);

  /* ----------------------------------- Edit -------------------------------- */
  const startEdit = useCallback((id) => setEditingId(id), []);
  const cancelEdit = useCallback(() => setEditingId(null), []);

  // Resolves to an inline error message, or null when the editor can close.
  const saveEdit = useCallback(
    async (comment, content) => {
      try {
        const { comment: updated } = await api.updateComment(gameId, comment.id, content);
        if (!mountedRef.current) return null;
        if (updated) setComments((list) => list.map((c) => (c.id === updated.id ? updated : c)));
        setEditingId(null);
        toast.show("Comment updated", { type: "success" });
        return null;
      } catch (err) {
        if (!mountedRef.current) return null;
        if (err?.status === 401) {
          expireSession("Your session has expired. Log in again to edit your comments.");
          return "Your session has expired.";
        }
        if (err?.status === 404) {
          removeLocally(comment.id);
          setEditingId(null);
          refreshAllowance();
          toast.show("That comment no longer exists.", { type: "info" });
          return null;
        }
        if (err?.code === "RATE_LIMITED" || err?.status === 429) {
          return `You're changing comments too quickly. Try again in ${retryAfterSeconds(err)} seconds.`;
        }
        return commentErrorMessage(err);
      }
    },
    [gameId, toast, expireSession, removeLocally, refreshAllowance],
  );

  /* ---------------------------------- Delete ------------------------------- */
  const askDelete = useCallback((comment) => {
    setDeleteError(null);
    setDeleteTarget(comment);
  }, []);

  const cancelDelete = useCallback(() => {
    if (deletingRef.current) return;
    setDeleteTarget(null);
    setDeleteError(null);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (deletingRef.current || !deleteTarget) return;
    deletingRef.current = true;
    setDeleting(true);
    setDeleteError(null);
    const target = deleteTarget;
    let close = true;
    try {
      const { deletedCommentId, allowance: next } = await api.deleteComment(gameId, target.id);
      if (!mountedRef.current) return;
      removeLocally(deletedCommentId || target.id);
      if (next) setAllowance(next);
      else refreshAllowance();
      if (editingId === target.id) setEditingId(null);
      toast.show("Comment deleted", { type: "success" });
    } catch (err) {
      if (!mountedRef.current) return;
      if (err?.status === 404) {
        removeLocally(target.id);
        refreshAllowance();
        toast.show("That comment was already deleted.", { type: "info" });
      } else if (err?.status === 401) {
        expireSession("Your session has expired. Log in again to manage your comments.");
      } else {
        close = false;
        setDeleteError(
          err?.code === "RATE_LIMITED" || err?.status === 429
            ? `You're changing comments too quickly. Try again in ${retryAfterSeconds(err)} seconds.`
            : commentErrorMessage(err),
        );
      }
    } finally {
      deletingRef.current = false;
      if (mountedRef.current) {
        setDeleting(false);
        if (close) setDeleteTarget(null);
      }
    }
  }, [gameId, deleteTarget, editingId, toast, removeLocally, refreshAllowance, expireSession]);

  /* ---------------------------------- Render ------------------------------- */
  const total = pagination.total;
  const headingId = `comments-title-${gameId}`;

  let writeArea;
  if (status === "loading") {
    writeArea = <div className="comments__composer-skeleton" aria-hidden="true" />;
  } else if (isAuthenticated) {
    writeArea = (
      <CommentComposer
        gameId={gameId}
        username={user?.username}
        allowance={allowance}
        draft={draft}
        onDraftChange={(v) => {
          setDraft(v);
          if (composeError && Date.now() >= (rateLimitedUntil || 0)) setComposeError(null);
        }}
        onSubmit={submitComment}
        submitting={submitting}
        error={composeError}
        rateLimitedUntil={rateLimitedUntil}
      />
    );
  } else {
    writeArea = (
      <div className="comments__guest">
        <span className="comments__guest-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M4 5h16v11H9l-5 4V5Z" />
            <path d="M8 9h8M8 12h5" />
          </svg>
        </span>
        <div className="comments__guest-copy">
          <p className="comments__guest-title">Join the conversation</p>
          <p className="comments__guest-text">
            {sessionNotice || "Log in or create a free account to share your thoughts about this game."}
          </p>
        </div>
        <div className="comments__guest-actions">
          <Button variant="primary" size="sm" onClick={() => onRequestAuth?.("login")}>
            Log in
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onRequestAuth?.("register")}>
            Register
          </Button>
        </div>
      </div>
    );
  }

  let listBody;
  if (!loaded && listState === "loading") {
    listBody = (
      <ul className="comments__list" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <li key={i} className="comment-card comment-card--skeleton">
            <span className="comment-avatar" />
            <div className="comment-card__main">
              <span className="comment-skeleton-line comment-skeleton-line--short" />
              <span className="comment-skeleton-line" />
              <span className="comment-skeleton-line comment-skeleton-line--mid" />
            </div>
          </li>
        ))}
      </ul>
    );
  } else if (listState === "error" && !comments.length) {
    listBody = (
      <div className="comments__alert" role="alert">
        <span>{listError}</span>
        <Button variant="secondary" size="sm" onClick={refetchFirstPage}>
          Retry
        </Button>
      </div>
    );
  } else if (!comments.length) {
    listBody = (
      <div className="comments__empty">
        <span className="comments__empty-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M4 5h16v11H9l-5 4V5Z" />
          </svg>
        </span>
        <p className="comments__empty-title">No comments yet</p>
        <p className="comments__empty-text">Be the first to share your thoughts about this game.</p>
      </div>
    );
  } else {
    listBody = (
      <>
        {listState === "error" && (
          <div className="comments__alert" role="alert">
            <span>{listError}</span>
            <Button variant="secondary" size="sm" onClick={refetchFirstPage}>
              Retry
            </Button>
          </div>
        )}
        <ul className={"comments__list" + (listState === "loading" ? " is-refreshing" : "")} aria-busy={listState === "loading"}>
          {comments.map((comment) => (
            <CommentCard
              key={comment.id}
              comment={comment}
              canManage={isAuthenticated && comment.isOwner}
              isEditing={editingId === comment.id}
              isNew={highlightId === comment.id}
              now={now}
              onEdit={startEdit}
              onCancelEdit={cancelEdit}
              onSave={saveEdit}
              onDelete={askDelete}
            />
          ))}
        </ul>
        {loadMoreError && (
          <div className="comments__alert" role="alert">
            <span>{loadMoreError}</span>
            <Button variant="secondary" size="sm" onClick={loadMore}>
              Retry
            </Button>
          </div>
        )}
        {pagination.hasMore && !loadMoreError && (
          <div className="comments__more">
            <Button variant="secondary" size="sm" onClick={loadMore} loading={loadingMore}>
              Load more comments
            </Button>
            <span className="comments__more-count">
              Showing {comments.length.toLocaleString()} of {total.toLocaleString()}
            </span>
          </div>
        )}
      </>
    );
  }

  return (
    <section className="comments" id="comments" aria-labelledby={headingId}>
      <div className="comments__head">
        <p className="comments__eyebrow">Community</p>
        <h2 className="comments__title" id={headingId}>
          Comments
          <span className="comments__count" aria-label={`${total} comments`}>
            {loaded ? total.toLocaleString() : "–"}
          </span>
        </h2>
      </div>

      <div className="comments__write">{writeArea}</div>

      <div className="comments__body">{listBody}</div>

      {deleteTarget && (
        <CommentDeleteModal
          comment={deleteTarget}
          busy={deleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}
    </section>
  );
}
