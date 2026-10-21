/**
 * Story text: dialogue scenes (DIALOGUE[key] = lines), cinematics
 * (CINEMATICS[key] = camera shots + captions) and the ending.
 *
 * Speakers are NPC ids (data/npcs.js), "kade" (the player), "radio:<id>"
 * (a call over the comms) or a literal display name.
 */
export const DIALOGUE = {
  /* ------------------------------------------------------------ act 1 — Neon Market */
  c1_start: [
    ["radio:juno", "Kade. You awake? Good. Rent's due and I've got work."],
    ["radio:juno", "Come see me at The Switchboard, east side of Neon Boulevard. Bring a gun."],
  ],
  c1_juno: [
    ["juno", "There's my favourite freelancer. Contract's simple: Red Fang thugs are squeezing Noodle Nan for 'protection'."],
    ["juno", "Nan pays me in soup and gossip. I'd like to keep both. Make the Fangs leave."],
    ["kade", "And if they don't want to leave?"],
    ["juno", "Then they won't be leaving at all. Left mouse to shoot, right to aim, F for a quick strike. Go."],
  ],
  c1_end: [
    ["nan", "Hah! Look at them run. Or… not run. Thank you, dear. Take these, on the house."],
    ["radio:juno", "Clean work. Funny thing — the Fangs never had the nerve to hit Boulevard vendors before. Someone's paying them well."],
  ],
  c2_start: [["radio:juno", "Kenji Oduya's got a problem. He sells guns, so it's an expensive problem. Go see him."]],
  c2_kenji: [
    ["kenji", "Fangs jacked my optics shipment off a courier last night. Prototype targeting lenses. My supplier will skin me."],
    ["kenji", "Pip — kid with the blue hair, hangs around Lantern Street — knows every stash in those alleys. Ask him."],
  ],
  c2_pip: [
    ["pip", "Kenji's box? Fang stash, south of the counting blocks in the alleys. Four gunners sitting on it."],
    ["pip", "Hey… while you're in there. Fangs have been dragging people off the street at night. My sister Mira went missing last spring. If you see anything…"],
    ["kade", "I'll keep my eyes open."],
  ],
  c2_end: [
    ["kenji", "My lenses! Not a scratch. I owe you, merc. Shotguns are on my rack now — friend price."],
    ["kenji", "One more thing. The courier said the Fangs weren't after the optics. They were looking for a 'manifest'. Odd."],
  ],
  c3_start: [["radio:juno", "The residents of the west alleys have pooled their creds. They want the Fangs out of their street, and the jammer that blinds the police drones gone."]],
  c3_clue: [["kade", "Crates stencilled 'H.D. LOGISTICS — LIVE CARGO — DO NOT OPEN'. Live cargo…"]],
  c3_end: [
    ["radio:juno", "Alleys are quiet. First time in a year, they tell me."],
    ["radio:juno", "'H.D. Logistics'? I'll dig. Shell companies are like rats — there's never just one."],
  ],
  c4_start: [["radio:juno", "Doc Rhee needs a courier. Don't open what he gives you. Don't be late."]],
  c4_rhee: [
    ["rhee", "This shard holds medical records. The encryption key rotates in ninety seconds once it's out of my lockbox."],
    ["rhee", "Dead-drop's in the relay plaza, south-east. Run. And Kade — the Fangs know I'm moving something."],
  ],
  c4_end: [
    ["radio:rhee", "Delivered. Good. You deserve to know what you carried."],
    ["radio:rhee", "People keep coming into my clinic with neural ports they never paid for. Chrome they don't remember getting. All of them from the Market."],
  ],
  c5_start: [["radio:juno", "Big one. The Lotus counting house, north-east. The Fangs keep a ledger on a terminal in the back office."]],
  c5_brief: [
    ["radio:juno", "Get in, download the ledger, get out. If anyone raises an alarm, the ledger auto-wipes and we've lost it."],
    ["radio:juno", "Crouch (Ctrl while still) to stay low. Strike an unaware guard from behind for a silent takedown. Watch their sight cones."],
  ],
  c5_end: [
    ["radio:juno", "Got it. Kade… the Fangs are being paid per 'volunteer' delivered. Payer: H.D. Logistics."],
    ["radio:juno", "H.D. — Halcyon Dynamics. The richest corporation in Neon City is buying people from a street gang."],
  ],
  c6_start: [["radio:pip", "Kade! It's Pip. The Lantern Street relay's fried. Fix it and I can tap Razor's comms. Razor runs the Fangs."]],
  c6_brief: [["radio:pip", "It needs three fuses. One's in the plaza scrap pile, one's on top of the crate stack — climb it — and an Enforcer on Lantern Street walks around with one. Don't ask."]],
  c6_end: [
    ["radio:pip", "Signal's up! Razor's at the hideout, north-west. He's talking to someone… a Halcyon number."],
    ["radio:pip", "Kade — Razor said 'the next batch goes to the Foundry'. Batch. Like they're cattle."],
  ],
  c7_start: [["radio:juno", "Pip's intel checks out. Razor is holed up in the Fang hideout. I've cracked the gate lock. This ends the Fangs."]],
  c7_end: [
    ["razor", "Hah… you think I'm the monster, merc? Halcyon buys them by the truckload. Chrome junkies, drifters, kids…"],
    ["razor", "Ask Ironjaw where they go. The Foundry… Industrial Sector… it sings down there…"],
    ["radio:juno", "Razor's done. I've loaded a maglev pass onto your ID — the Industrial Sector is open. Follow the money, Kade."],
  ],
  /* ------------------------------------------------------------ act 2 — Industrial Sector */
  c8_start: [
    ["radio:juno", "Welcome to the Sector. Ozzy at the station kiosk is my eyes here."],
    ["radio:juno", "Kessler Foundry's assembly line has gone rogue — the machines keep printing attack drones. Shut all four down."],
  ],
  c8_end: [
    ["radio:juno", "Line's dead. Ozzy pulled the logs: the machines were taking orders from an outside broadcast. Tag: 'CHOIR TEST 7'."],
  ],
  c9_start: [["radio:juno", "A client wants the cargo core from container HD-0447. It vanished from the yard manifest. Check the manifest terminals to find it."]],
  c9_found: [["kade", "Bay 4, row C. HD-0447. Let's see what Halcyon ships."]],
  c9_end: [
    ["radio:juno", "Cryo-pods. Empty, but logged. Names, ages, 'compliance scores'… Kade, one of them is Mira Okafor."],
    ["radio:pip", "Mira?! That's… that's my sister. She's alive? Where did they take her?!"],
  ],
  c10_start: [["radio:juno", "The restricted annex behind the checkpoint has a terminal with Halcyon's shipping keys. Breach it."]],
  c10_end: [
    ["radio:juno", "Keys decrypted. 'Project CHOIR — neural compliance trials. Subject transfers: Foundry Sublevel.'"],
    ["radio:juno", "There's something under the Foundry. And whatever CHOIR is, it's broadcasting to robots and people alike."],
  ],
  c11_start: [["radio:ozzy", "Kade, Ozzy. Three Sentinel squads walked off the line and they're shooting anyone in the street. Help?"]],
  c11_end: [
    ["radio:ozzy", "Streets are clear. Doc Rhee says he can build you an EMP rig from the Sentinel cores now. Look him up."],
  ],
  c12_start: [["radio:juno", "The old chemical works floods the sublevels. Shut the three valves to drain the channel, then trip the pump controls."]],
  c12_brief: [["radio:juno", "The gas will eat you alive — each valve clears the next section. Steam vents burst on a cycle: watch the glow, time your run."]],
  c12_end: [["radio:juno", "Pumps are running. The lower tunnels are draining. Now we just need a way down."]],
  c13_start: [["radio:ozzy", "Old Benny used to work the maintenance tunnels before they sealed 'em. He kept logs. Start at the loading dock."]],
  c13_c1: [["kade", "Benny's shift log: 'Hatch moved when they built the new rail. Follow the drag marks from the north road.'"]],
  c13_c2: [["kade", "Drag marks — heavy, recent. They lead toward the warehouses. Something big gets moved this way at night."]],
  c13_c3: [["kade", "Maintenance log, last entry: 'Hatch 9 behind the warehouses. DO NOT OPEN. They hear it singing.'"]],
  c13_end: [["radio:juno", "You found the foundry sublevel. Something big is breathing down there. Be careful."]],
  c14_start: [["radio:juno", "Whatever runs the Foundry is in that chamber. Halcyon calls it IRONJAW. Kill it, and CHOIR loses its strongest test."]],
  c14_end: [
    ["ironjaw", "Was… Tomas. Dock… worker. They put the choir… in my head. It sings… all the time…"],
    ["ironjaw", "The others… taken up. To the Tower. Specter… takes them. Make it… stop…"],
    ["radio:juno", "…I'm sorry, Kade. I've got you a corporate access pass. And — someone's been trying to reach you."],
    ["radio:lena", "My name is Dr. Lena Sato. I built CHOIR. I need to help you stop it. Find me at Concord Plaza."],
  ],
  /* ------------------------------------------------------------ act 3 — Corporate District */
  c15_start: [["radio:lena", "I'm by the plaza benches. Don't stare at the cameras."]],
  c15_lena: [
    ["lena", "CHOIR was supposed to treat addiction. A gentle neural nudge. Director Vex turned it into a leash."],
    ["lena", "The proof is in the Halcyon Annex, west side — three office terminals. Download the dossiers. Troopers patrol, so stay sharp."],
  ],
  c15_end: [
    ["lena", "It's worse than I thought. Vex means to broadcast CHOIR through the city network. Everyone with a neural port — obedient. Everyone."],
  ],
  c16_start: [["radio:lena", "Halcyon's surveillance nodes watch every street. Take down all four and they're blind long enough to get into the Tower."]],
  c16_end: [["radio:lena", "Ghost network achieved. The Tower's front door just became a lot less guarded."]],
  c17_start: [["radio:lena", "Get into Halcyon Tower. The lobby's locked down — three lock terminals release the executive elevator."]],
  c17_exec: [["kade", "Personnel file: SPECTER-9. Former subject 0112 — Mira Okafor. Status: asset. Stationed: Tower roof."]],
  c17_end: [
    ["radio:pip", "Mira… is Specter-9? No. No no no. Kade, please — don't kill her. She's in there somewhere."],
    ["radio:lena", "If you break her CHOIR implant without killing her, she may come back. Beat her down. I'll do the rest."],
  ],
  c18_start: [["radio:lena", "The roof. She'll be waiting. She's faster than you, Kade. Don't let her line up a shot."]],
  c18_end: [
    ["specter", "…the singing stopped. It's so quiet. Who… Pip? Is Pip safe?"],
    ["kade", "He's safe. He never stopped looking for you."],
    ["radio:lena", "Her implant's dead. I've got her. Kade — the research labs, east side. That's where the rest of the proof is."],
  ],
  c19_start: [["radio:lena", "I'll meet you at the labs. We take the CHOIR research logs and upload them to Juno. Then nobody can bury this."]],
  c19_upload: [["lena", "I'm uploading — it'll take a minute. They'll come for the uplink. Keep them off me!"]],
  c19_end: [
    ["lena", "Upload complete. And… the logs. Vex isn't waiting. The CHOIR broadcast goes live tonight from the data centre under the plaza."],
    ["radio:juno", "I've got everything, Kade. The service elevator by the plaza goes down to the data centre. This is the last contract. Make it count."],
  ],
  c20_start: [["radio:juno", "Service elevator, west side of the plaza. Vex is in the core chamber. End this."]],
  c20_vex: [
    ["vex", "The freelancer. Do you know what you're interrupting? A city without fear. Without crime. Without choice — yes. Choice was the disease."],
    ["kade", "Funny. I thought the disease was you."],
  ],
  /* ------------------------------------------------------------ ambient */
  talk_pip_late: [["pip", "Mira's home. She doesn't sleep much. Neither do I. Thank you, Kade."]],
  talk_lena_late: [["lena", "Halcyon's board is in free fall. I'm testifying next week. Strange — I feel lighter."]],
};

