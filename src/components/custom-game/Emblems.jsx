// Original decorative SVG emblems for the custom game request dialogs.
// All are aria-hidden; meaning is always carried by the surrounding text.

/** Stylised gamepad body in a 64×40 box. */
export const GAMEPAD_PATH =
  "M18 4h28c7 0 11.5 4.5 13 11l3.6 14.5C64 35 60.5 39 56 39c-3 0-5.4-1.6-7-4l-3-4.6H18l-3 4.6c-1.6 2.4-4 4-7 4-4.5 0-8-4-6.6-9.5L5 15C6.5 8.5 11 4 18 4Z";

function Sparkle({ x, y, s = 1, className = "" }) {
  return (
    <path
      className={className}
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M0-6C.6-1.6 1.6-.6 6 0 1.6.6.6 1.6 0 6-.6 1.6-1.6.6-6 0-1.6-.6-.6-1.6 0-6Z"
    />
  );
}

/** Mini gamepad with D-pad and face buttons, drawn at the origin (64×40). */
function MiniPad({ id }) {
  return (
    <g>
      <path d={GAMEPAD_PATH} fill={`url(#${id}-pad)`} stroke={`url(#${id}-rim)`} strokeWidth="1.6" />
      <path d="M14 15h4v4h4v4h-4v4h-4v-4h-4v-4h4z" fill="#CFFFEA" opacity="0.9" />
      <circle cx="46" cy="15" r="2.4" fill="#5BF2FF" />
      <circle cx="51.5" cy="20" r="2.4" fill="#00E88F" />
      <circle cx="46" cy="25" r="2.4" fill="#A8F5D4" />
      <circle cx="40.5" cy="20" r="2.4" fill="#20F0A0" />
      <rect x="27" y="10" width="10" height="2.4" rx="1.2" fill="#00E88F" opacity="0.8" />
    </g>
  );
}

