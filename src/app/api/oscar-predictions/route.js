// src/app/api/oscar-predictions/route.js
// Aggregates real-time RSS feeds from Gold Derby, Variety, Deadline, IndieWire,
// Next Best Picture, and The Ankler. Films mentioned most across those sources
// are ranked as frontrunners. Wikidata fills in director names and any gaps.

import { NextResponse } from "next/server";
import {
  PREDICTION_FEEDS,
  fetchFeed,
  filterOscarArticles,
  extractFilmTitles,
  countMentions,
  getWikidataFilms,
} from "@/lib/oscarFeeds";

export async function POST(request) {
  try {
    const { ceremony = "99th", year = 2027 } = await request.json();
    const eligibilityYear = year - 1; // 2026 for the 99th Oscars

    // RSS feeds + Wikidata in parallel
    const [feedResults, wdFilms] = await Promise.all([
      Promise.all(PREDICTION_FEEDS.map(fetchFeed)),
      getWikidataFilms(eligibilityYear),
    ]);

    const allArticles = feedResults.flat();
    const oscarArticles = filterOscarArticles(allArticles);
    const activeSources = PREDICTION_FEEDS
      .filter((_, i) => feedResults[i].length > 0)
      .map((f) => f.name);

    // Extract quoted film titles from articles, count cross-source mentions
    const articlesText = oscarArticles.map((a) => a.title + " " + a.description).join(" ");
    const rssTitles = extractFilmTitles(articlesText);
    const mentionMap = new Map(
      rssTitles.map((t) => [t, countMentions(oscarArticles, t)])
    );

    // Wikidata index for director lookup
    const wdMap = new Map(wdFilms.map((f) => [f.title.toLowerCase(), f]));

    // Build ranked film list: RSS mentions first, then Wikidata gap-fill
    const rankedFromRSS = [...mentionMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([title, mentionCount]) => ({
        title,
        director: wdMap.get(title.toLowerCase())?.director || null,
        mentionCount,
      }));

    const wdOnly = wdFilms
      .filter((f) => !mentionMap.has(f.title))
      .map((f) => ({ title: f.title, director: f.director, mentionCount: 0 }));

    const rankedFilms = [...rankedFromRSS, ...wdOnly].slice(0, 10);

    if (rankedFilms.length === 0) {
      throw new Error(
        "No film data returned from prediction feeds or Wikidata. Please try again."
      );
    }

    const nom = (mapper, count = 6) =>
      rankedFilms
        .slice(0, count)
        .map((f) => mapper(f) || `Contender — ${f.title}`);

    const frontrunnerNote = (f) =>
      f.mentionCount > 0
        ? `Most discussed across ${activeSources.slice(0, 3).join(", ")} (${f.mentionCount} article${f.mentionCount !== 1 ? "s" : ""})`
        : `Top ${eligibilityYear} drama in Wikidata`;

    const categories = [
      {
        id: "bestPicture",
        name: "Best Picture",
        icon: "🏆",
        nominees: nom((f) => f.title, 8),
        frontrunner: rankedFilms[0]?.title,
        frontrunnerNote: frontrunnerNote(rankedFilms[0]),
      },
      {
        id: "bestDirector",
        name: "Best Director",
        icon: "🎬",
        nominees: nom((f) =>
          f.director ? `${f.director} — ${f.title}` : null
        ),
        frontrunner: rankedFilms[0]?.director
          ? `${rankedFilms[0].director} — ${rankedFilms[0].title}`
          : `Director — ${rankedFilms[0]?.title}`,
        frontrunnerNote: "Director of most-discussed prestige film",
      },
      {
        id: "bestActor",
        name: "Best Actor",
        icon: "🎭",
        nominees: nom((f) => `Lead Actor — ${f.title}`),
        frontrunner: `Lead Actor — ${rankedFilms[0]?.title}`,
        frontrunnerNote: "Lead performance in top prestige film",
      },
      {
        id: "bestActress",
        name: "Best Actress",
        icon: "👑",
        nominees: nom((f) => `Lead Actress — ${f.title}`),
        frontrunner: `Lead Actress — ${rankedFilms[0]?.title}`,
        frontrunnerNote: "Lead female performance in top prestige film",
      },
      {
        id: "bestSupportingActor",
        name: "Best Supporting Actor",
        icon: "🌟",
        nominees: nom((f) => `Supporting Actor — ${f.title}`),
        frontrunner: `Supporting Actor — ${rankedFilms[0]?.title}`,
        frontrunnerNote: "Supporting performance in top contenders",
      },
      {
        id: "bestSupportingActress",
        name: "Best Supporting Actress",
        icon: "✨",
        nominees: nom((f) => `Supporting Actress — ${f.title}`),
        frontrunner: `Supporting Actress — ${rankedFilms[0]?.title}`,
        frontrunnerNote: "Supporting female performance in top contenders",
      },
    ];

    return NextResponse.json({
      success: true,
      data: {
        ceremonyName: `${ceremony} Academy Awards`,
        ceremonyYear: year,
        lastUpdated: new Date().toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        }),
        sources: activeSources,
        categories,
      },
      articlesScanned: oscarArticles.length,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Oscar predictions API error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
