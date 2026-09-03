import { useParams } from "react-router-dom";
import { categoryBySlug } from "../data/categories.js";
import { useAuth } from "../auth/AuthContext.jsx";

export default function Landing() {
  const { slug } = useParams();
  const { user } = useAuth();
  const category = slug ? categoryBySlug(slug) : null;
  const scoped = category && category.slug !== "all";

  return (
    <div className="landing">
      {scoped ? (
        <section className="landing__scoped">
          <h1 className="landing__title">{category.label}</h1>
          <div className="empty-state">
            <p className="empty-state__big">No games in {category.label} yet</p>
            <p className="empty-state__sub">
              We&apos;re still building the catalog. Check back soon.
            </p>
          </div>
        </section>
      ) : slug && !category ? (
        <section className="landing__scoped">
          <h1 className="landing__title">Category not found</h1>
          <div className="empty-state">
            <p className="empty-state__big">That category doesn&apos;t exist</p>
            <p className="empty-state__sub">Pick one from the sidebar.</p>
          </div>
        </section>
      ) : (
        <>
          <section className="hero">
            <h1 className="hero__title">Welcome to Game Center</h1>
            <p className="hero__lead">
              Your hub for browser games — browse by category, no account needed.
            </p>
            {user && (
              <p className="hero__note">
                You&apos;re signed in as <strong>{user.username}</strong>. Favorites and
                &ldquo;continue playing&rdquo; will show up here later.
              </p>
            )}
          </section>

          <section className="coming-soon">
            <div className="empty-state">
              <p className="empty-state__big">Games are coming soon</p>
              <p className="empty-state__sub">
                The catalog isn&apos;t live yet. The categories on the left are a preview
                of what&apos;s on the way.
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
