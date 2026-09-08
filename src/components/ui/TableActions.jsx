/**
 * TableActions component for row action buttons.
 *
 * @param {object} props
 * @param {function} [props.onEdit]
 * @param {function} [props.onDelete]
 * @param {string} [props.editLabel="Edit"]
 * @param {string} [props.deleteLabel="Delete"]
 * @param {boolean} [props.disabled=false]
 * @param {string} [props.className]
 */
export default function TableActions({
  onEdit,
  onDelete,
  editLabel = "Edit",
  deleteLabel = "Delete",
  disabled = false,
  className = "",
}) {
  const classNames = ["ui-table-actions", className].filter(Boolean).join(" ");

  return (
    <div className={classNames}>
      {onEdit && (
        <button
          type="button"
          className="ui-table-actions__btn"
          onClick={onEdit}
          disabled={disabled}
        >
          {editLabel}
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          className="ui-table-actions__btn ui-table-actions__btn--danger"
          onClick={onDelete}
          disabled={disabled}
        >
          {deleteLabel}
        </button>
      )}
    </div>
  );
}
