// Festival Intelligence & Precursor Awards — live data.
//
// Buzz signal:    10 RSS feeds (Gold Derby, Variety, Deadline, Hollywood Reporter,
//                 IndieWire, Next Best Picture, Awards Circuit, The Wrap,
//                 Entertainment Weekly, The Ankler) — all fetched with no-store cache.
// Film metadata:  TMDB drama/history films for 2026 (requires TMDB_API_KEY)
//                 Falls back to Wikipedia if key is absent.
// Ranking:        Films ranked by cross-source mention frequency — more sources
//                 discussing a film = higher buzz level and probability score.

import { NextResponse } from "next/server";
import {
  PREDICTION_FEEDS,
  fetchFeed,
  filterOscarArticles,
  extractFilmTitles,
  countMentions,
  getTMDBOscarContenders,
  getWikipediaFilms,
  releaseQuarter,
} from "@/lib/oscarFeeds";

export async function POST(request) {
  try {
    const { query_type = "festivals" } = await request.json();
    const apiKey = process.env.TMDB_API_KEY;

    // RSS feeds + film catalog — all parallel
    const [feedResults, filmCatalog] = await Promise.all([
      Promise.all(PREDICTION_FEEDS.map(fetchFeed)),
      apiKey ? getTMDBOscarContenders(2026, apiKey) : getWikipediaFilms(2026),
    ]);

    const catalog = filmCatalog ?? await getWikipediaFilms(2026);

    const allArticles   = feedResults.flat();
    const oscarArticles = filterOscarArticles(allArticles);
    const activeSources = PREDICTION_FEEDS
      .filter((_, i) => feedResults[i].length > 0)
      .map((f) => f.name);

    // Extract all quoted titles from award articles, count cross-source mentions
    const articlesText = oscarArticles.map((a) => a.title + " " + a.description).join(" ");
    const rssTitles    = extractFilmTitles(articlesText);
    const mentionMap   = new Map(rssTitles.map((t) => [t, countMentions(oscarArticles, t)]));

    // Build catalog lookup for metadata enrichment
    const catalogMap = new Map(catalog.map((f) => [f.title.toLowerCase(), f]));

    // Ranked title list: RSS-mentioned first (by count), then catalog gap-fill
    const rssRanked = [...mentionMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([t]) => t);
    const catalogOnly = catalog
      .map((f) => f.title)
      .filter((t) => !mentionMap.has(t));
    const allTitles = [...new Set([...rssRanked, ...catalogOnly])];

    // ── FESTIVALS ──────────────────────────────────────────────────────────
    if (query_type === "festivals") {
      const films = allTitles.slice(0, 20).map((title) => {
        const meta     = catalogMap.get(title.toLowerCase());
        const mentions = mentionMap.get(title) ?? 0;
        const lead     = oscarArticles.find((a) =>
          (a.title + " " + a.description).toLowerCase().includes(title.toLowerCase())
        );
        return {
          title,
          director:        null,
          cast:            [],
          festival:        null,
          festivalSection: null,
          distributor:     null,
          poster:          meta?.poster ?? null,
          releaseWindow:   releaseQuarter(meta?.releaseDate),
          buzzLevel:       mentions >= 5 ? "high" : mentions >= 2 ? "medium" : "low",
          buzzSummary:     lead
            ? `"${lead.title.slice(0, 80)}" — ${lead.source}`
            : "2026 film in Oscar eligibility window.",
          oscarCategories: ["Best Picture", "Best Director"],
          mentionCount:    mentions,
          voteAverage:     meta?.voteAverage ?? 0,
        };
      });

      return NextResponse.json({
        success:         true,
        queryType:       "festivals",
        data:            films,
        articlesScanned: oscarArticles.length,
        sources:         activeSources,
        tmdbConfigured:  !!apiKey,
        fetchedAt:       new Date().toISOString(),
      });
    }

    // ── PRECURSORS ─────────────────────────────────────────────────────────
    if (query_type === "precursors") {
      const topTitles = [...mentionMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

      let frontrunners;

      if (topTitles.length >= 3) {
        const makeContenders = (mapper) =>
          topTitles.slice(0, 5).map(([title, count], i) => {
            const name = mapper(title);
            return { name, title: name, probability: Math.min(90, 32 - i * 5 + Math.min(count * 3, 15)) };
          });
        frontrunners = {
          bestPicture:           makeContenders((t) => t),
          bestDirector:          makeContenders((t) => `Director — ${t}`),
          bestActor:             makeContenders((t) => `Lead Actor — ${t}`),
          bestActress:           makeContenders((t) => `Lead Actress — ${t}`),
          bestSupportingActor:   makeContenders((t) => `Supporting Actor — ${t}`),
          bestSupportingActress: makeContenders((t) => `Supporting Actress — ${t}`),
        };
      } else {
        // RSS sparse — fall back to catalog (TMDB or Wikipedia)
        const fb = catalog.slice(0, 5);
        const c  = (fn) => fb.map((f, i) => ({ name: fn(f), title: fn(f), probability: 30 - i * 5 }));
        frontrunners = {
          bestPicture:           c((f) => f.title),
          bestDirector:          c((f) => `Director — ${f.title}`),
          bestActor:             c((f) => `Lead Actor — ${f.title}`),
          bestActress:           c((f) => `Lead Actress — ${f.title}`),
          bestSupportingActor:   c((f) => `Supporting Actor — ${f.title}`),
          bestSupportingActress: c((f) => `Supporting Actress — ${f.title}`),
        };
      }

      return NextResponse.json({
        success:   true,
        queryType: "precursors",
        data: {
          season: "2026-2027",
          precursors: [
            { name: "Golden Globes",  status: "upcoming", date: "January 2027"  },
            { name: "Critics Choice", status: "upcoming", date: "January 2027"  },
            { name: "SAG Awards",     status: "upcoming", date: "February 2027" },
            { name: "DGA Awards",     status: "upcoming", date: "February 2027" },
            { name: "PGA Awards",     status: "upcoming", date: "February 2027" },
            { name: "BAFTA",          status: "upcoming", date: "February 2027" },
            { name: "WGA Awards",     status: "upcoming", date: "February 2027" },
          ],
          frontrunners,
        },
        articlesScanned: oscarArticles.length,
        sources:   activeSources,
        tmdbConfigured: !!apiKey,
        fetchedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({ success: false, error: "Invalid query_type" }, { status: 400 });
  } catch (error) {
    console.error("Festival intel error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
