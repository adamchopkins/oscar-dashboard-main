"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { loadPrecursorCache, savePrecursorCache } from "@/lib/storage";

export default function PrecursorView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const cached = loadPrecursorCache();
    if (cached?.data) {
      setData(cached.data);
      setLoading(false);
    } else {
      fetchPrecursors();
    }
  }, []);

  async function fetchPrecursors() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/festival-intel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query_type: "precursors" }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      setData(result.data);
      savePrecursorCache(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-zinc-600 border-t-amber-500 mb-4" />
        <p className="text-zinc-400">Claude is tracking precursor awards...</p>
        <p className="text-zinc-600 text-sm mt-1">SAG, DGA, PGA, BAFTA, Globes, CCA, WGA...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold">Precursor Awards Tracker</h2>
          <p className="text-zinc-500 text-sm">
            Guild & critics awards — the best statistical predictors of Oscar wins
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchPrecursors}>
          🌐 Refresh
        </Button>
      </div>

      {error && <p className="text-red-400 mb-4">⚠️ {error}</p>}

      {/* Precursor ceremonies status */}
      {data?.precursors && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {data.precursors.map((p) => (
            <Card key={p.name}>
              <CardContent className="p-3 text-center">
                <p className="font-bold text-sm">{p.name}</p>
                <Badge
                  className={
                    p.status === "complete"
                      ? "bg-green-600 mt-1"
                      : p.status === "nominees_announced"
                      ? "bg-yellow-600 mt-1"
                      : "bg-zinc-700 mt-1"
                  }
                >
                  {p.status === "complete"
                    ? "✓ Complete"
                    : p.status === "nominees_announced"
                    ? "Nominees Out"
                    : "Upcoming"}
                </Badge>
                <p className="text-zinc-600 text-[10px] mt-1">{p.date}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Frontrunner probabilities */}
      {data?.frontrunners &&
        Object.entries(data.frontrunners).map(([category, contenders]) => (
          <div key={category} className="mb-6">
            <h3 className="text-lg font-bold text-zinc-300 mb-3 capitalize">
              {category.replace(/([A-Z])/g, " $1").trim()}
            </h3>
            <div className="space-y-2">
              {(contenders || []).slice(0, 5).map((c, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-48 text-sm truncate">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  "}{" "}
                    {c.title || c.name}
                  </div>
                  <div className="flex-1">
                    <Progress
                      value={c.probability || 0}
                      className="h-3"
                    />
                  </div>
                  <div className="w-12 text-right text-sm font-mono text-zinc-400">
                    {c.probability || 0}%
                  </div>
                  <div className="w-20 text-right text-xs text-zinc-600">
                    {c.precursorWins || 0}W / {c.precursorNoms || 0}N
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}