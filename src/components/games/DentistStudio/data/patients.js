/**
 * Dentist Studio — original fictional patients.
 *
 * Generic first names only; every look is built from parts (face shape,
 * hair, skin, outfit, accessory) by <PatientFigure>, so nobody resembles a
 * real or recognisable character.
 */

const SKIN = {
  s1: { skin: "#f7d7c0", shade: "#e8b99c", lip: "#e59a98", blush: "#f4a9a4" },
  s2: { skin: "#efc3a0", shade: "#dca47f", lip: "#dc8f89", blush: "#ee9f93" },
  s3: { skin: "#dca77f", shade: "#c68b62", lip: "#c97a74", blush: "#e08f7c" },
  s4: { skin: "#c68b5f", shade: "#a8704a", lip: "#b56a62", blush: "#cf7d66" },
  s5: { skin: "#a36b45", shade: "#865434", lip: "#94574f", blush: "#b8694f" },
  s6: { skin: "#7f5033", shade: "#673f27", lip: "#7a4642", blush: "#98553f" },
};

export const PATIENTS = {
  mia: { name: "Mia", age: "child", tone: "s2", face: "round", hair: { style: "pigtails", color: "#8a4b2a" }, eyes: "#4a3426", outfit: "#7fd4c1", accessory: "clip" },
  leo: { name: "Leo", age: "child", tone: "s4", face: "round", hair: { style: "curly", color: "#2b1d16" }, eyes: "#3a2618", outfit: "#ffb870", accessory: null },
  sofia: { name: "Sofia", age: "adult", tone: "s3", face: "oval", hair: { style: "long", color: "#3b2418" }, eyes: "#5a3a22", outfit: "#c9a7ef", accessory: "earrings" },
  noah: { name: "Noah", age: "teen", tone: "s1", face: "oval", hair: { style: "short", color: "#c89c5a" }, eyes: "#4a6a8a", outfit: "#8ecbf0", accessory: "freckles" },
  ava: { name: "Ava", age: "adult", tone: "s5", face: "heart", hair: { style: "afro", color: "#1e1410" }, eyes: "#2e1c12", outfit: "#f7a1b5", accessory: "earrings" },
  omar: { name: "Omar", age: "adult", tone: "s4", face: "square", hair: { style: "short", color: "#1c1411" }, eyes: "#3a2618", outfit: "#9ad8a8", accessory: "beard" },
  priya: { name: "Priya", age: "adult", tone: "s4", face: "oval", hair: { style: "bun", color: "#1d1512" }, eyes: "#3b2618", outfit: "#ffd27a", accessory: "earrings" },
  jonah: { name: "Jonah", age: "senior", tone: "s2", face: "square", hair: { style: "side", color: "#cfd3d8" }, eyes: "#5a6e7e", outfit: "#a9c1ec", accessory: "glasses" },
  hana: { name: "Hana", age: "teen", tone: "s1", face: "heart", hair: { style: "bob", color: "#231a1a" }, eyes: "#3a2a24", outfit: "#ffb3c7", accessory: "headband" },
  mateo: { name: "Mateo", age: "adult", tone: "s3", face: "square", hair: { style: "wavy", color: "#3a2518" }, eyes: "#4a3020", outfit: "#86c5e8", accessory: null },
  zara: { name: "Zara", age: "teen", tone: "s6", face: "oval", hair: { style: "puffs", color: "#17100d" }, eyes: "#2a1a10", outfit: "#b6e3a0", accessory: "headband" },
  eli: { name: "Eli", age: "adult", tone: "s1", face: "oval", hair: { style: "wavy", color: "#a8552c" }, eyes: "#4b7a5a", outfit: "#f5c07a", accessory: "glasses" },
  nora: { name: "Nora", age: "senior", tone: "s3", face: "round", hair: { style: "bun", color: "#e4e1dc" }, eyes: "#5b4636", outfit: "#d6b4f0", accessory: "glasses" },
  kai: { name: "Kai", age: "teen", tone: "s3", face: "square", hair: { style: "spiky", color: "#1e1814" }, eyes: "#3a2a1e", outfit: "#7ecfd6", accessory: null },
  lucia: { name: "Lucia", age: "adult", tone: "s2", face: "heart", hair: { style: "long", color: "#6a3a1f" }, eyes: "#5a3e22", outfit: "#9fe0c8", accessory: "earrings" },
  ben: { name: "Ben", age: "senior", tone: "s5", face: "square", hair: { style: "bald", color: "#bfbab4" }, eyes: "#2e1c12", outfit: "#f0b08a", accessory: "beard" },
  amara: { name: "Amara", age: "child", tone: "s6", face: "round", hair: { style: "puffs", color: "#1a120e" }, eyes: "#2a1a10", outfit: "#ffd86b", accessory: "clip" },
  theo: { name: "Theo", age: "child", tone: "s1", face: "round", hair: { style: "curly", color: "#d9a55a" }, eyes: "#5a7ea0", outfit: "#a3c8ff", accessory: "freckles" },
  yuki: { name: "Yuki", age: "adult", tone: "s1", face: "oval", hair: { style: "bob", color: "#2a1f24" }, eyes: "#3b2a24", outfit: "#f3b6d9", accessory: null },
  sam: { name: "Sam", age: "adult", tone: "s3", face: "oval", hair: { style: "short", color: "#6b4a30" }, eyes: "#4a3020", outfit: "#b3b8f5", accessory: "glasses" },
  rosa: { name: "Rosa", age: "senior", tone: "s4", face: "heart", hair: { style: "wavy", color: "#d8d4d0" }, eyes: "#3b2618", outfit: "#f6a6a0", accessory: "earrings" },
  felix: { name: "Felix", age: "teen", tone: "s2", face: "oval", hair: { style: "side", color: "#8a5a32" }, eyes: "#4a6a4a", outfit: "#ffcf91", accessory: null },
  iris: { name: "Iris", age: "adult", tone: "s5", face: "oval", hair: { style: "long", color: "#231712" }, eyes: "#2e1c12", outfit: "#a6e6e0", accessory: "headband" },
  malik: { name: "Malik", age: "adult", tone: "s6", face: "square", hair: { style: "short", color: "#120c0a" }, eyes: "#24160e", outfit: "#ffc27d", accessory: "beard" },
  grace: { name: "Grace", age: "child", tone: "s3", face: "heart", hair: { style: "ponytail", color: "#4a2a18" }, eyes: "#3e2a1c", outfit: "#e6b3ff", accessory: "clip" },
};

export function getPatient(id) {
  const p = PATIENTS[id] || PATIENTS.mia;
  return { id, ...p, ...SKIN[p.tone] };
}
