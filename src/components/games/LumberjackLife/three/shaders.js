/**
 * Lumberjack Life — small shader patches shared by world materials.
 *
 *  windPatch   sways foliage/grass by world position, height-weighted
 *  cutPatch    blends bark toward fresh wood where the notch is (aCut attr)
 *
 * One `uniforms.uTime` object is shared by every patched material, so the
 * whole forest animates from a single per-frame write.
 */
import * as THREE from "three";

export const WORLD_UNIFORMS = {
  uTime: { value: 0 },
  uWind: { value: 1 },
};

/**
 * @param heightRef local-space height over which sway ramps 0→1
 * @param amp metres of sway at full height
 */
export function windPatch(material, { heightRef = 6, amp = 0.12, base = 0 } = {}) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    shader.uniforms.uTime = WORLD_UNIFORMS.uTime;
    shader.uniforms.uWind = WORLD_UNIFORMS.uWind;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uWind;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        {
          vec4 wpos = modelMatrix * vec4(position, 1.0);
          #ifdef USE_INSTANCING
            wpos = modelMatrix * instanceMatrix * vec4(position, 1.0);
          #endif
          float hk = clamp((position.y - ${base.toFixed(3)}) / ${heightRef.toFixed(3)}, 0.0, 1.0);
          hk *= hk;
          float ph = wpos.x * 0.21 + wpos.z * 0.17;
          float sway = sin(uTime * 1.35 + ph) * 0.65 + sin(uTime * 2.7 + ph * 2.3) * 0.25 + sin(uTime * 5.1 + ph * 4.1 + position.x * 3.0) * 0.1;
          transformed.x += sway * ${amp.toFixed(3)} * hk * uWind;
          transformed.z += cos(uTime * 1.1 + ph * 1.3) * ${(amp * 0.6).toFixed(3)} * hk * uWind;
        }`,
      );
  };
  material.customProgramCacheKey = () => `wind:${heightRef}:${amp}:${base}`;
  return material;
}

/** bark material whose `aCut` vertex attribute (0..1) reveals fresh wood */
export function cutPatch(material, woodColor) {
  const col = new THREE.Color(woodColor);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWood = { value: col };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aCut;\nvarying float vCut;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCut = aCut;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uWood;\nvarying float vCut;")
      .replace("#include <map_fragment>", "#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uWood, smoothstep(0.15, 0.6, vCut));");
  };
  material.customProgramCacheKey = () => "cut";
  return material;
}
