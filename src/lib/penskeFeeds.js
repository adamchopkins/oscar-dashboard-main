// PMC (Penske Media Corporation) prediction scanner.
//
// Outlets: Variety, Deadline, IndieWire, The Hollywood Reporter — all PMC-owned.
// Each outlet is hit on two tiers:
//   1. RSS feed      — article titles + descriptions (always works, yields recent articles)
//   2. Awards pages  — full HTML fetched server-side, stripped to text, parsed for
//                      structured category predictions ("Best Picture: Film Title")
//
// Category extraction looks for:
//   • Explicit assignments  "Best Picture: [Title]"            weight ×2.0
//   • Frontrunner language  "frontrunner … [Title]"            weight ×3.0
//   • Quoted titles in context "[Title]" leads Best Picture    weight ×1.5
//   • "Leads" / "tops" patterns "[Title]" tops race            weight ×2.5
//   • Prediction statements  prediction for Best Picture: …   weight ×2.0
//
// All scores are multiplied by the outlet's authority weight before aggregation.

// ─── PMC outlet definitions ───────────────────────────────────────────────────

export const PMC_OUTLETS = [
  {
    name:      "Variety",
    authority: 3.0,
    rss:       "https://variety.com/v/film/awards-intelligence/feed/",
    pages:     [
      "https://variety.com/awards/",
      "https://variety.com/lists/oscar-predictions/",
    ],
  },
  {
    name:      "Deadline",
    authority: 2.8,
    rss:       "https://deadline.com/category/awardsline/feed/",
    pages:     [
      "https://deadline.com/awardsline/",
      "https://deadline.com/feature/awards-season-tracker/",
    ],
  },
  {
    name:      "IndieWire",
    authority: 2.5,
    rss:       "https://www.indiewire.com/tag/oscars/feed/",
    pages:     [
      "https://www.indiewire.com/awards/",
    ],
  },
  {
    name:      "The Hollywood Reporter",
    authority: 2.5,
    rss:       "https://www.hollywoodreporter.com/t/awards/feed/",
    pages:     [
      "https://www.hollywoodreporter.com/awards/",
    ],
  },
];

// ─── HTML fetching ────────────────────────────────────────────────────────────

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function fetchPageText(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":      BROWSER_UA,
        "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control":   "no-cache",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const html = await res.text();
    const text = stripHtml(html);
    // Discard pages that are clearly paywalled/redirected — must have award-related content
    if (text.length < 400 || !/oscar|academy|best picture|best director|award/i.test(text)) return null;
    return text;
  } catch { return null; }
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi,  " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&ldquo;|&#8220;/g, '"').replace(/&rdquo;|&#8221;/g, '"')
    .replace(/&lsquo;|&#8216;/g, "'").replace(/&rsquo;|&#8217;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, c) => String.fromCharCode(+c))
    .replace(/\s+/g, " ")
    .trim();
}

// ─── RSS fetching ─────────────────────────────────────────────────────────────

async function fetchOutletRSS(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 OscarDashboard/1.0 RSS reader",
        "Accept":     "application/rss+xml, application/xml, text/xml, */*",
      },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return parseRSSItems(await res.text()).slice(0, 40);
  } catch { return []; }
}

function parseRSSItems(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const c = m[1];
    return {
      title:       rssTag(c, "title"),
      description: stripHtml(rssTag(c, "description")).slice(0, 1000),
      link:        rssTag(c, "link"),
    };
  });
}

