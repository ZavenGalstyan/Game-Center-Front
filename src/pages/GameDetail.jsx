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
 * - GamePageHeader: category badge + title + description
 * - GameToolbar: Like, Restart, Mute, Fullscreen controls
 * - GameStage: the actual game experience
 * - GameAbout: about section with metadata
 *
 * Each game provides its own internal visual identity within the stage.
 */
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
      {/* Game Page Header */}
      <header className="game-page__header">
        {game.type && (
          <Link
            to={`/?typeId=${game.type.id}`}
            className="game-page__category"
          >
            {game.type.name}
          </Link>
        )}
        <h1 className="game-page__title">{game.name}</h1>
        {game.description && (
          <p className="game-page__tagline">
            {game.description.length > 100
              ? game.description.slice(0, 100).trim() + "…"
              : game.description}
          </p>
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

      {/* About Section */}
      <section className="game-page__about">
        <h2 className="game-page__about-title">About {game.name}</h2>
        {game.type && (
          <div className="game-page__tags">
            <Link
              to={`/?typeId=${game.type.id}`}
              className="game-page__tag"
            >
              {game.type.name}
            </Link>
          </div>
        )}
        <p className="game-page__about-text">{game.description}</p>
      </section>
    </article>
  );
}
