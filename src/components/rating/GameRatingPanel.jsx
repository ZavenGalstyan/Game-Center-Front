import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthContext.jsx";
import { api } from "../../lib/api.js";
import { Button } from "../ui";
import Avatar from "../avatar/Avatar.jsx";
import RatingStars, { StarIcon, formatAverage } from "./RatingStars.jsx";

/**
 * Ratings panel for the single game page.
 *
 * - Everyone sees the public summary (average, fractional stars, count and
 *   the 5-to-1 distribution).
 * - Logged-in users who have not rated get an interactive 1-5 star picker.
 *   A rating is final: once the backend confirms it the picker is replaced by
 *   "Your rating: X/5" with no edit/delete.
 * - Guests get a prompt that opens the existing login modal in place, so they
 *   stay on this game page after logging in.
 *
 * The backend is the source of truth: the summary is (re)fetched whenever the
 * game or auth state changes, and nothing is shown as saved until the POST
 * succeeds.
 */

const LABELS = { 1: "Poor", 2: "Fair", 3: "Good", 4: "Great", 5: "Amazing" };
const STAR_VALUES = [1, 2, 3, 4, 5];

function emptyDistribution() {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

function errorMessage(err) {
  if (!err) return null;
  if (err.status === 0) return "Can't reach the server. Check your connection and try again.";
  if (err.status === 400) return err.errors?.[0]?.message || err.message || "That rating isn't valid.";
  if (err.status === 404) return "This game no longer exists.";
  return err.message || "Something went wrong. Please try again.";
}

export default function GameRatingPanel({ gameId, initialStats, onStatsChange, onRequestLogin }) {
  const { status, user, isAuthenticated, handleAuthExpired } = useAuth();

  // Seed from the game payload so the numbers show instantly; the summary
  // request then fills in the distribution and the user's own rating.
  const [summary, setSummary] = useState(() => ({
    averageRating: initialStats?.averageRating ?? 0,
    ratingsCount: initialStats?.ratingsCount ?? 0,
    ratingDistribution: null,
    myRating: null,
  }));
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [selected, setSelected] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [justRated, setJustRated] = useState(false);

  const submittingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const onStatsChangeRef = useRef(onStatsChange);
  onStatsChangeRef.current = onStatsChange;

  const applySummary = useCallback((next) => {
    setSummary(next);
    onStatsChangeRef.current?.({
      averageRating: next.averageRating,
      ratingsCount: next.ratingsCount,
    });
  }, []);

  // Reset per-game UI state when navigating between games.
  useEffect(() => {
    setSelected(0);
    setHovered(0);
    setSubmitError(null);
    setJustRated(false);
  }, [gameId]);

  // Authoritative summary for the current game + viewer. Waits for auth to
  // hydrate so it is fetched once with the right identity.
  useEffect(() => {
    if (!gameId || status === "loading") return undefined;
    let active = true;
    setSummaryLoading(true);
    setSummaryError(null);
    api
      .getRatingSummary(gameId)
      .then((data) => {
        if (active) applySummary(data);
      })
      .catch((err) => {
        if (!active) return;
        if (err?.status === 401) {
          // Stale token: drop it; the status change re-runs this as a guest.
          handleAuthExpired();
          return;
        }
        setSummaryError(errorMessage(err));
      })
      .finally(() => {
        if (active) setSummaryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [gameId, status, reloadKey, applySummary, handleAuthExpired]);

  const submit = useCallback(async () => {
    if (submittingRef.current || !selected) return;
    if (!isAuthenticated) {
      onRequestLogin?.();
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { summary: next } = await api.submitRating(gameId, selected);
      if (!mountedRef.current) return;
      applySummary(next);
      setJustRated(true);
    } catch (err) {
      if (!mountedRef.current) return;
      if (err?.status === 409) {
        // Rated already (another tab/device): show the saved rating instead.
        setSubmitError("You've already rated this game. Ratings are final.");
        setReloadKey((k) => k + 1);
      } else if (err?.status === 401) {
        handleAuthExpired();
        setSubmitError("Your session has expired. Log in again to rate.");
      } else {
        setSubmitError(errorMessage(err));
      }
    } finally {
      submittingRef.current = false;
      if (mountedRef.current) setSubmitting(false);
    }
  }, [selected, isAuthenticated, onRequestLogin, gameId, applySummary, handleAuthExpired]);

  const { averageRating, ratingsCount, myRating } = summary;
  const distribution = summary.ratingDistribution || emptyDistribution();
  const rated = ratingsCount > 0;
  const preview = hovered || selected;

  let yourRating;
  if (status === "loading" || (isAuthenticated && summaryLoading && myRating == null)) {
    yourRating = (
      <div className="game-rating__skeleton" aria-hidden="true">
        <span />
        <span />
      </div>
    );
  } else if (!isAuthenticated) {
    yourRating = (
      <div className="game-rating__guest">
        <p className="game-rating__guest-title">Played this game?</p>
        <p className="game-rating__guest-text">Log in to leave your rating. Each player can rate a game once.</p>
        <Button variant="primary" size="sm" onClick={onRequestLogin}>
          Log in to rate
        </Button>
      </div>
    );
  } else if (myRating != null) {
    yourRating = (
      <div className={`game-rating__mine${justRated ? " is-new" : ""}`} role="status">
        <p className="game-rating__mine-label">
          <Avatar avatarId={user?.avatarId} size="sm" alt="" />
          {justRated ? "Thanks for rating!" : "You rated this game"}
        </p>
        <div className="game-rating__mine-row">
          <RatingStars value={myRating} size="lg" />
          <span className="game-rating__mine-value">
            Your rating: <strong>{myRating}/5</strong>
          </span>
        </div>
        <p className="game-rating__final-note">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          Ratings are final and count toward the average.
        </p>
      </div>
    );
  } else {
    yourRating = (
      <div className="game-rating__form">
        <p className="game-rating__form-title" id={`rate-label-${gameId}`}>
          Rate this game
        </p>
        <fieldset
          className="game-rating__picker"
          aria-labelledby={`rate-label-${gameId}`}
          disabled={submitting}
          onMouseLeave={() => setHovered(0)}
        >
          {STAR_VALUES.map((n) => (
            <label
              key={n}
              className={"game-rating__pick" + (n <= preview ? " is-active" : "")}
              onMouseEnter={() => setHovered(n)}
            >
              <input
                type="radio"
                className="rating-sr-only"
                name={`rating-${gameId}`}
                value={n}
                checked={selected === n}
                onChange={() => {
                  setSelected(n);
                  setSubmitError(null);
                }}
              />
              <StarIcon />
              <span className="rating-sr-only">
                {n} star{n === 1 ? "" : "s"}, {LABELS[n]}
              </span>
            </label>
          ))}
        </fieldset>
        <p className="game-rating__hint" aria-live="polite">
          {preview ? (
            <>
              <strong>{preview}/5</strong> · {LABELS[preview]}
            </>
          ) : (
            "Choose 1 to 5 stars"
          )}
        </p>
        <Button
          variant="primary"
          size="sm"
          onClick={submit}
          disabled={!selected}
          loading={submitting}
        >
          {submitting ? "Submitting…" : "Submit rating"}
        </Button>
        <p className="game-rating__final-note game-rating__final-note--muted">
          You can rate each game once. Ratings can't be changed later.
        </p>
      </div>
    );
  }

  return (
    <section className="game-rating" id="ratings" aria-labelledby={`ratings-title-${gameId}`}>
      <div className="game-rating__head">
        <p className="game-rating__eyebrow">Player Ratings</p>
        <h2 className="game-rating__title" id={`ratings-title-${gameId}`}>
          How players rate it
        </h2>
      </div>

      <div className="game-rating__grid">
        <div className="game-rating__score">
          {rated ? (
            <>
              <p className="game-rating__average">
                <span className="game-rating__average-value">{formatAverage(averageRating)}</span>
                <span className="game-rating__average-max">/ 5</span>
              </p>
              <RatingStars
                value={averageRating}
                size="lg"
                label={`Average rating ${formatAverage(averageRating)} out of 5`}
              />
              <p className="game-rating__count">
                Based on {ratingsCount.toLocaleString()} rating{ratingsCount === 1 ? "" : "s"}
              </p>
            </>
          ) : (
            <div className="game-rating__empty">
              <RatingStars value={0} size="lg" />
              <p className="game-rating__empty-title">Not rated yet</p>
              <p className="game-rating__empty-text">Be the first player to rate this game.</p>
            </div>
          )}
        </div>

        <ul className="game-rating__bars" aria-label="Rating distribution">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = distribution[star] || 0;
            const pct = rated ? (count / ratingsCount) * 100 : 0;
            return (
              <li key={star} className="game-rating__bar-row">
                <span className="game-rating__bar-label">
                  {star}
                  <StarIcon />
                </span>
                <span className="game-rating__bar-track" aria-hidden="true">
                  <span className="game-rating__bar-fill" style={{ width: `${pct}%` }} />
                </span>
                <span className="game-rating__bar-count">
                  {summary.ratingDistribution ? count.toLocaleString() : "–"}
                  <span className="rating-sr-only"> {star}-star ratings</span>
                </span>
              </li>
            );
          })}
        </ul>

        <div className="game-rating__yours">{yourRating}</div>
      </div>

      {summaryError && (
        <p className="game-rating__alert" role="alert">
          {summaryError}{" "}
          <button type="button" className="game-rating__retry" onClick={() => setReloadKey((k) => k + 1)}>
            Retry
          </button>
        </p>
      )}
      {submitError && (
        <p className="game-rating__alert" role="alert">
          {submitError}
        </p>
      )}
    </section>
  );
}
