/**
 * Hill Rider — 2D hill-climb driving. Rendered inside the shared <GamePlayer>
 * (registered by name in ../registry.js); Restart / Mute / Fullscreen / Like
 * stay there. `restartSignal` starts a fresh run with the current vehicle and
 * map; `muted` silences the engine and effects.
 *
 * Coins, unlocked vehicles / maps, upgrades and best distances are saved in
 * localStorage under `hill-rider-save` (see ./data.js). Physics: ./physics.js,
 * terrain: ./terrain.js, drawing: ./render.js.
 *
 * DEV: `?hltest=1` disables the rAF loop and exposes window.__hl (advance
 * frames manually); `&hltouch=1` forces the touch pedals.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { MAPS, MAX_LEVEL, UPGRADES, VEHICLES, loadSave, tunedVehicle, upgradeCost, writeSave } from "./data.js";
import { createRun, stepWorld } from "./physics.js";
import { createView } from "./render.js";
import { createAudio } from "./audio.js";
import "./HillRider.css";

const params = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && params.has("hltest");
const FORCE_TOUCH = import.meta.env.DEV && params.has("hltouch");
const GAS_KEYS = new Set(["ArrowRight", "KeyD"]), BRAKE_KEYS = new Set(["ArrowLeft", "KeyA"]);
const REASONS = { crash: "Driver down!", flipped: "Flipped over!", fuel: "Out of fuel!" };

const Coin = () => <span className="hr-coin" aria-hidden="true" />;

function Bars({ v }) {
  const rows = [
    ["Speed", v.vmax / 32],
    ["Power", v.torque / v.mass / 4.5],
    ["Grip", v.grip / 1.4],
    ["Fuel", v.fuelTime / 60],
  ];
  return (
    <div className="hr-bars">
      {rows.map(([n, x]) => (
        <div key={n}><span>{n}</span><i><b style={{ width: `${Math.min(100, x * 100)}%` }} /></i></div>
      ))}
    </div>
  );
}

export default function HillRider({ restartSignal = 0, muted = false }) {
  const [screen, setScreen] = useState("menu"); // menu | garage | maps | play | paused | over
  const [save, setSaveState] = useState(loadSave);
  const [garageV, setGarageV] = useState(save.vehicle);
  const [result, setResult] = useState(null);
  const [touch, setTouch] = useState(FORCE_TOUCH);
  const stageRef = useRef(null), canvasRef = useRef(null);
  const viewRef = useRef(null), worldRef = useRef(null), screenRef = useRef(screen), saveRef = useRef(save);
  const audioRef = useRef(null);
  const input = useRef({ kGas: false, kBrake: false, tGas: false, tBrake: false });
  screenRef.current = screen;
  if (!audioRef.current) audioRef.current = createAudio();
  if (!worldRef.current) worldRef.current = createRun(save.map, save.vehicle, save.upgrades[save.vehicle]);

  const setSave = useCallback((fn) => {
    const next = fn(saveRef.current);
    saveRef.current = next;
    writeSave(next);
    setSaveState(next);
  }, []);
  saveRef.current = save;

  /** Idle scene behind the menus. */
  const showcase = useCallback((map, vehicle) => {
    worldRef.current = createRun(map, vehicle, saveRef.current.upgrades[vehicle]);
    viewRef.current?.reset();
  }, []);

  const startRun = useCallback(() => {
    const s = saveRef.current;
    worldRef.current = createRun(s.map, s.vehicle, s.upgrades[s.vehicle]);
    viewRef.current?.reset();
    input.current.tGas = input.current.tBrake = false;
    audioRef.current.unlock();
    audioRef.current.play("click");
    setResult(null);
    setScreen("play");
  }, []);

  /** Bank the run's coins and best distance; returns the summary. */
  const bank = useCallback(() => {
    const w = worldRef.current;
    if (w.banked) return null;
    w.banked = true;
    const earned = w.coins + w.bonus, prevBest = saveRef.current.best[w.mapId] || 0;
    setSave((s) => ({ ...s, coins: s.coins + earned, best: { ...s.best, [w.mapId]: Math.max(prevBest, w.dist) } }));
    return { dist: w.dist, coins: w.coins, bonus: w.bonus, earned, best: Math.max(prevBest, w.dist), newBest: w.dist > prevBest && w.dist > 0, reason: w.over };
  }, [setSave]);

  const drain = useCallback(() => {
    const w = worldRef.current, v = viewRef.current, a = audioRef.current;
    for (const e of w.events) {
      switch (e.type) {
        case "coin":
          a.play(e.v > 5 ? "bigcoin" : "coin");
          v.sparkle(e.x, e.y, "#ffd23f");
          break;
        case "fuel":
          a.play("fuel");
          v.sparkle(e.x, e.y, "#ff4d6d");
          v.pop("FUEL!", "#ff8fa3");
          break;
        case "flip":
          a.play("flip");
          v.pop(`${e.n > 1 ? ["", "", "DOUBLE ", "TRIPLE "][Math.min(3, e.n)] || "MEGA " : ""}${e.back ? "BACK" : "FRONT"} FLIP +${e.pts}`, "#ffd23f", true);
          break;
        case "air":
          a.play("air");
          v.pop(`AIR TIME ${e.secs.toFixed(1)}s +${e.pts}`, "#8ecae6");
          break;
        case "land":
          if (e.force > 3) a.play("land", e.force);
          if (e.force > 5) for (const wh of w.wheels) v.puff(wh.x, wh.y - wh.r, w.map.dust, Math.min(12, e.force | 0), 1.4, 1.2);
          if (e.force > 11) v.shake = Math.min(1, e.force / 25);
          break;
        case "fuelOut":
          a.play("fuelOut");
          v.pop("OUT OF FUEL", "#ff4d6d", true);
          break;
        case "over":
          if (e.reason !== "fuel") (a.play("crash"), (v.shake = 1));
          break;
        case "done": {
          a.engine(null);
          const r = bank();
          if (r) (setResult(r), setScreen("over"));
          break;
        }
      }
    }
    w.events.length = 0;
  }, [bank]);

  // canvas + single animation loop
  useEffect(() => {
    const stage = stageRef.current;
    const view = createView(canvasRef.current);
    viewRef.current = view;
    let t = 0;
    const frame = (dt) => {
      t += dt;
      const s = screenRef.current, w = worldRef.current, inp = input.current, a = audioRef.current;
      if (s === "play") {
        stepWorld(w, dt, { gas: inp.kGas || inp.tGas, brake: inp.kBrake || inp.tBrake });
        view.emit(w, dt);
        drain();
        const drive = w.wheels.reduce((m, wh) => Math.max(m, Math.abs(wh.s * wh.r)), 0);
        a.engine(w.over ? null : Math.min(1, drive / w.v.vmax), w.throttle);
      } else {
        if (s !== "paused") stepWorld(w, dt, {});
        w.events.length = 0;
        a.engine(null);
      }
      view.draw(w, { dt: s === "paused" ? 0 : dt, t, best: saveRef.current.best[w.mapId] || 0, hud: s === "play" || s === "paused" });
    };
    const fit = () => {
      const r = stage.getBoundingClientRect();
      if (r.width && r.height) view.resize(r.width, r.height, Math.min(2, window.devicePixelRatio || 1)), frame(0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    let raf = 0, last = performance.now();
    if (TEST) {
      window.__hl = {
        world: () => worldRef.current,
        screen: () => screenRef.current,
        save: () => saveRef.current,
        input: input.current,
        view,
        fit,
        driver: null,
        advance(n = 1, dt = 1 / 60) {
          for (let k = 0; k < n; k++) {
            if (this.driver) Object.assign(input.current, this.driver(worldRef.current));
            frame(dt);
          }
        },
      };
    } else {
      const loop = (now) => {
        frame(Math.min(0.05, (now - last) / 1000));
        last = now;
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      audioRef.current.engine(null);
      if (TEST) delete window.__hl;
    };
  }, [drain]);

  useEffect(() => () => audioRef.current.close(), []);
  useEffect(() => audioRef.current.setMuted(muted), [muted]);

  // touch pedals on coarse pointers
  useEffect(() => {
    if (FORCE_TOUCH || !window.matchMedia) return;
    const mq = window.matchMedia("(pointer: coarse)");
    const on = () => setTouch(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  // GamePlayer Restart -> fresh run
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    startRun();
  }, [restartSignal, startRun]);

  const togglePause = useCallback(() => {
    const s = screenRef.current;
    if (s === "play") setScreen("paused");
    else if (s === "paused") setScreen("play");
  }, []);

  // keyboard
  useEffect(() => {
    const set = (e, down) => {
      const s = screenRef.current;
      if (e.target.closest?.("input, textarea, select")) return;
      const inp = input.current;
      if (GAS_KEYS.has(e.code) || BRAKE_KEYS.has(e.code)) {
        if (s === "play" || s === "paused") e.preventDefault();
        if (GAS_KEYS.has(e.code)) inp.kGas = down;
        else inp.kBrake = down;
      } else if (down && (e.code === "KeyP" || e.code === "Escape") && (s === "play" || s === "paused")) {
        e.preventDefault();
        togglePause();
      } else if (down && (e.code === "ArrowUp" || e.code === "ArrowDown" || e.code === "Space") && s === "play") e.preventDefault();
    };
    const down = (e) => set(e, true), up = (e) => set(e, false);
    const blur = () => Object.assign(input.current, { kGas: false, kBrake: false, tGas: false, tBrake: false });
    const hide = () => document.hidden && screenRef.current === "play" && setScreen("paused");
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [togglePause]);

  const pedal = (key) => ({
    onPointerDown: (e) => {
      e.preventDefault();
      input.current[key] = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId); // keep the pedal held if the finger slides off
      } catch {
        /* pointer already gone */
      }
      audioRef.current.unlock();
    },
    onPointerUp: () => (input.current[key] = false),
    onPointerCancel: () => (input.current[key] = false),
    onLostPointerCapture: () => (input.current[key] = false),
    onContextMenu: (e) => e.preventDefault(),
  });

  /* ---------- shop actions ---------- */
  const click = () => audioRef.current.play("click");
  const spend = (cost, apply) => {
    if (saveRef.current.coins < cost) return audioRef.current.play("deny");
    audioRef.current.play("buy");
    setSave((s) => apply({ ...s, coins: s.coins - cost }));
  };
  const pickVehicle = (id) => {
    click();
    setGarageV(id);
    if (save.owned[id]) setSave((s) => ({ ...s, vehicle: id }));
    showcase(save.map, id);
  };
  const buyVehicle = (id) => spend(VEHICLES[id].price, (s) => ({ ...s, owned: { ...s.owned, [id]: true }, vehicle: id }));
  const buyUpgrade = (id, key) => {
    const lvl = save.upgrades[id]?.[key] || 0;
    if (lvl >= MAX_LEVEL) return;
    spend(upgradeCost(id, lvl), (s) => ({ ...s, upgrades: { ...s.upgrades, [id]: { ...s.upgrades[id], [key]: lvl + 1 } } }));
    setTimeout(() => showcase(saveRef.current.map, id));
  };
  const pickMap = (id) => {
    click();
    if (save.maps[id]) {
      setSave((s) => ({ ...s, map: id }));
      showcase(id, save.vehicle);
    }
  };
  const buyMap = (id) => {
    spend(MAPS[id].price, (s) => ({ ...s, maps: { ...s.maps, [id]: true }, map: id }));
    setTimeout(() => showcase(id, saveRef.current.vehicle));
  };
  const go = (s) => {
    click();
    if (s === "menu" || s === "garage" || s === "maps") {
      const cur = saveRef.current;
      if (worldRef.current.mapId !== cur.map || worldRef.current.v.id !== cur.vehicle || screenRef.current === "over" || screenRef.current === "paused") showcase(cur.map, cur.vehicle);
    }
    if (s === "garage") setGarageV(saveRef.current.vehicle);
    setScreen(s);
  };
  const quit = () => {
    bank();
    go("menu");
  };

  const gv = VEHICLES[garageV], gUp = save.upgrades[garageV] || {}, owned = !!save.owned[garageV];

  return (
    <div className="hr">
      <div ref={stageRef} className="hr-stage">
        <canvas ref={canvasRef} className="hr-canvas" />

        {screen === "play" && (
          <>
            <button type="button" className="hr-pause" onClick={togglePause} aria-label="Pause"><span /><span /></button>
            {touch && (
              <div className="hr-pedals">
                <button type="button" className="hr-pedal hr-pedal--brake" aria-label="Brake / reverse" {...pedal("tBrake")}>BRAKE</button>
                <button type="button" className="hr-pedal hr-pedal--gas" aria-label="Gas" {...pedal("tGas")}>GAS</button>
              </div>
            )}
          </>
        )}

        {screen === "menu" && (
          <div className="hr-overlay hr-overlay--side">
            <div className="hr-panel hr-menu">
              <h2 className="hr-title">Hill <span>Rider</span></h2>
              <p className="hr-tag">DRIVE • CLIMB • CONQUER</p>
              <p className="hr-wallet"><Coin />{save.coins}</p>
              <p className="hr-sub">{VEHICLES[save.vehicle].name} · {MAPS[save.map].name} · Best {save.best[save.map] || 0} m</p>
              <div className="hr-row">
                <button type="button" className="hr-btn hr-btn--main" onClick={() => go("maps")}>Drive!</button>
                <button type="button" className="hr-btn" onClick={() => go("garage")}>Garage</button>
              </div>
              <p className="hr-hint">{touch ? "Hold GAS / BRAKE to drive · lean in the air" : "→ / D gas · ← / A brake & reverse · P pause"}</p>
            </div>
          </div>
        )}

        {screen === "garage" && (
          <div className="hr-overlay hr-overlay--side">
            <div className="hr-panel hr-garage">
              <header className="hr-bar">
                <h3>Garage</h3>
                <p className="hr-wallet"><Coin />{save.coins}</p>
              </header>
              <div className="hr-vehicles" role="tablist" aria-label="Vehicles">
                {Object.entries(VEHICLES).map(([id, v]) => (
                  <button key={id} type="button" role="tab" aria-selected={garageV === id} className={`hr-vcard${garageV === id ? " is-on" : ""}${save.owned[id] ? "" : " is-locked"}`} onClick={() => pickVehicle(id)} style={{ "--c": v.color }}>
                    <b>{v.name}</b>
                    <small>{save.vehicle === id ? "Driving" : save.owned[id] ? "Owned" : <><Coin />{v.price}</>}</small>
                  </button>
                ))}
              </div>
              <p className="hr-sub">{gv.blurb}</p>
              <Bars v={tunedVehicle(garageV, gUp)} />
              {owned ? (
                <div className="hr-ups">
                  {Object.entries(UPGRADES).map(([key, u]) => {
                    const lvl = gUp[key] || 0, cost = lvl < MAX_LEVEL ? upgradeCost(garageV, lvl) : 0;
                    return (
                      <div key={key} className="hr-up">
                        <div><b>{u.name}</b><small>{u.desc}</small></div>
                        <span className="hr-pips" aria-label={`Level ${lvl} of ${MAX_LEVEL}`}>{Array.from({ length: MAX_LEVEL }, (_, k) => <i key={k} className={k < lvl ? "is-on" : ""} />)}</span>
                        <button type="button" className="hr-btn hr-btn--small" disabled={lvl >= MAX_LEVEL || save.coins < cost} onClick={() => buyUpgrade(garageV, key)}>
                          {lvl >= MAX_LEVEL ? "MAX" : <><Coin />{cost}</>}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <button type="button" className="hr-btn hr-btn--main" disabled={save.coins < gv.price} onClick={() => buyVehicle(garageV)}>
                  Unlock for <Coin />{gv.price}
                </button>
              )}
              <div className="hr-row">
                <button type="button" className="hr-btn" onClick={() => go("menu")}>Back</button>
                <button type="button" className="hr-btn hr-btn--main" onClick={() => go("maps")}>Drive!</button>
              </div>
            </div>
          </div>
        )}

        {screen === "maps" && (
          <div className="hr-overlay">
            <div className="hr-panel hr-maps">
              <header className="hr-bar">
                <h3>Choose a map</h3>
                <p className="hr-wallet"><Coin />{save.coins}</p>
              </header>
              <div className="hr-mapgrid">
                {Object.entries(MAPS).map(([id, m]) => {
                  const open = !!save.maps[id];
                  return (
                    <div key={id} className={`hr-map${save.map === id ? " is-on" : ""}${open ? "" : " is-locked"}`} style={{ "--s0": m.sky[0], "--s1": m.mid, "--g": m.top }}>
                      <button type="button" className="hr-map-pick" onClick={() => pickMap(id)} disabled={!open} aria-pressed={save.map === id}>
                        <span className="hr-map-art" aria-hidden="true" />
                        <b>{m.name}</b>
                        <small>{open ? `Best ${save.best[id] || 0} m` : m.blurb}</small>
                      </button>
                      {!open && (
                        <button type="button" className="hr-btn hr-btn--small" disabled={save.coins < m.price} onClick={() => buyMap(id)}>
                          Unlock <Coin />{m.price}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="hr-row">
                <button type="button" className="hr-btn" onClick={() => go("garage")}>Garage</button>
                <button type="button" className="hr-btn hr-btn--main" onClick={startRun}>Start · {MAPS[save.map].name}</button>
              </div>
            </div>
          </div>
        )}

        {screen === "paused" && (
          <div className="hr-overlay">
            <div className="hr-panel hr-menu">
              <h3 className="hr-head">Paused</h3>
              <p className="hr-sub">{worldRef.current.dist} m · <Coin />{worldRef.current.coins + worldRef.current.bonus}</p>
              <div className="hr-col">
                <button type="button" className="hr-btn hr-btn--main" onClick={togglePause}>Resume</button>
                <button type="button" className="hr-btn" onClick={startRun}>Restart</button>
                <button type="button" className="hr-btn" onClick={quit}>Quit to Menu</button>
              </div>
            </div>
          </div>
        )}

        {screen === "over" && result && (
          <div className="hr-overlay">
            <div className="hr-panel hr-menu">
              <p className="hr-kicker">{result.newBest ? "★ New best distance ★" : MAPS[worldRef.current.mapId].name}</p>
              <h3 className="hr-head">{REASONS[result.reason] || "Run over"}</h3>
              <div className="hr-stats">
                <div><span>Distance</span><b>{result.dist} m</b></div>
                <div><span>Best</span><b>{result.best} m</b></div>
                <div><span>Coins</span><b>+{result.coins}</b></div>
                <div><span>Bonus</span><b>+{result.bonus}</b></div>
              </div>
              <p className="hr-wallet"><Coin />{save.coins}</p>
              <div className="hr-row">
                <button type="button" className="hr-btn hr-btn--main" onClick={startRun}>Retry</button>
                <button type="button" className="hr-btn" onClick={() => go("garage")}>Garage</button>
                <button type="button" className="hr-btn" onClick={() => go("menu")}>Menu</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
