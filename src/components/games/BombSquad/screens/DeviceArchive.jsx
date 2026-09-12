import { MODULE_TYPES } from "../data/moduleConfigs.js";
import { ModuleIcon, LockIcon } from "../components/icons.jsx";

export default function DeviceArchive({ state, onBack }) {
  const discovered = new Set(state.discoveredModules);

  return (
    <div className="bs-archive">
      <div className="bs-select__header">
        <button type="button" className="bs-icon-btn" onClick={onBack} aria-label="Back to Menu">&#8592;</button>
        <h2 className="bs-select__title">DEVICE ARCHIVE</h2>
        <div style={{ width: 32 }} />
      </div>

      <div className="bs-archive__grid">
        {MODULE_TYPES.map((mod) => {
          const known = discovered.has(mod.type);
          return (
            <div key={mod.type} className={`bs-archive__card${known ? "" : " is-locked"}`}>
              <div className="bs-archive__icon">{known ? <ModuleIcon type={mod.type} /> : <LockIcon width="20" height="20" />}</div>
              <h3 className="bs-archive__name">{known ? mod.name : "???"}</h3>
              <p className="bs-archive__desc">{known ? mod.short : "Locked Module — discover it in a mission."}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
