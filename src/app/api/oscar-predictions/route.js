// 99th Academy Awards Predictions — PMC-primary, TMDB-enriched.
//
// Data flow:
//   1. scrapePMCPredictions  — Variety + Deadline + IndieWire + THR (RSS + award pages)
//                              Extracts structured category predictions with pattern matching
//   2. enrichFilmsWithCredits — TMDB credits for the PMC Best Picture list → real director
//                              and actor/actress names via gender-split cast data
//   3. Non-PMC RSS consensus  — Gold Derby, Next Best Picture, etc. as verification layer
//                              Supplements PMC when data is sparse
//
// Categories use real names sourced from:
//   • Best Picture:    PMC prediction rankings
//   • Best Director:   TMDB director credit for each BP contender
//   • Best Actor/Actress: TMDB cast (gender-split: gender=2 male, gender=1 female)
//   • Supporting roles: second-billed male/female from TMDB cast

import { NextResponse } from "next/server";
import {
  getTMDBOscarSeasonFilms,
  getTMDBOscarContenders,
  enrichFilmsWithCredits,
} from "@/lib/tmdb";
import { scrapePMCPredictions } from "@/lib/penskeFeeds";
import {
  PREDICTION_FEEDS,
  fetchFeed,
  filterOscarArticles,
  filterPredictionArticles,
  extractFilmTitles,
  computeConsensusScore,
  getOscarSeasonBonus,
} from "@/lib/oscarFeeds";

