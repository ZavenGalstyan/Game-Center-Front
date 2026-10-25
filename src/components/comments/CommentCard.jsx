import { memo, useEffect, useRef } from "react";
import { Tooltip } from "../ui";
import CommentAvatar from "./CommentAvatar.jsx";
import CommentEditor from "./CommentEditor.jsx";
import { formatAbsoluteTime, formatRelativeTime } from "./commentUtils.js";

/**
 * One comment. Content is rendered strictly as text (React escapes it);
 * line breaks are kept by CSS `white-space: pre-wrap`.
 *
 * `canManage` only decides whether Edit/Delete are shown — the backend still
 * rejects any change to someone else's comment.
 */
function CommentCard({ comment, canManage, isEditing, isNew, now, onEdit, onCancelEdit, onSave, onDelete }) {
  const { author } = comment;
  const deleted = Boolean(author?.isDeleted);
  const username = deleted ? "Deleted user" : author?.username || "Player";

  // Hand focus back to the Edit button when the inline editor closes.
  const editButtonRef = useRef(null);
  const wasEditingRef = useRef(isEditing);
  useEffect(() => {
    if (wasEditingRef.current && !isEditing) editButtonRef.current?.focus();
    wasEditingRef.current = isEditing;
  }, [isEditing]);

  return (
    <li className={"comment-card" + (isNew ? " is-new" : "") + (comment.isOwner && canManage ? " is-own" : "")}>
      <CommentAvatar avatarId={author?.avatarId} deleted={deleted} />
      <div className="comment-card__main">
        <div className="comment-card__meta">
          <span className={"comment-card__author" + (deleted ? " is-deleted" : "")}>{username}</span>
          {comment.isOwner && canManage && <span className="comment-card__you">You</span>}
          <span className="comment-card__dot" aria-hidden="true">
            ·
          </span>
          <Tooltip content={formatAbsoluteTime(comment.createdAt)} position="top" className="comment-card__time-wrap">
            <time className="comment-card__time" dateTime={comment.createdAt} tabIndex={0}>
              {formatRelativeTime(comment.createdAt, now)}
              <span className="comments-sr-only">, {formatAbsoluteTime(comment.createdAt)}</span>
            </time>
          </Tooltip>
          {comment.isEdited && (
            <Tooltip
              content={comment.editedAt ? `Edited ${formatAbsoluteTime(comment.editedAt)}` : "Edited"}
              position="top"
            >
              <span className="comment-card__edited" tabIndex={0}>
                Edited
              </span>
            </Tooltip>
          )}

          {canManage && !isEditing && (
            <div className="comment-card__actions">
              <button
                ref={editButtonRef}
                type="button"
                className="comment-card__action"
                onClick={() => onEdit(comment.id)}
                aria-label="Edit comment"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
                  <path d="m13.5 6.5 4 4" />
                </svg>
                <span>Edit</span>
              </button>
              <button
                type="button"
                className="comment-card__action comment-card__action--danger"
                onClick={() => onDelete(comment)}
                aria-label="Delete comment"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M4 7h16" />
                  <path d="M9 7V4h6v3" />
                  <path d="M6 7l1 13h10l1-13" />
                </svg>
                <span>Delete</span>
              </button>
            </div>
          )}
        </div>

        {isEditing && canManage ? (
          <CommentEditor comment={comment} onSave={(content) => onSave(comment, content)} onCancel={onCancelEdit} />
        ) : (
          <p className="comment-card__content">{comment.content}</p>
        )}
      </div>
    </li>
  );
}

export default memo(CommentCard);
