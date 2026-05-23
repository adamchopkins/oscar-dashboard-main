import { NextResponse } from "next/server";

const BASE_URL = "https://api.themoviedb.org/3";
const API_KEY = process.env.TMDB_API_KEY;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year") || "2026";

  try {
    // Fetch popular upcoming films in the Oscar window
    const url = `${BASE_URL}/discover/movie?api_key=${API_KEY}&language=en-US&primary_release_date.gte=${year}-01-01&primary_release_date.lte=${year}-12-31&sort_by=popularity.desc&page=1`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`TMDB error: ${res.status}`);
    const data = await res.json();

    const movies = (data.results || []).slice(0, 30).map((movie) => ({
      id: movie.id,
      title: movie.title,
      releaseDate: movie.release_date,
      overview: movie.overview?.slice(0, 200) + "..." || "",
      poster: movie.poster_path
        ? `https://image.tmdb.org/t/p/w342${movie.poster_path}`
        : null,
      popularity: movie.popularity,
      voteAverage: movie.vote_average,
    }));

    return NextResponse.json({
      success: true,
      year,
      count: movies.length,
      movies,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}