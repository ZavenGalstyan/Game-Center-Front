/**
 * Motel 6: Last Guest — every encounter, deterministic. `guest()` fills in a
 * consistent document set (ID, reservation, answers, car) from a few fields;
 * each suspicious guest only overrides the fields that carry its clue. The
 * engine derives violations from these VISIBLE fields only, and the headless
 * test proves: (truth === "guest") ⇔ no active rule is broken.
 *
 * truth: guest (valid) · invalid (honest person, broken rule) · forger · entity
 */
import { NIGHTS } from "./data.js";

/* ------------------------------------------------------------------ faces */
// skin 0-5 · hair colour key · style · eyes · beard · glasses · age 0-2 · coat · mark · shape · mouth
export const SKIN = ["#f2d6bf", "#e4b994", "#c9926a", "#9c6a48", "#714a33", "#4c3123"];
export const HAIR = { black: "#17110d", brown: "#4a2f1f", auburn: "#7b3420", blond: "#c8a25a", gray: "#8d8a85", white: "#dcd8d0", red: "#a23f1d", dark: "#2a1d15" };

function face(skin, hair, style, eyes, more = {}) {
  return { skin, hair, style, eyes, beard: "none", glasses: "none", age: 1, coat: "#3b4652", mark: "none", shape: "oval", mouth: "neutral", ...more };
}
export const FACE_KEYS = ["skin", "hair", "style", "eyes", "beard", "glasses", "mark", "shape", "age"];
export function samePortrait(a, b) {
  return FACE_KEYS.every((k) => a[k] === b[k]);
}

/* ------------------------------------------------------------------ helper */
const WORDS = ["Juniper", "Copper", "Harbor", "Meadow", "Sparrow", "Granite", "Willow", "Cobalt", "Ember", "Thistle", "Orchard", "Falcon", "Saffron", "Lantern", "Bramble"];
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const pad = (n, w) => String(n).padStart(w, "0");

function guest(id, o) {
  const night = Number(id[1]);
  const date = NIGHTS[night].date;
  const h = hash(id);
  const state = o.state || "NE";
  const number = o.number || `${state}-${pad(100000 + (h % 899999), 6)}`;
  const f = o.face;
  const doc = {
    name: o.idName || o.name,
    dob: o.dob,
    state,
    number,
    expires: o.expires || `${2021 + (h % 4)}-${pad(1 + ((h >>> 4) % 12), 2)}-${pad(1 + ((h >>> 8) % 27), 2)}`,
    seal: o.seal !== false,
    photo: o.photo ? { ...f, ...o.photo } : f,
    address: o.address || `${100 + (h % 880)} ${["Elm", "Prairie", "Oak", "Mill", "Cedar", "Railroad", "Water"][h % 7]} St`,
  };
  let res = null;
  if (o.res !== null) {
    const r = o.res || {};
    res = {
      name: r.name || o.name,
      room: r.room,
      nights: r.nights || 1 + (h % 3),
      checkIn: r.checkIn || date,
      booked: r.booked || `2019-${pad(8 + ((h >>> 3) % 2), 2)}-${pad(2 + ((h >>> 6) % 26), 2)}`,
      code: r.code || `M6-${pad(1000 + ((h >>> 5) % 8999), 4)}`,
      idLast4: r.idLast4 || number.slice(-4),
      plate: r.plate === undefined ? null : r.plate,
      word: night >= 4 ? r.word || WORDS[h % WORDS.length] : null,
      via: r.via || ["Phone", "Online", "Travel agent"][(h >>> 2) % 3],
    };
  }
  const car = o.car !== undefined ? o.car : res?.plate || null;
  const answers = {
    dob: o.answers?.dob || doc.dob,
    code: o.answers?.code || res?.code || null,
    word: o.answers?.word || res?.word || null,
    vehicle: o.answers?.vehicle || null,
  };
  return {
    id, night, name: o.name, face: f, doc, res, car, carColor: o.carColor || "#5d6670",
    cctv: o.cctv || "normal",
    returning: !!o.returning,
    truth: o.truth || "guest",
    behavior: o.behavior || "",
    lines: o.lines || {},
    answers,
    final: !!o.final,
    mood: o.mood || (o.truth === "entity" ? "still" : "calm"),
  };
}

