// 99th Academy Awards Predictions — TMDB-first, consensus-scored.
//
// Film data:       TMDB (primary) — getTMDBOscarSeasonFilms + getTMDBOscarContenders
// Credit enrichment: enrichFilmsWithCredits fetches real director & cast names per top film
// Scoring model:   RSS consensus (site authority × prediction weight × cross-site agreement)
//                  × TMDB Oscar season release window bonus
// Categories:      Real names from TMDB credits (director, lead actor/actress, supporting)

import { NextResponse } from "next/server";
import {
  getTMDBOscarContenders,
  getTMDBOscarSeasonFilms,
  enrichFilmsWithCredits,
} from "@/lib/tmdb";
import {
  PREDICTION_FEEDS,
  fetchFeed,
  filterOscarArticles,
  filterPredictionArticles,
  extractFilmTitles,
  computeConsensusScore,
  getOscarSeasonBonus,
  getWikipediaFilms,
} from "@/lib/oscarFeeds";

export async function POST(request) {
  try {
    const { ceremony = "99th", year = 2027 } = await request.json();
    const eligibilityYear = year - 1; // 2026 for the 99th Oscars
    const apiKey = process.env.TMDB_API_KEY;

    // TMDB catalog + RSS feeds — all parallel
    const [feedResults, seasonFilms, broadCatalog] = await Promise.all([
      Promise.all(PREDICTION_FEEDS.map(fetchFeed)),
      apiKey ? getTMDBOscarSeasonFilms(eligibilityYear, apiKey) : null,
      apiKey ? getTMDBOscarContenders(eligibilityYear, apiKey) : null,
    ]);

    // Merge: Oscar-season films (Jul–Dec) first, then full-year prestige, then Wikipedia gap-fill
    const seasonCatalog = seasonFilms ?? [];
    const broadSet      = new Set(seasonCatalog.map((f) => f.title));
    const merged = [
      ...seasonCatalog,
      ...(broadCatalog ?? []).filter((f) => !broadSet.has(f.title)),
    ];
    const catalog = merged.length ? merged : await getWikipediaFilms(eligibilityYear);

    const allArticles   = feedResults.flat();
    const oscarArticles = filterOscarArticles(allArticles);
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

    // Extract film titles from prediction articles + general Oscar coverage
    const allTitles = new Set([
      ...extractFilmTitles(predArticles.map((a) => a.title + " " + a.description).join(" ")),
      ...extractFilmTitles(oscarArticles.map((a) => a.title + " " + a.description).join(" ")),
    ]);

    // Score each title with the consensus model
    const scoredTitles = [...allTitles]
      .map((title) => ({ title, ...computeConsensusScore(oscarArticles, predArticles, title) }))
      .filter((t) => t.rawMentions > 0);

    // Catalog gap-fill: TMDB films not in RSS get a score based on release window
    const catalogMap  = new Map(catalog.map((f) => [f.title.toLowerCase(), f]));
    const catalogFill = catalog
      .filter((f) => !allTitles.has(f.title))
      .map((f) => {
        const wb = getOscarSeasonBonus(f.releaseDate, eligibilityYear);
        return {
          title: f.title, rawMentions: 0, predMentions: 0,
          distinctSites: 0, predictingSites: 0,
          consensusScore: (f.popularity / 10) * wb,
          isConsensus: false, isFrontrunner: false, fromCatalog: true,
        };
      });

    // Apply Oscar season window bonus to RSS-scored films found in TMDB catalog
    const rssWithBonus = scoredTitles.map((t) => {
      const meta = catalogMap.get(t.title.toLowerCase());
      const wb   = meta ? getOscarSeasonBonus(meta.releaseDate, eligibilityYear) : 1.2;
      return { ...t, consensusScore: t.consensusScore * wb };
    });

    const rankedBase = [
      ...rssWithBonus.sort((a, b) => b.consensusScore - a.consensusScore),
      ...catalogFill.sort((a, b) => b.consensusScore - a.consensusScore),
    ].slice(0, 12);

    if (rankedBase.length === 0) {
      throw new Error("No film data returned. Check network connection and try again.");
    }

    // Enrich top 8 films with TMDB director & cast data
    const topFilmsForEnrichment = rankedBase.slice(0, 8).map((t) => ({
      title: t.title,
      ...(catalogMap.get(t.title.toLowerCase()) ?? {}),
      ...t,
    }));
    const enriched    = await enrichFilmsWithCredits(topFilmsForEnrichment, eligibilityYear, apiKey, 8);
    const rankedFilms = [...enriched, ...rankedBase.slice(8)];

    // Probability: consensus leaders get a steep advantage
    const maxScore  = rankedFilms[0]?.consensusScore ?? 1;
    const calcProb  = (f, i) => {
      if (f.isFrontrunner) return Math.min(88, Math.round((f.consensusScore / maxScore) * 85));
      if (f.isConsensus)   return Math.min(72, Math.round((f.consensusScore / maxScore) * 65));
      if (!f.fromCatalog)  return Math.min(55, Math.round((f.consensusScore / maxScore) * 50));
      return Math.max(8, 30 - i * 4);
    };

    // Helper: name or fallback string for a category entry
    const nameOrFallback = (name, fallback) => name ?? fallback;

    // ── Build categories with real TMDB names ────────────────────────────────
    const pictureNoms   = rankedFilms.slice(0, 8);
    const directorNoms  = rankedFilms.slice(0, 6);
    const actorNoms     = rankedFilms.slice(0, 6);
    const actressNoms   = rankedFilms.slice(0, 6);
    const suppActNoms   = rankedFilms.slice(0, 6);
    const suppActNoms2  = rankedFilms.slice(0, 6);

    const frontrunner     = rankedFilms[0];
    const frontrunnerNote = frontrunner?.isFrontrunner
      ? `Consensus pick: predicted by ${frontrunner.predictingSites} sites (${predSources.slice(0, 3).join(", ")})`
      : frontrunner?.isConsensus
      ? `Emerging consensus: ${frontrunner.predictingSites} sites, ${frontrunner.rawMentions} articles`
      : frontrunner?.rawMentions > 0
      ? `${frontrunner.rawMentions} article${frontrunner.rawMentions !== 1 ? "s" : ""} across ${activeSources.slice(0, 3).join(", ")}`
      : `${eligibilityYear} Oscar-season release — campaigns building`;

    const categories = [
      {
        id: "bestPicture", name: "Best Picture", icon: "🏆",
        nominees:        pictureNoms.map((f) => f.title),
        frontrunner:     frontrunner?.title,
        frontrunnerNote,
        probabilities:   pictureNoms.map((f, i) => ({ title: f.title, probability: calcProb(f, i), isConsensus: f.isConsensus, isFrontrunner: f.isFrontrunner })),
      },
      {
        id: "bestDirector", name: "Best Director", icon: "🎬",
        nominees: directorNoms.map((f) =>
          nameOrFallback(f.director, `Director of "${f.title}"`)
        ),
        frontrunner: nameOrFallback(frontrunner?.director, `Director of "${frontrunner?.title}"`),
        frontrunnerNote: frontrunner?.director
          ? `${frontrunner.director} — director of leading consensus contender`
          : "Director of most-discussed prestige film",
      },
      {
        id: "bestActor", name: "Best Actor", icon: "🎭",
        nominees: actorNoms.map((f) =>
          f.topMaleCast?.[0]
            ? `${f.topMaleCast[0]} — ${f.title}`
            : `Lead male performance in "${f.title}"`
        ),
        frontrunner: frontrunner?.topMaleCast?.[0]
          ? `${frontrunner.topMaleCast[0]} — ${frontrunner.title}`
          : `Lead male performance in "${frontrunner?.title}"`,
        frontrunnerNote: "Lead male performance in top prediction-site contender",
      },
      {
        id: "bestActress", name: "Best Actress", icon: "👑",
        nominees: actressNoms.map((f) =>
          f.topFemaleCast?.[0]
            ? `${f.topFemaleCast[0]} — ${f.title}`
            : `Lead female performance in "${f.title}"`
        ),
        frontrunner: frontrunner?.topFemaleCast?.[0]
          ? `${frontrunner.topFemaleCast[0]} — ${frontrunner.title}`
          : `Lead female performance in "${frontrunner?.title}"`,
        frontrunnerNote: "Lead female performance in top contenders",
      },
      {
        id: "bestSupportingActor", name: "Best Supporting Actor", icon: "🌟",
        nominees: suppActNoms.map((f) =>
          f.topMaleCast?.[1]
            ? `${f.topMaleCast[1]} — ${f.title}`
            : f.topMaleCast?.[0]
            ? `${f.topMaleCast[0]} — ${f.title}`
            : `Supporting male in "${f.title}"`
        ),
        frontrunner: frontrunner?.topMaleCast?.[1]
          ? `${frontrunner.topMaleCast[1]} — ${frontrunner.title}`
          : `Supporting male in "${frontrunner?.title}"`,
        frontrunnerNote: "Supporting male performance across top Oscar contenders",
      },
      {
        id: "bestSupportingActress", name: "Best Supporting Actress", icon: "✨",
        nominees: suppActNoms2.map((f) =>
          f.topFemaleCast?.[1]
            ? `${f.topFemaleCast[1]} — ${f.title}`
            : f.topFemaleCast?.[0]
            ? `${f.topFemaleCast[0]} — ${f.title}`
            : `Supporting female in "${f.title}"`
        ),
        frontrunner: frontrunner?.topFemaleCast?.[1]
          ? `${frontrunner.topFemaleCast[1]} — ${frontrunner.title}`
          : `Supporting female in "${frontrunner?.title}"`,
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
        consensusLeaders: rankedFilms.slice(0, 5).map((f) => ({
          title:          f.title,
          director:       f.director ?? null,
          topCast:        f.topCast ?? [],
          consensusScore: Math.round((f.consensusScore ?? 0) * 10) / 10,
          predictingSites: f.predictingSites ?? 0,
          isConsensus:    f.isConsensus   ?? false,
          isFrontrunner:  f.isFrontrunner ?? false,
          releaseDate:    f.releaseDate   ?? null,
          poster:         f.poster        ?? null,
        })),
      },
      articlesScanned:    oscarArticles.length,
      predictionArticles: predArticles.length,
      tmdbConfigured:     !!apiKey,
      scoringModel:       "tmdb-credits + consensus-authority-weighted",
      fetchedAt:          new Date().toISOString(),
    });
  } catch (error) {
    console.error("Oscar predictions API error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
