import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="empty-state">
      <p className="empty-state__big">Page not found</p>
      <p className="empty-state__sub">
        <Link to="/" className="linkbtn">
          Go back to Game Center
        </Link>
      </p>
    </div>
  );
}
