// Oscar Predictions API — powered by RSS feeds from Gold Derby, Variety,
// Deadline, IndieWire, Next Best Picture, and The Ankler.
// Films are ranked by cross-source mention frequency (more buzz = higher odds).
// Wikipedia fills in metadata gaps when RSS returns too few results.

import { NextResponse } from "next/server";
import {
  PREDICTION_FEEDS,
  fetchFeed,
  filterOscarArticles,
  extractFilmTitles,
  countMentions,
  getWikipediaFilms,
} from "@/lib/oscarFeeds";

export async function POST(request) {
  try {
    const { ceremony = "99th", year = 2027 } = await request.json();
    const eligibilityYear = year - 1; // 2026 for the 99th Oscars

    // RSS feeds + Wikipedia in parallel
    const [feedResults, wikiFilms] = await Promise.all([
      Promise.all(PREDICTION_FEEDS.map(fetchFeed)),
      getWikipediaFilms(eligibilityYear),
    ]);

    const allArticles   = feedResults.flat();
    const oscarArticles = filterOscarArticles(allArticles);
    const activeSources = PREDICTION_FEEDS
      .filter((_, i) => feedResults[i].length > 0)
      .map((f) => f.name);

    // Extract quoted titles from award articles and count cross-source mentions
    const articlesText = oscarArticles.map((a) => a.title + " " + a.description).join(" ");
    const rssTitles    = extractFilmTitles(articlesText);
    const mentionMap   = new Map(rssTitles.map((t) => [t, countMentions(oscarArticles, t)]));

    // Build final ranked list: RSS-ranked first, Wikipedia gap-fill second
    const rssRanked = [...mentionMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([title, count]) => ({ title, mentionCount: count }));

    const wikiTitlesSet = new Set(rssRanked.map((f) => f.title.toLowerCase()));
    const wikiGapFill   = wikiFilms
      .filter((f) => !wikiTitlesSet.has(f.title.toLowerCase()))
      .map((f) => ({ title: f.title, mentionCount: 0 }));

    const rankedFilms = [...rssRanked, ...wikiGapFill].slice(0, 10);

    if (rankedFilms.length === 0) {
      throw new Error("No film data available from prediction feeds or Wikipedia. Try again shortly.");
    }

    const nom = (mapper, count = 6) =>
      rankedFilms.slice(0, count).map((f) => mapper(f) || `Contender — ${f.title}`);

    const frontrunnerNote = (f) =>
      f.mentionCount > 0
        ? `Mentioned in ${f.mentionCount} article${f.mentionCount !== 1 ? "s" : ""} across ${activeSources.slice(0, 3).join(", ")}`
        : `2026 film from Wikipedia — awards coverage pending`;

    const categories = [
      {
        id:              "bestPicture",
        name:            "Best Picture",
        icon:            "🏆",
        nominees:        nom((f) => f.title, 8),
        frontrunner:     rankedFilms[0]?.title,
        frontrunnerNote: frontrunnerNote(rankedFilms[0]),
      },
      {
        id:              "bestDirector",
        name:            "Best Director",
        icon:            "🎬",
        nominees:        nom((f) => `Director — ${f.title}`),
        frontrunner:     `Director — ${rankedFilms[0]?.title}`,
        frontrunnerNote: "Director of most-discussed prestige film",
      },
      {
        id:              "bestActor",
        name:            "Best Actor",
        icon:            "🎭",
        nominees:        nom((f) => `Lead Actor — ${f.title}`),
        frontrunner:     `Lead Actor — ${rankedFilms[0]?.title}`,
        frontrunnerNote: "Lead male performance in top prestige film",
      },
      {
        id:              "bestActress",
        name:            "Best Actress",
        icon:            "👑",
        nominees:        nom((f) => `Lead Actress — ${f.title}`),
        frontrunner:     `Lead Actress — ${rankedFilms[0]?.title}`,
        frontrunnerNote: "Lead female performance in top prestige film",
      },
      {
        id:              "bestSupportingActor",
        name:            "Best Supporting Actor",
        icon:            "🌟",
        nominees:        nom((f) => `Supporting Actor — ${f.title}`),
        frontrunner:     `Supporting Actor — ${rankedFilms[0]?.title}`,
        frontrunnerNote: "Supporting performance in top contenders",
      },
      {
        id:              "bestSupportingActress",
        name:            "Best Supporting Actress",
        icon:            "✨",
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
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Oscar predictions API error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
