/**
 * Headless (Node) loader for the bundled GLBs — textures stripped, since Node
 * has no image decoder. Used by modelTest.mjs and the clip tooling.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

globalThis.self ??= globalThis;
globalThis.ProgressEvent ??= class extends Event {};

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../public/models/mma");

export function readGlb(name, { stripImages = true } = {}) {
  const buf = fs.readFileSync(path.join(DIR, name));
  const jLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jLen).toString());
  const bin = buf.subarray(28 + jLen);
  if (stripImages) {
    delete json.images;
    delete json.textures;
    delete json.samplers;
    for (const m of json.materials || []) {
      delete m.normalTexture;
      if (m.pbrMetallicRoughness) {
        delete m.pbrMetallicRoughness.baseColorTexture;
        delete m.pbrMetallicRoughness.metallicRoughnessTexture;
      }
    }
  }
  return { json, bin };
}

export async function loadGlb(name) {
  const { json, bin } = readGlb(name);
  json.buffers = [{ byteLength: bin.length, uri: "data:application/octet-stream;base64," + Buffer.from(bin).toString("base64") }];
  return new Promise((res, rej) => new GLTFLoader().parse(JSON.stringify(json), "", res, rej));
}

/** { fighter, clips, darkTex:null } shaped like render/assets.js output. */
export async function loadNodeAssets({ authored = true } = {}) {
  const [fighter, anims] = await Promise.all([loadGlb("fighter.glb"), loadGlb("anims.glb")]);
  const clips = {};
  anims.animations.forEach((c) => (clips[c.name] = c));
  if (authored) {
    const { buildAuthoredClips } = await import("../render/clips.js");
    Object.assign(clips, buildAuthoredClips(fighter.scene));
  }
  return { fighter, clips, darkTex: null };
}
