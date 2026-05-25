// Oscar RSS + scoring — no API key required.
// TMDB film catalog is in @/lib/tmdb (requires TMDB_API_KEY).
// Wikipedia is the no-key fallback when TMDB is unavailable.
//
// Scoring model:
//   Site authority × prediction-article weight × cross-site consensus multiplier
//   Oscar season window (Jul–Dec): release bonus applied on top

// ─── Wikipedia fallback (no API key) ─────────────────────────────────────────

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
//   3.0 — dedicated prediction aggregators (Gold Derby tracks consensus across hundreds of experts)
//   2.5 — prediction-specialist sites (season-long tracking)
//   2.0 — major prediction-focused trade columns
//   1.8 — major trade publications with dedicated awards beats
//   1.5 — awards newsletters / broad entertainment with awards coverage

export const PREDICTION_FEEDS = [
  { name: "Gold Derby",          url: "https://www.goldderby.com/feed/",                      authority: 3.0 },
  { name: "Next Best Picture",   url: "https://nextbestpicture.com/feed/",                    authority: 2.5 },
  { name: "Awards Circuit",      url: "https://www.awardscircuit.com/feed/",                  authority: 2.5 },
  { name: "AwardsWatch",         url: "https://awardswatch.com/feed/",                        authority: 2.0 },
  { name: "Variety Awards",      url: "https://variety.com/v/film/awards-intelligence/feed/", authority: 2.0 },
  { name: "Deadline Awards",     url: "https://deadline.com/category/awardsline/feed/",       authority: 1.8 },
  { name: "Hollywood Reporter",  url: "https://www.hollywoodreporter.com/feed/",              authority: 1.8 },
  { name: "IndieWire Oscars",    url: "https://www.indiewire.com/tag/oscars/feed/",           authority: 1.8 },
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

export function filterOscarArticles(articles) {
  return articles.filter((a) =>
    /oscar|academy award|best picture|awards season|awards contender|frontrunner|cannes|venice|tiff|sundance|guild award|campaign|fyc|99th/i
      .test(a.title + " " + a.description)
  );
}

// Stricter filter — targets articles specifically making predictions, not just general coverage
export function filterPredictionArticles(articles) {
  return articles.filter((a) =>
    /oscar|academy award|best picture|awards season|frontrunner|campaign|fyc|99th|guild|awards race/i
      .test(a.title + " " + a.description)
  );
}

export function isPredictionArticle(article) {
  return /\b(prediction|predict|frontrunner|front[- ]runner|early favorite|best picture race|oscar race|awards race|contender|my picks|oscar chart|racetrack|rankings|race update|fyc|awards tracker|leading candidate|projected winner|favorites list|power rankings|oscar tracker|guild race)\b/i
    .test(article.title + " " + article.description);
}

// ─── Consensus Scoring ────────────────────────────────────────────────────────
// Long-term signal: prediction-article mentions are weighted 2.5× over general buzz.
// Cross-site agreement is the strongest durable predictor — independent picks from
// 4+ Gold Derby / NBP / Awards Circuit tier sites are far more reliable than raw counts.

export function computeConsensusScore(allArticles, predictionArticles, title) {
  const lower   = title.toLowerCase();
  const predSet = new Set(predictionArticles);
  const inText  = (a) => (a.title + " " + a.description).toLowerCase().includes(lower);

  const allMentions  = allArticles.filter(inText);
  const predMentions = predictionArticles.filter(inText);

  const distinctSites   = new Set(allMentions.map((a) => a.source)).size;
  const predictingSites = new Set(predMentions.map((a) => a.source)).size;

  const authorityScore = allMentions.reduce((sum, a) => {
    const auth   = PREDICTION_FEEDS.find((f) => f.name === a.source)?.authority ?? 1.0;
    const isPred = predSet.has(a);
    return sum + auth * (isPred ? 2.5 : 1.0);
  }, 0);

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

// ─── Oscar Season Release Bonus ───────────────────────────────────────────────
// Fall/winter releases carry more long-term Oscar weight — studios run FYC campaigns
// and guild screenings Sep–Jan. A film confirmed for Nov release has more durable
// Oscar potential than the same film with unknown or early-year release.

export function getOscarSeasonBonus(dateStr, eligibilityYear) {
  if (!dateStr) return 1.2;
  const d     = new Date(dateStr);
  const month = d.getMonth() + 1;
  const year  = d.getFullYear();
  if (year !== eligibilityYear) return 0.8;
  if (month >= 11) return 2.2;
  if (month >= 9)  return 2.0;
  if (month >= 7)  return 1.5;
  if (month >= 4)  return 1.0;
  return 0.9;
}

// ─── Film title extraction ────────────────────────────────────────────────────

const QUOTE_RE = /[''"""]([A-Z][^''"""\n]{1,60})[''"""]/g;
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
