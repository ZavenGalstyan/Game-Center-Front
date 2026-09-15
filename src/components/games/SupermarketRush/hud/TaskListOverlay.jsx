/**
 * Supermarket Rush — the full shift task list, shown while Tab is held.
 */
export default function TaskListOverlay({ tasks }) {
  return (
    <div className="sr-tasklist">
      <div className="sr-tasklist__card">
        <h3>Shift Tasks</h3>
        <ul>
          {tasks.map((t) => (
            <li key={t.id} className={t.done ? "sr-tasklist__done" : ""}>
              <span>{t.label}</span>
              <span>{t.done ? "✓" : `${t.current}/${t.required}`}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
