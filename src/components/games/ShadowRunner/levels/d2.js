/**
 * District 2 — Neon Market. Night market roofs under signage haze: laser
 * posts / curtains / tripwires, awning springs, the double jump (L14+), pulse
 * gates (timed) and sweeping beams.
 */
import { level } from "../engine/level.js";

const D = { district: 1, run: 375, weather: "haze" };

export default [
  level({ ...D, id: 11, name: "Neon Wire", chase: { ratio: 0.88, lead: 260 }, intro: "Red light means death. Jump the laser posts." }, (b) => {
    b.roof(900).hint(200, "Lasers are deadly — jump over the posts").post(520).coins(480, 3, 34, 110);
    b.gap(150).roof(700).post(300).post(560).coins(150, 3);
    b.gap(170).roof(620, -40).post(260, 60).arc(560, 4);
    b.gap(180).roof(760, 50).cp(40).post(240).vault(480).coins(560, 3);
    b.gap(160).roof(560, -50).post(140).post(400).coins(240, 3);
    b.gap(200).roof(700, 60).cp(40).wall(300, 80).post(520).coins(330, 3, 34, 108);
    b.gap(190).roof(640, -30).post(200).post(380).post(560).coins(260, 3, 34, 100);
    b.gap(200).roof(700, 40).coins(150, 5).finish(580);
  }),

  level({ ...D, id: 12, name: "Under the Glow", chase: { ratio: 0.88, lead: 260 }, intro: "Laser curtains hang from the signs. Slide beneath them." }, (b) => {
    b.roof(900).hint(200, "Press {slide} to slide under laser curtains").curtain(520).coins(500, 3, 34, 14);
    b.gap(160).roof(800).curtain(240).post(560).coins(220, 2, 34, 14);
    b.gap(170).roof(700, -40).bar(200, 100).curtain(480).coins(210, 3, 34, 14);
    b.gap(180).roof(760, 50).cp(40).post(220).curtain(460).post(660).coins(440, 2, 34, 14);
    b.gap(190).roof(620, -60).curtain(160).curtain(420).coins(170, 2, 34, 14).coins(430, 2, 34, 14);
    b.gap(200).roof(820, 70).cp(40).vault(200).curtain(440).bar(600, 120).coins(420, 2, 34, 14);
    b.gap(180).roof(700, -30).post(200).curtain(400).post(600).coins(380, 2, 34, 14);
    b.gap(210).roof(700, 40).coins(150, 5).finish(580);
  }),

  level({ ...D, id: 13, name: "Awning Bounce", chase: { ratio: 0.89, lead: 260 }, intro: "Springy awnings launch you to the high roofs." }, (b) => {
    b.roof(900).hint(240, "Run over springs to bounce high").spring(560).coins(560, 1, 0, 120).coin(640, 200);
    b.gap(0).roof(600, -220).coins(160, 4);
    b.gap(180).roof(700, 160).spring(400).coin(470, 180);
    b.gap(0).roof(520, -230).cp(60).post(300).coins(160, 3);
    b.gap(200).roof(760, 180).post(220).spring(480).coin(560, 200);
    b.gap(0).roof(600, -240).curtain(300).coins(280, 2, 34, 14);
    b.gap(220).roof(700, 150).cp(40).spring(260).ledge(400, 230, 200).coins(440, 3, 34, 260);
    b.gap(220).roof(700, 0).post(240).coins(320, 4).finish(600);
  }),

  level({ ...D, id: 14, name: "Second Wind", airJumps: 1, chase: { ratio: 0.89, lead: 260 }, intro: "You can now double jump. Press jump again in mid-air." }, (b) => {
    b.roof(900).hint(300, "Press {jump} again in mid-air to double jump").coins(200, 4);
    b.gap(340).roof(600).coins(160, 4).coin(-170, 170);
    b.gap(360).roof(560, -40).coin(-180, 200).coins(200, 3);
    b.gap(300).roof(640, 60).cp(40).post(320).coins(420, 3);
    b.gap(380).roof(520, -60).coin(-190, 210).coins(150, 3);
    b.gap(260).roof(700, -150).post(360).coins(160, 3);
    b.gap(360).roof(600, 160).cp(40).curtain(320).coins(300, 2, 34, 14).coin(-180, 180);
    b.gap(340).roof(700, -40).coin(-170, 220).coins(180, 5).finish(580);
  }),

  level({ ...D, id: 15, name: "Pulse Gate", airJumps: 1, chase: { ratio: 0.8, lead: 300 }, intro: "Laser gates pulse on and off. Hold brake to time your pass." }, (b) => {
    const gate = (at, phase) => b.laser(at, 440, 440, { w: 10, on: 0.7, off: 0.8, phase });
    b.roof(1000).hint(250, "Gates pulse — hold {brake} to slow down and time them").coins(200, 3);
    gate(640, 0.3);
    b.gap(180).roof(800).coins(150, 3);
    gate(500, 0.9);
    b.gap(200).roof(760, -40).cp(60).post(240).coins(400, 3);
    gate(600, 1.5);
    b.gap(220).roof(900, 50).coins(120, 3);
    gate(380, 0.2);
    gate(700, 0.9);
    b.gap(240).roof(760, -50).cp(60).curtain(260).coins(240, 2, 34, 14);
    gate(560, 1.8);
    b.gap(260).roof(700, 30).coins(150, 5).finish(580);
  }),

  level({ ...D, id: 16, name: "Tripwire Alley", airJumps: 1, chase: { ratio: 0.9, lead: 260 }, intro: "Tripwires: high ones you slide under, low ones you jump." }, (b) => {
    b.roof(900).hint(200, "Low tripwires: jump · High tripwires: slide ({slide})").beam(400, 36, 120).coins(410, 3, 34, 110);
    b.gap(160).roof(800).beam(200, 48, 180).beam(520, 36, 100).coins(220, 4, 34, 14);
    b.gap(200).roof(720, -40).cp(40).beam(180, 48, 220).coins(200, 5, 34, 14).post(560);
    b.gap(300).roof(700, 60).beam(160, 36, 150).bar(460, 110).coins(470, 2, 34, 14);
    b.gap(220).roof(800, -50).cp(40).beam(150, 48, 140).beam(420, 36, 140).beam(660, 48, 100).coins(440, 3, 34, 120);
    b.gap(340).roof(640, 40).curtain(200).beam(400, 36, 120).coins(210, 2, 34, 14);
    b.gap(220).roof(700).coins(150, 5).finish(580);
  }),

  level({ ...D, id: 17, name: "Billboard Bounce", airJumps: 1, chase: { ratio: 0.9, lead: 260 }, intro: "Bounce, then steer past the glowing signs." }, (b) => {
    b.roof(900).spring(500).laser(760, 480, 180, { w: 12 }).coins(560, 1, 0, 200);
    b.gap(0).roof(560, -200).coins(180, 3);
    b.gap(240).plat(240, 120).spring(100).laser(240, 480, 200, { w: 12 }).coin(160, 250);
    b.gap(120).roof(600, -140).cp(60).post(300).coins(140, 3);
    b.gap(360).roof(600, 120).spring(300).coin(380, 230);
    b.gap(0).plat(220, -240).post(110).gap(260).roof(560, 40).cp(60).coins(200, 3);
    b.gap(300).roof(700, 100).curtain(200).spring(480).coin(560, 220);
    b.gap(0).roof(700, -230).coins(150, 5).finish(580);
  }),

  level({ ...D, id: 18, name: "Neon Tower", airJumps: 1, chase: { ratio: 0.88, lead: 280 }, intro: "Climb the market tower and dive off the far side." }, (b) => {
    b.roof(700).coins(200, 3);
    b.gap(0).roof(320, -90).gap(0).roof(320, -90).coins(100, 3).gap(0).roof(320, -90).post(160);
    b.gap(0).roof(400, -180).cp(60).spring(250).coin(320, 220);
    b.gap(0).roof(480, -240).ledge(240, 120, 140).coins(260, 3, 34, 150);
    b.gap(200).roof(500, 0).wall(260, 150, 60).coin(290, 190);
    b.gap(0).roof(460, -150).cp(60).curtain(240);
    b.gap(220).roof(500, 220).post(240).coins(320, 3);
    b.gap(200).roof(520, 200).coins(150, 3);
    b.gap(240).roof(700, 180).coins(150, 5).finish(580);
  }),

  level({ ...D, id: 19, name: "Sweeper", airJumps: 1, chase: { ratio: 0.86, lead: 290 }, intro: "These beams move. Watch the rhythm before you commit." }, (b) => {
    b.roof(1000).hint(260, "Moving lasers — watch their rhythm").beam(560, 110, 220, { my: 50, mperiod: 1.8 }).coins(300, 3);
    b.gap(180).roof(800).curtain(300, 34, 300, { mx: 60, mperiod: 2.2 }).coins(150, 3);
    b.gap(200).roof(760, -40).cp(60).laser(400, 260, 10, { w: 200, my: 110, mperiod: 2.4 }).coins(500, 3);
    b.gap(220).roof(900, 60).post(260, 52, { mx: 90, mperiod: 2 }).curtain(620, 34, 300, { mx: 70, mperiod: 1.6, mphase: 1 }).coins(400, 3);
    b.gap(240).roof(800, -40).cp(60).beam(260, 100, 240, { my: 60, mperiod: 1.5 }).coins(560, 3);
    b.gap(260).roof(800, 40).laser(300, 240, 10, { w: 260, my: 100, mperiod: 2, mphase: 2 }).coins(200, 2).finish(700);
  }),

  level({ ...D, id: 20, name: "Market Breakout", airJumps: 1, chase: { ratio: 0.91, lead: 250 }, intro: "Break out of the market before the lights find you." }, (b) => {
    b.roof(900).post(300).curtain(560).coins(560, 2, 34, 14);
    b.gap(320).roof(600, -60).spring(380).coin(450, 220);
    b.gap(0).roof(520, -220).beam(200, 48, 160).coins(220, 4, 34, 14);
    b.gap(260).roof(700, 200).cp(60).laser(420, 440, 440, { w: 10, on: 0.7, off: 0.8, phase: 0.4 }).coins(150, 3);
    b.gap(340).roof(600, -40).post(200).post(420).coins(280, 2, 34, 110);
    b.gap(200).plat(220, 60).gap(220).plat(220, -60).post(110);
    b.gap(220).roof(800, 60).cp(40).curtain(240, 34, 300, { mx: 60, mperiod: 2 }).vault(520).coins(520, 3, 34, 80);
    b.gap(360).roof(620, -80).beam(200, 36, 160).coins(200, 4, 34, 110);
    b.gap(260).roof(800, 100).coins(150, 5).finish(680);
  }),
];
