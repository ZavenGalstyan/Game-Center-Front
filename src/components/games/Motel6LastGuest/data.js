/**
 * Motel 6: Last Guest — static story data: dates, rules, questions, evidence,
 * nights (scripted step lists), phone calls, endings. Guests live in guests.js.
 * Pure data, no imports from React/Three — the headless tests load it directly.
 */
export const SAVE_KEY = "motel6-last-guest-save";
export const SETTINGS_KEY = "motel6-last-guest-settings";
export const RECORDS_KEY = "motel6-last-guest-records";
export const SAVE_VERSION = 1;
export const FAIL_SUSPICION = 100;

export const STATES = {
  NE: "Nebraska", IA: "Iowa", KS: "Kansas", CO: "Colorado", MO: "Missouri", SD: "South Dakota", WY: "Wyoming",
};

/* --------------------------------------------------------------- rulebook */
// `checks` lists the violation keys (engine.js) this rule covers.
export const RULES = [
  { id: "r_expired", night: 1, title: "Valid ID only", text: "The ID must not be expired. Compare its expiry date with tonight's date on the terminal.", checks: ["expired"] },
  { id: "r_photo", night: 1, title: "Photo must match", text: "The photo on the ID must show the person standing at the desk. Compare hair, face and features.", checks: ["photo"] },
  { id: "r_reservation", night: 1, title: "No reservation, no room", text: "Every guest needs a reservation, and the name on it must match the ID exactly — every letter.", checks: ["noReservation", "name"] },
  { id: "r_last4", night: 2, title: "Reservation belongs to the ID", text: "The reservation stores the last four digits of the guest's ID number. They must match.", checks: ["last4"] },
  { id: "r_issuer", night: 2, title: "ID number format", text: "An ID number starts with the code of the state that issued it (NE, IA, KS, CO, MO, SD, WY). Nebraska → NE-…", checks: ["issuer"] },
  { id: "r_date", night: 2, title: "Tonight only", text: "A reservation is valid only for tonight's check-in date.", checks: ["date"] },
  { id: "r_room", night: 2, title: "Check the Room Board", text: "Never hand out a room that is already occupied or out of order. Returning guests may only reclaim their own room.", checks: ["room"] },
  { id: "r_dob", night: 2, title: "Confirm the birthday", text: "Ask guests to confirm their date of birth. It must match the ID.", checks: ["dob"] },
  { id: "r_cctv", night: 3, title: "The camera doesn't lie", text: "Every guest must appear normally on the lobby camera (CAM 1). If the camera shows something else — or nothing — it is not a guest.", checks: ["cctv"] },
  { id: "r_13", night: 3, title: "There is no Room 13", text: "There is no Room 13. Never give out Room 13. Never discuss Room 13.", checks: ["room13"] },
  { id: "r_vehicle", night: 3, title: "Vehicle on the lot", text: "If the reservation lists a vehicle, its plate must be on the lot. Check the plate reader on CAM 2.", checks: ["vehicle"] },
  { id: "r_word", night: 4, title: "Security word", text: "Reservations now carry a security word. Ask for it. It must match exactly.", checks: ["word"] },
  { id: "r_uv", night: 5, title: "UV seal", text: "Shine the UV lamp on every ID. A genuine ID shows the glowing state seal.", checks: ["uv"] },
  { id: "r_code", night: 5, title: "Confirmation code", text: "Ask for the confirmation code. It must match the reservation.", checks: ["code"] },
  { id: "r_register", night: 6, title: "The old register", text: "Anyone whose name is written in the 1979 register must never receive a room. (The register is locked in the storage room.)", checks: ["register"] },
];
export const RULE_BY_ID = Object.fromEntries(RULES.map((r) => [r.id, r]));
export const rulesForNight = (n) => RULES.filter((r) => r.night <= n);

