// lib/storage.js

// --- Generic cache helper ---
function getCache(key, maxAgeMs) {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - new Date(parsed.fetchedAt).getTime() > maxAgeMs) {
      return null; // Stale
    }
    return parsed;
  } catch {
    return null;
  }
}

function setCache(key, data) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify({ ...data, fetchedAt: new Date().toISOString() }));
}

// --- Pipeline (TMDB) cache: 12 hours ---
const TWELVE_HOURS = 12 * 60 * 60 * 1000;
export const loadPipelineCache = () => getCache("oscar-pipeline", TWELVE_HOURS);
export const savePipelineCache = (data) => setCache("oscar-pipeline", data);

// --- Festival Intel cache: 24 hours ---
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
export const loadFestivalCache = () => getCache("oscar-festivals", TWENTY_FOUR_HOURS);
export const saveFestivalCache = (data) => setCache("oscar-festivals", data);

// --- Precursor cache: 6 hours (changes more during awards season) ---
const SIX_HOURS = 6 * 60 * 60 * 1000;
export const loadPrecursorCache = () => getCache("oscar-precursors", SIX_HOURS);
export const savePrecursorCache = (data) => setCache("oscar-precursors", data);

// --- User predictions ---
export const loadPredictions = () => {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem("oscar-user-predictions") || "{}"); }
  catch { return {}; }
};
export const savePredictions = (p) => {
  if (typeof window === "undefined") return;
  localStorage.setItem("oscar-user-predictions", JSON.stringify(p));
};
export const clearPredictions = () => {
  if (typeof window === "undefined") return;
  localStorage.removeItem("oscar-user-predictions");
};