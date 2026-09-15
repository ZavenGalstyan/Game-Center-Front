/**
 * Supermarket Rush — the real 3D main-menu background: a fully-stocked
 * slice of the small store (entrance, a couple of aisles, dairy fridge,
 * one checkout) reusing the exact same gameplay pieces, seen through a
 * slow, non-interactive cinematic camera. No player, no simulation.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { buildWorld } from "../engine/storeBuild.js";
import Environment from "./Environment.jsx";
import Shelf from "./Shelf.jsx";
import ProductInstances from "./ProductInstances.jsx";
import EntranceDoors from "./EntranceDoors.jsx";
import Checkout from "./Checkout.jsx";
import { CartEntity } from "./Cart.jsx";

const MENU_LEVEL = {
  id: 0, tier: "small", name: "Preview",
  stock: {
    "dairy-milk": [6, 6], "dairy-yogurt": [6, 5], "dairy-cheese": [6, 6],
    "breakfast-cereal": [6, 5], "breakfast-bread": [4, 4], "breakfast-coffee": [4, 3],
    "drinks-water": [8, 7], "drinks-juice": [6, 6], "drinks-soda": [8, 5],
    "snacks-chips": [6, 6], "snacks-cookies": [6, 4], "snacks-chocolate": [8, 7],
    "household-paperTowels": [4, 4], "household-soap": [6, 5], "household-cleaner": [4, 4],
  },
  customers: 0, checkoutLanes: 1, carts: false, spill: false, fallen: false, trolley: false, delivery: false,
};

export default function MenuScene() {
  const world = useMemo(() => buildWorld(MENU_LEVEL), []);
  const doorOpenRef = useRef(true);
  const t = useRef(0);

  useFrame((state, dt) => {
    t.current += dt;
    const angle = Math.sin(t.current * 0.07) * 0.55;
    const radius = 7.5;
    state.camera.position.set(Math.sin(angle) * radius, 2.1 + Math.sin(t.current * 0.05) * 0.12, 2.2 + Math.cos(angle) * 2.0);
    state.camera.lookAt(0, 1.35, 8);
  });

  return (
    <group>
      <Environment world={world} shadowsOn />
      {world.shelves.map((s) => (
        <Shelf key={s.shelfId} shelf={s} isFridge={s.aisleId === "dairy"} highlighted={false} />
      ))}
      <ProductInstances shelves={world.shelves} updateToken={0} />
      <EntranceDoors x={world.layout.entrance.x} z={world.layout.entrance.z} openRef={doorOpenRef} />
      {world.checkouts.map((c) => (
        <Checkout key={c.id} checkout={c} customerWaiting={false} />
      ))}
      <group position={[world.cartCorral.x, 0, world.cartCorral.z]}>
        <CartEntity data={{ x: 0, z: 0, yaw: 0.4 }} variant="cart" />
      </group>
    </group>
  );
}
