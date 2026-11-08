import { ConfirmDialog } from "../ui";
import { useTranslation } from "../../i18n/useTranslation.js";

/** In-app confirmation before permanently deleting the user's own comment. */
export default function CommentDeleteModal({ comment, busy, error, onConfirm, onCancel }) {
  const { t } = useTranslation();
  const preview = comment.content.length > 140 ? `${comment.content.slice(0, 140).trimEnd()}…` : comment.content;

  return (
    <ConfirmDialog
      title={t("Delete comment?")}
      message={
        <>
          {t("This permanently removes your comment and frees one of your 5 comment slots for this game.")}
          <span className="comment-delete__preview">{preview}</span>
        </>
      }
      variant="danger"
      confirmLabel={t("Delete")}
      cancelLabel={t("Cancel")}
      busy={busy}
      error={error}
      size="sm"
      className="comment-delete"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
