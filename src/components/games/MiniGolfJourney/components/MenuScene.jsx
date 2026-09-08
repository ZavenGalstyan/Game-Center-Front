/**
 * Mini Golf Journey — main-menu backdrop.
 *
 * A layered CSS + SVG mini-golf landscape (no image assets): sky gradient with
 * a soft sun and drifting clouds, three rolling hill ridges, trees and bushes,
 * a winding course path, small obstacles, and a golf ball lined up on a flag
 * and cup. It should read instantly as "a mini-golf game" before a single
 * word of the title is seen. Decorative only — pointer-events: none.
 */
export default function MenuScene({ animate = true }) {
  return (
    <div className={`mgj-menuscene ${animate ? "" : "is-still"}`} aria-hidden="true">
      <svg viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid slice" className="mgj-menuscene__svg">
        <defs>
          <linearGradient id="mgj-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6cc4ef" />
            <stop offset="0.5" stopColor="#a9def0" />
            <stop offset="1" stopColor="#e7f6ec" />
          </linearGradient>
          <radialGradient id="mgj-sun" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fffdf2" />
            <stop offset="0.45" stopColor="#ffe9a8" />
            <stop offset="1" stopColor="rgba(255,233,168,0)" />
          </radialGradient>
          <linearGradient id="mgj-hill-far" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8ed07a" />
            <stop offset="1" stopColor="#6fbb60" />
          </linearGradient>
          <linearGradient id="mgj-hill-mid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6cbf5c" />
            <stop offset="1" stopColor="#4faa4a" />
          </linearGradient>
          <linearGradient id="mgj-green" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#63c06d" />
            <stop offset="1" stopColor="#3f9950" />
          </linearGradient>
          <radialGradient id="mgj-vig" cx="0.5" cy="0.42" r="0.75">
            <stop offset="0.55" stopColor="rgba(0,0,0,0)" />
            <stop offset="1" stopColor="rgba(6,20,14,0.42)" />
          </radialGradient>
        </defs>

        <rect width="1000" height="560" fill="url(#mgj-sky)" />
        <circle cx="792" cy="118" r="190" fill="url(#mgj-sun)" />
        <circle cx="792" cy="118" r="46" fill="#fff6dc" />

        <g className="mgj-menuscene__clouds" fill="#ffffff">
          <g opacity="0.9">
            <ellipse cx="180" cy="120" rx="54" ry="20" />
            <ellipse cx="220" cy="110" rx="40" ry="22" />
            <ellipse cx="140" cy="112" rx="34" ry="17" />
          </g>
          <g opacity="0.75">
            <ellipse cx="560" cy="80" rx="46" ry="17" />
            <ellipse cx="596" cy="72" rx="34" ry="18" />
          </g>
          <g opacity="0.6">
            <ellipse cx="900" cy="180" rx="40" ry="15" />
            <ellipse cx="930" cy="172" rx="28" ry="15" />
          </g>
        </g>

        {/* rolling hills */}
        <path d="M0 300 Q 220 232 460 292 T 1000 268 L1000 560 L0 560 Z" fill="url(#mgj-hill-far)" opacity="0.9" />
        <path d="M0 356 Q 260 300 520 352 T 1000 336 L1000 560 L0 560 Z" fill="#5cae51" />
        <path d="M0 560 Q 300 388 620 452 Q 820 492 1000 430 L1000 560 Z" fill="url(#mgj-green)" />

        {/* distant trees */}
        <g className="mgj-menuscene__trees-far">
          {[120, 300, 720, 880].map((x, i) => (
            <g key={i} transform={`translate(${x} ${300 + (i % 2) * 8})`}>
              <rect x="-4" y="-2" width="8" height="26" fill="#4f7a3f" />
              <circle cx="0" cy="-14" r="22" fill="#5da84e" />
              <circle cx="-13" cy="-4" r="15" fill="#5da84e" />
              <circle cx="13" cy="-4" r="15" fill="#5da84e" />
            </g>
          ))}
        </g>

        {/* the course path winding to the hole */}
        <path
          d="M-40 520 C 160 470 150 388 340 372 C 520 356 540 452 700 440 C 820 431 860 372 940 360"
          fill="none"
          stroke="#7cc873"
          strokeWidth="86"
          strokeLinecap="round"
          opacity="0.55"
        />
        <path
          d="M-40 520 C 160 470 150 388 340 372 C 520 356 540 452 700 440 C 820 431 860 372 940 360"
          fill="none"
          stroke="#6bbf63"
          strokeWidth="60"
          strokeLinecap="round"
        />
        <path
          d="M-40 520 C 160 470 150 388 340 372 C 520 356 540 452 700 440 C 820 431 860 372 940 360"
          fill="none"
          stroke="#f4efd8"
          strokeWidth="60"
          strokeLinecap="round"
          strokeDasharray="2 26"
          opacity="0.5"
        />

        {/* foreground trees + bushes */}
        <g className="mgj-menuscene__tree">
          <ellipse cx="120" cy="520" rx="52" ry="14" fill="rgba(0,0,0,0.18)" />
          <rect x="110" y="452" width="20" height="72" fill="#6b482c" />
          <circle cx="120" cy="440" r="46" fill="#4f9e46" />
          <circle cx="86" cy="464" r="30" fill="#57ad4d" />
          <circle cx="152" cy="462" r="32" fill="#489a40" />
          <circle cx="108" cy="424" r="18" fill="rgba(255,255,255,0.18)" />
        </g>
        <g>
          <ellipse cx="470" cy="486" rx="40" ry="11" fill="rgba(0,0,0,0.16)" />
          <circle cx="452" cy="474" r="20" fill="#5aad4f" />
          <circle cx="472" cy="468" r="24" fill="#4f9e46" />
          <circle cx="492" cy="476" r="18" fill="#57ad4d" />
        </g>

        {/* rocks / obstacle near path */}
        <g>
          <ellipse cx="600" cy="418" rx="30" ry="9" fill="rgba(0,0,0,0.16)" />
          <path d="M574 416 Q 586 396 604 400 Q 622 404 626 416 Z" fill="#a9adb4" />
          <path d="M574 416 Q 590 408 626 416 Z" fill="#8a8f97" />
        </g>
        <g>
          {[[250, 402], [300, 500], [790, 470]].map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <line x1="0" y1="0" x2="0" y2="-14" stroke="#3f7d3a" strokeWidth="2" />
              {[0, 1, 2, 3, 4].map((k) => {
                const a = (k / 5) * Math.PI * 2;
                return (
                  <circle
                    key={k}
                    cx={Math.cos(a) * 5}
                    cy={-14 + Math.sin(a) * 5}
                    r="3.4"
                    fill={i % 2 ? "#f2b3d0" : "#f4c744"}
                  />
                );
              })}
              <circle cx="0" cy="-14" r="2.6" fill="#fff3c4" />
            </g>
          ))}
        </g>

        {/* the cup, flag and ball — the "this is mini golf" moment */}
        <g transform="translate(858 352)">
          <ellipse cx="4" cy="10" rx="26" ry="8" fill="rgba(0,0,0,0.2)" />
          <ellipse cx="0" cy="6" rx="15" ry="8" fill="#1c130a" />
          <path d="M-15 6 A 15 8 0 0 1 15 6" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" />
          <path className="mgj-menuscene__pole" d="M0 4 L0 -92" stroke="#efe9d9" strokeWidth="5" strokeLinecap="round" />
          <path className="mgj-menuscene__flag" d="M0 -90 Q 44 -80 66 -70 Q 40 -58 0 -52 Z" fill="#e8442f" />
        </g>
        <g className="mgj-menuscene__ball" transform="translate(360 388)">
          <ellipse cx="3" cy="16" rx="18" ry="6" fill="rgba(0,0,0,0.24)" />
          <circle cx="0" cy="0" r="15" fill="#f4f6f8" />
          <circle cx="0" cy="0" r="15" fill="url(#mgj-ballshade)" />
          <circle cx="-5" cy="-6" r="4.5" fill="rgba(255,255,255,0.9)" />
        </g>
        <radialGradient id="mgj-ballshade" cx="0.36" cy="0.34" r="0.72">
          <stop offset="0" stopColor="rgba(255,255,255,0)" />
          <stop offset="1" stopColor="rgba(150,160,175,0.55)" />
        </radialGradient>

        <rect width="1000" height="560" fill="url(#mgj-vig)" />
      </svg>
    </div>
  );
}
