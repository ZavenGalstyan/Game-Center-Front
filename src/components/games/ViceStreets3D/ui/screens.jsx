/**
 * Vice Streets 3D — menus and overlays (React). Pure presentation: every
 * action calls back into ViceStreets3D.jsx, which mutates the save through
 * engine/progress.js and re-renders with the new state.
 */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { MISSIONS, ACTIVITIES } from "../data/missions.js";
import { VEHICLES, VEHICLE, PAINTS, UPGRADES, MAX_UPGRADE, upgradeCost, vehicleStats } from "../data/vehicles.js";
import { OUTFITS, CAST, PLAYER_NAME } from "../data/people.js";
import { levelInfo, levelOf, missionState, repTitle, garageCapacity, GARAGE_UPS, repairPrice, vehicleLock, MAX_LEVEL } from "../engine/progress.js";
import { DISTRICTS } from "../engine/city.js";
import { createCarModel } from "../render/cars.js";
import { fmtMoney } from "../engine/util.js";

const Btn = ({ children, onClick, kind = "", disabled, title, sub }) => (
  <button type="button" className={`vs-btn ${kind}`} onClick={onClick} disabled={disabled} title={title}>
    <span>{children}</span>
    {sub && <small>{sub}</small>}
  </button>
);
const Bar = ({ v, max = 1, color }) => (
  <span className="vs-bar">
    <i style={{ width: `${Math.max(0, Math.min(1, v / max)) * 100}%`, background: color }} />
  </span>
);

export function Logo({ small }) {
  return (
    <div className={`vs-logo ${small ? "small" : ""}`}>
      <span className="l1">VICE STREETS</span>
      <span className="l2">3D</span>
      {!small && <span className="tag">DRIVE • EXPLORE • RULE</span>}
    </div>
  );
}

export function MainMenu({ prog, next, onPlay, onContinue, onFree, onMissions, onGarage, onHow, onSettings }) {
  const L = levelInfo(prog.xp);
  const started = prog.completed.length > 0 || prog.free;
  return (
    <div className="vs-menu">
      <Logo />
      <div className="vs-menu-col">
        <Btn kind="primary" onClick={onPlay} sub={next ? `Mission ${next.id}: ${next.title}` : "All missions complete — free roam"}>
          {next ? "Play" : "Play — Free Roam"}
        </Btn>
        <Btn onClick={onContinue} disabled={!started} sub={started ? "Free roam where you left off" : "Nothing saved yet"}>
          Continue
        </Btn>
        <Btn onClick={onFree} sub="Explore the city, side jobs, shops">
          Free Roam
        </Btn>
        <Btn onClick={onMissions} sub={`${prog.completed.length} / ${MISSIONS.length} story missions`}>
          Missions
        </Btn>
        <Btn onClick={onGarage} sub={`${prog.garage.cars.length} vehicle${prog.garage.cars.length === 1 ? "" : "s"} owned`}>
          Garage
        </Btn>
        <div className="vs-row2">
          <Btn onClick={onHow}>How to Play</Btn>
          <Btn onClick={onSettings}>Settings</Btn>
        </div>
      </div>
      <div className="vs-menu-stats">
        <div>
          <b>{PLAYER_NAME}</b> · Level {L.level} · {repTitle(prog.rep)}
        </div>
        <div>
          {fmtMoney(prog.money)} · Rep {prog.rep}
        </div>
      </div>
    </div>
  );
}

