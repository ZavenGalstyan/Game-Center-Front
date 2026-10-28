/**
 * Last Shelter — hand-drawn (SVG) family figures for the shelter.
 *
 * <FigureG> draws a full-body character inside a parent <svg> (origin at the
 * feet, y up is negative); <Portrait> wraps the head in its own <svg> for
 * cards and lists. Both read the member's live state: hunger thins the body
 * and adds stomach squiggles, thirst brings sweat and cracked lips, sickness
 * tints the skin green (blanket + thermometer when very sick), injuries add
 * bandages and a sling, exhaustion adds eye bags and heavy lids, and the
 * face's brows/mouth follow mood. Idle breathing and blinking are CSS.
 */
import { memo } from "react";
import { BY_ID } from "../data/family.js";
import { mood as moodOf } from "../engine/shelter.js";

const SIZE = { hollis: 1.08, june: 1, remy: 0.95, pip: 0.76 };

export function mix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p(a);
  const B = p(b);
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

function Face({ id, m, C, skin }) {
  const md = m ? moodOf(m) : "calm";
  const tired = m && m.fatigue >= 45;
  const exhausted = m && m.fatigue >= 70;
  const thirsty = m && m.thirst >= 45;
  const sick = m && m.sick >= 1;
  const brow = { happy: [-2, 2], calm: [0, 0], worried: [6, -4], sad: [9, -6], sick: [5, -3] }[md] || [0, 0];
  const mouth = {
    happy: "M-15,-224 Q0,-208 15,-224",
    calm: "M-11,-222 Q0,-215 11,-222",
    worried: "M-11,-219 Q-4,-223 0,-219 Q4,-215 11,-219",
    sad: "M-13,-214 Q0,-228 13,-214",
    sick: "M-10,-218 Q0,-222 10,-218",
  }[md];
  return (
    <g className="lsh-face">
      {/* cheeks */}
      <ellipse cx="-26" cy="-232" rx="9" ry="6" fill="#ff8a8a" opacity={sick ? 0.15 : 0.35} />
      <ellipse cx="26" cy="-232" rx="9" ry="6" fill="#ff8a8a" opacity={sick ? 0.15 : 0.35} />
      {id === "pip" && [[-24, -238], [-19, -233], [-28, -233], [24, -238], [19, -233], [28, -233]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.6" fill="#b5642e" opacity="0.7" />)}
      {/* eyes */}
      <g className="lsh-eyes">
        {[-16, 16].map((x) => (
          <g key={x}>
            <ellipse cx={x} cy="-250" rx="6.5" ry={exhausted ? 4 : 8.5} fill="#1d1b22" />
            <circle cx={x + 2.2} cy={exhausted ? -251 : -253} r="2.2" fill="#fff" />
            {exhausted && <path d={`M${x - 8},-254 Q${x},-258 ${x + 8},-254`} stroke={skin} strokeWidth="5" fill={skin} />}
            {tired && <path d={`M${x - 7},-240 Q${x},-235 ${x + 7},-240`} stroke="#7d5a8c" strokeWidth="2" fill="none" opacity="0.6" />}
          </g>
        ))}
      </g>
      {/* brows */}
      <path d={`M-24,${-266 + brow[1]} L-9,${-268 - brow[0] * 0.4}`} stroke={mix(C.hair, "#000000", 0.2)} strokeWidth="4" strokeLinecap="round" />
      <path d={`M24,${-266 + brow[1]} L9,${-268 - brow[0] * 0.4}`} stroke={mix(C.hair, "#000000", 0.2)} strokeWidth="4" strokeLinecap="round" />
      {/* nose */}
      <ellipse cx="0" cy="-236" rx="5" ry="4" fill={sick ? "#e46c6c" : mix(skin, "#000000", 0.12)} />
      {/* mouth */}
      <path d={mouth} stroke="#6b2b2b" strokeWidth="3.5" fill={md === "happy" ? "#8c2f39" : "none"} strokeLinecap="round" />
      {thirsty && <path d="M-6,-219 l3,3 l3,-3" stroke="#c97b63" strokeWidth="1.5" fill="none" />}
      {md === "sad" && (
        <g className="lsh-tear">
          <path d="M-19,-243 q-3,7 0,10 q3,-3 0,-10Z" fill="#7ec8e3" />
        </g>
      )}
      {thirsty && (
        <g className="lsh-sweat">
          <path d="M40,-275 q-6,10 0,14 q6,-4 0,-14Z" fill="#8fd3ff" stroke="#3f8fb5" strokeWidth="1" />
          {m.thirst >= 75 && <path d="M-44,-262 q-5,8 0,11 q5,-3 0,-11Z" fill="#8fd3ff" stroke="#3f8fb5" strokeWidth="1" />}
        </g>
      )}
      {m && m.sick >= 2 && (
        <g>
          <rect x="6" y="-222" width="30" height="4" rx="2" fill="#f1f1f1" transform="rotate(14 6 -220)" />
          <circle cx="36" cy="-214" r="3" fill="#e63946" />
        </g>
      )}
    </g>
  );
}

function Hair({ id, C, back }) {
  const h = C.hair;
  const dark = mix(h, "#000000", 0.25);
  if (id === "hollis")
    return back ? null : (
      <g>
        <path d="M-47,-254 Q-50,-300 0,-302 Q50,-300 47,-254 Q42,-284 0,-288 Q-42,-284 -47,-254Z" fill={h} />
        <path d="M-42,-246 Q-44,-198 0,-192 Q44,-198 42,-246 Q38,-226 22,-224 Q12,-212 0,-212 Q-12,-212 -22,-224 Q-38,-226 -42,-246Z" fill={h} />
        <path d="M-18,-228 Q0,-236 18,-228 Q10,-224 0,-226 Q-10,-224 -18,-228Z" fill={dark} />
      </g>
    );
  if (id === "june")
    return back ? (
      <g>
        <circle cx="0" cy="-306" r="22" fill={h} />
        <ellipse cx="0" cy="-262" rx="54" ry="56" fill={h} />
      </g>
    ) : (
      <g>
        <path d="M-50,-250 Q-52,-306 0,-306 Q52,-306 50,-250 Q40,-290 10,-284 Q-6,-296 -26,-282 Q-44,-276 -50,-250Z" fill={h} />
        {[-14, 14].map((x) => (
          <circle key={x} cx={x} cy="-250" r="13" fill="rgba(220,240,255,0.25)" stroke="#2b2d42" strokeWidth="3" />
        ))}
        <path d="M-1,-251 h2" stroke="#2b2d42" strokeWidth="3" />
      </g>
    );
  if (id === "remy")
    return back ? null : (
      <g>
        <path d="M-48,-250 Q-56,-292 -30,-306 L-22,-322 L-8,-306 L4,-326 L14,-304 L30,-318 L32,-298 Q54,-290 48,-250 Q40,-280 10,-282 Q-20,-288 -48,-250Z" fill={h} />
        <path d="M4,-326 L14,-304 L22,-296 L8,-300Z" fill={C.accent} />
        <path d="M-52,-262 Q-50,-318 0,-320 Q50,-318 52,-262" stroke="#2b2d42" strokeWidth="7" fill="none" />
        <rect x="-62" y="-272" width="16" height="30" rx="7" fill={C.accent} stroke="#2b2d42" strokeWidth="3" />
        <rect x="46" y="-272" width="16" height="30" rx="7" fill={C.accent} stroke="#2b2d42" strokeWidth="3" />
      </g>
    );
  // pip
  return back ? (
    <g>
      <circle cx="-56" cy="-240" r="17" fill={h} />
      <circle cx="56" cy="-240" r="17" fill={h} />
      <circle cx="-44" cy="-252" r="5" fill={C.accent} />
      <circle cx="44" cy="-252" r="5" fill={C.accent} />
    </g>
  ) : (
    <g>
      <path d="M-50,-244 Q-54,-304 0,-304 Q54,-304 50,-244 Q48,-270 36,-276 Q24,-266 8,-276 Q-6,-264 -20,-276 Q-34,-266 -48,-262Z" fill={h} />
    </g>
  );
}

function Body({ id, m, C, skin }) {
  const starving = m && m.hunger >= 75;
  const hungry = m && m.hunger >= 45;
  const thin = starving ? 0.84 : hungry ? 0.92 : 1;
  const broad = (id === "hollis" ? 1.12 : id === "pip" ? 0.98 : 1) * thin;
  const w = 44 * broad;
  const top = C.top;
  const top2 = C.top2;
  const inj = m ? m.injured : 0;
  const verySick = m && m.sick >= 2;
  return (
    <g>
      {/* shoes + legs */}
      <ellipse cx="-17" cy="-7" rx="17" ry="9" fill={id === "pip" ? "#ef6f8a" : "#3b3030"} />
      <ellipse cx="17" cy="-7" rx="17" ry="9" fill={id === "pip" ? "#ef6f8a" : "#3b3030"} />
      <rect x={-27 * thin} y="-98" width={22 * thin} height="90" rx="10" fill={C.pants} />
      <rect x={5 * thin} y="-98" width={22 * thin} height="90" rx="10" fill={C.pants} />
      {inj >= 2 && <rect x={6 * thin} y="-60" width={20 * thin} height="16" rx="4" fill="#f5f5f0" stroke="#d9d0c0" />}
      {/* torso */}
      <path d={`M${-w},-178 Q${-w - 4},-104 ${-w + 6},-92 L${w - 6},-92 Q${w + 4},-104 ${w},-178 Q${w * 0.6},-202 0,-202 Q${-w * 0.6},-202 ${-w},-178Z`} fill={top} />
      {id === "hollis" && [-170, -150, -130, -110].map((y) => <path key={y} d={`M${-w + 2},${y} L${w - 2},${y}`} stroke={top2} strokeWidth="5" opacity="0.6" />)}
      {id === "hollis" && [-30, -10, 10, 30].map((x) => <path key={x} d={`M${x * broad},-198 L${x * broad},-94`} stroke={top2} strokeWidth="3" opacity="0.35" />)}
      {id === "june" && (
        <g>
          <path d={`M-14,-198 L0,-176 L14,-198`} fill="none" stroke="#e9f5f2" strokeWidth="5" />
          <rect x="12" y="-170" width="18" height="12" rx="2" fill="#f2f2f2" />
          <rect x="18" y="-168" width="6" height="8" fill="#e04b4b" />
        </g>
      )}
      {id === "remy" && (
        <g>
          <path d={`M-22,-130 L22,-130 L18,-108 L-18,-108Z`} fill={top2} />
          <path d="M-8,-198 L-10,-160 M8,-198 L10,-160" stroke="#e8e8e8" strokeWidth="3" />
          <path d={`M${-w + 6},-196 Q0,-216 ${w - 6},-196 Q0,-186 ${-w + 6},-196Z`} fill={top2} />
        </g>
      )}
      {id === "pip" && (
        <g>
          {[-170, -150, -130].map((y) => <circle key={y} cx="0" cy={y} r="3.5" fill="#7a4f12" />)}
          <path d={`M${-w},-112 L${w},-112`} stroke={top2} strokeWidth="7" />
        </g>
      )}
      {hungry && (
        <g className="lsh-growl" opacity={starving ? 0.95 : 0.65}>
          <path d="M-18,-118 q4,-6 8,0 q4,6 8,0 q4,-6 8,0" stroke="#5b3a29" strokeWidth="2.4" fill="none" />
          {starving && <path d="M-14,-106 q4,-5 8,0 q4,5 8,0" stroke="#5b3a29" strokeWidth="2" fill="none" />}
        </g>
      )}
      {/* arms */}
      <rect x={-w - 16} y="-188" width="20" height={inj ? 70 : 92} rx="10" fill={id === "june" ? top2 : top} transform={inj ? `rotate(-28 ${-w - 6} -186)` : undefined} />
      <rect x={w - 4} y="-188" width="20" height="92" rx="10" fill={id === "june" ? top2 : top} />
      <circle cx={inj ? -w + 22 : -w - 6} cy={inj ? -128 : -96} r="11" fill={skin} />
      <circle cx={w + 6} cy="-96" r="11" fill={skin} />
      {inj >= 1 && <path d={`M${-w - 10},-190 Q${-w + 10},-120 ${w * 0.4},-196`} stroke="#f5f5f0" strokeWidth="10" fill="none" strokeLinecap="round" />}
      {verySick && <path d={`M${-w - 22},-186 Q0,-214 ${w + 22},-186 L${w + 26},-96 Q0,-80 ${-w - 26},-96Z`} fill="#8e7dbe" opacity="0.92" />}
      {verySick && <path d={`M${-w - 22},-150 L${w + 24},-150 M${-w - 24},-120 L${w + 25},-120`} stroke="#b9acd9" strokeWidth="5" opacity="0.8" />}
    </g>
  );
}

/** Full-body figure. x/y place the feet; s scales. */
export const FigureG = memo(function FigureG({ id, m, x = 0, y = 0, s = 1, flip = false, delay = 0, onClick, selected }) {
  const C = BY_ID[id].colors;
  const sick = m && m.sick >= 1;
  const skin = sick ? mix(C.skin, "#9cc27a", 0.38) : m && (m.thirst >= 75 || m.hp <= 25) ? mix(C.skin, "#d8d3c8", 0.3) : C.skin;
  const k = s * SIZE[id];
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -k : k} ${k})`} className={`lsh-fig${onClick ? " lsh-fig--btn" : ""}${selected ? " lsh-fig--sel" : ""}`} style={{ "--d": `${delay}s` }} onClick={onClick}>
      <ellipse cx="0" cy="0" rx="58" ry="12" fill="#000" opacity="0.28" />
      {selected && <ellipse cx="0" cy="0" rx="66" ry="15" fill="none" stroke="#ffd166" strokeWidth="5" className="lsh-sel-ring" />}
      <g className="lsh-fig__body">
        <Body id={id} m={m} C={C} skin={skin} />
        <g className="lsh-fig__head">
          <Hair id={id} C={C} back />
          <rect x="-12" y="-208" width="24" height="16" fill={skin} />
          <circle cx="-45" cy="-246" r="9" fill={skin} />
          <circle cx="45" cy="-246" r="9" fill={skin} />
          <ellipse cx="0" cy="-250" rx="47" ry="49" fill={skin} />
          {/* Hollis's beard sits under his mouth; everyone else's hair frames the face */}
          {id === "hollis" ? <Hair id={id} C={C} /> : null}
          <Face id={id} m={m} C={C} skin={skin} />
          {id !== "hollis" ? <Hair id={id} C={C} /> : null}
          {m && m.injured >= 1 && (
            <g>
              <path d="M-48,-276 Q0,-296 48,-276" stroke="#f5f5f0" strokeWidth="11" fill="none" />
              <circle cx="22" cy="-288" r="4" fill="#d64545" opacity="0.8" />
            </g>
          )}
        </g>
      </g>
    </g>
  );
});

/** Head-and-shoulders portrait in its own <svg>. */
export function Portrait({ id, m, size = 56, dead = false, away = false, className = "" }) {
  return (
    <svg className={`lsh-portrait ${dead ? "is-dead" : ""} ${away ? "is-away" : ""} ${className}`} viewBox="-75 -330 150 150" width={size} height={size} aria-hidden="true">
      <circle cx="0" cy="-255" r="74" fill={BY_ID[id].colors.accent} opacity="0.28" />
      <g transform="translate(0 -6)">
        <FigureG id={id} m={dead ? null : m} s={1 / SIZE[id]} />
      </g>
    </svg>
  );
}
