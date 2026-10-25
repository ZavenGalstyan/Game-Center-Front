import { useEffect, useRef, useState } from "react";
import { Button } from "../ui";
import CommentTextField from "./CommentTextField.jsx";
import { validateCommentContent } from "./commentUtils.js";

/**
 * Inline editor for the owner's own comment. The parent owns the request;
 * `onSave(content)` resolves to an error message (kept inline) or null.
 */
export default function CommentEditor({ comment, onSave, onCancel }) {
  const [value, setValue] = useState(comment.content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const savingRef = useRef(false);
  const inputRef = useRef(null);
  const errorId = `comment-edit-error-${comment.id}`;

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const invalid = validateCommentContent(value);

  const save = async () => {
    if (savingRef.current) return;
    if (invalid) {
      setError(invalid);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const message = await onSave(value);
    savingRef.current = false;
    // On success the parent closes the editor and this component unmounts.
    if (message) {
      setSaving(false);
      setError(message);
    }
  };

  return (
    <form
      className="comment-editor"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <CommentTextField
        ref={inputRef}
        id={`comment-edit-${comment.id}`}
        label="Edit your comment"
        value={value}
        onChange={(v) => {
          setValue(v);
          if (error) setError(null);
        }}
        onSubmit={save}
        onEscape={saving ? undefined : onCancel}
        disabled={saving}
        error={error}
        describedBy={error ? errorId : undefined}
        rows={3}
      />
      {error && (
        <p id={errorId} className="comment-inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="comment-editor__actions">
        <span className="comment-editor__hint">Esc to cancel</span>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" loading={saving} disabled={Boolean(invalid)}>
          Save
        </Button>
      </div>
    </form>
  );
}
