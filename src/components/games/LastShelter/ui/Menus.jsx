/**
 * Last Shelter — menus and full-screen cards: title, runner select, how to
 * play, settings, pause, confirm, the ending screen and the endings gallery.
 */
import { Portrait } from "./Figure.jsx";
import { EventArt } from "./EventArt.jsx";
import { Icon } from "./icons.jsx";
import { BY_ID, RUNNERS } from "../data/family.js";
import { ENDINGS, ENDING_IDS } from "../engine/endings.js";

export function MainMenu({ info, endings, onContinue, onNew, onHowTo, onSettings, onEndings, webgl }) {
  const found = Object.keys(endings).length;
  return (
    <div className="lsh-menu">
      <div className="lsh-menu__card">
        <div className="lsh-logo">
          <span className="lsh-logo__60">60</span>
          <span className="lsh-logo__sec">SECONDS</span>
          <span className="lsh-logo__title">Last Shelter</span>
        </div>
        <p className="lsh-tagline">60 Seconds to Prepare. A Lifetime to Survive.</p>
        <div className="lsh-menu__btns">
          {info && !info.ended && (
            <button type="button" className="lsh-btn lsh-btn--primary" onClick={onContinue}>
              Continue
              <small>{info.label}</small>
            </button>
          )}
          <button type="button" className={`lsh-btn${info && !info.ended ? "" : " lsh-btn--primary"}`} onClick={onNew}>
            New Game
          </button>
          <button type="button" className="lsh-btn" onClick={onHowTo}>
            How to Play
          </button>
          <div className="lsh-menu__row">
            <button type="button" className="lsh-btn lsh-btn--small" onClick={onEndings}>
              Endings {found}/{ENDING_IDS.length}
            </button>
            <button type="button" className="lsh-btn lsh-btn--small" onClick={onSettings}>
              Settings
            </button>
          </div>
        </div>
        {!webgl && <p className="lsh-warn">Your browser can't show the 3D house (WebGL is off). The shelter part still works.</p>}
      </div>
      <div className="lsh-menu__family">
        {["hollis", "june", "remy", "pip"].map((id) => (
          <Portrait key={id} id={id} size={64} />
        ))}
      </div>
    </div>
  );
}

export function RunnerSelect({ onPick, onBack }) {
  return (
    <div className="lsh-overlay lsh-overlay--solid">
      <div className="lsh-runner">
        <h2>Who grabs everything?</h2>
        <p className="lsh-muted">The sirens just started. One parent runs the house; everyone else must be found and led to the shelter hatch in the garage.</p>
        <div className="lsh-runner__cards">
          {RUNNERS.map((id) => {
            const c = BY_ID[id];
            return (
              <button key={id} type="button" className="lsh-runner__card" onClick={() => onPick(id)}>
                <Portrait id={id} size={110} />
                <b>{c.name}</b>
                <span className="lsh-muted">{c.blurb}</span>
                <ul className="lsh-traits">
                  {c.strengths.map((s) => (
                    <li key={s} className="is-good">
                      + {s}
                    </li>
                  ))}
                  {c.weaknesses.map((s) => (
                    <li key={s} className="is-bad">
                      − {s}
                    </li>
                  ))}
                </ul>
                <span className="lsh-btn lsh-btn--primary">Run as {c.name}</span>
              </button>
            );
          })}
        </div>
        <button type="button" className="lsh-btn lsh-btn--small" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

export function HowTo({ onClose, touch }) {
  return (
    <div className="lsh-overlay">
      <div className="lsh-dialog lsh-dialog--wide">
        <h2>How to play</h2>
        <div className="lsh-howto">
          <section>
            <h3>1 · Sixty seconds</h3>
            <p>
              {touch ? "Drag the joystick to run; tap Grab next to things." : "Move with WASD or the arrow keys. Press E or Space to grab."} You can carry <b>4 slots</b> (radio and tool kit take 2, the backpack adds 2). Leading a family member fills your hands.
            </p>
            <p>
              Stand in the <b>green ring</b> on the garage hatch to drop everything off. Be on the hatch when the clock hits zero — or go down early with {touch ? "Go down" : "Enter"}.
            </p>
          </section>
          <section>
            <h3>2 · The shelter</h3>
            <p>Each day: read the journal and decide the day's event, then plan who eats, drinks and takes medicine, choose one task, maybe send someone on an expedition — and End Day.</p>
            <p>
              <Icon name="food" size={16} /> A meal lasts about 4 days, <Icon name="water" size={16} /> water about 3. Hunger and thirst past halfway start costing health. Sickness spreads; medicine cures it (twice as well with June around).
            </p>
          </section>
          <section>
            <h3>3 · Getting out</h3>
            <p>There are nine endings. Rescue, other survivors and stranger things are out there — listen to the radio, keep your gear, and watch for chains of events that lead somewhere.</p>
            <p>Expeditions bring back supplies and news but can hurt or kill. Never send someone weak, tired or unequipped somewhere deadly.</p>
          </section>
        </div>
        <button type="button" className="lsh-btn lsh-btn--primary" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}

export function Settings({ s, set, onClose, onFullscreen, isFs }) {
  const slider = (k, label) => (
    <label className="lsh-field">
      <span>{label}</span>
      <input type="range" min="0" max="1" step="0.05" value={s[k]} onChange={(e) => set({ [k]: +e.target.value })} />
      <b>{Math.round(s[k] * 100)}</b>
    </label>
  );
  return (
    <div className="lsh-overlay">
      <div className="lsh-dialog">
        <h2>Settings</h2>
        <h4>Sound</h4>
        {slider("master", "Master")}
        {slider("music", "Music")}
        {slider("sfx", "Effects")}
        <h4>Graphics</h4>
        <label className="lsh-field">
          <span>3D quality</span>
          <select value={s.quality} onChange={(e) => set({ quality: e.target.value })}>
            <option value="auto">Auto</option>
            <option value="low">Low (fastest)</option>
            <option value="medium">Medium</option>
            <option value="high">High (shadows+)</option>
          </select>
        </label>
        <label className="lsh-field lsh-field--check">
          <input type="checkbox" checked={!!s.shake} onChange={(e) => set({ shake: e.target.checked })} />
          <span>Camera shake</span>
        </label>
        <label className="lsh-field">
          <span>Camera distance</span>
          <input type="range" min="0.8" max="1.4" step="0.05" value={s.zoom} onChange={(e) => set({ zoom: +e.target.value })} />
          <b>{Math.round(s.zoom * 100)}%</b>
        </label>
        <div className="lsh-dialog__row">
          <button type="button" className="lsh-btn lsh-btn--small" onClick={onFullscreen}>
            {isFs ? "Exit fullscreen" : "Fullscreen"}
          </button>
          <button type="button" className="lsh-btn lsh-btn--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export function Pause({ onResume, onSettings, onHowTo, onQuit, phase }) {
  return (
    <div className="lsh-overlay">
      <div className="lsh-dialog lsh-dialog--narrow">
        <h2>Paused</h2>
        {phase === "house" && <p className="lsh-muted">The clock is stopped.</p>}
        <div className="lsh-menu__btns">
          <button type="button" className="lsh-btn lsh-btn--primary" onClick={onResume}>
            Resume
          </button>
          <button type="button" className="lsh-btn" onClick={onSettings}>
            Settings
          </button>
          <button type="button" className="lsh-btn" onClick={onHowTo}>
            How to Play
          </button>
          <button type="button" className="lsh-btn" onClick={onQuit}>
            Save &amp; Quit to Menu
          </button>
        </div>
      </div>
    </div>
  );
}

export function Confirm({ title, text, yes, onYes, onNo }) {
  return (
    <div className="lsh-overlay">
      <div className="lsh-dialog lsh-dialog--narrow">
        <h2>{title}</h2>
        <p>{text}</p>
        <div className="lsh-dialog__row">
          <button type="button" className="lsh-btn" onClick={onNo}>
            Cancel
          </button>
          <button type="button" className="lsh-btn lsh-btn--danger" onClick={onYes}>
            {yes}
          </button>
        </div>
      </div>
    </div>
  );
}

export function EndingScreen({ id, paragraphs, stats, fam, lost, endings, onNew, onMenu }) {
  const E = ENDINGS[id];
  return (
    <div className="lsh-overlay lsh-overlay--solid lsh-ending-wrap">
      <div className={`lsh-ending lsh-ending--${E.kind}`}>
        <EventArt ending={E.art} className="lsh-ending__art" />
        <div className="lsh-ending__kind">{{ good: "Survived", bittersweet: "A new road", strange: "Discovered", bad: "The end" }[E.kind]}</div>
        <h2>{E.title}</h2>
        <p className="lsh-ending__blurb">{E.blurb}</p>
        {paragraphs.map((p, i) => (
          <p key={i} className="lsh-ending__p">
            {p}
          </p>
        ))}
        {fam && (
          <div className="lsh-ending__fam">
            {["hollis", "june", "remy", "pip"].map((fid) => {
              const m = fam[fid];
              const gone = !m || !m.alive || lost.includes(fid);
              return (
                <div key={fid} className={`lsh-ending__m${gone ? " is-gone" : ""}`}>
                  <Portrait id={fid} m={m} size={58} dead={gone} />
                  <span>{BY_ID[fid].name}</span>
                </div>
              );
            })}
          </div>
        )}
        <div className="lsh-ending__stats">
          {stats.map(([k, v]) => (
            <span key={k}>
              <b>{v}</b>
              {k}
            </span>
          ))}
        </div>
        <EndingsStrip endings={endings} current={id} />
        <div className="lsh-dialog__row">
          <button type="button" className="lsh-btn" onClick={onMenu}>
            Main Menu
          </button>
          <button type="button" className="lsh-btn lsh-btn--primary" onClick={onNew}>
            New Game
          </button>
        </div>
      </div>
    </div>
  );
}

function EndingsStrip({ endings, current }) {
  return (
    <div className="lsh-endstrip" aria-label="Endings discovered">
      {ENDING_IDS.map((e) => (
        <span key={e} className={`lsh-endpip${endings[e] ? " is-found" : ""}${e === current ? " is-current" : ""} is-${ENDINGS[e].kind}`} title={endings[e] ? ENDINGS[e].title : "Undiscovered"} />
      ))}
    </div>
  );
}

export function EndingsGallery({ endings, onClose }) {
  const found = Object.keys(endings).length;
  return (
    <div className="lsh-overlay">
      <div className="lsh-dialog lsh-dialog--wide">
        <h2>
          Endings · {found}/{ENDING_IDS.length}
        </h2>
        <div className="lsh-gallery">
          {ENDING_IDS.map((id) => {
            const E = ENDINGS[id];
            const f = endings[id];
            return (
              <div key={id} className={`lsh-gcard${f ? " is-found" : ""} is-${E.kind}`}>
                {f ? <EventArt ending={E.art} /> : <div className="lsh-gcard__lock">?</div>}
                <b>{f ? E.title : "Undiscovered"}</b>
                <span className="lsh-muted">{f ? E.blurb : E.hint}</span>
                {f && <small>Reached {f.count}× · best day {f.best || 1}</small>}
              </div>
            );
          })}
        </div>
        <button type="button" className="lsh-btn lsh-btn--primary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
