/**
 * Last Shelter — the shelter, painted in SVG.
 *
 * Everything in the room is read from the live state: the shelves hold the
 * real number of cans, bottles, medicine and batteries; the wall carries one
 * tally mark per day; cracks spread as the shelter weakens; a leak drips and
 * puddles; the radio sits on the table (taped up when broken); the mushroom
 * beds, rain pipe, tunnel hole, the cat or dog, Pip's crayon drawings and
 * memorial candles appear when the story puts them there. The family stand
 * in front, each drawn with their current condition (see Figure.jsx).
 */
import { memo, useMemo } from "react";
import { FigureG } from "./Figure.jsx";
import { BY_ID } from "../data/family.js";

const SPOTS = { june: [250, 862], hollis: [470, 872], pip: [735, 848], remy: [960, 868] };

let noiseURL = null;
function paintNoise() {
  if (noiseURL || typeof document === "undefined") return noiseURL;
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    const img = g.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 90;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // soft blotches like brush strokes
    for (let k = 0; k < 40; k++) {
      g.globalAlpha = 0.08;
      g.fillStyle = Math.random() < 0.5 ? "#000" : "#fff";
      g.beginPath();
      g.ellipse(Math.random() * 256, Math.random() * 256, 20 + Math.random() * 40, 8 + Math.random() * 20, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    noiseURL = c.toDataURL("image/png");
  } catch {
    noiseURL = "";
  }
  return noiseURL;
}

function Can({ x, y, i }) {
  const label = ["#b2402f", "#3d5a80", "#4f8a7b", "#e0b33a"][i % 4];
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-13" y="-34" width="26" height="34" rx="3" fill="#c9ced3" />
      <rect x="-13" y="-27" width="26" height="18" fill={label} />
      <rect x="-13" y="-34" width="26" height="4" rx="2" fill="#e6e9ec" />
      <rect x="-9" y="-24" width="7" height="12" fill="#fff" opacity="0.25" />
    </g>
  );
}
function Bottle({ x, y }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-9,0 L-9,-34 Q-9,-42 -4,-46 L-4,-54 L4,-54 L4,-46 Q9,-42 9,-34 L9,0Z" fill="#8fd3ff" opacity="0.85" stroke="#3f8fb5" strokeWidth="1.5" />
      <rect x="-5" y="-60" width="10" height="7" rx="2" fill="#1d70b8" />
      <rect x="-9" y="-28" width="18" height="10" fill="#fff" opacity="0.7" />
      <rect x="-6" y="-44" width="3" height="40" fill="#fff" opacity="0.4" />
    </g>
  );
}
function Meds({ x, y, big }) {
  return big ? (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-22" y="-30" width="44" height="30" rx="5" fill="#e04b4b" />
      <rect x="-4" y="-25" width="8" height="20" fill="#fff" />
      <rect x="-10" y="-19" width="20" height="8" fill="#fff" />
    </g>
  ) : (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-9" y="-28" width="18" height="28" rx="3" fill="#f2a541" />
      <rect x="-10" y="-34" width="20" height="8" rx="2" fill="#fafafa" />
      <rect x="-9" y="-20" width="18" height="10" fill="#fff" />
    </g>
  );
}
function Battery({ x, y }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-6" y="-26" width="12" height="26" rx="2" fill="#3fa05a" />
      <rect x="-6" y="-8" width="12" height="8" fill="#222" />
      <rect x="-2.5" y="-30" width="5" height="4" fill="#d4af37" />
    </g>
  );
}
function Tally({ day }) {
  const marks = [];
  const n = Math.min(day, 60);
  for (let i = 0; i < n; i++) {
    const grp = Math.floor(i / 5);
    const k = i % 5;
    const gx = 884 + (grp % 4) * 32;
    const gy = 372 + Math.floor(grp / 4) * 38;
    if (k < 4) marks.push(<path key={i} d={`M${gx + k * 6},${gy} l1,30`} />);
    else marks.push(<path key={i} d={`M${gx - 3},${gy + 22} l28,-14`} />);
  }
  return (
    <g stroke="#f4ecdc" strokeWidth="3.2" strokeLinecap="round" opacity="0.8">
      {marks}
    </g>
  );
}

