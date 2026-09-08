/**
 * Fishing Journey — the bobber (float) sitting on the water.
 *
 * Position and motion come entirely from the `phase` class:
 *   ready     resting by the dock
 *   casting   arcs out to the fishing spot
 *   waiting   gentle idle bob + slow concentric ripples
 *   bite      dips under with a splash + ripple rings
 *   reeling   pulled back toward the dock, twitching
 */
export default function Bobber({ phase = "ready" }) {
  return (
    <div className={`fj-bobber fj-bobber--${phase}`} aria-hidden="true">
      <div className="fj-bobber__ripple fj-bobber__ripple--1" />
      <div className="fj-bobber__ripple fj-bobber__ripple--2" />
      <div className="fj-bobber__splash">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="fj-bobber__float">
        <div className="fj-bobber__antenna" />
        <div className="fj-bobber__float-top" />
        <div className="fj-bobber__float-band" />
        <div className="fj-bobber__float-bottom" />
        <div className="fj-bobber__gloss" />
      </div>
      <div className="fj-bobber__wake" />
    </div>
  );
}