/* ================================================================== guests */
const G = [
  /* ------------------------------------------------ Night 1 — Check-In */
  guest("n1_briggs", {
    name: "Walter Briggs", dob: "1961-04-12", state: "NE",
    face: face(1, "gray", "short", "blue", { beard: "full", age: 2, coat: "#5a4632", shape: "square" }),
    res: { room: 3, plate: "NE 3KT-118", nights: 1 }, carColor: "#7a2b22",
    behavior: "Big man in a soaked trucker jacket. Smells like diesel and coffee.",
    lines: { greet: "Evening. Briggs — I called ahead. Just need a bed till sunrise.", purpose: "Hauling freight to Denver. I sleep where the road quits on me.", from: "Omaha. Six hours of rain.", before: "Couple of times. Quiet place. Too quiet, some nights.", accept: "Much obliged.", reject: "You're kidding me. In this weather?" },
  }),
  guest("n1_kale", {
    name: "Dennis Kale", dob: "1984-09-02", state: "IA", expires: "2019-08-14",
    face: face(2, "brown", "slick", "brown", { beard: "stubble", coat: "#2f3a2c" }),
    res: { room: 4, nights: 2 }, truth: "invalid",
    behavior: "Polite, tired. Keeps checking his phone.",
    lines: { greet: "Hi — reservation under Kale. Long day, long drive.", purpose: "Job interview in Lincoln on Monday.", from: "Des Moines.", before: "Never. Found you on the map.", accept: "Thanks a lot.", reject: "Expired? Oh, come on… I've been meaning to renew that." },
  }),
  guest("n1_ortiz", {
    name: "Lena Ortiz", dob: "1992-02-27", state: "KS",
    face: face(3, "black", "long", "brown", { age: 0, coat: "#6b2f3d", mark: "mole", shape: "round", mouth: "smile" }),
    res: { room: 6, nights: 1 },
    behavior: "Shakes the rain off a red umbrella. A cab idles outside, then leaves.",
    lines: { greet: "Hi! Ortiz, one night. The cab driver said you were the only place still open.", purpose: "My sister's wedding is tomorrow in North Platte.", from: "Wichita — the bus broke down.", before: "First time. It's… cozy?", accept: "You're a lifesaver.", reject: "Seriously? Where am I supposed to go?" },
  }),
  guest("n1_ames", {
    name: "Paul Ames", dob: "1979-11-30", state: "NE",
    face: face(0, "blond", "buzz", "gray", { age: 1, coat: "#3a3f47", shape: "long" }),
    photo: { hair: "brown", style: "long", beard: "full", glasses: "square", shape: "oval" },
    res: { room: 9, nights: 3 }, truth: "forger",
    behavior: "Answers before you finish asking. Holds the ID card face-down until you take it.",
    lines: { greet: "Ames. Paul Ames. Three nights. I'm in a hurry.", purpose: "Business.", from: "East.", before: "No.", accept: "Good.", reject: "(he snatches at the card, then thinks better of it and leaves fast)" },
  }),
  guest("n1_marsh", {
    name: "Evelyn Marsh", dob: "1953-06-19", state: "NE",
    face: face(0, "black", "long", "gray", { coat: "#d9d6cc", age: 0, shape: "long", mouth: "thin" }),
    res: null, cctv: "absent", truth: "entity",
    behavior: "Barefoot, dripping wet, but her hair is perfectly dry. She doesn't blink.",
    lines: { greet: "I'd like the thirteenth room, please. I've waited such a long time.", purpose: "I'm meeting someone. He's late. He's been late for years.", from: "From the water. From the road. Does it matter?", before: "Oh yes. Everyone stays here eventually.", accept: "(she smiles without showing her teeth)", reject: "(she tilts her head, much too far, then walks out — leaving wet footprints that stop in the middle of the lot)" },
  }),

  /* ------------------------------------------------ Night 2 — Paperwork */
  guest("n2_pratt", {
    name: "Owen Pratt", dob: "1975-01-08", state: "MO",
    face: face(4, "black", "short", "brown", { beard: "goatee", glasses: "round", coat: "#2e3d55" }),
    res: { room: 2, nights: 2 },
    behavior: "Neat, soft-spoken. A thermos of tea under his arm.",
    lines: { greet: "Good evening. Pratt, Owen — two nights.", purpose: "Surveying the new highway exit for the county.", from: "Kansas City.", before: "Last spring. The ice machine was broken then too.", accept: "Thank you kindly.", reject: "I… see. I'll sleep in the truck, then." },
  }),
  guest("n2_benton", {
    name: "Carla Benton", dob: "1988-07-21", state: "CO",
    face: face(1, "auburn", "bob", "green", { coat: "#4a3a5c", mark: "freckles", age: 0 }),
    res: { room: 5, idLast4: "7720" }, truth: "forger",
    behavior: "Friendly, but she watches your hands, not your face.",
    lines: { greet: "Hi there! Benton — should be under my name.", purpose: "Visiting family. Ha. You know how it is.", from: "Denver.", before: "Nope, first time!", accept: "Perfect.", reject: "(her smile drops instantly) …Your loss." },
  }),
  guest("n2_delaney", {
    name: "Gus Delaney", dob: "1958-03-14", state: "KS",
    face: face(2, "white", "bald", "blue", { beard: "mustache", age: 2, coat: "#5b4a2e", shape: "round", mouth: "smile" }),
    res: { room: 9, checkIn: "2019-10-27" }, truth: "invalid",
    behavior: "Cheerful old man. Offers you a butterscotch candy.",
    lines: { greet: "Howdy! Delaney. My daughter booked it for me on the computer.", purpose: "Fishing at the reservoir, if the rain lets up.", from: "Dodge City.", before: "Back in '88! You weren't born yet, I bet.", accept: "Much obliged, young fella.", reject: "Tomorrow? Well, shoot. That girl of mine… I'll call her." },
  }),
  guest("n2_calder", {
    name: "Ivy Calder", dob: "1996-12-03", state: "IA",
    face: face(0, "red", "curly", "green", { coat: "#24453f", age: 0, mark: "freckles" }),
    res: { room: 10, nights: 1 },
    behavior: "Visibly nervous. Keeps glancing at the window. Her hands shake.",
    lines: { greet: "Calder. Ivy Calder. Sorry — sorry, I'm just… is it always this dark out there?", purpose: "Driving to my new job in Cheyenne. I don't like driving at night.", from: "Cedar Rapids.", before: "No. Something followed my car for a mile. Just headlights. Probably nothing.", accept: "Thank you. Really.", reject: "Please — please, I can't go back out there." },
  }),
  guest("n2_rook", {
    name: "Nadia Rook", dob: "1990-05-09", state: "NE", number: "NB-220417",
    face: face(2, "dark", "bun", "brown", { coat: "#1f2a33", glasses: "square", shape: "long" }),
    res: { room: 11, nights: 2 }, truth: "forger",
    behavior: "Calm, practiced. Already holding the pen to sign.",
    lines: { greet: "Rook. Two nights. Card's on file.", purpose: "Conference.", from: "Lincoln.", before: "Once or twice.", accept: "Thanks.", reject: "(she takes the card back without a word)" },
  }),
  guest("n2_hartley", {
    name: "Simon Hartley", dob: "1987-10-26", state: "SD",
    face: face(1, "brown", "short", "brown", { coat: "#3d3d3d", shape: "oval" }),
    res: { room: 7, nights: 1 }, cctv: "twisted",
    answers: { dob: "1952-10-26" }, truth: "entity",
    behavior: "Too still. His umbrella is dry. He smiles a moment after you do.",
    lines: { greet: "Hartley. Room seven. I always have room seven.", purpose: "Today is my birthday. I come back every year.", from: "Down the road. Not far. Never far.", before: "Every year. Every single year.", accept: "Happy birthday to me.", reject: "(the smile stays on his face long after the rest of him has turned to leave)" },
  }),

  /* ------------------------------------------------ Night 3 — Static */
  guest("n3_webb", {
    name: "Marcus Webb", dob: "1983-08-17", state: "CO",
    face: face(5, "black", "buzz", "brown", { beard: "stubble", coat: "#2b3f5e", shape: "square" }),
    res: { room: 1, plate: "CO 5MW-221", nights: 1 }, carColor: "#2d4f7a",
    behavior: "Paramedic uniform under his jacket. Exhausted.",
    lines: { greet: "Webb. Just one night. Double shift, then a three-hour drive. Not happening.", purpose: "Sleep. Just sleep.", from: "Fort Morgan.", before: "Few times. Nothing ever happens here, right?", accept: "Bless you.", reject: "Man… alright. Alright." },
  }),
  guest("n3_lang", {
    name: "Theo Lang", dob: "1991-02-02", state: "IA",
    face: face(1, "blond", "slick", "blue", { coat: "#4f3b2a", mouth: "smile" }),
    res: { room: 3, plate: "IA 7PL-302", nights: 2 }, car: null, truth: "forger",
    answers: { vehicle: "Sure did. Blue Buick, right out front. Can't miss it." },
    behavior: "Charming. His shoes are dry, but he says he drove through the storm.",
    lines: { greet: "Theo Lang! Two nights. You look like you could use some company, ha.", purpose: "Sales. Farm equipment. Riveting stuff.", from: "Council Bluffs.", before: "Never, but I've heard stories.", accept: "Pleasure doing business.", reject: "Hey, no hard feelings, chief." },
  }),
  guest("n3_kessler", {
    name: "Rhoda Kessler", dob: "1966-11-23", state: "KS",
    face: face(0, "gray", "bob", "blue", { age: 2, glasses: "round", coat: "#6a5a3f", mouth: "frown" }),
    res: { room: 4, plate: "KS 2RK-660", nights: 1 }, carColor: "#8a8a7a",
    behavior: "Stern retired schoolteacher. Asks you to stand up straight.",
    lines: { greet: "Kessler. I booked a non-smoking room and I expect a non-smoking room.", purpose: "Driving to my sister's. She lives too far from everything.", from: "Salina.", before: "In 1979, as a girl. My parents left in the middle of the night. They never said why.", accept: "Hmph. Thank you.", reject: "Well! I never." },
  }),
  guest("n3_parrish", {
    name: "June Parrish", dob: "1989-04-04", state: "NE",
    face: face(1, "brown", "long", "brown", { coat: "#5c4b67", age: 0, mouth: "smile" }),
    res: { room: 6, nights: 1 }, cctv: "absent", truth: "entity",
    behavior: "Sweet and soft-spoken. The rain on her coat doesn't drip.",
    lines: { greet: "Hi. Parrish, one night. I hope I'm not too late.", purpose: "Just passing through. I'm always just passing through.", from: "I don't remember the town. It was a long drive.", before: "I think so. Everything here feels familiar.", accept: "Thank you. I'll be very quiet.", reject: "(she keeps smiling at the spot where you were sitting, even after you lean away)" },
  }),
  guest("n3_crane", {
    name: "Abel Crane", dob: "1970-01-13", state: "WY",
    face: face(0, "black", "slick", "gray", { coat: "#1c1c1c", shape: "long", mouth: "thin" }),
    res: { room: 13, nights: 7 }, cctv: "twisted", truth: "entity",
    behavior: "Tall. Wears a black suit, soaked through. He smells like wet earth.",
    lines: { greet: "Crane. Seven nights. Room thirteen — it's all arranged.", purpose: "Collecting.", from: "Behind you.", before: "I never leave.", accept: "(he bows very low)", reject: "(the lights flicker; when they come back he is already at the door)" },
  }),

  /* ------------------------------------------------ Night 4 — Vacancy */
  guest("n4_brooks", {
    name: "Elena Brooks", dob: "1994-06-30", state: "MO",
    face: face(2, "black", "curly", "brown", { coat: "#7a4a2a", age: 0, mouth: "smile" }),
    res: { room: 4, nights: 1, word: "Juniper" },
    behavior: "College hoodie, backpack, cheerful despite the rain.",
    lines: { greet: "Hey! Brooks — Elena. One night, booked online.", purpose: "Road trip! Well, my car's road trip. I'm just along for the ride.", from: "St. Joseph.", before: "Nope. Is it haunted? Everyone online says it's haunted.", accept: "Sweet, thanks!", reject: "Wait, what? Did I do something?" },
  }),
  guest("n4_sloane", {
    name: "Victor Sloane", dob: "1972-09-15", state: "NE",
    face: face(1, "gray", "short", "green", { beard: "stubble", age: 2, coat: "#2f2f3a", mark: "scar" }),
    res: { room: 9, nights: 2, word: "Copper" },
    behavior: "Scar across his eyebrow. Twitchy. Asks if the doors lock from the inside.",
    lines: { greet: "Sloane. Two nights. Do the doors lock? From the inside, I mean.", purpose: "Somebody owes me money in Ogallala.", from: "Grand Island.", before: "Once. I didn't sleep.", accept: "Yeah. Okay. Thanks.", reject: "Figures." },
  }),
  guest("n4_dorsey", {
    name: "Frank Dorsey", dob: "1968-02-11", state: "KS",
    face: face(1, "brown", "short", "blue", { beard: "mustache", age: 2, coat: "#4d3c2c", shape: "round" }),
    res: { room: 5, nights: 3, word: "Harbor", booked: "2019-10-20" }, returning: true,
    answers: { word: "Lantern" }, cctv: "twisted", truth: "entity",
    behavior: "Room 5's guest. His clothes are dry, but his hair is soaked. His smile doesn't move.",
    lines: { greet: "I locked myself out. Room five. I need a new key. Please.", purpose: "I'm staying here. I'm staying here a long time now.", from: "From my room. From room five.", before: "I'm in room five. I just need to get back in.", accept: "Thank you. Thank you. Thank you.", reject: "(he stands perfectly still for a long time. The fluorescent light above him dies.)" },
  }),
  guest("n4_whitlock", {
    name: "Pam Whitlock", dob: "1977-05-25", state: "CO", expires: "2019-10-01",
    face: face(0, "blond", "bun", "blue", { coat: "#5a6b7a", glasses: "round" }),
    res: { room: 10, nights: 1, word: "Meadow" }, truth: "invalid",
    behavior: "Night-shift nurse. Polite and sleepy.",
    lines: { greet: "Hi, Whitlock — I'm so tired I could sleep on your counter.", purpose: "Covering a shift at the county hospital.", from: "Sterling.", before: "Once, years ago.", accept: "Thank you, honey.", reject: "Oh no — it expired this month? Ugh. Okay. I'll find somewhere." },
  }),
  guest("n4_morrow", {
    name: "Dean Morrow", dob: "1980-12-12", state: "SD",
    face: face(3, "black", "short", "gray", { coat: "#202830", shape: "long", mouth: "thin" }),
    res: { room: 12, nights: 1, word: "Sparrow" },
    behavior: "Unsettling. He hasn't blinked once. Everything about his paperwork is perfect.",
    lines: { greet: "Morrow. One night.", purpose: "Funeral. My brother's.", from: "Rapid City.", before: "No.", accept: "Thank you.", reject: "…Okay." },
  }),

  /* ------------------------------------------------ Night 5 — Blackout */
  guest("n5_sorensen", {
    name: "Hank Sorensen", dob: "1964-07-04", state: "SD",
    face: face(0, "white", "cap", "blue", { beard: "full", age: 2, coat: "#6a2a1e" }),
    res: { room: 1, plate: "SD 6HS-904", nights: 1, word: "Granite" }, carColor: "#3d5c3a",
    behavior: "Farmer. Shakes your hand too hard.",
    lines: { greet: "Sorensen. Lights went out down the whole valley.", purpose: "Cattle auction in North Platte.", from: "Pierre.", before: "Every October. Darn rain every time.", accept: "Thank ya.", reject: "Well, that's a first." },
  }),
  guest("n5_cho", {
    name: "Lydia Cho", dob: "1985-03-19", state: "CO", seal: false,
    face: face(1, "black", "bob", "brown", { coat: "#3e2f4f", glasses: "square" }),
    res: { room: 3, nights: 2, word: "Willow" }, truth: "forger",
    behavior: "Businesslike. Her ID card feels a little too thick.",
    lines: { greet: "Cho, two nights. I'm in a bit of a rush.", purpose: "Insurance adjuster. Storm damage.", from: "Boulder.", before: "No.", accept: "Thanks.", reject: "This is ridiculous. (she leaves without the ID)" },
  }),
  guest("n5_reed", {
    name: "Tobias Reed", dob: "1990-10-10", state: "IA",
    face: face(2, "auburn", "curly", "green", { beard: "stubble", coat: "#2c3e2c" }),
    res: { room: 6, nights: 1, code: "M6-4417", word: "Cobalt" }, answers: { code: "M6-4471" }, truth: "forger",
    behavior: "Reads the confirmation code off a crumpled sticky note.",
    lines: { greet: "Reed. Tobias Reed. One night.", purpose: "Concert in Lincoln got cancelled. Storm.", from: "Ames.", before: "Nah.", accept: "Cool.", reject: "Whatever, man." },
  }),
  guest("n5_lund", {
    name: "Greta Lund", dob: "1957-12-01", state: "NE",
    face: face(0, "white", "bun", "blue", { age: 2, coat: "#7a6a5a", mark: "mole", mouth: "smile" }),
    res: { room: 9, nights: 1, word: "Ember" },
    behavior: "Elderly, sharp-eyed. Carries a candle lantern.",
    lines: { greet: "Lund. Your sign went dark, dear. I nearly drove past.", purpose: "Visiting my husband's grave. Forty years tomorrow.", from: "Kearney.", before: "In 1979. My husband worked here, for a while.", accept: "Thank you, dear. Lock your door tonight.", reject: "Hm. Maybe that's for the best." },
  }),
  guest("n5_price", {
    name: "Wendell Price", dob: "1976-08-08", state: "MO",
    face: face(3, "dark", "slick", "brown", { coat: "#1d2433", glasses: "round", shape: "long" }),
    res: { room: 10, nights: 1, word: "Thistle" }, answers: { dob: "1876-08-08" }, cctv: "absent", truth: "entity",
    behavior: "Speaks in an old-fashioned way. When the lights dim, he doesn't.",
    lines: { greet: "Good evening. Price. I believe I am expected.", purpose: "An appointment of long standing.", from: "From the station. The last train.", before: "Many times. Many, many times.", accept: "Splendid.", reject: "(he laughs, softly, and the laugh keeps going after the door closes)" },
  }),

  /* ------------------------------------------------ Night 6 — History */
  guest("n6_okafor", {
    name: "Sam Okafor", dob: "1986-01-29", state: "MO",
    face: face(5, "black", "short", "brown", { beard: "full", coat: "#3a4a3a", glasses: "square", mouth: "smile" }),
    res: { room: 2, nights: 1, word: "Orchard" },
    behavior: "History teacher. Asks if you know anything about the motel's past.",
    lines: { greet: "Okafor, one night. Is it true this place opened in the fifties?", purpose: "Researching old Route 6 for my students.", from: "Columbia.", before: "No, but I've read about it. Five people went missing here in 1979.", accept: "Thanks!", reject: "Oh. Okay." },
  }),
  guest("n6_lowell", {
    name: "Edith Lowell", dob: "1938-04-02", state: "NE", expires: "1983-05-02",
    face: face(0, "brown", "bob", "blue", { age: 0, coat: "#8a7a5a", mouth: "smile" }),
    res: { room: 4, nights: 1, word: "Falcon", booked: "1979-10-20" }, cctv: "other", truth: "entity",
    behavior: "Young woman in a 1970s coat. Her ID is from 1979. She says she's forty-one.",
    lines: { greet: "Lowell, Edith. My room should be ready by now. I've been waiting outside for so long.", purpose: "I'm meeting my husband. He said he'd come back for me.", from: "From room thirteen. They let me out for the week.", before: "I never left.", accept: "Oh, thank you. Thank you.", reject: "(she starts to cry, and the crying echoes from the hallway behind you)" },
  }),
  guest("n6_barlow", {
    name: "Nick Barlow", dob: "1993-09-09", state: "WY",
    face: face(1, "brown", "cap", "blue", { beard: "stubble", coat: "#5a3a2a", age: 0 }),
    res: { room: 5, nights: 1, plate: "WY 8NB-417", word: "Saffron" }, carColor: "#a68a2a",
    behavior: "Long-haul driver, wired on gas-station coffee.",
    lines: { greet: "Barlow. One night. Room five's fine, whatever you got.", purpose: "Hauling to Laramie.", from: "Cheyenne. Then back. Then here.", before: "Never. Heard you lose guests here, ha.", accept: "Appreciate it.", reject: "Come on, man." },
  }),
  guest("n6_monroe", {
    name: "Tess Monroe", dob: "1982-02-14", state: "KS",
    face: face(2, "auburn", "long", "green", { coat: "#4a2a3a", mark: "freckles" }),
    res: { room: 10, nights: 2, name: "Tessa Munroe", word: "Bramble" }, truth: "invalid",
    behavior: "Friendly. Says her friend made the booking for her.",
    lines: { greet: "Hi! Monroe — my friend booked it. Two nights.", purpose: "Photography trip. Abandoned places.", from: "Hays.", before: "No, but this place is on my list!", accept: "Thanks!", reject: "The spelling? She spelled it wrong? Ugh." },
  }),
  guest("n6_penhallow", {
    name: "Arthur Penhallow", dob: "1941-07-07", state: "IA",
    face: face(1, "dark", "slick", "brown", { beard: "mustache", coat: "#2a2a2a", shape: "square" }),
    res: { room: 11, nights: 1, word: "Granite", booked: "1979-10-19" }, cctv: "twisted", truth: "entity",
    behavior: "Thirty-something man in a wide-lapelled suit. His ID says he's 78.",
    lines: { greet: "Penhallow. I had a room here once. I'd like it again.", purpose: "Unfinished business.", from: "Down the hall.", before: "October twenty-sixth, nineteen seventy-nine. I remember the date exactly.", accept: "Good. Good.", reject: "(he whispers your name — you never told him your name)" },
  }),

  /* ------------------------------------------------ Night 7 — The Last Guest */
  guest("n7_graves", {
    name: "Lucy Graves", dob: "1995-10-31", state: "NE",
    face: face(0, "black", "bun", "green", { coat: "#2a2a3a", age: 0, mark: "mole", mouth: "smile" }),
    res: { room: 3, nights: 1, word: "Willow" },
    behavior: "Witch costume, plastic hat. Laughs at her own last name.",
    lines: { greet: "Graves, on Halloween, on my birthday. I know, I know.", purpose: "Party in North Platte. My ride left without me.", from: "Lincoln.", before: "No. Is it true about this place?", accept: "Happy Halloween!", reject: "Lame." },
  }),
  guest("n7_arden", {
    name: "Felix Arden", dob: "1981-06-06", state: "CO", number: "CD-503118", seal: false,
    face: face(2, "brown", "short", "brown", { glasses: "round", coat: "#3a2e24", mouth: "smile" }),
    res: { room: 5, nights: 1, word: "Cobalt" }, truth: "forger",
    behavior: "Very smooth. Compliments the motel's 'character'.",
    lines: { greet: "Arden. Lovely establishment. Such character.", purpose: "Antiques. I buy old things from old places.", from: "Pueblo.", before: "Not yet.", accept: "Charmed.", reject: "Pity." },
  }),
  guest("n7_kerr", {
    name: "Raymond Kerr", dob: "1952-03-03", state: "NE",
    face: face(1, "brown", "short", "brown", { coat: "#384a5a", age: 0, mark: "scar" }),
    res: { room: 6, nights: 1, word: "Ember" }, cctv: "absent", truth: "entity",
    behavior: "Wears a motel staff jacket from 1979. Name tag: RAY. He looks exactly like the staff photo.",
    lines: { greet: "Kerr. Raymond. I used to work this desk, you know. Long time ago.", purpose: "Just want to rest. I'm so tired. Forty years of night shifts.", from: "The back. Room thirteen. The register.", before: "I signed myself in. Don't do what I did.", accept: "(he sighs) …Thank you, kid.", reject: "(he nods, almost proud) Good. You're better at this than I was." },
  }),
  guest("n7_voss", {
    name: "Marion Voss", dob: "1989-10-31", state: "NE",
    face: face(0, "auburn", "long", "green", { coat: "#cfc7b8", age: 0, mouth: "smile", shape: "oval" }),
    res: { room: 12, nights: 1, word: "Lantern", booked: "1979-10-31", via: "In person" }, cctv: "flicker", truth: "entity", final: true,
    behavior: "Pale coat, perfect hair, perfect papers. Your breath fogs when she smiles.",
    lines: { greet: "Good evening. Voss, Marion. I have a reservation. I believe everything is in order.", purpose: "To sign the book. It's tradition.", from: "From here. I've always been here.", before: "Once. I never checked out.", accept: "(she takes the pen, and every light in the hallway goes out, one by one)", reject: "(she smiles) We'll see." },
  }),
];

