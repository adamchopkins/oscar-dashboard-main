// Oscar tracking data — no API key required for RSS/Wikipedia.
// Set TMDB_API_KEY in Vercel env vars for richer film metadata.
//
// Film data:   TMDB (primary) → Wikipedia MediaWiki API (fallback)
// Buzz data:   10 RSS feeds from all major entertainment & awards sources
//              Fetched with cache:'no-store' so every request is live.

// ─── TMDB ────────────────────────────────────────────────────────────────────

const TMDB_BASE   = "https://api.themoviedb.org/3";
const TMDB_IMAGE  = "https://image.tmdb.org/t/p/w342";

export async function getTMDBFilms(year, apiKey) {
  if (!apiKey) return null;
  try {
    // Two parallel calls: already-released H1 and upcoming H2 of the year
    const [h1Res, h2Res] = await Promise.all([
      fetch(
        `${TMDB_BASE}/discover/movie?api_key=${apiKey}&language=en-US` +
        `&primary_release_date.gte=${year}-01-01&primary_release_date.lte=${year}-06-30` +
        `&sort_by=popularity.desc&include_adult=false&page=1`,
        { cache: "no-store" }
      ),
      fetch(
        `${TMDB_BASE}/discover/movie?api_key=${apiKey}&language=en-US` +
        `&primary_release_date.gte=${year}-07-01&primary_release_date.lte=${year}-12-31` +
        `&sort_by=primary_release_date.asc&include_adult=false&page=1`,
        { cache: "no-store" }
      ),
    ]);

    const h1 = h1Res.ok ? (await h1Res.json()).results ?? [] : [];
    const h2 = h2Res.ok ? (await h2Res.json()).results ?? [] : [];

    const seen = new Set();
    return [...h1, ...h2]
      .filter((m) => { if (seen.has(m.id)) return false; seen.add(m.id); return true; })
      .slice(0, 40)
      .map((m) => ({
        id:          m.id,
        title:       m.title,
        releaseDate: m.release_date || null,
        overview:    (m.overview || "").slice(0, 200),
        poster:      m.poster_path ? `${TMDB_IMAGE}${m.poster_path}` : null,
        popularity:  m.popularity  ?? 0,
        voteAverage: m.vote_average ?? 0,
      }));
  } catch {
    return null;
  }
}

export async function getTMDBOscarContenders(year, apiKey) {
  if (!apiKey) return null;
  try {
    // Drama + History genres; both released and upcoming within the eligibility year
    const [res1, res2] = await Promise.all([
      fetch(
        `${TMDB_BASE}/discover/movie?api_key=${apiKey}&language=en-US` +
        `&with_genres=18,36&primary_release_date.gte=${year}-01-01` +
        `&primary_release_date.lte=${year}-06-30&sort_by=popularity.desc&page=1`,
        { cache: "no-store" }
      ),
      fetch(
        `${TMDB_BASE}/discover/movie?api_key=${apiKey}&language=en-US` +
        `&with_genres=18,36&primary_release_date.gte=${year}-07-01` +
        `&primary_release_date.lte=${year}-12-31&sort_by=primary_release_date.asc&page=1`,
        { cache: "no-store" }
      ),
    ]);

    const r1 = res1.ok ? (await res1.json()).results ?? [] : [];
    const r2 = res2.ok ? (await res2.json()).results ?? [] : [];

    const seen = new Set();
    return [...r1, ...r2]
      .filter((m) => { if (seen.has(m.id)) return false; seen.add(m.id); return true; })
      .slice(0, 25)
      .map((m) => ({
        id:          m.id,
        title:       m.title,
        releaseDate: m.release_date || null,
        overview:    (m.overview || "").slice(0, 200),
        poster:      m.poster_path ? `${TMDB_IMAGE}${m.poster_path}` : null,
        popularity:  m.popularity  ?? 0,
        voteAverage: m.vote_average ?? 0,
      }));
  } catch {
    return null;
  }
}

// ─── Wikipedia fallback (no API key needed) ───────────────────────────────────

const WIKI_API = "https://en.wikipedia.org/w/api.php";

export async function getWikipediaFilms(year) {
  try {
    const catParams = new URLSearchParams({
      action: "query", list: "categorymembers",
      cmtitle: `Category:${year}_films`, cmlimit: "50", format: "json",
    });
    const catRes = await fetch(`${WIKI_API}?${catParams}`, {
      headers: { "User-Agent": "OscarDashboard/1.0" },
      cache: "no-store",
    });
    if (!catRes.ok) return [];

    const members = ((await catRes.json()).query?.categorymembers ?? [])
      .filter((m) => m.ns === 0)
      .slice(0, 30);
    if (!members.length) return [];

    const titlesStr = members.map((m) => encodeURIComponent(m.title)).join("|");
    const propParams = new URLSearchParams({
      action: "query", prop: "extracts|pageimages",
      exintro: "1", exsentences: "2",
      piprop: "thumbnail", pithumbsize: "342", format: "json",
    });
    const propRes = await fetch(`${WIKI_API}?${propParams}&titles=${titlesStr}`, {
      headers: { "User-Agent": "OscarDashboard/1.0" },
      cache: "no-store",
    });

    if (!propRes.ok) {
      return members.map((m, i) => ({
        id: m.pageid ?? i + 1, title: cleanWikiTitle(m.title),
        releaseDate: null, overview: "", poster: null, popularity: 30 - i, voteAverage: 0,
      }));
    }

    return Object.values((await propRes.json()).query?.pages ?? {})
      .filter((p) => p.pageid > 0)
      .map((p, i) => ({
        id:          p.pageid,
        title:       cleanWikiTitle(p.title),
        releaseDate: extractWikiDate(p.extract ?? ""),
        overview:    wikiText(p.extract ?? "").slice(0, 200),
        poster:      p.thumbnail?.source ?? null,
        popularity:  30 - i,
        voteAverage: 0,
      }));
  } catch {
    return [];
  }
}

