/**
 * My Little Buddy — a cosy virtual pet. Feed, wash, put to bed and play
 * mini-games with an original sprout-mochi buddy across four rooms. Rendered
 * inside the shared <GamePlayer> (registered by name in ../registry.js);
 * Restart / Mute / Fullscreen / Like stay there.
 *
 * `restartSignal` (GamePlayer Restart) only resets the active interaction —
 * it restarts the running mini-game, or closes panels and rinses off soap.
 * Saved pet progress is never touched; "New Pet" (Trophies panel) is the
 * separate, confirmed reset. Progress lives in localStorage under
 * `my-little-buddy-save` (see logic.js).
 *
 * DEV: `?mlbtest=1` exposes window.__mlb (see the bottom of the component).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ACHIEVEMENTS, COLORS, FOODS, ITEMS, ITEM_BY_ID, ROOMS } from "./data.js";
import {
  STATS, buyFood, buyItem, canPlay, claimDaily, clamp, dailyAmount, dailyReady, feed, finishGame,
  isLocked, load, mood, newSave, nextStreak, persist, petBuddy, resume, rinse, setSleep, tick, toggleItem, wish, xpNeeded,
} from "./logic.js";
import { Buddy, DecorIcon, FoodArt, Icon, WearArt } from "./art.jsx";
import { GlowLayer, RoomScene, roomDecor } from "./rooms.jsx";
import { GAMES, GameOverlay } from "./minigames.jsx";
import { createAudio } from "./audio.js";
import "./MyLittleBuddy.css";

const TEST = import.meta.env.DEV && new URLSearchParams(window.location.search).has("mlbtest");
const BED = 2, BATH = 1;
const NEED = { hunger: ["Hunger", "hunger"], happy: ["Happiness", "happy"], clean: ["Cleanliness", "clean"], energy: ["Energy", "energy"] };
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const fmtAway = (ms) => {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days`;
};

function init() {
  const now = Date.now();
  const loaded = load(now);
  return loaded ? resume(loaded, now) : { s: newSave(now), ev: [{ type: "hello" }] };
}

function Meter({ k, v }) {
  const [label, icon] = NEED[k];
  const tone = v > 60 ? "ok" : v > 30 ? "mid" : "low";
  return (
    <div className={`mlb-meter is-${tone}`} title={`${label}: ${Math.round(v)}%`} role="meter" aria-label={label} aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <svg viewBox="0 0 36 36" className="mlb-meter__ring" aria-hidden="true">
        <circle cx="18" cy="18" r="15.5" className="mlb-meter__track" />
        <circle cx="18" cy="18" r="15.5" className="mlb-meter__fill" pathLength="100" strokeDasharray={`${v} 100`} />
      </svg>
      <Icon name={icon} />
    </div>
  );
}

export default function MyLittleBuddy({ restartSignal = 0, muted = false }) {
  const [boot] = useState(init);
  const [save, setSave] = useState(boot.s);
  const saveRef = useRef(save);
  const audio = useMemo(() => createAudio(), []);
  const sfx = useCallback((n) => audio.play(n), [audio]);
  useEffect(() => audio.setMuted(muted), [audio, muted]);
  useEffect(() => () => audio.dispose(), [audio]);

  const [room, setRoom] = useState(() => (boot.s.sleeping ? BED : 0));
  const [panel, setPanel] = useState(null);
  const [shopTab, setShopTab] = useState("food");
  const [tool, setTool] = useState(null);
  const [foam, setFoam] = useState([]);
  const [game, setGame] = useState(null);
  const [anim, setAnim] = useState(null);
  const [speech, setSpeech] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [hearts, setHearts] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [coinPulse, setCoinPulse] = useState(0);
  const [draft, setDraft] = useState({ name: "", color: "mint" });

  const foamRef = useRef(foam);
  foamRef.current = foam;
  const gameRef = useRef(game);
  gameRef.current = game;
  const roomRef = useRef(room);
  roomRef.current = room;
  const sceneRef = useRef(null);
  const petRef = useRef(null);
  const downRef = useRef(false);
  const throttle = useRef({});
  const uid = useRef(0);

  /* ---------- events from logic → sounds, speech, toasts ---------- */
  const say = useCallback((text) => setSpeech({ text, key: ++uid.current }), []);
  const toast = useCallback((text, kind = "info") => {
    const id = ++uid.current;
    setToasts((t) => [...t.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);
  const flash = useCallback((type, ms, extra) => {
    const key = ++uid.current;
    setAnim({ type, key, ...extra });
    setTimeout(() => setAnim((a) => (a && a.key === key ? null : a)), ms);
  }, []);
  const every = (name, ms) => {
    const now = performance.now();
    if (now - (throttle.current[name] || 0) < ms) return false;
    throttle.current[name] = now;
    return true;
  };

  const handle = (e) => {
    switch (e.type) {
      case "say": say(e.text); break;
      case "refuse": say(e.text); sfx("refuse"); flash("refuse", 650); break;
      case "error": say(e.text); sfx("error"); break;
      case "eat":
        sfx("chomp");
        setTimeout(() => sfx("yum"), 450);
        flash("eat", 1100, { food: e.id });
        say(pick(["Yum!", "Nom nom!", "Delicious!", "More please!"]));
        break;
      case "giggle": sfx("giggle"); flash("joy", 700); break;
      case "coins": setCoinPulse((n) => n + 1); break;
      case "level": sfx("level"); toast(`Level ${e.level}! +${e.bonus} coins`, "level"); flash("hop", 900); break;
      case "ach": sfx("ach"); toast(`${e.title} · +${e.reward} coins`, "ach"); break;
      case "buy": sfx("buy"); if (e.id) flash("joy", 800); break;
      case "equip": sfx("tap"); break;
      case "lamp": sfx("lamp"); if (e.on) say("Good night…"); break;
      case "daily": sfx("win"); toast(`Daily gift claimed! ${e.streak}-day streak`, "gift"); break;
      case "welcome": toast(`Welcome back! You were away ${fmtAway(e.away)}.`, "info"); say(e.slept ? "What a nice nap!" : "I missed you!"); break;
      case "hello": say(`Hi! I'm ${saveRef.current.name}!`); break;
      default:
    }
  };
  const handleRef = useRef(handle);
  handleRef.current = handle;

  const apply = useCallback((fn, ...args) => {
    const r = fn(saveRef.current, Date.now(), ...args);
    saveRef.current = r.s;
    setSave(r.s);
    r.ev.forEach((e) => handleRef.current(e));
    return r;
  }, []);

  /* ---------- lifecycle: boot greeting, clock, autosave ---------- */
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    boot.ev.forEach((e) => handleRef.current(e));
  }, [boot]);

  useEffect(() => {
    const t = setInterval(() => apply(tick), 1000);
    return () => clearInterval(t);
  }, [apply]);

  useEffect(() => persist(save), [save]);
  useEffect(() => {
    const flush = () => persist(tick(saveRef.current, Date.now()).s);
    const vis = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", vis);
      flush();
    };
  }, []);

  // the buddy asks for what it needs now and then
  useEffect(() => {
    const t = setInterval(() => {
      if (gameRef.current) return;
      const w = wish(saveRef.current);
      if (w) say(w);
    }, 11000);
    return () => clearInterval(t);
  }, [say]);

  // speech bubbles fade on their own
  useEffect(() => {
    if (!speech) return;
    const t = setTimeout(() => setSpeech(null), 2400);
    return () => clearTimeout(t);
  }, [speech]);

  /* ---------- rooms ---------- */
  const goRoom = useCallback((i) => {
    const n = (i + ROOMS.length) % ROOMS.length;
    if (n === roomRef.current) return;
    sfx("whoosh");
    roomRef.current = n;
    setRoom(n);
    if (n !== BED && saveRef.current.sleeping) apply(setSleep, false);
    setTool(null);
    setFoam([]);
    setCursor(null);
  }, [apply, sfx]);

  useEffect(() => {
    const key = (e) => {
      if (gameRef.current || e.target?.tagName === "INPUT") return;
      if (e.code === "ArrowLeft") goRoom(roomRef.current - 1);
      else if (e.code === "ArrowRight") goRoom(roomRef.current + 1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [goRoom]);

  /* ---------- touching, scrubbing, rinsing ---------- */
  const local = (e) => {
    const r = petRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const onBody = (p) => ((p.x - 0.5) / 0.36) ** 2 + ((p.y - 0.6) / 0.33) ** 2 < 1;
  const scenePct = (e) => {
    const r = sceneRef.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  };

  const scrubAt = (p, t = tool) => {
    if (!onBody(p) || saveRef.current.sleeping) return;
    if (t === "soap") {
      const f = foamRef.current;
      if (f.length >= 18 || f.some((b) => Math.hypot(b.x - p.x, b.y - p.y) < 0.07)) return;
      const next = [...f, { id: ++uid.current, x: p.x, y: p.y, r: 9 + Math.random() * 7 }];
      foamRef.current = next;
      setFoam(next);
      if (every("scrub", 90)) sfx("scrub");
      if (every("joy", 500)) flash("joy", 450);
    } else if (t === "shower") {
      const f = foamRef.current;
      const keep = f.filter((b) => Math.hypot(b.x - p.x, b.y - p.y) > 0.17);
      if (every("splash", 260)) sfx("splash");
      if (keep.length < f.length) {
        foamRef.current = keep;
        setFoam(keep);
        apply(rinse, f.length - keep.length);
        if (every("joy", 500)) flash("joy", 450);
      } else if (!f.length && saveRef.current.stats.clean < 100 && every("hint", 3000)) say("Soap me up first!");
    }
  };

  const onPointerDown = (e) => {
    downRef.current = true;
    if (!petRef.current) return;
    const p = local(e);
    if (room === BATH && tool) {
      setCursor({ ...scenePct(e), on: true });
      return scrubAt(p);
    }
    if (onBody(p) && every("pet", 350)) {
      apply(petBuddy);
      if (!saveRef.current.sleeping) {
        const h = { id: ++uid.current, ...scenePct(e) };
        setHearts((hs) => [...hs.slice(-5), h]);
        setTimeout(() => setHearts((hs) => hs.filter((x) => x !== h)), 900);
      }
    }
  };
  const onPointerMove = (e) => {
    if (!petRef.current) return;
    const p = local(e);
    petRef.current.style.setProperty("--lx", clamp((p.x - 0.5) * 2, -1, 1).toFixed(2));
    petRef.current.style.setProperty("--ly", clamp((p.y - 0.45) * 2, -1, 1).toFixed(2));
    if (room === BATH && tool) {
      setCursor({ ...scenePct(e), on: downRef.current });
      if (downRef.current) scrubAt(p);
    }
  };
  const onPointerUp = () => {
    downRef.current = false;
    setCursor((c) => (c ? { ...c, on: false } : c));
  };

  /* ---------- mini-games ---------- */
  const startGame = (id) => {
    const s = saveRef.current;
    if (!canPlay(s)) {
      sfx("error");
      return say(s.sleeping ? "Zzz…" : "Too tired to play… let me sleep!");
    }
    sfx("tap");
    setGame({ id, key: ++uid.current, auto: false });
  };
  const finish = useCallback((id, r) => apply(finishGame, id, r).result, [apply]);
  const replay = () => setGame((g) => g && { ...g, key: ++uid.current, auto: true });

  /* ---------- GamePlayer Restart: reset the active interaction only ---------- */
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (gameRef.current) {
      if (canPlay(saveRef.current)) setGame((g) => g && { ...g, key: ++uid.current, auto: true });
      else setGame(null);
    } else {
      setPanel(null);
      setTool(null);
      setFoam([]);
      setCursor(null);
      setAnim(null);
      setSpeech(null);
    }
  }, [restartSignal]);

  /* ---------- new pet (confirmed full reset) ---------- */
  const adopt = () => {
    const s = newSave(Date.now(), { name: draft.name.trim().slice(0, 14) || "Buddy", color: draft.color });
    saveRef.current = s;
    setSave(s);
    persist(s);
    setPanel(null);
    setGame(null);
    setTool(null);
    setFoam([]);
    setRoom(0);
    sfx("level");
    say(`Hi! I'm ${s.name}!`);
  };

  /* ---------- derived view ---------- */
  const s = save;
  const now = Date.now();
  const ready = dailyReady(s, now);
  const decorHere = (rid) => roomDecor(s.decor, ITEM_BY_ID, rid);
  const face = s.sleeping ? "sleep"
    : anim?.type === "eat" ? "eat"
    : anim?.type === "joy" || anim?.type === "hop" ? "joy"
    : anim?.type === "refuse" ? "meh"
    : mood(s);
  const dirt = Math.min(6, Math.floor((100 - s.stats.clean) / 13));
  const xpPct = (s.xp / xpNeeded(s.level)) * 100;
  const aside = panel === "shop";

  if (TEST) {
    window.__mlb = {
      save: () => saveRef.current, apply, logic: { feed, buyFood, buyItem, toggleItem, petBuddy, rinse, setSleep, finishGame, claimDaily, tick },
      setSave: (fn) => { const n = fn(saveRef.current); saveRef.current = n; setSave(n); },
      goRoom, setPanel, setTool, startGame, foam: () => foamRef.current, scrubAt, game: () => gameRef.current, room: () => roomRef.current,
    };
  }

  return (
    <div className="mlb">
      <div
        className={`mlb-scene${room === BATH && tool ? " is-tool" : ""}${s.sleeping ? " is-night" : ""}`}
        ref={sceneRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div className="mlb-strip" style={{ transform: `translateX(${-room * 25}%)` }}>
          {ROOMS.map((r) => (
            <div key={r.id} className={`mlb-room mlb-room--${r.id}`}>
              <RoomScene id={r.id} decor={decorHere(r.id)} />
            </div>
          ))}
        </div>

        <div className={`mlb-pet${aside ? " is-aside" : ""}${anim ? ` is-${anim.type}` : ""}${s.sleeping ? " is-asleep" : ""}`} ref={petRef}>
          <div key={anim?.type === "hop" || anim?.type === "joy" ? anim.key : "idle"} className="mlb-pet__bounce">
            <Buddy color={s.color} face={face} hat={s.hat} glasses={s.glasses} dirt={dirt} foam={foam} food={anim?.type === "eat" ? anim.food : null} />
          </div>
          {speech && !game && <div key={speech.key} className="mlb-say">{speech.text}</div>}
        </div>

        <div className={`mlb-dark${s.sleeping ? " is-on" : ""}`} />
        <GlowLayer on={s.sleeping && s.decor.includes("starlights")} />
        {s.sleeping && <div className="mlb-zzz" aria-hidden="true"><span>z</span><span>z</span><span>Z</span></div>}

        {hearts.map((h) => <span key={h.id} className="mlb-heart" style={{ left: `${h.x}%`, top: `${h.y}%` }}>♥</span>)}
        {room === BATH && tool && cursor && (
          <div className={`mlb-cursor is-${tool}${cursor.on ? " is-on" : ""}`} style={{ left: `${cursor.x}%`, top: `${cursor.y}%` }}>
            <Icon name={tool} />
          </div>
        )}
      </div>

      {/* ---------- HUD ---------- */}
      <div className="mlb-hud">
        <div className="mlb-lv" title={`Level ${s.level} · ${Math.floor(s.xp)}/${xpNeeded(s.level)} XP`}>
          <span className="mlb-lv__n">{s.level}</span>
          <div className="mlb-lv__info">
            <b>{s.name}</b>
            <div className="mlb-xp"><i style={{ width: `${xpPct}%` }} /></div>
          </div>
        </div>
        <div className="mlb-needs">{STATS.map((k) => <Meter key={k} k={k} v={s.stats[k]} />)}</div>
        <div className="mlb-top">
          <span key={coinPulse} className="mlb-coins"><Icon name="coin" />{s.coins}</span>
          <button type="button" className={`mlb-ibtn${ready ? " has-dot" : ""}`} onClick={() => (sfx("tap"), setPanel("daily"))} aria-label="Daily gift"><Icon name="gift" /></button>
          <button type="button" className="mlb-ibtn" onClick={() => (sfx("tap"), setPanel("trophies"))} aria-label="Trophies and progress"><Icon name="trophy" /></button>
          <button type="button" className="mlb-ibtn mlb-ibtn--shop" onClick={() => (sfx("tap"), setPanel("shop"))} aria-label="Shop"><Icon name="bag" /></button>
        </div>
      </div>

      <div className="mlb-roomname">
        <b>{ROOMS[room].name}</b>
        <span className="mlb-dots">{ROOMS.map((r, i) => <i key={r.id} className={i === room ? "is-on" : ""} />)}</span>
      </div>
      <button type="button" className="mlb-nav mlb-nav--l" onClick={() => goRoom(room - 1)} aria-label={`Go to ${ROOMS[(room + 3) % 4].name}`}><Icon name="left" /></button>
      <button type="button" className="mlb-nav mlb-nav--r" onClick={() => goRoom(room + 1)} aria-label={`Go to ${ROOMS[(room + 1) % 4].name}`}><Icon name="right" /></button>

      {/* ---------- room actions ---------- */}
      <div className="mlb-tray">
        {room === 0 && (
          <div className="mlb-foods">
            {FOODS.map((f) => {
              const have = s.food[f.id] || 0, locked = isLocked(f, s);
              return (
                <button key={f.id} type="button" className={`mlb-food${locked ? " is-locked" : ""}`} onClick={() => apply(feed, f.id)} disabled={s.sleeping} aria-label={`${f.name}${have ? ` (${have})` : `, ${f.price} coins`}`}>
                  <FoodArt id={f.id} />
                  {locked ? <span className="mlb-tag"><Icon name="lock" />{f.level}</span>
                    : have ? <span className="mlb-tag mlb-tag--n">×{have}</span>
                    : <span className="mlb-tag"><Icon name="coin" />{f.price}</span>}
                </button>
              );
            })}
          </div>
        )}
        {room === BATH && (
          <div className="mlb-tools">
            {["soap", "shower"].map((t) => (
              <button key={t} type="button" className={`mlb-tool${tool === t ? " is-on" : ""}`} aria-pressed={tool === t} onClick={() => (sfx("tap"), setTool(tool === t ? null : t))}>
                <Icon name={t} /><span>{t === "soap" ? "Soap" : "Shower"}</span>
              </button>
            ))}
            <p className="mlb-hint">{tool === "soap" ? "Rub your buddy to lather up!" : tool === "shower" ? `Rinse off the bubbles${foam.length ? ` (${foam.length})` : ""}` : `Clean: ${Math.round(s.stats.clean)}%`}</p>
          </div>
        )}
        {room === BED && (
          <div className="mlb-tools">
            <button type="button" className={`mlb-tool mlb-tool--wide${s.sleeping ? " is-on" : ""}`} onClick={() => apply(setSleep, !s.sleeping)}>
              <Icon name={s.sleeping ? "bulb" : "moon"} /><span>{s.sleeping ? "Lights on" : "Lights off"}</span>
            </button>
            <p className="mlb-hint">{s.sleeping ? `Recharging… ${Math.floor(s.stats.energy)}%` : `Energy: ${Math.floor(s.stats.energy)}%`}</p>
          </div>
        )}
        {room === 3 && (
          <div className="mlb-tools">
            {Object.entries(GAMES).map(([id, g]) => (
              <button key={id} type="button" className="mlb-tool mlb-tool--game" onClick={() => startGame(id)}>
                <Icon name={g.icon} /><span>{g.name}</span><small><Icon name="energy" />8</small>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mlb-toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`mlb-toast is-${t.kind}`}><Icon name={t.kind === "ach" ? "trophy" : t.kind === "gift" ? "gift" : t.kind === "level" ? "star" : "paw"} />{t.text}</div>)}
      </div>

      {/* ---------- panels ---------- */}
      {panel && (
        <div className={`mlb-modal${aside ? " is-aside" : ""}`} onPointerDown={(e) => e.target === e.currentTarget && setPanel(null)}>
          <div className="mlb-sheet" role="dialog" aria-label={panel}>
            <div className="mlb-sheet__head">
              <h3>{{ shop: "Shop", trophies: "Progress", daily: "Daily Gift", newpet: "New Pet" }[panel]}</h3>
              {panel === "shop" && <span className="mlb-coins mlb-coins--sm"><Icon name="coin" />{s.coins}</span>}
              <button type="button" className="mlb-x" onClick={() => setPanel(null)} aria-label="Close"><Icon name="close" /></button>
            </div>

            {panel === "shop" && <>
              <div className="mlb-tabs" role="tablist">
                {[["food", "Food"], ["hat", "Hats"], ["glasses", "Glasses"], ["decor", "Decor"]].map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={shopTab === id} className={shopTab === id ? "is-on" : ""} onClick={() => setShopTab(id)}>{label}</button>
                ))}
              </div>
              <div className="mlb-sheet__body mlb-grid">
                {shopTab === "food" && FOODS.map((f) => {
                  const locked = isLocked(f, s);
                  return (
                    <div key={f.id} className="mlb-item">
                      <FoodArt id={f.id} className="mlb-item__art" />
                      <b>{f.name}</b>
                      <small>+{f.fill} hunger{f.joy ? ` · +${f.joy} joy` : ""} · own {s.food[f.id] || 0}</small>
                      <button type="button" className="mlb-btn mlb-btn--sm" disabled={locked || s.coins < f.price} onClick={() => apply(buyFood, f.id)}>
                        {locked ? <>Lv {f.level}</> : <><Icon name="coin" />{f.price}</>}
                      </button>
                    </div>
                  );
                })}
                {shopTab !== "food" && ITEMS.filter((it) => it.kind === shopTab).map((it) => {
                  const owned = s.owned.includes(it.id), locked = isLocked(it, s);
                  const on = it.kind === "decor" ? s.decor.includes(it.id) : s[it.kind === "hat" ? "hat" : "glasses"] === it.id;
                  return (
                    <div key={it.id} className={`mlb-item${on ? " is-on" : ""}`}>
                      {it.kind === "decor" ? <DecorIcon id={it.id} className="mlb-item__art" /> : <WearArt item={it} className="mlb-item__art" />}
                      <b>{it.name}</b>
                      <small>{it.kind === "decor" ? ROOMS.find((r) => r.id === it.room).name : owned ? "Owned" : "Wearable"}</small>
                      {owned ? (
                        <button type="button" className={`mlb-btn mlb-btn--sm${on ? "" : " mlb-btn--go"}`} onClick={() => apply(toggleItem, it.id)}>
                          {on ? "Remove" : it.kind === "decor" ? "Place" : "Wear"}
                        </button>
                      ) : (
                        <button type="button" className="mlb-btn mlb-btn--sm" disabled={locked || s.coins < it.price} onClick={() => {
                          const r = apply(buyItem, it.id);
                          if (r.s.owned.includes(it.id) && it.kind === "decor") goRoom(ROOMS.findIndex((x) => x.id === it.room));
                        }}>
                          {locked ? <><Icon name="lock" />Lv {it.level}</> : <><Icon name="coin" />{it.price}</>}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>}

            {panel === "trophies" && (
              <div className="mlb-sheet__body">
                <div className="mlb-prog">
                  <span className="mlb-lv__n">{s.level}</span>
                  <div><b>Level {s.level}</b><div className="mlb-xp mlb-xp--big"><i style={{ width: `${xpPct}%` }} /></div><small>{Math.floor(s.xp)} / {xpNeeded(s.level)} XP to level {s.level + 1}</small></div>
                </div>
                <p className="mlb-dim">Fed {s.counts.fed}× · Games {s.counts.games} · Best: Stars {s.best.stars} · Memory {s.best.memory || "—"} moves · Bubbles {s.best.bubbles}</p>
                <h4>Achievements {s.ach.length}/{ACHIEVEMENTS.length}</h4>
                <ul className="mlb-achs">
                  {ACHIEVEMENTS.map((a) => {
                    const done = s.ach.includes(a.id), v = Math.min(a.goal, a.value(s));
                    return (
                      <li key={a.id} className={done ? "is-done" : ""}>
                        <Icon name={done ? "trophy" : "star"} />
                        <div><b>{a.title}</b><small>{a.desc}</small><div className="mlb-xp"><i style={{ width: `${(v / a.goal) * 100}%` }} /></div></div>
                        <span className="mlb-tag">{done ? "Done" : <><Icon name="coin" />{a.reward}</>}</span>
                      </li>
                    );
                  })}
                </ul>
                <button type="button" className="mlb-btn mlb-btn--danger" onClick={() => (setDraft({ name: "", color: s.color }), setPanel("newpet"))}>New Pet…</button>
              </div>
            )}

            {panel === "daily" && (
              <div className="mlb-sheet__body mlb-daily">
                <div className="mlb-days">
                  {Array.from({ length: 7 }, (_, i) => {
                    const day = i + 1, got = Math.min(7, ready ? nextStreak(s, now) - 1 : s.daily.streak);
                    const next = ready && day === Math.min(7, got + 1);
                    return <div key={day} className={`mlb-day${day <= got && !next ? " is-got" : ""}${next ? " is-next" : ""}`}><small>Day {day}</small><Icon name="coin" /><b>{dailyAmount(day)}</b></div>;
                  })}
                </div>
                <p className="mlb-dim">Come back every day — streak rewards grow up to day 7.</p>
                <button type="button" className="mlb-btn mlb-btn--go" disabled={!ready} onClick={() => (apply(claimDaily), setPanel(null))}>{ready ? "Claim gift!" : "Come back tomorrow"}</button>
              </div>
            )}

            {panel === "newpet" && (
              <div className="mlb-sheet__body mlb-newpet">
                <p><b>Start over with a new pet?</b> This deletes {s.name}'s coins, level, items and achievements. It can't be undone.</p>
                <label>Name <input value={draft.name} maxLength={14} placeholder="Buddy" onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} /></label>
                <div className="mlb-swatches">
                  {Object.entries(COLORS).map(([id, c]) => (
                    <button key={id} type="button" aria-label={id} aria-pressed={draft.color === id} className={draft.color === id ? "is-on" : ""} style={{ background: c.body }} onClick={() => setDraft((d) => ({ ...d, color: id }))} />
                  ))}
                </div>
                <div className="mlb-row">
                  <button type="button" className="mlb-btn mlb-btn--danger" onClick={adopt}>Yes, new pet</button>
                  <button type="button" className="mlb-btn" onClick={() => setPanel("trophies")}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {game && (
        <GameOverlay
          key={game.key}
          game={game.id}
          autoStart={game.auto}
          sfx={sfx}
          onFinish={finish}
          canReplay={canPlay(s)}
          onReplay={replay}
          onClose={() => setGame(null)}
        />
      )}
    </div>
  );
}
