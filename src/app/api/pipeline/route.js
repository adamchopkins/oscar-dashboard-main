// Pipeline — live 2026 film slate.
//
// Primary catalog:  TMDB via getTMDBPipelineFilms (requires TMDB_API_KEY)
//                   Prestige dramas + upcoming fall/Q4 releases surface first.
// Fallback catalog: PMC-mentioned films from scrapePMCPredictions — if TMDB key
//                   is absent, the films PMC prediction sites are already discussing
//                   are real 2026 contenders and serve as a viable catalog.
// Buzz overlay:     Non-PMC prediction feeds (Gold Derby, NBP, etc.) used to score
//                   Oscar mentions. PMC scoring is handled separately via penskeFeeds.

import { NextResponse } from "next/server";
import { getTMDBPipelineFilms } from "@/lib/tmdb";
import { scrapePMCPredictions, getAllPMCFilms } from "@/lib/penskeFeeds";
import {
  PREDICTION_FEEDS,
  fetchFeed,
  filterOscarArticles,
  countMentions,
  getOscarSeasonBonus,
} from "@/lib/oscarFeeds";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const year   = parseInt(searchParams.get("year") ?? "2026", 10);
  const apiKey = process.env.TMDB_API_KEY;

  try {
    // TMDB catalog + PMC scrape + secondary RSS — all parallel
    const [tmdbFilms, pmcResult, feedResults] = await Promise.all([
      apiKey ? getTMDBPipelineFilms(year, apiKey) : null,
      scrapePMCPredictions(year),
      Promise.all(PREDICTION_FEEDS.map(fetchFeed)),
    ]);

    // Build film catalog: TMDB first, PMC-mentioned films as fallback
    let movies = tmdbFilms;
    let source = "TMDB";

    if (!movies?.length) {
      // No TMDB key — use films PMC outlets are already predicting as the catalog
      const pmcFilms = getAllPMCFilms(pmcResult);
      if (!pmcFilms.length) {
        return NextResponse.json(
          { success: false, error: "No film data available. Add TMDB_API_KEY or check network." },
          { status: 503 }
        );
      }
      movies = pmcFilms.map((title, i) => ({
        id: i + 1, title, releaseDate: null, overview: "",
        poster: null, popularity: pmcFilms.length - i, voteAverage: 0,
      }));
      source = "PMC prediction sites";
    }

    // Oscar buzz from non-PMC prediction feeds
    const oscarArticles  = filterOscarArticles(feedResults.flat());
    const activeSources  = PREDICTION_FEEDS
      .filter((_, i) => feedResults[i].length > 0)
      .map((f) => f.name);
    // Also include PMC outlets that returned data
    const allActiveSources = [...new Set([...pmcResult.activeSources, ...activeSources])];

    // PMC prediction scores (if a film appears in PMC Best Picture predictions, boost it)
    const pmcScoreMap = new Map(
      (pmcResult.predictions.bestPicture ?? []).map((p, i) => [
        p.name.toLowerCase(),
        { pmcScore: p.score, pmcRank: i },
      ])
    );

    // Score each film
    const scored = movies
      .map((m) => {
        const rssMentions   = countMentions(oscarArticles, m.title);
        const windowBonus   = getOscarSeasonBonus(m.releaseDate, year);
        const pmcEntry      = pmcScoreMap.get(m.title.toLowerCase());
        const pmcBoost      = pmcEntry ? (pmcEntry.pmcScore * 2) : 0;
        // Combined score: PMC prediction data + RSS buzz + Oscar-season window
        const score = pmcBoost + rssMentions * 10 + windowBonus * (m.popularity / 5);
        return {
          ...m,
          oscarMentions:     rssMentions,
          pmcPredicted:      !!pmcEntry,
          pmcRank:           pmcEntry?.pmcRank ?? null,
          oscarSeasonRelease: windowBonus >= 2.0,
          score,
        };
      })
      .sort((a, b) => b.score - a.score || b.popularity - a.popularity)
      .map(({ score, ...film }) => film);

    return NextResponse.json({
      success:         true,
      year,
      count:           scored.length,
      movies:          scored,
      source,
      pmcSources:      pmcResult.activeSources,
      buzzSources:     allActiveSources,
      articlesScanned: oscarArticles.length,
      tmdbConfigured:  !!apiKey,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
