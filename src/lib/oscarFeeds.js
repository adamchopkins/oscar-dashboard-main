// Oscar tracking data — no API key required for RSS/Wikipedia.
// Set TMDB_API_KEY in Vercel env vars for richer film metadata.
//
// Film data:    TMDB (primary) → Wikipedia MediaWiki API (fallback)
// Buzz data:    11 RSS feeds — all fetched with cache:'no-store' every request
// Scoring:      Consensus model — site authority × prediction-article weight × cross-site agreement
// Oscar window: September–December releases carry 2× weight (peak campaign season)

// ─── TMDB ────────────────────────────────────────────────────────────────────

const TMDB_BASE  = "https://api.themoviedb.org/3";
const TMDB_IMAGE = "https://image.tmdb.org/t/p/w342";

export async function getTMDBFilms(year, apiKey) {
  if (!apiKey) return null;
  try {
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
        id: m.id, title: m.title, releaseDate: m.release_date || null,
        overview: (m.overview || "").slice(0, 200),
        poster: m.poster_path ? `${TMDB_IMAGE}${m.poster_path}` : null,
        popularity: m.popularity ?? 0, voteAverage: m.vote_average ?? 0,
      }));
  } catch { return null; }
}

export async function getTMDBOscarContenders(year, apiKey) {
  if (!apiKey) return null;
  try {
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
        id: m.id, title: m.title, releaseDate: m.release_date || null,
        overview: (m.overview || "").slice(0, 200),
        poster: m.poster_path ? `${TMDB_IMAGE}${m.poster_path}` : null,
        popularity: m.popularity ?? 0, voteAverage: m.vote_average ?? 0,
      }));
  } catch { return null; }
}

// Oscar season window: July–December only — these are the campaign-season releases
export async function getTMDBOscarSeasonFilms(year, apiKey) {
  if (!apiKey) return null;
  try {
    const [dramaRes, histRes] = await Promise.all([
      fetch(
        `${TMDB_BASE}/discover/movie?api_key=${apiKey}&language=en-US` +
        `&with_genres=18&primary_release_date.gte=${year}-07-01` +
        `&primary_release_date.lte=${year}-12-31&sort_by=primary_release_date.asc` +
        `&vote_count.gte=0&include_adult=false&page=1`,
        { cache: "no-store" }
      ),
      fetch(
        `${TMDB_BASE}/discover/movie?api_key=${apiKey}&language=en-US` +
        `&with_genres=36&primary_release_date.gte=${year}-07-01` +
        `&primary_release_date.lte=${year}-12-31&sort_by=primary_release_date.asc` +
        `&include_adult=false&page=1`,
        { cache: "no-store" }
      ),
    ]);

    const drama = dramaRes.ok ? (await dramaRes.json()).results ?? [] : [];
    const hist  = histRes.ok  ? (await histRes.json()).results ?? []  : [];

    const seen = new Set();
    return [...drama, ...hist]
      .filter((m) => { if (seen.has(m.id)) return false; seen.add(m.id); return true; })
      .slice(0, 30)
      .map((m) => ({
        id: m.id, title: m.title, releaseDate: m.release_date || null,
        overview: (m.overview || "").slice(0, 200),
        poster: m.poster_path ? `${TMDB_IMAGE}${m.poster_path}` : null,
        popularity: m.popularity ?? 0, voteAverage: m.vote_average ?? 0,
        oscarWindow: true,
      }));
  } catch { return null; }
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
      headers: { "User-Agent": "OscarDashboard/1.0" }, cache: "no-store",
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
      headers: { "User-Agent": "OscarDashboard/1.0" }, cache: "no-store",
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
        id: p.pageid, title: cleanWikiTitle(p.title),
        releaseDate: extractWikiDate(p.extract ?? ""),
        overview: wikiText(p.extract ?? "").slice(0, 200),
        poster: p.thumbnail?.source ?? null,
        popularity: 30 - i, voteAverage: 0,
      }));
  } catch { return []; }
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

// ─── RSS Feed Sources with authority weights ──────────────────────────────────
// Authority tiers:
//   3.0 — dedicated prediction aggregators (Gold Derby, their data is tracked consensus)
//   2.5 — prediction-specialist sites (full season tracking)
//   2.0 — major prediction-focused trade columns
//   1.8 — major trade publications with awards beats
//   1.5 — awards-focused newsletters & platforms
//   1.2 — general entertainment with awards coverage

export const PREDICTION_FEEDS = [
  // Tier 1: prediction aggregators & specialists
  { name: "Gold Derby",          url: "https://www.goldderby.com/feed/",                      authority: 3.0 },
  { name: "Next Best Picture",   url: "https://nextbestpicture.com/feed/",                    authority: 2.5 },
  { name: "Awards Circuit",      url: "https://www.awardscircuit.com/feed/",                  authority: 2.5 },
  { name: "AwardsWatch",         url: "https://awardswatch.com/feed/",                        authority: 2.0 },
  // Tier 2: major trade awards columns
  { name: "Variety Awards",      url: "https://variety.com/v/film/awards-intelligence/feed/", authority: 2.0 },
  { name: "Deadline Awards",     url: "https://deadline.com/category/awardsline/feed/",       authority: 1.8 },
  { name: "Hollywood Reporter",  url: "https://www.hollywoodreporter.com/feed/",              authority: 1.8 },
  { name: "IndieWire Oscars",    url: "https://www.indiewire.com/tag/oscars/feed/",           authority: 1.8 },
  // Tier 3: awards newsletters & general entertainment
  { name: "The Wrap Awards",     url: "https://www.thewrap.com/awards/feed/",                 authority: 1.5 },
  { name: "The Ankler",          url: "https://www.theankler.com/feed",                       authority: 1.5 },
  { name: "Entertainment Weekly",url: "https://ew.com/tag/oscars/feed/",                      authority: 1.2 },
];

