import { forwardRef } from "react";
import { Textarea } from "../ui";
import { COMMENT_MAX_LENGTH } from "./commentUtils.js";

/**
 * Multiline comment input with a live character counter.
 *
 * Key events are stopped here so typing never reaches the game's own
 * window/document keyboard listeners (Space, WASD, arrows...) while the
 * player writes a comment. Ctrl/Cmd+Enter submits, Escape calls `onEscape`.
 */
const CommentTextField = forwardRef(function CommentTextField(
  { id, value, onChange, onSubmit, onEscape, disabled, error, placeholder, rows = 3, describedBy, label },
  ref,
) {
  const length = value.length;
  const over = length > COMMENT_MAX_LENGTH;
  const near = !over && length >= COMMENT_MAX_LENGTH * 0.9;
  const counterId = `${id}-counter`;

  const handleKeyDown = (e) => {
    e.stopPropagation();
    if (e.key === "Escape" && onEscape) {
      e.preventDefault();
      onEscape();
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="comment-field">
      <Textarea
        ref={ref}
        id={id}
        className="comment-field__input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onKeyUp={(e) => e.stopPropagation()}
        onKeyPress={(e) => e.stopPropagation()}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        error={Boolean(error) || over}
        aria-label={label}
        aria-describedby={[counterId, describedBy].filter(Boolean).join(" ")}
      />
      <span
        id={counterId}
        className={"comment-field__counter" + (over ? " is-over" : near ? " is-near" : "")}
        aria-live={near || over ? "polite" : "off"}
      >
        {length.toLocaleString()}/{COMMENT_MAX_LENGTH.toLocaleString()}
        <span className="comments-sr-only"> characters</span>
      </span>
    </div>
  );
});

export default CommentTextField;
