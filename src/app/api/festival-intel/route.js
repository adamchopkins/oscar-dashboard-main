// Festival Intelligence & Precursor Awards — long-term consensus model.
//
// Scoring:     Same consensus model as oscar-predictions — site authority × prediction weight
//              × cross-site agreement. Short-term buzz spikes are dampened; sustained
//              multi-site coverage of a film is the durable signal.
// Oscar window: Jul–Dec releases weighted 2× (peak campaign/FYC season)

import { NextResponse } from "next/server";
import {
  PREDICTION_FEEDS,
  fetchFeed,
  filterOscarArticles,
  filterPredictionArticles,
  extractFilmTitles,
  computeConsensusScore,
  getOscarSeasonBonus,
  getTMDBOscarContenders,
  getWikipediaFilms,
  releaseQuarter,
} from "@/lib/oscarFeeds";

export async function POST(request) {
  try {
    const { query_type = "festivals" } = await request.json();
    const apiKey = process.env.TMDB_API_KEY;
    const ELIGIBILITY_YEAR = 2026;

    const [feedResults, filmCatalog] = await Promise.all([
      Promise.all(PREDICTION_FEEDS.map(fetchFeed)),
      apiKey ? getTMDBOscarContenders(ELIGIBILITY_YEAR, apiKey) : getWikipediaFilms(ELIGIBILITY_YEAR),
    ]);

    const catalog = filmCatalog ?? await getWikipediaFilms(ELIGIBILITY_YEAR);

    const allArticles   = feedResults.flat();
    const oscarArticles = filterOscarArticles(allArticles);
    const predArticles  = filterPredictionArticles(allArticles).filter(
      (a) => /prediction|frontrunner|race|favorite|contender|rankings|picks|tracker/i.test(a.title)
    );
    const activeSources = PREDICTION_FEEDS
      .filter((_, i) => feedResults[i].length > 0)
      .map((f) => f.name);

    // Extract titles from prediction articles (primary) and general Oscar coverage
    const predText  = predArticles.map((a) => a.title + " " + a.description).join(" ");
    const oscarText = oscarArticles.map((a) => a.title + " " + a.description).join(" ");
    const allTitles = [...new Set([
      ...extractFilmTitles(predText),
      ...extractFilmTitles(oscarText),
    ])];

    // Score each title with the consensus model
    const titleScores = new Map(
      allTitles.map((t) => [t, computeConsensusScore(oscarArticles, predArticles, t)])
    );

    const catalogMap = new Map(catalog.map((f) => [f.title.toLowerCase(), f]));

    // Sorted titles: consensus score descending
    const rssRanked  = [...titleScores.entries()]
      .filter(([, s]) => s.rawMentions > 0)
      .sort((a, b) => b[1].consensusScore - a[1].consensusScore)
      .map(([t]) => t);
    const catalogOnly = catalog
      .map((f) => f.title)
      .filter((t) => !titleScores.has(t));
    const allRanked = [...new Set([...rssRanked, ...catalogOnly])];

    // ── FESTIVALS ──────────────────────────────────────────────────────────
    if (query_type === "festivals") {
      const films = allRanked.slice(0, 20).map((title) => {
        const meta   = catalogMap.get(title.toLowerCase());
        const score  = titleScores.get(title);
        const windowBonus = getOscarSeasonBonus(meta?.releaseDate ?? null, ELIGIBILITY_YEAR);
        const effectiveMentions = score?.rawMentions ?? 0;

        const lead = oscarArticles.find((a) =>
          (a.title + " " + a.description).toLowerCase().includes(title.toLowerCase())
        );

        // Buzz level based on consensus score rather than raw count
        const buzzLevel = score?.isFrontrunner  ? "high"
                        : score?.isConsensus    ? "high"
                        : effectiveMentions >= 3 ? "medium"
                        : windowBonus >= 2.0     ? "medium"  // fall release with any coverage
                        : "low";

        return {
          title,
          director:        null,
          cast:            [],
          festival:        null,
          festivalSection: null,
          distributor:     null,
          poster:          meta?.poster ?? null,
          releaseWindow:   releaseQuarter(meta?.releaseDate),
          buzzLevel,
          buzzSummary: score?.isFrontrunner
            ? `Consensus frontrunner: ${score.predictingSites} prediction sites, ${effectiveMentions} articles`
            : score?.isConsensus
            ? `Emerging consensus: ${score.predictingSites} sites tracking this film`
            : lead
            ? `"${lead.title.slice(0, 80)}" — ${lead.source}`
            : `${ELIGIBILITY_YEAR} Oscar-season film — campaigns building`,
          oscarCategories: ["Best Picture", "Best Director"],
          mentionCount:    effectiveMentions,
          predictingSites: score?.predictingSites ?? 0,
          isConsensus:     score?.isConsensus ?? false,
          voteAverage:     meta?.voteAverage ?? 0,
        };
      });

      return NextResponse.json({
        success:            true,
        queryType:          "festivals",
        data:               films,
        articlesScanned:    oscarArticles.length,
        predictionArticles: predArticles.length,
        sources:            activeSources,
        tmdbConfigured:     !!apiKey,
        scoringModel:       "consensus-authority-weighted",
        fetchedAt:          new Date().toISOString(),
      });
    }

    // ── PRECURSORS ─────────────────────────────────────────────────────────
    if (query_type === "precursors") {
      const topScored = [...titleScores.entries()]
        .filter(([, s]) => s.rawMentions > 0)
        .sort((a, b) => b[1].consensusScore - a[1].consensusScore)
        .slice(0, 8);

      let frontrunners;
      const maxScore = topScored[0]?.[1].consensusScore ?? 1;

      if (topScored.length >= 3) {
        const makeContenders = (mapper) =>
          topScored.slice(0, 5).map(([title, score]) => {
            const name = mapper(title);
            // Probability derived from relative consensus score, not arbitrary rank formula
            const basePct = Math.round((score.consensusScore / maxScore) * 80);
            const prob    = score.isFrontrunner ? Math.min(88, basePct + 10)
                          : score.isConsensus   ? Math.min(72, basePct)
                          : Math.min(55, basePct - 5);
            return {
              name,
              title: name,
              probability:     Math.max(8, prob),
              isConsensus:     score.isConsensus,
              isFrontrunner:   score.isFrontrunner,
              predictingSites: score.predictingSites,
            };
          });

        frontrunners = {
          bestPicture:           makeContenders((t) => t),
          bestDirector:          makeContenders((t) => `Director of "${t}"`),
          bestActor:             makeContenders((t) => `Lead actor in "${t}"`),
          bestActress:           makeContenders((t) => `Lead actress in "${t}"`),
          bestSupportingActor:   makeContenders((t) => `Supporting actor in "${t}"`),
          bestSupportingActress: makeContenders((t) => `Supporting actress in "${t}"`),
        };
      } else {
        // Sparse RSS — fall back to catalog with Oscar window bonus
        const fb = catalog.slice(0, 5);
        const makeC = (fn) => fb.map((f, i) => {
          const wb = getOscarSeasonBonus(f.releaseDate, ELIGIBILITY_YEAR);
          return { name: fn(f), title: fn(f), probability: Math.round((30 - i * 4) * (wb / 2)) };
        });
        frontrunners = {
          bestPicture:           makeC((f) => f.title),
          bestDirector:          makeC((f) => `Director of "${f.title}"`),
          bestActor:             makeC((f) => `Lead actor in "${f.title}"`),
          bestActress:           makeC((f) => `Lead actress in "${f.title}"`),
          bestSupportingActor:   makeC((f) => `Supporting actor in "${f.title}"`),
          bestSupportingActress: makeC((f) => `Supporting actress in "${f.title}"`),
        };
      }

      return NextResponse.json({
        success:   true,
        queryType: "precursors",
        data: {
          season: `${ELIGIBILITY_YEAR}-${ELIGIBILITY_YEAR + 1}`,
          precursors: [
            { name: "Telluride / Venice",  status: "upcoming", date: "September 2026", oscarCorrelation: "high" },
            { name: "TIFF",                status: "upcoming", date: "September 2026", oscarCorrelation: "high" },
            { name: "AFI Fest",            status: "upcoming", date: "October 2026",   oscarCorrelation: "medium" },
            { name: "NYFF",                status: "upcoming", date: "October 2026",   oscarCorrelation: "medium" },
            { name: "Golden Globes",       status: "upcoming", date: "January 2027",   oscarCorrelation: "high" },
            { name: "Critics Choice",      status: "upcoming", date: "January 2027",   oscarCorrelation: "high" },
            { name: "SAG Awards",          status: "upcoming", date: "February 2027",  oscarCorrelation: "very high" },
            { name: "DGA Awards",          status: "upcoming", date: "February 2027",  oscarCorrelation: "very high" },
            { name: "PGA Awards",          status: "upcoming", date: "February 2027",  oscarCorrelation: "high" },
            { name: "BAFTA",               status: "upcoming", date: "February 2027",  oscarCorrelation: "high" },
            { name: "WGA Awards",          status: "upcoming", date: "February 2027",  oscarCorrelation: "medium" },
          ],
          frontrunners,
        },
        articlesScanned:    oscarArticles.length,
        predictionArticles: predArticles.length,
        sources:            activeSources,
        tmdbConfigured:     !!apiKey,
        scoringModel:       "consensus-authority-weighted",
        fetchedAt:          new Date().toISOString(),
      });
    }

    return NextResponse.json({ success: false, error: "Invalid query_type" }, { status: 400 });
  } catch (error) {
    console.error("Festival intel error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
