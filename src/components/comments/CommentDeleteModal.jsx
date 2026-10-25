import { ConfirmDialog } from "../ui";

/** In-app confirmation before permanently deleting the user's own comment. */
export default function CommentDeleteModal({ comment, busy, error, onConfirm, onCancel }) {
  const preview = comment.content.length > 140 ? `${comment.content.slice(0, 140).trimEnd()}…` : comment.content;

  return (
    <ConfirmDialog
      title="Delete comment?"
      message={
        <>
          This permanently removes your comment and frees one of your 5 comment slots for this game.
          <span className="comment-delete__preview">{preview}</span>
        </>
      }
      variant="danger"
      confirmLabel="Delete"
      cancelLabel="Cancel"
      busy={busy}
      error={error}
      size="sm"
      className="comment-delete"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