/* --------------------------------------------------------------- questions */
export const QUESTIONS = [
  { id: "purpose", night: 1, text: "What brings you out here tonight?" },
  { id: "from", night: 1, text: "Where are you coming from?" },
  { id: "before", night: 1, text: "Have you stayed with us before?" },
  { id: "dob", night: 2, text: "Can you confirm your date of birth?" },
  { id: "vehicle", night: 3, text: "Did you drive here?" },
  { id: "word", night: 4, text: "What's the security word on your booking?" },
  { id: "code", night: 5, text: "What's your confirmation code?" },
];
export const questionsForNight = (n) => QUESTIONS.filter((q) => q.night <= n);

/* --------------------------------------------------------------- the 1979 register */
export const REGISTER_1979 = [
  { name: "Edith Lowell", date: "1979-10-25", note: "Room 13 — did not check out" },
  { name: "Arthur Penhallow", date: "1979-10-26", note: "Room 13 — did not check out" },
  { name: "Dolores Finch", date: "1979-10-28", note: "Room 13 — did not check out" },
  { name: "Raymond Kerr", date: "1979-10-30", note: "Night clerk — signed himself in" },
  { name: "Marion Voss", date: "1979-10-31", note: "LAST GUEST — Room 13" },
];
export const REGISTER_NAMES = REGISTER_1979.map((r) => r.name);
export const LOCKBOX_CODE = "1031";

/* --------------------------------------------------------------- evidence */
// where: world prop id that yields it (null = CCTV capture / decision)
export const EVIDENCE = [
  { id: "c_note", critical: true, night: 1, where: "drawer", title: "Predecessor's Note", icon: "note",
    text: "Folded under the drawer liner, in shaky pencil:\n\n\"If you're reading this, they hired you after me. Rules they won't print:\n1. There is no 13.\n2. It always looks like a guest. It will have everything in order.\n3. Seven nights, every forty years. The last guest comes on Halloween.\n4. If you find ALL of it — this note, the brochure, the tape, the key, the diary, the register and its real face — you can end it. Write its true name in the register instead of letting it sign.\n\n— D.K.\nP.S. The box in storage remembers the night it all began.\"" },
  { id: "c_brochure", critical: true, night: 2, where: "brochures", title: "1979 Brochure", icon: "brochure",
    text: "A yellowed brochure behind the new ones:\n\n\"ROUTE 6 MOTOR LODGE — GRAND RE-OPENING HALLOWEEN NIGHT, OCT 31\nThirteen cozy rooms · Color TV · Ice machine\nProprietor: Harlan Voss\"\n\nThe photo shows thirteen doors. Someone has scratched out the last one." },
  { id: "c_tape", critical: true, night: 3, where: null, title: "CCTV Still — Door 13", icon: "tape",
    text: "A still from CAM 3, 02:13 AM: at the end of the hallway, where there is only a painted wall, a door stands open. The brass number reads 13." },
  { id: "c_key", critical: true, night: 4, where: "key5", title: "Room 5 Key", icon: "key",
    text: "Frank Dorsey's key, found on the hallway carpet outside Room 5. The plastic tag says 5. On the back someone scratched: 13." },
  { id: "c_diary", critical: true, night: 5, where: "diary", title: "Harlan Voss's Diary Page", icon: "diary",
    text: "\"Oct 31, 1979. Forty years since I made the bargain. It wants a guest every night of the last week, and on Halloween it wants one more — a guest that checks ITSELF in. I gave it Marion. I wrote her into Room 13 myself.\nThe book keeps them. Only a clerk can sign a guest in — and only a TRUE NAME written in the book by the clerk's hand can let them all out.\nGod forgive me.\" — H.V." },
  { id: "c_register", critical: true, night: 6, where: "lockbox", title: "1979 Guest Register", icon: "register",
    text: "The motel's old register. The last page lists every guest given Room 13 in the final week of October 1979:\n\nEdith Lowell — Oct 25\nArthur Penhallow — Oct 26\nDolores Finch — Oct 28\nRaymond Kerr (night clerk) — Oct 30\nMarion Voss — Oct 31 — \"LAST GUEST\"\n\nBelow, in fresh blue ink: \"D. Kerr — Oct 31, 2019\". That is your predecessor's name. Tonight's date is not yet that." },
  { id: "c_face", critical: true, night: 7, where: null, title: "CCTV Still — Its Real Face", icon: "tape",
    text: "CAM 1 freeze-frame of the woman at your desk. On tape, her head is turned all the way around, and the face looking at the camera is the one from the 1979 brochure: Marion Voss, who never checked out." },
  { id: "x_photo", critical: false, night: 1, where: "photo", title: "Staff Photo, 1979", icon: "photo",
    text: "A framed photo in the hallway: \"Route 6 Motor Lodge staff, summer 1979.\" A smiling young night clerk — name tag RAYMOND KERR — stands beside the owner, Harlan Voss, and a woman in a pale coat: Marion." },
  { id: "x_ids", critical: false, night: 1, where: null, title: "Confiscated IDs", icon: "ids",
    text: "Forged and stolen documents you correctly flagged and kept for the police." },
];
export const EVIDENCE_BY_ID = Object.fromEntries(EVIDENCE.map((e) => [e.id, e]));
export const CRITICAL = EVIDENCE.filter((e) => e.critical).map((e) => e.id);