/* ------------------------------------------------------------------ 3D look */
// Body type, outfit, height (m) and demeanour for the 3D model. Not part of the
// face spec compared against the ID photo.
const LOOK = {
  n1_briggs: { outfit: "jacket", height: 1.88 }, n1_kale: { outfit: "jacket" }, n1_ortiz: { body: "f", outfit: "coat" },
  n1_ames: { outfit: "suit", mood: "nervous" }, n1_marsh: { body: "f", outfit: "dress", height: 1.7 },
  n2_pratt: { outfit: "jacket" }, n2_benton: { body: "f", outfit: "jacket" }, n2_delaney: { outfit: "jacket", height: 1.7 },
  n2_calder: { body: "f", outfit: "hoodie", mood: "nervous" }, n2_rook: { body: "f", outfit: "suit" }, n2_hartley: { outfit: "suit" },
  n3_webb: { outfit: "jacket", height: 1.84 }, n3_lang: { outfit: "suit" }, n3_kessler: { body: "f", outfit: "coat" },
  n3_parrish: { body: "f", outfit: "coat" }, n3_crane: { outfit: "suit", height: 1.96 },
  n4_brooks: { body: "f", outfit: "hoodie" }, n4_sloane: { outfit: "jacket", mood: "nervous" }, n4_dorsey: { outfit: "jacket" },
  n4_whitlock: { body: "f", outfit: "coat" }, n4_morrow: { outfit: "suit", mood: "still", height: 1.86 },
  n5_sorensen: { outfit: "jacket", height: 1.83 }, n5_cho: { body: "f", outfit: "suit" }, n5_reed: { outfit: "hoodie" },
  n5_lund: { body: "f", outfit: "coat", height: 1.56 }, n5_price: { outfit: "suit" },
  n6_okafor: { outfit: "jacket" }, n6_lowell: { body: "f", outfit: "coat" }, n6_barlow: { outfit: "hoodie" },
  n6_monroe: { body: "f", outfit: "jacket" }, n6_penhallow: { outfit: "suit" },
  n7_graves: { body: "f", outfit: "dress" }, n7_arden: { outfit: "suit" }, n7_kerr: { outfit: "jacket" },
  n7_voss: { body: "f", outfit: "coat", height: 1.72 },
};
for (const g of G) {
  const l = LOOK[g.id];
  if (!l) continue;
  for (const k of ["body", "outfit", "height"]) if (l[k]) g.face[k] = l[k];
  if (l.mood) g.mood = l.mood;
}

export const GUESTS = Object.fromEntries(G.map((g) => [g.id, g]));
export const ALL_GUESTS = G;
