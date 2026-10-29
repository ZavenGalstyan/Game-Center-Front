/** Last Shelter — small SVG icons for items, resources and UI. */
const P = {
  water: (
    <>
      <path d="M9,22 L9,9 Q9,6 11,5 L11,2 L13,2 L13,5 Q15,6 15,9 L15,22Z" fill="#8fd3ff" stroke="#3f8fb5" strokeWidth="1.2" />
      <rect x="9" y="12" width="6" height="4" fill="#fff" opacity="0.8" />
    </>
  ),
  food: (
    <>
      <rect x="5" y="5" width="14" height="16" rx="2" fill="#c9ced3" />
      <rect x="5" y="9" width="14" height="8" fill="#b2402f" />
      <ellipse cx="12" cy="5" rx="7" ry="2" fill="#e6e9ec" />
    </>
  ),
  meds: (
    <>
      <rect x="3" y="6" width="18" height="14" rx="3" fill="#e04b4b" />
      <rect x="10.5" y="8.5" width="3" height="9" fill="#fff" />
      <rect x="7.5" y="11.5" width="9" height="3" fill="#fff" />
    </>
  ),
  batteries: (
    <>
      <rect x="6" y="5" width="5" height="15" rx="1" fill="#3fa05a" />
      <rect x="13" y="5" width="5" height="15" rx="1" fill="#3fa05a" />
      <rect x="7.5" y="3" width="2" height="2" fill="#d4af37" />
      <rect x="14.5" y="3" width="2" height="2" fill="#d4af37" />
    </>
  ),
  flashlight: (
    <>
      <rect x="3" y="10" width="12" height="5" rx="2" fill="#f2c94c" />
      <path d="M15,8 L20,6 L20,19 L15,17Z" fill="#333" />
      <path d="M20,9 L23,8 M20,12.5 L23.5,12.5 M20,16 L23,17" stroke="#ffe9a0" strokeWidth="1.2" />
    </>
  ),
  radio: (
    <>
      <rect x="2" y="8" width="20" height="13" rx="3" fill="#8a6d4b" />
      <circle cx="8" cy="14.5" r="4" fill="#3b2f25" />
      <rect x="14" y="11" width="6" height="4" rx="1" fill="#ffe7a1" />
      <path d="M18,8 L22,2" stroke="#bbb" strokeWidth="1.4" />
    </>
  ),
  toolkit: (
    <>
      <rect x="2" y="9" width="20" height="11" rx="2" fill="#c0392b" />
      <path d="M8,9 Q12,3 16,9" stroke="#333" strokeWidth="2" fill="none" />
      <rect x="2" y="13" width="20" height="1.5" fill="#922b21" />
    </>
  ),
  map: (
    <>
      <path d="M2,6 L8,4 L16,6 L22,4 L22,19 L16,21 L8,19 L2,21Z" fill="#e2cf9a" stroke="#b39c62" strokeWidth="1" />
      <path d="M8,4 L8,19 M16,6 L16,21" stroke="#b39c62" strokeWidth="1" />
      <circle cx="13" cy="11" r="1.8" fill="#e63946" />
    </>
  ),
  gasmask: (
    <>
      <ellipse cx="12" cy="11" rx="8" ry="9" fill="#4d5a4a" />
      <circle cx="9" cy="9" r="2.6" fill="#b8e0d2" />
      <circle cx="15" cy="9" r="2.6" fill="#b8e0d2" />
      <rect x="9.5" y="15" width="5" height="7" rx="2" fill="#2f3a2d" />
    </>
  ),
  books: (
    <>
      <rect x="3" y="15" width="18" height="5" rx="1" fill="#6b4fa0" />
      <rect x="4" y="10" width="16" height="5" rx="1" fill="#e07a5f" />
      <rect x="5" y="5" width="14" height="5" rx="1" fill="#3d5a80" />
    </>
  ),
  backpack: (
    <>
      <rect x="5" y="6" width="14" height="16" rx="5" fill="#7a8f3a" />
      <rect x="8" y="13" width="8" height="6" rx="2" fill="#5f7030" />
      <path d="M9,6 Q12,1 15,6" stroke="#3f4a1f" strokeWidth="1.6" fill="none" />
    </>
  ),
  medkit: null,
  shelter: (
    <>
      <path d="M2,20 L2,11 Q12,2 22,11 L22,20Z" fill="#857b6a" />
      <rect x="10" y="13" width="4" height="7" fill="#2b2622" />
    </>
  ),
  radioSignal: null,
  heart: <path d="M12,21 C4,15 2,11 4,7 C6,4 10,4 12,8 C14,4 18,4 20,7 C22,11 20,15 12,21Z" fill="#e63946" />,
  hunger: (
    <>
      <path d="M7,3 L7,10 Q7,12 9,12 L9,21" stroke="#d9963a" strokeWidth="2" fill="none" />
      <path d="M5,3 L5,9 M9,3 L9,9" stroke="#d9963a" strokeWidth="1.5" />
      <path d="M16,3 Q20,8 16,12 L16,21" stroke="#d9963a" strokeWidth="2" fill="none" />
    </>
  ),
  thirst: <path d="M12,3 Q5,12 6,15 Q7,21 12,21 Q17,21 18,15 Q19,12 12,3Z" fill="#5cb8e6" />,
  morale: (
    <>
      <circle cx="12" cy="12" r="9" fill="#f4d35e" />
      <circle cx="9" cy="10" r="1.3" fill="#333" />
      <circle cx="15" cy="10" r="1.3" fill="#333" />
      <path d="M8,14 Q12,18 16,14" stroke="#333" strokeWidth="1.6" fill="none" />
    </>
  ),
  energy: <path d="M13,2 L5,13 L11,13 L9,22 L19,9 L13,9Z" fill="#9b8bd6" />,
  pause: (
    <>
      <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" />
      <rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" />
    </>
  ),
  check: <path d="M4,12 L10,18 L20,6" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  journal: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" fill="currentColor" opacity="0.85" />
      <path d="M8,8 L16,8 M8,12 L16,12 M8,16 L13,16" stroke="#1d1712" strokeWidth="1.6" />
    </>
  ),
  family: (
    <>
      <circle cx="8" cy="8" r="3" fill="currentColor" />
      <circle cx="16" cy="9" r="2.5" fill="currentColor" />
      <path d="M3,20 Q3,13 8,13 Q13,13 13,20Z M12,20 Q12,14 16,14 Q21,14 21,20Z" fill="currentColor" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="18" r="2.5" fill="currentColor" />
      <circle cx="18" cy="6" r="2.5" fill="currentColor" />
      <path d="M6,15 Q6,10 12,10 Q18,10 18,9" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="3 2" />
    </>
  ),
  crate: (
    <>
      <rect x="3" y="6" width="18" height="14" rx="1.5" fill="currentColor" />
      <path d="M3,11 L21,11 M3,15.5 L21,15.5" stroke="#1d1712" strokeWidth="1.4" />
    </>
  ),
};
P.medkit = P.meds;

export function Icon({ name, size = 20, className = "", title }) {
  const body = P[name];
  if (!body) return null;
  return (
    <svg className={`lsh-icon ${className}`} viewBox="0 0 24 24" width={size} height={size} aria-hidden={title ? undefined : "true"} role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      {body}
    </svg>
  );
}
