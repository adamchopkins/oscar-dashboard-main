// Festival Intelligence & Precursor Awards — TMDB-first, consensus-scored.
//
// Film data:     TMDB getTMDBOscarContenders (primary) — Wikipedia fallback if no key
// Enrichment:    enrichFilmsWithCredits adds director + cast to top festival contenders
// Scoring:       Same consensus model as oscar-predictions

import { NextResponse } from "next/server";
import {
  getTMDBOscarContenders,
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
  releaseQuarter,
} from "@/lib/oscarFeeds";

export async function POST(request) {
  try {
    const { query_type = "festivals" } = await request.json();
    const apiKey            = process.env.TMDB_API_KEY;
    const ELIGIBILITY_YEAR  = 2026;

    const [feedResults, tmdbCatalog] = await Promise.all([
      Promise.all(PREDICTION_FEEDS.map(fetchFeed)),
      apiKey ? getTMDBOscarContenders(ELIGIBILITY_YEAR, apiKey) : null,
    ]);

    const catalog = tmdbCatalog ?? await getWikipediaFilms(ELIGIBILITY_YEAR);

    const allArticles   = feedResults.flat();
    const oscarArticles = filterOscarArticles(allArticles);
    const predArticles  = filterPredictionArticles(allArticles).filter(
      (a) => /prediction|frontrunner|race|favorite|contender|rankings|picks|tracker/i.test(a.title)
    );
    const activeSources = PREDICTION_FEEDS
      .filter((_, i) => feedResults[i].length > 0)
      .map((f) => f.name);

    const allTitles = [...new Set([
      ...extractFilmTitles(predArticles.map((a) => a.title + " " + a.description).join(" ")),
      ...extractFilmTitles(oscarArticles.map((a) => a.title + " " + a.description).join(" ")),
    ])];

    const titleScores = new Map(
      allTitles.map((t) => [t, computeConsensusScore(oscarArticles, predArticles, t)])
    );

    const catalogMap = new Map(catalog.map((f) => [f.title.toLowerCase(), f]));

    // Sorted by consensus score descending, TMDB catalog as gap-fill
    const rssRanked  = [...titleScores.entries()]
      .filter(([, s]) => s.rawMentions > 0)
      .sort((a, b) => b[1].consensusScore - a[1].consensusScore)
      .map(([t]) => t);
    const catalogOnly = catalog.map((f) => f.title).filter((t) => !titleScores.has(t));
    const allRanked   = [...new Set([...rssRanked, ...catalogOnly])];

    // ── FESTIVALS ──────────────────────────────────────────────────────────
    if (query_type === "festivals") {
      // Enrich top 8 with TMDB credits for director/cast info
      const topForEnrichment = allRanked.slice(0, 8).map((title) => ({
        title,
        ...(catalogMap.get(title.toLowerCase()) ?? {}),
      }));
      const enriched    = await enrichFilmsWithCredits(topForEnrichment, ELIGIBILITY_YEAR, apiKey, 8);
      const enrichedMap = new Map(enriched.map((f) => [f.title, f]));

      const films = allRanked.slice(0, 20).map((title) => {
        const meta        = catalogMap.get(title.toLowerCase());
        const score       = titleScores.get(title);
        const enrichedFilm = enrichedMap.get(title);
        const windowBonus = getOscarSeasonBonus(meta?.releaseDate ?? null, ELIGIBILITY_YEAR);
        const mentions    = score?.rawMentions ?? 0;

        const lead = oscarArticles.find((a) =>
          (a.title + " " + a.description).toLowerCase().includes(title.toLowerCase())
        );

        const buzzLevel = score?.isFrontrunner   ? "high"
                        : score?.isConsensus     ? "high"
                        : mentions >= 3          ? "medium"
                        : windowBonus >= 2.0     ? "medium"
                        : "low";

        return {
          title,
          director:        enrichedFilm?.director ?? null,
          topCast:         enrichedFilm?.topCast  ?? [],
          genres:          enrichedFilm?.genres   ?? [],
          festival:        null,
          festivalSection: null,
          distributor:     null,
          poster:          enrichedFilm?.poster ?? meta?.poster ?? null,
          releaseWindow:   releaseQuarter(meta?.releaseDate),
          releaseDate:     meta?.releaseDate ?? null,
          buzzLevel,
          buzzSummary: score?.isFrontrunner
            ? `Consensus frontrunner: ${score.predictingSites} prediction sites, ${mentions} articles`
            : score?.isConsensus
            ? `Emerging consensus: ${score.predictingSites} sites tracking this film`
            : lead
            ? `"${lead.title.slice(0, 80)}" — ${lead.source}`
            : `${ELIGIBILITY_YEAR} Oscar-season film — campaigns building`,
          oscarCategories:  ["Best Picture", "Best Director"],
          mentionCount:     mentions,
          predictingSites:  score?.predictingSites ?? 0,
          isConsensus:      score?.isConsensus     ?? false,
          voteAverage:      meta?.voteAverage ?? 0,
          tmdbEnriched:     !!enrichedFilm?.director,
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
        scoringModel:       "tmdb-credits + consensus-authority-weighted",
        fetchedAt:          new Date().toISOString(),
      });
    }

    // ── PRECURSORS ─────────────────────────────────────────────────────────
    if (query_type === "precursors") {
      const topScored = [...titleScores.entries()]
        .filter(([, s]) => s.rawMentions > 0)
        .sort((a, b) => b[1].consensusScore - a[1].consensusScore)
        .slice(0, 8);

      // Enrich top 5 with TMDB credits
      const topForEnrich = topScored.slice(0, 5).map(([title]) => ({
        title,
        ...(catalogMap.get(title.toLowerCase()) ?? {}),
      }));
      const enriched = await enrichFilmsWithCredits(topForEnrich, ELIGIBILITY_YEAR, apiKey, 5);
      const enrichMap = new Map(enriched.map((f) => [f.title, f]));

      let frontrunners;
      const maxScore = topScored[0]?.[1].consensusScore ?? 1;

      if (topScored.length >= 3) {
        const makeContenders = (mapper) =>
          topScored.slice(0, 5).map(([title, score]) => {
            const eFilm   = enrichMap.get(title);
            const name    = mapper(title, eFilm);
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
              poster:          eFilm?.poster ?? null,
            };
          });

        frontrunners = {
          bestPicture:           makeContenders((t) => t),
          bestDirector:          makeContenders((t, e) => e?.director ?? `Director of "${t}"`),
          bestActor:             makeContenders((t, e) => e?.topMaleCast?.[0]   ? `${e.topMaleCast[0]} — ${t}`   : `Lead actor in "${t}"`),
          bestActress:           makeContenders((t, e) => e?.topFemaleCast?.[0] ? `${e.topFemaleCast[0]} — ${t}` : `Lead actress in "${t}"`),
          bestSupportingActor:   makeContenders((t, e) => e?.topMaleCast?.[1]   ? `${e.topMaleCast[1]} — ${t}`   : `Supporting actor in "${t}"`),
          bestSupportingActress: makeContenders((t, e) => e?.topFemaleCast?.[1] ? `${e.topFemaleCast[1]} — ${t}` : `Supporting actress in "${t}"`),
        };
      } else {
        // Sparse RSS — fall back to TMDB catalog with Oscar window bonus
        const fb    = catalog.slice(0, 5);
        const fbEnr = await enrichFilmsWithCredits(fb, ELIGIBILITY_YEAR, apiKey, 5);
        const makeC = (fn) => fbEnr.map((f, i) => {
          const wb = getOscarSeasonBonus(f.releaseDate, ELIGIBILITY_YEAR);
          return { name: fn(f), title: fn(f), probability: Math.round((30 - i * 4) * (wb / 2)), poster: f.poster ?? null };
        });
        frontrunners = {
          bestPicture:           makeC((f) => f.title),
          bestDirector:          makeC((f) => f.director ?? `Director of "${f.title}"`),
          bestActor:             makeC((f) => f.topMaleCast?.[0]   ? `${f.topMaleCast[0]} — ${f.title}`   : `Lead actor in "${f.title}"`),
          bestActress:           makeC((f) => f.topFemaleCast?.[0] ? `${f.topFemaleCast[0]} — ${f.title}` : `Lead actress in "${f.title}"`),
          bestSupportingActor:   makeC((f) => f.topMaleCast?.[1]   ? `${f.topMaleCast[1]} — ${f.title}`   : `Supporting actor in "${f.title}"`),
          bestSupportingActress: makeC((f) => f.topFemaleCast?.[1] ? `${f.topFemaleCast[1]} — ${f.title}` : `Supporting actress in "${f.title}"`),
        };
      }

      return NextResponse.json({
        success:   true,
        queryType: "precursors",
        data: {
          season: `${ELIGIBILITY_YEAR}-${ELIGIBILITY_YEAR + 1}`,
          precursors: [
            { name: "Telluride / Venice",  status: "upcoming", date: "September 2026", oscarCorrelation: "high"      },
            { name: "TIFF",                status: "upcoming", date: "September 2026", oscarCorrelation: "high"      },
            { name: "AFI Fest",            status: "upcoming", date: "October 2026",   oscarCorrelation: "medium"    },
            { name: "NYFF",                status: "upcoming", date: "October 2026",   oscarCorrelation: "medium"    },
            { name: "Golden Globes",       status: "upcoming", date: "January 2027",   oscarCorrelation: "high"      },
            { name: "Critics Choice",      status: "upcoming", date: "January 2027",   oscarCorrelation: "high"      },
            { name: "SAG Awards",          status: "upcoming", date: "February 2027",  oscarCorrelation: "very high" },
            { name: "DGA Awards",          status: "upcoming", date: "February 2027",  oscarCorrelation: "very high" },
            { name: "PGA Awards",          status: "upcoming", date: "February 2027",  oscarCorrelation: "high"      },
            { name: "BAFTA",               status: "upcoming", date: "February 2027",  oscarCorrelation: "high"      },
            { name: "WGA Awards",          status: "upcoming", date: "February 2027",  oscarCorrelation: "medium"    },
          ],
          frontrunners,
        },
        articlesScanned:    oscarArticles.length,
        predictionArticles: predArticles.length,
        sources:            activeSources,
        tmdbConfigured:     !!apiKey,
        scoringModel:       "tmdb-credits + consensus-authority-weighted",
        fetchedAt:          new Date().toISOString(),
      });
    }

    return NextResponse.json({ success: false, error: "Invalid query_type" }, { status: 400 });
  } catch (error) {
    console.error("Festival intel error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