/* --------------------------------------------------------------- residents & room board */
// Scripted room board: guests checked in before your shift, or rooms out of order.
const BOARD = {
  1: { 1: "R. Doyle", 8: "ooo" },
  2: { 1: "R. Doyle", 7: "T. Greer", 8: "ooo" },
  3: { 7: "T. Greer", 8: "ooo", 11: "M. Ito" },
  4: { 5: "F. Dorsey", 8: "ooo", 11: "M. Ito" },
  5: { 2: "K. Abbott", 8: "ooo", 12: "ooo" },
  6: { 3: "S. Lyle", 8: "ooo", 9: "B. Novak" },
  7: { 1: "R. Doyle", 8: "ooo", 6: "S. Lyle" },
};
export const boardForNight = (n) => BOARD[n] || {};
export const RESIDENT_PLATES = {
  1: ["NE 1RD-440"], 2: ["NE 1RD-440", "KS 7TG-902"], 3: ["KS 7TG-902", "CO 2MI-118"], 4: ["CO 2MI-118"],
  5: ["SD 4KA-310"], 6: ["IA 9SL-077", "MO 3BN-562"], 7: ["NE 1RD-440", "IA 9SL-077"],
};

/* --------------------------------------------------------------- nights */
// Step types: call (phone, must answer) · guest · final · note (story card) ·
// fx (one-shot effect, some set flags) · task (blocks until flag set).
export const NIGHTS = [
  null,
  {
    n: 1, date: "2019-10-25", title: "Check-In", intro: "Your first night shift at the Route 6 Motor Lodge — the locals just call it Motel 6. The manager left a rulebook and a phone number. Rain hasn't stopped in three days.",
    steps: [
      { t: "call", id: "n1_manager" },
      { t: "guest", id: "n1_briggs", tutorial: true },
      { t: "note", id: "tip_explore" },
      { t: "guest", id: "n1_kale" },
      { t: "guest", id: "n1_ortiz" },
      { t: "fx", fx: "flicker" },
      { t: "guest", id: "n1_ames" },
      { t: "call", id: "n1_silent" },
      { t: "guest", id: "n1_marsh" },
      { t: "fx", fx: "knock" },
    ],
    outro: "At 6 AM the rain thins to drizzle. Somewhere in the hallway a door clicks shut, though every guest is asleep.",
  },
  {
    n: 2, date: "2019-10-26", title: "Paperwork", intro: "The manager says forged papers have been showing up along Route 6. Tonight you check the details, not just the faces.",
    steps: [
      { t: "call", id: "n2_manager" },
      { t: "guest", id: "n2_pratt" },
      { t: "guest", id: "n2_benton" },
      { t: "guest", id: "n2_delaney" },
      { t: "fx", fx: "knock" },
      { t: "guest", id: "n2_calder" },
      { t: "guest", id: "n2_rook" },
      { t: "call", id: "n2_static" },
      { t: "guest", id: "n2_hartley" },
    ],
    outro: "Room 7's guest, T. Greer, checks out at dawn. He asks who was knocking on his door at three in the morning, asking to come in.",
  },
  {
    n: 3, date: "2019-10-27", title: "Static", intro: "Security cameras were installed last spring. The manager wants you to use them. Something on the tapes has him spooked.",
    steps: [
      { t: "call", id: "n3_manager" },
      { t: "guest", id: "n3_webb" },
      { t: "guest", id: "n3_lang" },
      { t: "guest", id: "n3_kessler" },
      { t: "fx", fx: "door13" },
      { t: "call", id: "n3_whisper" },
      { t: "guest", id: "n3_parrish" },
      { t: "fx", fx: "scare_window" },
      { t: "guest", id: "n3_crane" },
    ],
    outro: "When you rewind CAM 3 at dawn, the tape is blank between 2:00 and 2:30 AM. Not static — blank, as if the hallway wasn't there.",
  },
  {
    n: 4, date: "2019-10-28", title: "Vacancy", intro: "Frank Dorsey in Room 5 asked for a wake-up call at midnight. Guests don't usually ask for that.",
    steps: [
      { t: "call", id: "n4_manager" },
      { t: "guest", id: "n4_brooks" },
      { t: "guest", id: "n4_sloane" },
      { t: "fx", fx: "knock" },
      { t: "call", id: "n4_room5" },
      { t: "fx", fx: "dorsey" },
      { t: "task", flag: "n:room5", objective: "Check on Room 5 — it's down the hallway on the left." },
      { t: "guest", id: "n4_dorsey" },
      { t: "guest", id: "n4_whitlock" },
      { t: "fx", fx: "vanish" },
      { t: "guest", id: "n4_morrow" },
    ],
    outro: "Frank Dorsey's car is still on the lot at dawn, windshield fogged from the inside. His room is made up as if no one ever slept there.",
  },
  {
    n: 5, date: "2019-10-29", title: "Blackout", intro: "The storm knocked out a transformer down the road. The motel runs on an old breaker panel in the storage room.",
    steps: [
      { t: "fx", fx: "outage" },
      { t: "call", id: "n5_manager" },
      { t: "task", flag: "power", objective: "Restore power: reset the breaker in the storage room (behind the desk, left door)." },
      { t: "guest", id: "n5_sorensen" },
      { t: "guest", id: "n5_cho" },
      { t: "guest", id: "n5_reed" },
      { t: "fx", fx: "outage" },
      { t: "task", flag: "power", objective: "The power is out again. Reset the breaker in the storage room." },
      { t: "guest", id: "n5_lund" },
      { t: "guest", id: "n5_price" },
    ],
    outro: "The breaker panel is warm to the touch at dawn. Someone has written VOSS in the dust on its door — from the inside of the glass.",
  },
  {
    n: 6, date: "2019-10-30", title: "History", intro: "Tonight the phone rings before you even sit down. The caller ID reads ROOM 13.",
    steps: [
      { t: "call", id: "n6_kerr" },
      { t: "guest", id: "n6_okafor" },
      { t: "guest", id: "n6_lowell" },
      { t: "fx", fx: "knock13" },
      { t: "guest", id: "n6_barlow" },
      { t: "guest", id: "n6_monroe" },
      { t: "fx", fx: "whispers" },
      { t: "guest", id: "n6_penhallow" },
    ],
    outro: "Five names in a book from 1979. Two of them walked into your lobby tonight. Tomorrow is Halloween.",
  },
  {
    n: 7, date: "2019-10-31", title: "The Last Guest", intro: "Halloween. Forty years to the night. The manager called in sick and left one instruction: \"Give our special guest anything she asks for.\"",
    steps: [
      { t: "call", id: "n7_manager" },
      { t: "guest", id: "n7_graves" },
      { t: "guest", id: "n7_arden" },
      { t: "fx", fx: "outage" },
      { t: "task", flag: "power", objective: "Restore power in the storage room. She'll be here soon." },
      { t: "guest", id: "n7_kerr" },
      { t: "call", id: "n7_kerr_call" },
      { t: "final", id: "n7_voss" },
    ],
    outro: "",
  },
];
export const NIGHT_COUNT = 7;