function cleanWikiTitle(t) {
  return t.replace(/\s*\([^)]*(?:film|movie)[^)]*\)\s*$/i, "").trim();
}

const MONTH_MAP = {
  january:"01",february:"02",march:"03",april:"04",may:"05",june:"06",
  july:"07",august:"08",september:"09",october:"10",november:"11",december:"12",
};
const DATE_RE = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(20\d{2})\b/i;

function extractWikiDate(html) {
  const m = wikiText(html).match(DATE_RE);
  if (!m) return null;
  return `${m[3]}-${MONTH_MAP[m[1].toLowerCase()]}-${m[2].padStart(2, "0")}`;
}

function wikiText(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")
    .replace(/&nbsp;/g," ").replace(/&#(\d+);/g,(_,c)=>String.fromCharCode(+c))
    .replace(/\s+/g," ").trim();
}

// ─── RSS Feed Sources ─────────────────────────────────────────────────────────
// 10 major entertainment and awards-tracking publications.

export const PREDICTION_FEEDS = [
  // Oscar prediction specialists
  { name: "Gold Derby",         url: "https://www.goldderby.com/feed/" },
  { name: "Next Best Picture",  url: "https://nextbestpicture.com/feed/" },
  { name: "Awards Circuit",     url: "https://www.awardscircuit.com/feed/" },
  // Major trade publications
  { name: "Variety Awards",     url: "https://variety.com/v/film/awards-intelligence/feed/" },
  { name: "Deadline Awards",    url: "https://deadline.com/category/awardsline/feed/" },
  { name: "Hollywood Reporter", url: "https://www.hollywoodreporter.com/feed/" },
  { name: "IndieWire Oscars",   url: "https://www.indiewire.com/tag/oscars/feed/" },
  { name: "The Wrap Awards",    url: "https://www.thewrap.com/awards/feed/" },
  // Entertainment & newsletter
  { name: "Entertainment Weekly", url: "https://ew.com/tag/oscars/feed/" },
  { name: "The Ankler",         url: "https://www.theankler.com/feed" },
];

// ─── RSS Fetching & Parsing ───────────────────────────────────────────────────

export async function fetchFeed({ name, url }) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 OscarDashboard/1.0 RSS reader",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      cache: "no-store", // always fetch fresh — this is the real-time signal
    });
    if (!res.ok) return [];
    return parseRSS(await res.text(), name).slice(0, 30);
  } catch {
    return [];
  }
}

function parseRSS(xml, source) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const c = m[1];
    return {
      title:       getTag(c, "title"),
      description: stripHTML(getTag(c, "description")).slice(0, 500),
      link:        getTag(c, "link"),
      pubDate:     getTag(c, "pubDate"),
      source,
    };
  });
}

function getTag(xml, tag) {
  const cd = xml.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>`, "i"));
  if (cd) return deEnt(cd[1].trim());
  const pl = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return pl ? deEnt(pl[1].trim()) : "";
}

function deEnt(t) {
  return t
    .replace(/&ldquo;|&#8220;/g,"“").replace(/&rdquo;|&#8221;/g,"”")
    .replace(/&lsquo;|&#8216;/g,"‘").replace(/&rsquo;|&#8217;/g,"’")
    .replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")
    .replace(/&nbsp;/g," ").replace(/&#(\d+);/g,(_,c)=>String.fromCharCode(+c));
}

function stripHTML(h) { return h.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim(); }

// ─── Film title extraction from article text ──────────────────────────────────

const QUOTE_RE = /[‘’“”"'']([A-Z][^‘’“”"''\n]{1,60})[‘’“”"'']/g;
const STOPWORDS = new Set([
  "The","A","An","But","And","For","In","On","At","To","Is","Are","Was","Were",
  "Will","Has","Have","This","That","These","Those","It","He","She","They",
  "We","You","My","Your","His","Her","Their","Our","New","Best","Top","More",
]);

export function extractFilmTitles(text) {
  const seen = new Set();
  for (const m of text.matchAll(QUOTE_RE)) {
    const t = m[1].trim();
    if (t.length < 2 || t.length > 70 || STOPWORDS.has(t) || /[.!?]$/.test(t) || /^\d+$/.test(t)) continue;
    seen.add(t);
  }
  return [...seen];
}

export function countMentions(articles, title) {
  const lower = title.toLowerCase();
  return articles.filter((a) => (a.title + " " + a.description).toLowerCase().includes(lower)).length;
}

export function filterOscarArticles(articles) {
  return articles.filter((a) =>
    /oscar|academy award|best picture|awards season|awards contender|frontrunner|cannes|venice|tiff|sundance|guild award/i
      .test(a.title + " " + a.description)
  );
}

export function releaseQuarter(dateStr) {
  if (!dateStr) return "TBD";
  const d = new Date(dateStr);
  return `Q${Math.ceil((d.getMonth() + 1) / 3)} ${d.getFullYear()}`;
}
