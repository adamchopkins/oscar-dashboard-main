// Pipeline — live 2026 film slate.
//
// Primary source:  TMDB via getTMDBPipelineFilms (TMDB_API_KEY required)
//                  Queries prestige dramas, upcoming fall releases, and popular films —
//                  Oscar-season (Sep–Dec) films surface first.
// Fallback source: Wikipedia MediaWiki API (no key needed)
// Buzz overlay:    11 RSS feeds — Oscar mention count used to re-rank within the TMDB slate.

import { NextResponse } from "next/server";
import { getTMDBPipelineFilms } from "@/lib/tmdb";
import {
  PREDICTION_FEEDS,
  fetchFeed,
  filterOscarArticles,
  countMentions,
  getOscarSeasonBonus,
  getWikipediaFilms,
} from "@/lib/oscarFeeds";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const year   = parseInt(searchParams.get("year") ?? "2026", 10);
  const apiKey = process.env.TMDB_API_KEY;

  try {
    // TMDB catalog + live RSS buzz — parallel
    const [tmdbFilms, feedResults] = await Promise.all([
      apiKey ? getTMDBPipelineFilms(year, apiKey) : null,
      Promise.all(PREDICTION_FEEDS.map(fetchFeed)),
    ]);

    const movies = tmdbFilms ?? await getWikipediaFilms(year);

    if (!movies?.length) {
      return NextResponse.json(
        { success: false, error: "No film data available. Check TMDB_API_KEY or network." },
        { status: 503 }
      );
    }

    // Oscar buzz from RSS
    const oscarArticles = filterOscarArticles(feedResults.flat());
    const activeSources = PREDICTION_FEEDS
      .filter((_, i) => feedResults[i].length > 0)
      .map((f) => f.name);

    // Score: Oscar mentions + Oscar season release window bonus
    const scored = movies
      .map((m) => {
        const mentions      = countMentions(oscarArticles, m.title);
        const windowBonus   = getOscarSeasonBonus(m.releaseDate, year);
        // Combined score keeps Oscar-season prestige films above general blockbusters
        const score         = mentions * 10 + windowBonus * (m.popularity / 5);
        return { ...m, oscarMentions: mentions, oscarSeasonRelease: windowBonus >= 2.0, score };
      })
      .sort((a, b) => b.score - a.score || b.popularity - a.popularity)
      .map(({ score, ...film }) => film); // Drop internal score from response

    return NextResponse.json({
      success:         true,
      year,
      count:           scored.length,
      movies:          scored,
      source:          apiKey ? "TMDB" : "Wikipedia",
      buzzSources:     activeSources,
      articlesScanned: oscarArticles.length,
      tmdbConfigured:  !!apiKey,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
