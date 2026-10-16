/**
 * School Life Simulator 3D — static game data: the school day, subjects,
 * teachers, students, missions, food, cosmetics and progression tables.
 * Pure data + tiny helpers (no Three.js, no React) so the simulation and the
 * headless tests can import it directly.
 */

/* ================================================================ time */
// All times are minutes after midnight.
export const DAY_START = 480; // 08:00 — arrival at the gate
export const SCHOOL_END = 900; // 15:00 — final bell
export const DAY_CUTOFF = 930; // 15:30 — the day report opens on its own
export const CLASS_LEN = 55;
export const ON_TIME_GRACE = 5; // seated within start+5 → on time
export const LATE_LIMIT = 25; // seated within start+25 → late, after that → absent
export const ACTIVITY_AT = 9; // the class activity starts at start+9 (or when you sit, if later)

/** Real seconds per in-game minute, by the "Day length" setting. */
export const DAY_SPEED = { short: 0.95, normal: 1.35, long: 2.0 };

/** The day's blocks. `slot` 0-3 are the four lessons, 4 is the sports block. */
export const BLOCKS = [
  { id: "arrival", label: "Arrival", start: 480, end: 510, kind: "free" },
  { id: "c1", label: "1st class", start: 510, end: 565, kind: "class", slot: 0 },
  { id: "pass1", label: "Passing time", start: 565, end: 570, kind: "pass" },
  { id: "c2", label: "2nd class", start: 570, end: 625, kind: "class", slot: 1 },
  { id: "pass2", label: "Passing time", start: 625, end: 630, kind: "pass" },
  { id: "break", label: "Break", start: 630, end: 660, kind: "break" },
  { id: "c3", label: "3rd class", start: 660, end: 715, kind: "class", slot: 2 },
  { id: "pass3", label: "Passing time", start: 715, end: 720, kind: "pass" },
  { id: "lunch", label: "Lunch", start: 720, end: 780, kind: "lunch" },
  { id: "c4", label: "4th class", start: 780, end: 835, kind: "class", slot: 3 },
  { id: "pass4", label: "Passing time", start: 835, end: 840, kind: "pass" },
  { id: "c5", label: "Sports / activities", start: 840, end: 895, kind: "class", slot: 4 },
  { id: "pass5", label: "Passing time", start: 895, end: 900, kind: "pass" },
  { id: "after", label: "School's out", start: 900, end: 24 * 60, kind: "after" },
];
/** Bells ring at the start and end of every class block. */
export const BELLS = [...new Set(BLOCKS.filter((b) => b.kind === "class").flatMap((b) => [b.start, b.end]).concat([SCHOOL_END]))].sort((a, b) => a - b);

