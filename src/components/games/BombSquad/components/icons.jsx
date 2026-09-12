/**
 * Bomb Squad — small shared SVG icons, plus the 8 original fictional
 * symbols used by Symbol Match and Sequence Lock (data/symbols.js defines
 * their ids + values; this is only the artwork).
 */
export function LockIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2" fill="currentColor" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function CheckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" {...props}>
      <path d="M5 12.5 10 17l9-10" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WarningIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" {...props}>
      <path d="M12 3 22 20H2Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 9v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
  );
}

const SYMBOL_PATHS = {
  triDot: (
    <>
      <path d="M12 4 20 19H4Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12" cy="14" r="1.4" fill="currentColor" />
    </>
  ),
  bars: (
    <>
      <rect x="4" y="6" width="16" height="2.6" rx="1.2" fill="currentColor" />
      <rect x="4" y="11" width="16" height="2.6" rx="1.2" fill="currentColor" />
      <rect x="4" y="16" width="16" height="2.6" rx="1.2" fill="currentColor" />
    </>
  ),
  moon: <path d="M15 4a9 9 0 1 0 0 16 7 7 0 0 1 0-16Z" fill="currentColor" />,
  diamond: (
    <>
      <path d="M12 3 20 12 12 21 4 12Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M6 12h12" stroke="currentColor" strokeWidth="1.4" />
    </>
  ),
  hexMark: (
    <path d="M12 3 20 7.5v9L12 21 4 16.5v-9Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  ),
  arcSplit: (
    <>
      <path d="M4 8a10 10 0 0 1 16 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4 16a10 10 0 0 0 16 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  crossRing: (
    <>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7v10M7 12h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  spiral: (
    <path
      d="M12 12c0 1.7 1.3 3 3 3s3-1.3 3-3-1.3-3-3-3-3 1.3-3 3-1.3 6-6 6-6-2.7-6-6 2.7-6 6-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  ),
};

const MODULE_ICON_PATHS = {
  colorWires: <path d="M4 7c4 0 4 10 8 10s4-10 8-10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />,
  symbolMatch: <><rect x="4" y="5" width="16" height="4" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="8" cy="16" r="2.4" fill="currentColor" /><circle cx="16" cy="16" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.6" /></>,
  switchOrder: <><rect x="5" y="4" width="6" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="8" cy="8" r="1.6" fill="currentColor" /><rect x="13" y="4" width="6" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="16" cy="16" r="1.6" fill="currentColor" /></>,
  memoryLights: <><circle cx="7" cy="12" r="3" fill="currentColor" /><circle cx="17" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" /></>,
  rotaryDial: <><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M12 12 12 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></>,
  signalRouter: <><circle cx="5" cy="12" r="2" fill="currentColor" /><path d="M7 12h6l3-5" stroke="currentColor" strokeWidth="1.6" fill="none" /><circle cx="19" cy="7" r="2" fill="none" stroke="currentColor" strokeWidth="1.6" /></>,
  codeChip: <><rect x="5" y="5" width="14" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M9 5V2M15 5V2M9 22v-3M15 22v-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></>,
  pressureBar: <><rect x="3" y="10" width="18" height="4" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" /><rect x="10" y="10" width="4" height="4" rx="1" fill="currentColor" /></>,
  gridLink: <><path d="M4 4h4v4H4zM16 16h4v4h-4z" fill="currentColor" /><path d="M6 8v8M6 16h10M14 16V8" stroke="currentColor" strokeWidth="1.4" fill="none" /></>,
  sequenceLock: <><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="12" cy="5" r="1.4" fill="currentColor" /><circle cx="19" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="19" r="1.4" fill="currentColor" /></>,
};

export function ModuleIcon({ type, ...props }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...props}>
      {MODULE_ICON_PATHS[type] || null}
    </svg>
  );
}

export function SymbolIcon({ id, value, showValue = false, ...props }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...props}>
      {SYMBOL_PATHS[id] || null}
      {showValue &&
        Array.from({ length: value || 0 }, (_, i) => (
          <circle key={i} cx={3 + i * 2.4} cy={22.5} r="0.9" fill="currentColor" />
        ))}
    </svg>
  );
}