// ─── RSS Fetching & Parsing ───────────────────────────────────────────────────

export async function fetchFeed({ name, url }) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 OscarDashboard/1.0 RSS reader",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return parseRSS(await res.text(), name).slice(0, 30);
  } catch { return []; }
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

// ─── Article Filtering ────────────────────────────────────────────────────────

// General Oscar coverage filter (broad)
export function filterOscarArticles(articles) {
  return articles.filter((a) =>
    /oscar|academy award|best picture|awards season|awards contender|frontrunner|cannes|venice|tiff|sundance|guild award|campaign|fyc|99th/i
      .test(a.title + " " + a.description)
  );
}

// Prediction-specific filter: targets articles that are actually making predictions,
// not just covering general awards news. These carry far more signal for long-term forecasting.
const PREDICTION_RE = /\b(prediction|predict|frontrunner|front[- ]runner|early favorite|best picture race|oscar race|awards race|contender|my picks|oscar chart|racetrack|rankings|race update|oscar season|fyc|awards tracker|leading candidate|projected winner|favorites list|power rankings|oscar tracker|guild race)\b/i;

export function isPredictionArticle(article) {
  return PREDICTION_RE.test(article.title + " " + article.description);
}

export function filterPredictionArticles(articles) {
  return articles.filter((a) =>
    /oscar|academy award|best picture|awards season|frontrunner|campaign|fyc|99th|guild|awards race/i
      .test(a.title + " " + a.description)
  );
}

// ─── Consensus Scoring ────────────────────────────────────────────────────────
// Combines site authority, prediction-article weighting, and cross-site agreement.
// This is the core long-term signal: films that multiple trusted prediction sites
// independently pick are far more reliable than a single high-mention-count article.

export function computeConsensusScore(allArticles, predictionArticles, title) {
  const lower    = title.toLowerCase();
  const predSet  = new Set(predictionArticles);
  const inText   = (a) => (a.title + " " + a.description).toLowerCase().includes(lower);

  const allMentions  = allArticles.filter(inText);
  const predMentions = predictionArticles.filter(inText);

  const distinctSites    = new Set(allMentions.map((a) => a.source)).size;
  const predictingSites  = new Set(predMentions.map((a) => a.source)).size;

  // Weighted authority: prediction articles worth 2.5× vs. general coverage
  const authorityScore = allMentions.reduce((sum, a) => {
    const auth   = PREDICTION_FEEDS.find((f) => f.name === a.source)?.authority ?? 1.0;
    const isPred = predSet.has(a);
    return sum + auth * (isPred ? 2.5 : 1.0);
  }, 0);

  // Consensus multiplier: independent cross-site agreement is the strongest long-term signal
  const consensusMult = predictingSites >= 4 ? 3.0
                      : predictingSites >= 3 ? 2.0
                      : predictingSites >= 2 ? 1.4
                      : 1.0;

  return {
    rawMentions:     allMentions.length,
    predMentions:    predMentions.length,
    distinctSites,
    predictingSites,
    consensusScore:  authorityScore * consensusMult,
    isConsensus:     predictingSites >= 2,
    isFrontrunner:   predictingSites >= 3,
  };
}

// ─── Oscar Season Release Window Bonus ───────────────────────────────────────
// Films releasing in the fall/winter campaign window carry more long-term Oscar weight.
// The industry runs FYC campaigns and guild screenings Sep–Jan, so earlier knowledge
// of a fall release is a stronger long-term predictor than a spring release buzz spike.

export function getOscarSeasonBonus(dateStr, eligibilityYear) {
  if (!dateStr) return 1.2; // Unknown date — give mild benefit of doubt
  const d     = new Date(dateStr);
  const month = d.getMonth() + 1; // 1–12
  const year  = d.getFullYear();
  if (year !== eligibilityYear) return 0.8; // Wrong year
  if (month >= 11) return 2.2; // Nov–Dec: peak awards push
  if (month >= 9)  return 2.0; // Sep–Oct: festival season / early campaigns
  if (month >= 7)  return 1.5; // Jul–Aug: summer prestige window
  if (month >= 4)  return 1.0; // Apr–Jun: standard release
  return 0.9;                   // Jan–Mar: early year, rarely Oscar
}

// ─── Film title extraction from article text ──────────────────────────────────

const QUOTE_RE = /[‘’“”"']([A-Z][^‘’“”"'\n]{1,60})[‘’“”"']/g;
const STOPWORDS = new Set([
  "The","A","An","But","And","For","In","On","At","To","Is","Are","Was","Were",
  "Will","Has","Have","This","That","These","Those","It","He","She","They",
  "We","You","My","Your","His","Her","Their","Our","New","Best","Top","More",
  "Oscar","Academy","Golden","Globe","Screen","Actor","Guild","Critics","Choice",
]);

export function extractFilmTitles(text) {
  const seen = new Set();
  for (const m of text.matchAll(QUOTE_RE)) {
    const t = m[1].trim();
    if (
      t.length < 2 || t.length > 70 ||
      STOPWORDS.has(t) ||
      /[.!?]$/.test(t) ||
      /^\d+$/.test(t)
    ) continue;
    seen.add(t);
  }
  return [...seen];
}

export function countMentions(articles, title) {
  const lower = title.toLowerCase();
  return articles.filter((a) =>
    (a.title + " " + a.description).toLowerCase().includes(lower)
  ).length;
}

export function releaseQuarter(dateStr) {
  if (!dateStr) return "TBD";
  const d = new Date(dateStr);
  return `Q${Math.ceil((d.getMonth() + 1) / 3)} ${d.getFullYear()}`;
}