export function blockAt(min) {
  for (const b of BLOCKS) if (min >= b.start && min < b.end) return b;
  return min < DAY_START ? BLOCKS[0] : BLOCKS[BLOCKS.length - 1];
}
export const fmtTime = (min) => {
  const h = Math.floor(min / 60);
  const m = Math.floor(min % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

/* ================================================================ subjects */
export const SUBJECTS = {
  math: { id: "math", name: "Mathematics", short: "Math", icon: "➗", color: "#4f8cff", room: "math101", teacher: "patel" },
  english: { id: "english", name: "English", short: "English", icon: "📖", color: "#ff7a59", room: "eng102", teacher: "rivera" },
  science: { id: "science", name: "Science", short: "Science", icon: "🧪", color: "#2fbf71", room: "lab", teacher: "okafor" },
  history: { id: "history", name: "History", short: "History", icon: "🏛️", color: "#c58b3a", room: "hist201", teacher: "lindqvist" },
  cs: { id: "cs", name: "Computer Science", short: "Comp Sci", icon: "💻", color: "#8b5cf6", room: "comp", teacher: "chen" },
  pe: { id: "pe", name: "Physical Education", short: "PE", icon: "🏃", color: "#f2b20f", room: "gym", teacher: "harris" },
};
export const SUBJECT_ORDER = ["math", "english", "science", "history", "cs", "pe"];
export const ACADEMIC = ["math", "english", "science", "history", "cs"];
export const EXAM = { id: "exam", name: "Exam", short: "Exam", icon: "📝", color: "#e0457b", room: "exam103", teacher: "adebayo" };
export const ACTIVITY_BLOCK = { id: "activities", name: "Activities", short: "Activities", icon: "⚽", color: "#22b3c9", room: null, teacher: "harris" };

/** Five-day rotation of the four lessons + the 14:00 block. */
const ROTATION = [
  ["math", "english", "science", "history", "pe"],
  ["cs", "math", "english", "science", "activities"],
  ["history", "cs", "math", "english", "pe"],
  ["english", "science", "history", "cs", "activities"],
  ["math", "history", "science", "cs", "pe"],
];
/** Every third day the 3rd class is an exam on the subjects studied since the last one. */
export const isExamDay = (day) => day % 3 === 0;

export function daySchedule(day) {
  const base = ROTATION[(day - 1) % ROTATION.length].slice();
  if (isExamDay(day)) base[2] = "exam";
  return base;
}
/** Subjects covered by the exam on `day` — the lessons of the two days before it plus this morning. */
export function examSubjects(day) {
  const set = new Set();
  for (let d = Math.max(1, day - 2); d <= day; d++) {
    daySchedule(d).forEach((s, i) => {
      if (ACADEMIC.includes(s) && (d < day || i < 2)) set.add(s);
    });
  }
  const out = ACADEMIC.filter((s) => set.has(s));
  return out.length >= 3 ? out.slice(0, 4) : ACADEMIC.slice(0, 3);
}
export function nextExamDay(day) {
  let d = day;
  while (!isExamDay(d)) d++;
  return d;
}
export const subjectInfo = (id) => SUBJECTS[id] || (id === "exam" ? EXAM : ACTIVITY_BLOCK);

/* ================================================================ grades */
export function letter(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}
export const LETTER_COLOR = { A: "#2fbf71", B: "#7cc242", C: "#f2b20f", D: "#ff9a3c", F: "#ef4c4c" };
/** Weights of each kind of mark inside a subject's average. */
export const GRADE_WEIGHT = { lesson: 1, homework: 0.8, exam: 1.6, absent: 1, study: 0.3 };

/* ================================================================ people */
export const SKIN = ["#f6d7c3", "#eec1a0", "#d9a07a", "#b97b52", "#8d5a3b", "#5e3b28"];
export const HAIR_COLORS = [
  { id: "black", name: "Black", c: "#1d1a1a" },
  { id: "brown", name: "Brown", c: "#5a3825" },
  { id: "chestnut", name: "Chestnut", c: "#8a4b26" },
  { id: "blonde", name: "Blonde", c: "#e2c072" },
  { id: "red", name: "Copper", c: "#b5482a" },
  { id: "pink", name: "Pink", c: "#ff7fb8", level: 4 },
  { id: "blue", name: "Blue", c: "#4a7dff", level: 7 },
  { id: "teal", name: "Teal", c: "#2cc1b0", level: 18 },
];
export const HAIR_STYLES = [
  { id: "short", name: "Short" },
  { id: "long", name: "Long" },
  { id: "ponytail", name: "Ponytail" },
  { id: "bun", name: "Bun" },
  { id: "curly", name: "Curly" },
  { id: "spiky", name: "Spiky" },
  { id: "bob", name: "Bob", level: 7 },
  { id: "buzz", name: "Buzz cut", level: 11 },
];
export const EYE_COLORS = ["#3b2a20", "#2d5b8a", "#3f7a4b", "#6b4a2a", "#555"];
export const BOTTOMS = [
  { id: "pants", name: "Trousers" },
  { id: "skirt", name: "Skirt" },
  { id: "shorts", name: "Shorts" },
];
/** top / accent / bottom / shoes colours + a style tag the model reads. */
export const OUTFITS = [
  { id: "uniform", name: "School Uniform", top: "#253a6b", accent: "#f4f4f4", bottom: "#4a4f5c", shoes: "#2a2224", style: "blazer", tie: "#b83a3a" },
  { id: "casual", name: "Casual", top: "#e9e3d6", accent: "#3d6fd1", bottom: "#36508c", shoes: "#f2f2f2", style: "tee" },
  { id: "sporty", name: "Track Suit", top: "#d6403a", accent: "#ffffff", bottom: "#2b2b33", shoes: "#ffffff", style: "track" },
  { id: "preppy", name: "Sweater Vest", top: "#5f8f5a", accent: "#f7f4ea", bottom: "#b49a6c", shoes: "#6b4528", style: "vest" },
  { id: "varsity", name: "Varsity Jacket", top: "#7a1f2b", accent: "#f2e6c9", bottom: "#2e3a52", shoes: "#f2f2f2", style: "varsity", level: 2 },
  { id: "hoodie", name: "Cozy Hoodie", top: "#7c5cd6", accent: "#d9d0ff", bottom: "#3a3a44", shoes: "#26262c", style: "hoodie", level: 5 },
  { id: "formal", name: "Formal Suit", top: "#1f2430", accent: "#ffffff", bottom: "#1f2430", shoes: "#111111", style: "blazer", tie: "#d9a520", level: 8 },
  { id: "athlete", name: "Team Kit", top: "#1fa36b", accent: "#ffffff", bottom: "#ffffff", shoes: "#1fa36b", style: "jersey", level: 12 },
  { id: "artist", name: "Artist Smock", top: "#f0c84a", accent: "#e8564b", bottom: "#3c6ea8", shoes: "#c5532e", style: "tee", level: 16 },
  { id: "gown", name: "Graduation Gown", top: "#20263a", accent: "#e8c45a", bottom: "#20263a", shoes: "#111111", style: "gown", level: 20 },
];
export const ACCESSORIES = [
  { id: "none", name: "None", slot: "all" },
  { id: "glasses", name: "Glasses", slot: "face" },
  { id: "sunglasses", name: "Sunglasses", slot: "face", level: 9 },
  { id: "backpack", name: "Backpack", slot: "back" },
  { id: "headphones", name: "Headphones", slot: "head", level: 3 },
  { id: "cap", name: "Baseball Cap", slot: "head", level: 6 },
  { id: "scarf", name: "Scarf", slot: "neck", level: 10 },
  { id: "badge", name: "Honor Badge", slot: "chest", level: 14 },
  { id: "crown", name: "Honor Crown", slot: "head", level: 20 },
];
export const ACC_SLOTS = ["face", "head", "back", "neck", "chest"];

export const DEFAULT_LOOK = {
  name: "Alex",
  skin: 1,
  hairStyle: "short",
  hairColor: "brown",
  eyes: 0,
  outfit: "uniform",
  bottom: "pants",
  build: 1,
  acc: { face: "none", head: "none", back: "backpack", neck: "none", chest: "none" },
};

/** Personalities shape dialogue, break-time habits and how fast friendship grows. */
export const PERSONALITIES = {
  friendly: { name: "Friendly", likes: ["courtyard", "cafeteria"], warm: 1.2, activity: "basketball" },
  shy: { name: "Shy", likes: ["library", "garden"], warm: 0.7, activity: "study" },
  sporty: { name: "Sporty", likes: ["court", "field"], warm: 1, activity: "basketball" },
  nerdy: { name: "Nerdy", likes: ["computer", "library"], warm: 0.9, activity: "computer" },
  cool: { name: "Cool", likes: ["courtyard", "court"], warm: 0.8, activity: "football" },
  funny: { name: "Funny", likes: ["cafeteria", "courtyard"], warm: 1.1, activity: "football" },
  bookish: { name: "Bookish", likes: ["library", "garden"], warm: 0.9, activity: "study" },
  artsy: { name: "Artsy", likes: ["garden", "art"], warm: 1, activity: "study" },
};

const L = (skin, hairStyle, hairColor, outfit, bottom, extra = {}) => ({ skin, hairStyle, hairColor, outfit, bottom, eyes: extra.eyes ?? 0, build: extra.build ?? 1, acc: { face: "none", head: "none", back: "none", neck: "none", chest: "none", ...(extra.acc || {}) } });

export const STUDENTS = [
  { id: "lily", name: "Lily Park", pers: "bookish", look: L(0, "long", "black", "preppy", "skirt", { acc: { face: "glasses", back: "backpack" } }), start: 22 },
  { id: "marcus", name: "Marcus Johnson", pers: "sporty", look: L(4, "buzz", "black", "sporty", "shorts", { build: 2 }), start: 26 },
  { id: "ava", name: "Ava Thompson", pers: "friendly", look: L(1, "ponytail", "blonde", "casual", "skirt"), start: 32 },
  { id: "noah", name: "Noah Kim", pers: "nerdy", look: L(1, "short", "black", "hoodie", "pants", { acc: { face: "glasses" } }), start: 20 },
  { id: "zoe", name: "Zoe Martinez", pers: "artsy", look: L(2, "curly", "chestnut", "artist", "pants", { acc: { head: "headphones" } }), start: 24 },
  { id: "ethan", name: "Ethan Brooks", pers: "funny", look: L(0, "spiky", "red", "casual", "shorts", { eyes: 1 }), start: 28 },
  { id: "mia", name: "Mia Rossi", pers: "cool", look: L(2, "bob", "black", "varsity", "skirt", { acc: { face: "sunglasses" } }), start: 16 },
  { id: "leo", name: "Leo Nguyen", pers: "shy", look: L(1, "short", "brown", "uniform", "pants", { acc: { back: "backpack" } }), start: 18 },
  { id: "chloe", name: "Chloe Davis", pers: "sporty", look: L(3, "ponytail", "brown", "athlete", "shorts"), start: 24 },
  { id: "sam", name: "Sam Okoro", pers: "friendly", look: L(5, "curly", "black", "uniform", "pants", { build: 2 }), start: 30 },
  { id: "priya", name: "Priya Shah", pers: "nerdy", look: L(3, "long", "black", "uniform", "skirt", { eyes: 3 }), start: 20 },
  { id: "jake", name: "Jake Miller", pers: "cool", look: L(0, "spiky", "blonde", "varsity", "pants", { eyes: 1, acc: { head: "cap" } }), start: 15 },
  { id: "emma", name: "Emma Wilson", pers: "funny", look: L(0, "bun", "red", "casual", "pants", { eyes: 2 }), start: 27 },
  { id: "omar", name: "Omar Haddad", pers: "bookish", look: L(3, "short", "black", "preppy", "pants", { acc: { face: "glasses" } }), start: 21 },
  { id: "sofia", name: "Sofia Lopez", pers: "artsy", look: L(2, "bun", "chestnut", "hoodie", "skirt", { acc: { neck: "scarf" } }), start: 23 },
  { id: "ben", name: "Ben Carter", pers: "shy", look: L(1, "bob", "blonde", "sporty", "pants", { eyes: 1 }), start: 17 },
];

/** Adult outfits for staff (not unlockable). */
export const STAFF_OUTFITS = {
  teacherA: { top: "#6b4f3a", accent: "#efe6d8", bottom: "#3a3a40", shoes: "#2a1d14", style: "blazer", tie: "#2f5f9a" },
  teacherB: { top: "#2f6f8f", accent: "#ffffff", bottom: "#2d2d35", shoes: "#3a2a20", style: "vest" },
  teacherC: { top: "#8a3b5c", accent: "#f7e8ee", bottom: "#2c2c38", shoes: "#2c1b1b", style: "tee" },
  teacherD: { top: "#e9e9e9", accent: "#cfe6ff", bottom: "#42506a", shoes: "#333", style: "labcoat" },
  coach: { top: "#1f4fa3", accent: "#ffffff", bottom: "#1f2a44", shoes: "#ffffff", style: "track" },
  principal: { top: "#2b2f3a", accent: "#ffffff", bottom: "#2b2f3a", shoes: "#111", style: "blazer", tie: "#8f1f2f" },
  staff: { top: "#4b7b6b", accent: "#f5f5f5", bottom: "#3a3f48", shoes: "#2a2a2a", style: "tee" },
  cook: { top: "#f4f4f4", accent: "#e8e8e8", bottom: "#3a3a44", shoes: "#2a2a2a", style: "apron" },
};
const T = (skin, hairStyle, hairColor, outfit, bottom, extra = {}) => ({ ...L(skin, hairStyle, hairColor, outfit, bottom, extra), adult: true });

/** `home` is the room a teacher goes back to; `post` = where they stand while teaching. */
export const TEACHERS = [
  { id: "patel", name: "Mr. Patel", subject: "math", home: "math101", look: T(3, "short", "black", "teacherA", "pants", { acc: { face: "glasses" }, build: 2 }) },
  { id: "rivera", name: "Ms. Rivera", subject: "english", home: "eng102", look: T(2, "long", "brown", "teacherC", "skirt") },
  { id: "okafor", name: "Dr. Okafor", subject: "science", home: "lab", look: T(5, "buzz", "black", "teacherD", "pants", { build: 2 }) },
  { id: "lindqvist", name: "Mrs. Lindqvist", subject: "history", home: "hist201", look: T(0, "bun", "blonde", "teacherB", "skirt", { acc: { face: "glasses" } }) },
  { id: "chen", name: "Mr. Chen", subject: "cs", home: "comp", look: T(1, "spiky", "black", "teacherB", "pants", { acc: { face: "glasses" } }) },
  { id: "harris", name: "Coach Harris", subject: "pe", home: "gym", look: T(4, "buzz", "black", "coach", "pants", { build: 2, acc: { head: "cap" } }) },
  { id: "adebayo", name: "Principal Adebayo", subject: null, home: "principal", look: T(5, "short", "black", "principal", "pants", { build: 2 }) },
];
/** Staff that keep to one spot (interactable, light animation). */
export const STAFF = [
  { id: "kim", name: "Mrs. Kim", role: "Receptionist", spot: "reception", look: T(1, "bob", "black", "staff", "skirt", { acc: { face: "glasses" } }) },
  { id: "bruno", name: "Chef Bruno", role: "Cafeteria Cook", spot: "cook", look: T(0, "short", "brown", "cook", "pants", { build: 2 }) },
  { id: "novak", name: "Ms. Novak", role: "Librarian", spot: "librarian", look: T(0, "long", "red", "teacherB", "skirt", { acc: { face: "glasses" } }) },
  { id: "grace", name: "Nurse Grace", role: "School Nurse", spot: "nurse", look: T(3, "ponytail", "black", "teacherD", "pants") },
];

/* ================================================================ cafeteria */
export const FOOD = [
  { id: "apple", name: "Apple", icon: "🍎", cost: 4, energy: 10, happy: 1 },
  { id: "juice", name: "Orange Juice", icon: "🧃", cost: 6, energy: 14, happy: 2 },
  { id: "cookie", name: "Cookie", icon: "🍪", cost: 5, energy: 8, happy: 6 },
  { id: "salad", name: "Garden Salad", icon: "🥗", cost: 10, energy: 22, happy: 2, focus: 1 },
  { id: "sandwich", name: "Club Sandwich", icon: "🥪", cost: 12, energy: 28, happy: 4 },
  { id: "pasta", name: "Pasta Bowl", icon: "🍝", cost: 15, energy: 36, happy: 5 },
  { id: "pizza", name: "Pizza Slice", icon: "🍕", cost: 16, energy: 32, happy: 9 },
  { id: "combo", name: "Lunch Combo", icon: "🍱", cost: 24, energy: 55, happy: 10, focus: 1 },
];
export const VENDING = [
  { id: "water", name: "Water", icon: "💧", cost: 3, energy: 8, happy: 0 },
  { id: "chips", name: "Chips", icon: "🥔", cost: 5, energy: 9, happy: 5 },
  { id: "granola", name: "Granola Bar", icon: "🍫", cost: 6, energy: 16, happy: 3 },
];

/* ================================================================ activities */
export const ACTIVITIES = {
  basketball: { id: "basketball", name: "Basketball Shootout", icon: "🏀", level: 1, where: "Basketball court (courtyard) or the gym", win: 10, time: 60 },
  football: { id: "football", name: "Penalty Practice", icon: "⚽", level: 2, where: "Football field (north)", win: 7, shots: 6 },
  running: { id: "running", name: "Track Sprint", icon: "🏃", level: 3, where: "Running track (north)", par: 70 },
  study: { id: "study", name: "Library Study", icon: "📚", level: 1, where: "Library or Study Room 202" },
  computer: { id: "computer", name: "Coding Challenge", icon: "🤖", level: 4, where: "Computer Room (1st floor)" },
};

/* ================================================================ progression */
export const MAX_LEVEL = 20;
export const xpToNext = (level) => 90 + 35 * level;
export const XP = {
  lessonBase: 18,
  lessonPerPoint: 0.22, // × score
  homework: 22,
  examBase: 30,
  examPerPoint: 0.45,
  activityPlay: 10,
  activityWin: 28,
  study: 12,
  help: 14,
  friendMade: 20,
  favor: 25,
  onTime: 4,
};
/** What each level unlocks (cosmetics are derived from the item tables). */
export const LEVEL_UNLOCKS = {
  2: ["Football penalty practice", "Varsity Jacket outfit"],
  3: ["Track sprint races", "Headphones"],
  4: ["Computer Room coding challenges", "Pink hair"],
  5: ["Special mission: Study Marathon", "Cozy Hoodie outfit"],
  6: ["Baseball Cap"],
  7: ["Bob hairstyle", "Blue hair"],
  8: ["Formal Suit outfit"],
  9: ["Sunglasses"],
  10: ["Special mission: Team Captain", "Scarf"],
  11: ["Buzz cut hairstyle"],
  12: ["Team Kit outfit"],
  14: ["Honor Badge"],
  15: ["Special mission: Social Butterfly"],
  16: ["Artist Smock outfit"],
  18: ["Teal hair"],
  20: ["Honor Crown", "Graduation Gown"],
};
export const unlocked = (item, level) => !item.level || level >= item.level;

/* ================================================================ missions */
/**
 * Every mission is checked by the simulation against real counters / state
 * (see Sim.checkMissions). `room` puts a marker on the map, `level` gates the
 * special missions.
 */
export const MISSIONS = [
  { id: "welcome", title: "Welcome to School", desc: "Walk through the main gate and enter the school building.", xp: 20, pts: 10, room: "lobby" },
  { id: "classroom", title: "Find Your Classroom", desc: "Find the classroom of your next lesson (see the HUD) and step inside.", xp: 20, pts: 5, room: "@next" },
  { id: "teacher", title: "Meet Your Teacher", desc: "Talk to any subject teacher (press E near them).", xp: 20, pts: 5 },
  { id: "lesson", title: "Attend Your First Lesson", desc: "Sit at a free desk before class starts and finish the lesson activity.", xp: 30, pts: 10, room: "@next" },
  { id: "friend", title: "Make Your First Friend", desc: "Raise a classmate's friendship to 50 by talking, helping and inviting them.", xp: 35, pts: 10 },
  { id: "library", title: "Find the Library", desc: "Visit the library on the first floor (take the stairs).", xp: 20, pts: 5, room: "library" },
  { id: "homework", title: "Complete Your Homework", desc: "Do an assignment at a library table or a study station.", xp: 30, pts: 10, room: "library" },
  { id: "cafeteria", title: "Visit the Cafeteria", desc: "Buy something to eat at the cafeteria counter.", xp: 20, pts: 0, room: "cafeteria" },
  { id: "basketball", title: "Play Basketball", desc: "Score a basket in a basketball shootout (court or gym).", xp: 25, pts: 8, room: "court" },
  { id: "help", title: "Help a Classmate", desc: "Offer help to a classmate who is struggling (talk → Offer help).", xp: 30, pts: 10 },
  { id: "ontime", title: "Arrive on Time", desc: "Be seated on time for 3 classes.", xp: 30, pts: 10 },
  { id: "mathtest", title: "Pass a Math Test", desc: "Score 70 or more on a Mathematics quiz or exam.", xp: 35, pts: 12, room: "math101" },
  { id: "lab", title: "Explore the Science Lab", desc: "Visit the Science Lab and examine the microscope station.", xp: 25, pts: 5, room: "lab" },
  { id: "sport", title: "Join a Sports Activity", desc: "Finish any sports challenge: basketball, football, a track race or PE.", xp: 25, pts: 8, room: "court" },
  { id: "principal", title: "Meet the Principal", desc: "Visit Principal Adebayo in the office on the first floor.", xp: 25, pts: 5, room: "principal" },
  { id: "notebook", title: "Find a Lost Notebook", desc: "Lily lost her notebook. Ask her about it, find it and give it back.", xp: 40, pts: 15 },
  { id: "grades", title: "Improve Your Grades", desc: "Reach an academic average of 75 with at least 4 marks.", xp: 40, pts: 15 },
  { id: "friends3", title: "Make Three Friends", desc: "Have three classmates at friendship 50 or more.", xp: 50, pts: 20 },
  { id: "computer", title: "Complete a Computer Challenge", desc: "Score 60+ in a Computer Science lesson or a Computer Room challenge.", xp: 35, pts: 10, room: "comp" },
  { id: "fullday", title: "Finish a Full School Day", desc: "Make it to the final bell and review your daily report.", xp: 50, pts: 20 },
  { id: "excellent", title: "Earn an Excellent Grade", desc: "Score 90 or more (an A) in a lesson, homework or exam.", xp: 40, pts: 15 },
  { id: "assign5", title: "Complete Five Assignments", desc: "Complete five homework assignments.", xp: 60, pts: 25, room: "library" },
  { id: "sportwin", title: "Win a Sports Challenge", desc: "Beat the target in basketball, football, a track race or PE.", xp: 45, pts: 15, room: "court" },
  { id: "reputation", title: "Reach High Reputation", desc: "Raise your reputation to 80.", xp: 60, pts: 25 },
  { id: "honor", title: "Become an Honor Student", desc: "Reach level 8 with an academic average of 85+ and 90%+ attendance.", xp: 120, pts: 60 },
  // special missions (unlocked by level)
  { id: "marathon", title: "Study Marathon", desc: "Finish 3 study sessions or homework in one school day.", xp: 60, pts: 20, level: 5, special: true, room: "library" },
  { id: "captain", title: "Team Captain", desc: "Win 3 sports challenges with a friend joining you.", xp: 80, pts: 30, level: 10, special: true, room: "court" },
  { id: "butterfly", title: "Social Butterfly", desc: "Have six friends at friendship 50 or more.", xp: 100, pts: 40, level: 15, special: true },
];
export const CORE_MISSIONS = MISSIONS.filter((m) => !m.special);

/* ================================================================ dialogue */
export const DIALOGUE_OPTIONS = [
  { id: "greet", label: "Greet", icon: "👋" },
  { id: "school", label: "Ask about school", icon: "🏫" },
  { id: "class", label: "Discuss class", icon: "📚" },
  { id: "help", label: "Offer help", icon: "🤝" },
  { id: "invite", label: "Invite to activity", icon: "🎯" },
  { id: "end", label: "End conversation", icon: "✖" },
];
export const FRIEND_AT = 50;
export const BEST_FRIEND_AT = 80;
export const friendTier = (v) => (v >= BEST_FRIEND_AT ? "best" : v >= FRIEND_AT ? "friend" : v >= 30 ? "acquaintance" : "stranger");
export const TIER_NAME = { best: "Best friend", friend: "Friend", acquaintance: "Acquaintance", stranger: "Classmate" };

/** Spots where the lost notebook can turn up (ids of layout `spots`). */
export const NOTEBOOK_SPOTS = ["nb_storage", "nb_library", "nb_garden", "nb_cafe", "nb_lounge", "nb_court"];
