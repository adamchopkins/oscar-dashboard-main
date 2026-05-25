// 99th Academy Awards Predictions — long-term consensus model.
//
// Scoring model (not raw mention count):
//   1. Site authority weight   — Gold Derby (3.0×) > prediction specialists (2.5×) > trades (1.8×)
//   2. Prediction-article weight — articles specifically making predictions count 2.5× vs. general coverage
//   3. Cross-site consensus     — films picked by 3+ independent sites get a 2–3× multiplier
//   4. Oscar season window      — Sep–Dec releases score 2× (peak campaign season)
//
// Film catalog: TMDB drama/history films for the Oscar season window (Jul–Dec eligibility year)
//               Falls back to Wikipedia MediaWiki API if TMDB_API_KEY is absent.

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
  getTMDBOscarSeasonFilms,
  getWikipediaFilms,
} from "@/lib/oscarFeeds";

export async function POST(request) {
  try {
    const { ceremony = "99th", year = 2027 } = await request.json();
    const eligibilityYear = year - 1; // 2026 for the 99th Oscars
    const apiKey = process.env.TMDB_API_KEY;

    // RSS feeds + Oscar season film catalog — all parallel, all live
    const [feedResults, seasonFilms, broadCatalog] = await Promise.all([
      Promise.all(PREDICTION_FEEDS.map(fetchFeed)),
      // Oscar season window (Jul–Dec) — the films that actually campaign
      apiKey ? getTMDBOscarSeasonFilms(eligibilityYear, apiKey) : null,
      // Broader catalog as fallback gap-filler
      apiKey ? getTMDBOscarContenders(eligibilityYear, apiKey) : getWikipediaFilms(eligibilityYear),
    ]);

    // Prefer Oscar-season films; merge with broader catalog to fill gaps
    const oscarCatalog = seasonFilms ?? await getWikipediaFilms(eligibilityYear);
    const fullCatalog  = broadCatalog ?? await getWikipediaFilms(eligibilityYear);
    const catalogSeen  = new Set(oscarCatalog.map((f) => f.title));
    const mergedCatalog = [
      ...oscarCatalog,
      ...fullCatalog.filter((f) => !catalogSeen.has(f.title)),
    ];

    const allArticles  = feedResults.flat();
    const oscarArticles = filterOscarArticles(allArticles);
    // Prediction articles are the primary long-term signal
    const predArticles  = filterPredictionArticles(allArticles).filter(
      (a) => /prediction|frontrunner|race|favorite|contender|rankings|picks|tracker/i.test(a.title)
    );
    const activeSources = PREDICTION_FEEDS
      .filter((_, i) => feedResults[i].length > 0)
      .map((f) => f.name);
    const predSources = PREDICTION_FEEDS
      .filter((_, i) => feedResults[i].some((a) =>
        /prediction|frontrunner|race|rankings/i.test(a.title)
      ))
      .map((f) => f.name);

    // Extract film titles from both prediction articles (primary) and general Oscar articles
    const predText    = predArticles.map((a) => a.title + " " + a.description).join(" ");
    const oscarText   = oscarArticles.map((a) => a.title + " " + a.description).join(" ");
    const allTitles   = new Set([
      ...extractFilmTitles(predText),
      ...extractFilmTitles(oscarText),
    ]);

    // Score each title using the consensus model
    const scoredTitles = [...allTitles].map((title) => {
      const score = computeConsensusScore(oscarArticles, predArticles, title);
      return { title, ...score };
    }).filter((t) => t.rawMentions > 0);

    // Merge with Oscar-season catalog: catalog films get Oscar window bonus
    const catalogMap = new Map(mergedCatalog.map((f) => [f.title.toLowerCase(), f]));
    const catalogFilms = mergedCatalog
      .filter((f) => !allTitles.has(f.title))
      .map((f) => {
        const windowBonus = getOscarSeasonBonus(f.releaseDate, eligibilityYear);
        return {
          title:          f.title,
          rawMentions:    0,
          predMentions:   0,
          distinctSites:  0,
          predictingSites: 0,
          consensusScore: (f.popularity / 10) * windowBonus,
          isConsensus:    false,
          isFrontrunner:  false,
          fromCatalog:    true,
          oscarWindow:    f.oscarWindow ?? false,
        };
      });

    // Apply Oscar season window bonus to RSS-scored films found in catalog
    const rssScoredWithBonus = scoredTitles.map((t) => {
      const meta = catalogMap.get(t.title.toLowerCase());
      const windowBonus = meta ? getOscarSeasonBonus(meta.releaseDate, eligibilityYear) : 1.2;
      return { ...t, consensusScore: t.consensusScore * windowBonus, meta };
    });

    // Final ranked list: consensus score descending, catalog gap-fill at the end
    const rankedFilms = [
      ...rssScoredWithBonus.sort((a, b) => b.consensusScore - a.consensusScore),
      ...catalogFilms.sort((a, b) => b.consensusScore - a.consensusScore),
    ].slice(0, 12);

    if (rankedFilms.length === 0) {
      throw new Error("No film data returned. Check your network connection and try again.");
    }

    // Probability score: consensus leaders get steep advantage over field
    const maxScore = rankedFilms[0]?.consensusScore ?? 1;
    const probability = (film, rank) => {
      if (film.isFrontrunner) return Math.min(88, Math.round((film.consensusScore / maxScore) * 85));
      if (film.isConsensus)   return Math.min(72, Math.round((film.consensusScore / maxScore) * 65));
      if (!film.fromCatalog)  return Math.min(55, Math.round((film.consensusScore / maxScore) * 50));
      return Math.max(8, 30 - rank * 4);
    };

    const nom = (count = 8) =>
      rankedFilms.slice(0, count).map((f, i) => ({
        title:       f.title,
        probability: probability(f, i),
        isConsensus: f.isConsensus,
        isFrontrunner: f.isFrontrunner,
        sites:       f.predictingSites,
        fromCatalog: f.fromCatalog ?? false,
      }));

    const frontrunner = rankedFilms[0];
    const frontrunnerNote = frontrunner?.isFrontrunner
      ? `Consensus pick: predicted by ${frontrunner.predictingSites} sites (${predSources.slice(0, 3).join(", ")})`
      : frontrunner?.isConsensus
      ? `Emerging consensus: ${frontrunner.predictingSites} sites, ${frontrunner.rawMentions} articles`
      : frontrunner?.rawMentions > 0
      ? `${frontrunner.rawMentions} article${frontrunner.rawMentions !== 1 ? "s" : ""} across ${activeSources.slice(0, 3).join(", ")}`
      : `${eligibilityYear} Oscar-season release — campaigns building`;

    const nominees = nom(8);

    const categories = [
      {
        id: "bestPicture", name: "Best Picture", icon: "🏆",
        nominees:        nominees.map((n) => n.title),
        frontrunner:     frontrunner?.title,
        frontrunnerNote,
        consensus:       nominees.slice(0, 3).filter((n) => n.isConsensus).map((n) => n.title),
      },
      {
        id: "bestDirector", name: "Best Director", icon: "🎬",
        nominees:        rankedFilms.slice(0, 6).map((f) => `Director of "${f.title}"`),
        frontrunner:     `Director of "${frontrunner?.title}"`,
        frontrunnerNote: "Director of leading consensus Best Picture contender",
      },
      {
        id: "bestActor", name: "Best Actor", icon: "🎭",
        nominees:        rankedFilms.slice(0, 6).map((f) => `Lead performance in "${f.title}"`),
        frontrunner:     `Lead performance in "${frontrunner?.title}"`,
        frontrunnerNote: "Lead performance in top prediction-site contender",
      },
      {
        id: "bestActress", name: "Best Actress", icon: "👑",
        nominees:        rankedFilms.slice(0, 6).map((f) => `Lead actress in "${f.title}"`),
        frontrunner:     `Lead actress in "${frontrunner?.title}"`,
        frontrunnerNote: "Lead female performance in top contenders",
      },
      {
        id: "bestSupportingActor", name: "Best Supporting Actor", icon: "🌟",
        nominees:        rankedFilms.slice(0, 6).map((f) => `Supporting role in "${f.title}"`),
        frontrunner:     `Supporting role in "${frontrunner?.title}"`,
        frontrunnerNote: "Supporting performance across top Oscar contenders",
      },
      {
        id: "bestSupportingActress", name: "Best Supporting Actress", icon: "✨",
        nominees:        rankedFilms.slice(0, 6).map((f) => `Supporting actress in "${f.title}"`),
        frontrunner:     `Supporting actress in "${frontrunner?.title}"`,
        frontrunnerNote: "Supporting female performance across top contenders",
      },
    ];

    return NextResponse.json({
      success: true,
      data: {
        ceremonyName:  `${ceremony} Academy Awards`,
        ceremonyYear:  year,
        eligibilityYear,
        lastUpdated:   new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        sources:       activeSources,
        predictionSources: predSources,
        categories,
        // Top consensus picks with scores (for UI display)
        consensusLeaders: rankedFilms.slice(0, 5).map((f) => ({
          title:          f.title,
          consensusScore: Math.round(f.consensusScore * 10) / 10,
          predictingSites: f.predictingSites,
          isConsensus:    f.isConsensus,
          isFrontrunner:  f.isFrontrunner,
          oscarWindow:    f.meta?.oscarWindow ?? false,
        })),
      },
      articlesScanned:    oscarArticles.length,
      predictionArticles: predArticles.length,
      tmdbConfigured:     !!apiKey,
      scoringModel:       "consensus-authority-weighted",
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Oscar predictions API error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