function PadDefs({ id }) {
  return (
    <>
      <linearGradient id={`${id}-pad`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#0E3B33" />
        <stop offset="1" stopColor="#04130F" />
      </linearGradient>
      <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#65FFC0" />
        <stop offset="1" stopColor="#3BD8FF" />
      </linearGradient>
    </>
  );
}

/** "Your Game Starts Here" — a portal powering up above a pedestal. */
export function PortalEmblem() {
  const id = "cg-portal";
  return (
    <svg className="cg-emblem cg-emblem--portal" viewBox="0 0 160 140" aria-hidden="true" focusable="false">
      <defs>
        <PadDefs id={id} />
        <radialGradient id={`${id}-floor`}>
          <stop offset="0" stopColor="#00E88F" stopOpacity="0.45" />
          <stop offset="1" stopColor="#00E88F" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-beam`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#20F0A0" stopOpacity="0.38" />
          <stop offset="1" stopColor="#3BD8FF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#65FFC0" />
          <stop offset="0.55" stopColor="#00E88F" />
          <stop offset="1" stopColor="#3BD8FF" />
        </linearGradient>
        <linearGradient id={`${id}-top`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#14684F" />
          <stop offset="1" stopColor="#0A3A2E" />
        </linearGradient>
      </defs>
      <ellipse cx="80" cy="122" rx="60" ry="13" fill={`url(#${id}-floor)`} />
      {/* pedestal */}
      <path d="M44 108 80 126v10l-36-18z" fill="#062A21" />
      <path d="M116 108 80 126v10l36-18z" fill="#041A15" />
      <path d="M44 108 80 90l36 18-36 18z" fill={`url(#${id}-top)`} stroke="#20F0A0" strokeOpacity="0.5" />
      <path d="M58 108 80 97l22 11-22 11z" fill="none" stroke="#65FFC0" strokeOpacity="0.55" />
      {/* beam */}
      <path className="cg-emblem__beam" d="M60 106h40l-8-66H68z" fill={`url(#${id}-beam)`} />
      {/* portal */}
      <g className="cg-emblem__float">
        <circle cx="80" cy="56" r="36" fill="#031512" opacity="0.85" />
        <circle cx="80" cy="56" r="36" fill="none" stroke={`url(#${id}-ring)`} strokeWidth="3" />
        <circle className="cg-emblem__spin" cx="80" cy="56" r="28" fill="none" stroke="#3BD8FF" strokeOpacity="0.5" strokeWidth="1.2" strokeDasharray="3 7" />
        <g transform="translate(55 37) scale(0.78)">
          <MiniPad id={id} />
        </g>
      </g>
      <g fill="#A8F5D4">
        <Sparkle x={132} y={30} s={1.1} className="cg-emblem__twinkle" />
        <Sparkle x={26} y={46} s={0.8} className="cg-emblem__twinkle cg-emblem__twinkle--late" />
        <Sparkle x={128} y={88} s={0.6} className="cg-emblem__twinkle cg-emblem__twinkle--mid" />
      </g>
      <path d="M18 94l8-4 8 4-8 4z" fill="#0A3A2E" stroke="#3BD8FF" strokeOpacity="0.6" />
    </svg>
  );
}

/** Compact header tile for the request form. */
export function CommissionBadge() {
  const id = "cg-badge";
  return (
    <svg className="cg-emblem cg-emblem--badge" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <PadDefs id={id} />
        <linearGradient id={`${id}-tile`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0C4637" />
          <stop offset="1" stopColor="#041714" />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#65FFC0" />
          <stop offset="1" stopColor="#3BD8FF" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${id}-tile)`} stroke={`url(#${id}-edge)`} strokeWidth="1.5" />
      <path d="M10 46h44" stroke="#00E88F" strokeOpacity="0.18" />
      <path d="M10 52h44" stroke="#00E88F" strokeOpacity="0.1" />
      <g transform="translate(13 18) scale(0.6)">
        <MiniPad id={id} />
      </g>
      <g fill="#65FFC0">
        <Sparkle x={50} y={14} s={0.9} className="cg-emblem__twinkle" />
      </g>
    </svg>
  );
}

/** "Request received!" — the request has left the launch pad. */
export function LaunchedEmblem() {
  const id = "cg-sent";
  return (
    <svg className="cg-emblem cg-emblem--launch" viewBox="0 0 160 140" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${id}-floor`}>
          <stop offset="0" stopColor="#00E88F" stopOpacity="0.3" />
          <stop offset="1" stopColor="#00E88F" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-plane`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E8FFF5" />
          <stop offset="1" stopColor="#7DEFC4" />
        </linearGradient>
        <linearGradient id={`${id}-top`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#14684F" />
          <stop offset="1" stopColor="#0A3A2E" />
        </linearGradient>
      </defs>
      <ellipse cx="80" cy="120" rx="62" ry="13" fill={`url(#${id}-floor)`} />
      {/* flight path — taken */}
      <path className="cg-emblem__path" d="M70 104C84 88 98 70 112 54" fill="none" stroke="#20F0A0" strokeOpacity="0.7" strokeWidth="1.8" strokeDasharray="2 6" strokeLinecap="round" />
      <Sparkle x={134} y={24} s={0.9} className="cg-emblem__twinkle" />
      <Sparkle x={58} y={70} s={0.6} className="cg-emblem__twinkle cg-emblem__twinkle--late" />
      {/* pad */}
      <path d="M36 108 80 130v8L36 116z" fill="#062A21" />
      <path d="M124 108 80 130v8l44-22z" fill="#041A15" />
      <path d="M36 108 80 86l44 22-44 22z" fill={`url(#${id}-top)`} stroke="#20F0A0" strokeOpacity="0.45" />
      <path d="M54 108 80 95l26 13-26 13z" fill="none" stroke="#00E88F" strokeOpacity="0.55" strokeDasharray="3 4" />
      {/* paper plane, in flight */}
      <g transform="translate(112 46) scale(1.15) translate(-80 -92)">
        <g className="cg-emblem__float">
          <path d="M52 100 110 76 86 108l-8-10z" fill={`url(#${id}-plane)`} />
          <path d="M52 100l26-2 32-22z" fill="#C9FBE6" />
          <path d="M78 98l-2 14 10-4z" fill="#5FD6AE" />
        </g>
      </g>
      {/* check badge: received */}
      <g transform="translate(40 44)">
        <circle r="17" fill="#04241B" stroke="#00E88F" strokeWidth="2" />
        <path d="M-7 0l5 5 9-10" fill="none" stroke="#65FFC0" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
