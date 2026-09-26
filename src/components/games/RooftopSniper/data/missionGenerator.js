/**
 * Rooftop Sniper — the mission generator for Industrial District through
 * High Security Zone (locations 2-6; Downtown is hand-authored in
 * data/missions.js since it's the tutorial run). Deterministic (seeded per
 * mission id, no runtime randomness) so a location's missions never change
 * shape between attempts — same approach as Bomb Squad's
 * buildOperationMissions().
 *
 * A small set of target "templates" (spread / moving / popup / switch-gate
 * / decoy / drone / long-range / mixed) get assigned across each location's
 * 10 slots so no location is 10 copies of "shoot 5 targets" — see the
 * `TEMPLATE_ORDER` table below, one per location.
 */
function mulberry32(seed) {
  let a = seed;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TEMPLATE_ORDER = {
  industrial: ["spread", "moving", "switchgate", "popup", "decoy", "moving", "switchgate", "popup", "longrange", "mixed"],
  desert: ["spread", "longrange", "moving", "decoy", "switchgate", "longrange", "popup", "moving", "longrange", "mixed"],
  snow: ["spread", "popup", "moving", "switchgate", "decoy", "popup", "longrange", "moving", "decoy", "mixed"],
  neon: ["popup", "moving", "drone", "switchgate", "decoy", "drone", "popup", "longrange", "drone", "mixed"],
  "security-zone": ["longrange", "switchgate", "drone", "decoy", "moving", "popup", "drone", "longrange", "decoy", "mixed"],
};

const LOCATION_CFG = {
  industrial: { distanceRange: [70, 150], wind: null, bulletDrop: false, allowDrones: false, radiusBase: 0.5, ammoSlack: 3 },
  desert: { distanceRange: [110, 230], wind: [1, 3], bulletDrop: true, allowDrones: false, radiusBase: 0.48, ammoSlack: 3 },
  snow: { distanceRange: [90, 190], wind: [2, 4.5], bulletDrop: true, allowDrones: false, radiusBase: 0.4, ammoSlack: 3 },
  neon: { distanceRange: [80, 170], wind: [1.5, 3.5], bulletDrop: true, allowDrones: true, radiusBase: 0.44, ammoSlack: 3 },
  "security-zone": { distanceRange: [100, 240], wind: [3, 6], bulletDrop: true, allowDrones: true, radiusBase: 0.38, ammoSlack: 2 },
};

const TEMPLATE_LABEL = {
  spread: "TRAINING SWEEP",
  moving: "MOVING TARGETS",
  popup: "POP-UP TARGETS",
  switchgate: "ACTIVATE & ENGAGE",
  decoy: "IDENTIFY THE THREAT",
  drone: "DRONE INTERCEPT",
  longrange: "LONG-RANGE PRECISION",
  mixed: "FULL SPECTRUM",
};

const TEMPLATE_OBJECTIVE = {
  spread: "Hit all marked targets",
  moving: "Hit all moving targets",
  popup: "Hit all pop-up targets",
  switchgate: "Activate switches, then hit their targets",
  decoy: "Hit real targets only — decoys don't count",
  drone: "Destroy all drones",
  longrange: "Hit all long-range targets",
  mixed: "Complete every objective",
};

const TEMPLATE_BRIEFING = {
  spread: "Standard sweep. Take them out one at a time.",
  moving: "These targets won't sit still. Track and lead your shot.",
  popup: "Targets appear briefly — be ready before they show.",
  switchgate: "Some targets are inactive until their switch is hit first.",
  decoy: "Not every target is real. Wasting a shot on a decoy counts against you.",
  drone: "Small, fast, airborne. Lead your shots.",
  longrange: "Distance is the whole challenge here. Watch your drop and wind.",
  mixed: "Everything you've learned, in one run.",
};

function pick(rand, [lo, hi]) {
  return lo + rand() * (hi - lo);
}

function makePosition(rand, cfg, spread = 22) {
  const dist = pick(rand, cfg.distanceRange);
  const x = (rand() - 0.5) * spread * 2;
  const y = 1.5 + rand() * 9;
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10, -Math.round(dist)];
}

function offsetPosition(pos, dx) {
  return [Math.round((pos[0] + dx) * 10) / 10, pos[1], pos[2]];
}

