/**
 * District 1 — Harbor Rooftops. Warehouse roofs at dusk; teaches jump, vault,
 * slide, climb and (L8) the wall jump. No double jump. Hunter from L3.
 */
import { level } from "../engine/level.js";

const D = { district: 0, run: 360 };

export default [
  level({ ...D, id: 1, name: "Rooftop Run", chase: false, weather: "dusk", intro: "You run automatically. Time your jumps over the gaps." }, (b) => {
    b.roof(760).hint(140, "Press {jump} to jump the gaps").coins(300, 4);
    b.gap(110).roof(520).coins(140, 4);
    b.gap(140).roof(480).arc(440, 4);
    b.gap(150).roof(640, -30).hint(60, "Hold {jump} longer to jump higher").coins(200, 5);
    b.gap(170).roof(520, 40).coins(120, 3).cp(60);
    b.gap(120).roof(460, -50).coins(150, 3);
    b.gap(180).roof(560).arc(520, 4);
    b.gap(190).roof(700, 30).coins(160, 5).finish(560);
  }),

  level({ ...D, id: 2, name: "Duck & Vault", chase: false, weather: "dusk", intro: "Crates are vaulted on their own. Slide under the low ducts." }, (b) => {
    b.roof(900).hint(180, "Run at low crates to vault them").vault(420).coins(560, 4);
    b.gap(120).roof(760).hint(40, "Press {slide} to slide under ducts").bar(380, 110).coins(380, 3, 34, 14);
    b.gap(140).roof(700).vault(200).bar(480, 90).coins(250, 2, 34, 60);
    b.gap(150).roof(620, -40).cp(60).vault(300, 42).coins(400, 3);
    b.gap(130).roof(820, 30).bar(150, 140).vault(470).bar(640, 80).coins(170, 3, 34, 14);
    b.gap(170).roof(640).coins(120, 4).vault(380).arc(600, 4);
    b.gap(180).roof(560).bar(220, 160).coins(240, 4, 34, 14).finish(470);
  }),

  level({ ...D, id: 3, name: "Ledge Climb", chase: { ratio: 0.84, lead: 300 }, weather: "dusk", intro: "Something is following you. Keep moving — run into ledges to climb them." }, (b) => {
    b.roof(820).hint(100, "The Hunter is on your trail — don't stop!").wall(560, 70).coins(600, 3, 34, 98);
    b.gap(120).roof(600, -80).hint(10, "Jump at higher roofs — you'll pull yourself up").coins(160, 4);
    b.gap(140).roof(560, -60).wall(300, 88).coins(330, 3, 34, 116);
    b.gap(110).roof(540, -40).cp(60).coins(200, 4);
    b.gap(160).roof(500, 90).vault(240).coins(360, 3);
    b.gap(130).roof(620, -110).wall(380, 90, 60).coins(150, 3);
    b.gap(150).roof(580, -60).bar(260, 120).coins(270, 3, 34, 14);
    b.gap(140).roof(640, -90).coins(200, 4).finish(520);
  }),

  level({ ...D, id: 4, name: "Long Drop", chase: { ratio: 0.86, lead: 280 }, weather: "dusk", startY: 200, intro: "Down to the docks. Bigger gaps — jump from the very edge." }, (b) => {
    b.roof(700).coins(260, 4);
    b.gap(220).roof(520, 90).coins(120, 4);
    b.gap(240).roof(480, 110).arc(440, 5);
    b.gap(200).roof(600, -40).cp(80).vault(300).coins(420, 3);
    b.gap(260).roof(520, 140).coins(140, 4);
    b.gap(230).roof(440, -60).arc(400, 5);
    b.gap(250).roof(560, 120).bar(260, 100).coins(270, 3, 34, 14);
    b.gap(220).roof(500, -70).cp(60).coins(200, 3);
    b.gap(270).roof(520, 130).coins(150, 4);
    b.gap(240).roof(700, -20).coins(200, 5).finish(560);
  }),

  level({ ...D, id: 5, name: "Harbor Rhythm", chase: { ratio: 0.88, lead: 260 }, weather: "dusk", intro: "Vault, slide, jump — find the beat." }, (b) => {
    b.roof(1100).vault(300).bar(560, 80).vault(820).coins(400, 4, 34, 28);
    b.gap(150).roof(900).bar(160, 80).vault(420).bar(640, 80).coins(250, 3, 34, 14);
    b.gap(160).roof(700, -50).cp(60).vault(250).vault(480).coins(330, 3, 34, 60);
    b.gap(170).roof(820, 40).bar(120, 90).bar(420, 90).vault(680).coins(560, 3, 34, 28);
    b.gap(190).roof(760, -60).wall(260, 80).bar(520, 100).coins(540, 3, 34, 14);
    b.gap(160).roof(640, 50).cp(40).vault(240).arc(600, 4);
    b.gap(200).roof(900).bar(140, 70).vault(380).bar(560, 70).vault(780).coins(150, 2, 34, 14).finish(860);
  }),

  level({ ...D, id: 6, name: "Scaffold Hop", chase: { ratio: 0.88, lead: 260 }, weather: "dusk", intro: "Builders left their scaffolding up. Hop the planks." }, (b) => {
    b.roof(700).coins(300, 4);
    b.gap(150).plat(200, -40).coin(100, 40);
    b.gap(150).plat(180, -50).coin(90, 40);
    b.gap(160).plat(220, 30).coin(110, 40);
    b.gap(140).roof(600, 60).cp(60).vault(320).coins(420, 3);
    b.gap(170).plat(160, -70).coin(80, 40);
    b.gap(170).plat(160, -40).coin(80, 40);
    b.gap(170).plat(240, 90).ledge(80, 110, 90).coins(90, 2, 34, 150);
    b.gap(160).roof(620, 20).cp(60).bar(320, 100).coins(330, 3, 34, 14);
    b.gap(180).plat(150, -60).gap(160).plat(150, -30).gap(170).plat(150, 60);
    b.gap(160).roof(700, 20).coins(180, 5).finish(560);
  }),

  level({ ...D, id: 7, name: "Crane Line", chase: { ratio: 0.88, lead: 260 }, weather: "dusk", intro: "Tall walls: jump first, then climb the top." }, (b) => {
    b.roof(900).hint(300, "Jump at tall walls to climb over them").wall(560, 140, 60).coins(400, 3);
    b.gap(1).roof(500, -140).coins(140, 4);
    b.gap(150).roof(800, 80).wall(300, 170, 60).coins(150, 3).coin(330, 210);
    b.gap(1).roof(420, -170).cp(40).coins(120, 3);
    b.gap(200).roof(700, 120).ledge(240, 120, 120).ledge(440, 220, 120).coins(270, 3, 34, 150).coins(470, 3, 34, 250);
    b.gap(160).roof(600, -120).wall(320, 120, 60).coins(120, 3);
    b.gap(1).roof(500, -120).cp(60).coins(180, 4);
    b.gap(220).roof(800, 160).wall(260, 190, 60).coins(500, 4).finish(700);
  }),

  level({ ...D, id: 8, name: "Chimney Climb", chase: { ratio: 0.86, lead: 290 }, weather: "dusk", intro: "Between two walls? Jump from one to the other to climb." }, (b) => {
    b.roof(760).hint(250, "Jump into the wall, then press {jump} again to wall-jump").coins(200, 4);
    // shaft 1: overhang on the left, tall wall on the right
    b.block(560, 640, 50, 520).wall(740, 330, 60).coins(670, 1, 0, 160);
    b.gap(0).roof(520, -330).cp(60).coins(160, 4);
    b.gap(150).roof(820, 120).block(400, 640, 50, 520).wall(580, 300, 240).coin(510, 120).coin(510, 230);
    b.gap(0).roof(560, -300).coins(140, 4);
    b.gap(160).roof(600, 100).cp(40).vault(260).coins(380, 3);
    b.gap(150).roof(820, 40).block(440, 680, 50, 560).wall(620, 360, 200).coin(550, 150).coin(550, 280);
    b.gap(0).roof(640, -360).coins(180, 5).finish(540);
  }),

  level({ ...D, id: 9, name: "Rain Sprint", chase: { ratio: 0.9, lead: 250 }, weather: "rain", intro: "Rain on the tin roofs. Fast and slippery — stay sharp." }, (b) => {
    b.roof(800).bar(400, 90).coins(140, 3).coins(420, 2, 34, 14);
    b.gap(200).roof(600, 60).vault(200).arc(560, 4);
    b.gap(230).roof(560, -40).bar(160, 120).wall(420, 80).coins(180, 3, 34, 14);
    b.gap(210).roof(700, 70).cp(40).vault(240).bar(440, 120).coins(460, 3, 34, 14);
    b.gap(250).roof(480, 100).coins(120, 4);
    b.gap(180).plat(200, -80).gap(180).plat(200, -40).coin(100, 40);
    b.gap(200).roof(760, 60).cp(40).bar(200, 80).vault(420).bar(600, 80).coins(230, 2, 34, 14);
    b.gap(240).roof(560, -60).wall(300, 90).coins(330, 3, 34, 118);
    b.gap(260).roof(700, 120).coins(160, 5).finish(580);
  }),

  level({ ...D, id: 10, name: "Dockside Escape", chase: { ratio: 0.9, lead: 240 }, weather: "rain", intro: "The harbor's last stretch. Everything you've learned." }, (b) => {
    b.roof(900).vault(320).bar(560, 100).coins(580, 3, 34, 14);
    b.gap(220).roof(700, 80).wall(400, 140, 60).coins(150, 3);
    b.gap(1).roof(500, -140).coins(160, 4);
    b.gap(180).plat(180, 40).gap(170).plat(180, -30).coin(90, 40);
    b.gap(160).roof(820, 50).cp(40).block(420, 660, 50, 540).wall(600, 320, 220).coin(530, 160);
    b.gap(0).roof(600, -320).bar(260, 110).coins(270, 3, 34, 14);
    b.gap(260).roof(560, 150).vault(220).arc(520, 4);
    b.gap(230).roof(700, -50).cp(60).wall(300, 90).bar(520, 80).coins(140, 3);
    b.gap(200).plat(160, -60).gap(190).plat(160, 40).gap(180).roof(640, 20).coins(160, 4);
    b.gap(250).roof(800, 100).vault(200).bar(420, 120).coins(600, 4).finish(720);
  }),
];