function Cracks({ dmg }) {
  // 0 → none; grows branch by branch as the shelter weakens
  const all = [
    "M180,140 l30,40 l-10,30 l28,36",
    "M880,96 l-24,48 l12,22 l-30,40 l8,30",
    "M1110,520 l-40,24 l-8,36 l-36,14",
    "M120,520 l36,20 l4,34 l32,22",
    "M640,120 l18,38 l-14,26 l20,32 l-6,34",
    "M420,90 l-18,44 l20,18 l-12,40",
    "M980,640 l-36,-18 l-30,10 l-20,-24",
  ];
  const n = Math.min(all.length, Math.floor(dmg / 11));
  return (
    <g stroke="#3a3128" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.75">
      {all.slice(0, n).map((d, i) => (
        <path key={i} d={d} />
      ))}
      {dmg > 70 && <path d="M560,60 l-10,30 l14,24 l-18,40" strokeWidth="5" />}
    </g>
  );
}

export const BunkerScene = memo(function BunkerScene({ S, selected, onSelect, aspect = 1.33 }) {
  const noise = useMemo(paintNoise, []);
  const day = S.day;
  const res = S.res;
  const it = S.items;
  const fl = S.flags;
  const dmg = 100 - S.shelter;
  const radioBroken = it.radio && S.radio <= 0;
  const dim = Math.min(0.32, Math.max(0, (day - 8) * 0.008)) + (S.shelter < 30 ? 0.08 : 0);
  const fam = S.fam;
  const ids = ["june", "hollis", "pip", "remy"];
  const shelfCans = Math.min(res.food, 10);
  const shelfWater = Math.min(res.water, 8);
  const empties = Math.min(14, Math.floor((S.stats?.meals || 0) / 2));
  // show more of the room on wide scenes; the essentials live in x 150..1050
  const vbW = Math.max(900, Math.min(1200, 900 * aspect));
  return (
    <svg className="lsh-bunker-svg" viewBox={`${600 - vbW / 2} 0 ${vbW} 900`} preserveAspectRatio={aspect > vbW / 900 + 0.01 ? "xMidYMax slice" : "xMidYMid slice"} role="img" aria-label={`The shelter on day ${day}`}>
      <defs>
        <linearGradient id="lsWall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5c564c" />
          <stop offset="0.55" stopColor="#857b6a" />
          <stop offset="1" stopColor="#6d6455" />
        </linearGradient>
        <linearGradient id="lsFloor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4f4538" />
          <stop offset="1" stopColor="#2c251d" />
        </linearGradient>
        <radialGradient id="lsBulb" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffe3a3" stopOpacity="0.85" />
          <stop offset="0.35" stopColor="#ffc56e" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffb347" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="lsVig" cx="0.5" cy="0.45" r="0.75">
          <stop offset="0.5" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#0a0605" stopOpacity="0.75" />
        </radialGradient>
        <radialGradient id="lsTunnel" cx="0.5" cy="0.6" r="0.6">
          <stop offset="0" stopColor="#ffcf7a" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#3a2a1c" />
          <stop offset="1" stopColor="#120c08" />
        </radialGradient>
        <linearGradient id="lsPipe" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9aa3a8" />
          <stop offset="0.5" stopColor="#5d666b" />
          <stop offset="1" stopColor="#3b4245" />
        </linearGradient>
        <linearGradient id="lsWood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a8784e" />
          <stop offset="1" stopColor="#7a5232" />
        </linearGradient>
        {noise && (
          <pattern id="lsNoise" width="256" height="256" patternUnits="userSpaceOnUse">
            <image href={noise} width="256" height="256" />
          </pattern>
        )}
      </defs>

      {/* outer earth + vault */}
      <rect width="1200" height="900" fill="#1d1712" />
      <path d="M40,900 L40,170 Q40,50 180,46 L1020,46 Q1160,50 1160,170 L1160,900Z" fill="url(#lsWall)" />
      {/* concrete panel seams + rivets */}
      <g stroke="#4a4338" strokeWidth="3" opacity="0.55">
        {[300, 560, 840].map((x) => (
          <path key={x} d={`M${x},60 L${x},780`} />
        ))}
        <path d="M44,420 L1156,420" />
      </g>
      <g fill="#4a4338" opacity="0.7">
        {[300, 560, 840].flatMap((x) => [120, 260, 380, 470, 600, 720].map((y) => <circle key={`${x}-${y}`} cx={x + 10} cy={y} r="3" />))}
      </g>
      {/* ceiling pipes */}
      <path d="M40,118 Q120,74 260,74 L1160,74" stroke="url(#lsPipe)" strokeWidth="18" fill="none" />
      <path d="M40,150 Q100,108 220,104 L1160,104" stroke="url(#lsPipe)" strokeWidth="10" fill="none" />
      {[320, 700, 1000].map((x) => (
        <rect key={x} x={x} y="62" width="16" height="54" rx="3" fill="#3b4245" />
      ))}
      {/* vent fan */}
      <g transform="translate(985 175)">
        <circle r="46" fill="#3b4245" />
        <circle r="40" fill="#22272a" />
        <g className="lsh-fan">
          {[0, 90, 180, 270].map((a) => (
            <path key={a} d="M0,0 Q14,-30 0,-36 Q-10,-20 0,0Z" fill="#7d878c" transform={`rotate(${a})`} />
          ))}
        </g>
        <circle r="7" fill="#9aa3a8" />
        {[...Array(6)].map((_, i) => (
          <path key={i} d={`M-40,${-30 + i * 12} L40,${-30 + i * 12}`} stroke="#5d666b" strokeWidth="2" opacity="0.6" />
        ))}
      </g>

      {/* ladder + hatch */}
      <ellipse cx="640" cy="64" rx="70" ry="16" fill="#2b2622" />
      <ellipse cx="640" cy="60" rx="62" ry="12" fill="#4a4f52" stroke="#f2c230" strokeWidth="5" strokeDasharray="16 10" />
      {S.shelter < 55 && <path d="M586,64 Q640,72 694,64" stroke="#ffdf9e" strokeWidth="3" opacity="0.7" />}
      <g stroke="#8d7b63" strokeWidth="10" strokeLinecap="round">
        <path d="M600,70 L596,790" />
        <path d="M680,70 L684,790" />
      </g>
      <g stroke="#a18f74" strokeWidth="8" strokeLinecap="round">
        {[...Array(11)].map((_, i) => (
          <path key={i} d={`M600,${120 + i * 62} L682,${120 + i * 62}`} />
        ))}
      </g>
      <text x="640" y="170" textAnchor="middle" fill="#f2c230" fontSize="22" fontWeight="800" letterSpacing="4" opacity="0.8" fontFamily="Impact, sans-serif">
        EXIT
      </text>
      {it.backpack ? (
        <g transform="translate(702 310)">
          <rect x="-26" y="0" width="52" height="66" rx="16" fill="#7a8f3a" />
          <rect x="-18" y="30" width="36" height="26" rx="8" fill="#5f7030" />
          <path d="M-14,0 Q0,-24 14,0" stroke="#3f4a1f" strokeWidth="5" fill="none" />
        </g>
      ) : null}

      {/* tunnel hole */}
      {fl.tunnelOpen && (
        <g className="lsh-tunnel">
          <path d="M862,656 Q860,540 920,530 Q982,540 982,656Z" fill="url(#lsTunnel)" />
          <g fill="#6d6455">
            <path d="M852,600 l-14,10 l18,6 l-8,14 l20,-6Z" />
            <path d="M984,580 l16,8 l-18,8 l10,12 l-20,-4Z" />
          </g>
        </g>
      )}

      {/* wall details: map, plan, drawings, tally, mask, rifle, photos */}
      {it.map ? (
        <g transform="translate(880 250) rotate(-3)">
          <rect x="0" y="0" width="120" height="90" fill="#e2cf9a" />
          <path d="M10,60 Q40,30 70,48 T112,20" stroke="#3a7ca5" strokeWidth="4" fill="none" />
          <path d="M20,20 l30,10 l20,30" stroke="#6a994e" strokeWidth="5" fill="none" />
          {fl.cedarFreq && <circle cx="96" cy="26" r="8" fill="none" stroke="#e63946" strokeWidth="3" />}
          <circle cx="40" cy="70" r="4" fill="#e63946" />
          <circle cx="60" cy="0" r="5" fill="#d64545" />
        </g>
      ) : null}
      {fl.plan && (
        <g transform="translate(760 270) rotate(4)">
          <rect width="70" height="90" fill="#f4ecdc" />
          {[16, 30, 44, 58, 72].map((y) => (
            <path key={y} d={`M10,${y} L60,${y}`} stroke="#6b7c8f" strokeWidth="2" />
          ))}
          <circle cx="35" cy="0" r="5" fill="#3a86ff" />
        </g>
      )}
      <Tally day={day} />
      {it.gasmask ? (
        <g transform="translate(1030 480)">
          <path d="M0,-30 L0,-10" stroke="#8d7b63" strokeWidth="4" />
          <ellipse cx="0" cy="14" rx="26" ry="30" fill="#4d5a4a" />
          <circle cx="-10" cy="6" r="8" fill="#b8e0d2" />
          <circle cx="10" cy="6" r="8" fill="#b8e0d2" />
          <rect x="-8" y="26" width="16" height="22" rx="5" fill="#2f3a2d" />
        </g>
      ) : null}
      {fl.rifle && (
        <g transform="translate(168 236) rotate(-3)">
          <rect x="0" y="0" width="170" height="10" rx="4" fill="#4a3426" />
          <rect x="112" y="-4" width="66" height="18" rx="6" fill="#7a5232" />
          <circle cx="20" cy="5" r="6" fill="#8d7b63" />
          <circle cx="150" cy="5" r="6" fill="#8d7b63" />
        </g>
      )}
      {(fl.pipMap || (fam.pip && fam.pip.alive && day >= 6)) && (
        <g opacity="0.8" strokeLinecap="round" strokeLinejoin="round" fill="none" strokeWidth="5">
          <circle cx="410" cy="392" r="20" stroke="#f4d35e" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <path key={a} d={`M${410 + Math.cos((a * Math.PI) / 180) * 28},${392 + Math.sin((a * Math.PI) / 180) * 28} l${Math.cos((a * Math.PI) / 180) * 10},${Math.sin((a * Math.PI) / 180) * 10}`} stroke="#f4d35e" />
          ))}
          <path d="M462,450 l28,-28 l28,28 Z M470,450 l0,28 l40,0 l0,-28" stroke="#ef6f8a" />
          {[0, 1, 2, 3].map((i) => (
            <g key={i} transform={`translate(${530 + i * 14} 466)`} stroke={["#4f8a7b", "#b5482f", "#3f6fb5", "#e8b23a"][i]}>
              <circle cx="0" cy="-12" r="4" />
              <path d="M0,-8 l0,12 M-5,0 l5,4 l5,-4" />
            </g>
          ))}
          {fl.pipMap && <path d="M390,500 q20,-24 50,-8 t60,0 t60,8" stroke="#81b29a" strokeDasharray="8 8" />}
          {fl.dog && <path d="M396,470 q10,-14 24,-4 l14,-8 l0,18 q-10,10 -30,6 Z" stroke="#a7774d" />}
        </g>
      )}
      <Cracks dmg={dmg} />

      {/* light from the bulbs */}
      <g className={`lsh-bulbs${S.shelter < 30 || res.batteries === 0 ? " lsh-bulbs--flicker" : ""}`}>
        {[
          [330, 150],
          [880, 160],
        ].map(([x, y]) => (
          <g key={x}>
            <path d={`M${x},74 L${x},${y - 18}`} stroke="#222" strokeWidth="3" />
            <ellipse cx={x} cy={y + 120} rx="300" ry="300" fill="url(#lsBulb)" opacity={0.75 - dim} />
            <path d={`M${x - 16},${y - 18} L${x + 16},${y - 18} L${x + 10},${y - 6} L${x - 10},${y - 6}Z`} fill="#3b4245" />
            <circle cx={x} cy={y + 6} r="14" fill="#fff4cc" />
          </g>
        ))}
      </g>

      {/* shelves with real stock */}
      <g transform="translate(160 290)">
        <rect x="0" y="0" width="190" height="480" fill="#3e352b" opacity="0.5" />
        {[0, 120, 240, 360, 470].map((y) => (
          <rect key={y} x="-6" y={y} width="202" height="12" rx="3" fill="url(#lsWood)" />
        ))}
        <rect x="-8" y="0" width="12" height="480" fill="#6b4a2f" />
        <rect x="186" y="0" width="12" height="480" fill="#6b4a2f" />
        {/* top: medicine */}
        {[...Array(Math.min(4, res.meds))].map((_, i) => (
          <Meds key={i} x={24 + i * 32} y={0} big={i % 3 === 0} />
        ))}
        {it.flashlight ? (
          <g transform="translate(160 -14)">
            <rect x="-26" y="-8" width="40" height="16" rx="6" fill="#f2c94c" />
            <path d="M14,-12 L26,-14 L26,14 L14,12Z" fill="#333" />
          </g>
        ) : null}
        {/* water */}
        {[...Array(shelfWater)].map((_, i) => (
          <Bottle key={i} x={18 + i * 20} y={120} />
        ))}
        {/* food */}
        {[...Array(shelfCans)].map((_, i) => (
          <Can key={i} x={22 + (i % 5) * 36} y={i < 5 ? 240 : 206} i={i} />
        ))}
        {/* batteries + tool kit */}
        {[...Array(Math.min(8, res.batteries))].map((_, i) => (
          <Battery key={i} x={18 + i * 19} y={360} />
        ))}
        {it.toolkit ? (
          <g transform="translate(130 470)">
            <rect x="-40" y="-40" width="80" height="40" rx="6" fill="#c0392b" />
            <path d="M-16,-40 Q0,-58 16,-40" stroke="#333" strokeWidth="6" fill="none" />
            <rect x="-40" y="-26" width="80" height="4" fill="#922b21" />
          </g>
        ) : null}
        {/* empty-shelf chalk notes */}
        {res.water === 0 && (
          <text x="95" y="100" textAnchor="middle" className="lsh-chalk">
            no water
          </text>
        )}
        {res.food === 0 && (
          <text x="95" y="220" textAnchor="middle" className="lsh-chalk">
            no food
          </text>
        )}
        {res.water > shelfWater && <text x="184" y="86" textAnchor="end" className="lsh-chalk">+{res.water - shelfWater}</text>}
        {res.food > shelfCans && <text x="184" y="170" textAnchor="end" className="lsh-chalk">+{res.food - shelfCans}</text>}
      </g>

      {/* bunk bed */}
      <g transform="translate(372 520)">
        <rect x="0" y="0" width="12" height="270" fill="#5d666b" />
        <rect x="186" y="0" width="12" height="270" fill="#5d666b" />
        <rect x="6" y="80" width="186" height="22" rx="6" fill="#d9cdb7" />
        <rect x="6" y="66" width="70" height="20" rx="10" fill="#f1e8d6" />
        <path d="M76,80 Q140,58 190,82 L190,102 L76,102Z" fill="#5f8f8a" />
        <rect x="6" y="208" width="186" height="22" rx="6" fill="#d9cdb7" />
        <path d="M54,208 Q130,186 190,210 L190,230 L54,230Z" fill="#b56576" />
        <rect x="6" y="194" width="62" height="20" rx="10" fill="#f1e8d6" />
        {fl.cat && (
          <g transform="translate(120 72)" className="lsh-cat">
            <ellipse cx="0" cy="0" rx="34" ry="16" fill="#7d7d7d" />
            <circle cx="30" cy="-8" r="13" fill="#7d7d7d" />
            <path d="M22,-18 l4,-10 l6,8 M34,-18 l6,-9 l3,10" fill="#7d7d7d" />
            <path d="M-30,4 Q-50,0 -44,-14" stroke="#7d7d7d" strokeWidth="7" fill="none" strokeLinecap="round" />
            <path d="M26,-8 q3,2 6,0 M34,-8 q3,2 6,0" stroke="#333" strokeWidth="1.5" fill="none" />
          </g>
        )}
      </g>
      {it.books ? (
        <g transform="translate(548 772)">
          {["#6b4fa0", "#e07a5f", "#3d5a80", "#81b29a"].map((c, i) => (
            <rect key={i} x={-34 + (i % 2) * 6} y={-14 - i * 13} width="64" height="13" rx="2" fill={c} />
          ))}
        </g>
      ) : null}

      {/* table with radio */}
      <g transform="translate(822 660)">
        <rect x="0" y="0" width="212" height="18" rx="5" fill="url(#lsWood)" />
        <rect x="14" y="18" width="14" height="112" fill="#6b4a2f" />
        <rect x="184" y="18" width="14" height="112" fill="#6b4a2f" />
        {it.radio ? (
          <g transform="translate(50 0)" className={radioBroken ? "lsh-radio is-broken" : "lsh-radio"}>
            <rect x="0" y="-70" width="110" height="70" rx="10" fill="#8a6d4b" />
            <circle cx="32" cy="-35" r="22" fill="#3b2f25" />
            {[...Array(5)].map((_, i) => (
              <path key={i} d={`M14,${-48 + i * 6} L50,${-48 + i * 6}`} stroke="#5a4634" strokeWidth="2" />
            ))}
            <rect x="62" y="-58" width="38" height="18" rx="3" fill={radioBroken ? "#555" : "#ffe7a1"} />
            <circle cx="72" cy="-20" r="6" fill="#3b2f25" />
            <circle cx="92" cy="-20" r="6" fill="#3b2f25" />
            <path d="M96,-70 L130,-130" stroke="#bbb" strokeWidth="3" />
            {radioBroken ? (
              <g>
                <path d="M10,-66 L100,-6 M100,-66 L10,-6" stroke="#d9c49a" strokeWidth="8" opacity="0.85" />
                <path className="lsh-spark" d="M110,-78 l8,-10 l-2,8 l8,-4" stroke="#ffd166" strokeWidth="3" fill="none" />
              </g>
            ) : (
              <g className="lsh-waves" stroke="#ffe7a1" strokeWidth="3" fill="none" opacity="0.7">
                <path d="M136,-138 q10,8 0,18" />
                <path d="M146,-146 q16,14 0,32" />
              </g>
            )}
          </g>
        ) : null}
        <g transform="translate(186 0)">
          <rect x="-12" y="-26" width="24" height="26" rx="3" fill="#e9e3d4" />
          <path d="M-12,-14 L12,-14" stroke="#c2b8a3" strokeWidth="2" />
          <path className="lsh-candle-flame" d="M0,-40 q6,8 0,14 q-6,-6 0,-14Z" fill="#ffd166" />
        </g>
      </g>

      {/* the crate Pip sits on */}
      <g transform="translate(690 790)">
        <rect x="0" y="0" width="94" height="74" rx="4" fill="#a8784e" />
        <path d="M0,24 L94,24 M0,50 L94,50" stroke="#7a5232" strokeWidth="4" />
        <text x="47" y="44" textAnchor="middle" fill="#5a3c22" fontSize="14" fontWeight="700" fontFamily="sans-serif">RATIONS</text>
      </g>

      {/* garden + rain collector */}
      {fl.collector && (
        <g>
          <path d="M1075,104 L1075,700" stroke="url(#lsPipe)" strokeWidth="14" />
          <rect x="1040" y="700" width="70" height="90" rx="10" fill="#3d5a80" />
          <ellipse cx="1075" cy="702" rx="35" ry="8" fill="#5f7fa8" />
        </g>
      )}
      {fl.garden && (
        <g transform="translate(860 790)">
          <rect x="0" y="0" width="200" height="40" rx="5" fill="#6b4a2f" />
          <rect x="6" y="-6" width="188" height="14" rx="5" fill="#4a3426" />
          {[20, 50, 82, 112, 146, 176].map((x, i) => (
            <g key={x} transform={`translate(${x} -4)`}>
              <rect x="-3" y={-14 - (i % 2) * 6} width="6" height={14 + (i % 2) * 6} fill="#efe6d2" />
              <ellipse cx="0" cy={-16 - (i % 2) * 6} rx="12" ry="6" fill="#f4ecdc" />
            </g>
          ))}
        </g>
      )}

      {/* leak */}
      {fl.leak && (
        <g>
          <path d="M470,104 l0,8" stroke="#8fd3ff" strokeWidth="4" />
          <circle className="lsh-drip" cx="470" cy="120" r="5" fill="#8fd3ff" />
          <ellipse cx="470" cy="874" rx="80" ry="12" fill="#5f8fa8" opacity="0.5" />
          <path d="M300,760 q-30,30 -10,70" stroke="#2f2a24" strokeWidth="18" opacity="0.25" fill="none" />
        </g>
      )}

      {/* floor */}
      <path d="M40,790 L1160,790 L1200,900 L0,900Z" fill="url(#lsFloor)" />
      <path d="M40,790 L1160,790" stroke="#2a221b" strokeWidth="4" />
      {/* empty cans pile grows with the days */}
      <g transform="translate(176 842)">
        {[...Array(empties)].map((_, i) => (
          <g key={i} transform={`translate(${(i % 7) * 18 - (i > 6 ? -9 : 0)} ${i > 6 ? -14 : 0}) rotate(${(i * 37) % 80 - 40})`}>
            <rect x="-7" y="-9" width="14" height="18" rx="2" fill="#8d9499" />
            <rect x="-7" y="-4" width="14" height="6" fill="#6b7075" />
          </g>
        ))}
      </g>

      {/* the family */}
      {ids.map((id, i) => {
        const m = fam[id];
        const [x, y] = SPOTS[id];
        if (!m) return null;
        if (!m.alive) {
          return (
            <g key={id} transform={`translate(${x} ${y - 20})`} className="lsh-memorial">
              <rect x="-34" y="-96" width="68" height="84" rx="4" fill="#4a3426" />
              <rect x="-27" y="-89" width="54" height="66" fill="#d8cfbd" />
              <g transform="translate(0 -38) scale(0.27)">
                <FigureG id={id} m={null} s={1} />
              </g>
              <path d="M-34,-96 L-14,-96 L-34,-76Z" fill="#111" />
              <rect x="22" y="-14" width="12" height="20" fill="#efe6d2" />
              <path className="lsh-candle-flame" d="M28,-26 q5,7 0,12 q-5,-5 0,-12Z" fill="#ffd166" />
              <text x="0" y="22" textAnchor="middle" className="lsh-chalk lsh-chalk--sm">
                {BY_ID[id].name}
              </text>
            </g>
          );
        }
        if (m.away) {
          return (
            <g key={id} transform={`translate(${x} ${y})`} opacity="0.85">
              <g transform="translate(0 -150) rotate(-4)">
                <rect x="-60" y="-34" width="120" height="68" rx="3" fill="#f4ecdc" />
                <circle cx="0" cy="-34" r="5" fill="#e63946" />
                <text x="0" y="-6" textAnchor="middle" className="lsh-note">
                  {BY_ID[id].name} is out.
                </text>
                <text x="0" y="16" textAnchor="middle" className="lsh-note lsh-note--sm">
                  back in {S.exp?.left ?? "?"} day{S.exp?.left === 1 ? "" : "s"}
                </text>
              </g>
              <ellipse cx="0" cy="0" rx="40" ry="8" fill="#000" opacity="0.2" />
            </g>
          );
        }
        return <FigureG key={id} id={id} m={m} x={x} y={id === "pip" ? 800 : y} s={1.05} delay={i * 0.7} flip={id === "remy"} selected={selected === id} onClick={onSelect ? () => onSelect(id) : undefined} />;
      })}
      {fl.dog && (
        <g transform="translate(830 868)" className="lsh-dog">
          <ellipse cx="0" cy="-16" rx="40" ry="18" fill="#a7774d" />
          <circle cx="40" cy="-26" r="16" fill="#a7774d" />
          <ellipse cx="50" cy="-38" rx="7" ry="12" fill="#7a5232" transform="rotate(30 50 -38)" />
          <circle cx="50" cy="-26" r="2.5" fill="#222" />
          <circle cx="56" cy="-20" r="3" fill="#222" />
          <path className="lsh-tail" d="M-38,-22 q-20,-14 -16,-30" stroke="#a7774d" strokeWidth="7" fill="none" strokeLinecap="round" />
        </g>
      )}

      {/* atmosphere: painted grain, dust, vignette, day-weariness */}
      {noise && <rect width="1200" height="900" fill="url(#lsNoise)" opacity="0.09" style={{ mixBlendMode: "overlay" }} pointerEvents="none" />}
      {S.shelter < 40 && (
        <g className="lsh-dust" fill="#d8cfbd" opacity="0.5" pointerEvents="none">
          {[...Array(14)].map((_, i) => (
            <circle key={i} cx={100 + ((i * 83) % 1000)} cy={60} r={1.5 + (i % 3)} style={{ animationDelay: `${(i * 0.37) % 4}s` }} />
          ))}
        </g>
      )}
      <rect width="1200" height="900" fill="url(#lsVig)" pointerEvents="none" />
      <rect width="1200" height="900" fill="#0d1a2b" opacity={dim} pointerEvents="none" />
    </svg>
  );
});