/**
 * Cinematics: `shots` play in order; each shot has a camera (from → to, both
 * [x,y,z,lookX,lookY,lookZ]), a duration and an optional caption. Shots may
 * use "boss" / "player" keywords for dynamic framing.
 */
export const CINEMATICS = {
  intro: {
    title: "NEON MERCENARY",
    shots: [
      { from: [0, 30, 54], to: [0, 19, 34], dur: 5, text: "Neon City. Population: forty million. Rain: constant." },
      { from: [-50, 3.4, 2], to: [-24, 3, 1], dur: 4.5, text: "Down in the Market, everyone works for somebody." },
      { from: [-49, 2.6, 36], to: [-51.5, 2.2, 43], dur: 4, text: "You work for whoever pays. Contract by contract." },
    ].map((s, i) => ({ ...s, from: [...s.from, ...[[0, 6, -20], [10, 2.6, 0], [-52, 1.4, 50]][i]], to: [...s.to, ...[[0, 4, -30], [16, 2.4, -1], [-52, 1.5, 51]][i]] })),
  },
  c9_pods: {
    title: "CONTAINER HD-0447",
    shots: [
      { from: [44, 4, -44, 40, 1.4, -50], to: [41, 2.4, -46, 40, 1.2, -50], dur: 4, text: "Twelve cryo-pods. Frost still on the glass." },
      { from: [38, 2, -46, 40, 1.4, -50], to: [39.5, 1.8, -47.5, 40, 1.2, -50], dur: 4, text: "Each one labelled with a name. A compliance score. A destination: FOUNDRY SUBLEVEL." },
    ],
  },
  c19_reveal: {
    title: "PROJECT CHOIR",
    shots: [
      { from: [44, 3.2, -30, 38, 1.6, -46], to: [40, 2.4, -38, 38, 1.4, -48], dur: 4.5, text: "Phase 1: the Foundry — machines. Phase 2: Market volunteers — people." },
      { from: [36, 2.2, -42, 38, 1.6, -48], to: [37, 1.9, -45, 38, 1.4, -48], dur: 4.5, text: "Phase 3: CITYWIDE. Every neural port in Neon City. Tonight, 00:00." },
    ],
  },
  ending: {
    title: "THE LAST CONTRACT",
    shots: [
      { from: [-102, 4, 34, -102, 4, 52], to: [-102, 6, 40, -102, 6, 52], dur: 4.5, text: "The CHOIR core goes dark. Somewhere above, forty million people keep their own thoughts." },
      { from: [20, 40, 70, 0, 20, 0], to: [0, 60, 40, 0, 20, -40], dur: 5, text: "Neon City wakes up the next morning not knowing how close it came." },
    ],
  },
};

/** Final choice after Director Vex falls. */
export const ENDINGS = {
  leak: {
    title: "THE CITY KNOWS",
    lines: [
      "You broadcast every CHOIR file to every screen in Neon City.",
      "Halcyon's stock collapses before lunch. Director Vex's name becomes a curse. Lena Sato testifies; the board resigns one by one.",
      "Mira Okafor walks Lantern Street with her brother. The Red Fangs are gone. Noodle Nan raises her prices anyway.",
      "Juno never says thank you. She just sends the next contract — and this time, the client is the city.",
    ],
  },
  sell: {
    title: "THE PRICE OF SILENCE",
    lines: [
      "You hand the CHOIR files to Juno's buyers. The money is obscene.",
      "Halcyon quietly buries the project. Vex is 'retired'. A new director smiles at the cameras.",
      "Mira and Pip disappear from the Market — safely, you hope. Lena Sato's testimony never happens.",
      "You buy a penthouse above the rain. Some nights, you swear you can hear something singing.",
    ],
  },
};
