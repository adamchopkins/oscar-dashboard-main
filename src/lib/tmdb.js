// lib/tmdb.js

const BASE_URL = "https://api.themoviedb.org/3";
const API_KEY = process.env.TMDB_API_KEY;

// Helper: fetch from TMDB
async function tmdbFetch(endpoint, params = {}) {
  const url = new URL(`${BASE_URL}${endpoint}`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("language", "en-US");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB error: ${res.status}`);
  return res.json();
}

// Get films currently in production or post-production
// releasing in the Oscar eligibility window (current year)
export async function getProductionPipeline(year = 2026) {
  const results = [];

  // Query 1: Films in post-production with Q4 release dates
  // (prime Oscar positioning)
  const postProd = await tmdbFetch("/discover/movie", {
    "primary_release_date.gte": `${year}-09-01`,
    "primary_release_date.lte": `${year}-12-31`,
    sort_by: "popularity.desc",
    "vote_count.gte": "0",
    page: "1",
  });
  results.push(...postProd.results);

  // Query 2: Films releasing in awards-friendly window
  // with high popularity (indicates star power / buzz)
  const earlyYear = await tmdbFetch("/discover/movie", {
    "primary_release_date.gte": `${year}-01-01`,
    "primary_release_date.lte": `${year}-08-31`,
    sort_by: "popularity.desc",
    page: "1",
  });
  results.push(...earlyYear.results);

  // Deduplicate by ID
  const seen = new Set();
  const unique = results.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  return unique;
}

// Get full details for a specific movie (cast, crew, etc.)
export async function getMovieDetails(movieId) {
  return tmdbFetch(`/movie/${movieId}`, {
    append_to_response: "credits,release_dates",
  });
}

// Search for a specific movie by title
export async function searchMovie(query) {
  return tmdbFetch("/search/movie", { query });
}

// Get a person's filmography (useful for tracking directors)
export async function getPersonMovies(personId) {
  return tmdbFetch(`/person/${personId}/movie_credits`);
}

// Build poster URL from TMDB path
export function getPosterUrl(path, size = "w342") {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}