export async function POST(request) {
  try {
    const { ceremony = "99th", year = 2027 } = await request.json();
    const eligibilityYear = year - 1; // 2026 for the 99th Oscars
    const apiKey = process.env.TMDB_API_KEY;

    // All data sources in parallel — PMC scrape + TMDB catalog + secondary RSS
    const [pmcResult, feedResults, seasonFilms, broadCatalog] = await Promise.all([
      scrapePMCPredictions(eligibilityYear),
      Promise.all(PREDICTION_FEEDS.map(fetchFeed)),
      apiKey ? getTMDBOscarSeasonFilms(eligibilityYear, apiKey) : null,
      apiKey ? getTMDBOscarContenders(eligibilityYear, apiKey) : null,
    ]);

    const pmcBP      = pmcResult.predictions.bestPicture ?? [];
    const pmcDir     = pmcResult.predictions.bestDirector ?? [];
    const pmcActor   = pmcResult.predictions.bestActor ?? [];
    const pmcActress = pmcResult.predictions.bestActress ?? [];
    const pmcSuppAct = pmcResult.predictions.bestSupportingActor ?? [];
    const pmcSuppAct2= pmcResult.predictions.bestSupportingActress ?? [];

    // Build TMDB catalog for metadata + gap-fill (Oscar-season films first)
    const seasonCatalog = seasonFilms ?? [];
    const broadSet = new Set(seasonCatalog.map((f) => f.title));
    const tmdbCatalog = [
      ...seasonCatalog,
      ...(broadCatalog ?? []).filter((f) => !broadSet.has(f.title)),
    ];
    const catalogMap = new Map(tmdbCatalog.map((f) => [f.title.toLowerCase(), f]));

    // Secondary RSS for consensus verification
    const allArticles   = feedResults.flat();
    const oscarArticles = filterOscarArticles(allArticles);
    const predArticles  = filterPredictionArticles(allArticles).filter(
      (a) => /prediction|frontrunner|race|favorite|contender|rankings|picks|tracker/i.test(a.title)
    );
    const activeSources = PREDICTION_FEEDS
      .filter((_, i) => feedResults[i].length > 0)
      .map((f) => f.name);

    // ── Build the Best Picture film list ──────────────────────────────────────
    // Primary: PMC prediction rankings
    // Secondary: RSS consensus scoring from non-PMC sites (fills in if PMC is sparse)
    let rankedFilmTitles;

    if (pmcBP.length >= 3) {
      // PMC has enough data — use it directly, merge RSS-only titles at the end
      const pmcSet = new Set(pmcBP.map((p) => p.name));
      const rssTitles = new Set([
        ...extractFilmTitles(predArticles.map((a) => a.title + " " + a.description).join(" ")),
        ...extractFilmTitles(oscarArticles.map((a) => a.title + " " + a.description).join(" ")),
      ]);
      const rssOnly = [...rssTitles].filter((t) => !pmcSet.has(t));
      rankedFilmTitles = [...pmcBP.map((p) => p.name), ...rssOnly].slice(0, 12);
    } else {
      // PMC sparse — fall back to RSS consensus model
      const rssTitles = new Set([
        ...extractFilmTitles(predArticles.map((a) => a.title + " " + a.description).join(" ")),
        ...extractFilmTitles(oscarArticles.map((a) => a.title + " " + a.description).join(" ")),
      ]);
      const rssScored = [...rssTitles]
        .map((t) => ({ t, ...computeConsensusScore(oscarArticles, predArticles, t) }))
        .filter((x) => x.rawMentions > 0)
        .sort((a, b) => b.consensusScore - a.consensusScore)
        .map((x) => x.t);
      // Fill with TMDB catalog using Oscar window bonus
      const tmdbFill = tmdbCatalog
        .filter((f) => !rssTitles.has(f.title))
        .map((f) => ({ t: f.title, wb: getOscarSeasonBonus(f.releaseDate, eligibilityYear) }))
        .sort((a, b) => b.wb - a.wb)
        .map((x) => x.t);
      rankedFilmTitles = [...new Set([...rssScored, ...tmdbFill])].slice(0, 12);
    }

    if (!rankedFilmTitles.length) {
      throw new Error("No prediction data returned from PMC outlets or RSS. Check network connection.");
    }

    // ── TMDB credit enrichment for top 8 films ────────────────────────────────
    const filmsForEnrichment = rankedFilmTitles.slice(0, 8).map((title) => ({
      title,
      ...(catalogMap.get(title.toLowerCase()) ?? {}),
    }));
    const enriched    = await enrichFilmsWithCredits(filmsForEnrichment, eligibilityYear, apiKey, 8);
    const enrichedMap = new Map(enriched.map((f) => [f.title, f]));

    // Build final ranked films list with enrichment data
    const rankedFilms = rankedFilmTitles.map((title, i) => {
      const ef  = enrichedMap.get(title);
      const cat = catalogMap.get(title.toLowerCase());
      const pmcEntry = pmcBP.find((p) => p.name === title);
      const rsScore  = pmcEntry ? pmcEntry.score : 0;
      return {
        title,
        ...(ef ?? cat ?? {}),
        pmcScore:      rsScore,
        pmcRank:       pmcEntry ? pmcBP.indexOf(pmcEntry) : null,
        isFrontrunner: i === 0,
        isConsensus:   i < 3,
      };
    });

    // ── Probability calculation ───────────────────────────────────────────────
    const maxScore = pmcBP[0]?.score ?? 1;
    const calcProb = (film, i) => {
      if (!film.pmcScore) return Math.max(8, 28 - i * 4);
      const base = Math.round((film.pmcScore / maxScore) * 80);
      return Math.min(88, i === 0 ? base + 8 : i < 3 ? base + 3 : base);
    };

    // ── Helper: pick name from PMC prediction list ────────────────────────────
    const pmcName = (list, idx = 0) => list[idx]?.name ?? null;

    const frontrunner = rankedFilms[0];
    const frontrunnerNote = pmcBP.length >= 3
      ? `PMC consensus — ${pmcResult.activeSources.join(", ")}`
      : activeSources.length
      ? `Prediction-site consensus — ${activeSources.slice(0, 3).join(", ")}`
      : `${eligibilityYear} Oscar-season contender — campaigns building`;

    // ── Category assembly ─────────────────────────────────────────────────────
    const categories = [
      {
        id: "bestPicture", name: "Best Picture", icon: "🏆",
        nominees:    rankedFilms.slice(0, 8).map((f) => f.title),
        frontrunner: frontrunner?.title,
        frontrunnerNote,
        probabilities: rankedFilms.slice(0, 8).map((f, i) => ({
          title: f.title, probability: calcProb(f, i),
          isConsensus: f.isConsensus, isFrontrunner: f.isFrontrunner,
          pmcPredicted: f.pmcScore > 0,
        })),
      },
      {
        id: "bestDirector", name: "Best Director", icon: "🎬",
        // PMC bestDirector list first, fall back to TMDB director per BP film
        nominees: rankedFilms.slice(0, 6).map((f, i) =>
          pmcName(pmcDir, i) ??
          enrichedMap.get(f.title)?.director ??
          `Director of "${f.title}"`
        ),
        frontrunner:
          pmcName(pmcDir) ??
          enrichedMap.get(frontrunner?.title)?.director ??
          `Director of "${frontrunner?.title}"`,
        frontrunnerNote:
          pmcName(pmcDir)
            ? `PMC prediction — ${pmcResult.activeSources[0] ?? "Variety"}`
            : enrichedMap.get(frontrunner?.title)?.director
            ? `Director of leading Best Picture contender (TMDB credits)`
            : "Director of top contender",
      },
      {
        id: "bestActor", name: "Best Actor", icon: "🎭",
        nominees: rankedFilms.slice(0, 6).map((f, i) => {
          const pmcEntry = pmcName(pmcActor, i);
          if (pmcEntry) return pmcEntry;
          const ef = enrichedMap.get(f.title);
          return ef?.topMaleCast?.[0] ? `${ef.topMaleCast[0]} — ${f.title}` : `Lead actor in "${f.title}"`;
        }),
        frontrunner: (() => {
          const pmcEntry = pmcName(pmcActor);
          if (pmcEntry) return pmcEntry;
          const ef = enrichedMap.get(frontrunner?.title);
          return ef?.topMaleCast?.[0]
            ? `${ef.topMaleCast[0]} — ${frontrunner?.title}`
            : `Lead actor in "${frontrunner?.title}"`;
        })(),
        frontrunnerNote: pmcName(pmcActor)
          ? `PMC prediction — ${pmcResult.activeSources[0] ?? "Variety"}`
          : "TMDB lead male cast in top contender",
      },
      {
        id: "bestActress", name: "Best Actress", icon: "👑",
        nominees: rankedFilms.slice(0, 6).map((f, i) => {
          const pmcEntry = pmcName(pmcActress, i);
          if (pmcEntry) return pmcEntry;
          const ef = enrichedMap.get(f.title);
          return ef?.topFemaleCast?.[0] ? `${ef.topFemaleCast[0]} — ${f.title}` : `Lead actress in "${f.title}"`;
        }),
        frontrunner: (() => {
          const pmcEntry = pmcName(pmcActress);
          if (pmcEntry) return pmcEntry;
          const ef = enrichedMap.get(frontrunner?.title);
          return ef?.topFemaleCast?.[0]
            ? `${ef.topFemaleCast[0]} — ${frontrunner?.title}`
            : `Lead actress in "${frontrunner?.title}"`;
        })(),
        frontrunnerNote: pmcName(pmcActress)
          ? `PMC prediction — ${pmcResult.activeSources[0] ?? "Variety"}`
          : "TMDB lead female cast in top contender",
      },
      {
        id: "bestSupportingActor", name: "Best Supporting Actor", icon: "🌟",
        nominees: rankedFilms.slice(0, 6).map((f, i) => {
          const pmcEntry = pmcName(pmcSuppAct, i);
          if (pmcEntry) return pmcEntry;
          const ef = enrichedMap.get(f.title);
          const cast = ef?.topMaleCast;
          return cast?.[1] ? `${cast[1]} — ${f.title}` : cast?.[0] ? `${cast[0]} — ${f.title}` : `Supporting actor in "${f.title}"`;
        }),
        frontrunner: pmcName(pmcSuppAct) ?? (() => {
          const ef   = enrichedMap.get(frontrunner?.title);
          const cast = ef?.topMaleCast;
          return cast?.[1] ? `${cast[1]} — ${frontrunner?.title}` : `Supporting actor in "${frontrunner?.title}"`;
        })(),
        frontrunnerNote: pmcName(pmcSuppAct) ? `PMC prediction` : "TMDB second-billed male cast",
      },
      {
        id: "bestSupportingActress", name: "Best Supporting Actress", icon: "✨",
        nominees: rankedFilms.slice(0, 6).map((f, i) => {
          const pmcEntry = pmcName(pmcSuppAct2, i);
          if (pmcEntry) return pmcEntry;
          const ef = enrichedMap.get(f.title);
          const cast = ef?.topFemaleCast;
          return cast?.[1] ? `${cast[1]} — ${f.title}` : cast?.[0] ? `${cast[0]} — ${f.title}` : `Supporting actress in "${f.title}"`;
        }),
        frontrunner: pmcName(pmcSuppAct2) ?? (() => {
          const ef   = enrichedMap.get(frontrunner?.title);
          const cast = ef?.topFemaleCast;
          return cast?.[1] ? `${cast[1]} — ${frontrunner?.title}` : `Supporting actress in "${frontrunner?.title}"`;
        })(),
        frontrunnerNote: pmcName(pmcSuppAct2) ? `PMC prediction` : "TMDB second-billed female cast",
      },
    ];

    return NextResponse.json({
      success: true,
      data: {
        ceremonyName:  `${ceremony} Academy Awards`,
        ceremonyYear:  year,
        eligibilityYear,
        lastUpdated:   new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        pmcSources:    pmcResult.activeSources,
        secondarySources: activeSources,
        categories,
        consensusLeaders: rankedFilms.slice(0, 5).map((f) => ({
          title:        f.title,
          director:     enrichedMap.get(f.title)?.director ?? null,
          topCast:      enrichedMap.get(f.title)?.topCast  ?? [],
          pmcScore:     f.pmcScore,
          pmcRank:      f.pmcRank,
          isFrontrunner: f.isFrontrunner,
          releaseDate:  f.releaseDate ?? null,
          poster:       enrichedMap.get(f.title)?.poster ?? f.poster ?? null,
        })),
      },
      pmcArticles:     pmcResult.sources.filter((s) => s.fetched).length,
      rssArticles:     oscarArticles.length,
      tmdbConfigured:  !!apiKey,
      dataSource:      pmcBP.length >= 3 ? "PMC-primary" : "RSS-fallback",
      fetchedAt:       new Date().toISOString(),
    });
  } catch (error) {
    console.error("Oscar predictions API error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
