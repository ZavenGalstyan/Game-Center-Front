import { avatarGradient, initialsOf } from "./commentUtils.js";

/** Initials avatar; deleted authors get a neutral silhouette. */
export default function CommentAvatar({ username, deleted = false }) {
  if (deleted) {
    return (
      <span className="comment-avatar comment-avatar--deleted" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <circle cx="12" cy="8.5" r="3.5" />
          <path d="M5 19.5c1.2-3.3 4-5 7-5s5.8 1.7 7 5" />
        </svg>
      </span>
    );
  }
  return (
    <span className="comment-avatar" style={{ backgroundImage: avatarGradient(username) }} aria-hidden="true">
      {initialsOf(username)}
    </span>
  );
}
