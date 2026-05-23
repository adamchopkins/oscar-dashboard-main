// Oscar Predictions — live data from 10 major entertainment sources.
//
// Buzz signal:  RSS feeds (Gold Derby, Variety, Deadline, Hollywood Reporter,
//               IndieWire, Next Best Picture, Awards Circuit, The Wrap, EW, The Ankler)
//               — fetched live with no-store cache every request.
// Film catalog: TMDB drama/history films for the eligibility year (requires TMDB_API_KEY)
//               Falls back to Wikipedia MediaWiki API if key absent.
// Ranking:      Cross-source mention frequency → frontrunner probability scores.

import { NextResponse } from "next/server";
import {
  PREDICTION_FEEDS,
  fetchFeed,
  filterOscarArticles,
  extractFilmTitles,
  countMentions,
  getTMDBOscarContenders,
  getWikipediaFilms,
} from "@/lib/oscarFeeds";

export async function POST(request) {
  try {
    const { ceremony = "99th", year = 2027 } = await request.json();
    const eligibilityYear = year - 1; // 2026 for 99th Oscars
    const apiKey = process.env.TMDB_API_KEY;

    // RSS feeds + film catalog — all parallel, all live
    const [feedResults, filmCatalog] = await Promise.all([
      Promise.all(PREDICTION_FEEDS.map(fetchFeed)),
      apiKey ? getTMDBOscarContenders(eligibilityYear, apiKey) : getWikipediaFilms(eligibilityYear),
    ]);

    const catalog = filmCatalog ?? await getWikipediaFilms(eligibilityYear);

    const allArticles   = feedResults.flat();
    const oscarArticles = filterOscarArticles(allArticles);
    const activeSources = PREDICTION_FEEDS
      .filter((_, i) => feedResults[i].length > 0)
      .map((f) => f.name);

    // Extract and count film title mentions across all award articles
    const articlesText = oscarArticles.map((a) => a.title + " " + a.description).join(" ");
    const rssTitles    = extractFilmTitles(articlesText);
    const mentionMap   = new Map(rssTitles.map((t) => [t, countMentions(oscarArticles, t)]));

    // Final ranked list: RSS buzz first, then TMDB/Wikipedia catalog gap-fill
    const rssRanked  = [...mentionMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([title, mentionCount]) => ({ title, mentionCount }));
    const catalogGap = catalog
      .filter((f) => !mentionMap.has(f.title))
      .map((f) => ({ title: f.title, mentionCount: 0, voteAverage: f.voteAverage }));

    const rankedFilms = [...rssRanked, ...catalogGap].slice(0, 10);

    if (rankedFilms.length === 0) {
      throw new Error("No film data returned. Check your network connection and try again.");
    }

    const nom = (mapper, count = 6) =>
      rankedFilms.slice(0, count).map((f) => mapper(f) ?? `Contender — ${f.title}`);

    const note = (f) => f.mentionCount > 0
      ? `${f.mentionCount} article${f.mentionCount !== 1 ? "s" : ""} across ${activeSources.slice(0, 3).join(", ")}`
      : `${eligibilityYear} film from ${apiKey ? "TMDB" : "Wikipedia"} — awards coverage building`;

    const categories = [
      {
        id: "bestPicture", name: "Best Picture", icon: "🏆",
        nominees:        nom((f) => f.title, 8),
        frontrunner:     rankedFilms[0]?.title,
        frontrunnerNote: note(rankedFilms[0]),
      },
      {
        id: "bestDirector", name: "Best Director", icon: "🎬",
        nominees:        nom((f) => `Director — ${f.title}`),
        frontrunner:     `Director — ${rankedFilms[0]?.title}`,
        frontrunnerNote: "Director of most-discussed prestige film",
      },
      {
        id: "bestActor", name: "Best Actor", icon: "🎭",
        nominees:        nom((f) => `Lead Actor — ${f.title}`),
        frontrunner:     `Lead Actor — ${rankedFilms[0]?.title}`,
        frontrunnerNote: "Lead performance in top prestige film",
      },
      {
        id: "bestActress", name: "Best Actress", icon: "👑",
        nominees:        nom((f) => `Lead Actress — ${f.title}`),
        frontrunner:     `Lead Actress — ${rankedFilms[0]?.title}`,
        frontrunnerNote: "Lead female performance in top prestige film",
      },
      {
        id: "bestSupportingActor", name: "Best Supporting Actor", icon: "🌟",
        nominees:        nom((f) => `Supporting Actor — ${f.title}`),
        frontrunner:     `Supporting Actor — ${rankedFilms[0]?.title}`,
        frontrunnerNote: "Supporting performance in top contenders",
      },
      {
        id: "bestSupportingActress", name: "Best Supporting Actress", icon: "✨",
        nominees:        nom((f) => `Supporting Actress — ${f.title}`),
        frontrunner:     `Supporting Actress — ${rankedFilms[0]?.title}`,
        frontrunnerNote: "Supporting female performance in top contenders",
      },
    ];

    return NextResponse.json({
      success: true,
      data: {
        ceremonyName: `${ceremony} Academy Awards`,
        ceremonyYear: year,
        lastUpdated:  new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        sources:      activeSources,
        categories,
      },
      articlesScanned: oscarArticles.length,
      tmdbConfigured:  !!apiKey,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Oscar predictions API error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
