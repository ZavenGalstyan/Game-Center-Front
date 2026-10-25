import { memo, useState } from "react";
import { FALLBACK_AVATAR_SRC, getAvatarName, getAvatarSrc, resolveAvatarId } from "../../lib/avatars.js";
import "./avatar.css";

export const AVATAR_SIZES = { xs: 20, sm: 28, md: 40, lg: 64, xl: 112 };

/**
 * The one place that turns an avatar id into an image.
 *
 * - Unknown / missing ids resolve to the catalog default; a failed load swaps
 *   to the neutral fallback once (no onError loop).
 * - `isDeleted` shows the neutral silhouette, dimmed, whatever the id says.
 * - `width`/`height` are always set so the image never shifts layout.
 * - Pass `alt=""` when the username is rendered right next to it.
 *
 * @param {object} props
 * @param {string} [props.avatarId]
 * @param {"xs"|"sm"|"md"|"lg"|"xl"|number} [props.size="md"]
 * @param {"circle"|"rounded"} [props.shape="circle"]
 * @param {string} [props.alt] defaults to the avatar's name
 * @param {boolean} [props.isDeleted=false]
 * @param {"lazy"|"eager"} [props.loading="lazy"]
 */
function Avatar({ avatarId, size = "md", shape = "circle", alt, isDeleted = false, loading = "lazy", className = "" }) {
  const named = typeof size === "string" && AVATAR_SIZES[size];
  const px = named || (Number.isFinite(size) ? size : AVATAR_SIZES.md);
  const src = isDeleted ? FALLBACK_AVATAR_SRC : getAvatarSrc(avatarId);
  const [failedSrc, setFailedSrc] = useState(null);
  const shown = failedSrc === src ? FALLBACK_AVATAR_SRC : src;
  const label = alt ?? (isDeleted ? "Deleted user" : getAvatarName(resolveAvatarId(avatarId)));

  const classes = [
    "gc-avatar",
    named ? `gc-avatar--${size}` : "",
    shape === "rounded" ? "gc-avatar--rounded" : "",
    isDeleted ? "gc-avatar--deleted" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <img
      src={shown}
      width={px}
      height={px}
      alt={label}
      loading={loading}
      decoding="async"
      draggable={false}
      className={classes}
      style={named ? undefined : { width: px, height: px }}
      onError={() => {
        if (shown !== FALLBACK_AVATAR_SRC) setFailedSrc(src);
      }}
    />
  );
}

export default memo(Avatar);
