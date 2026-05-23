import { NextResponse } from "next/server";

const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";

async function queryWikidata(sparql) {
  const url = new URL(WIKIDATA_ENDPOINT);
  url.searchParams.set("query", sparql);
  url.searchParams.set("format", "json");
  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/sparql-results+json",
      "User-Agent": "OscarDashboard/1.0 (educational project)",
    },
  });
  if (!res.ok) throw new Error(`Wikidata error ${res.status}`);
  return res.json();
}

function getReleaseQuarter(dateStr) {
  if (!dateStr) return "TBD";
  const d = new Date(dateStr);
  return `Q${Math.ceil((d.getMonth() + 1) / 3)} ${d.getFullYear()}`;
}

export async function POST(request) {
  try {
    const { query_type = "festivals" } = await request.json();

    if (query_type === "festivals") {
      // Drama and art-house films from the Oscar eligibility year
      const sparql = `
        SELECT DISTINCT ?film ?filmLabel ?directorLabel ?releaseDate
        WHERE {
          ?film wdt:P31 wd:Q11424 ;
                wdt:P577 ?releaseDate .
          FILTER(YEAR(?releaseDate) = 2026)
          ?film wdt:P136 ?genre .
          FILTER(?genre IN (wd:Q130232, wd:Q859369, wd:Q2975633))
          OPTIONAL { ?film wdt:P57 ?director . }
          SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul" . }
        }
        ORDER BY DESC(?releaseDate)
        LIMIT 40
      `;

      const data = await queryWikidata(sparql);
      const bindings = data.results?.bindings || [];

      const seen = new Set();
      const films = bindings
        .filter((b) => {
          const id = b.film?.value;
          if (!id || seen.has(id)) return false;
          const label = b.filmLabel?.value || "";
          if (label.startsWith("Q")) return false;
          seen.add(id);
          return true;
        })
        .slice(0, 15)
        .map((b) => ({
          title: b.filmLabel?.value || "Unknown",
          director: b.directorLabel?.value || null,
          cast: [],
          festival: null,
          festivalSection: null,
          distributor: null,
          releaseWindow: getReleaseQuarter(b.releaseDate?.value),
          buzzLevel: "medium",
          buzzSummary: `Drama releasing in ${b.releaseDate?.value?.split("T")[0]?.slice(0, 7) || "2026"} — in the Oscar eligibility window.`,
          oscarCategories: ["Best Picture", "Best Director", "Best Actor", "Best Actress"],
        }));

      return NextResponse.json({
        success: true,
        queryType: "festivals",
        data: films,
        fetchedAt: new Date().toISOString(),
        source: "Wikidata",
      });
    }

    if (query_type === "precursors") {
      // Recent Best Picture nominees from Wikidata (QID Q102427 = Academy Award for Best Picture)
      const sparql = `
        SELECT DISTINCT ?film ?filmLabel ?directorLabel ?castLabel
        WHERE {
          ?film wdt:P31 wd:Q11424 .
          ?film p:P1411 ?nomStat .
          ?nomStat ps:P1411 wd:Q102427 .
          ?film wdt:P577 ?releaseDate .
          FILTER(YEAR(?releaseDate) >= 2024)
          OPTIONAL { ?film wdt:P57 ?director . }
          OPTIONAL { ?film wdt:P161 ?cast . }
          SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul" . }
        }
        LIMIT 50
      `;

      const data = await queryWikidata(sparql);
      const bindings = data.results?.bindings || [];

      // Group multiple cast-member rows back into one film entry
      const filmMap = new Map();
      bindings.forEach((b) => {
        const id = b.film?.value;
        const label = b.filmLabel?.value || "";
        if (!id || label.startsWith("Q")) return;
        if (!filmMap.has(id)) {
          filmMap.set(id, { title: label, director: b.directorLabel?.value || null, cast: [] });
        }
        const castLabel = b.castLabel?.value;
        if (castLabel && !castLabel.startsWith("Q")) {
          const entry = filmMap.get(id);
          if (!entry.cast.includes(castLabel) && entry.cast.length < 4) {
            entry.cast.push(castLabel);
          }
        }
      });

      const films = [...filmMap.values()].slice(0, 5);

      const contender = (mapper) =>
        films.slice(0, 5).map((f, i) => {
          const name = mapper(f) || `Contender — ${f.title}`;
          return { name, title: name, probability: 30 - i * 5 };
        });

      const frontrunners = {
        bestPicture: contender((f) => f.title),
        bestDirector: contender((f) => f.director ? `${f.director} — ${f.title}` : null),
        bestActor: contender((f) => f.cast[0] ? `${f.cast[0]} — ${f.title}` : null),
        bestActress: contender((f) => f.cast[1] ? `${f.cast[1]} — ${f.title}` : null),
        bestSupportingActor: contender((f) => f.cast[2] ? `${f.cast[2]} — ${f.title}` : null),
        bestSupportingActress: contender((f) => f.cast[3] ? `${f.cast[3]} — ${f.title}` : null),
      };

      return NextResponse.json({
        success: true,
        queryType: "precursors",
        data: {
          season: "2026-2027",
          precursors: [
            { name: "Golden Globes", status: "upcoming", date: "January 2027" },
            { name: "Critics Choice", status: "upcoming", date: "January 2027" },
            { name: "SAG Awards", status: "upcoming", date: "February 2027" },
            { name: "DGA Awards", status: "upcoming", date: "February 2027" },
            { name: "PGA Awards", status: "upcoming", date: "February 2027" },
            { name: "BAFTA", status: "upcoming", date: "February 2027" },
            { name: "WGA Awards", status: "upcoming", date: "February 2027" },
          ],
          frontrunners,
        },
        fetchedAt: new Date().toISOString(),
        source: "Wikidata",
      });
    }

    return NextResponse.json({ success: false, error: "Invalid query_type" }, { status: 400 });
  } catch (error) {
    console.error("Festival intel error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
