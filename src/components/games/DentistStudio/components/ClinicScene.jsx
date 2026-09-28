/**
 * Dentist Studio — the illustrated dental studio (SVG, 1600x900 design
 * space, `slice` so it always fills its box). Motion is small and calm:
 * the lamp sways a degree, leaves breathe, a tool glints, the patient
 * blinks — all CSS, all removed under reduced motion.
 *
 * props: decor (Set of earned decoration ids), patient, mood,
 *        pan (shifts the room right, leaving space for a left-hand panel)
 */
import PatientFigure from "./PatientFigure.jsx";

export default function ClinicScene({ decor = new Set(), patient = null, mood = "calm", pan = 0, className = "" }) {
  const chair = decor.has("chair") ? { main: "#b9a2ec", light: "#dccff9", dark: "#8a70cc" } : { main: "#63cdb8", light: "#b8efe3", dark: "#389f8b" };
  return (
    <svg className={`dst-clinic ${className}`} viewBox={`${-pan} 0 1600 900`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="dcWall" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#dff4f1" />
          <stop offset="1" stopColor="#f5f1ea" />
        </linearGradient>
        <linearGradient id="dcFloor" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#e9dccb" />
          <stop offset="1" stopColor="#d8c6b0" />
        </linearGradient>
        <linearGradient id="dcSky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#9fd8f5" />
          <stop offset="1" stopColor="#dff3fb" />
        </linearGradient>
        <linearGradient id="dcCab" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e6ecef" />
        </linearGradient>
        <linearGradient id="dcSteel" x1="0" x2="1">
          <stop offset="0" stopColor="#c9d2db" />
          <stop offset="0.5" stopColor="#f4f7fa" />
          <stop offset="1" stopColor="#aab6c2" />
        </linearGradient>
        <linearGradient id="dcChair" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={chair.light} />
          <stop offset="0.4" stopColor={chair.main} />
          <stop offset="1" stopColor={chair.dark} />
        </linearGradient>
        <radialGradient id="dcCone" cx="0.5" cy="0" r="1">
          <stop offset="0" stopColor="#fffbe8" stopOpacity="0.75" />
          <stop offset="1" stopColor="#fffbe8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="dcShadow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#7a6a5a" stopOpacity="0.28" />
          <stop offset="1" stopColor="#7a6a5a" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* room */}
      <rect x="-600" width="2800" height="900" fill="url(#dcWall)" />
      <rect x="-600" y="560" width="2800" height="150" fill="#cfeee8" opacity="0.55" />
      <rect x="-600" y="556" width="2800" height="8" fill="#ffffff" opacity="0.9" />
      <rect x="-600" y="706" width="2800" height="194" fill="url(#dcFloor)" />
      {Array.from({ length: 13 }, (_, i) => (
        <path key={i} d={`M${i * 200 - 500} 900 L${i * 200 - 360} 706`} stroke="#cdb99f" strokeWidth="2" opacity="0.5" />
      ))}
      <rect x="-600" y="702" width="2800" height="8" fill="#bfe5de" />

      {/* window */}
      <g>
        <rect x="100" y="110" width="330" height="330" rx="18" fill="#ffffff" />
        <rect x="116" y="126" width="298" height="298" rx="10" fill="url(#dcSky)" />
        <g fill="#ffffff" opacity="0.9">
          <ellipse cx="200" cy="220" rx="46" ry="16" />
          <ellipse cx="236" cy="208" rx="30" ry="18" />
          <ellipse cx="330" cy="300" rx="36" ry="12" />
        </g>
        <path d="M116 360 q60 -40 120 -8 t178 -20 V424 H116Z" fill="#a8dcb6" />
        <path d="M116 390 q80 -30 150 -4 t148 -8 V424 H116Z" fill="#8fcf9f" />
        <rect x="262" y="126" width="6" height="298" fill="#ffffff" />
        <rect x="116" y="272" width="298" height="6" fill="#ffffff" />
        <rect x="92" y="436" width="346" height="16" rx="6" fill="#ffffff" />
        <path d="M430 120 L700 700 L420 700 L120 440Z" fill="#fffdf2" opacity="0.18" />
      </g>

      {/* wall art (earned) */}
      {decor.has("art") && (
        <g>
          <g transform="translate(-100 -10)">
            <rect x="560" y="140" width="110" height="140" rx="10" fill="#ffffff" stroke="#e6d9c7" strokeWidth="6" />
            <rect x="572" y="152" width="86" height="116" rx="6" fill="#fde2ea" />
            <path d="M594 184c-9 0-14 7-14 16 0 8 3 12 5 19 2 8 3 17 9 17 4 0 4-10 8-15 2-2 3-2 5 0 4 5 4 15 8 15 5 0 7-9 9-17 2-7 5-11 5-19 0-9-5-16-14-16-5 0-8 3-13 3s-8-3-13-3z" fill="#ffffff" stroke="#f59ab6" strokeWidth="3" />
          </g>
          <g transform="translate(1030 -110)">
            <rect x="0" y="170" width="100" height="100" rx="10" fill="#ffffff" stroke="#e6d9c7" strokeWidth="6" />
            <circle cx="50" cy="220" r="32" fill="#d6f1ea" />
            <path d="M32 217 q18 24 36 0" stroke="#3a9c8b" strokeWidth="5" fill="none" strokeLinecap="round" />
            <circle cx="38" cy="206" r="4" fill="#3a9c8b" />
            <circle cx="62" cy="206" r="4" fill="#3a9c8b" />
          </g>
        </g>
      )}

      {/* shelves */}
      <g>
        <rect x="1190" y="200" width="300" height="12" rx="4" fill="#ffffff" />
        <rect x="1190" y="320" width="300" height="12" rx="4" fill="#ffffff" />
        <rect x="1210" y="150" width="34" height="50" rx="8" fill="#9fdcef" />
        <rect x="1254" y="164" width="28" height="36" rx="6" fill="#ffd3a1" />
        <rect x="1292" y="140" width="40" height="60" rx="10" fill="#c9b6f2" />
        <circle cx="1440" cy="178" r="22" fill="#b6e3a0" />
        <rect x="1426" y="176" width="28" height="24" rx="6" fill="#f3b38a" />
        <rect x="1215" y="276" width="70" height="44" rx="8" fill="#ffffff" stroke="#d8e3e8" strokeWidth="3" />
        <rect x="1300" y="268" width="26" height="52" rx="6" fill="#7fd4c1" />
        <rect x="1336" y="280" width="26" height="40" rx="6" fill="#f7a1b5" />
        {decor.has("trophy") && (
          <g className="dst-anim-glint">
            <path d="M1400 238 h56 v14 q0 30 -28 36 q-28 -6 -28 -36z" fill="#ffd36a" stroke="#d9a53a" strokeWidth="3" />
            <rect x="1418" y="288" width="20" height="16" fill="#e6b54a" />
            <rect x="1406" y="302" width="44" height="14" rx="4" fill="#d9a53a" />
            <path d="M1428 250 l4 8 9 1 -6.5 6 1.5 9 -8 -4.3 -8 4.3 1.5 -9 -6.5 -6 9 -1z" fill="#fff4c8" />
          </g>
        )}
      </g>

      {/* cabinet + sink */}
      <g>
        {decor.has("light") && <rect x="1150" y="420" width="380" height="10" rx="5" fill="#ffe9a8" className="dst-anim-light" />}
        {decor.has("light") && <path d="M1150 430 h380 l40 130 h-460z" fill="#fff3c8" opacity="0.35" />}
        <rect x="1150" y="560" width="380" height="200" rx="14" fill="url(#dcCab)" stroke="#dfe7ea" strokeWidth="3" />
        <rect x="1140" y="548" width="400" height="22" rx="8" fill="#f7fbfc" stroke="#dfe7ea" strokeWidth="3" />
        <rect x="1170" y="590" width="160" height="70" rx="10" fill="#ffffff" stroke="#e1e8eb" strokeWidth="3" />
        <rect x="1170" y="670" width="160" height="70" rx="10" fill="#ffffff" stroke="#e1e8eb" strokeWidth="3" />
        <rect x="1350" y="590" width="160" height="150" rx="10" fill="#ffffff" stroke="#e1e8eb" strokeWidth="3" />
        <rect x="1225" y="620" width="50" height="8" rx="4" fill="#9fb4c0" />
        <rect x="1225" y="700" width="50" height="8" rx="4" fill="#9fb4c0" />
        <rect x="1360" y="660" width="8" height="40" rx="4" fill="#9fb4c0" />
        <path d="M1400 548 v-40 q0 -18 18 -18 h24 q10 0 10 10 v6" stroke="url(#dcSteel)" strokeWidth="10" fill="none" strokeLinecap="round" />
        <ellipse cx="1430" cy="552" rx="50" ry="8" fill="#dde8ec" />
      </g>

      {/* plants */}
      <g>
        <path d="M470 700 l12 -64 h68 l12 64z" fill="#f3b38a" />
        <rect x="476" y="628" width="80" height="14" rx="6" fill="#f7c4a1" />
        <g className="dst-anim-leaf" style={{ transformOrigin: "516px 628px" }}>
          <path d="M516 628 q-40 -60 -20 -120 q30 50 20 120z" fill="#7cc98d" />
          <path d="M516 628 q30 -70 70 -90 q-10 60 -70 90z" fill="#6ab87c" />
          <path d="M516 628 q-60 -20 -80 -60 q50 0 80 60z" fill="#8fd6a0" />
        </g>
        {decor.has("plant") && (
          <g>
            <path d="M40 706 l18 -90 h96 l18 90z" fill="#9fdcef" />
            <rect x="48" y="604" width="116" height="18" rx="8" fill="#b9e8f5" />
            <g className="dst-anim-leaf2" style={{ transformOrigin: "106px 606px" }}>
              <path d="M106 606 q-70 -80 -40 -220 q50 90 40 220z" fill="#5fb874" />
              <path d="M106 606 q40 -120 110 -150 q-10 100 -110 150z" fill="#6fc584" />
              <path d="M106 606 q-90 -30 -110 -110 q80 20 110 110z" fill="#86d49a" />
              <path d="M106 606 q10 -130 60 -200 q10 110 -60 200z" fill="#4fa865" />
            </g>
          </g>
        )}
      </g>

      {/* lamp */}
      <g className="dst-anim-lamp" style={{ transformOrigin: "900px 0px" }}>
        <path d="M900 0 v70 q0 20 -20 30 l-90 50" stroke="url(#dcSteel)" strokeWidth="12" fill="none" strokeLinecap="round" />
        <g transform="translate(770 150) rotate(-18)">
          <rect x="-70" y="-26" width="140" height="52" rx="26" fill="#ffffff" stroke="#dfe7ea" strokeWidth="4" />
          <rect x="-54" y="14" width="108" height="14" rx="7" fill="#fff6d0" />
        </g>
        <path d="M700 185 L840 175 L1000 560 L560 560Z" fill="url(#dcCone)" className="dst-anim-cone" />
      </g>

      {/* tool tray on its arm */}
      <g>
        <path d="M420 520 v180" stroke="url(#dcSteel)" strokeWidth="12" strokeLinecap="round" />
        <ellipse cx="420" cy="706" rx="50" ry="10" fill="#b8c4ce" />
        <rect x="330" y="494" width="190" height="30" rx="10" fill="#ffffff" stroke="#d6e2e8" strokeWidth="4" />
        <g className="dst-anim-glint">
          <path d="M350 502 l70 8" stroke="#c7d1db" strokeWidth="5" strokeLinecap="round" />
          <circle cx="352" cy="502" r="7" fill="#dbe9f3" stroke="#9aa8b5" strokeWidth="2" />
        </g>
        <path d="M430 504 l60 10" stroke="#9fb4c0" strokeWidth="4" strokeLinecap="round" />
        <path d="M430 514 l62 4" stroke={chair.main} strokeWidth="6" strokeLinecap="round" />
        <rect x="496" y="498" width="16" height="22" rx="4" fill="#bfe7ff" />
      </g>

      {/* chair shadow */}
      <ellipse cx="880" cy="760" rx="330" ry="34" fill="url(#dcShadow)" />

      {/* dental chair (front 3/4) */}
      <g>
        <rect x="846" y="600" width="68" height="150" rx="14" fill="url(#dcSteel)" />
        <ellipse cx="880" cy="752" rx="130" ry="18" fill="#cfd8df" />
        <ellipse cx="880" cy="746" rx="120" ry="14" fill="#e6ecf0" />
        {/* backrest */}
        <path d="M740 250 q0 -40 40 -40 h200 q40 0 40 40 v330 q0 30 -30 30 h-220 q-30 0 -30 -30z" fill="url(#dcChair)" />
        <path d="M768 262 q0 -26 26 -26 h172 q26 0 26 26" stroke="#ffffff" strokeWidth="6" fill="none" opacity="0.45" strokeLinecap="round" />
        {/* headrest */}
        <rect x="800" y="150" width="160" height="84" rx="38" fill="url(#dcChair)" />
        <rect x="818" y="162" width="124" height="16" rx="8" fill="#ffffff" opacity="0.35" />
      </g>

      {patient && (
        <svg x="730" y="170" width="300" height="330" viewBox="0 0 200 220" overflow="visible">
          <g className={mood === "beam" ? "dst-anim-happy" : ""}>
            <PatientFigure patient={patient} mood={mood} bib />
          </g>
        </svg>
      )}

      {/* seat front + arms, over the patient's lap */}
      <g>
        <path d="M700 520 q0 -24 24 -24 h312 q24 0 24 24 v70 q0 36 -36 36 h-288 q-36 0 -36 -36z" fill="url(#dcChair)" />
        <path d="M720 520 h320" stroke="#ffffff" strokeWidth="6" opacity="0.35" strokeLinecap="round" />
        <rect x="660" y="440" width="70" height="36" rx="18" fill="url(#dcChair)" />
        <rect x="1030" y="440" width="70" height="36" rx="18" fill="url(#dcChair)" />
        <rect x="686" y="470" width="18" height="60" rx="8" fill="url(#dcSteel)" />
        <rect x="1056" y="470" width="18" height="60" rx="8" fill="url(#dcSteel)" />
      </g>
    </svg>
  );
}
