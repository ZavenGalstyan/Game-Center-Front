import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api.js";
import GamePlayer from "../components/game/GamePlayer.jsx";
import GameLikeButton from "../components/game/GameLikeButton.jsx";
import GameRenderer from "../components/games/GameRenderer.jsx";
import { getGameComponent, gameSupportsMute } from "../components/games/registry.js";

/**
 * Single Game Page Shell
 *
 * Shared structure for all game detail pages:
 * - GamePageHeader: category badge + title + short tagline
 * - GameToolbar: Like, Restart, Mute, Fullscreen controls
 * - GameStage: the actual game experience
 * - GameAbout: about section with full description
 *
 * Each game provides its own internal visual identity within the stage.
 */

// Short taglines for games (avoids duplicating full description in header)
const GAME_TAGLINES = {
  "Classic Chess": "A timeless strategy game of planning, tactics, and checkmate.",
  "Stonewild": "Build, explore, and survive in a living voxel world.",
  "Ball Adventure 3D": "Roll, balance, and explore across colorful 3D worlds.",
  "Rooftop Sniper": "Take aim and master precision across challenging rooftop missions.",
  "Arena Gladiator": "Fight, survive, and become a legend in the arena.",
  "Liquid Sort": "Pour, match, and solve colorful liquid puzzles.",
  "Element Merge": "Mix elements, discover combinations, and create new worlds.",
  "Farm Life": "Plant, grow, build, and create your perfect countryside farm.",
  "Car Wash Studio": "Wash, detail, and transform every car to a perfect shine.",
  "Parking Master": "Drive, align, and master every parking challenge.",
  "Lumberjack Life": "Chop, haul, and build your timber empire in the forest.",
  "Bomb Squad": "Decode the device, solve the modules, and disarm it before time runs out.",
  "Laser Maze": "Rotate mirrors, redirect the beam, and illuminate every target.",
  "Parking Jam": "Move the right cars, clear the path, and escape the crowded lot.",
  "Mini Golf Journey": "Aim your shot, master each course, and sink the perfect putt.",
  "Boxing Club": "Train your fighter, master your technique, and fight your way to the championship.",
  "Street Basketball": "Hit the court, master your skills, and become the king of street basketball.",
  "Penalty Kick": "Take your shot, beat the goalkeeper, and dominate the penalty shootout.",
  "Fishing Journey": "Cast your line, catch rare fish, upgrade your gear, and explore new waters.",
  "Cake Designer": "Create beautiful cakes, complete customer orders, and unlock new decorations.",
  "Cozy Cleanup": "Clean, organize, and transform messy rooms into relaxing cozy spaces.",
};

// Game-specific About section decorations (maps to CSS data-decoration attribute)
const GAME_DECORATIONS = {
  "Classic Chess": "knight",
  "Stonewild": "cube",
  "Ball Adventure 3D": "ball",
  "Rooftop Sniper": "crosshair",
  "Arena Gladiator": "shield",
  "Liquid Sort": "flask",
  "Element Merge": "elements",
  "Farm Life": "sprout",
  "Car Wash Studio": "water-drop",
  "Parking Master": "parking",
  "Lumberjack Life": "lumberjack",
  "Bomb Squad": "bomb-squad",
  "Laser Maze": "laser-maze",
  "Parking Jam": "parking-jam",
  "Mini Golf Journey": "mini-golf",
  "Boxing Club": "boxing-club",
  "Street Basketball": "street-basketball",
  "Penalty Kick": "penalty-kick",
  "Fishing Journey": "fishing-journey",
  "Cake Designer": "cake-designer",
  "Cozy Cleanup": "cozy-cleanup",
};

// Fallback: generate a short tagline from description if not predefined
function getTagline(game) {
  if (GAME_TAGLINES[game.name]) return GAME_TAGLINES[game.name];
  // For other games, use first sentence or short excerpt
  if (!game.description) return null;
  const firstSentence = game.description.split(/[.!?]/)[0];
  if (firstSentence && firstSentence.length <= 80) return firstSentence + ".";
  return null;
}

export default function GameDetail() {
  const { id } = useParams();
  const [game, setGame] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | notfound | error
  const [restartNonce, setRestartNonce] = useState(0);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setRestartNonce(0);
    api
      .getGame(id)
      .then((data) => {
        if (cancelled) return;
        setGame(data);
        setState("ok");
      })
      .catch((err) => {
        if (cancelled) return;
        setState(err.status === 404 ? "notfound" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state === "loading") return <p className="muted">Loading…</p>;

  if (state === "notfound") {
    return (
      <div className="empty-state">
        <p className="empty-state__big">Game not found</p>
        <p className="empty-state__sub">
          <Link to="/" className="linkbtn">
            Back to all games
          </Link>
        </p>
      </div>
    );
  }

  if (state === "error") {
    return <div className="form-alert">Couldn&rsquo;t load this game. Try again.</div>;
  }

  const PlayableGame = getGameComponent(game);
  // The Mute button only lights up for games that actually honour the prop —
  // every other game behaves exactly as before.
  const canMute = gameSupportsMute(game);

  return (
    <article className="game-page">
      {/* Back Navigation */}
      <Link to="/" className="game-page__back">
        <span className="game-page__back-arrow" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </span>
        Back
      </Link>

      {/* Game Page Header */}
      <header className="game-page__header">
        <div className="game-page__title-row">
          <h1 className="game-page__title">{game.name}</h1>
          {game.type && (
            <Link
              to={`/?typeId=${game.type.id}`}
              className="game-page__category"
            >
              {game.type.name}
            </Link>
          )}
        </div>
        {getTagline(game) && (
          <p className="game-page__tagline">{getTagline(game)}</p>
        )}
      </header>

      {/* Game Stage with Toolbar */}
      <GamePlayer
        title={game.name}
        likeButton={<GameLikeButton gameId={game.id || game._id} />}
        onRestart={
          PlayableGame ? () => setRestartNonce((n) => n + 1) : undefined
        }
        muted={muted}
        onToggleMute={canMute ? () => setMuted((m) => !m) : undefined}
      >
        {PlayableGame ? (
          <GameRenderer game={game} restartNonce={restartNonce} muted={muted} />
        ) : null}
      </GamePlayer>

      {/* About Section - Premium Editorial Panel */}
      <section className="game-page__about" data-decoration={GAME_DECORATIONS[game.name] || "diamond"}>
        <p className="game-page__about-eyebrow">About the Game</p>
        <div className="game-page__about-header">
          <h2 className="game-page__about-title">{game.name}</h2>
          {game.type && (
            <Link
              to={`/?typeId=${game.type.id}`}
              className="game-page__tag"
            >
              {game.type.name}
            </Link>
          )}
        </div>
        <p className="game-page__about-text">{game.description}</p>
      </section>
    </article>
  );
}
