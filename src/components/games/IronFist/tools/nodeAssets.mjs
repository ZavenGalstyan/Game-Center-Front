/**
 * Headless (Node) loader for the bundled CC0 GLBs — textures stripped (Node has
 * no image decoder). Used by the clip / rig tests in tools/.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

globalThis.self ??= globalThis;
globalThis.ProgressEvent ??= class extends Event {};

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../public/models/neon-mercenary");

function readGlb(name) {
  const buf = fs.readFileSync(path.join(DIR, name));
  const jLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jLen).toString());
  const bin = buf.subarray(28 + jLen);
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
  return { json, bin };
}

export async function loadGlb(name) {
  const { json, bin } = readGlb(name);
  json.buffers = [{ byteLength: bin.length, uri: "data:application/octet-stream;base64," + Buffer.from(bin).toString("base64") }];
  return new Promise((res, rej) => new GLTFLoader().parse(JSON.stringify(json), "", res, rej));
}

/** { bodies:{m,f}, anims } */
export async function loadNodeAssets() {
  const [m, f, anims] = await Promise.all([loadGlb("male.glb"), loadGlb("female.glb"), loadGlb("anims.glb")]);
  return { bodies: { m, f }, anims: anims.animations };
}
