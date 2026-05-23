// Pipeline API — live 2026 film list via Wikipedia MediaWiki API.
// No API key required. Supplements film metadata with Oscar buzz signals
// from the same Gold Derby / Variety / Deadline RSS feeds used elsewhere.

import { NextResponse } from "next/server";
import {
  PREDICTION_FEEDS,
  fetchFeed,
  filterOscarArticles,
  countMentions,
  getWikipediaFilms,
} from "@/lib/oscarFeeds";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get("year") || "2026", 10);

  try {
    // Fetch Wikipedia film list and award RSS feeds in parallel
    const [wikiMovies, feedResults] = await Promise.all([
      getWikipediaFilms(year),
      Promise.all(PREDICTION_FEEDS.map(fetchFeed)),
    ]);

    const oscarArticles = filterOscarArticles(feedResults.flat());

    // Annotate each Wikipedia film with its mention count across award feeds.
    // Films talked about by Gold Derby / Variety / Deadline rise to the top.
    const movies = wikiMovies
      .map((m) => ({
        ...m,
        oscarMentions: countMentions(oscarArticles, m.title),
      }))
      .sort((a, b) => b.oscarMentions - a.oscarMentions);

    return NextResponse.json({
      success: true,
      year,
      count: movies.length,
      movies,
      source: "Wikipedia + Gold Derby / Variety / Deadline (RSS)",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