/* --------------------------------------------------------------- phone calls */
export const CALLS = {
  n1_manager: { from: "Mr. Pruitt — Manager", lines: [
    "Hey, it's Pruitt. You found the desk, good. Simple job: guests come in, you check them, you give them a key.",
    "Three rules for tonight. ID can't be expired. Photo has to be the person in front of you. And the name has to match a reservation in the computer. No reservation, no room.",
    "Rulebook's on the desk. When you're sure, stamp ACCEPT or REJECT. When you reject, write down which rule they broke.",
    "And kid — don't leave the building. Whatever you hear out there.",
  ] },
  n1_silent: { from: "Unknown Caller", eerie: true, lines: [
    "…(rain, a long breath)…",
    "…is the thirteenth room ready?…",
    "(the line goes dead)",
  ] },
  n2_manager: { from: "Mr. Pruitt — Manager", lines: [
    "State patrol called. People are forging papers up and down Route 6. So we're tightening up.",
    "The reservation keeps the last four digits of the ID number — they have to match. ID numbers start with the issuing state's code: Nebraska is NE, Kansas is KS, and so on.",
    "Check-in date has to be tonight. Check the Room Board — never give out an occupied room. And ask for a date of birth. Liars always fumble that one.",
  ] },
  n2_static: { from: "Unknown Caller", eerie: true, lines: [
    "(static… a woman humming, very far away)",
    "…he isn't who he says he is. None of them are, after midnight…",
  ] },
  n3_manager: { from: "Mr. Pruitt — Manager", lines: [
    "I've been watching last week's tapes. There's… look, just use the cameras. CAM 1 is the lobby, CAM 2 the lot, CAM 3 the hallway, CAM 4 storage.",
    "Everyone you check in has to look right on CAM 1. If the camera shows something else, you don't give them a key. I don't care how normal they look to you.",
    "If a reservation lists a car, the plate must be on the lot — CAM 2 has a plate reader. And there is no Room 13. There never was. Don't let anyone tell you otherwise.",
  ] },
  n3_whisper: { from: "Unknown Caller", eerie: true, lines: [
    "…(whispering)… camera three… look at camera three…",
    "…take a picture before it closes…",
  ] },
  n4_manager: { from: "Mr. Pruitt — Manager", lines: [
    "Guests have been… leaving early. Without their stuff. So from tonight every booking has a security word.",
    "Ask for it. If they don't know their own word, they don't get a key. Especially if they say they lost theirs.",
  ] },
  n4_room5: { from: "Room 5 — Front Desk Line", eerie: true, lines: [
    "(the internal line from Room 5 lights up)",
    "(knocking — on the inside of a door — then a man's voice, very calm) …I'm already checked out. Tell the next one the key is on the floor.",
    "(click)",
  ] },
  n5_manager: { from: "Mr. Pruitt — Manager", lines: [
    "Power's out? Breaker panel's in the storage room behind the desk. Take the flashlight, flip the main back on.",
    "There's a UV lamp in the toolbox next to it. From tonight you shine it on every ID — real ones show a glowing state seal.",
    "And ask every guest for their confirmation code. It has to match the computer. I'm sorry. I'm sorry about all of this.",
  ] },
  n6_kerr: { from: "ROOM 13", eerie: true, lines: [
    "(a young man's voice, tired, very close) Don't hang up. My name's Daniel Kerr. I had your job. I still have it, sort of.",
    "The motel keeps a register from 1979. Everyone it took that week is in it. Some of them are coming back to check in again. Don't give them rooms.",
    "The book is in the lockbox in storage. The box remembers the night it began — Halloween, the thirty-first of October.",
    "If a name in that book walks up to your desk… you don't know them. You never did.",
  ] },
  n7_manager: { from: "Mr. Pruitt — Manager", eerie: true, lines: [
    "(Pruitt's voice, but slower) Big night. Our special guest arrives at the end of your shift. She has a reservation. Everything is in order.",
    "Give her whatever she asks for. Let her sign the book. Then you can go home. Then we can all go home.",
  ] },
  n7_kerr_call: { from: "ROOM 13", eerie: true, lines: [
    "It's Daniel. She's in the parking lot. Listen — her papers will be perfect. They always are.",
    "Look at her on camera one and take a picture. The tape shows what she is. Then remember everything you found.",
    "If you have all of it, you don't have to just send her away. You can write her true name in the register. That ends it — for her, for me, for all of us.",
  ] },
  // consequence calls
  complaint: { from: "Mr. Pruitt — Manager", lines: [
    "I just got a call from a guest you turned away. Their papers were fine. Read the rules again before you stamp anything.",
  ] },
  writeup: { from: "Mr. Pruitt — Manager", lines: [
    "You let someone in with bad paperwork. If the state patrol checks our book, that's my license. Check every rule. Every time.",
  ] },
};