const STATE_LABEL = { done: "Complete", open: "Available", locked: "Locked", rep: "Needs reputation", level: "Needs level" };
export function MissionList({ prog, onPick, onBack, onGps, inGame }) {
  return (
    <div className="vs-panel vs-wide">
      <header>
        <h2>Story Missions</h2>
        <Btn onClick={onBack}>{inGame ? "Close" : "Back"}</Btn>
      </header>
      <div className="vs-scroll vs-missions">
        {MISSIONS.map((m) => {
          const st = missionState(prog, m);
          const giver = CAST[m.giver];
          const why = st === "rep" ? `Needs ${m.req.rep} rep (you have ${prog.rep}) — do side jobs to earn more` : st === "level" ? `Needs level ${m.req.level}` : st === "locked" ? `Finish mission ${m.req.after} first` : "";
          return (
            <div key={m.id} className={`vs-mission ${st}`}>
              <div className="num">{m.id}</div>
              <div className="info">
                <b>{m.title}</b>
                <small>
                  {giver?.name} · {DISTRICTS[m.district]?.name} · {fmtMoney(m.reward.money)} · {m.reward.xp} XP
                </small>
                {why && <small className="why">{why}</small>}
              </div>
              <div className="act">
                <span className={`pill ${st}`}>{STATE_LABEL[st]}</span>
                {(st === "open" || st === "done") && <Btn kind="small" onClick={() => onPick(m)}>{st === "done" ? "Replay" : "Start"}</Btn>}
                {inGame && st === "open" && onGps && <Btn kind="small" onClick={() => onGps(m)}>GPS</Btn>}
              </div>
            </div>
          );
        })}
        <h3>Side Activities</h3>
        {ACTIVITIES.map((a) => {
          const r = prog.activity[a.id];
          return (
            <div key={a.id} className="vs-mission open">
              <div className="num">★</div>
              <div className="info">
                <b>{a.name}</b>
                <small>{a.rules}</small>
                <small>
                  Reward {fmtMoney(a.reward.money)} + {a.reward.rep} rep · played {r?.plays || 0}, won {r?.wins || 0}
                  {r?.best ? ` · best ${r.best}s` : ""}
                </small>
              </div>
              <div className="act">
                <span className="pill open">Free Roam</span>
                {inGame && onGps && <Btn kind="small" onClick={() => onGps(a)}>GPS</Btn>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Briefing({ def, activity, onStart, onCancel, prog }) {
  const giver = def.giver ? CAST[def.giver] : null;
  const replay = !activity && prog.completed.includes(def.id);
  return (
    <div className="vs-panel vs-brief">
      <div className="kicker">{activity ? "Side Activity" : `Mission ${def.id}`}</div>
      <h2>{activity ? def.name : def.title}</h2>
      {giver && (
        <div className="giver">
          {giver.name} · <i>{giver.role}</i>
        </div>
      )}
      <p>{activity ? def.rules : def.brief}</p>
      <div className="vs-rewards">
        <span>{fmtMoney(def.reward.money * (replay ? 0.4 : 1))}</span>
        <span>{Math.round(def.reward.xp * (replay ? 0.4 : 1))} XP</span>
        <span>+{replay ? 0 : def.reward.rep} Rep</span>
        {def.time && <span>⏱ {Math.floor(def.time / 60)}:{String(def.time % 60).padStart(2, "0")}</span>}
        {def.reward.car && <span>🚗 {VEHICLE[def.reward.car].name}</span>}
      </div>
      <div className="vs-row2">
        <Btn kind="primary" onClick={onStart}>Start</Btn>
        <Btn onClick={onCancel}>Not now</Btn>
      </div>
    </div>
  );
}

export function Result({ res, onRetry, onContinue, onMenu }) {
  return (
    <div className={`vs-panel vs-result ${res.win ? "win" : "lose"}`}>
      <div className="kicker">{res.kind === "activity" ? "Side Activity" : `Mission ${res.id}`}</div>
      <h2>{res.win ? (res.kind === "activity" ? "COMPLETE" : "MISSION PASSED") : "MISSION FAILED"}</h2>
      <div className="title">{res.title}</div>
      {!res.win && <p className="reason">{res.reason}</p>}
      <div className="vs-rewards">
        <span>+{fmtMoney(res.money || 0)}</span>
        <span>+{res.xp || 0} XP</span>
        <span>+{res.rep || 0} Rep</span>
        {res.t ? <span>⏱ {res.t.toFixed(1)} s</span> : null}
      </div>
      {res.notes?.length > 0 && (
        <ul className="notes">
          {res.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      <div className="vs-row3">
        <Btn onClick={onRetry}>Retry</Btn>
        <Btn kind="primary" onClick={onContinue}>Continue</Btn>
        <Btn onClick={onMenu}>Main Menu</Btn>
      </div>
    </div>
  );
}

export function Pause({ onResume, onSave, onSettings, onMenu, saved }) {
  return (
    <div className="vs-panel vs-small">
      <h2>Paused</h2>
      <div className="vs-menu-col">
        <Btn kind="primary" onClick={onResume}>Resume</Btn>
        <Btn onClick={onSave} sub={saved ? "Saved ✔" : "Saves money, cars, progress and position"}>Save</Btn>
        <Btn onClick={onSettings}>Settings</Btn>
        <Btn onClick={onMenu}>Main Menu</Btn>
      </div>
      <small className="hint">Click the game to resume · Esc releases the mouse</small>
    </div>
  );
}

export function Settings({ s, onChange, onBack }) {
  const set = (k, v) => onChange({ ...s, [k]: v });
  return (
    <div className="vs-panel vs-small">
      <header>
        <h2>Settings</h2>
        <Btn onClick={onBack}>Back</Btn>
      </header>
      <div className="vs-scroll vs-settings">
        <label>
          Volume <input type="range" min="0" max="1" step="0.05" value={s.volume} onChange={(e) => set("volume", +e.target.value)} />
        </label>
        <label>
          Mouse sensitivity <input type="range" min="0.3" max="2.5" step="0.1" value={s.sensitivity} onChange={(e) => set("sensitivity", +e.target.value)} />
        </label>
        <label>
          Camera distance <input type="range" min="0.7" max="1.5" step="0.05" value={s.camDist} onChange={(e) => set("camDist", +e.target.value)} />
        </label>
        <label>
          Graphics
          <select value={s.quality} onChange={(e) => set("quality", e.target.value)}>
            <option value="low">Low (fastest)</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label>
          Speed units
          <select value={s.units} onChange={(e) => set("units", e.target.value)}>
            <option value="kmh">km/h</option>
            <option value="mph">mph</option>
          </select>
        </label>
        <label className="chk">
          <input type="checkbox" checked={s.radio} onChange={(e) => set("radio", e.target.checked)} /> Car radio
        </label>
        <label className="chk">
          <input type="checkbox" checked={s.invertY} onChange={(e) => set("invertY", e.target.checked)} /> Invert mouse Y
        </label>
        <label className="chk">
          <input type="checkbox" checked={s.shake} onChange={(e) => set("shake", e.target.checked)} /> Camera shake
        </label>
        <label className="chk">
          <input type="checkbox" checked={s.hints} onChange={(e) => set("hints", e.target.checked)} /> Control hints
        </label>
      </div>
    </div>
  );
}

export function HowTo({ onBack }) {
  const rows = [
    ["On foot", [["WASD", "Move"], ["Mouse", "Look around"], ["Shift", "Sprint"], ["Space", "Jump"], ["E", "Enter car / talk / use / collect cash"], ["F", "Start job or mission at a marker"], ["Left click", "Punch: jab → cross → hooks (keep clicking)"], ["Right click", "Heavy: straight / uppercut / heavy hook"], ["Q", "Kick (after two punches: finishing kick)"], ["Shift + Left click", "Power punch"]]],
    ["Driving", [["W / S", "Accelerate / brake & reverse"], ["A / D", "Steer"], ["Space", "Handbrake"], ["E", "Get out (while moving: jump out and roll)"], ["C", "Near / far camera"], ["H", "Horn"], ["F", "Open garage (in the bay) / lights"]]],
    ["Anywhere", [["M", "City map (click to set a GPS waypoint)"], ["Tab", "Player profile"], ["J", "Missions & jobs"], ["Esc", "Pause / release mouse"]]],
  ];
  return (
    <div className="vs-panel vs-wide">
      <header>
        <h2>How to Play</h2>
        <Btn onClick={onBack}>Back</Btn>
      </header>
      <div className="vs-scroll vs-how">
        <p>
          You're <b>{PLAYER_NAME}</b>, new in town. Take story missions from the city's movers (pink <b>M</b> markers), earn money and reputation with side jobs (blue
          markers), buy and tune cars, and stay one step ahead of the police.
        </p>
        <div className="vs-how-grid">
          {rows.map(([t, list]) => (
            <div key={t}>
              <h3>{t}</h3>
              {list.map(([k, d]) => (
                <div key={k} className="krow">
                  <kbd>{k}</kbd>
                  <span>{d}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <h3>Wanted level</h3>
        <p>
          Ramming police, stealing cruisers, knocking people down or entering restricted areas earns stars; officers who see you driving recklessly add more. To lose
          them: break line of sight, get far away or hide in one of your garages, and stay unseen until the flashing stars run out. Stopped next to a cruiser for a
          few seconds — or grabbed on foot — and you're busted.
        </p>
        <h3>Money & progress</h3>
        <p>
          Missions, taxi fares, deliveries, races, parking and time trials pay cash, XP (level 1–{MAX_LEVEL}) and reputation. Reputation and level unlock missions,
          vehicles and outfits. Spend money at Sunrise Motors (downtown), Tío Ramón's Garage (Little Haven) for repairs, paint and performance parts, Tide & Thread
          for clothes and Rosa's Café for a meal that restores health. Progress saves automatically.
        </p>
      </div>
    </div>
  );
}

export function Profile({ prog, onClose }) {
  const L = levelInfo(prog.xp);
  return (
    <div className="vs-panel vs-wide">
      <header>
        <h2>{PLAYER_NAME}</h2>
        <Btn onClick={onClose}>Close</Btn>
      </header>
      <div className="vs-scroll vs-profile">
        <div className="big">
          <div>
            <small>Level</small>
            <b>{L.level}</b>
            <Bar v={L.frac} color="#ffd23f" />
            <small>
              {L.level >= MAX_LEVEL ? "Max level" : `${L.into} / ${L.need} XP`}
            </small>
          </div>
          <div>
            <small>Reputation</small>
            <b>{prog.rep}</b>
            <small>{repTitle(prog.rep)}</small>
          </div>
          <div>
            <small>Money</small>
            <b>{fmtMoney(prog.money)}</b>
            <small>earned {fmtMoney(prog.stats.earned)}</small>
          </div>
        </div>
        <div className="grid2">
          <div>
            <h3>Progress</h3>
            <p>Story missions: {prog.completed.length} / {MISSIONS.length}</p>
            <p>Districts: {prog.districts.map((d) => DISTRICTS[d].name).join(", ")}</p>
            <p>Landmarks found: {prog.discovered.length}</p>
            <p>Vehicles owned: {prog.garage.cars.length} / {garageCapacity(prog)}</p>
            <p>Outfits: {prog.outfits.length} / {OUTFITS.length}</p>
          </div>
          <div>
            <h3>Stats</h3>
            <p>Taxi shifts: {prog.stats.fares} · Deliveries: {prog.stats.deliveries}</p>
            <p>Races won: {prog.stats.races} · Time trials: {prog.stats.trials} · Parking: {prog.stats.parks}</p>
            <p>Busted: {prog.stats.busted} · Wasted: {prog.stats.wasted}</p>
            <p>Distance driven: {(prog.stats.driven / 1000).toFixed(1)} km</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBars({ st }) {
  const rows = [
    ["Top speed", st.top, 75, `${Math.round(st.top * 3.6)} km/h`],
    ["Acceleration", st.accel, 13, ""],
    ["Braking", st.brake, 26, ""],
    ["Handling", st.grip, 16, ""],
    ["Durability", st.hp, 300, `${Math.round(st.hp)} HP`],
  ];
  return (
    <div className="vs-stats">
      {rows.map(([n, v, m, t]) => (
        <div key={n}>
          <small>{n}</small>
          <Bar v={v} max={m} color="#3fe0ff" />
          <small className="t">{t}</small>
        </div>
      ))}
    </div>
  );
}

/** small live 3-D preview of a vehicle (own renderer, disposed on unmount) */
function Preview({ type, paint }) {
  const ref = useRef(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return undefined;
    const canvas = document.createElement("canvas");
    host.appendChild(canvas);
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch {
      canvas.remove();
      return undefined;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    // opaque backdrop: the tinted glass needs something solid to blend over
    scene.background = new THREE.Color("#241a3e");
    const floor = new THREE.Mesh(new THREE.CircleGeometry(4.5, 48), new THREE.MeshStandardMaterial({ color: "#3a2d5c", roughness: 0.6 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    scene.add(new THREE.HemisphereLight("#ffffff", "#445", 1.4));
    const d = new THREE.DirectionalLight("#fff", 2.2);
    d.position.set(4, 6, 3);
    scene.add(d);
    const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    const fake = { id: -1, type, paint, x: 0, y: 0, z: 0, h: 0, wheelRot: 0, wheelSteer: 0.25, lights: true, brakeLight: 0 };
    const model = createCarModel(fake, {});
    scene.add(model.group);
    let raf = 0;
    let a = 0.6;
    const fit = () => {
      const w = host.clientWidth || 300;
      const h = host.clientHeight || 180;
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    };
    fit();
    const loop = () => {
      a += 0.008;
      const L = VEHICLE[type].len;
      cam.position.set(Math.sin(a) * L * 1.35, L * 0.42, Math.cos(a) * L * 1.35);
      cam.lookAt(0, VEHICLE[type].hgt * 0.45, 0);
      model.update(fake, a, false, 0.016);
      renderer.render(scene, cam);
      raf = requestAnimationFrame(loop);
    };
    loop();
    const ro = new ResizeObserver(fit);
    ro.observe(host);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      model.dispose();
      floor.geometry.dispose();
      floor.material.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
      canvas.remove();
    };
  }, [type, paint]);
  return <div className="vs-preview" ref={ref} />;
}

export function Dealer({ prog, onBuy, onClose, msg }) {
  const [sel, setSel] = useState(VEHICLES[0].id);
  const v = VEHICLE[sel];
  const lock = vehicleLock(prog, sel);
  const owned = prog.garage.cars.filter((c) => c.type === sel).length;
  return (
    <div className="vs-panel vs-wide vs-shop">
      <header>
        <h2>Sunrise Motors</h2>
        <span className="money">{fmtMoney(prog.money)}</span>
        <Btn onClick={onClose}>Close</Btn>
      </header>
      <div className="vs-shop-body">
        <div className="vs-list vs-scroll">
          {VEHICLES.map((x) => {
            const l = vehicleLock(prog, x.id);
            const n = prog.garage.cars.filter((c) => c.type === x.id).length;
            return (
              <button type="button" key={x.id} className={`vs-item ${sel === x.id ? "sel" : ""} ${l ? "locked" : ""}`} onClick={() => setSel(x.id)}>
                <b>{x.name}</b>
                <small>{x.cls}</small>
                <span>{n ? `Owned ×${n}` : l ? `🔒 ${l.replace("Requires ", "")}` : fmtMoney(x.price)}</span>
              </button>
            );
          })}
        </div>
        <div className="vs-detail">
          <Preview type={sel} paint={v.paint} />
          <h3>
            {v.name} <small>{v.cls}</small>
          </h3>
          <p>{v.blurb}</p>
          <StatBars st={vehicleStats(sel)} />
          <div className="vs-row2">
            <Btn kind="primary" disabled={!!lock || prog.money < v.price} onClick={() => onBuy(sel)} sub={lock || (prog.money < v.price ? "Not enough money" : `${prog.garage.cars.length}/${garageCapacity(prog)} garage slots`)}>
              Buy {fmtMoney(v.price)}
            </Btn>
          </div>
          {owned > 0 && <small className="hint">You own {owned}. Bought cars go to your garage; pick the active one there.</small>}
          {msg && <div className="vs-msg">{msg}</div>}
        </div>
      </div>
    </div>
  );
}

export function Garage({ prog, onAct, onClose, msg, here }) {
  const [sel, setSel] = useState(prog.garage.active || prog.garage.cars[0]?.gid);
  const [tab, setTab] = useState("tune");
  const car = prog.garage.cars.find((c) => c.gid === sel) || prog.garage.cars[0];
  return (
    <div className="vs-panel vs-wide vs-shop">
      <header>
        <h2>{here ? "Tío Ramón's Garage" : "My Garage"}</h2>
        <span className="money">{fmtMoney(prog.money)}</span>
        <Btn onClick={onClose}>Close</Btn>
      </header>
      {!car ? (
        <div className="vs-empty">No vehicles yet. Complete mission 2 or buy one at Sunrise Motors.</div>
      ) : (
        <div className="vs-shop-body">
          <div className="vs-list vs-scroll">
            {prog.garage.cars.map((c) => (
              <button type="button" key={c.gid} className={`vs-item ${car.gid === c.gid ? "sel" : ""}`} onClick={() => setSel(c.gid)}>
                <b>
                  {VEHICLE[c.type].name} {prog.garage.active === c.gid ? "★" : ""}
                </b>
                <small>{VEHICLE[c.type].cls}</small>
                <Bar v={c.hp} color={c.hp > 0.5 ? "#4ade80" : c.hp > 0.25 ? "#facc15" : "#f87171"} />
              </button>
            ))}
            <small className="hint">
              Slots {prog.garage.cars.length}/{garageCapacity(prog)}
            </small>
          </div>
          <div className="vs-detail">
            <Preview type={car.type} paint={car.paint || VEHICLE[car.type].paint} />
            <h3>
              {VEHICLE[car.type].name} {prog.garage.active === car.gid && <small>Active vehicle</small>}
            </h3>
            <div className="vs-tabs">
              {["tune", "paint", "service", "garage"].map((t) => (
                <button type="button" key={t} className={tab === t ? "sel" : ""} onClick={() => setTab(t)}>
                  {{ tune: "Upgrades", paint: "Paint", service: "Service", garage: "Garage" }[t]}
                </button>
              ))}
            </div>
            {tab === "tune" && (
              <div className="vs-ups">
                {UPGRADES.map((u) => {
                  const r = car.up[u.id] | 0;
                  const cost = r < MAX_UPGRADE ? upgradeCost(car.type, u.id, r) : 0;
                  return (
                    <div key={u.id} className="vs-up">
                      <div>
                        <b>{u.name}</b>
                        <small>{u.desc}</small>
                        <span className="pips">
                          {[0, 1, 2].map((k) => (
                            <i key={k} className={k < r ? "on" : ""} />
                          ))}
                        </span>
                      </div>
                      <Btn kind="small" disabled={r >= MAX_UPGRADE || prog.money < cost} onClick={() => onAct("upgrade", car.gid, u.id)}>
                        {r >= MAX_UPGRADE ? "MAX" : fmtMoney(cost)}
                      </Btn>
                    </div>
                  );
                })}
                <StatBars st={vehicleStats(car.type, car.up)} />
              </div>
            )}
            {tab === "paint" && (
              <div className="vs-paints">
                {PAINTS.map((p) => (
                  <button type="button" key={p.id} className={`vs-swatch ${car.paint === p.hex ? "sel" : ""}`} style={{ background: p.hex || VEHICLE[car.type].paint }} onClick={() => onAct("paint", car.gid, p.id)} title={`${p.name} ${fmtMoney(p.price)}`}>
                    <small>
                      {p.name}
                      <br />
                      {p.price ? fmtMoney(p.price) : "Free"}
                    </small>
                  </button>
                ))}
              </div>
            )}
            {tab === "service" && (
              <div className="vs-service">
                <p>
                  Condition <Bar v={car.hp} color="#4ade80" /> {Math.round(car.hp * 100)}%
                </p>
                <div className="vs-row2">
                  <Btn kind="primary" disabled={car.hp >= 0.999 || prog.money < repairPrice(prog, car.gid)} onClick={() => onAct("repair", car.gid)} sub={prog.garage.up.workshop ? "Workshop lift: half price" : ""}>
                    Repair {car.hp >= 0.999 ? "" : fmtMoney(repairPrice(prog, car.gid))}
                  </Btn>
                  <Btn disabled={prog.garage.active === car.gid} onClick={() => onAct("active", car.gid)} sub={here ? "It will be waiting on the lot" : "Delivered next time you play"}>
                    {prog.garage.active === car.gid ? "Active" : "Make active"}
                  </Btn>
                </div>
                <Btn kind="small" disabled={prog.garage.cars.length <= 1} onClick={() => onAct("sell", car.gid)}>
                  Sell for {fmtMoney(Math.round((VEHICLE[car.type].price * 0.5) / 50) * 50)}
                </Btn>
              </div>
            )}
            {tab === "garage" && (
              <div className="vs-ups">
                {GARAGE_UPS.map((u) => {
                  const r = prog.garage.up[u.id] | 0;
                  const done = r >= u.prices.length;
                  return (
                    <div key={u.id} className="vs-up">
                      <div>
                        <b>{u.name}</b>
                        <small>{u.desc}</small>
                      </div>
                      <Btn kind="small" disabled={done || prog.money < u.prices[r]} onClick={() => onAct("garageUp", u.id)}>
                        {done ? "Installed" : fmtMoney(u.prices[r])}
                      </Btn>
                    </div>
                  );
                })}
              </div>
            )}
            {msg && <div className="vs-msg">{msg}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export function Clothes({ prog, onBuy, onClose, msg }) {
  const lvl = levelOf(prog);
  return (
    <div className="vs-panel vs-wide">
      <header>
        <h2>Tide & Thread</h2>
        <span className="money">{fmtMoney(prog.money)}</span>
        <Btn onClick={onClose}>Close</Btn>
      </header>
      <div className="vs-scroll vs-outfits">
        {OUTFITS.map((o) => {
          const own = prog.outfits.includes(o.id);
          const lock = o.level && lvl < o.level;
          return (
            <div key={o.id} className={`vs-outfit ${prog.outfit === o.id ? "sel" : ""}`}>
              <div className="vs-sw">
                <i style={{ background: o.top }} />
                <i style={{ background: o.accent }} />
                <i style={{ background: o.bottom }} />
                <i style={{ background: o.shoes }} />
              </div>
              <b>{o.name}</b>
              <Btn kind="small" disabled={prog.outfit === o.id || (!own && (lock || prog.money < o.price))} onClick={() => onBuy(o.id)}>
                {prog.outfit === o.id ? "Wearing" : own ? "Wear" : lock ? `Level ${o.level}` : fmtMoney(o.price)}
              </Btn>
            </div>
          );
        })}
      </div>
      {msg && <div className="vs-msg">{msg}</div>}
    </div>
  );
}

export function Cafe({ prog, hp, onEat, onClose, msg }) {
  return (
    <div className="vs-panel vs-small">
      <header>
        <h2>Rosa's Café</h2>
        <Btn onClick={onClose}>Close</Btn>
      </header>
      <p>"Sit, eat! You look like you got hit by a bus." — Rosa</p>
      <p>
        Health <Bar v={hp} max={100} color="#4ade80" /> {Math.round(hp)}%
      </p>
      <div className="vs-menu-col">
        <Btn kind="primary" disabled={hp >= 100 || prog.money < 15} onClick={() => onEat(15, 100)} sub="Restores full health">
          Cuban sandwich & mango smoothie — $15
        </Btn>
        <Btn disabled={hp >= 100 || prog.money < 5} onClick={() => onEat(5, 30)} sub="+30 health">
          Café con leche — $5
        </Btn>
      </div>
      {msg && <div className="vs-msg">{msg}</div>}
    </div>
  );
}

export function Ending({ kind, penalty, where, onContinue }) {
  return (
    <div className={`vs-ending ${kind}`}>
      <h1>{kind === "busted" ? "BUSTED" : "WASTED"}</h1>
      <p>
        {kind === "busted" ? `Fines and legal fees: ${fmtMoney(penalty)}` : `Hospital bill: ${fmtMoney(penalty)}`} · you wake up at {where}. Your progress is safe.
      </p>
      <Btn kind="primary" onClick={onContinue}>Continue</Btn>
    </div>
  );
}

export function Dialog({ d, onNext }) {
  if (!d) return null;
  const [who, text] = d.lines[d.i];
  const cast = CAST[who];
  return (
    <div className="vs-dialog" onClick={onNext} role="button" tabIndex={-1}>
      <b>{cast ? cast.name : who}</b>
      <p>{text}</p>
      <small>E / Space / click to continue · {d.i + 1}/{d.lines.length}</small>
    </div>
  );
}