function rssTag(xml, tag) {
  const cd = xml.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>`, "i"));
  if (cd) return deEnt(cd[1].trim());
  const pl = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return pl ? deEnt(pl[1].trim()) : "";
}

function deEnt(t) {
  return t
    .replace(/&ldquo;|&#8220;/g, '"').replace(/&rdquo;|&#8221;/g, '"')
    .replace(/&lsquo;|&#8216;/g, "'").replace(/&rsquo;|&#8217;/g, "'")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, c) => String.fromCharCode(+c));
}

// ─── Category detection ───────────────────────────────────────────────────────

const OSCAR_CATS = {
  bestPicture:           /\bbest\s+picture\b/i,
  bestDirector:          /\bbest\s+director\b/i,
  bestActor:             /\bbest\s+(?:actor|lead(?:ing)?\s+actor)\b/i,
  bestActress:           /\bbest\s+(?:actress|lead(?:ing)?\s+actress)\b/i,
  bestSupportingActor:   /\bbest\s+supporting\s+actor\b/i,
  bestSupportingActress: /\bbest\s+supporting\s+actress\b/i,
  bestAnimated:          /\bbest\s+animated\s+(?:feature\s+)?film\b/i,
  bestInternational:     /\bbest\s+international\s+(?:feature\s+)?film\b/i,
  bestDocumentary:       /\bbest\s+(?:feature\s+)?documentary\b/i,
  bestScreenplay:        /\bbest\s+(?:original|adapted)\s+screenplay\b/i,
};

const PRED_STOPWORDS = new Set([
  "The","A","An","This","That","These","Those","Oscar","Academy",
  "Golden","Globe","Screen","Actor","Guild","Critics","Choice",
  "And","But","For","In","On","At","To","Is","Are","Was","Best",
  "Director","Picture","Supporting","Animated","International",
  "Documentary","Screenplay","Original","Adapted","Feature",
  "Award","Awards","Hollywood","Reporter","Variety","Deadline",
]);

function cleanName(raw) {
  const t = raw.trim().replace(/[.,!?;:'"]+$/, "").replace(/^["']/, "").trim();
  if (t.length < 3 || t.length > 90) return null;
  const first = t.split(/\s+/)[0];
  if (PRED_STOPWORDS.has(first) || /^\d/.test(first)) return null;
  // Filter out obvious non-film strings (all lowercase first word = probably not a title/name)
  if (first === first.toLowerCase() && first.length > 2) return null;
  return t;
}

// ─── Structured extraction from text ─────────────────────────────────────────
// For each text segment, determine which Oscar category it discusses, then extract
// prediction names with confidence-weighted scores.

function extractCategoryPredictions(text, authority) {
  const catMaps = {};
  for (const cat of Object.keys(OSCAR_CATS)) catMaps[cat] = new Map();

  // Segment text at sentence boundaries and newlines for contextual analysis
  const segments = text
    .split(/[\n!?]|(?:\.\s)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12 && s.length < 600);

  for (const seg of segments) {
    // Determine which category this segment is about
    const matchedCats = Object.entries(OSCAR_CATS)
      .filter(([, re]) => re.test(seg))
      .map(([cat]) => cat);
    if (!matchedCats.length) continue;

    const hits = [];

    // Pattern A: explicit assignment  "Best Picture: [Name]" or "Best Picture — [Name]"
    const afterSep = seg.match(/[:—–]\s*["']?([A-Z][^.!?:,;\n]{2,80})["']?/);
    if (afterSep) {
      const n = cleanName(afterSep[1]);
      if (n) hits.push({ name: n, w: 2.0 });
    }

    // Pattern B: quoted titles  'Film Title' or "Film Title"
    const quotedRe = /['""]([A-Z][^'""]{2,70})['""]/ ;
    for (const qm of seg.matchAll(new RegExp(quotedRe.source, "g"))) {
      const n = cleanName(qm[1]);
      if (n) hits.push({ name: n, w: 1.5 });
    }

    // Pattern C: frontrunner / projected winner  "frontrunner … [Name]"
    const frM = seg.match(
      /\b(?:frontrunner|projected\s+winner|projected\s+to\s+win|predicted\s+(?:to\s+win|winner)|top\s+(?:pick|contender)|clear\s+favorite|early\s+favorite)[:\s]+["']?([A-Z][^.!?:;\n]{2,80})["']?/i
    );
    if (frM) {
      const n = cleanName(frM[1]);
      if (n) hits.push({ name: n, w: 3.0 }); // strongest signal
    }

    // Pattern D: "[Name]" leads / tops the race
    const leadsM = seg.match(/["']([A-Z][^'""]{2,70})["']\s+(?:leads?|tops?|front(?:s|ing)?)/i);
    if (leadsM) {
      const n = cleanName(leadsM[1]);
      if (n) hits.push({ name: n, w: 2.5 });
    }

    // Pattern E: "our prediction … [Name]" or "prediction for … [Name]"
    const ourPredM = seg.match(
      /\b(?:our|my|updated?)\s+prediction[s]?(?:\s+for[^:]*)?[:\s]+["']?([A-Z][^.!?:;\n]{2,80})["']?/i
    );
    if (ourPredM) {
      const n = cleanName(ourPredM[1]);
      if (n) hits.push({ name: n, w: 2.0 });
    }

    // Pattern F: "we predict / we pick [Name]"
    const wePickM = seg.match(
      /\b(?:we\s+(?:predict|pick|choose|select)|picking|predicting)[:\s]+["']?([A-Z][^.!?:;\n]{2,80})["']?/i
    );
    if (wePickM) {
      const n = cleanName(wePickM[1]);
      if (n) hits.push({ name: n, w: 2.0 });
    }

    // De-dup hits within this segment (same name, take max weight)
    const deduped = new Map();
    for (const { name, w } of hits) {
      deduped.set(name, Math.max(deduped.get(name) ?? 0, w));
    }

    for (const [name, w] of deduped) {
      for (const cat of matchedCats) {
        catMaps[cat].set(name, (catMaps[cat].get(name) ?? 0) + authority * w);
      }
    }
  }

  return catMaps;
}

// ─── Main aggregator ──────────────────────────────────────────────────────────

// Scrape all 4 PMC outlets (RSS + award pages) and return structured predictions.
// Returns:
//   predictions: { bestPicture: [{name, score}], bestDirector: [...], ... }
//   sources:     [{outlet, type, fetched}]
//   eligibilityYear
export async function scrapePMCPredictions(eligibilityYear) {
  // Fan out: 4 RSS feeds + up to 7 prediction pages — all parallel
  const tasks = PMC_OUTLETS.flatMap((outlet) => [
    fetchOutletRSS(outlet.rss).then((items) => ({
      outlet:    outlet.name,
      authority: outlet.authority,
      type:      "rss",
      content:   items.map((a) => a.title + " " + a.description).join("\n"),
      fetched:   items.length > 0,
    })),
    ...outlet.pages.map((url) =>
      fetchPageText(url).then((text) => ({
        outlet:    outlet.name,
        authority: outlet.authority * 1.2, // page content carries slightly more weight
        type:      "page",
        url,
        content:   text ?? "",
        fetched:   !!text,
      }))
    ),
  ]);

  const results = await Promise.all(tasks);
  const active  = results.filter((r) => r.content.length > 100);

  // Aggregate category predictions across all PMC sources
  const aggregate = {};
  for (const cat of Object.keys(OSCAR_CATS)) aggregate[cat] = new Map();

  for (const src of active) {
    const catMaps = extractCategoryPredictions(src.content, src.authority);
    for (const [cat, nameMap] of Object.entries(catMaps)) {
      for (const [name, score] of nameMap) {
        aggregate[cat].set(name, (aggregate[cat].get(name) ?? 0) + score);
      }
    }
  }

  // Sort each category and slice to top 10
  const predictions = {};
  for (const [cat, nameMap] of Object.entries(aggregate)) {
    predictions[cat] = [...nameMap.entries()]
      .filter(([name]) => name.length > 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, score]) => ({ name, score: Math.round(score * 10) / 10 }));
  }

  return {
    predictions,
    sources:         results.map((r) => ({ outlet: r.outlet, type: r.type, fetched: r.fetched })),
    activeSources:   [...new Set(active.map((r) => r.outlet))],
    eligibilityYear,
    scrapedAt:       new Date().toISOString(),
  };
}

// Return all unique film titles mentioned across any PMC prediction category.
// Useful as a fallback film catalog when TMDB_API_KEY is absent.
export function getAllPMCFilms(pmcResult) {
  const seen = new Set();
  for (const entries of Object.values(pmcResult.predictions)) {
    for (const { name } of entries) seen.add(name);
  }
  return [...seen];
}

// Convenience: PMC outlet names for display
export const PMC_SOURCE_NAMES = PMC_OUTLETS.map((o) => o.name);
