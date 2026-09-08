/**
 * Tabs component for tabbed navigation.
 *
 * @param {object} props
 * @param {Array<{id: string, label: string}>} props.tabs
 * @param {string} props.activeTab
 * @param {function} props.onChange - Callback with tab id
 * @param {"default" | "pills"} [props.variant="default"]
 * @param {string} [props.className]
 */
export default function Tabs({
  tabs,
  activeTab,
  onChange,
  variant = "default",
  className = "",
}) {
  const classNames = ["ui-tabs", `ui-tabs--${variant}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classNames} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          className={`ui-tabs__tab ${activeTab === tab.id ? "ui-tabs__tab--active" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/**
 * TabPanel component for tab content.
 *
 * @param {object} props
 * @param {string} props.id
 * @param {boolean} [props.active=false]
 * @param {string} [props.className]
 * @param {React.ReactNode} props.children
 */
export function TabPanel({ id, active = false, className = "", children }) {
  if (!active) return null;

  const classNames = ["ui-tab-panel", className].filter(Boolean).join(" ");

  return (
    <div id={id} role="tabpanel" className={classNames}>
      {children}
    </div>
  );
}
