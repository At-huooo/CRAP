/* =========================================================
   config.js
   Where the backend lives.

   - On your own machine (localhost / 127.0.0.1) the page
     talks to the FastAPI server on port 8000.
   - On GitHub Pages it uses PRODUCTION_API_BASE. Put your
     Render URL there once the backend is deployed.
   - Anyone can override it from the server pill in the top
     bar, or with ?api=https://... in the page URL. The
     override is remembered in this browser.
   ========================================================= */

export const LOCAL_API_BASE = "http://localhost:8000";

export const PRODUCTION_API_BASE = "https://crap-backend-886393049388.europe-west4.run.app";

const STORAGE_KEY = "crap.apiBase";

/** The address used when nothing has been overridden. */
export function getDefaultApiBase() {
  const isLocal = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
  if (isLocal || !PRODUCTION_API_BASE) {
    return LOCAL_API_BASE;
  }
  return PRODUCTION_API_BASE;
}

/** The address requests are sent to right now. */
export function getApiBase() {
  const fromUrl = new URLSearchParams(window.location.search).get("api");
  if (fromUrl) {
    return trimSlash(fromUrl);
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return trimSlash(saved);
    }
  } catch {
    // Storage can be blocked (private mode); fall through to the default.
  }

  return getDefaultApiBase();
}

/** Remember a new address. Pass null to go back to the default. */
export function setApiBase(url) {
  try {
    if (url) {
      localStorage.setItem(STORAGE_KEY, trimSlash(url));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Not fatal: the setting just won't survive a reload.
  }
}

function trimSlash(url) {
  return url.trim().replace(/\/+$/, "");
}