function buildTargets(templateName, rand, li, cfg) {
  const radius = Math.max(0.28, cfg.radiusBase - li * 0.012);
  const count = 3 + Math.min(3, Math.floor(li / 3));
  const targets = [];
  let failOnDecoyHit = false;

  const stationary = (n, r = radius) => {
    for (let i = 0; i < n; i++) {
      targets.push({
        id: `t${targets.length + 1}`,
        kind: "stationary",
        position: makePosition(rand, cfg),
        radius: r,
        label: String.fromCharCode(65 + targets.length),
      });
    }
  };

  if (templateName === "spread") {
    stationary(count);
  } else if (templateName === "moving") {
    const movers = 2 + (li >= 6 ? 1 : 0);
    for (let i = 0; i < movers; i++) {
      const base = makePosition(rand, cfg);
      targets.push({
        id: `t${targets.length + 1}`,
        kind: "moving",
        position: base,
        radius: radius + 0.05,
        label: String.fromCharCode(65 + targets.length),
        movement: { type: "patrol", to: offsetPosition(base, 4 + rand() * 4), speed: 0.35 + rand() * 0.35 },
      });
    }
    stationary(Math.max(1, count - movers));
  } else if (templateName === "popup") {
    const n = count;
    for (let i = 0; i < n; i++) {
      targets.push({
        id: `t${targets.length + 1}`,
        kind: "popup",
        position: makePosition(rand, cfg),
        radius: radius + 0.06,
        label: String.fromCharCode(65 + targets.length),
        movement: {
          type: "popup",
          interval: Math.max(1.8, 3.4 - li * 0.15),
          visibleFor: Math.max(0.9, 1.7 - li * 0.06),
          offset: i * 0.6,
        },
      });
    }
  } else if (templateName === "switchgate") {
    const pairs = 1 + (li >= 5 ? 1 : 0);
    for (let p = 0; p < pairs; p++) {
      const switchId = `sw${p + 1}`;
      const switchPos = makePosition(rand, { distanceRange: [cfg.distanceRange[0] * 0.6, cfg.distanceRange[0] * 0.9] });
      targets.push({
        id: switchId,
        kind: "switch",
        position: switchPos,
        radius: radius + 0.14,
        label: `SW${p + 1}`,
      });
      targets.push({
        id: `t${targets.length + 1}`,
        kind: "stationary",
        position: makePosition(rand, cfg),
        radius,
        label: String.fromCharCode(65 + targets.length),
        unlocksAfter: switchId,
      });
    }
    stationary(Math.max(1, count - pairs));
  } else if (templateName === "decoy") {
    const decoys = 1 + Math.floor(li / 4);
    stationary(count);
    failOnDecoyHit = li >= 5;
    for (let i = 0; i < decoys; i++) {
      targets.push({
        id: `d${i + 1}`,
        kind: "decoy",
        position: makePosition(rand, cfg),
        radius: radius + 0.08,
        label: "?",
      });
    }
  } else if (templateName === "drone") {
    const n = 2 + Math.min(2, Math.floor(li / 3));
    for (let i = 0; i < n; i++) {
      const base = makePosition(rand, cfg);
      targets.push({
        id: `t${targets.length + 1}`,
        kind: "drone",
        position: base,
        radius: Math.max(0.32, radius - 0.06),
        label: String.fromCharCode(65 + targets.length),
        movement: { type: "hover", radius: 2 + rand() * 2, speed: 0.6 + rand() * 0.5 },
      });
    }
  } else if (templateName === "longrange") {
    const n = 2 + (li >= 6 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      targets.push({
        id: `t${targets.length + 1}`,
        kind: "stationary",
        position: makePosition(rand, { distanceRange: [cfg.distanceRange[1] * 0.85, cfg.distanceRange[1] * 1.15] }),
        radius: Math.max(0.26, radius - 0.1),
        label: String.fromCharCode(65 + targets.length),
      });
    }
  } else if (templateName === "mixed") {
    // one of everything this location allows — the location's finale mission
    const base1 = makePosition(rand, cfg);
    targets.push({
      id: "t1",
      kind: "moving",
      position: base1,
      radius: radius + 0.05,
      label: "A",
      movement: { type: "patrol", to: offsetPosition(base1, 5), speed: 0.4 },
    });
    targets.push({
      id: "t2",
      kind: "popup",
      position: makePosition(rand, cfg),
      radius: radius + 0.06,
      label: "B",
      movement: { type: "popup", interval: 2.6, visibleFor: 1.2, offset: 0 },
    });
    const switchId = "sw1";
    targets.push({
      id: switchId,
      kind: "switch",
      position: makePosition(rand, { distanceRange: [cfg.distanceRange[0] * 0.6, cfg.distanceRange[0] * 0.85] }),
      radius: radius + 0.14,
      label: "SW",
    });
    targets.push({ id: "t3", kind: "stationary", position: makePosition(rand, cfg), radius, label: "C", unlocksAfter: switchId });
    if (cfg.allowDrones) {
      const dbase = makePosition(rand, cfg);
      targets.push({
        id: "t4",
        kind: "drone",
        position: dbase,
        radius: Math.max(0.32, radius - 0.06),
        label: "D",
        movement: { type: "hover", radius: 2.4, speed: 0.7 },
      });
    } else {
      stationary(1);
    }
    targets.push({ id: `d${1}`, kind: "decoy", position: makePosition(rand, cfg), radius: radius + 0.08, label: "?" });
    failOnDecoyHit = true;
  }

  return { targets, failOnDecoyHit };
}

export function generateLocationMissions(location) {
  const cfg = LOCATION_CFG[location.id];
  const order = TEMPLATE_ORDER[location.id];
  const missions = [];

  for (let li = 0; li < 10; li++) {
    const id = location.range[0] + li;
    const rand = mulberry32(id * 7919 + 104729);
    const templateName = order[li];
    const { targets, failOnDecoyHit } = buildTargets(templateName, rand, li, cfg);
    const objectiveTargets = targets.filter((t) => t.kind !== "decoy" && t.kind !== "switch").length;

    const magazine = 5;
    const reserveMags = Math.max(1, Math.ceil((objectiveTargets + cfg.ammoSlack) / magazine) - 1);

    const wind = cfg.wind
      ? { x: (li % 2 === 0 ? 1 : -1) * (pick(rand, cfg.wind)), z: 0 }
      : null;

    const needsTimer = li >= 6 || ["popup", "longrange", "mixed", "drone"].includes(templateName);
    const timeLimit = needsTimer
      ? Math.max(35, Math.round(95 - li * 3 - targets.length * 3))
      : null;

    missions.push({
      id,
      location: location.id,
      name: `${location.name} ${li + 1} — ${TEMPLATE_LABEL[templateName]}`,
      objective: TEMPLATE_OBJECTIVE[templateName],
      briefing: TEMPLATE_BRIEFING[templateName],
      built: true,
      magazine,
      reserveMags,
      timeLimit,
      wind,
      bulletDrop: cfg.bulletDrop,
      bulletTravel: true,
      failOnDecoyHit,
      weather: location.weather,
      targets,
      stars: { twoAccuracy: 0.65, threeAccuracy: 0.85 },
    });
  }

  return missions;
}
