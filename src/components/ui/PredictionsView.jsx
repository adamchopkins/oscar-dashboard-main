"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { loadPredictions, savePredictions, clearPredictions } from "@/lib/storage";

export default function PredictionsView() {
  const [predictions, setPredictions] = useState({});
  const [locked, setLocked] = useState(false);
  const [nominees, setNominees] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = loadPredictions();
    if (saved.picks) setPredictions(saved.picks);
    if (saved.locked) setLocked(saved.locked);
    fetchNominees();
  }, []);

  useEffect(() => {
    savePredictions({ picks: predictions, locked });
  }, [predictions, locked]);

  async function fetchNominees() {
    setLoading(true);
    try {
      const res = await fetch("/api/festival-intel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query_type: "precursors" }),
      });
      const result = await res.json();
      if (result.success) setNominees(result.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const handleSelect = (category, pick) => {
    if (!locked) setPredictions((p) => ({ ...p, [category]: pick }));
  };

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-zinc-600 border-t-blue-500 mb-4" />
        <p className="text-zinc-400">Loading nominee data...</p>
      </div>
    );
  }

  // Build categories from frontrunner data
  const categories = nominees?.frontrunners
    ? Object.entries(nominees.frontrunners).map(([key, contenders]) => ({
        id: key,
        name: key.replace(/([A-Z])/g, " $1").trim(),
        nominees: (contenders || []).map((c) => c.title || c.name),
      }))
    : [];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold">Your Predictions</h2>
          <p className="text-zinc-500 text-sm">
            Lock in your picks before the ceremony
          </p>
        </div>
        <div className="flex gap-2">
          {!locked && categories.length > 0 && (
            <Button
              onClick={() => setLocked(true)}
              disabled={Object.keys(predictions).length < categories.length}
              className="bg-blue-600 hover:bg-blue-700"
            >
              🔒 Lock In
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setPredictions({});
              setLocked(false);
              clearPredictions();
            }}
          >
            🔄 Reset
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {categories.map((cat) => (
          <Card key={cat.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base capitalize">{cat.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {cat.nominees.map((nominee) => {
                const isSelected = predictions[cat.id] === nominee;
                return (
                  <button
                    key={nominee}
                    onClick={() => handleSelect(cat.id, nominee)}
                    disabled={locked}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-all
                      ${isSelected
                        ? "border-blue-500 bg-blue-500/10 text-blue-400 font-medium"
                        : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:bg-zinc-800/50"
                      }
                      ${locked ? "cursor-default" : "cursor-pointer"}
                    `}
                  >
                    {nominee}
                  </button>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}