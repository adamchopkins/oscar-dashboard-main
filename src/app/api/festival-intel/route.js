// Festival Intelligence API — powered by RSS feeds from Gold Derby, Variety,
// Deadline, IndieWire, Next Best Picture, and The Ankler.
// Films are ranked by how many of those sources are currently discussing them.
// Wikipedia MediaWiki API fills in film metadata when RSS is sparse.

import { NextResponse } from "next/server";
import {
  PREDICTION_FEEDS,
  fetchFeed,
  filterOscarArticles,
  extractFilmTitles,
  countMentions,
  getWikipediaFilms,
  releaseQuarter,
} from "@/lib/oscarFeeds";

export async function POST(request) {
  try {
    const { query_type = "festivals" } = await request.json();

    // All feeds + Wikipedia run in parallel
    const [feedResults, wikiFilms] = await Promise.all([
      Promise.all(PREDICTION_FEEDS.map(fetchFeed)),
      getWikipediaFilms(2026),
    ]);

    const allArticles  = feedResults.flat();
    const oscarArticles = filterOscarArticles(allArticles);
    const activeSources = PREDICTION_FEEDS
      .filter((_, i) => feedResults[i].length > 0)
      .map((f) => f.name);

    // Extract quoted film titles from articles and rank by cross-source mentions
    const articlesText = oscarArticles.map((a) => a.title + " " + a.description).join(" ");
    const rssTitles    = extractFilmTitles(articlesText);
    const mentionMap   = new Map(rssTitles.map((t) => [t, countMentions(oscarArticles, t)]));

    // Wikipedia lookup for release date enrichment
    const wikiMap = new Map(wikiFilms.map((f) => [f.title.toLowerCase(), f]));

    // Ranked list: RSS titles first (sorted by mention count), then Wikipedia gap-fill
    const rssRanked = [...mentionMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([title]) => title);
    const wikiOnly  = wikiFilms.map((f) => f.title).filter((t) => !mentionMap.has(t));
    const allTitles = [...new Set([...rssRanked, ...wikiOnly])];

    // ── FESTIVALS query ────────────────────────────────────────────────────
    if (query_type === "festivals") {
      const films = allTitles.slice(0, 20).map((title) => {
        const wd       = wikiMap.get(title.toLowerCase());
        const mentions = mentionMap.get(title) || 0;

        const mentionedIn = oscarArticles.find((a) =>
          (a.title + " " + a.description).toLowerCase().includes(title.toLowerCase())
        );
        const buzzSummary = mentionedIn
          ? `"${mentionedIn.title.slice(0, 80)}" — ${mentionedIn.source}`
          : "2026 film in Oscar eligibility window.";

        return {
          title,
          director:      null,
          cast:          [],
          festival:      null,
          festivalSection: null,
          distributor:   null,
          releaseWindow: releaseQuarter(wd?.releaseDate),
          buzzLevel:     mentions >= 5 ? "high" : mentions >= 2 ? "medium" : "low",
          buzzSummary,
          oscarCategories: ["Best Picture", "Best Director"],
          mentionCount:  mentions,
        };
      });

      return NextResponse.json({
        success:         true,
        queryType:       "festivals",
        data:            films,
        articlesScanned: oscarArticles.length,
        sources:         activeSources,
        fetchedAt:       new Date().toISOString(),
      });
    }

    // ── PRECURSORS query ───────────────────────────────────────────────────
    if (query_type === "precursors") {
      const topTitles = [...mentionMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

      let frontrunners;

      if (topTitles.length >= 3) {
        // Enough RSS signal — rank purely by mention count
        const makeContenders = (mapper) =>
          topTitles.slice(0, 5).map(([title, count], i) => {
            const name        = mapper(title);
            const probability = Math.min(90, 32 - i * 5 + Math.min(count * 3, 15));
            return { name, title: name, probability };
          });

        frontrunners = {
          bestPicture:          makeContenders((t) => t),
          bestDirector:         makeContenders((t) => `Director — ${t}`),
          bestActor:            makeContenders((t) => `Lead Actor — ${t}`),
          bestActress:          makeContenders((t) => `Lead Actress — ${t}`),
          bestSupportingActor:  makeContenders((t) => `Supporting Actor — ${t}`),
          bestSupportingActress: makeContenders((t) => `Supporting Actress — ${t}`),
        };
      } else {
        // RSS sparse — fall back to Wikipedia film list
        const fallback = wikiFilms.slice(0, 5);
        const c = (mapper) =>
          fallback.map((f, i) => ({
            name:        mapper(f),
            title:       mapper(f),
            probability: 30 - i * 5,
          }));
        frontrunners = {
          bestPicture:          c((f) => f.title),
          bestDirector:         c((f) => `Director — ${f.title}`),
          bestActor:            c((f) => `Lead Actor — ${f.title}`),
          bestActress:          c((f) => `Lead Actress — ${f.title}`),
          bestSupportingActor:  c((f) => `Supporting Actor — ${f.title}`),
          bestSupportingActress: c((f) => `Supporting Actress — ${f.title}`),
        };
      }

      return NextResponse.json({
        success:   true,
        queryType: "precursors",
        data: {
          season: "2026-2027",
          precursors: [
            { name: "Golden Globes",  status: "upcoming", date: "January 2027" },
            { name: "Critics Choice", status: "upcoming", date: "January 2027" },
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
        fetchedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({ success: false, error: "Invalid query_type" }, { status: 400 });
  } catch (error) {
    console.error("Festival intel error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
