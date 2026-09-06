import { Link } from "react-router-dom";

export default function GameCard({ game }) {
  return (
    <Link to={`/games/${game.id}`} className="game-card">
      <div className="game-card__top">
        <h3 className="game-card__title">{game.name}</h3>
        {game.type?.name && <span className="badge">{game.type.name}</span>}
      </div>
      <p className="game-card__desc">{game.description}</p>
    </Link>
  );
}
