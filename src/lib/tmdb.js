// TMDB API client — primary data source for all Oscar Dashboard sections.
//
// All functions take an explicit apiKey parameter.
// TMDB free tier: 40 req / 10 s — enrichFilmsWithCredits is capped at 8 films (16 calls).
//
// Image sizes: w342 (card thumbnails), w500 (larger cards), original (full res)

const TMDB_BASE = "https://api.themoviedb.org/3";
export const TMDB_IMG = "https://image.tmdb.org/t/p/w342";

async function tfetch(path, params, apiKey) {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", "en-US");
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`TMDB ${path} → ${res.status}`);
  return res.json();
}

function normFilm(m) {
  return {
    id:          m.id,
    title:       m.title,
    releaseDate: m.release_date || null,
    overview:    (m.overview || "").slice(0, 200),
    poster:      m.poster_path ? `${TMDB_IMG}${m.poster_path}` : null,
    popularity:  m.popularity  ?? 0,
    voteAverage: m.vote_average ?? 0,
  };
}

function dedup(arr) {
  const seen = new Set();
  return arr.filter((m) => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
}

// ─── Catalog queries ──────────────────────────────────────────────────────────

// Full-year film slate for the Pipeline tab (all genres, popularity + upcoming)
export async function getTMDBPipelineFilms(year, apiKey) {
  if (!apiKey) return null;
  try {
    const [popular, prestige, upcoming] = await Promise.all([
      tfetch("/discover/movie", {
        "primary_release_date.gte": `${year}-01-01`,
        "primary_release_date.lte": `${year}-12-31`,
        sort_by: "popularity.desc", include_adult: false, page: 1,
      }, apiKey),
      tfetch("/discover/movie", {
        with_genres: "18,36",
        "primary_release_date.gte": `${year}-07-01`,
        "primary_release_date.lte": `${year}-12-31`,
        sort_by: "primary_release_date.asc", include_adult: false, page: 1,
      }, apiKey),
      tfetch("/discover/movie", {
        "primary_release_date.gte": `${year}-09-01`,
        "primary_release_date.lte": `${year}-12-31`,
        sort_by: "primary_release_date.asc", include_adult: false, page: 1,
      }, apiKey),
    ]);
    // Prestige and upcoming first (more Oscar-relevant), then fill with popular
    return dedup([
      ...(prestige.results  ?? []),
      ...(upcoming.results  ?? []),
      ...(popular.results   ?? []),
    ]).slice(0, 50).map(normFilm);
  } catch { return null; }
}

// Drama + history Oscar contenders, full year
export async function getTMDBFilms(year, apiKey) {
  if (!apiKey) return null;
  try {
    const [h1, h2] = await Promise.all([
      tfetch("/discover/movie", {
        "primary_release_date.gte": `${year}-01-01`,
        "primary_release_date.lte": `${year}-06-30`,
        sort_by: "popularity.desc", include_adult: false, page: 1,
      }, apiKey),
      tfetch("/discover/movie", {
        "primary_release_date.gte": `${year}-07-01`,
        "primary_release_date.lte": `${year}-12-31`,
        sort_by: "primary_release_date.asc", include_adult: false, page: 1,
      }, apiKey),
    ]);
    return dedup([...(h1.results ?? []), ...(h2.results ?? [])]).slice(0, 40).map(normFilm);
  } catch { return null; }
}

// Drama + history contenders for Oscar predictions
export async function getTMDBOscarContenders(year, apiKey) {
  if (!apiKey) return null;
  try {
    const [r1, r2] = await Promise.all([
      tfetch("/discover/movie", {
        with_genres: "18,36",
        "primary_release_date.gte": `${year}-01-01`,
        "primary_release_date.lte": `${year}-06-30`,
        sort_by: "popularity.desc", page: 1,
      }, apiKey),
      tfetch("/discover/movie", {
        with_genres: "18,36",
        "primary_release_date.gte": `${year}-07-01`,
        "primary_release_date.lte": `${year}-12-31`,
        sort_by: "primary_release_date.asc", page: 1,
      }, apiKey),
    ]);
    return dedup([...(r1.results ?? []), ...(r2.results ?? [])]).slice(0, 25).map(normFilm);
  } catch { return null; }
}

// Oscar campaign window: July–December only (peak FYC season)
export async function getTMDBOscarSeasonFilms(year, apiKey) {
  if (!apiKey) return null;
  try {
    const [drama, hist] = await Promise.all([
      tfetch("/discover/movie", {
        with_genres: "18",
        "primary_release_date.gte": `${year}-07-01`,
        "primary_release_date.lte": `${year}-12-31`,
        sort_by: "primary_release_date.asc", include_adult: false, page: 1,
      }, apiKey),
      tfetch("/discover/movie", {
        with_genres: "36",
        "primary_release_date.gte": `${year}-07-01`,
        "primary_release_date.lte": `${year}-12-31`,
        sort_by: "primary_release_date.asc", include_adult: false, page: 1,
      }, apiKey),
    ]);
    return dedup([...(drama.results ?? []), ...(hist.results ?? [])])
      .slice(0, 30)
      .map((m) => ({ ...normFilm(m), oscarWindow: true }));
  } catch { return null; }
}

// ─── Credit enrichment ────────────────────────────────────────────────────────
// For the top N prediction films, search TMDB and fetch full credits.
// Returns real director names and gender-split cast for Best Actor/Actress categories.
// Caps at `limit` films to stay within TMDB rate limits (2 calls per film).

export async function enrichFilmsWithCredits(films, year, apiKey, limit = 8) {
  if (!apiKey || !films.length) return films;

  const toEnrich = films.slice(0, limit);
  const enriched = await Promise.all(
    toEnrich.map(async (film) => {
      try {
        // Search by title to get the canonical TMDB ID
        const search = await tfetch("/search/movie", {
          query: film.title, year, include_adult: false,
        }, apiKey);
        const match = (search.results ?? []).find(
          (r) => r.title.toLowerCase() === film.title.toLowerCase()
        ) ?? search.results?.[0];
        if (!match) return film;

        // Fetch full details + credits in one call
        const detail = await tfetch(`/movie/${match.id}`, {
          append_to_response: "credits",
        }, apiKey);

        const director = detail.credits?.crew
          ?.find((c) => c.job === "Director")?.name ?? null;

        // TMDB gender: 2 = male, 1 = female — used to split Actor / Actress categories
        const cast = (detail.credits?.cast ?? [])
          .filter((c) => c.order < 10)
          .sort((a, b) => a.order - b.order);
        const topMaleCast   = cast.filter((c) => c.gender === 2).slice(0, 3).map((c) => c.name);
        const topFemaleCast = cast.filter((c) => c.gender === 1).slice(0, 3).map((c) => c.name);
        const topCast       = cast.slice(0, 5).map((c) => c.name);

        return {
          ...film,
          tmdbId:        match.id,
          director,
          topCast,
          topMaleCast,
          topFemaleCast,
          genres:        (detail.genres ?? []).map((g) => g.name),
          poster:        detail.poster_path ? `${TMDB_IMG}${detail.poster_path}` : (film.poster ?? null),
          releaseDate:   detail.release_date || film.releaseDate,
          overview:      detail.overview?.slice(0, 200) || film.overview,
          voteAverage:   detail.vote_average   ?? film.voteAverage ?? 0,
          popularity:    detail.popularity     ?? film.popularity  ?? 0,
        };
      } catch {
        return film; // Return unenriched on any per-film error
      }
    })
  );

  return [...enriched, ...films.slice(limit)];
}

// ─── Detail & search ─────────────────────────────────────────────────────────

export async function getMovieDetails(movieId, apiKey) {
  if (!apiKey) throw new Error("TMDB_API_KEY required");
  return tfetch(`/movie/${movieId}`, { append_to_response: "credits,release_dates" }, apiKey);
}

export async function searchMovie(query, apiKey) {
  if (!apiKey) return { results: [] };
  return tfetch("/search/movie", { query }, apiKey);
}

export async function getPersonMovies(personId, apiKey) {
  if (!apiKey) return { cast: [] };
  return tfetch(`/person/${personId}/movie_credits`, {}, apiKey);
}

export function getPosterUrl(path, size = "w342") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

// Legacy wrapper used by existing tmdb.js callers
export async function getProductionPipeline(year = 2026, apiKey) {
  return getTMDBPipelineFilms(year, apiKey ?? process.env.TMDB_API_KEY);
}
