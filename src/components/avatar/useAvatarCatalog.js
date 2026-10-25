import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { LOCAL_CATALOG, normalizeCatalog } from "../../lib/avatars.js";

// One fetch per page load; GET /api/avatars is static and cacheable.
let cached = null;
let pending = null;

function loadCatalog() {
  pending ||= api
    .listAvatars()
    .then(normalizeCatalog)
    .catch(() => null)
    .then((catalog) => {
      cached = catalog || LOCAL_CATALOG;
      return cached;
    });
  return pending;
}

/**
 * The avatar catalog: the local copy immediately, then the server list once
 * it arrives (filtered to ids that have artwork). Never blocks the UI and
 * never fails — an unreachable or older backend just keeps the local copy.
 */
export function useAvatarCatalog() {
  const [catalog, setCatalog] = useState(cached || LOCAL_CATALOG);
  useEffect(() => {
    if (cached) return undefined;
    let active = true;
    loadCatalog().then((c) => {
      if (active) setCatalog(c);
    });
    return () => {
      active = false;
    };
  }, []);
  return catalog;
}
