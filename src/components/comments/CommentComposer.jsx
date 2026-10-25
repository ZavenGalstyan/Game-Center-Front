import { useEffect, useState } from "react";
import { Button } from "../ui";
import CommentTextField from "./CommentTextField.jsx";
import CommentAvatar from "./CommentAvatar.jsx";
import { validateCommentContent } from "./commentUtils.js";

/**
 * New-comment form for logged-in players. The draft lives in the parent so it
 * survives failures (network, rate limit, expired session) and is only
 * cleared by the parent after a successful post.
 *
 * Props:
 *  - avatarId (current user's), allowance ({ count, limit, remaining, canComment } | null)
 *  - draft / onDraftChange
 *  - onSubmit(): parent posts `draft`
 *  - submitting, error (inline), rateLimitedUntil (ms timestamp | null)
 */
export default function CommentComposer({
  gameId,
  avatarId,
  allowance,
  draft,
  onDraftChange,
  onSubmit,
  submitting,
  error,
  rateLimitedUntil,
}) {
  const [touched, setTouched] = useState(false);
  const waitSeconds = useCountdown(rateLimitedUntil);

  const atLimit = allowance ? !allowance.canComment : false;
  const invalid = validateCommentContent(draft);
  const overLength = invalid && draft.trim() !== "";
  const blocked = atLimit || waitSeconds > 0;
  const errorId = `comment-compose-error-${gameId}`;
  const inlineError = error || (touched && overLength ? invalid : null);

  const submit = () => {
    setTouched(true);
    if (submitting || blocked || invalid) return;
    onSubmit();
  };

  return (
    <div className={"comment-composer" + (atLimit ? " is-locked" : "")}>
      <CommentAvatar avatarId={avatarId} />
      <form
        className="comment-composer__form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <CommentTextField
          id={`comment-compose-${gameId}`}
          label="Write a comment"
          placeholder={atLimit ? "You've used all your comments for this game." : "Share your thoughts about this game..."}
          value={draft}
          onChange={(v) => {
            onDraftChange(v);
            if (!touched && v.length) setTouched(true);
          }}
          onSubmit={submit}
          disabled={submitting || atLimit}
          error={inlineError}
          describedBy={inlineError ? errorId : undefined}
          rows={3}
        />

        {inlineError && (
          <p id={errorId} className="comment-inline-error" role="alert">
            {inlineError}
          </p>
        )}

        {atLimit && (
          <p className="comment-composer__limit" role="status">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            You&rsquo;ve reached the limit of 5 comments for this game. Delete one of your comments to write
            another.
          </p>
        )}

        <div className="comment-composer__footer">
          <AllowanceMeter allowance={allowance} />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={submitting}
            disabled={blocked || Boolean(invalid)}
          >
            {waitSeconds > 0 ? `Wait ${waitSeconds}s` : "Post comment"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function AllowanceMeter({ allowance }) {
  if (!allowance) {
    return <span className="comment-allowance comment-allowance--loading" aria-hidden="true" />;
  }
  const { count, limit } = allowance;
  return (
    <span className="comment-allowance" aria-label={`${count} of ${limit} comments used for this game`}>
      <span className="comment-allowance__dots" aria-hidden="true">
        {Array.from({ length: limit }, (_, i) => (
          <span key={i} className={"comment-allowance__dot" + (i < count ? " is-used" : "")} />
        ))}
      </span>
      <span aria-hidden="true">
        <strong>
          {count}/{limit}
        </strong>{" "}
        comments used
      </span>
    </span>
  );
}

/** Whole seconds left until `until` (ms timestamp), ticking every second. */
function useCountdown(until) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= until) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [until]);
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
}
