import ItemIcon from "./ItemIcon.jsx";
import { CROPS } from "../data/crops.js";

export default function SeedStandPanel({ money, onBuy, onClose }) {
  const crops = Object.values(CROPS);
  return (
    <div className="fl-panel-backdrop" onClick={onClose}>
      <div className="fl-panel fl-shop" onClick={(e) => e.stopPropagation()}>
        <div className="fl-panel__header">
          <h3>Seed Stand</h3>
          <button type="button" className="fl-panel__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p className="fl-shop__coins">🪙 {money} coins</p>
        <div className="fl-shop__list">
          {crops.map((crop) => (
            <div className="fl-shop__row" key={crop.id}>
              <ItemIcon itemId={crop.seedId} size={36} />
              <div className="fl-shop__info">
                <strong>{crop.name} Seeds</strong>
                <span>{crop.seedPrice} coins each</span>
              </div>
              <button type="button" className="fl-btn" onClick={() => onBuy(crop.seedId, 1)}>Buy 1</button>
              <button type="button" className="fl-btn" onClick={() => onBuy(crop.seedId, 5)}>Buy 5</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
