import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api.js";
import GamePlayer from "../components/GamePlayer.jsx";

export default function GameDetail() {
  const { id } = useParams();
  const [game, setGame] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | notfound | error

  useEffect(() => {
    let cancelled = false;
    setState("loading");
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

  return (
    <article className="game-detail">
      <h1 className="page-title">{game.name}</h1>
      {game.type && (
        <p className="game-detail__type">
          Category:{" "}
          <Link to={`/?typeId=${game.type.id}`}>{game.type.name}</Link>
        </p>
      )}

      <GamePlayer gameId={game.id} title={game.name} />

      <section className="game-detail__about">
        <h2 className="card__title">About</h2>
        <p>{game.description}</p>
      </section>
    </article>
  );
}
