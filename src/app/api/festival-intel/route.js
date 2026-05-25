// Festival Intelligence & Precursor Awards — PMC-primary, TMDB-enriched.
//
// Primary source: scrapePMCPredictions — Variety + Deadline + IndieWire + THR
//                 Extracts category predictions from both RSS feeds and award pages.
// Enrichment:     enrichFilmsWithCredits adds real director/cast to top contenders.
// Secondary:      Non-PMC prediction feed RSS for consensus verification.

import { NextResponse } from "next/server";
import { getTMDBOscarContenders, enrichFilmsWithCredits } from "@/lib/tmdb";
import { scrapePMCPredictions } from "@/lib/penskeFeeds";
import {
  PREDICTION_FEEDS,
  fetchFeed,
  filterOscarArticles,
  filterPredictionArticles,
  extractFilmTitles,
  computeConsensusScore,
  getOscarSeasonBonus,
  releaseQuarter,
} from "@/lib/oscarFeeds";

export async function POST(request) {
  try {
    const { query_type = "festivals" } = await request.json();
    const apiKey           = process.env.TMDB_API_KEY;
    const ELIGIBILITY_YEAR = 2026;

    // All sources in parallel
    const [pmcResult, feedResults, tmdbCatalog] = await Promise.all([
      scrapePMCPredictions(ELIGIBILITY_YEAR),
      Promise.all(PREDICTION_FEEDS.map(fetchFeed)),
      apiKey ? getTMDBOscarContenders(ELIGIBILITY_YEAR, apiKey) : null,
    ]);

    // Film catalog: TMDB is authoritative metadata source
    const catalog    = tmdbCatalog ?? [];
    const catalogMap = new Map(catalog.map((f) => [f.title.toLowerCase(), f]));

    // Secondary RSS for consensus verification
    const allArticles   = feedResults.flat();
    const oscarArticles = filterOscarArticles(allArticles);
    const predArticles  = filterPredictionArticles(allArticles).filter(
      (a) => /prediction|frontrunner|race|favorite|contender|rankings|picks|tracker/i.test(a.title)
    );
    const activeSources = PREDICTION_FEEDS
      .filter((_, i) => feedResults[i].length > 0)
      .map((f) => f.name);
    const allActiveSources = [...new Set([...pmcResult.activeSources, ...activeSources])];

    // PMC Best Picture list is the primary ranked film list
    const pmcBP = pmcResult.predictions.bestPicture ?? [];

    // Build unified ranked title list: PMC first, then RSS consensus, then TMDB gap-fill
    const pmcSet = new Set(pmcBP.map((p) => p.name));
    const rssTitles = new Set([
      ...extractFilmTitles(predArticles.map((a) => a.title + " " + a.description).join(" ")),
      ...extractFilmTitles(oscarArticles.map((a) => a.title + " " + a.description).join(" ")),
    ]);
    const rssOnly    = [...rssTitles].filter((t) => !pmcSet.has(t));
    const tmdbOnly   = catalog.map((f) => f.title).filter((t) => !pmcSet.has(t) && !rssTitles.has(t));
    const allRanked  = [...pmcBP.map((p) => p.name), ...rssOnly, ...tmdbOnly];

    // Consensus scores for RSS-sourced titles (used as secondary signal)
    const rssScores = new Map(
      [...rssTitles].map((t) => [t, computeConsensusScore(oscarArticles, predArticles, t)])
    );

    // ── FESTIVALS ─────────────────────────────────────────────────────────────
    if (query_type === "festivals") {
      // Enrich top 8 titles with TMDB credits
      const topForEnrich = allRanked.slice(0, 8).map((title) => ({
        title, ...(catalogMap.get(title.toLowerCase()) ?? {}),
      }));
      const enriched    = await enrichFilmsWithCredits(topForEnrich, ELIGIBILITY_YEAR, apiKey, 8);
      const enrichedMap = new Map(enriched.map((f) => [f.title, f]));

      const films = allRanked.slice(0, 20).map((title, i) => {
        const meta       = catalogMap.get(title.toLowerCase());
        const ef         = enrichedMap.get(title);
        const pmcEntry   = pmcBP.find((p) => p.name === title);
        const rssScore   = rssScores.get(title);
        const windowBonus = getOscarSeasonBonus(meta?.releaseDate ?? null, ELIGIBILITY_YEAR);

        // Buzz level: PMC frontrunner status > RSS consensus > window bonus
        const buzzLevel = (pmcEntry && i < 3)        ? "high"
                        : pmcEntry                    ? "high"
                        : rssScore?.isFrontrunner     ? "high"
                        : rssScore?.isConsensus       ? "medium"
                        : windowBonus >= 2.0          ? "medium"
                        : "low";

        const lead = oscarArticles.find((a) =>
          (a.title + " " + a.description).toLowerCase().includes(title.toLowerCase())
        );

        return {
          title,
          director:        ef?.director  ?? null,
          topCast:         ef?.topCast   ?? [],
          genres:          ef?.genres    ?? [],
          festival:        null,
          festivalSection: null,
          distributor:     null,
          poster:          ef?.poster ?? meta?.poster ?? null,
          releaseWindow:   releaseQuarter(meta?.releaseDate),
          releaseDate:     meta?.releaseDate ?? null,
          buzzLevel,
          buzzSummary: pmcEntry
            ? `PMC consensus pick — ${pmcResult.activeSources.join(", ")}`
            : rssScore?.isFrontrunner
            ? `Consensus frontrunner: ${rssScore.predictingSites} prediction sites`
            : rssScore?.isConsensus
            ? `Emerging consensus: ${rssScore.predictingSites} sites tracking`
            : lead
            ? `"${lead.title.slice(0, 80)}" — ${lead.source}`
            : `${ELIGIBILITY_YEAR} Oscar-season release`,
          oscarCategories:  ["Best Picture", "Best Director"],
          pmcPredicted:     !!pmcEntry,
          pmcScore:         pmcEntry?.score ?? 0,
          predictingSites:  rssScore?.predictingSites ?? 0,
          isConsensus:      !!pmcEntry || rssScore?.isConsensus || false,
          voteAverage:      meta?.voteAverage ?? 0,
          tmdbEnriched:     !!ef?.director,
        };
      });

      return NextResponse.json({
        success:            true,
        queryType:          "festivals",
        data:               films,
        pmcSources:         pmcResult.activeSources,
        secondarySources:   activeSources,
        allSources:         allActiveSources,
        pmcArticles:        pmcResult.sources.filter((s) => s.fetched).length,
        articlesScanned:    oscarArticles.length,
        tmdbConfigured:     !!apiKey,
        dataSource:         pmcBP.length >= 3 ? "PMC-primary" : "RSS-fallback",
        fetchedAt:          new Date().toISOString(),
      });
    }

    // ── PRECURSORS ────────────────────────────────────────────────────────────
    if (query_type === "precursors") {
      // Top 5 films for enrichment — PMC BP list or RSS fallback
      const top5Titles = allRanked.slice(0, 5);
      const top5Films  = top5Titles.map((title) => ({
        title, ...(catalogMap.get(title.toLowerCase()) ?? {}),
      }));
      const enriched = await enrichFilmsWithCredits(top5Films, ELIGIBILITY_YEAR, apiKey, 5);
      const enrichMap = new Map(enriched.map((f) => [f.title, f]));

      // Score for probability: PMC score (primary) or RSS consensus (fallback)
      const pmcMax = pmcBP[0]?.score ?? 1;
      const getProb = (title, rank) => {
        const pmcEntry = pmcBP.find((p) => p.name === title);
        if (pmcEntry) {
          const base = Math.round((pmcEntry.score / pmcMax) * 80);
          return Math.min(88, rank === 0 ? base + 8 : rank < 3 ? base + 3 : base);
        }
        const rs = rssScores.get(title);
        if (rs) {
          const base = Math.round((rs.consensusScore / Math.max(...[...rssScores.values()].map((s) => s.consensusScore), 1)) * 70);
          return Math.min(72, base);
        }
        return Math.max(8, 28 - rank * 5);
      };

      const makeContenders = (catKey, nameFn) => {
        const pmcList = pmcResult.predictions[catKey] ?? [];
        return top5Titles.map((title, i) => {
          const ef   = enrichMap.get(title);
          const pmcEntry = pmcList[i];
          const name = pmcEntry?.name ?? nameFn(title, ef);
          return {
            name,
            title:           name,
            probability:     getProb(title, i),
            pmcPredicted:    !!pmcEntry,
            poster:          ef?.poster ?? null,
          };
        });
      };

      const frontrunners = {
        bestPicture:           makeContenders("bestPicture",           (t)    => t),
        bestDirector:          makeContenders("bestDirector",          (t, e) => e?.director ?? `Director of "${t}"`),
        bestActor:             makeContenders("bestActor",             (t, e) => e?.topMaleCast?.[0]   ? `${e.topMaleCast[0]} — ${t}`   : `Lead actor in "${t}"`),
        bestActress:           makeContenders("bestActress",           (t, e) => e?.topFemaleCast?.[0] ? `${e.topFemaleCast[0]} — ${t}` : `Lead actress in "${t}"`),
        bestSupportingActor:   makeContenders("bestSupportingActor",   (t, e) => e?.topMaleCast?.[1]   ? `${e.topMaleCast[1]} — ${t}`   : `Supporting actor in "${t}"`),
        bestSupportingActress: makeContenders("bestSupportingActress", (t, e) => e?.topFemaleCast?.[1] ? `${e.topFemaleCast[1]} — ${t}` : `Supporting actress in "${t}"`),
      };

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
        pmcSources:      pmcResult.activeSources,
        secondarySources: activeSources,
        pmcArticles:     pmcResult.sources.filter((s) => s.fetched).length,
        articlesScanned: oscarArticles.length,
        tmdbConfigured:  !!apiKey,
        dataSource:      pmcBP.length >= 3 ? "PMC-primary" : "RSS-fallback",
        fetchedAt:       new Date().toISOString(),
      });
    }

    return NextResponse.json({ success: false, error: "Invalid query_type" }, { status: 400 });
  } catch (error) {
    console.error("Festival intel error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
