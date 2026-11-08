import { useEffect, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import HeroArtwork from "./HeroArtwork.jsx";
import RequestDialog from "./RequestDialog.jsx";
import AuthGateView from "./AuthGateView.jsx";
import GameRequestForm from "./GameRequestForm.jsx";
import RequestSuccessView from "./RequestSuccessView.jsx";
import useGameRequestFlow from "./useGameRequestFlow.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import "./customGame.css";

/**
 * Subtle pointer parallax (fine pointers only, never with reduced motion) and
 * pausing of the ambient animations while the hero is scrolled out of view.
 */
function useHeroAmbience(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    let io;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(([entry]) => {
        el.classList.toggle("is-offscreen", !entry.isIntersecting);
      });
      io.observe(el);
    }

    const motionOk =
      !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches &&
      window.matchMedia?.("(pointer: fine)").matches;
    if (!motionOk) return () => io?.disconnect();

    let frame = 0;
    let next = null;
    const apply = () => {
      frame = 0;
      if (!next) return;
      el.style.setProperty("--cg-px", next[0].toFixed(3));
      el.style.setProperty("--cg-py", next[1].toFixed(3));
    };
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      next = [((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1];
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      next = [0, 0];
      if (!frame) frame = requestAnimationFrame(apply);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      io?.disconnect();
      cancelAnimationFrame(frame);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [ref]);
}

export default function CustomGameHero() {
  const { t } = useTranslation();
  const { openAuth } = useOutletContext() ?? {};
  const flow = useGameRequestFlow(openAuth);
  const heroRef = useRef(null);
  useHeroAmbience(heroRef);

  const dismiss = () => flow.close();

  return (
    <>
      <section ref={heroRef} className="cg-hero" aria-labelledby="cg-hero-title">
        <div className="cg-hero__backdrop" aria-hidden="true">
          <span className="cg-hero__glow cg-hero__glow--a" />
          <span className="cg-hero__glow cg-hero__glow--b" />
          <span className="cg-hero__floor" />
          <span className="cg-hero__sweep" />
        </div>

        <div className="cg-hero__layout">
        <div className="cg-hero__content">
          <p className="cg-hero__eyebrow">
            <span className="cg-hero__eyebrow-mark" aria-hidden="true" />
            {t("Custom Game Development")}
          </p>
          <h1 id="cg-hero-title" className="cg-hero__title">
            <span className="cg-hero__title-line">{t("Your Imagination.")}</span>
            <span className="cg-hero__title-line cg-hero__title-accent">{t("Our Creation.")}</span>
          </h1>
          <p className="cg-hero__lead">
            {t("Dreaming of your own game? Share your idea with us, and we'll turn your vision into an unforgettable gaming experience. Tell us what you have in mind, and we'll contact you to discuss the details and pricing.")}
          </p>
          <div className="cg-hero__actions">
            <button
              type="button"
              className="cg-btn cg-btn--primary cg-btn--hero"
              onClick={flow.open}
              aria-haspopup="dialog"
              aria-busy={flow.opening || undefined}
            >
              {flow.opening ? (
                <span className="cg-btn__spinner" aria-hidden="true" />
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2c.7 4.6 2.4 6.3 7 7-4.6.7-6.3 2.4-7 7-.7-4.6-2.4-6.3-7-7 4.6-.7 6.3-2.4 7-7Z" />
                  <path d="M19 14c.3 2 1 2.7 3 3-2 .3-2.7 1-3 3-.3-2-1-2.7-3-3 2-.3 2.7-1 3-3Z" opacity="0.7" />
                </svg>
              )}
              <span>{t("Bring My Game to Life")}</span>
              <svg className="cg-btn__arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
            <p className="cg-hero__note">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 18h6M10 21h4" />
                <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2.2h5c.1-1 .5-1.7 1.1-2.2A6 6 0 0 0 12 3Z" />
              </svg>
              {t("Every great game starts with an idea.")}
            </p>
          </div>
        </div>

        <div className="cg-hero__art">
          <HeroArtwork />
        </div>
        </div>
      </section>

      {flow.view && (
        <RequestDialog
          view={flow.view}
          size={flow.view === "form" ? "lg" : "md"}
          closing={flow.closing}
          labelledBy="cg-dialog-title"
          describedBy="cg-dialog-desc"
          onClose={dismiss}
        >
          {flow.view === "auth" && (
            <AuthGateView
              sessionExpired={flow.sessionExpired}
              onLogin={() => flow.startAuth("login")}
              onRegister={() => flow.startAuth("register")}
            />
          )}
          {flow.view === "form" && (
            <GameRequestForm
              user={flow.user}
              initialValues={flow.draftValues}
              onDraftChange={flow.saveDraft}
              onSubmit={flow.submit}
              onCancel={dismiss}
            />
          )}
          {flow.view === "success" && flow.submitted && (
            <RequestSuccessView
              firstName={flow.submitted.firstName}
              email={flow.submitted.email}
              onDone={dismiss}
            />
          )}
        </RequestDialog>
      )}
    </>
  );
}
