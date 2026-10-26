/**
 * District 4 — Skyline Spire. Glass towers in a thunderstorm: the biggest
 * gaps, crane gantries, laser grids, broken spires and the final escape.
 */
import { level } from "../engine/level.js";

const D = { district: 3, run: 405, airJumps: 1, weather: "storm" };
const gate = (b, at, phase, on = 0.7, off = 0.8) => b.laser(at, 440, 440, { w: 12, on, off, phase });

export default [
  level({ ...D, id: 31, name: "Storm Front", chase: { ratio: 0.86, lead: 280 }, intro: "Lightning over the towers. Long gaps — use both jumps." }, (b) => {
    b.roof(900).coins(200, 4);
    b.gap(360).roof(600, -40).coin(-180, 210).coins(200, 3);
    b.gap(380).roof(560, 80).coin(-190, 200).post(300).coins(150, 3);
    b.gap(300).roof(700, -120).cp(60).bar(320, 110).coins(330, 3, 34, 14);
    b.gap(400).roof(600, 140).coin(-200, 160).coins(200, 3);
    b.gap(340).roof(560, -60).curtain(260).coins(240, 2, 34, 14);
    b.gap(380).roof(700, 100).cp(60).coin(-190, 190).post(260).post(480).coins(350, 2);
    b.gap(360).roof(700, -40).coin(-180, 220).coins(150, 5).finish(580);
  }),

  level({ ...D, id: 32, name: "Glass Ascent", chase: { ratio: 0.84, lead: 290 }, startY: 520, intro: "Scale the glass towers floor by floor." }, (b) => {
    b.roof(700).coins(200, 3);
    b.gap(0).roof(400, -150).wall(250, 90).coins(100, 3);
    b.gap(0).roof(420, -180).ledge(200, 130, 140).coins(220, 3, 34, 160);
    b.gap(0).roof(460, -200).cp(60).post(300).coins(120, 3);
    b.gap(160).roof(420, -120).wall(200, 150, 60).coin(230, 190);
    b.gap(0).roof(500, -150).cp(60).bar(240, 100).coins(250, 3, 34, 14);
    b.gap(0).roof(420, -210).coins(100, 4);
    b.gap(260).roof(600, 330).curtain(300).coins(280, 2, 34, 14);
    b.gap(280).roof(800, 300).coins(150, 5).finish(680);
  }),

  level({ ...D, id: 33, name: "Crane Swing", chase: { ratio: 0.82, lead: 300 }, intro: "Construction cranes swing their loads across the sky." }, (b) => {
    b.roof(900).coins(200, 4);
    b.gap(180).mover(200, -20, { ax: 120, ay: 40, period: 2.8 }).coin(100, 50);
    b.gap(180).mover(200, -40, { ax: 120, ay: 40, period: 2.8, phase: 1.6 }).coin(100, 50);
    b.gap(180).roof(700, 0).cp(60).post(360).coins(150, 3);
    b.gap(60).mover(240, 80, { ay: 140, period: 3 }).coin(120, 60);
    b.gap(60).roof(500, -250).coins(150, 3);
    b.gap(200).mover(220, 60, { ax: 140, period: 3.2, phase: 0.6 }).coin(110, 50);
    b.gap(200).roof(700, 60).cp(60).curtain(320).coins(300, 2, 34, 14);
    b.gap(170).mover(180, -60, { ax: 110, ay: 50, period: 2.6, phase: 2.2 }).coin(90, 50);
    b.gap(170).roof(800, 20).coins(150, 5).finish(680);
  }),

  level({ ...D, id: 34, name: "Laser Grid", chase: { ratio: 0.82, lead: 300 }, intro: "A corporate security grid. Read it, then thread it." }, (b) => {
    b.roof(1000).post(300).curtain(520).post(760).coins(500, 2, 34, 14);
    b.gap(200).roof(900).beam(160, 48, 200).beam(480, 36, 120).curtain(760).coins(180, 4, 34, 14);
    gate(b, 840, 0.4);
    b.gap(240).roof(900, -40).cp(60).laser(300, 240, 10, { w: 220, my: 100, mperiod: 2.2 }).post(700).coins(150, 3);
    b.gap(260).roof(900, 40).curtain(200, 34, 300, { mx: 60, mperiod: 1.8 }).post(480, 52, { mx: 80, mperiod: 2 }).coins(640, 3);
    b.gap(260).roof(1000, -40).cp(60).coins(100, 2);
    gate(b, 420, 0.9);
    b.beam(620, 48, 160).coins(640, 3, 34, 14);
    b.gap(300).roof(800, 60).post(260).post(470).coins(150, 5).finish(680);
  }),

  level({ ...D, id: 35, name: "Broken Spire", chase: { ratio: 0.86, lead: 280 }, intro: "The spire's upper floors are crumbling. Climb fast." }, (b) => {
    b.roof(800).coins(200, 3);
    b.block(560, 660, 50, 540).wall(740, 340, 60).coin(670, 160);
    b.gap(0).crumble(360, -340, 0.5).coins(80, 3);
    b.gap(150).crumble(260, 20).gap(150).roof(600, 60).cp(60).vault(300).coins(400, 3);
    b.gap(100).crumble(200, -40).gap(100).crumble(200, -40).spring(120);
    b.gap(0).roof(500, -220).cp(60).curtain(260).coins(240, 2, 34, 14);
    b.gap(200).roof(840, 240).block(440, 700, 50, 580).wall(620, 380, 220).coin(550, 160).coin(550, 290);
    b.gap(0).crumble(340, -380, 0.55).coins(80, 3);
    b.gap(220).roof(700, 200).coins(150, 5).finish(580);
  }),

  level({ ...D, id: 36, name: "Sky Bridge", chase: { ratio: 0.88, lead: 270 }, intro: "Narrow bridges strung between towers." }, (b) => {
    b.roof(800).coins(200, 3);
    b.gap(200).plat(500, -30).bar(220, 90).coins(230, 3, 34, 14);
    b.gap(220).plat(420, -40).post(200).coins(120, 2);
    b.gap(240).plat(500, 60).cp(60).curtain(300).coins(280, 2, 34, 14);
    b.gap(180).mover(200, 0, { ax: 110, period: 2.6, phase: 0.3 }).coin(100, 40);
    b.gap(180).plat(560, -30).beam(180, 36, 160).bar(440, 80).coins(200, 3, 34, 110);
    b.gap(300).plat(460, 40).cp(60).post(220).coins(300, 3);
    b.gap(260).plat(400, -60).vault(200).coins(260, 3);
    b.gap(280).roof(800, 80).coins(150, 5).finish(680);
  }),

  level({ ...D, id: 37, name: "Freefall", chase: { ratio: 0.88, lead: 270 }, startY: 60, intro: "A long way down. Press {slide} in mid-air to fast-fall." }, (b) => {
    b.roof(700).hint(300, "Hold {slide} in the air to drop faster").coins(200, 3);
    b.gap(220).roof(500, 200).laser(260, 440, 260, { w: 12 }).coins(320, 3);
    b.gap(240).roof(500, 220).curtain(220).coins(200, 2, 34, 14);
    b.gap(260).roof(600, 200).cp(60).laser(80, 480, 300, { w: 140 }).coins(300, 3);
    b.gap(240).roof(500, 180).post(240).coins(320, 3);
    b.gap(260).roof(600, 200).cp(60).laser(60, 500, 340, { w: 160 }).bar(320, 100).coins(330, 3, 34, 14);
    b.gap(260).roof(800, 160).coins(150, 5).finish(680);
  }),

  level({ ...D, id: 38, name: "Lightning Run", chase: { ratio: 0.9, lead: 250 }, intro: "No time to think. Pure flow." }, (b) => {
    b.roof(900).vault(260).bar(480, 90).post(740).coins(500, 3, 34, 14);
    b.gap(340).roof(560, -60).coin(-170, 200).curtain(280).coins(260, 2, 34, 14);
    b.gap(180).crumble(240, 30).gap(140).crumble(240, -40).coins(60, 3);
    b.gap(200).roof(700, 60).cp(60).spring(300).coin(380, 220);
    b.gap(0).roof(500, -220).beam(160, 48, 180).coins(180, 4, 34, 14);
    b.gap(180).mover(200, 80, { ax: 110, period: 2.4, phase: 1 }).coin(100, 40);
    b.gap(180).roof(800, -40).cp(60).post(240).vault(460).curtain(660).coins(300, 3);
    b.gap(380).roof(600, 120).coin(-190, 180).bar(200, 100).coins(210, 3, 34, 14);
    b.gap(300).roof(700, -60).coins(150, 5).finish(580);
  }),

  level({ ...D, id: 39, name: "The Spire", chase: { ratio: 0.84, lead: 290 }, startY: 620, intro: "Straight up the Spire. Don't look down." }, (b) => {
    b.roof(800).coins(200, 3);
    b.block(560, 640, 50, 520).wall(740, 320, 60).coin(670, 160);
    b.gap(0).roof(500, -320).cp(60).spring(300).coin(380, 220);
    b.gap(0).roof(500, -230).coins(100, 3);
    b.gap(60).mover(240, 100, { ay: 130, period: 3 }).coin(120, 60);
    b.gap(60).roof(700, -220).cp(60).block(380, 680, 50, 560).wall(560, 360, 200).coin(490, 160).coin(490, 280);
    b.gap(0).roof(500, -360).curtain(240).coins(220, 2, 34, 14);
    b.gap(0).roof(420, -180).ledge(200, 120, 160).coins(220, 3, 34, 150);
    b.gap(300).roof(800, 260).coins(150, 5).finish(680);
  }),

  level({ ...D, id: 40, name: "Final Escape", chase: { ratio: 0.9, lead: 250 }, intro: "The helipad is at the end of the skyline. Everything, one last time." }, (b) => {
    b.roof(900).vault(260).curtain(520).post(760).coins(520, 2, 34, 14);
    b.gap(360).roof(600, -40).coin(-180, 210).beam(200, 48, 160).coins(220, 4, 34, 14);
    b.gap(180).mover(200, 20, { ax: 110, period: 2.6, phase: 0.4 }).coin(100, 40);
    b.gap(180).roof(820, -20).cp(60).block(420, 660, 50, 540).wall(600, 340, 220).coin(530, 160);
    b.gap(0).roof(600, -340).post(200).bar(400, 100).coins(410, 3, 34, 14);
    b.gap(100).crumble(200, 20).gap(100).crumble(200, -30).gap(100).crumble(200, 40);
    b.gap(180).roof(800, 60).cp(60).coins(100, 2);
    gate(b, 460, 0.6);
    b.spring(640).coin(720, 220);
    b.gap(0).roof(500, -220).curtain(260, 34, 300, { mx: 60, mperiod: 2 }).coins(120, 2);
    b.gap(380).roof(600, 180).cp(60).coin(-190, 200).laser(300, 240, 10, { w: 200, my: 100, mperiod: 2.2 }).coins(150, 3);
    b.gap(260).roof(900, 40).coins(150, 6).finish(760);
  }),
];
