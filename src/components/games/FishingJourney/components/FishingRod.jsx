/**
 * Fishing Journey — the dock, the seated angler and the rod, drawn as one
 * coherent SVG so the geometry stays aligned. Presentational only.
 *
 * The figure is a full illustrated person (boonie hat, jacket, trousers, boots,
 * both hands on the rod) shaded with SVG gradients as if lit from the sun in
 * the upper-right. The `phase` prop bends the rod via the `d` of
 * `.fj-rig__rod` / `.fj-rig__rod-hl`.
 *
 * viewBox 400×370, `preserveAspectRatio="none"`; the drawn box is 50%×82% of
 * the 16:9 stage. The scene's waterline lands at viewBox y ≈ 180. The rod tip
 * sits at (336,108) → `--tip-x` / `--tip-y` 42% / 42% so the line and <Bobber>
 * always connect.
 */
export default function FishingRod({ phase = "ready" }) {
  return (
    <div className={`fj-rod fj-rod--${phase}`} aria-hidden="true">
      <svg
        className="fj-rig"
        viewBox="0 0 400 370"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="fjSkin" x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0" stopColor="#e8bf92" />
            <stop offset="1" stopColor="#b58255" />
          </linearGradient>
          <linearGradient id="fjSkinDk" x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0" stopColor="#c99a6c" />
            <stop offset="1" stopColor="#8c6238" />
          </linearGradient>
          <linearGradient id="fjJacket" x1="0.1" y1="0" x2="0.9" y2="1">
            <stop offset="0" stopColor="#748e57" />
            <stop offset="0.55" stopColor="#4c6539" />
            <stop offset="1" stopColor="#33472a" />
          </linearGradient>
          <linearGradient id="fjJacketDk" x1="0.1" y1="0" x2="0.9" y2="1">
            <stop offset="0" stopColor="#546d42" />
            <stop offset="1" stopColor="#293a20" />
          </linearGradient>
          <linearGradient id="fjTrouser" x1="0.1" y1="0" x2="0.9" y2="1">
            <stop offset="0" stopColor="#8e8160" />
            <stop offset="1" stopColor="#4e4631" />
          </linearGradient>
          <linearGradient id="fjTrouserDk" x1="0.1" y1="0" x2="0.9" y2="1">
            <stop offset="0" stopColor="#6d6247" />
            <stop offset="1" stopColor="#39321f" />
          </linearGradient>
          <linearGradient id="fjBoot" x1="0" y1="0" x2="0.7" y2="1">
            <stop offset="0" stopColor="#5c4327" />
            <stop offset="1" stopColor="#23150a" />
          </linearGradient>
          <linearGradient id="fjHat" x1="0.1" y1="0" x2="0.8" y2="1">
            <stop offset="0" stopColor="#a68d5d" />
            <stop offset="1" stopColor="#5b4b2f" />
          </linearGradient>
          <linearGradient id="fjPlank" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#bd8b52" />
            <stop offset="1" stopColor="#7c5630" />
          </linearGradient>
          <linearGradient id="fjPlankFace" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7c5630" />
            <stop offset="1" stopColor="#4a331d" />
          </linearGradient>
          <linearGradient id="fjPiling" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#3a2718" />
            <stop offset="0.5" stopColor="#6d4c2d" />
            <stop offset="1" stopColor="#2e1f12" />
          </linearGradient>
          <linearGradient id="fjRodBlank" x1="0.1" y1="1" x2="1" y2="0.1">
            <stop offset="0" stopColor="#4a3320" />
            <stop offset="0.4" stopColor="#33383f" />
            <stop offset="1" stopColor="#101318" />
          </linearGradient>
          <linearGradient id="fjReel" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8b929b" />
            <stop offset="1" stopColor="#2b2f36" />
          </linearGradient>
          <clipPath id="fjWaterClip">
            <rect x="-60" y="180" width="520" height="220" />
          </clipPath>

          {/* the whole person, referenced twice: once real, once mirrored */}
          <g id="fjAngler">
            {/* far arm — upper, behind the torso */}
            <path
              className="fj-a__sleeve-dk"
              d="M118 118c9-2 17 3 20 12l3 10c1 6-3 11-9 11s-11-4-12-10l-2-11c-1-6 3-12 8-14l4 2Z"
            />
            {/* far leg */}
            <path
              className="fj-a__limb-dk"
              d="M108 158c12-3 25 1 34 11l9 11c4 5 3 11-1 14s-11 2-14-2l-8-12c-4-5-10-8-16-7-6 1-11-4-10-10 0-4 3-6 7-7l9-1Z"
            />
            <path
              className="fj-a__limb-dk"
              d="M138 182c7 3 10 10 10 19l1 15c0 5-4 9-9 9s-9-4-9-10l-1-13c0-5-3-9-7-11-4-2-4-9 1-10l13 2Z"
            />

            {/* torso / jacket */}
            <path
              className="fj-a__jacket"
              d="M108 118c-4-4 4-13 18-14 15-1 24 5 26 14 3 12 4 34 2 52-1 10-8 17-19 18l-16 1c-11 1-20-7-21-18-2-18-1-40 3-52 2-6 5-9 7-11l-2 8-1 2Z"
            />
            {/* lit chest panel */}
            <path
              className="fj-a__jacket-hi"
              d="M126 106c9 0 15 5 17 13 2 10 3 26 2 40-1 8-5 13-11 14l-6 1 1-68Z"
            />
            {/* collar */}
            <path
              className="fj-a__jacket-dk"
              d="M116 104l10 9 10-10 5 6-15 13-14-12 4-6Z"
            />
            {/* zip + hem shadow + chest pocket */}
            <path className="fj-a__seam" d="M126 110v66" />
            <path className="fj-a__seam" d="M104 164c14 7 32 7 46-1" />
            <path
              className="fj-a__pocket"
              d="M130 126h15a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z"
            />
            <path className="fj-a__seam" d="M128 129h19" />

            {/* near leg: thigh from under the hem, shin, boot */}
            <path
              className="fj-a__limb"
              d="M118 158c15-2 30 3 41 15l7 9c3 4 2 10-3 12-4 2-9 0-11-4l-5-7c-5-8-15-13-24-13-6 0-9-8-6-13l6-1Z"
            />
            <path
              className="fj-a__limb"
              d="M156 184c9 3 13 12 13 21l1 20c0 6-5 11-11 11s-11-5-11-12l-1-18c0-6-3-11-8-13-5-2-4-11 2-12l15 3Z"
            />
            <path
              className="fj-a__boot"
              d="M148 224c-5 6-7 14-4 21l31 3c6 1 12-4 12-10 0-5-4-9-9-10l-19-5c-4-1-8-1-11 1Z"
            />
            <path className="fj-a__boot-sole" d="M145 242l33 3 1 5-35-3Z" />

            {/* near arm: sleeve → forearm → grip, drawn last on the torso */}
            <path
              className="fj-a__sleeve"
              d="M136 106c9-1 16 5 18 15l3 18c1 7-3 13-10 14s-14-3-16-10l-4-16c-1-6 2-12 7-15l2-2 2-1Z"
            />
            <path
              className="fj-a__sleeve"
              d="M138 128c7-4 17-4 25 1l11 8c5 3 6 10 2 14s-11 4-15 0l-9-7c-5-4-12-5-17-3-5 1-9-4-8-9 1-3 3-5 6-6l3-1Z"
            />
            <path className="fj-a__cuff" d="M158 132l14 9-4 7-14-9Z" />

            {/* both hands as one clean grip on the rod */}
            <path
              className="fj-a__hand"
              d="M162 116c8-5 20-3 24 5 4 7 1 16-7 18-9 3-19-1-22-9-3-6-1-11 5-14Z"
            />
            <path className="fj-a__hand" d="M156 128c6-3 14-2 18 3-4 3-11 4-16 2-3-1-4-3-2-5Z" />
            <path
              className="fj-a__knuckle"
              d="M167 118c2 0 3 1 3 3M172 120c2 0 3 1 3 3M177 123c2 0 3 1 3 3"
            />

            {/* neck */}
            <path className="fj-a__neck" d="M119 90c1-3 14-3 15 0l1 18c0 4-17 4-17 0l1-18Z" />
            <path className="fj-a__neck-shade" d="M119 96c5 4 12 4 17 0l0 6c-5 4-12 4-17 0l0-6Z" />

            {/* head + hat, lifted a touch so the neck reads */}
            <g transform="translate(0 -5)">
              <path
                className="fj-a__head"
                d="M124 56c-13 1-21 12-19 27 1 9 5 17 12 21 6 4 14 4 20-1 5-4 8-11 9-19l1-13c1-14-8-24-21-25l-3 1c3 0 4 1 3 6l-2-1Z"
              />
              <path
                className="fj-a__head-shade"
                d="M107 78c-1 10 2 20 9 26 4 3 9 4 14 3-9-1-16-9-19-19-1-3-2-7-3-10l-1 0Z"
              />
              <path className="fj-a__nose" d="M141 82l6 6-6 5-2-5Z" />
              <path className="fj-a__brow" d="M131 74l8 1" />
              <ellipse className="fj-a__ear" cx="106" cy="84" rx="4.5" ry="6.5" />
              <path className="fj-a__ear-in" d="M105 81c2 1 3 4 2 7" />
              <path className="fj-a__hair" d="M104 86c-2 6-1 12 3 17l3-2c-2-5-4-10-3-15l-3 0Z" />
              <path
                className="fj-a__hat-crown"
                d="M103 66c-3-18 8-31 21-32 14-1 27 10 26 27l-1 8c-8-6-17-9-25-9-9 0-16 3-21 8l0-1Z"
              />
              <path
                className="fj-a__hat-brim"
                d="M92 68c7-9 22-13 33-13 12 0 27 4 34 12-5 9-20 13-34 13s-30-4-33-12Z"
              />
              <path className="fj-a__hat-brim-hi" d="M96 66c6-7 20-10 30-10 11 0 24 3 30 10" />
              <path
                className="fj-a__hat-band"
                d="M105 64c5-4 13-7 19-7 7 0 15 3 20 7l-2 6c-6-4-12-6-18-6s-13 2-18 6l-1-6Z"
              />
            </g>
          </g>
        </defs>

        {/* ---- water reflection (clipped to below the waterline) ---- */}
        <g className="fj-rig__mirror" clipPath="url(#fjWaterClip)">
          <use href="#fjAngler" transform="matrix(1 0 0 -0.55 0 279)" />
          <rect x="52" y="180" width="20" height="86" rx="4" />
          <rect x="150" y="180" width="20" height="82" rx="4" />
        </g>

        {/* ---- dock ---- */}
        <ellipse className="fj-rig__dock-shadow" cx="150" cy="200" rx="150" ry="14" />
        <rect className="fj-rig__piling" x="52" y="168" width="20" height="132" rx="4" />
        <rect className="fj-rig__piling" x="150" y="174" width="20" height="126" rx="4" />
        <rect className="fj-rig__piling-wet" x="52" y="272" width="20" height="28" rx="4" />
        <rect className="fj-rig__piling-wet" x="150" y="276" width="20" height="24" rx="4" />

        <path className="fj-rig__deck" d="M-24 150 L238 136 L246 160 L-24 174 Z" />
        <path className="fj-rig__deck-face" d="M-24 174 L246 160 L246 182 L-24 196 Z" />
        <path className="fj-rig__deck-edge" d="M-24 150 L238 136" />
        <g className="fj-rig__grain">
          <path d="M-24 158 L242 143" />
          <path d="M-24 167 L244 152" />
          <path d="M22 151 L28 173" />
          <path d="M96 147 L104 169" />
          <path d="M170 141 L180 163" />
        </g>
        <g className="fj-rig__nails">
          <circle cx="26" cy="159" r="1.7" />
          <circle cx="26" cy="169" r="1.7" />
          <circle cx="100" cy="154" r="1.7" />
          <circle cx="100" cy="164" r="1.7" />
          <circle cx="176" cy="148" r="1.7" />
          <circle cx="176" cy="158" r="1.7" />
        </g>

        {/* ---- the angler ---- */}
        <ellipse className="fj-rig__sit-shadow" cx="128" cy="160" rx="38" ry="7" />
        <use href="#fjAngler" />

        {/* ---- the rod ---- */}
        <path className="fj-rig__grip" d="M138 138 L156 112" />
        <g className="fj-rig__reel-g">
          <path className="fj-rig__reel-foot" d="M150 118 L146 128" />
          <ellipse className="fj-rig__reel" cx="144" cy="132" rx="8" ry="10" />
          <path className="fj-rig__reel-spool" d="M141 124 a8 10 0 0 0 0 16" />
          <circle className="fj-rig__reel-knob" cx="134" cy="142" r="3" />
          <path className="fj-rig__reel-bail" d="M138 123 q-9 8 -2 20" />
        </g>
        <path className="fj-rig__rod" d="M154 114 Q 248 100 336 108" stroke="url(#fjRodBlank)" />
        <path className="fj-rig__rod-hl" d="M154 113 Q 248 99 336 107" />
        <g className="fj-rig__guides">
          <ellipse cx="214" cy="106" rx="2" ry="3.4" />
          <ellipse cx="266" cy="103" rx="1.8" ry="3" />
          <ellipse cx="308" cy="105" rx="1.5" ry="2.4" />
        </g>
        <circle className="fj-rig__tip" cx="336" cy="108" r="2.4" />
      </svg>

      <div className="fj-rod__line" />
    </div>
  );
}
