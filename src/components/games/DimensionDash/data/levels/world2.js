/**
 * World 2 — DESERT CIRCUIT (levels 2-1 … 2-6). Golden dunes, sandstone
 * ruins, canyon ramps and corkscrews; turrets guard the ruins. The boss is
 * the Sand Scorpion in a full-3D arena.
 */
import { createBuilder } from "../../engine/builder.js";
import * as K from "./kit.js";

export function duneDash(meta) {
  const L = createBuilder(meta);
  L.moveTo(0, 0, 0, Math.PI / 2);
  L.spawn({ side: true, zone: 0 });
  L.side({ openStart: false }, (S) => {
    K.sRun(S, 16);
    K.sSlope(S, { d: 7 });
    K.sTurret(S);
    K.sPit(S, 7);
    S.checkpoint(2);
    K.sLedge(S, { star: true, fly: true });
    K.sRun(S, 10, { monitor: "rings" });
  });
  K.fRun(L, 16);
  K.fRamp(L, { gap: 13 });
  K.fCurve(L, 70, 34, { bank: 14 });
  K.fPlaza(L, { enemies: ["shield", "patrol", "chaser"], starSide: 1, monitor: "speed" });
  K.fCork(L);
  L.checkpoint(3, 0);
  K.fRun(L, 12);
  L.side({ openEnd: false }, (S) => {
    K.sRun(S, 12);
    K.sSecret(S);
    K.sSpikes(S, { before: 6, after: 22 });
    S.goal(8);
    S.run(20);
  });
  return L.done();
}

export function canyonCorkscrew(meta) {
  const L = createBuilder(meta);
  L.moveTo(0, 0, 0, 0);
  L.spawn();
  K.fRun(L, 14, { w: 10 });
  K.fCork(L, { len: 40 });
  K.fCurve(L, -80, 30);
  K.fRails(L, { count: 2, star: true, curve: 30, dh: -5 });
  L.checkpoint(3, 0);
  K.fRun(L, 10);
  L.side({}, (S) => {
    K.sRun(S, 10);
    K.sHill(S, 22, 2.6, { enemy: "shield" });
    K.sTurret(S);
    K.sLoop(S, { drop: -5 });
    S.checkpoint(2);
    K.sCrumble(S, 4);
    K.sSecret(S);
    K.sRun(S, 10);
  });
  K.fRun(L, 12);
  K.fRamp(L, { gap: 12, dh: -4 });
  K.fPlaza(L, { enemies: ["turret", "patrol", "chaser"], monitor: "shield" });
  K.fRun(L, 8);
  L.goal();
  return L.done();
}

export function ruinsRally(meta) {
  const L = createBuilder(meta);
  L.moveTo(0, 0, 0, -Math.PI / 4);
  L.spawn({ side: true, zone: 0 });
  L.side({ openStart: false }, (S) => {
    K.sRun(S, 14);
    K.sShield(S);
    K.sLift(S, { rise: 6 });
    K.sTurret(S);
    S.checkpoint(2);
    K.sMoverPit(S, { w: 17 });
    K.sLedge(S, { star: true });
    K.sRun(S, 8);
  });
  K.fRun(L, 14);
  K.fSwitch(L, { enemy: "shield" });
  K.fCurve(L, 60, 30);
  K.fTunnel(L, 32);
  L.checkpoint(3, 0);
  K.fRails(L, { count: 3, star: true, curve: -20, wave: 1.5 });
  L.side({ openEnd: false }, (S) => {
    K.sRun(S, 12);
    K.sChaser(S);
    K.sPit(S, 8);
    S.goal(10);
    S.run(22);
  });
  return L.done();
}

export function sandstormShift(meta) {
  const L = createBuilder(meta);
  L.moveTo(0, 0, 0, Math.PI);
  L.spawn();
  K.fRun(L, 12, { w: 10 });
  K.fPlaza(L, { enemies: ["chaser", "chaser", "turret"], starSide: -1, monitor: "magnet" });
  L.side({}, (S) => {
    K.sRun(S, 10);
    K.sSlope(S, { d: 9 });
    K.sLoop(S);
    S.checkpoint(2);
    K.sTurret(S);
    K.sDash(S, { w: 19 });
    K.sRun(S, 8);
  });
  K.fRun(L, 10);
  K.fHalf(L, { r: 6, left: true });
  K.fCurve(L, 50, 32);
  L.checkpoint(3, 0);
  K.fRun(L, 10);
  L.side({}, (S) => {
    K.sRun(S, 10);
    K.sSecret(S, { h: 11 });
    K.sCrumble(S, 3);
    K.sShield(S);
  });
  K.fRails(L, { count: 2, star: true, curve: 25 });
  K.fRun(L, 8);
  L.goal();
  return L.done();
}

export function mirageMesa(meta) {
  const L = createBuilder(meta);
  L.moveTo(0, 0, 0, Math.PI / 2);
  L.spawn({ side: true, zone: 0 });
  L.side({ openStart: false }, (S) => {
    K.sRun(S, 14);
    K.sHill(S, 24, 3, { enemy: "chaser" });
    K.sSpikes(S);
    K.sLedge(S, { star: true });
    S.checkpoint(2);
    K.sLift(S, { rise: 7 });
    K.sRun(S, 10);
  });
  K.fRun(L, 12);
  K.fIslands(L, { n: 3, dh: -1 });
  K.fCork(L, { left: true });
  L.checkpoint(3, 0);
  K.fMovers(L, { gap: 19 });
  K.fPlaza(L, { enemies: ["shield", "turret", "fly"], starSide: 1, monitor: "invincible" });
  K.fRamp(L, { gap: 14, dh: -4 });
  L.side({ openEnd: false }, (S) => {
    K.sRun(S, 10);
    K.sSecret(S);
    K.sTurret(S, { after: 18 });
    S.goal(10);
    S.run(22);
  });
  return L.done();
}

export function sandScorpion(meta) {
  const L = createBuilder(meta);
  L.moveTo(0, 0, 0, 0);
  L.spawn();
  K.fRun(L, 16, { w: 10 });
  L.redStar(-6, 4, 1.2);
  K.fCurve(L, 60, 26);
  L.side({}, (S) => {
    K.sRun(S, 12);
    K.sSecret(S);
    K.sRun(S, 8, { monitor: "shield" });
  });
  K.fRun(L, 10);
  L.redStar(-4, -3.5, 4.5);
  L.spring(-4, -3.5, { v: 18 });
  L.checkpoint(2, 0);
  K.fRun(L, 10, { rings: false });
  K.discArena(L, "scorpion", { r: 24 });
  return L.done();
}
