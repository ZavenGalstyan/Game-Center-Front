/**
 * Fishing Journey — the fishing screen and its state machine.
 *
 *   ready  → CAST LINE
 *   casting → line animates out                (~0.9s)
 *   waiting → bobber drifts, random bite timer  (location.biteRange)
 *   bite   → "BITE!" + short reaction window; REEL IN or the fish escapes
 *   reeling → the skill mini-game (<ReelingGame>)
 *   result → <CatchResult>; Continue returns to ready
 *
 * The hooked species + weight are rolled at bite time from the current
 * location and equipped rod. The parent remounts this component (via `key`)
 * for the GamePlayer Restart button, which naturally resets the attempt while
 * leaving all saved progress untouched.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import LakeScene from "../components/LakeScene.jsx";
import FishingRod from "../components/FishingRod.jsx";
import Bobber from "../components/Bobber.jsx";
import ReelingGame from "../components/ReelingGame.jsx";
import CatchResult from "../components/CatchResult.jsx";
import CoinDisplay from "../components/CoinDisplay.jsx";
import { getLocation } from "../data/locations.js";
import { getRod } from "../data/rods.js";
import { getFish } from "../data/fish.js";
import { IconChevronLeft, IconRod } from "../components/Icons.jsx";
import {
  catchDifficulty,
  pickFish,
  randBetween,
  reactionWindow,
  rollWeight,
} from "../utils/fishingLogic.js";
import { sfx } from "../utils/sound.js";

const CAST_MS = 900;

export default function FishingScreen({ progress, settings, onCatch, onBack }) {
  const location = getLocation(progress.currentLocation);
  const rod = getRod(progress.equippedRod);
  const soundOn = settings.sound;

  const [phase, setPhaseState] = useState("ready");
  const [hooked, setHooked] = useState(null); // { fish, weight, difficulty }
  const [result, setResult] = useState(null); // { outcome, fish, weight, reward, isRecord }

  // a ref mirror of `phase` so timer callbacks can branch without stale closures
  const phaseRef = useRef("ready");
  const setPhase = useCallback((next) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const timers = useRef([]);
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  const after = useCallback(
    (ms, fn) => {
      const id = setTimeout(fn, ms);
      timers.current.push(id);
      return id;
    },
    [],
  );

  useEffect(() => clearTimers, [clearTimers]);

  const goWaiting = useCallback(() => {
    setPhase("waiting");
    const [lo, hi] = location.biteRange;
    after(randBetween(lo, hi), () => {
      const fish = pickFish(location, rod);
      const weight = rollWeight(fish, rod);
      const difficulty = catchDifficulty(fish, weight, location, rod);
      setHooked({ fish, weight, difficulty });
      setPhase("bite");
      sfx.bite(soundOn);
      // reaction window — miss it and the fish is gone
      after(reactionWindow(rod), () => {
        if (phaseRef.current !== "bite") return;
        setResult({ outcome: "missed", fish });
        sfx.escape(soundOn);
        setPhase("result");
      });
    });
  }, [after, location, rod, soundOn]);

  const cast = useCallback(() => {
    clearTimers();
    setResult(null);
    setHooked(null);
    setPhase("casting");
    sfx.cast(soundOn);
    after(CAST_MS, goWaiting);
  }, [after, clearTimers, goWaiting, soundOn]);

  const reelIn = useCallback(() => {
    clearTimers();
    sfx.reel(soundOn);
    setPhase("reeling");
  }, [clearTimers, soundOn]);

  const handleReelResult = useCallback(
    (outcome) => {
      if (outcome === "caught" && hooked) {
        const { reward, isRecord } = onCatch(hooked.fish, hooked.weight);
        setResult({
          outcome: "caught",
          fish: hooked.fish,
          weight: hooked.weight,
          reward,
          isRecord,
        });
      } else {
        setResult({
          outcome: "escaped",
          fish: hooked?.fish,
          weight: hooked?.weight,
        });
      }
      setPhase("result");
    },
    [hooked, onCatch],
  );

  const continueFishing = useCallback(() => {
    clearTimers();
    setResult(null);
    setHooked(null);
    setPhase("ready");
  }, [clearTimers]);

  const bobberPhase = phase === "result" ? "ready" : phase;
  const best = progress.bestCatch;

  return (
    <div className="fj-screen fj-fishing">
      <div className="fj-fishing__scene">
        <LakeScene variant={location.scene} quality={settings.graphics}>
          <FishingRod phase={bobberPhase} />
          <Bobber phase={bobberPhase} />
          {phase === "casting" && <div className="fj-fishing__cast-ripple" />}
          {phase === "bite" && (
            <div className="fj-fishing__bite" role="status">
              <span className="fj-fishing__bite-flash" />
              Bite!
            </div>
          )}
        </LakeScene>
      </div>

      <div className="fj-fishing__hud">
        <button
          type="button"
          className="fj-btn fj-btn--ghost fj-btn--sm fj-fishing__back"
          onClick={onBack}
        >
          <IconChevronLeft className="fj-screen__back-icon" />
          Menu
        </button>
        <div className="fj-fishing__hud-right">
          <span className="fj-fishing__loc">
            <span className="fj-fishing__loc-dot" />
            {location.name}
          </span>
          <CoinDisplay coins={progress.coins} />
        </div>
      </div>

      <div className="fj-fishing__rodtag">
        <IconRod className="fj-fishing__rodtag-icon" />
        <span className="fj-fishing__rodtag-label">Rod</span>
        {rod.name}
      </div>

      <div className="fj-fishing__panel">
        {phase === "ready" && (
          <div className="fj-fishing__ready">
            <p className="fj-fishing__prompt">
              {best ? (
                <>
                  Best catch
                  <strong>
                    {best.name} · {best.weight} kg
                  </strong>
                </>
              ) : (
                "Cast your line and see what's biting."
              )}
            </p>
            <button
              type="button"
              className="fj-btn fj-btn--primary fj-btn--cta fj-fishing__cast"
              onClick={cast}
            >
              Cast Line
            </button>
          </div>
        )}

        {phase === "casting" && (
          <p className="fj-fishing__status">Casting</p>
        )}

        {phase === "waiting" && (
          <p className="fj-fishing__status fj-fishing__status--wait">
            Waiting for a bite
          </p>
        )}

        {phase === "bite" && (
          <button
            type="button"
            className="fj-btn fj-btn--danger fj-btn--cta fj-fishing__reelbtn"
            onClick={reelIn}
          >
            Reel In!
          </button>
        )}

        {phase === "reeling" && hooked && (
          <ReelingGame
            power={rod.power}
            control={rod.control}
            difficulty={hooked.difficulty}
            soundOn={soundOn}
            onResult={handleReelResult}
          />
        )}

        {phase === "result" && result && (
          <CatchResult
            outcome={result.outcome}
            fish={result.fish || getFish(hooked?.fish?.id)}
            weight={result.weight}
            reward={result.reward}
            isRecord={result.isRecord}
            onContinue={continueFishing}
          />
        )}
      </div>
    </div>
  );
}
