// Pipeline — live 2026 film catalog.
//
// Primary source:  TMDB (requires TMDB_API_KEY in Vercel env vars)
//                  Covers both already-released (H1 2026) and upcoming (H2 2026) films.
// Fallback source: Wikipedia MediaWiki API (no key needed)
// Buzz overlay:    10 RSS feeds (Gold Derby, Variety, Deadline, etc.) fetched live,
//                  used to sort films — most-discussed Oscar contenders rise to the top.
//
// To enable TMDB: go to themoviedb.org → sign up free → API → copy key →
//                 add TMDB_API_KEY to Vercel project env vars.

import { NextResponse } from "next/server";
import {
  PREDICTION_FEEDS,
  fetchFeed,
  filterOscarArticles,
  countMentions,
  getTMDBFilms,
  getWikipediaFilms,
} from "@/lib/oscarFeeds";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get("year") ?? "2026", 10);
  const apiKey = process.env.TMDB_API_KEY;

  try {
    // Film catalog + live RSS buzz — all in parallel
    const [filmData, feedResults] = await Promise.all([
      apiKey ? getTMDBFilms(year, apiKey) : getWikipediaFilms(year),
      Promise.all(PREDICTION_FEEDS.map(fetchFeed)),
    ]);

    const movies = filmData ?? await getWikipediaFilms(year); // TMDB returned null

    // Score each film by how many award articles mention it
    const oscarArticles = filterOscarArticles(feedResults.flat());
    const activeSources = PREDICTION_FEEDS
      .filter((_, i) => feedResults[i].length > 0)
      .map((f) => f.name);

    const scored = movies
      .map((m) => ({ ...m, oscarMentions: countMentions(oscarArticles, m.title) }))
      .sort((a, b) => b.oscarMentions - a.oscarMentions || b.popularity - a.popularity);

    return NextResponse.json({
      success: true,
      year,
      count:   scored.length,
      movies:  scored,
      source:  apiKey ? "TMDB" : "Wikipedia",
      buzzSources: activeSources,
      articlesScanned: oscarArticles.length,
      tmdbConfigured: !!apiKey,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
