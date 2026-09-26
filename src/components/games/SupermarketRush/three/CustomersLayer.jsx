/**
 * Supermarket Rush — owns the CustomerSystem for one shift and renders
 * whoever's currently in the store. Re-renders only happen on spawn/despawn
 * (via the forced tick); each <Customer> moves itself every frame by
 * reading its own mutable AI state, so this component staying "stale"
 * between those re-renders is exactly the point, not a bug.
 */
import { forwardRef, useImperativeHandle, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { CustomerSystem } from "../engine/customerSystem.js";
import Customer from "./Customer.jsx";

const CustomersLayer = forwardRef(function CustomersLayer({ world, level, paused, onTakeItem, onExited }, ref) {
  const system = useMemo(() => new CustomerSystem(world, level), [world, level]);
  const [, forceTick] = useState(0);

  useImperativeHandle(
    ref,
    () => ({
      frontOfQueue: (id) => system.frontOfQueue(id),
      completeCheckout: (id, secs) => system.completeCheckout(id, secs),
      getCustomers: () => system.customers,
    }),
    [system]
  );

  useFrame((_, dt) => {
    if (paused) return;
    system.update(dt, {
      onTakeItem: (shelfId, productId, c) => onTakeItem?.(shelfId, productId, c),
      onExited: (c) => onExited?.(c),
      onSpawn: () => forceTick((n) => n + 1),
      onDespawn: () => forceTick((n) => n + 1),
    });
  });

  return (
    <group>
      {system.customers.map((c) => (
        <Customer key={c.id} data={c} />
      ))}
    </group>
  );
});

export default CustomersLayer;
