// src/app/api/oscar-predictions/route.js

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

export async function POST(request) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: "TMDB_API_KEY not set in .env.local" },
      { status: 500 }
    );
  }

  try {
    const { ceremony = "99th", year = 2027 } = await request.json();
    const eligibilityYear = year - 1; // films eligible for the given ceremony year

    const res = await fetch(
      `${BASE_URL}/discover/movie?api_key=${apiKey}&language=en-US` +
      `&with_genres=18&primary_release_date.gte=${eligibilityYear}-01-01` +
      `&primary_release_date.lte=${eligibilityYear}-12-31` +
      `&sort_by=popularity.desc&vote_count.gte=3&page=1`
    );
    if (!res.ok) throw new Error(`TMDB discover error ${res.status}`);

    const films = ((await res.json()).results || []).slice(0, 10);
    if (films.length === 0) {
      throw new Error(`No films found for ${eligibilityYear}. Check TMDB_API_KEY.`);
    }

    // Fetch credits for all films in parallel
    const detailed = await Promise.all(films.map((m) => fetchMovieWithCredits(m.id, apiKey)));

    const getDirector = (d) => d?.credits?.crew?.find((c) => c.job === "Director")?.name;
    const getCast = (d) => d?.credits?.cast || [];
    const maleLead = (cast) => cast.find((c) => c.gender !== 1)?.name;
    const femaleLead = (cast) => cast.find((c) => c.gender === 1)?.name;
    const maleSupport = (cast) => cast.find((c, i) => c.gender !== 1 && i > 0)?.name;
    const femaleSupport = (cast) => cast.find((c, i) => c.gender === 1 && i > 0)?.name;

    const makeNominees = (films, mapper, count = 6) =>
      films.slice(0, count).map((m, i) => {
        const name = mapper(m, detailed[i]);
        return name || `Contender — ${m.title}`;
      });

    const pictureNominees = makeNominees(films, (m) => m.title, 8);
    const directorNominees = makeNominees(films, (m, d) => {
      const dir = getDirector(d);
      return dir ? `${dir} — ${m.title}` : null;
    });
    const actorNominees = makeNominees(films, (m, d) => {
      const lead = maleLead(getCast(d));
      return lead ? `${lead} — ${m.title}` : null;
    });
    const actressNominees = makeNominees(films, (m, d) => {
      const lead = femaleLead(getCast(d));
      return lead ? `${lead} — ${m.title}` : null;
    });
    const suppActorNominees = makeNominees(films, (m, d) => {
      const supp = maleSupport(getCast(d));
      return supp ? `${supp} — ${m.title}` : null;
    });
    const suppActressNominees = makeNominees(films, (m, d) => {
      const supp = femaleSupport(getCast(d));
      return supp ? `${supp} — ${m.title}` : null;
    });

    const categories = [
      {
        id: "bestPicture",
        name: "Best Picture",
        icon: "🏆",
        nominees: pictureNominees,
        frontrunner: pictureNominees[0],
        frontrunnerNote: `Most popular prestige drama of ${eligibilityYear} on TMDB`,
      },
      {
        id: "bestDirector",
        name: "Best Director",
        icon: "🎬",
        nominees: directorNominees,
        frontrunner: directorNominees[0],
        frontrunnerNote: "Director of the season's top drama",
      },
      {
        id: "bestActor",
        name: "Best Actor",
        icon: "🎭",
        nominees: actorNominees,
        frontrunner: actorNominees[0],
        frontrunnerNote: "Lead male performance in top prestige film",
      },
      {
        id: "bestActress",
        name: "Best Actress",
        icon: "👑",
        nominees: actressNominees,
        frontrunner: actressNominees[0],
        frontrunnerNote: "Lead female performance in top prestige film",
      },
      {
        id: "bestSupportingActor",
        name: "Best Supporting Actor",
        icon: "🌟",
        nominees: suppActorNominees,
        frontrunner: suppActorNominees[0],
        frontrunnerNote: "Supporting male performance in awards contenders",
      },
      {
        id: "bestSupportingActress",
        name: "Best Supporting Actress",
        icon: "✨",
        nominees: suppActressNominees,
        frontrunner: suppActressNominees[0],
        frontrunnerNote: "Supporting female performance in top contenders",
      },
    ];

    return NextResponse.json({
      success: true,
      data: {
        ceremonyName: `${ceremony} Academy Awards`,
        ceremonyYear: year,
        lastUpdated: new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        sources: ["TMDB"],
        categories,
      },
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Oscar predictions API error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
