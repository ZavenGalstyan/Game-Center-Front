/**
 * DEV-only browser shortcuts on top of harness.mjs (page opened with
 * `?drwtest=1&nosave=1`):
 *   const F = await import('/src/components/games/DollRepairWorkshop/tools/flow.mjs');
 *   await F.boot()                 // mount + rich test save (level 25, money)
 *   await F.order(24, 'inspected') // meet → accept → (inspect+shop)
 *   await F.finish()               // bot completes every task (session API)
 *   await F.deliver()              // UI: Repairs done → Deliver → See results
 * Each step drives the real React UI where a button exists.
 */
export async function boot({ rich = true } = {}) {
  if (!window.__drw || !document.querySelector(".drw")) await (await import("./harness.mjs")).setup();
  if (rich) {
    const sv = window.__drw.save();
    sv.level = 25;
    sv.money = 99999;
  }
  return "booted";
}
const y2 = async () => {
  await window.__y();
  await window.__y();
};
export async function order(id, stage = "accepted", skill = 0.92) {
  await boot();
  const D = window.__drw;
  D.meet(id);
  await y2();
  D.advance(20);
  window.__click("Accept job");
  await y2();
  D.advance(20);
  const { makeBot } = await import("./bot.mjs");
  const s = D.session();
  window.__bot = makeBot(s, { skill });
  if (stage === "inspected" || stage === "done") {
    window.__bot.inspect();
    window.__bot.shop(D.save());
    await y2();
  }
  if (stage === "done") await finish();
  D.advance(10);
  return s.tasks.map((t) => `${t.id}:${t.done ? "done" : "open"}`);
}
export async function finish() {
  const D = window.__drw;
  const s = D.session();
  const out = window.__bot.play(D.save(), { submit: false });
  D.advance(10);
  await y2();
  return out;
}
export async function deliver() {
  const D = window.__drw;
  window.__click("Repairs done");
  await y2();
  D.advance(5);
  window.__click("Deliver to");
  await y2();
  D.advance(60);
  window.__click("See results");
  await y2();
  D.advance(200);
  await y2();
  return D.screen();
}
