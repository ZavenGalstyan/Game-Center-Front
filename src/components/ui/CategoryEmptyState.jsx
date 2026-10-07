/**
 * CategoryEmptyState - Polished empty state for empty game categories.
 *
 * Features:
 * - Dark emerald card with subtle glow
 * - Game controller illustration with floating elements
 * - Friendly messaging
 * - Optional "coming soon" pill
 */
export default function CategoryEmptyState() {
  return (
    <div className="category-empty-state">
      {/* Game controller illustration with floating elements */}
      <div className="category-empty-state__illustration" aria-hidden="true">
        <svg viewBox="0 0 90 90" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Subtle glow behind controller */}
          <circle cx="45" cy="48" r="28" fill="rgba(0, 232, 143, 0.06)" />

          {/* Floating sparkle - top left */}
          <g transform="translate(12, 18)">
            <path d="M4 0 L4.8 3.2 L8 4 L4.8 4.8 L4 8 L3.2 4.8 L0 4 L3.2 3.2 Z"
                  fill="rgba(0, 232, 143, 0.5)" />
          </g>

          {/* Floating sparkle - top right */}
          <g transform="translate(68, 12)">
            <path d="M3 0 L3.6 2.4 L6 3 L3.6 3.6 L3 6 L2.4 3.6 L0 3 L2.4 2.4 Z"
                  fill="rgba(0, 232, 143, 0.4)" />
          </g>

          {/* Small floating square - left */}
          <rect x="8" y="42" width="6" height="6" rx="1"
                fill="rgba(0, 232, 143, 0.25)"
                transform="rotate(-15 11 45)" />

          {/* Small floating circle - right */}
          <circle cx="78" cy="38" r="4" fill="rgba(0, 232, 143, 0.2)" />

          {/* Tiny dot - bottom right */}
          <circle cx="72" cy="62" r="2.5" fill="rgba(0, 232, 143, 0.3)" />

          {/* Game Controller - main body */}
          <g transform="translate(22, 32)">
            {/* Controller body */}
            <path d="M4 12 C4 6 8 2 16 2 L30 2 C38 2 42 6 42 12 L42 20 C42 24 40 28 36 28 L32 28 C28 28 26 26 24 24 L22 24 C20 26 18 28 14 28 L10 28 C6 28 4 24 4 20 Z"
                  stroke="rgba(0, 232, 143, 0.6)"
                  strokeWidth="2"
                  fill="rgba(0, 232, 143, 0.08)"
                  strokeLinecap="round"
                  strokeLinejoin="round" />

            {/* Left grip */}
            <path d="M8 20 L4 26 C3 28 4 30 6 30 L10 30 C12 30 13 28 13 26 L13 22"
                  stroke="rgba(0, 232, 143, 0.5)"
                  strokeWidth="1.5"
                  fill="rgba(0, 232, 143, 0.05)"
                  strokeLinecap="round" />

            {/* Right grip */}
            <path d="M38 20 L42 26 C43 28 42 30 40 30 L36 30 C34 30 33 28 33 26 L33 22"
                  stroke="rgba(0, 232, 143, 0.5)"
                  strokeWidth="1.5"
                  fill="rgba(0, 232, 143, 0.05)"
                  strokeLinecap="round" />

            {/* D-pad */}
            <rect x="10" y="10" width="3" height="9" rx="0.5" fill="rgba(0, 232, 143, 0.4)" />
            <rect x="7" y="13" width="9" height="3" rx="0.5" fill="rgba(0, 232, 143, 0.4)" />

            {/* Action buttons */}
            <circle cx="34" cy="10" r="2.5" fill="rgba(0, 232, 143, 0.35)" />
            <circle cx="38" cy="14" r="2.5" fill="rgba(0, 232, 143, 0.45)" />
            <circle cx="34" cy="18" r="2.5" fill="rgba(0, 232, 143, 0.35)" />
            <circle cx="30" cy="14" r="2.5" fill="rgba(0, 232, 143, 0.3)" />

            {/* Center details */}
            <rect x="19" y="12" width="8" height="4" rx="1" fill="rgba(0, 232, 143, 0.2)" />
          </g>

          {/* Small floating triangle - bottom left */}
          <path d="M18 68 L22 74 L14 74 Z"
                fill="rgba(0, 232, 143, 0.2)" />
        </svg>
      </div>

      {/* Title */}
      <h3 className="category-empty-state__title">No games here yet</h3>

      {/* Message */}
      <p className="category-empty-state__message">
        We're getting this category ready. New games will appear here soon.
      </p>

      {/* Coming soon pill */}
      <div className="category-empty-state__pill">
        <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 1 L9.2 5.8 L14 7 L9.2 8.2 L8 13 L6.8 8.2 L2 7 L6.8 5.8 Z"
                fill="currentColor" />
        </svg>
        <span>More games coming soon</span>
      </div>
    </div>
  );
}
