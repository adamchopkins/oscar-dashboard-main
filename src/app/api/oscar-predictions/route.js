// src/app/api/oscar-predictions/route.js

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

export async function POST(request) {
  try {
    const { ceremony = "99th", year = 2027 } = await request.json();
    const eligibilityYear = year - 1; // 2026 for 99th Oscars

    // Query for drama films from the eligibility year already known to Wikidata
    const sparql = `
      SELECT DISTINCT ?film ?filmLabel ?directorLabel ?castLabel
      WHERE {
        ?film wdt:P31 wd:Q11424 ;
              wdt:P577 ?releaseDate .
        FILTER(YEAR(?releaseDate) = ${eligibilityYear})
        ?film wdt:P136 ?genre .
        FILTER(?genre IN (wd:Q130232, wd:Q859369))
        OPTIONAL { ?film wdt:P57 ?director . }
        OPTIONAL { ?film wdt:P161 ?cast . }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul" . }
      }
      LIMIT 60
    `;

    const data = await queryWikidata(sparql);
    const bindings = data.results?.bindings || [];

    // Group multiple cast rows back into one entry per film
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

    const films = [...filmMap.values()].slice(0, 8);

    if (films.length === 0) {
      throw new Error(
        `No ${eligibilityYear} drama films found in Wikidata yet — check back as more films are added throughout the year.`
      );
    }

    const nom = (mapper, count = 6) =>
      films.slice(0, count).map((f) => mapper(f) || `Contender — ${f.title}`);

    const categories = [
      {
        id: "bestPicture",
        name: "Best Picture",
        icon: "🏆",
        nominees: nom((f) => f.title, 8),
        frontrunner: films[0]?.title,
        frontrunnerNote: `Top ${eligibilityYear} drama in Wikidata`,
      },
      {
        id: "bestDirector",
        name: "Best Director",
        icon: "🎬",
        nominees: nom((f) => f.director ? `${f.director} — ${f.title}` : null),
        frontrunner: films[0]?.director ? `${films[0].director} — ${films[0].title}` : `Director — ${films[0]?.title}`,
        frontrunnerNote: "Director of the season's top drama",
      },
      {
        id: "bestActor",
        name: "Best Actor",
        icon: "🎭",
        nominees: nom((f) => f.cast[0] ? `${f.cast[0]} — ${f.title}` : null),
        frontrunner: films[0]?.cast[0] ? `${films[0].cast[0]} — ${films[0].title}` : `Lead Actor — ${films[0]?.title}`,
        frontrunnerNote: "Lead male performance in top prestige film",
      },
      {
        id: "bestActress",
        name: "Best Actress",
        icon: "👑",
        nominees: nom((f) => f.cast[1] ? `${f.cast[1]} — ${f.title}` : null),
        frontrunner: films[0]?.cast[1] ? `${films[0].cast[1]} — ${films[0].title}` : `Lead Actress — ${films[0]?.title}`,
        frontrunnerNote: "Lead female performance in top prestige film",
      },
      {
        id: "bestSupportingActor",
        name: "Best Supporting Actor",
        icon: "🌟",
        nominees: nom((f) => f.cast[2] ? `${f.cast[2]} — ${f.title}` : null),
        frontrunner: films[0]?.cast[2] ? `${films[0].cast[2]} — ${films[0].title}` : `Supporting Actor — ${films[0]?.title}`,
        frontrunnerNote: "Supporting performance in top contenders",
      },
      {
        id: "bestSupportingActress",
        name: "Best Supporting Actress",
        icon: "✨",
        nominees: nom((f) => f.cast[3] ? `${f.cast[3]} — ${f.title}` : null),
        frontrunner: films[0]?.cast[3] ? `${films[0].cast[3]} — ${films[0].title}` : `Supporting Actress — ${films[0]?.title}`,
        frontrunnerNote: "Supporting female performance in top contenders",
      },
    ];

    return NextResponse.json({
      success: true,
      data: {
        ceremonyName: `${ceremony} Academy Awards`,
        ceremonyYear: year,
        lastUpdated: new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        sources: ["Wikidata"],
        categories,
      },
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Oscar predictions API error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
