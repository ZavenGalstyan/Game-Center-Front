/**
 * Supermarket Rush — the gameplay scene: player movement/collision, the
 * first-person camera with a subtle walking bob, every interaction (box
 * pickup, restocking, the trolley, carts, spills, fallen items, customer
 * help, checkout scanning), the guidance arrow, and the store itself. One
 * `useFrame`, same rationale as Stonewild's StonewildScene — React only
 * re-renders for discrete state changes (tasks, prompts, toasts), never per
 * frame for movement or physics.
 */
import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";

import { createPlayer, stepPlayer } from "../engine/player.js";
import {
  PLAYER_EYE_HEIGHT,
  PITCH_LIMIT,
  FIXED_DT,
  MAX_FRAME_DT,
  MAX_SUBSTEPS,
  INTERACT_REACH,
  RESTOCK_UNIT_SECONDS,
  SPILL_CLEAN_SECONDS,
  HEAD_BOB_AMPLITUDE,
  HEAD_BOB_SPEED,
  FAST_CHECKOUT_SECONDS,
} from "../engine/constants.js";
import { computeGuidance } from "../engine/guidance.js";
import { applyTaskEvent, allTasksComplete, restockTaskId, computeShiftResult } from "../engine/tasks.js";
import { getProduct } from "../data/products.js";
import { sfx } from "../engine/sound.js";

import Environment from "./Environment.jsx";
import Shelf from "./Shelf.jsx";
import ProductInstances from "./ProductInstances.jsx";
import EntranceDoors from "./EntranceDoors.jsx";
import Checkout from "./Checkout.jsx";
import CustomersLayer from "./CustomersLayer.jsx";
import Box from "./Box.jsx";
import HeldBox from "./HeldBox.jsx";
import GuidanceArrow from "./GuidanceArrow.jsx";
import MessesLayer from "./Messes.jsx";
import { CartEntity } from "./Cart.jsx";

function dist(px, pz, x, z) {
  return Math.hypot(px - x, pz - z);
}

