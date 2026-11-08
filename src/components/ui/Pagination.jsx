import Button from "./Button.jsx";
import { useTranslation } from "../../i18n/useTranslation.js";

/**
 * Pagination component for navigating paged data.
 *
 * @param {object} props
 * @param {number} props.page - Current page (1-indexed)
 * @param {number} props.totalPages
 * @param {number} [props.total] - Total item count
 * @param {function} props.onPageChange - Callback with new page number
 * @param {boolean} [props.disabled=false]
 * @param {boolean} [props.showInfo=true]
 * @param {string} [props.className]
 */
export default function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
  disabled = false,
  showInfo = true,
  className = "",
}) {
  const { tn } = useTranslation();
  const classNames = ["ui-pagination", className].filter(Boolean).join(" ");

  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav className={classNames} aria-label={tn("Pagination")}>
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled || !hasPrev}
        onClick={() => onPageChange(page - 1)}
        aria-label={tn("Go to previous page")}
      >
        {tn("Previous")}
      </Button>

      {showInfo && (
        <span className="ui-pagination__info" aria-live="polite">
          {tn("Page {page} of {totalPages}", { page, totalPages })}
          {typeof total === "number" && ` \u00B7 ${tn("{count} total", { count: total })}`}
        </span>
      )}

      <Button
        variant="ghost"
        size="sm"
        disabled={disabled || !hasNext}
        onClick={() => onPageChange(page + 1)}
        aria-label={tn("Go to next page")}
      >
        {tn("Next")}
      </Button>
    </nav>
  );
}
