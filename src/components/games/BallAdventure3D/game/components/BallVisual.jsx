import { forwardRef } from "react";
import { BALL_RADIUS } from "../../engine/constants.js";

/**
 * The ball's visible mesh — deliberately NOT a physics child. BallController
 * drives its position/rotation manually each frame (see that file's doc
 * comment) so the visual roll always matches real displacement regardless of
 * how the locked-rotation physics body itself is oriented.
 */
const BallVisual = forwardRef(function BallVisual({ skin }, ref) {
  return (
    <mesh ref={ref} castShadow>
      <sphereGeometry args={[BALL_RADIUS, 28, 20]} />
      <meshStandardMaterial
        color={skin.color}
        emissive={skin.emissive}
        emissiveIntensity={skin.emissive === "#000000" ? 0 : 0.5}
        metalness={skin.metalness}
        roughness={skin.roughness}
      />
    </mesh>
  );
});

export default BallVisual;
