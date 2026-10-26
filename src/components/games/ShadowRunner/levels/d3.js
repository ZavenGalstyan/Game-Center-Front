/**
 * District 3 — Ironworks. Foundry roofs in ember smoke: sliding gantries,
 * freight lifts, rotten roofs that collapse, smokestack wall-jump shafts.
 * Double jump available throughout.
 */
import { level } from "../engine/level.js";

const D = { district: 2, run: 390, airJumps: 1, weather: "embers" };

export default [
  level({ ...D, id: 21, name: "Gantry Glide", chase: { ratio: 0.84, lead: 290 }, intro: "Sliding gantries cross the gaps. Ride them over." }, (b) => {
    b.roof(900).hint(260, "Moving gantries — hold {brake} to wait for them").coins(200, 4);
    b.gap(160).mover(200, 0, { ax: 110, period: 2.8 }).coin(100, 40);
    b.gap(160).roof(700).cp(60).coins(200, 3);
    b.gap(170).mover(180, -30, { ax: 120, period: 2.6, phase: 1 }).coin(90, 40);
    b.gap(170).mover(180, -30, { ax: 120, period: 2.6, phase: 2.4 }).coin(90, 40);
    b.gap(170).roof(700, 40).cp(60).post(380).coins(150, 3);
    b.gap(180).mover(220, 0, { ax: 130, period: 3, phase: 0.5 }).coin(110, 40);
    b.gap(180).roof(800, -20).coins(150, 5).finish(680);
  }),

  level({ ...D, id: 22, name: "Rotten Roofs", chase: { ratio: 0.88, lead: 270 }, intro: "Cracked roofs give way under you. Don't linger." }, (b) => {
    b.roof(800).hint(300, "Cracked roofs collapse — keep moving!").coins(200, 3);
    b.gap(120).crumble(240).coins(60, 3);
    b.gap(120).crumble(240, -30).coins(60, 3);
    b.gap(140).roof(600, 30).cp(60).vault(300).coins(400, 3);
    b.gap(100).crumble(200).gap(100).crumble(200, -40).gap(100).crumble(200, -40).coins(40, 3);
    b.gap(140).roof(700, 80).cp(60).bar(300, 100).coins(310, 3, 34, 14);
    b.gap(120).crumble(420, 0, 0.6).post(220).coins(60, 2).coins(320, 2);
    b.gap(160).crumble(220, -50).gap(160).crumble(220, 50).coins(60, 3);
    b.gap(160).roof(700).coins(150, 5).finish(580);
  }),

  level({ ...D, id: 23, name: "Freight Lift", chase: { ratio: 0.8, lead: 300 }, intro: "Freight lifts carry you up. Jump off at the top." }, (b) => {
    b.roof(800).hint(300, "Ride the lift up — hold {brake} to stay on it").coins(200, 3);
    b.gap(40).mover(240, -60, { ay: 110, period: 2.8 }).coin(120, 60);
    b.gap(40).roof(600, -170).cp(60).coins(150, 4);
    b.gap(60).mover(240, 120, { ay: 140, period: 3.2, phase: 1.5 }).coin(120, 60);
    b.gap(40).roof(560, -230).post(300).coins(150, 3);
    b.gap(220).roof(600, 200).cp(60).vault(260).coins(380, 3);
    b.gap(40).mover(260, -80, { ay: 130, period: 3, phase: 0.4 }).coin(130, 60);
    b.gap(40).roof(800, -180).coins(150, 5).finish(680);
  }),

  level({ ...D, id: 24, name: "Smokestacks", chase: { ratio: 0.82, lead: 300 }, intro: "Three smokestacks. Wall-jump your way over each." }, (b) => {
    b.roof(820).coins(200, 3);
    b.block(560, 660, 50, 540).wall(740, 340, 80).coin(670, 150).coin(670, 270);
    b.gap(0).roof(500, -340).cp(40).coins(180, 3);
    b.gap(180).roof(820, 150).block(420, 700, 50, 580).wall(600, 400, 220).coin(530, 160).coin(530, 300);
    b.gap(0).roof(500, -400).cp(40).post(260).coins(120, 2);
    b.gap(200).roof(840, 180).block(440, 760, 50, 640).wall(620, 460, 220).coin(550, 170).coin(550, 330);
    b.gap(0).roof(700, -460).coins(150, 5).finish(580);
  }),

  level({ ...D, id: 25, name: "Collapse Run", chase: { ratio: 0.9, lead: 260 }, intro: "The whole block is coming down. Run!" }, (b) => {
    b.roof(700).coins(200, 3);
    b.gap(100).crumble(180).gap(90).crumble(180, -30).gap(90).crumble(180, -30).gap(90).crumble(180, 40).coins(40, 3);
    b.gap(120).roof(500, 40).cp(40).spring(300).coin(380, 200);
    b.gap(0).crumble(260, -180).gap(120).crumble(260).coins(80, 3);
    b.gap(140).roof(600, 120).cp(40).curtain(300).coins(280, 2, 34, 14);
    b.gap(100).crumble(160, -40).gap(100).crumble(160, -40).gap(100).crumble(160, -40).gap(100).crumble(160, 60);
    b.gap(140).roof(600, 60).coins(150, 5).finish(480);
  }),

  level({ ...D, id: 26, name: "Conveyor Lasers", chase: { ratio: 0.85, lead: 290 }, intro: "Gantries and laser posts. Pick your moment." }, (b) => {
    b.roof(900).post(400).coins(450, 3);
    b.gap(170).mover(240, 0, { ax: 120, period: 2.6 }).coin(120, 40);
    b.gap(170).roof(700, -30).cp(60).curtain(260).post(500).coins(250, 2, 34, 14);
    b.gap(190).mover(200, -40, { ax: 130, period: 2.8, phase: 1.2 }).coin(100, 40);
    b.gap(190).roof(560, -40).beam(200, 36, 140).coins(210, 3, 34, 110);
    b.gap(60).mover(240, 60, { ay: 120, period: 2.8, phase: 0.6 }).coin(120, 60);
    b.gap(60).roof(700, -160).cp(60).post(240).post(480).coins(320, 2);
    b.gap(200).mover(220, 40, { ax: 130, period: 3, phase: 2 }).coin(110, 40);
    b.gap(200).roof(700).coins(150, 5).finish(580);
  }),

  level({ ...D, id: 27, name: "Furnace Gate", chase: { ratio: 0.8, lead: 300 }, intro: "Furnace vents flare in cycles. Some floors won't wait for you." }, (b) => {
    const gate = (at, phase) => b.laser(at, 440, 440, { w: 12, on: 0.7, off: 0.8, phase });
    b.roof(900).coins(200, 3);
    gate(620, 0.2);
    b.gap(140).roof(600).coins(150, 3);
    b.gap(120).crumble(240).coins(60, 3);
    b.gap(140).roof(800, -30).cp(60).coins(120, 2);
    gate(420, 1.1);
    b.gap(120).crumble(200, 30).gap(120).crumble(200, -40);
    b.gap(140).roof(900, -20).cp(60).coins(100, 3);
    gate(360, 0.5);
    gate(620, 1.2);
    b.gap(180).roof(700, 40).coins(150, 5).finish(580);
  }),

  level({ ...D, id: 28, name: "Twin Chimneys", chase: { ratio: 0.82, lead: 300 }, intro: "Fell between two buildings? Wall-jump back out." }, (b) => {
    b.roof(800).hint(300, "Wall-jump between building walls to climb").coins(200, 3);
    b.gap(130).roof(500, -240).coins(150, 3).coin(-65, 140);
    b.gap(120).roof(600, -200).cp(60).coin(-60, 120).coins(160, 3);
    b.gap(200).roof(820, 300).block(420, 700, 50, 580).wall(600, 380, 220).coin(530, 160).coin(530, 280);
    b.gap(0).roof(500, -380).cp(40).coins(150, 3);
    b.gap(130).roof(560, -220).coin(-65, 160).coins(160, 3);
    b.gap(220).roof(700, 200).coins(150, 5).finish(580);
  }),

  level({ ...D, id: 29, name: "Molten Line", chase: { ratio: 0.86, lead: 280 }, intro: "Every trick the foundry knows." }, (b) => {
    b.roof(800).vault(300).post(560).coins(380, 2, 34, 80);
    b.gap(170).mover(220, 0, { ax: 110, period: 2.6, phase: 0.8 }).coin(110, 40);
    b.gap(170).crumble(260, -30).coins(60, 3);
    b.gap(120).roof(700, -40).cp(60).block(380, 640, 50, 520).wall(560, 320, 140).coin(490, 160);
    b.gap(0).roof(500, -320).curtain(240).coins(220, 2, 34, 14);
    b.gap(60).mover(240, 120, { ay: 120, period: 2.8 }).coin(120, 60);
    b.gap(60).roof(600, -200).cp(60).spring(300).coin(380, 220);
    b.gap(0).crumble(300, -200).coins(80, 3);
    b.gap(200).roof(800, 260).beam(240, 48, 160).coins(250, 4, 34, 14).finish(700);
  }),

  level({ ...D, id: 30, name: "Ironworks Escape", chase: { ratio: 0.88, lead: 270 }, intro: "The furnace is blowing. Get out of the Ironworks." }, (b) => {
    b.roof(900).bar(300, 120).post(600).coins(320, 3, 34, 14);
    b.gap(100).crumble(200, -30).gap(100).crumble(200, -30).coins(40, 3);
    b.gap(180).mover(220, 30, { ax: 120, period: 2.6 }).coin(110, 40);
    b.gap(180).roof(700, 0).cp(60).laser(420, 440, 440, { w: 12, on: 0.7, off: 0.8, phase: 0.3 }).coins(150, 3);
    b.gap(60).mover(240, 100, { ay: 130, period: 3 }).coin(120, 60);
    b.gap(60).roof(800, -220).cp(60).block(420, 680, 50, 560).wall(600, 360, 200).coin(530, 160).coin(530, 280);
    b.gap(0).roof(600, -360).post(240).curtain(440).coins(420, 2, 34, 14);
    b.gap(340).roof(600, 200).spring(300).coin(380, 220);
    b.gap(0).crumble(320, -220).gap(160).roof(800, 240).coins(150, 5).finish(680);
  }),
];
