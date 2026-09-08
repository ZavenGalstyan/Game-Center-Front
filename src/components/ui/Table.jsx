/**
 * Table component with semantic markup and styling hooks.
 *
 * @param {object} props
 * @param {string} [props.className]
 * @param {React.ReactNode} props.children
 */
export default function Table({ className = "", children }) {
  const classNames = ["ui-table-wrap", className].filter(Boolean).join(" ");

  return (
    <div className={classNames}>
      <table className="ui-table">{children}</table>
    </div>
  );
}

/**
 * TableHead component for table header.
 */
export function TableHead({ children, className = "" }) {
  const classNames = ["ui-table__head", className].filter(Boolean).join(" ");
  return <thead className={classNames}>{children}</thead>;
}

/**
 * TableBody component for table body.
 */
export function TableBody({ children, className = "" }) {
  const classNames = ["ui-table__body", className].filter(Boolean).join(" ");
  return <tbody className={classNames}>{children}</tbody>;
}

/**
 * TableRow component for table rows.
 */
export function TableRow({ children, className = "", ...rest }) {
  const classNames = ["ui-table__row", className].filter(Boolean).join(" ");
  return (
    <tr className={classNames} {...rest}>
      {children}
    </tr>
  );
}

/**
 * TableCell component for table cells.
 *
 * @param {object} props
 * @param {boolean} [props.header=false]
 * @param {"left" | "center" | "right"} [props.align="left"]
 * @param {number} [props.colSpan]
 * @param {string} [props.className]
 */
export function TableCell({
  header = false,
  align = "left",
  colSpan,
  className = "",
  children,
  ...rest
}) {
  const Tag = header ? "th" : "td";
  const classNames = [
    header ? "ui-table__th" : "ui-table__td",
    align !== "left" && `ui-table__cell--${align}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag className={classNames} colSpan={colSpan} {...rest}>
      {children}
    </Tag>
  );
}

/**
 * TableEmptyRow component for displaying empty state within table.
 */
export function TableEmptyRow({ colSpan, children, className = "" }) {
  const classNames = ["ui-table__empty", className].filter(Boolean).join(" ");
  return (
    <tr>
      <td colSpan={colSpan} className={classNames}>
        {children}
      </td>
    </tr>
  );
}
