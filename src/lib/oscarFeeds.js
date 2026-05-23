// Shared utilities for real-time Oscar prediction feed aggregation.
// Data sources: Gold Derby, Variety Awards, Deadline Awards, IndieWire,
// Next Best Picture, The Ankler — all via public RSS with no API key needed.

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
      next: { revalidate: 1800 }, // cache RSS for 30 min
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
      title: getTagContent(c, "title"),
      description: stripHTML(getTagContent(c, "description")).slice(0, 500),
      link: getTagContent(c, "link"),
      pubDate: getTagContent(c, "pubDate"),
      source: sourceName,
    });
  }
  return items;
}

function getTagContent(xml, tag) {
  // Try CDATA block first
  const cd = xml.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>`, "i"));
  if (cd) return decodeEntities(cd[1].trim());
  const plain = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return plain ? decodeEntities(plain[1].trim()) : "";
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

// ─── Film Title Extraction ───────────────────────────────────────────────────
// Matches titles inside smart quotes, straight quotes, or curly quotes.
const QUOTED_TITLE_RE =
  /[‘’“”""'']([A-Z][^‘’“”""''\n]{1,60})[‘’“”""'']/g;

// Words that are never a film title on their own
const STOPWORDS = new Set([
  "The", "A", "An", "But", "And", "For", "In", "On", "At", "To", "Is",
  "Are", "Was", "Were", "Will", "Has", "Have", "This", "That", "These",
  "Those", "It", "He", "She", "They", "We", "You", "I", "My", "Your",
  "His", "Her", "Their", "Our", "New", "Best", "Top", "More",
]);

export function extractFilmTitles(text) {
  const seen = new Set();
  for (const m of text.matchAll(QUOTED_TITLE_RE)) {
    const t = m[1].trim();
    if (t.length < 2 || t.length > 70) continue;
    if (STOPWORDS.has(t)) continue;
    if (/[.!?]$/.test(t)) continue; // likely end of sentence fragment
    if (/^\d+$/.test(t)) continue;  // pure numbers
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

// ─── Wikidata Fallback ───────────────────────────────────────────────────────
// Used to enrich RSS-extracted titles with director names and release dates,
// and to fill in when RSS returns too few results.

export async function getWikidataFilms(year) {
  try {
    const sparql = `
      SELECT DISTINCT ?film ?filmLabel ?directorLabel ?releaseDate
      WHERE {
        ?film wdt:P31 wd:Q11424 ; wdt:P577 ?releaseDate .
        FILTER(YEAR(?releaseDate) = ${year})
        ?film wdt:P136 ?genre .
        FILTER(?genre IN (wd:Q130232, wd:Q859369, wd:Q2975633))
        OPTIONAL { ?film wdt:P57 ?director . }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul" . }
      }
      ORDER BY DESC(?releaseDate) LIMIT 30
    `;
    const url = new URL("https://query.wikidata.org/sparql");
    url.searchParams.set("query", sparql);
    url.searchParams.set("format", "json");
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/sparql-results+json",
        "User-Agent": "OscarDashboard/1.0",
      },
      next: { revalidate: 43200 }, // Wikidata film list: cache 12 h
    });
    if (!res.ok) return [];
    const data = await res.json();
    const seen = new Set();
    return (data.results?.bindings || [])
      .filter((b) => {
        const id = b.film?.value;
        const label = b.filmLabel?.value || "";
        if (!id || seen.has(id) || label.startsWith("Q")) return false;
        seen.add(id);
        return true;
      })
      .map((b) => ({
        title: b.filmLabel.value,
        director: b.directorLabel?.value || null,
        releaseDate: b.releaseDate?.value?.split("T")[0] || null,
      }));
  } catch {
    return [];
  }
}

// ─── Release Quarter Helper ──────────────────────────────────────────────────

export function releaseQuarter(dateStr) {
  if (!dateStr) return "TBD";
  const d = new Date(dateStr);
  return `Q${Math.ceil((d.getMonth() + 1) / 3)} ${d.getFullYear()}`;
}
