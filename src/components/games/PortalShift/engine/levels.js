/**
 * Portal Shift — the 25 test chambers. Each entry carries its player-facing
 * text (name, objective, hint, optional intro tip) and a `build(b)` that
 * shapes the voxel grid with engine/build.js. tools/routes.mjs holds a
 * scripted solution per chamber; tools/levelTest.mjs plays every one of them
 * through the real simulation.
 *
 * Grid reminder: x = east, layer = up, z = south. Layer 0 is the floor slab,
 * so a room carved from layer 1 has its floor at y = 2 m.
 */
import { builder } from "./build.js";

export const LEVELS = [
  /* ================================================================ Sector 1 — Calibration */
  {
    id: 1,
    sector: 0,
    name: "Wake-Up Call",
    objective: "Reach the exit lift at the end of the chamber.",
    hint: "Walk with W A S D and look with the mouse. Run at the gap and press Space at the edge to jump over the energy liquid.",
    tip: "Move with W A S D, look with the mouse, jump with Space.",
    build: (b) =>
      b
        .room(2, 1, 2, 4, 2, 12)
        .room(1, 1, 9, 5, 2, 12)
        .room(2, 0, 7, 4, 0, 7)
        .goo(2, 0, 7, 4, 0, 7)
        .exit([3, 1, 1], [3, 1, 0])
        .spawn([3, 1, 11], "nz"),
  },
  {
    id: 2,
    sector: 0,
    name: "First Portal",
    objective: "The exit room is sealed. A fixed orange portal waits inside — open a blue one and step through.",
    hint: "Aim at the white wall panel and left-click to open the blue portal, then walk into it.",
    tip: "Left-click opens a blue portal on white panels. Dark metal rejects portals.",
    build: (b) =>
      b
        .room(1, 1, 6, 5, 2, 10)
        .room(1, 1, 2, 5, 2, 4)
        .glass(2, 2, 5, 4, 2, 5)
        .white(0, 1, 8, 0, 1, 8)
        .white(6, 1, 3, 6, 1, 3)
        .portal("orange", [6, 1, 3], "nx")
        .lock("orange")
        .exit([3, 1, 1], [3, 1, 0])
        .spawn([3, 1, 9], "nz"),
  },
  {
    id: 3,
    sector: 0,
    name: "Across the Void",
    objective: "Cross the energy trench. It is far too wide to jump.",
    hint: "Put the blue portal on the near white panel and the orange portal on the white panel across the trench, then walk through.",
    tip: "Right-click opens the orange portal. Both portals connect to each other.",
    build: (b) =>
      b
        .room(1, 1, 2, 5, 3, 12)
        .room(1, 0, 5, 5, 0, 8)
        .goo(1, 0, 5, 5, 0, 8)
        .white(0, 1, 10, 0, 1, 10)
        .white(6, 1, 3, 6, 1, 3)
        .exit([3, 1, 1], [3, 1, 0])
        .spawn([3, 1, 11], "nz"),
  },
  {
    id: 4,
    sector: 0,
    name: "Higher Ground",
    objective: "The exit sits on a ledge high above the floor. Find a way up.",
    hint: "A portal can open high on a wall. Place one on the high white panel above the ledge and the other on a white panel you can walk into.",
    build: (b) =>
      b
        .room(1, 1, 2, 6, 4, 11)
        .fill(1, 1, 2, 6, 2, 4)
        .white(4, 4, 1, 5, 4, 1)
        .white(7, 1, 9, 7, 1, 9)
        .exit([2, 3, 1], [2, 3, 0])
        .spawn([3, 1, 10], "nz"),
  },
  {
    id: 5,
    sector: 0,
    name: "Momentum",
    objective: "Reach the far platform. Speed is preserved through portals — fall far, fly far.",
    hint: "Put a portal on the white floor of the pit below you and the other high on the white wall facing the far platform. Then step off the balcony and drop into the pit portal.",
    tip: "Speed carries through portals: what goes in fast comes out fast.",
    build: (b) =>
      b
        .room(1, 1, 2, 7, 6, 11)
        // far platform x1..3 (floor y = 2); everything else west is solid
        .fill(1, 1, 8, 3, 6, 11)
        // trench x4..7 between the far platform and the pit
        .room(4, 0, 2, 7, 0, 7)
        .goo(4, 0, 2, 7, 0, 7)
        // balcony z10..11, top at layer 5
        .fill(4, 1, 10, 7, 4, 11)
        // pit floor (portal surface)
        .white(4, 0, 8, 7, 0, 9)
        // launch wall facing the far platform
        .white(8, 3, 2, 8, 3, 6)
        .exit([2, 1, 1], [2, 1, 0])
        .checkpoint([5, 5, 11], "nz")
        .spawn([5, 5, 11], "nz"),
  },
  /* ================================================================ Sector 2 — Foundry */
  {
    id: 6,
    sector: 1,
    name: "Heavy Lifting",
    objective: "Hold the exit door open with an energy cube on the pressure plate.",
    hint: "Look at the cube and press E to pick it up. Carry it over the plate and press E again to drop it.",
    tip: "Press E to pick up and drop energy cubes. Plates stay pressed while something rests on them.",
    build: (b) =>
      b
        .room(1, 1, 2, 6, 2, 9)
        .cube([5, 1, 8])
        .plate("p1", [2, 1, 4])
        .exit([4, 1, 1], [4, 1, 0], ["p1"])
        .spawn([3, 1, 8], "nz"),
  },
  {
    id: 7,
    sector: 1,
    name: "Up and Down",
    objective: "The only cube rests on a high ledge. Bring it down to the plate.",
    hint: "Portal up to the ledge using the high white panel on the far wall. Drop the cube over the edge, jump after it, then carry it to the plate.",
    build: (b) =>
      b
        .room(1, 1, 2, 6, 4, 10)
        .fill(1, 1, 7, 6, 2, 10)
        .white(2, 4, 11, 4, 4, 11)
        .white(7, 1, 4, 7, 1, 4)
        .cube([5, 3, 8])
        .plate("p1", [2, 1, 4])
        .exit([5, 1, 1], [5, 1, 0], ["p1"])
        .spawn([3, 1, 2], "pz"),
  },
  {
    id: 8,
    sector: 1,
    name: "Cube Courier",
    objective: "Fetch the cube from across the trench and set it on the plate.",
    hint: "Portals carry cubes too. Go over with the portals, pick up the cube and walk back through the portal while holding it.",
    build: (b) =>
      b
        .room(1, 1, 2, 7, 2, 11)
        .room(1, 0, 6, 7, 0, 7)
        .goo(1, 0, 6, 7, 0, 7)
        .white(3, 1, 12, 3, 1, 12)
        .white(0, 1, 3, 0, 1, 3)
        .cube([4, 1, 10])
        .plate("p1", [5, 1, 3])
        .exit([2, 1, 1], [2, 1, 0], ["p1"])
        .spawn([4, 1, 4], "pz"),
  },
  {
    id: 9,
    sector: 1,
    name: "Double Duty",
    objective: "Both plates must be pressed. One cube is here — the other waits on the ledge across the trench.",
    hint: "Reach the ledge through a portal on its back wall. Drop the cube to the floor below, follow it, then open a portal on the low white wall there to carry it home.",
    build: (b) =>
      b
        .room(1, 1, 2, 6, 4, 12)
        .room(1, 0, 7, 6, 0, 8)
        .goo(1, 0, 7, 6, 0, 8)
        .fill(1, 1, 11, 6, 2, 12)
        .white(3, 3, 13, 3, 3, 13)
        .white(0, 1, 3, 0, 1, 3)
        .white(7, 1, 9, 7, 1, 9)
        .cube([5, 1, 6])
        .cube([5, 3, 11])
        .plate("p1", [2, 1, 4])
        .plate("p2", [5, 1, 3])
        .exit([4, 1, 1], [4, 1, 0], ["p1", "p2"])
        .spawn([3, 1, 3], "pz"),
  },
  {
    id: 10,
    sector: 1,
    name: "Stepping Stone",
    objective: "The exit is on a ledge too high to jump. Bring something to stand on.",
    hint: "Fetch the cube with portals and drop it right against the ledge. Jump onto the cube, then jump again onto the ledge.",
    tip: "Standing on a cube gives you just enough height to climb a ledge.",
    build: (b) =>
      b
        .room(1, 1, 2, 6, 3, 12)
        .fill(1, 1, 2, 6, 1, 4)
        .room(1, 0, 8, 6, 0, 9)
        .goo(1, 0, 8, 6, 0, 9)
        .white(2, 1, 13, 2, 1, 13)
        .white(0, 1, 6, 0, 1, 6)
        .cube([4, 1, 11])
        .exit([3, 2, 1], [3, 2, 0])
        .spawn([3, 1, 6], "pz"),
  },

  /* ================================================================ Sector 3 — Prism Laboratory */
  {
    id: 11,
    sector: 2,
    name: "First Light",
    objective: "Power the receiver on the north wall to unlock the exit.",
    hint: "Energy beams travel through portals. Open a portal where the beam hits the white wall, and the other on the white panel facing the receiver.",
    tip: "Beams pass through portals and glass. Receivers unlock what they are linked to.",
    build: (b) =>
      b
        .room(1, 1, 2, 7, 2, 9)
        .emitter([0, 1, 5], "px")
        .white(8, 1, 5, 8, 1, 5)
        .white(4, 1, 10, 4, 1, 10)
        .receiver("r1", [4, 1, 1], "pz")
        .exit([2, 1, 1], [2, 1, 0], ["r1"])
        .spawn([5, 1, 8], "nz"),
  },
  {
    id: 12,
    sector: 2,
    name: "Reflection",
    objective: "Bend the beam through the glass and into the receiver.",
    hint: "A reflector cube sends a beam the way its lens faces. Drop it in the beam's path while you face the receiver — it snaps to the floor grid.",
    tip: "Reflector cubes redirect beams in the direction you face when you drop them.",
    build: (b) =>
      b
        .room(1, 1, 2, 7, 2, 9)
        .glass(1, 1, 3, 7, 2, 3)
        .emitter([0, 1, 7], "px")
        .receiver("r1", [6, 1, 1], "pz")
        .cube([2, 1, 8], "reflector", "nz")
        .exit([8, 1, 6], [9, 1, 6], ["r1"])
        .spawn([3, 1, 5], "pz"),
  },
  {
    id: 13,
    sector: 2,
    name: "Split Chambers",
    objective: "Open the way to the north chamber, then send the beam from this room into its receiver.",
    hint: "The cube holds the inner door open. Inside the north chamber, put a portal on its white wall — and link it to the spot where the beam lands in the first room.",
    build: (b) =>
      b
        .room(1, 1, 2, 5, 2, 4)
        .room(1, 1, 6, 5, 2, 10)
        .glass(2, 2, 5, 4, 2, 5)
        .door("d1", [3, 1, 5], "z", ["p1"])
        .emitter([6, 1, 8], "nx")
        .white(0, 1, 8, 0, 1, 8)
        .white(6, 1, 3, 6, 1, 3)
        .receiver("r1", [0, 1, 3], "px")
        .cube([5, 1, 10])
        .plate("p1", [1, 1, 10])
        .exit([3, 1, 1], [3, 1, 0], ["r1"])
        .spawn([3, 1, 9], "nz"),
  },
  {
    id: 14,
    sector: 2,
    name: "Prism Relay",
    objective: "Chain the beam through a portal and a reflector to reach the west receiver.",
    hint: "First use the portals to fetch the reflector from the ledge. Then send the beam out of the north wall and catch it with the reflector, lens facing west.",
    build: (b) =>
      b
        .room(1, 1, 2, 8, 4, 10)
        .fill(6, 1, 8, 8, 2, 10)
        .emitter([0, 1, 4], "px")
        .white(9, 1, 4, 9, 1, 4)
        .white(9, 4, 9, 9, 4, 9)
        .white(5, 1, 1, 5, 1, 1)
        .receiver("r1", [0, 1, 9], "px")
        .cube([7, 3, 10], "reflector", "nz")
        .exit([2, 1, 1], [2, 1, 0], ["r1"])
        .spawn([3, 1, 8], "nz"),
  },
  {
    id: 15,
    sector: 2,
    name: "Triple Lock",
    objective: "Three locks guard the exit: two plates and a beam receiver.",
    hint: "One cube opens the inner door. The second cube is on the ledge in the north chamber. When both plates are down, turn the beam into the north receiver.",
    build: (b) =>
      b
        .room(1, 1, 2, 5, 3, 6)
        .room(1, 1, 8, 5, 2, 12)
        .fill(1, 1, 2, 2, 2, 3)
        .door("d1", [3, 1, 7], "z", ["p1"])
        .emitter([0, 1, 4], "px")
        .white(6, 1, 4, 6, 1, 4)
        .white(5, 1, 7, 5, 1, 7)
        .white(0, 3, 3, 0, 3, 3)
        .receiver("r1", [5, 1, 1], "pz")
        .cube([5, 1, 11])
        .cube([2, 3, 2])
        .plate("p1", [1, 1, 9])
        .plate("p2", [4, 1, 3])
        .exit([3, 1, 1], [3, 1, 0], ["p1", "p2", "r1"])
        .spawn([3, 1, 11], "nz"),
  },

  /* ================================================================ Sector 4 — Kinetic Halls */
  {
    id: 16,
    sector: 3,
    name: "Lift Off",
    objective: "Ride the lift up to the exit ledge.",
    hint: "The lift only runs while its plate is pressed. Leave the cube on the plate and step onto the lift.",
    tip: "Moving platforms carry you — and anything you set on them.",
    build: (b) =>
      b
        .room(1, 1, 2, 6, 4, 9)
        .fill(1, 1, 2, 6, 2, 4)
        .room(4, 0, 5, 4, 0, 5)
        .platform("lift", [4, 1, 5], [4, 3, 5], { inputs: ["p1"], loop: true, speed: 1.6, pause: 1.6 })
        .plate("p1", [1, 1, 8])
        .cube([6, 1, 8])
        .exit([3, 3, 1], [3, 3, 0])
        .spawn([3, 1, 8], "nz"),
  },
  {
    id: 17,
    sector: 3,
    name: "Against the Clock",
    size: [8, 5, 17],
    objective: "The button opens the exit for only a few seconds. It is too far to run.",
    hint: "Set up your portals first: one beside the button, one beside the exit. Then press the button and take the shortcut.",
    tip: "Timed buttons count down — watch the timer at the top of the screen.",
    build: (b) =>
      b
        .room(1, 1, 2, 5, 2, 14)
        .button("s1", [3, 1, 14], 4)
        .white(0, 1, 13, 0, 1, 13)
        .white(0, 1, 3, 0, 1, 3)
        .exit([3, 1, 1], [3, 1, 0], ["s1"])
        .spawn([3, 1, 11], "pz"),
  },
  {
    id: 18,
    sector: 3,
    name: "Ferry",
    objective: "Carry the cube across the lake on the moving platform and press the plate on the far shore.",
    hint: "Wait for the platform at the shore, step on with the cube in your hands and ride it across. Step off before it returns.",
    build: (b) =>
      b
        .room(1, 1, 2, 6, 2, 13)
        .room(1, 0, 5, 6, 0, 10)
        .goo(1, 0, 5, 6, 0, 10)
        .platform("ferry", [3, 1, 10], [3, 1, 5], { loop: true, speed: 2.4, pause: 2 })
        .cube([5, 1, 12])
        .plate("p1", [5, 1, 3])
        .exit([2, 1, 1], [2, 1, 0], ["p1"])
        .spawn([3, 1, 12], "nz"),
  },
  {
    id: 19,
    sector: 3,
    name: "Updraft",
    objective: "The exit ledge is high above you and its gate is on a timer.",
    hint: "Falling fast into one floor portal launches you up out of the other. Put one under the balcony, one beside the ledge, press the button and drop.",
    build: (b) =>
      b
        .room(1, 1, 2, 7, 6, 11)
        .fill(1, 1, 2, 7, 3, 4)
        .fill(4, 1, 10, 7, 4, 11)
        .white(4, 0, 8, 7, 0, 9)
        .white(1, 0, 5, 2, 0, 5)
        .button("s1", [4, 5, 11], 9)
        .exit([3, 4, 1], [3, 4, 0], ["s1"])
        .checkpoint([6, 5, 11], "nz")
        .spawn([6, 5, 11], "nz"),
  },
  {
    id: 20,
    sector: 3,
    name: "Clockwork",
    objective: "The bridge rises only while the timer runs. Get the cube to the plate on the far side.",
    hint: "Leave the cube at the bridge first. Link the white panel by the distant button with the one near the bridge, press the button and rush through — grab the cube on your way across.",
    size: [16, 6, 14],
    build: (b) =>
      b
        .room(1, 1, 2, 7, 2, 11)
        .room(8, 1, 10, 14, 2, 11)
        .room(1, 0, 6, 7, 0, 7)
        .goo(1, 0, 6, 7, 0, 7)
        .platform("bridge", [4, 0, 6], [4, 1, 6], { inputs: ["s1"], speed: 4, size: [1.96, 0.3, 3.96], offset: [0, 0, 1] })
        .button("s1", [14, 1, 10], 4.5)
        .white(13, 1, 9, 13, 1, 9)
        .white(0, 1, 8, 0, 1, 8)
        .cube([11, 1, 11])
        .plate("p1", [6, 1, 3])
        .exit([2, 1, 1], [2, 1, 0], ["p1"])
        .spawn([4, 1, 10], "nz"),
  },
  /* ================================================================ Sector 5 — Dimension Core */
  {
    id: 21,
    sector: 4,
    name: "Convergence",
    objective: "Two beams, two receivers. Light both to open the exit.",
    hint: "Fetch the reflector from behind the trench and turn the south beam west. Then use your portals to carry the west beam into the north receiver.",
    build: (b) =>
      b
        .room(1, 1, 2, 8, 2, 12)
        .room(1, 0, 9, 8, 0, 10)
        .goo(1, 0, 9, 8, 0, 10)
        .emitter([0, 1, 4], "px")
        .emitter([3, 1, 13], "nz")
        .white(0, 1, 3, 0, 1, 3)
        .white(9, 1, 12, 9, 1, 12)
        .white(9, 1, 4, 9, 1, 4)
        .white(6, 1, 13, 6, 1, 13)
        .receiver("r1", [0, 1, 6], "px")
        .receiver("r2", [6, 1, 1], "pz")
        .cube([5, 1, 12], "reflector", "nz")
        .exit([8, 1, 1], [8, 1, 0], ["r1", "r2"])
        .spawn([4, 1, 5], "nz"),
  },
  {
    id: 22,
    sector: 4,
    name: "Long Fall",
    objective: "Carry the cube with you on a long flight and set it on the far plate.",
    hint: "You can hold a cube while you fall through a portal. Open portals in the pit and on the launch wall, pick up the cube and step off the balcony.",
    size: [14, 11, 14],
    build: (b) =>
      b
        .room(1, 1, 2, 9, 9, 11)
        .fill(1, 1, 7, 3, 9, 11)
        .room(4, 0, 2, 9, 0, 6)
        .goo(4, 0, 2, 9, 0, 6)
        .fill(4, 1, 10, 9, 7, 11)
        .white(4, 0, 7, 9, 0, 9)
        .white(10, 3, 2, 10, 3, 6)
        .cube([8, 8, 10])
        .plate("p1", [2, 1, 3])
        .exit([2, 1, 1], [2, 1, 0], ["p1"])
        .checkpoint([6, 8, 11], "nz")
        .spawn([6, 8, 11], "nz"),
  },
  {
    id: 23,
    sector: 4,
    name: "Overclock",
    objective: "The lift rises only while its receiver is powered, and the exit gate is on a timer.",
    hint: "Order matters. Prepare the first portal, press the button, step onto the lift and complete the beam from there.",
    build: (b) =>
      b
        .room(1, 1, 2, 7, 4, 10)
        .fill(1, 1, 2, 7, 2, 4)
        .room(4, 0, 5, 4, 0, 5)
        .platform("lift", [4, 1, 5], [4, 3, 5], { inputs: ["r1"], speed: 2 })
        .emitter([0, 1, 8], "px")
        .white(8, 1, 8, 8, 1, 8)
        .white(0, 1, 6, 0, 1, 6)
        .receiver("r1", [8, 1, 6], "nx")
        .button("s1", [1, 1, 9], 8)
        .exit([4, 3, 1], [4, 3, 0], ["s1"])
        .spawn([4, 1, 9], "nz"),
  },
  {
    id: 24,
    sector: 4,
    name: "Network",
    objective: "Three linked chambers. Each one unlocks the next.",
    hint: "The reflector holds the first door open — so carry it through a portal instead of the door. In the last chamber, set up both portals before you press the button.",
    size: [8, 5, 24],
    build: (b) =>
      b
        // chamber A (start)
        .room(1, 1, 17, 5, 2, 21)
        .door("d1", [3, 1, 16], "z", ["pA"])
        .cube([5, 1, 20], "reflector", "nz")
        .plate("pA", [1, 1, 18])
        .white(0, 1, 20, 0, 1, 20)
        // chamber B (beam)
        .room(1, 1, 10, 5, 2, 15)
        .emitter([6, 1, 14], "nx")
        .receiver("r1", [2, 1, 9], "pz")
        .white(6, 1, 11, 6, 1, 11)
        .door("d2", [3, 1, 9], "z", ["r1"])
        .checkpoint([3, 1, 13], "nz")
        // chamber C (timed crossing)
        .room(1, 1, 2, 5, 2, 8)
        .room(1, 0, 4, 5, 0, 5)
        .goo(1, 0, 4, 5, 0, 5)
        .button("s1", [5, 1, 8], 4)
        .white(6, 1, 7, 6, 1, 7)
        .white(0, 1, 2, 0, 1, 2)
        .exit([3, 1, 1], [3, 1, 0], ["s1"])
        .checkpoint([3, 1, 7], "nz")
        .spawn([3, 1, 20], "nz"),
  },
  {
    id: 25,
    sector: 4,
    name: "Dimension Escape",
    objective: "The final chamber. Unlock the core gate, ride the long fall with the reflector, and power the last exit.",
    hint: "The core gate locks open once powered, so you can take the reflector with you. Fling to the core with it, set it on the plate, and send the core beam north through your portals.",
    size: [14, 12, 20],
    build: (b) =>
      b
        .room(1, 1, 2, 9, 10, 11)
        .fill(1, 1, 7, 3, 10, 11)
        .room(4, 0, 2, 9, 0, 6)
        .goo(4, 0, 2, 9, 0, 6)
        .fill(4, 1, 10, 9, 7, 11)
        .white(4, 0, 7, 9, 0, 9)
        .white(10, 3, 2, 10, 3, 6)
        // upper hall with the gate
        .room(4, 8, 13, 9, 9, 16)
        .door("g1", [6, 8, 12], "z", ["ra"], false, true)
        .emitter([3, 8, 14], "px")
        .receiver("ra", [7, 8, 17], "nz")
        .cube([5, 8, 16], "reflector", "nz")
        // core platform
        .emitter([0, 1, 5], "px")
        .white(10, 1, 5, 10, 1, 5)
        .white(3, 1, 7, 3, 1, 7)
        .receiver("rc", [3, 1, 1], "pz")
        .plate("p1", [2, 1, 3])
        .exit([1, 1, 1], [1, 1, 0], ["p1", "rc"])
        .checkpoint([6, 8, 11], "nz")
        .spawn([6, 8, 15], "nz"),
  },
];

export const LEVEL_COUNT = 25;

const cache = new Map();
/** Compiled level (grid + devices) for chamber `id`, plus its text. */
export function getLevel(id) {
  if (cache.has(id)) return cache.get(id);
  const meta = LEVELS.find((l) => l.id === id);
  if (!meta) return null;
  const B = builder(meta.size?.[0] || 10, meta.size?.[1] || 8, meta.size?.[2] || 14);
  meta.build(B);
  const L = { ...B.L, id: meta.id, sector: meta.sector, name: meta.name, objective: meta.objective, hint: meta.hint, tip: meta.tip || null };
  if (!L.spawn || !L.exit) throw new Error(`level ${id}: spawn and exit are required`);
  if (L.outOfBounds) throw new Error(`level ${id}: builder touched cell ${L.outOfBounds} outside the grid`);
  cache.set(id, L);
  return L;
}
