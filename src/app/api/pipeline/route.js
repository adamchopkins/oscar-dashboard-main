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

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get("year") || "2026", 10);

  try {
    const sparql = `
      SELECT DISTINCT ?film ?filmLabel ?directorLabel ?releaseDate
      WHERE {
        ?film wdt:P31 wd:Q11424 ;
              wdt:P577 ?releaseDate .
        FILTER(YEAR(?releaseDate) = ${year})
        OPTIONAL { ?film wdt:P57 ?director . }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul" . }
      }
      ORDER BY DESC(?releaseDate)
      LIMIT 40
    `;

    const data = await queryWikidata(sparql);
    const bindings = data.results?.bindings || [];

    const seen = new Set();
    const movies = bindings
      .filter((b) => {
        const id = b.film?.value;
        if (!id || seen.has(id)) return false;
        const label = b.filmLabel?.value || "";
        if (label.startsWith("Q")) return false; // skip items with no English label
        seen.add(id);
        return true;
      })
      .slice(0, 30)
      .map((b, i) => ({
        id: b.film.value.split("/").pop(),
        title: b.filmLabel?.value || "Unknown",
        releaseDate: b.releaseDate?.value?.split("T")[0] || null,
        overview: b.directorLabel?.value ? `Directed by ${b.directorLabel.value}.` : "",
        poster: null,
        popularity: 30 - i,
        voteAverage: 0,
      }));

    return NextResponse.json({ success: true, year, count: movies.length, movies });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
