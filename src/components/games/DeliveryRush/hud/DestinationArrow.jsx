/**
 * Delivery Rush — off-screen destination pointer.
 *
 * When the target is not in front of you, a chevron rides around the edge of
 * the play area pointing at it, with the remaining distance underneath. When
 * the target *is* in view the chevron fades out and gets out of the way — the
 * world-space beam is doing the job by then.
 *
 * `angle` is the bearing to the target relative to the camera's forward
 * direction, in radians, supplied by the game loop.
 */

import { formatDistance } from "../utils/format.js";

export default function DestinationArrow({ angle = 0, distance = 0, stage = "pickup", visible = true }) {
  const deg = (angle * 180) / Math.PI;
  return (
    <div
      className={`dr-arrow${visible ? "" : " is-hidden"} dr-arrow--${stage}`}
      style={{ "--dr-arrow-angle": `${deg}deg` }}
      aria-hidden={!visible}
    >
      <div className="dr-arrow__ring">
        <div className="dr-arrow__chevron">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3 L21 20 L12 15.5 L3 20 Z" />
          </svg>
        </div>
      </div>
      <span className="dr-arrow__dist">{formatDistance(distance)}</span>
    </div>
  );
}
