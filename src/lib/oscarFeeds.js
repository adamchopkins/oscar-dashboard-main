// Real-time Oscar prediction data — no API key required.
//
// Data sources:
//   RSS  → Gold Derby, Variety Awards, Deadline Awards, IndieWire, Next Best Picture, The Ankler
//   Film metadata → Wikipedia MediaWiki API (Category:YEAR_films, extracts, thumbnails)

// ─── RSS Feed Sources ────────────────────────────────────────────────────────

export const PREDICTION_FEEDS = [
  { name: "Gold Derby",        url: "https://www.goldderby.com/feed/" },
  { name: "Variety Awards",    url: "https://variety.com/v/film/awards-intelligence/feed/" },
  { name: "Deadline Awards",   url: "https://deadline.com/category/awardsline/feed/" },
  { name: "IndieWire Oscars",  url: "https://www.indiewire.com/tag/oscars/feed/" },
  { name: "Next Best Picture", url: "https://nextbestpicture.com/feed/" },
  { name: "The Ankler",        url: "https://www.theankler.com/feed" },
];

// ─── RSS Fetching & Parsing ──────────────────────────────────────────────────

export async function fetchFeed({ name, url }) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 OscarDashboard/1.0 RSS reader",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      next: { revalidate: 1800 }, // 30-minute cache
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRSS(xml, name).slice(0, 25);
  } catch {
    return [];
  }
}

function parseRSS(xml, sourceName) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const c = m[1];
    items.push({
      title:       getTagContent(c, "title"),
      description: stripHTML(getTagContent(c, "description")).slice(0, 500),
      link:        getTagContent(c, "link"),
      pubDate:     getTagContent(c, "pubDate"),
      source:      sourceName,
    });
  }
  return items;
}

