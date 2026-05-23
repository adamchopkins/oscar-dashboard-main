"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { loadPipelineCache, savePipelineCache } from "@/lib/storage";

export default function PipelineView() {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);

  useEffect(() => {
    const cached = loadPipelineCache();
    if (cached?.movies) {
      setMovies(cached.movies);
      setLastFetched(cached.fetchedAt);
      setLoading(false);
    } else {
      fetchPipeline();
    }
  }, []);

  async function fetchPipeline() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pipeline?year=2026");
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      setMovies(result.movies);
      setLastFetched(result.fetchedAt);
      savePipelineCache(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-zinc-600 border-t-blue-500 mb-4" />
        <p className="text-zinc-400">Fetching production pipeline from TMDB...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold">Production Pipeline</h2>
          <p className="text-zinc-500 text-sm">
            Films releasing in the Oscar eligibility window — sourced from TMDB
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchPipeline}>
          🔄 Refresh
        </Button>
      </div>

      {error && <p className="text-red-400 mb-4">⚠️ {error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {movies.map((movie) => (
          <Card key={movie.id} className="overflow-hidden">
            <div className="flex gap-3 p-4">
              {movie.poster ? (
                <img
                  src={movie.poster}
                  alt={movie.title}
                  className="w-16 h-24 rounded object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-16 h-24 rounded bg-zinc-800 flex-shrink-0 flex items-center justify-center text-zinc-600 text-xs">
                  No poster
                </div>
              )}
              <div className="min-w-0">
                <h3 className="font-semibold text-sm leading-tight truncate">
                  {movie.title}
                </h3>
                <p className="text-zinc-500 text-xs mt-1">
                  {movie.releaseDate || "TBD"}
                </p>
                {movie.voteAverage > 0 && (
                  <Badge variant="outline" className="mt-2 text-xs">
                    ⭐ {movie.voteAverage.toFixed(1)}
                  </Badge>
                )}
                <p className="text-zinc-600 text-xs mt-2 line-clamp-2">
                  {movie.overview}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {lastFetched && (
        <p className="text-center text-zinc-700 text-xs mt-6">
          TMDB data from {new Date(lastFetched).toLocaleString()}
        </p>
      )}
    </div>
  );
}