/* --------------------------------------------------------------- notes & tips */
export const NOTES = {
  tip_explore: { title: "Between guests", text: "Nobody is at the desk. You can get up and look around — the reception, the hallway and the storage room behind the desk.\n\nUse EXPLORE (or press F). Walk with WASD, drag to look, and press E or click to examine things. The desk drawer looks like it hasn't been opened in a while." },
};

/* --------------------------------------------------------------- endings */
export const ENDINGS = [
  { id: "good", title: "Checkout Time", kind: "Good Ending",
    hint: "On the seventh night, turn the last guest away.",
    text: "You stamp REJECT. The woman smiles as if she expected it, and walks backwards out into the rain without turning around. On the lot, the camera shows her standing where no car is parked — and then not at all.\n\nAt dawn you drive your evidence to the county sheriff: the tapes, the papers, the names. By noon the Route 6 Motor Lodge is taped off. You never find out what they dug up behind Room 12. You survived the last guest — and you made sure no one will ever check in here again." },
  { id: "bad", title: "Room 13", kind: "Bad Ending",
    hint: "On the seventh night, trust the guest whose papers are perfect.",
    text: "Everything is in order, so you stamp ACCEPT and slide the register across the desk. She signs it with a hand that bends the wrong way.\n\n\"Room thirteen,\" she says, and there it is — at the end of the hallway, a door that was never there, standing open.\n\nIn the morning a new night clerk finds the desk empty, a cold cup of coffee, and your name written in a book from 1979." },
  { id: "secret", title: "The True Name", kind: "Secret Ending",
    hint: "Find every piece of critical evidence — the note, the brochure, the tape, the key, the diary, the register and the last guest's real face — then write her true name yourself.",
    text: "You don't stamp anything. You open the 1979 register, and in your own hand, under the last line, you write: MARION VOSS — CHECKED OUT.\n\nThe lights go white. Down the hallway every door opens at once, and the corridor fills with footsteps walking out into the rain: Edith, Arthur, Dolores, Raymond, Frank Dorsey, Daniel Kerr. The woman at your desk looks at her own face in the window and, for the first time in forty years, it is hers.\n\n\"Thank you,\" she says, and the neon sign outside flickers out for good. The curse of the Route 6 Motor Lodge is broken." },
];
export const ENDING_BY_ID = Object.fromEntries(ENDINGS.map((e) => [e.id, e]));