function getTagContent(xml, tag) {
  const cd = xml.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>`, "i"));
  if (cd) return decodeEntities(cd[1].trim());
  const pl = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return pl ? decodeEntities(pl[1].trim()) : "";
}

function decodeEntities(text) {
  return text
    .replace(/&ldquo;|&#8220;/g, "“")
    .replace(/&rdquo;|&#8221;/g, "”")
    .replace(/&lsquo;|&#8216;/g, "‘")
    .replace(/&rsquo;|&#8217;/g, "’")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

function stripHTML(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// ─── Film Title Extraction from Article Text ─────────────────────────────────
// Matches text inside smart quotes, curly quotes, or straight quotes.

const QUOTED_TITLE_RE = /[‘’“”"'']([A-Z][^‘’“”"''\n]{1,60})[‘’“”"'']/g;

const STOPWORDS = new Set([
  "The", "A", "An", "But", "And", "For", "In", "On", "At", "To", "Is",
  "Are", "Was", "Were", "Will", "Has", "Have", "This", "That", "These",
  "Those", "It", "He", "She", "They", "We", "You", "My", "Your",
  "His", "Her", "Their", "Our", "New", "Best", "Top", "More",
]);

export function extractFilmTitles(text) {
  const seen = new Set();
  for (const m of text.matchAll(QUOTED_TITLE_RE)) {
    const t = m[1].trim();
    if (t.length < 2 || t.length > 70) continue;
    if (STOPWORDS.has(t)) continue;
    if (/[.!?]$/.test(t)) continue;
    if (/^\d+$/.test(t)) continue;
    seen.add(t);
  }
  return [...seen];
}

// ─── Mention Counting ────────────────────────────────────────────────────────

export function countMentions(articles, title) {
  const lower = title.toLowerCase();
  return articles.filter((a) =>
    (a.title + " " + a.description).toLowerCase().includes(lower)
  ).length;
}

// ─── Oscar Article Filter ────────────────────────────────────────────────────

export function filterOscarArticles(articles) {
  return articles.filter((a) =>
    /oscar|academy award|best picture|awards season|awards contender|frontrunner|cannes|venice|tiff|sundance|guild award/i.test(
      a.title + " " + a.description
    )
  );
}

// ─── Wikipedia MediaWiki API ─────────────────────────────────────────────────
// Provides a live, free, no-key film list via Wikipedia's category system.
// Replaces Wikidata SPARQL entirely.

const WIKI_API = "https://en.wikipedia.org/w/api.php";

export async function getWikipediaFilms(year) {
  try {
    // Step 1: Get film page titles from the Wikipedia category for this year
    const catParams = new URLSearchParams({
      action:  "query",
      list:    "categorymembers",
      cmtitle: `Category:${year}_films`,
      cmlimit: "50",
      format:  "json",
    });
    const catRes = await fetch(`${WIKI_API}?${catParams}`, {
      headers: { "User-Agent": "OscarDashboard/1.0 (educational project)" },
      next: { revalidate: 21600 }, // 6-hour cache for film category
    });
    if (!catRes.ok) return [];

    const catData = await catRes.json();
    const members = (catData.query?.categorymembers || [])
      .filter((m) => m.ns === 0) // ns=0 = article pages only (skip subcategories)
      .slice(0, 30);

    if (members.length === 0) return [];

    // Step 2: Batch-fetch extracts and thumbnails in a single API call.
    // MediaWiki uses pipe-separated titles; we build the titles string manually
    // so the pipe separator is not percent-encoded.
    const baseParams = new URLSearchParams({
      action:      "query",
      prop:        "extracts|pageimages",
      exintro:     "1",
      exsentences: "2",
      piprop:      "thumbnail",
      pithumbsize: "342",
      format:      "json",
    });
    const titlesStr = members.map((m) => encodeURIComponent(m.title)).join("|");
    const propRes = await fetch(
      `${WIKI_API}?${baseParams}&titles=${titlesStr}`,
      {
        headers: { "User-Agent": "OscarDashboard/1.0 (educational project)" },
        next: { revalidate: 21600 },
      }
    );

    // Fallback: return titles-only list if properties fetch fails
    if (!propRes.ok) {
      return members.map((m, i) => ({
        id:          m.pageid || i + 1,
        title:       cleanWikiTitle(m.title),
        releaseDate: null,
        overview:    "",
        poster:      null,
        popularity:  30 - i,
        voteAverage: 0,
      }));
    }

    const propData = await propRes.json();
    return Object.values(propData.query?.pages || {})
      .filter((p) => p.pageid && p.pageid > 0)
      .map((p, i) => ({
        id:          p.pageid,
        title:       cleanWikiTitle(p.title),
        releaseDate: extractReleaseDate(p.extract || ""),
        overview:    wikiDecodeText(p.extract || "").slice(0, 200),
        poster:      p.thumbnail?.source || null,
        popularity:  30 - i,
        voteAverage: 0,
      }));
  } catch {
    return [];
  }
}

// Remove disambiguation suffixes: "(2026 film)", "(film)", "(movie)", etc.
function cleanWikiTitle(title) {
  return title.replace(/\s*\([^)]*(?:film|movie)[^)]*\)\s*$/i, "").trim();
}

// Try to extract a release date from the Wikipedia article intro.
// Intro text often reads: "… released on April 18, 2026."
const DATE_RE = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(20\d{2})\b/i;
const MONTH_MAP = {
  january: "01", february: "02", march: "03", april: "04",
  may: "05", june: "06", july: "07", august: "08",
  september: "09", october: "10", november: "11", december: "12",
};

function extractReleaseDate(extract) {
  const plain = wikiDecodeText(extract);
  const m = plain.match(DATE_RE);
  if (!m) return null;
  const [, month, day, year] = m;
  return `${year}-${MONTH_MAP[month.toLowerCase()]}-${day.padStart(2, "0")}`;
}

function wikiDecodeText(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Release Quarter Utility ─────────────────────────────────────────────────

export function releaseQuarter(dateStr) {
  if (!dateStr) return "TBD";
  const d = new Date(dateStr);
  return `Q${Math.ceil((d.getMonth() + 1) / 3)} ${d.getFullYear()}`;
}
