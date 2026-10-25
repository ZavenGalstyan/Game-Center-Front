import Avatar from "../avatar/Avatar.jsx";

/** Author avatar; deleted authors get the neutral, dimmed silhouette. */
export default function CommentAvatar({ avatarId, deleted = false }) {
  return <Avatar avatarId={avatarId} isDeleted={deleted} size="md" alt="" className="comment-avatar" />;
}
