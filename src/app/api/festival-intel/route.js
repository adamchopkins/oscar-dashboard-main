import { NextResponse } from "next/server";

const BASE_URL = "https://api.themoviedb.org/3";

async function fetchMovieWithCredits(movieId, apiKey) {
  try {
    const res = await fetch(
      `${BASE_URL}/movie/${movieId}?api_key=${apiKey}&append_to_response=credits&language=en-US`
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function getBuzzLevel(voteAvg, popularity) {
  if (voteAvg >= 7.5 || popularity >= 100) return "high";
  if (voteAvg >= 6.5 || popularity >= 30) return "medium";
  return "low";
}

function getOscarCategories(genreIds) {
  const cats = ["Best Picture"];
  if (genreIds.includes(18)) cats.push("Best Director", "Best Actor", "Best Actress");
  if (genreIds.includes(36)) cats.push("Best Adapted Screenplay");
  if (genreIds.includes(10749)) cats.push("Best Original Screenplay");
  return [...new Set(cats)].slice(0, 4);
}

function getReleaseQuarter(dateStr) {
  if (!dateStr) return "TBD";
  const d = new Date(dateStr);
  return `Q${Math.ceil((d.getMonth() + 1) / 3)} ${d.getFullYear()}`;
}

export async function POST(request) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: "TMDB_API_KEY not set in .env.local" },
      { status: 500 }
    );
  }

  try {
    const { query_type = "festivals" } = await request.json();

    if (query_type === "festivals") {
      // Pull prestige drama films from the Oscar eligibility year
      const [releasedRes, upcomingRes] = await Promise.all([
        fetch(
          `${BASE_URL}/discover/movie?api_key=${apiKey}&language=en-US` +
          `&with_genres=18&primary_release_date.gte=2026-01-01&primary_release_date.lte=2026-06-30` +
          `&sort_by=popularity.desc&vote_count.gte=3&page=1`
        ),
        fetch(
          `${BASE_URL}/discover/movie?api_key=${apiKey}&language=en-US` +
          `&with_genres=18&primary_release_date.gte=2026-07-01&primary_release_date.lte=2026-12-31` +
          `&sort_by=popularity.desc&page=1`
        ),
      ]);

      const released = releasedRes.ok ? (await releasedRes.json()).results || [] : [];
      const upcoming = upcomingRes.ok ? (await upcomingRes.json()).results || [] : [];

      // Deduplicate and take top 15
      const seen = new Set();
      const movies = [...released, ...upcoming]
        .filter((m) => { if (seen.has(m.id)) return false; seen.add(m.id); return true; })
        .slice(0, 15);

      // Fetch full credits in parallel
      const detailed = await Promise.all(movies.map((m) => fetchMovieWithCredits(m.id, apiKey)));

      const films = movies.map((movie, i) => {
        const d = detailed[i];
        const director = d?.credits?.crew?.find((c) => c.job === "Director")?.name || null;
        const cast = (d?.credits?.cast || []).slice(0, 3).map((c) => c.name);
        const distributor = d?.production_companies?.[0]?.name || null;

        return {
          title: movie.title,
          director,
          cast,
          festival: null,
          festivalSection: null,
          distributor,
          releaseWindow: getReleaseQuarter(movie.release_date),
          buzzLevel: getBuzzLevel(movie.vote_average, movie.popularity),
          buzzSummary: (movie.overview || "Prestige drama in the Oscar eligibility window.").slice(0, 200),
          oscarCategories: getOscarCategories(movie.genre_ids || []),
        };
      });

      return NextResponse.json({
        success: true,
        queryType: "festivals",
        data: films,
        fetchedAt: new Date().toISOString(),
        source: "TMDB",
      });
    }

    if (query_type === "precursors") {
      // Top dramas from late 2025 + 2026 Oscar eligibility window
      const res = await fetch(
        `${BASE_URL}/discover/movie?api_key=${apiKey}&language=en-US` +
        `&with_genres=18&primary_release_date.gte=2025-10-01&primary_release_date.lte=2026-12-31` +
        `&sort_by=vote_average.desc&vote_count.gte=20&page=1`
      );
      if (!res.ok) throw new Error(`TMDB error ${res.status}`);
      const films = ((await res.json()).results || []).slice(0, 8);

      const detailed = await Promise.all(
        films.slice(0, 5).map((m) => fetchMovieWithCredits(m.id, apiKey))
      );

      const contender = (mapper) =>
        films.slice(0, 5).map((m, i) => {
          const probability = 30 - i * 5;
          const name = mapper(m, detailed[i]);
          return { name, title: name, probability };
        });

      const frontrunners = {
        bestPicture: contender((m) => m.title),
        bestDirector: contender((m, d) => {
          const dir = d?.credits?.crew?.find((c) => c.job === "Director")?.name;
          return dir ? `${dir} — ${m.title}` : `Director — ${m.title}`;
        }),
        bestActor: contender((m, d) => {
          const lead = (d?.credits?.cast || []).find((c) => c.gender !== 1)?.name;
          return lead ? `${lead} — ${m.title}` : `Lead Actor — ${m.title}`;
        }),
        bestActress: contender((m, d) => {
          const lead = (d?.credits?.cast || []).find((c) => c.gender === 1)?.name;
          return lead ? `${lead} — ${m.title}` : `Lead Actress — ${m.title}`;
        }),
        bestSupportingActor: contender((m, d) => {
          const cast = d?.credits?.cast || [];
          const supp = cast.find((c, i) => c.gender !== 1 && i > 0)?.name;
          return supp ? `${supp} — ${m.title}` : `Supporting Actor — ${m.title}`;
        }),
        bestSupportingActress: contender((m, d) => {
          const cast = d?.credits?.cast || [];
          const supp = cast.find((c, i) => c.gender === 1 && i > 0)?.name;
          return supp ? `${supp} — ${m.title}` : `Supporting Actress — ${m.title}`;
        }),
      };

      return NextResponse.json({
        success: true,
        queryType: "precursors",
        data: {
          season: "2026-2027",
          precursors: [
            { name: "Golden Globes", status: "upcoming", date: "January 2027" },
            { name: "Critics Choice", status: "upcoming", date: "January 2027" },
            { name: "SAG Awards", status: "upcoming", date: "February 2027" },
            { name: "DGA Awards", status: "upcoming", date: "February 2027" },
            { name: "PGA Awards", status: "upcoming", date: "February 2027" },
            { name: "BAFTA", status: "upcoming", date: "February 2027" },
            { name: "WGA Awards", status: "upcoming", date: "February 2027" },
          ],
          frontrunners,
        },
        fetchedAt: new Date().toISOString(),
        source: "TMDB",
      });
    }

    return NextResponse.json({ success: false, error: "Invalid query_type" }, { status: 400 });
  } catch (error) {
    console.error("Festival intel error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
