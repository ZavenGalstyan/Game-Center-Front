/**
 * World 3 — OCEAN SKYWAY (levels 3-1 … 3-6). Island hops, floating bridges,
 * dash hoops over open sea, long rails and half loops; fly bots everywhere.
 * The boss is the Hydro Wing in a 2.5D arena over the water.
 */
import { createBuilder } from "../../engine/builder.js";
import * as K from "./kit.js";

export function coralCoast(meta) {
  const L = createBuilder(meta);
  L.moveTo(0, 0, 0, Math.PI / 2);
  L.spawn({ side: true, zone: 0 });
  L.side({ openStart: false }, (S) => {
    K.sRun(S, 16, { enemy: "fly" });
    K.sPit(S, 6);
    K.sLedge(S, { star: true });
    K.sDash(S, { w: 18 });
    S.checkpoint(2);
    K.sHill(S, 20, 2.2, { enemy: "fly" });
    K.sRun(S, 10, { monitor: "shield" });
  });
  K.fRun(L, 14);
  K.fIslands(L, { n: 4, star: true });
  K.fCurve(L, -60, 32);
  L.checkpoint(3, 0);
  K.fRails(L, { count: 2, star: true, curve: 30, dh: -3, len: 56 });
  K.fRun(L, 10);
  L.goal();
  return L.done();
}

export function bridgeBreeze(meta) {
  const L = createBuilder(meta);
  L.moveTo(0, 0, 0, 0);
  L.spawn();
  K.fRun(L, 16, { w: 9 });
  K.fCurve(L, 45, 30);
  K.fRun(L, 30, { w: 6, guard: true, enemy: "fly" });
  K.fDash(L, { gap: 15 });
  L.side({}, (S) => {
    K.sRun(S, 10);
    K.sCrumble(S, 4);
    K.sMoverPit(S, { w: 18 });
    S.checkpoint(2);
    K.sLedge(S, { star: true, h: 3.4 });
    K.sSecret(S);
    K.sRun(S, 8);
  });
  K.fRun(L, 10);
  K.fPlaza(L, { disc: true, w: 36, l: 36, enemies: ["fly", "fly", "patrol"], monitor: "magnet", starSide: 1 });
  K.fRun(L, 8);
  L.goal();
  return L.done();
}

export function tidalTubes(meta) {
  const L = createBuilder(meta);
  L.moveTo(0, 0, 0, Math.PI / 2);
  L.spawn({ side: true, zone: 0 });
  L.side({ openStart: false }, (S) => {
    K.sRun(S, 14);
    K.sLoop(S);
    K.sChaser(S);
    K.sSlope(S, { d: 6 });
    S.checkpoint(2);
    K.sSecret(S);
    K.sRun(S, 10);
  });
  K.fTunnel(L, 40);
  K.fCurve(L, 90, 30, { bank: 16 });
  K.fTunnel(L, 30, { speed: 40 });
  L.checkpoint(3, 0);
  K.fHalf(L, { r: 6 });
  K.fRails(L, { count: 2, star: true, curve: -26 });
  L.side({ openEnd: false }, (S) => {
    K.sRun(S, 10);
    K.sLedge(S, { star: true });
    S.goal(10);
    S.run(22);
  });
  return L.done();
}

export function islandHopper(meta) {
  const L = createBuilder(meta);
  L.moveTo(0, 0, 0, -Math.PI / 3);
  L.spawn();
  K.fRun(L, 12, { w: 10 });
  K.fIslands(L, { n: 3 });
  K.fPlaza(L, { disc: true, w: 34, l: 34, enemies: ["shield", "fly", "chaser"], monitor: "jump" });
  L.side({}, (S) => {
    K.sRun(S, 10);
    K.sPit(S, 7);
    K.sTurret(S);
    S.checkpoint(2);
    K.sMoverPit(S, { w: 19, period: 4 });
    K.sSecret(S, { h: 11 });
    K.sRun(S, 8);
  });
  K.fRun(L, 10);
  K.fIslands(L, { n: 3, dh: -1, star: true });
  L.checkpoint(3, 0);
  K.fDash(L, { gap: 16, dh: -3 });
  K.fRun(L, 8);
  L.goal();
  return L.done();
}

export function skywaySurge(meta) {
  const L = createBuilder(meta);
  L.moveTo(0, 0, 0, Math.PI / 2);
  L.spawn({ side: true, zone: 0 });
  L.side({ openStart: false }, (S) => {
    K.sRun(S, 14);
    K.sShield(S);
    K.sLoop(S, { drop: -5 });
    K.sCrumble(S, 4);
    S.checkpoint(2);
    K.sLift(S, { rise: 6.5 });
    K.sLedge(S, { star: true });
    K.sRun(S, 8);
  });
  K.fRun(L, 12);
  K.fRails(L, { count: 3, curve: 40, wave: 1.6, len: 60 });
  K.fCork(L);
  L.checkpoint(3, 0);
  K.fMovers(L, { gap: 20, period: 4.6 });
  K.fPlaza(L, { disc: true, w: 34, l: 34, enemies: ["turret", "fly", "chaser"], monitor: "invincible", starSide: -1 });
  L.side({ openEnd: false }, (S) => {
    K.sRun(S, 10);
    K.sDash(S, { w: 19 });
    K.sSecret(S);
    S.goal(8);
    S.run(20);
  });
  return L.done();
}

export function hydroWing(meta) {
  const L = createBuilder(meta);
  L.moveTo(0, 0, 0, 0);
  L.spawn();
  K.fRun(L, 14, { w: 10 });
  K.fIslands(L, { n: 2, star: true });
  L.side({}, (S) => {
    K.sRun(S, 12);
    K.sLedge(S, { star: true, fly: false });
    K.sSecret(S);
    S.checkpoint(4);
    K.sRun(S, 14, { rings: 0 });
  });
  K.fRun(L, 10, { rings: false });
  K.sideArena(L, "wing", { len: 50 });
  return L.done();
}