export default function StoreScene({
  world,
  level,
  input,
  store,
  soundEnabled,
  shadowsOn,
  sensitivity,
  restockSpeedMult,
  moveSpeedMult,
  trolleyCapacity,
  scannerSpeedMult,
  paused,
  onComplete,
  spills,
  setSpills,
  fallen,
  setFallen,
  carts,
  dropActionRef,
  helpAnswerRef,
}) {
  const { camera } = useThree();
  const playerRef = useRef(createPlayer(world.playerSpawn));
  const accumulatorRef = useRef(0);
  const bobT = useRef(0);
  const elapsedRef = useRef(0);
  const elapsedFlushRef = useRef(0);
  const prevInteractRef = useRef(false);
  const restockAccumRef = useRef(0);
  const lastRestockKeyRef = useRef(null);
  const finishedRef = useRef(false);
  const doorOpenRef = useRef(false);
  const customersRef = useRef(null);
  const trolleyRef = useRef({ x: world.warehouse.boxSpawns[0]?.x || 0, z: (world.warehouse.zStart ?? 0) - 0.6, yaw: 0 });

  // Simulation state (shelf stock, held items, tasks…) is mutated directly
  // on plain objects for speed — see the file header. `tick` is the one
  // thing that forces React to actually re-render this component's JSX
  // (shelf highlight, product visuals, held-box/trolley meshes, the
  // guidance arrow) right after one of those discrete mutations, without
  // tying it to per-frame noise like restockProgress or the elapsed clock.
  const [tick, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);

  const doTaskEvent = (id, amount = 1) => {
    const state = store.get();
    const { tasks, justCompleted } = applyTaskEvent(state.tasks, id, amount);
    store.setTasks(tasks);
    if (justCompleted) {
      const t = tasks.find((x) => x.id === id);
      store.showToast(`${t?.label || "Task"} ✓`);
      sfx.taskDone(soundEnabled);
    }
    if (!finishedRef.current && allTasksComplete(tasks)) {
      finishedRef.current = true;
      store.set({ finished: true });
      sfx.shiftComplete(soundEnabled);
      setTimeout(() => {
        const result = computeShiftResult(level, world, store, elapsedRef.current);
        onComplete(result);
      }, 2000);
    }
    bump();
  };

  if (dropActionRef) {
    dropActionRef.current = () => {
      const state = store.get();
      if (state.heldBox) { store.dropBox(); sfx.boxDrop(soundEnabled); bump(); return; }
      if (state.pushingTrolley) { store.set({ pushingTrolley: false }); bump(); return; }
      const cCart = carts.find((c) => c.carried);
      if (cCart) { cCart.carried = false; bump(); return; }
      const cFallen = fallen.find((f) => f.state === "held");
      if (cFallen) {
        cFallen.x = playerRef.current.x;
        cFallen.z = playerRef.current.z;
        cFallen.state = "onFloor";
        setFallen((prev) => prev.map((f) => (f.id === cFallen.id ? { ...cFallen } : f)));
      }
    };
  }

  if (helpAnswerRef) {
    helpAnswerRef.current = (index) => {
      const hp = store.get().helpPrompt;
      if (!hp || !hp.options[index]) return;
      const chosen = hp.options[index];
      const customer = customersRef.current?.getCustomers().find((c) => c.id === hp.customerId);
      if (customer) customer.helpAnswered = true;
      const correct = chosen === hp.correct;
      store.addSatisfaction(correct ? 6 : 1, "help");
      sfx.helpChime(soundEnabled);
      store.showToast(correct ? "Great help! ✓" : "Thanks anyway");
      store.set({ helpPrompt: null });
    };
  }

  const trolleyOn = Boolean(world.trolleyAvailable);

  useEffect(() => {
    camera.fov = 62;
    camera.updateProjectionMatrix();
  }, [camera]);

  useFrame((_, rawDt) => {
    const player = playerRef.current;
    if (paused) {
      input.consumeMouse();
      return;
    }
    const dt = Math.min(rawDt, MAX_FRAME_DT);
    elapsedRef.current += dt;
    elapsedFlushRef.current += dt;
    if (elapsedFlushRef.current >= 0.5) {
      elapsedFlushRef.current = 0;
      store.set({ elapsedSec: elapsedRef.current });
    }

    const [dx, dy] = input.consumeMouse();
    player.yaw -= dx * 0.0022 * sensitivity;
    player.pitch -= dy * 0.0022 * sensitivity;
    player.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, player.pitch));

    accumulatorRef.current += dt;
    let steps = 0;
    while (accumulatorRef.current >= FIXED_DT && steps < MAX_SUBSTEPS) {
      stepPlayer(player, input, FIXED_DT, world.colliders, moveSpeedMult);
      accumulatorRef.current -= FIXED_DT;
      steps++;
    }
    if (steps >= MAX_SUBSTEPS) accumulatorRef.current = 0;

    bobT.current += dt * HEAD_BOB_SPEED * (player.sprinting ? 1.3 : 1);
    const bobAmp = player.moving ? HEAD_BOB_AMPLITUDE * (player.sprinting ? 1.3 : 1) : 0;
    const bobY = Math.sin(bobT.current) * bobAmp;
    const bobX = Math.sin(bobT.current * 0.5) * bobAmp * 0.5;

    camera.position.set(player.x + bobX, PLAYER_EYE_HEIGHT + bobY, player.z);
    camera.rotation.order = "YXZ";
    camera.rotation.set(player.pitch, player.yaw, 0);

    // ---- entrance doors: open while anyone is near the sensor ----
    const nearDoor = dist(player.x, player.z, world.layout.entrance.x, world.layout.entrance.z) < 2.6;
    const customers = customersRef.current?.getCustomers?.() || [];
    const customerNearDoor = customers.some((c) => dist(c.x, c.z, world.layout.entrance.x, world.layout.entrance.z) < 2.2);
    doorOpenRef.current = nearDoor || customerNearDoor;

    // ---- trolley follows the player a step behind while pushed ----
    const state = store.get();
    if (state.pushingTrolley) {
      const forwardX = -Math.sin(player.yaw), forwardZ = -Math.cos(player.yaw);
      const targetX = player.x - forwardX * 0.85;
      const targetZ = player.z - forwardZ * 0.85;
      trolleyRef.current.x += (targetX - trolleyRef.current.x) * Math.min(1, dt * 6);
      trolleyRef.current.z += (targetZ - trolleyRef.current.z) * Math.min(1, dt * 6);
      trolleyRef.current.yaw = player.yaw;
    }

    const justPressed = input.interact && !prevInteractRef.current;
    prevInteractRef.current = input.interact;

    // ============================= interaction chain =============================
    let prompt = null;
    let restocking = false;
    let cleaningSpill = false;

    const heldBox = state.heldBox;
    const carryingCart = carts.find((c) => c.carried);
    const carryingFallen = fallen.find((f) => f.state === "held");

    if (carryingCart) {
      const forwardX = -Math.sin(player.yaw), forwardZ = -Math.cos(player.yaw);
      carryingCart.x = player.x - forwardX * 0.7;
      carryingCart.z = player.z - forwardZ * 0.7;
      carryingCart.yaw = player.yaw;
    }

    // 1) Checkout — highest priority near the counter.
    if (state.checkout) {
      const item = state.checkout.items[state.checkout.scannedIndex];
      prompt = item ? `E — SCAN ${getProduct(item.productId).name.toUpperCase()}` : null;
      if (justPressed && item) {
        item.scanned = true;
        state.checkout.scannedIndex += 1;
        sfx.scanBeep(soundEnabled);
        store.bumpStat("itemsScanned", 1);
        store.set({ checkout: { ...state.checkout } });
        if (state.checkout.scannedIndex >= state.checkout.items.length) {
          const elapsed = elapsedRef.current - state.checkout.startedAt;
          const perItem = (elapsed / Math.max(1, state.checkout.items.length)) * scannerSpeedMult;
          const fast = perItem <= FAST_CHECKOUT_SECONDS;
          if (fast) store.bumpStat("fastCheckouts", 1);
          store.addSatisfaction(fast ? 4 : 1, "checkout");
          sfx.cashRegister(soundEnabled);
          customersRef.current?.completeCheckout(state.checkout.checkoutId, 1.0);
          store.set({ checkout: null });
          bump();
        }
      }
    } else {
      for (const checkout of world.checkouts) {
        if (dist(player.x, player.z, checkout.operatePoint.x, checkout.operatePoint.z) > INTERACT_REACH) continue;
        const front = customersRef.current?.frontOfQueue(checkout.id);
        if (!front) continue;
        prompt = "E — START CHECKOUT";
        if (justPressed) {
          store.set({
            checkout: {
              checkoutId: checkout.id,
              customerId: front.id,
              items: front.shoppingList.map((s) => ({ productId: s.productId, price: getProduct(s.productId).price, scanned: false })),
              scannedIndex: 0,
              startedAt: elapsedRef.current,
            },
          });
          bump();
        }
        break;
      }
    }

    // 2) Holding a single box — only restocking (or Q to drop) is available.
    if (!prompt && heldBox) {
      const shelf = world.shelves.find((s) => !s.deco && s.productId === heldBox.productId);
      if (shelf && dist(player.x, player.z, shelf.interactPoint.x, shelf.interactPoint.z) <= INTERACT_REACH && shelf.stock < shelf.capacity) {
        prompt = "HOLD E — RESTOCK";
        if (input.interact) {
          restocking = true;
          const key = `box-${shelf.shelfId}`;
          if (lastRestockKeyRef.current !== key) { lastRestockKeyRef.current = key; restockAccumRef.current = 0; }
          restockAccumRef.current += (1 / RESTOCK_UNIT_SECONDS) * restockSpeedMult * dt;
          let placed = 0;
          while (restockAccumRef.current >= 1 && heldBox.count > 0 && shelf.stock < shelf.capacity) {
            shelf.stock++; heldBox.count--; restockAccumRef.current -= 1; placed++;
          }
          if (placed > 0) {
            sfx.placeItem(soundEnabled);
            doTaskEvent(restockTaskId(shelf.shelfId), placed);
            store.bumpStat("productsRestocked", placed);
            store.setHeldBoxCount(heldBox.count);
          }
          store.set({ restockProgress: { shelfId: shelf.shelfId, pct: restockAccumRef.current } });
        }
      } else {
        prompt = `Carrying ${getProduct(heldBox.productId).name} — find the shelf`;
      }
    }

    // 3) Trolley — take it, load it at the warehouse, restock from a loaded slot.
    if (!prompt && !heldBox && trolleyOn) {
      if (!state.pushingTrolley && dist(player.x, player.z, trolleyRef.current.x, trolleyRef.current.z) <= INTERACT_REACH + 0.3) {
        prompt = "E — TAKE TROLLEY";
        if (justPressed) { store.set({ pushingTrolley: true }); bump(); }
      } else if (state.pushingTrolley) {
        const nextTask = store.get().tasks.find((t) => !t.done && t.type === "restock");
        const spawn = world.warehouse.boxSpawns.find((b) => dist(player.x, player.z, b.x, b.z) <= INTERACT_REACH);
        if (spawn && nextTask && state.trolleyLoad.length < trolleyCapacity) {
          prompt = `E — LOAD ${getProduct(nextTask.productId).name.toUpperCase()} BOX`;
          if (justPressed) {
            const product = getProduct(nextTask.productId);
            store.set({ trolleyLoad: [...state.trolleyLoad, { productId: product.id, count: product.boxCapacity, capacity: product.boxCapacity }] });
            sfx.boxPickup(soundEnabled);
            bump();
          }
        } else {
          const slotIdx = state.trolleyLoad.findIndex((s) => {
            const shelf = world.shelves.find((sh) => !sh.deco && sh.productId === s.productId);
            return shelf && shelf.stock < shelf.capacity && dist(player.x, player.z, shelf.interactPoint.x, shelf.interactPoint.z) <= INTERACT_REACH;
          });
          if (slotIdx >= 0) {
            const slot = state.trolleyLoad[slotIdx];
            const shelf = world.shelves.find((sh) => !sh.deco && sh.productId === slot.productId);
            prompt = "HOLD E — RESTOCK";
            if (input.interact) {
              restocking = true;
              const key = `trolley-${shelf.shelfId}`;
              if (lastRestockKeyRef.current !== key) { lastRestockKeyRef.current = key; restockAccumRef.current = 0; }
              restockAccumRef.current += (1 / RESTOCK_UNIT_SECONDS) * restockSpeedMult * dt;
              let placed = 0;
              while (restockAccumRef.current >= 1 && slot.count > 0 && shelf.stock < shelf.capacity) {
                shelf.stock++; slot.count--; restockAccumRef.current -= 1; placed++;
              }
              if (placed > 0) {
                sfx.placeItem(soundEnabled);
                doTaskEvent(restockTaskId(shelf.shelfId), placed);
                store.bumpStat("productsRestocked", placed);
                const load = state.trolleyLoad.filter((s) => s.count > 0);
                store.set({ trolleyLoad: load });
              }
              store.set({ restockProgress: { shelfId: shelf.shelfId, pct: restockAccumRef.current } });
            }
          } else {
            prompt = "Q — PARK TROLLEY";
          }
        }
      }
    }

    // 4) Empty-handed: pick up a warehouse box for the active restock task.
    if (!prompt && !heldBox && !state.pushingTrolley && !carryingCart && !carryingFallen) {
      const nextTask = store.get().tasks.find((t) => !t.done && t.type === "restock");
      if (nextTask) {
        const spawn = world.warehouse.boxSpawns.find((b) => dist(player.x, player.z, b.x, b.z) <= INTERACT_REACH);
        if (spawn) {
          const product = getProduct(nextTask.productId);
          prompt = `E — PICK UP ${product.name.toUpperCase()} BOX`;
          if (justPressed) {
            store.pickUpBox(product.id, product.boxCapacity, product.boxCapacity);
            sfx.boxPickup(soundEnabled);
            bump();
          }
        }
      }
    }

    // 5) Loose carts.
    if (!prompt && !heldBox && !carryingFallen) {
      if (carryingCart) {
        const corral = world.cartCorral;
        if (dist(player.x, player.z, corral.x, corral.z) <= 1.4) {
          carryingCart.carried = false;
          carryingCart.returned = true;
          doTaskEvent("carts", 1);
          store.bumpStat("cartsCollected", 1);
          store.addSatisfaction(1, "cart");
          sfx.cartClack(soundEnabled);
        } else {
          prompt = "Pushing cart — return it to the corral";
        }
      } else {
        const loose = carts.find((c) => !c.carried && !c.returned && dist(player.x, player.z, c.x, c.z) <= INTERACT_REACH);
        if (loose) {
          prompt = "E — PICK UP CART";
          if (justPressed) loose.carried = true;
        }
      }
    }

    // 6) Spills.
    if (!prompt) {
      const spill = spills.find((s) => !s.cleaned && dist(player.x, player.z, s.x, s.z) <= INTERACT_REACH);
      if (spill) {
        prompt = "HOLD E — CLEAN SPILL";
        if (input.interact) {
          cleaningSpill = true;
          spill.progress = Math.min(1, spill.progress + dt / SPILL_CLEAN_SECONDS);
          if (spill.progress >= 1 && !spill.cleaned) {
            spill.cleaned = true;
            doTaskEvent("spill", 1);
            store.bumpStat("spillsCleaned", 1);
            store.addSatisfaction(2, "spill");
            sfx.spillClean(soundEnabled);
          }
          setSpills((prev) => prev.map((s) => (s.id === spill.id ? { ...spill } : s)));
          store.set({ spillProgress: { id: spill.id, pct: spill.progress } });
        }
      }
    }

    // 7) Fallen items.
    if (!prompt && !heldBox) {
      if (carryingFallen) {
        const shelf = world.shelves.find((s) => s.shelfId === carryingFallen.shelfId);
        if (shelf && dist(player.x, player.z, shelf.interactPoint.x, shelf.interactPoint.z) <= INTERACT_REACH) {
          prompt = "E — PLACE ITEM";
          if (justPressed) {
            carryingFallen.state = "resolved";
            carryingFallen.resolved = true;
            doTaskEvent("fallen", 1);
            store.addSatisfaction(1, "fallen");
            sfx.placeItem(soundEnabled);
            setFallen((prev) => prev.map((f) => (f.id === carryingFallen.id ? { ...f } : f)));
          }
        } else {
          prompt = "Return the item to its shelf";
        }
      } else {
        const item = fallen.find((f) => f.state === "onFloor" && dist(player.x, player.z, f.x, f.z) <= INTERACT_REACH);
        if (item) {
          prompt = "E — PICK UP ITEM";
          if (justPressed) {
            item.state = "held";
            setFallen((prev) => prev.map((f) => (f.id === item.id ? { ...f } : f)));
          }
        }
      }
    }

    // 8) Customers who need help.
    if (!prompt) {
      const helpee = customers.find((c) => c.wantsHelp && !c.helpAnswered && dist(player.x, player.z, c.x, c.z) <= INTERACT_REACH + 0.4);
      if (helpee && !store.get().helpPrompt) {
        prompt = "E — HELP";
        if (justPressed) {
          const target = helpee.shoppingList[helpee.stopIndex] || helpee.shoppingList[0];
          const correctAisle = world.shelves.find((s) => s.shelfId === target?.shelfId)?.aisleLabel || "Aisle";
          const pool = Array.from(new Set(world.shelves.filter((s) => !s.deco).map((s) => s.aisleLabel).filter(Boolean)));
          const distractors = pool.filter((l) => l !== correctAisle);
          const options = [correctAisle, ...distractors.sort(() => Math.random() - 0.5).slice(0, 2)].sort(() => Math.random() - 0.5);
          store.set({ helpPrompt: { customerId: helpee.id, question: "Where can I find this?", options, correct: correctAisle } });
        }
      }
    }

    if (!restocking && store.get().restockProgress) store.set({ restockProgress: null });
    if (!cleaningSpill && store.get().spillProgress) store.set({ spillProgress: null });

    // ---- guidance arrow target ----
    const guidance = computeGuidance(world, store.get().tasks, heldBox, { player, carts, spills, fallen });

    if (store.get().interactPrompt !== prompt) store.set({ interactPrompt: prompt });
    const g = store.get().guidance;
    const changed = (g?.x !== guidance?.x) || (g?.z !== guidance?.z) || (g?.label !== guidance?.label);
    if (changed) { store.set({ guidance }); bump(); }
  });

  const guidanceState = store.get().guidance;

  return (
    <>
      <Environment world={world} shadowsOn={shadowsOn} />
      {world.shelves.map((s) => (
        <Shelf key={s.shelfId} shelf={s} isFridge={s.aisleId === "dairy"} highlighted={guidanceState?.shelfId === s.shelfId} />
      ))}
      <ProductInstances shelves={world.shelves} updateToken={tick} />
      <EntranceDoors x={world.layout.entrance.x} z={world.layout.entrance.z} openRef={doorOpenRef} onToggle={(open) => open && sfx.doorSlide(soundEnabled)} />
      {world.checkouts.map((c) => (
        <Checkout key={c.id} checkout={c} customerWaiting={Boolean(customersRef.current?.frontOfQueue(c.id))} />
      ))}
      {world.warehouse.boxSpawns.map((b, i) => (
        <group key={i} position={[b.x, 0.21, b.z]}>
          <Box productId={store.get().tasks.find((t) => !t.done && t.type === "restock")?.productId || "cereal"} size={0.4} />
        </group>
      ))}
      <CustomersLayer
        ref={customersRef}
        world={world}
        level={level}
        paused={paused}
        onTakeItem={(shelfId) => {
          const shelf = world.shelves.find((s) => s.shelfId === shelfId);
          if (shelf && shelf.stock > 0) {
            shelf.stock -= 1;
            bump();
          }
        }}
        onExited={() => {
          doTaskEvent("serve", 1);
          store.bumpStat("customersServed", 1);
          store.addSatisfaction(2, "served");
        }}
      />
      {carts.map((c) => (
        <CartEntity key={c.id} data={c} variant="cart" />
      ))}
      {trolleyOn && <CartEntity data={trolleyRef.current} variant="trolley" />}
      <MessesLayer spills={spills} fallen={fallen} />
      <HeldBox heldBox={store.get().heldBox} movingRef={playerRef} />
      <GuidanceArrow target={guidanceState} />
    </>
  );
}
