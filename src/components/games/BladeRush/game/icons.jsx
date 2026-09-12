/**
 * Blade Rush — small shared SVG icons. Kept in one place so Stage Select,
 * the Blades screen and the Main Menu draw the same lock/boss/blade marks.
 */
export function LockIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2" fill="currentColor" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function BossIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" {...props}>
      <path d="M12 2 4 7v6c0 5 4 8 8 9 4-1 8-4 8-9V7l-8-5Z" fill="currentColor" />
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

export function BladeIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...props}>
      <path d="M4 20 15 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M13 7.5 20 3l1 1-4.5 7L13 12l-1.5-1.5Z" fill="currentColor" />
      <path d="M4 20l2.4-.6.6-2.4Z" fill="currentColor" />
    </svg>
  );
}
