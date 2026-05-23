// "use client";

// import { useState, useEffect } from "react";

// // ─── Pipeline Tab ───
// function PipelineView() {
//   const [movies, setMovies] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState(null);

//   useEffect(() => {
//     fetchPipeline();
//   }, []);

//   async function fetchPipeline() {
//     setLoading(true);
//     setError(null);
//     try {
//       const res = await fetch("/api/pipeline?year=2026");
//       const result = await res.json();
//       if (!result.success) throw new Error(result.error);
//       setMovies(result.movies || []);
//     } catch (err) {
//       setError(err.message);
//     } finally {
//       setLoading(false);
//     }
//   }

//   if (loading) {
//     return (
//       <div className="text-center py-16">
//         <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-zinc-600 border-t-blue-500 mb-4" />
//         <p className="text-zinc-400">Fetching production pipeline from TMDB...</p>
//       </div>
//     );
//   }

//   if (error) {
//     return (
//       <div className="text-center py-10">
//         <p className="text-red-400 mb-4">⚠️ {error}</p>
//         <button
//           onClick={fetchPipeline}
//           className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-sm"
//         >
//           Try Again
//         </button>
//       </div>
//     );
//   }

//   return (
//     <div>
//       <div className="flex justify-between items-center mb-6">
//         <div>
//           <h2 className="text-xl font-bold">Production Pipeline</h2>
//           <p className="text-zinc-500 text-sm">
//             Films releasing in the Oscar eligibility window — sourced from TMDB
//           </p>
//         </div>
//         <button
//           onClick={fetchPipeline}
//           className="px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-400 text-sm hover:bg-zinc-800"
//         >
//           🔄 Refresh
//         </button>
//       </div>

//       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
//         {movies.map((movie) => (
//           <div
//             key={movie.id}
//             className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden"
//           >
//             <div className="flex gap-3 p-4">
//               {movie.poster ? (
//                 <img
//                   src={movie.poster}
//                   alt={movie.title}
//                   className="w-16 h-24 rounded object-cover shrink-0"
//                 />
//               ) : (
//                 <div className="w-16 h-24 rounded bg-zinc-800 shrink-0 flex items-center justify-center text-zinc-600 text-xs">
//                   No poster
//                 </div>
//               )}
//               <div className="min-w-0">
//                 <h3 className="font-semibold text-sm leading-tight truncate text-zinc-200">
//                   {movie.title}
//                 </h3>
//                 <p className="text-zinc-500 text-xs mt-1">
//                   {movie.releaseDate || "TBD"}
//                 </p>
//                 {movie.voteAverage > 0 && (
//                   <span className="inline-block mt-2 px-2 py-0.5 rounded-full border border-zinc-700 text-xs text-zinc-400">
//                     ⭐ {movie.voteAverage.toFixed(1)}
//                   </span>
//                 )}
//                 <p className="text-zinc-600 text-xs mt-2 line-clamp-2">
//                   {movie.overview}
//                 </p>
//               </div>
//             </div>
//           </div>
//         ))}
//       </div>

//       {movies.length === 0 && !error && (
//         <p className="text-center text-zinc-600 py-10">No films found for this year.</p>
//       )}
//     </div>
//   );
// }

// // ─── Festival Tab ───
// function FestivalView() {
//   const [films, setFilms] = useState([]);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState(null);
//   const [fetched, setFetched] = useState(false);

//   async function fetchFestivals() {
//     setLoading(true);
//     setError(null);
//     try {
//       const res = await fetch("/api/festival-intel", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ query_type: "festivals" }),
//       });
//       const result = await res.json();
//       if (!result.success) throw new Error(result.error);
//       setFilms(Array.isArray(result.data) ? result.data : []);
//       setFetched(true);
//     } catch (err) {
//       setError(err.message);
//     } finally {
//       setLoading(false);
//     }
//   }

//   const buzzColors = {
//     high: "bg-green-900/50 text-green-400 border-green-800",
//     medium: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
//     low: "bg-zinc-800 text-zinc-400 border-zinc-700",
//   };

//   // Group by festival
//   const grouped = {};
//   films.forEach((f) => {
//     const key = f.festival || "Not Yet Selected";
//     if (!grouped[key]) grouped[key] = [];
//     grouped[key].push(f);
//   });

//   return (
//     <div>
//       <div className="flex justify-between items-center mb-6">
//         <div>
//           <h2 className="text-xl font-bold">Festival Intelligence</h2>
//           <p className="text-zinc-500 text-sm">
//             Festival selections & Oscar buzz — powered by Claude API + web search
//           </p>
//         </div>
//         <button
//           onClick={fetchFestivals}
//           disabled={loading}
//           className="px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-400 text-sm hover:bg-zinc-800 disabled:opacity-50"
//         >
//           {loading ? "Searching..." : "🌐 Ask Claude"}
//         </button>
//       </div>

//       {loading && (
//         <div className="text-center py-16">
//           <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-zinc-600 border-t-amber-500 mb-4" />
//           <p className="text-zinc-400">Claude is searching for festival selections...</p>
//           <p className="text-zinc-600 text-sm mt-1">
//             Scanning Cannes, Venice, TIFF, Telluride...
//           </p>
//         </div>
//       )}

//       {error && (
//         <div className="text-center py-10">
//           <p className="text-red-400 mb-4">⚠️ {error}</p>
//           <button
//             onClick={fetchFestivals}
//             className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-sm"
//           >
//             Try Again
//           </button>
//         </div>
//       )}

//       {!loading && !fetched && !error && (
//         <div className="text-center py-16">
//           <p className="text-zinc-500 text-4xl mb-4">🎪</p>
//           <p className="text-zinc-400">
//             Click <strong>Ask Claude</strong> to search the web for festival selections and Oscar buzz.
//           </p>
//           <p className="text-zinc-600 text-sm mt-2">
//             Claude will search Variety, Deadline, IndieWire and structure the results.
//           </p>
//         </div>
//       )}

//       {!loading &&
//         fetched &&
//         Object.entries(grouped).map(([festival, festFilms]) => (
//           <div key={festival} className="mb-8">
//             <h3 className="text-lg font-bold text-zinc-300 mb-3 flex items-center gap-2">
//               🎪 {festival}
//               <span className="px-2 py-0.5 rounded-full border border-zinc-700 text-xs text-zinc-500 font-normal">
//                 {festFilms.length} films
//               </span>
//             </h3>
//             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//               {festFilms.map((film, i) => (
//                 <div
//                   key={i}
//                   className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4"
//                 >
//                   <div className="flex justify-between items-start mb-2">
//                     <div>
//                       <h4 className="font-bold text-sm text-zinc-200">{film.title}</h4>
//                       <p className="text-zinc-500 text-xs">{film.director}</p>
//                     </div>
//                     <span
//                       className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
//                         buzzColors[film.buzzLevel] || buzzColors.low
//                       }`}
//                     >
//                       {film.buzzLevel} buzz
//                     </span>
//                   </div>
//                   {film.cast && (
//                     <p className="text-zinc-400 text-xs mb-2">
//                       {(Array.isArray(film.cast) ? film.cast : [film.cast])
//                         .slice(0, 3)
//                         .join(", ")}
//                     </p>
//                   )}
//                   <p className="text-zinc-500 text-xs mb-3">{film.buzzSummary}</p>
//                   <div className="flex flex-wrap gap-1">
//                     {(film.oscarCategories || []).map((cat) => (
//                       <span
//                         key={cat}
//                         className="px-2 py-0.5 rounded-full border border-zinc-700 text-[10px] text-zinc-500"
//                       >
//                         {cat}
//                       </span>
//                     ))}
//                   </div>
//                   {film.distributor && (
//                     <p className="text-zinc-700 text-[10px] mt-2">
//                       {film.distributor} · {film.releaseWindow || "TBD"}
//                     </p>
//                   )}
//                 </div>
//               ))}
//             </div>
//           </div>
//         ))}
//     </div>
//   );
// }

// // ─── Precursor Tab ───
// function PrecursorView() {
//   const [data, setData] = useState(null);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState(null);
//   const [fetched, setFetched] = useState(false);

//   async function fetchPrecursors() {
//     setLoading(true);
//     setError(null);
//     try {
//       const res = await fetch("/api/festival-intel", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ query_type: "precursors" }),
//       });
//       const result = await res.json();
//       if (!result.success) throw new Error(result.error);
//       setData(result.data);
//       setFetched(true);
//     } catch (err) {
//       setError(err.message);
//     } finally {
//       setLoading(false);
//     }
//   }

//   return (
//     <div>
//       <div className="flex justify-between items-center mb-6">
//         <div>
//           <h2 className="text-xl font-bold">Precursor Awards Tracker</h2>
//           <p className="text-zinc-500 text-sm">
//             Guild & critics awards — the best statistical predictors of Oscar wins
//           </p>
//         </div>
//         <button
//           onClick={fetchPrecursors}
//           disabled={loading}
//           className="px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-400 text-sm hover:bg-zinc-800 disabled:opacity-50"
//         >
//           {loading ? "Searching..." : "🌐 Ask Claude"}
//         </button>
//       </div>

//       {loading && (
//         <div className="text-center py-16">
//           <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-zinc-600 border-t-amber-500 mb-4" />
//           <p className="text-zinc-400">Claude is tracking precursor awards...</p>
//           <p className="text-zinc-600 text-sm mt-1">SAG, DGA, PGA, BAFTA, Globes, CCA, WGA...</p>
//         </div>
//       )}

//       {error && (
//         <div className="text-center py-10">
//           <p className="text-red-400 mb-4">⚠️ {error}</p>
//           <button
//             onClick={fetchPrecursors}
//             className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-sm"
//           >
//             Try Again
//           </button>
//         </div>
//       )}

//       {!loading && !fetched && !error && (
//         <div className="text-center py-16">
//           <p className="text-zinc-500 text-4xl mb-4">🏅</p>
//           <p className="text-zinc-400">
//             Click <strong>Ask Claude</strong> to search for precursor awards data and win probabilities.
//           </p>
//         </div>
//       )}

//       {!loading && fetched && data && (
//         <>
//           {/* Precursor ceremony status cards */}
//           {data.precursors && (
//             <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
//               {data.precursors.map((p) => (
//                 <div
//                   key={p.name}
//                   className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 text-center"
//                 >
//                   <p className="font-bold text-sm text-zinc-300">{p.name}</p>
//                   <span
//                     className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
//                       p.status === "complete"
//                         ? "bg-green-900/50 text-green-400"
//                         : p.status === "nominees_announced"
//                         ? "bg-yellow-900/50 text-yellow-400"
//                         : "bg-zinc-800 text-zinc-500"
//                     }`}
//                   >
//                     {p.status === "complete"
//                       ? "✓ Complete"
//                       : p.status === "nominees_announced"
//                       ? "Noms Out"
//                       : "Upcoming"}
//                   </span>
//                   <p className="text-zinc-600 text-[10px] mt-1">{p.date}</p>
//                 </div>
//               ))}
//             </div>
//           )}

//           {/* Frontrunner probability bars */}
//           {data.frontrunners &&
//             Object.entries(data.frontrunners).map(([category, contenders]) => (
//               <div key={category} className="mb-8">
//                 <h3 className="text-lg font-bold text-zinc-300 mb-4 capitalize">
//                   {category.replace(/([A-Z])/g, " $1").trim()}
//                 </h3>
//                 <div className="space-y-3">
//                   {(contenders || []).slice(0, 5).map((c, i) => (
//                     <div key={i} className="flex items-center gap-3">
//                       <div className="w-6 text-center text-sm">
//                         {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : <span className="text-zinc-600">{i + 1}</span>}
//                       </div>
//                       <div className="w-48 text-sm text-zinc-300 truncate">
//                         {c.title || c.name}
//                       </div>
//                       <div className="flex-1">
//                         <div className="w-full h-2.5 bg-zinc-800 rounded-full overflow-hidden">
//                           <div
//                             className="h-full rounded-full transition-all duration-500"
//                             style={{
//                               width: `${Math.max(2, c.probability || 0)}%`,
//                               backgroundColor:
//                                 i === 0 ? "#d4af37" : i === 1 ? "#a8a29e" : i === 2 ? "#b45309" : "#3f3f46",
//                             }}
//                           />
//                         </div>
//                       </div>
//                       <div className="w-12 text-right text-sm font-mono text-zinc-400">
//                         {c.probability || 0}%
//                       </div>
//                     </div>
//                   ))}
//                 </div>
//               </div>
//             ))}
//         </>
//       )}
//     </div>
//   );
// }

// // ─── Predictions Tab ───
// function PredictionsView() {
//   const [predictions, setPredictions] = useState({});
//   const [locked, setLocked] = useState(false);
//   const [nominees, setNominees] = useState(null);
//   const [loading, setLoading] = useState(false);
//   const [fetched, setFetched] = useState(false);

//   // Load saved predictions from localStorage
//   useEffect(() => {
//     try {
//       const saved = localStorage.getItem("oscar-user-predictions");
//       if (saved) {
//         const parsed = JSON.parse(saved);
//         if (parsed.picks) setPredictions(parsed.picks);
//         if (parsed.locked) setLocked(parsed.locked);
//       }
//     } catch {}
//   }, []);

//   // Save predictions when they change
//   useEffect(() => {
//     try {
//       localStorage.setItem(
//         "oscar-user-predictions",
//         JSON.stringify({ picks: predictions, locked })
//       );
//     } catch {}
//   }, [predictions, locked]);

//   async function fetchNominees() {
//     setLoading(true);
//     try {
//       const res = await fetch("/api/festival-intel", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ query_type: "precursors" }),
//       });
//       const result = await res.json();
//       if (result.success) {
//         setNominees(result.data);
//         setFetched(true);
//       }
//     } catch (err) {
//       console.error(err);
//     } finally {
//       setLoading(false);
//     }
//   }

//   const categories =
//     nominees?.frontrunners
//       ? Object.entries(nominees.frontrunners).map(([key, contenders]) => ({
//           id: key,
//           name: key.replace(/([A-Z])/g, " $1").trim(),
//           icon:
//             key === "bestPicture"
//               ? "🏆"
//               : key === "bestDirector"
//               ? "🎬"
//               : key === "bestActor"
//               ? "🎭"
//               : key === "bestActress"
//               ? "👑"
//               : "✨",
//           nominees: (contenders || []).map((c) => c.title || c.name),
//         }))
//       : [];

//   const totalCats = categories.length;
//   const totalPicked = Object.keys(predictions).length;
//   const allPicked = totalCats > 0 && totalPicked === totalCats;

//   return (
//     <div>
//       <div className="flex justify-between items-center mb-6">
//         <div>
//           <h2 className="text-xl font-bold">Your Predictions</h2>
//           <p className="text-zinc-500 text-sm">
//             Lock in your picks before the ceremony
//           </p>
//         </div>
//         <div className="flex gap-2">
//           {!locked && totalCats > 0 && (
//             <button
//               onClick={() => allPicked && setLocked(true)}
//               disabled={!allPicked}
//               className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
//                 allPicked
//                   ? "bg-blue-600 text-white hover:bg-blue-700"
//                   : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
//               }`}
//             >
//               {allPicked ? "🔒 Lock In" : `Pick ${totalCats - totalPicked} more`}
//             </button>
//           )}
//           <button
//             onClick={() => {
//               setPredictions({});
//               setLocked(false);
//             }}
//             className="px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-400 text-sm hover:bg-zinc-800"
//           >
//             🔄 Reset
//           </button>
//         </div>
//       </div>

//       {!fetched && (
//         <div className="text-center py-16">
//           <p className="text-zinc-500 text-4xl mb-4">🔮</p>
//           <p className="text-zinc-400 mb-4">
//             First, load the contender data so you can make your picks.
//           </p>
//           <button
//             onClick={fetchNominees}
//             disabled={loading}
//             className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
//           >
//             {loading ? "Loading..." : "🌐 Load Contenders from Claude"}
//           </button>
//         </div>
//       )}

//       {loading && (
//         <div className="text-center py-16">
//           <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-zinc-600 border-t-blue-500 mb-4" />
//           <p className="text-zinc-400">Loading nominee data...</p>
//         </div>
//       )}

//       {fetched && categories.length > 0 && (
//         <>
//           {/* Score card */}
//           <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 mb-6 text-center">
//             <p className="text-zinc-500 text-sm mb-2">Categories picked</p>
//             <p className="text-2xl font-bold font-mono">
//               {totalPicked} / {totalCats}
//             </p>
//             <div className="w-64 mx-auto mt-3 h-2 bg-zinc-800 rounded-full overflow-hidden">
//               <div
//                 className="h-full bg-blue-500 rounded-full transition-all duration-300"
//                 style={{ width: `${(totalPicked / totalCats) * 100}%` }}
//               />
//             </div>
//             {locked && (
//               <p className="text-amber-400 text-sm font-medium mt-4">
//                 🔒 Predictions locked! Compare after the ceremony.
//               </p>
//             )}
//           </div>

//           {/* Category cards */}
//           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
//             {categories.map((cat) => (
//               <div
//                 key={cat.id}
//                 className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4"
//               >
//                 <h3 className="font-bold text-base mb-3 flex items-center gap-2 capitalize">
//                   <span>{cat.icon}</span> {cat.name}
//                 </h3>
//                 <div className="space-y-2">
//                   {cat.nominees.map((nominee) => {
//                     const isSelected = predictions[cat.id] === nominee;
//                     return (
//                       <button
//                         key={nominee}
//                         onClick={() =>
//                           !locked &&
//                           setPredictions((prev) => ({ ...prev, [cat.id]: nominee }))
//                         }
//                         disabled={locked}
//                         className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${
//                           isSelected
//                             ? "border-blue-500 bg-blue-500/10 text-blue-400 font-medium"
//                             : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:bg-zinc-800/50"
//                         } ${locked ? "cursor-default" : "cursor-pointer"}`}
//                       >
//                         {nominee}
//                       </button>
//                     );
//                   })}
//                 </div>
//               </div>
//             ))}
//           </div>
//         </>
//       )}
//     </div>
//   );
// }

// // ─── Main Dashboard ───
// export default function Dashboard() {
//   const [activeTab, setActiveTab] = useState("pipeline");
//   const [mounted, setMounted] = useState(false);

//   useEffect(() => setMounted(true), []);
//   if (!mounted) return null;

//   const tabs = [
//     { id: "pipeline", label: "📋 Pipeline" },
//     { id: "festivals", label: "🎪 Festivals" },
//     { id: "precursors", label: "🏅 Precursors" },
//     { id: "predictions", label: "🔮 Predictions" },
//   ];

//   // Determine season phase
//   const month = new Date().getMonth();
//   const seasonPhase =
//     month >= 4 && month <= 9
//       ? "festivals"
//       : month >= 10 || month <= 1
//       ? "precursors"
//       : "ceremony";

//   return (
//     <main className="min-h-screen bg-zinc-950 text-white">
//       <div className="max-w-6xl mx-auto px-4 py-8">
//         {/* Header */}
//         <div className="text-center mb-8">
//           <h1 className="text-4xl font-bold tracking-tight">
//             🎬 Oscar Season Dashboard
//           </h1>
//           <p className="text-zinc-400 mt-2">
//             99th Academy Awards — Tracking the 2026 Race
//           </p>
//           <div className="inline-block mt-3 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-500">
//             Season phase:{" "}
//             <span className="text-blue-400 font-medium">{seasonPhase}</span>
//           </div>
//         </div>

//         {/* Tab Navigation */}
//         <div className="flex justify-center gap-1 mb-8 bg-zinc-900 rounded-xl p-1 max-w-2xl mx-auto">
//           {tabs.map((tab) => (
//             <button
//               key={tab.id}
//               onClick={() => setActiveTab(tab.id)}
//               className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
//                 activeTab === tab.id
//                   ? "bg-zinc-800 text-white shadow-sm"
//                   : "text-zinc-500 hover:text-zinc-300"
//               }`}
//             >
//               {tab.label}
//             </button>
//           ))}
//         </div>

//         {/* Tab Content */}
//         {activeTab === "pipeline" && <PipelineView />}
//         {activeTab === "festivals" && <FestivalView />}
//         {activeTab === "precursors" && <PrecursorView />}
//         {activeTab === "predictions" && <PredictionsView />}
//       </div>
//     </main>
//   );
// }

"use client";

import { useState, useEffect } from "react";

// ─── Fallback data (used if API is unavailable) ───
const FALLBACK_CATEGORIES = [
  {
    id: "bestPicture",
    name: "Best Picture",
    icon: "🏆",
    nominees: [
      "Digger",
      "Dune: Part Three",
      "The Odyssey",
      "The Adventures of Cliff Booth",
      "Almodóvar's New Film",
      "Bride of Frankenstein",
      "Her Private Hell",
      "Spielberg Untitled Project",
    ],
    frontrunner: "Digger",
    frontrunnerNote: "Iñárritu + Tom Cruise dramatic turn + Warner Bros. awards push",
  },
  {
    id: "bestDirector",
    name: "Best Director",
    icon: "🎬",
    nominees: [
      "Alejandro G. Iñárritu — Digger",
      "Denis Villeneuve — Dune: Part Three",
      "Christopher Nolan — The Odyssey",
      "David Fincher — The Adventures of Cliff Booth",
      "Pedro Almodóvar — Untitled Film",
    ],
    frontrunner: "Alejandro G. Iñárritu — Digger",
    frontrunnerNote: "2x winner returning to English-language cinema",
  },
  {
    id: "bestActor",
    name: "Best Actor",
    icon: "🎭",
    nominees: [
      "Tom Cruise — Digger",
      "Timothée Chalamet — Dune: Part Three",
      "Christian Bale — Bride of Frankenstein",
      "Brad Pitt — The Adventures of Cliff Booth",
      "Matt Damon — The Odyssey",
    ],
    frontrunner: "Tom Cruise — Digger",
    frontrunnerNote: "Career-redefining dramatic turn for Iñárritu",
  },
  {
    id: "bestActress",
    name: "Best Actress",
    icon: "👑",
    nominees: [
      "Sandra Hüller — Digger",
      "Zendaya — Dune: Part Three",
      "Jessie Buckley — Bride of Frankenstein",
      "Léa Seydoux — The Unknown",
      "Penélope Cruz — Almodóvar Film",
    ],
    frontrunner: "Sandra Hüller — Digger",
    frontrunnerNote: "Overdue after Anatomy of a Fall near-miss",
  },
  {
    id: "bestSupportingActor",
    name: "Best Supporting Actor",
    icon: "🌟",
    nominees: [
      "Jesse Plemons — Digger",
      "John Goodman — Digger",
      "Tom Holland — The Odyssey",
      "Peter Sarsgaard — Bride of Frankenstein",
      "Riz Ahmed — Digger",
    ],
    frontrunner: "Jesse Plemons — Digger",
    frontrunnerNote: "Consistently praised in ensemble pieces",
  },
  {
    id: "bestSupportingActress",
    name: "Best Supporting Actress",
    icon: "✨",
    nominees: [
      "Anya Taylor-Joy — Dune: Part Three",
      "Sophie Thatcher — Her Private Hell",
      "Emma D'Arcy — Digger",
      "Sophie Wilde — Digger",
      "Cate Blanchett — Almodóvar Film",
    ],
    frontrunner: "Anya Taylor-Joy — Dune: Part Three",
    frontrunnerNote: "Expanded role in franchise finale",
  },
];

// ─── Pipeline Tab ───
function PipelineView() {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => { fetchPipeline(); }, []);

  async function fetchPipeline() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pipeline?year=2026");
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("API route not found. Create src/app/api/pipeline/route.js");
      }
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      setMovies(result.movies || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return (
    <div className="text-center py-16">
      <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-zinc-600 border-t-blue-500 mb-4" />
      <p className="text-zinc-400">Loading from Wikipedia + awards feeds...</p>
    </div>
  );

  if (error) return (
    <div className="text-center py-10">
      <p className="text-red-400 mb-2">⚠️ {error}</p>
      <p className="text-zinc-600 text-sm mb-4">Pipeline loads from Wikipedia — check your network connection</p>
      <button onClick={fetchPipeline} className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-sm">Try Again</button>
    </div>
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold">Production Pipeline</h2>
          <p className="text-zinc-500 text-sm">Wikipedia · sorted by Gold Derby / Variety / Deadline buzz</p>
        </div>
        <button onClick={fetchPipeline} className="px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-400 text-sm hover:bg-zinc-800">🔄 Refresh</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {movies.map((movie) => (
          <div key={movie.id} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
            <div className="flex gap-3">
              {movie.poster ? (
                <img src={movie.poster} alt={movie.title} className="w-16 h-24 rounded object-cover shrink-0" />
              ) : (
                <div className="w-16 h-24 rounded bg-zinc-800 shrink-0 flex items-center justify-center text-zinc-600 text-xs">No poster</div>
              )}
              <div className="min-w-0">
                <h3 className="font-semibold text-sm truncate text-zinc-200">{movie.title}</h3>
                <p className="text-zinc-500 text-xs mt-1">{movie.releaseDate || "TBD"}</p>
                {movie.oscarMentions > 0 && (
                  <span className="inline-block mt-2 px-2 py-0.5 rounded-full border border-amber-800/40 bg-amber-900/10 text-xs text-amber-400">
                    📡 {movie.oscarMentions} mention{movie.oscarMentions !== 1 ? "s" : ""}
                  </span>
                )}
                <p className="text-zinc-600 text-xs mt-2 line-clamp-2">{movie.overview}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Festival Tab ───
function FestivalView() {
  const [films, setFilms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fetched, setFetched] = useState(false);

  async function fetchFestivals() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/festival-intel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query_type: "festivals" }),
      });
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("API route not found. Create src/app/api/festival-intel/route.js");
      }
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      setFilms(Array.isArray(result.data) ? result.data : []);
      setFetched(true);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  const buzzColors = { high: "bg-green-900/50 text-green-400 border-green-800", medium: "bg-yellow-900/50 text-yellow-400 border-yellow-800", low: "bg-zinc-800 text-zinc-400 border-zinc-700" };
  const grouped = {};
  films.forEach((f) => { const k = f.festival || "Not Yet Selected"; if (!grouped[k]) grouped[k] = []; grouped[k].push(f); });

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold">Festival Intelligence</h2>
          <p className="text-zinc-500 text-sm">Gold Derby · Variety · Deadline · IndieWire · Next Best Picture</p>
        </div>
        <button onClick={fetchFestivals} disabled={loading} className="px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-400 text-sm hover:bg-zinc-800 disabled:opacity-50">{loading ? "Loading..." : "📡 Fetch Live Data"}</button>
      </div>
      {loading && <div className="text-center py-16"><div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-zinc-600 border-t-amber-500 mb-4" /><p className="text-zinc-400">Scanning Gold Derby, Variety, Deadline, IndieWire...</p><p className="text-zinc-600 text-sm mt-1">Ranking films by cross-source mention count</p></div>}
      {error && <div className="text-center py-10"><p className="text-red-400 mb-2">⚠️ {error}</p><button onClick={fetchFestivals} className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-sm">Try Again</button></div>}
      {!loading && !fetched && !error && <div className="text-center py-16"><p className="text-zinc-500 text-4xl mb-4">🎪</p><p className="text-zinc-400">Click <strong>Ask Claude</strong> to search for festival selections.</p></div>}
      {!loading && fetched && Object.entries(grouped).map(([festival, festFilms]) => (
        <div key={festival} className="mb-8">
          <h3 className="text-lg font-bold text-zinc-300 mb-3">🎪 {festival} <span className="text-xs font-normal text-zinc-600">({festFilms.length})</span></h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {festFilms.map((film, i) => (
              <div key={i} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                <div className="flex justify-between items-start mb-2">
                  <div><h4 className="font-bold text-sm text-zinc-200">{film.title}</h4><p className="text-zinc-500 text-xs">{film.director}</p></div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${buzzColors[film.buzzLevel] || buzzColors.low}`}>{film.buzzLevel}</span>
                </div>
                <p className="text-zinc-500 text-xs mb-2">{film.buzzSummary}</p>
                <div className="flex flex-wrap gap-1">{(film.oscarCategories || []).map((cat) => <span key={cat} className="px-2 py-0.5 rounded-full border border-zinc-700 text-[10px] text-zinc-500">{cat}</span>)}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Precursor Tab ───
function PrecursorView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fetched, setFetched] = useState(false);

  async function fetchPrecursors() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/festival-intel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query_type: "precursors" }) });
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) throw new Error("API route not found.");
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      setData(result.data);
      setFetched(true);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div><h2 className="text-xl font-bold">Precursor Awards Tracker</h2><p className="text-zinc-500 text-sm">Guild & critics awards — strongest Oscar predictors</p></div>
        <button onClick={fetchPrecursors} disabled={loading} className="px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-400 text-sm hover:bg-zinc-800 disabled:opacity-50">{loading ? "Loading..." : "📡 Fetch Live Data"}</button>
      </div>
      {loading && <div className="text-center py-16"><div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-zinc-600 border-t-amber-500 mb-4" /><p className="text-zinc-400">Scanning Gold Derby, Variety, Deadline, IndieWire...</p><p className="text-zinc-600 text-sm mt-1">Ranking contenders by mention frequency</p></div>}
      {error && <div className="text-center py-10"><p className="text-red-400 mb-2">⚠️ {error}</p><button onClick={fetchPrecursors} className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-sm">Try Again</button></div>}
      {!loading && !fetched && !error && <div className="text-center py-16"><p className="text-zinc-500 text-4xl mb-4">🏅</p><p className="text-zinc-400">Click <strong>Ask Claude</strong> to search for precursor data.</p></div>}
      {!loading && fetched && data && data.frontrunners && Object.entries(data.frontrunners).map(([category, contenders]) => (
        <div key={category} className="mb-8">
          <h3 className="text-lg font-bold text-zinc-300 mb-4 capitalize">{category.replace(/([A-Z])/g, " $1").trim()}</h3>
          <div className="space-y-3">
            {(contenders || []).slice(0, 5).map((c, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-6 text-center text-sm">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : <span className="text-zinc-600">{i + 1}</span>}</div>
                <div className="w-48 text-sm text-zinc-300 truncate">{c.title || c.name}</div>
                <div className="flex-1"><div className="w-full h-2.5 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: Math.max(2, c.probability || 0) + "%", backgroundColor: i === 0 ? "#d4af37" : i === 1 ? "#a8a29e" : i === 2 ? "#b45309" : "#3f3f46" }} /></div></div>
                <div className="w-12 text-right text-sm font-mono text-zinc-400">{c.probability || 0}%</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Predictions Tab (fetches from Claude API, falls back to hardcoded) ───
function PredictionsView() {
  const [categories, setCategories] = useState(FALLBACK_CATEGORIES);
  const [predictions, setPredictions] = useState({});
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dataSource, setDataSource] = useState("local");
  const [ceremonyInfo, setCeremonyInfo] = useState(null);

  // Load saved predictions
  useEffect(() => {
    try {
      const saved = localStorage.getItem("oscar-user-predictions");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.picks) setPredictions(parsed.picks);
        if (parsed.locked) setLocked(parsed.locked);
      }
      // Check for cached API data
      const cached = localStorage.getItem("oscar-prediction-data");
      if (cached) {
        const parsedCache = JSON.parse(cached);
        const cacheAge = Date.now() - new Date(parsedCache.fetchedAt).getTime();
        const ONE_DAY = 24 * 60 * 60 * 1000;
        if (cacheAge < ONE_DAY && parsedCache.data?.categories) {
          setCategories(parsedCache.data.categories);
          setCeremonyInfo(parsedCache.data);
          setDataSource("api (cached)");
        }
      }
    } catch {}
  }, []);

  // Save predictions
  useEffect(() => {
    try {
      localStorage.setItem("oscar-user-predictions", JSON.stringify({ picks: predictions, locked }));
    } catch {}
  }, [predictions, locked]);

  // Fetch live data from Claude API
  async function fetchLiveData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/oscar-predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ceremony: "99th", year: 2027 }),
      });

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("API route not found. Make sure src/app/api/oscar-predictions/route.js exists.");
      }

      const result = await res.json();
      if (!result.success) throw new Error(result.error);

      if (result.data?.categories) {
        setCategories(result.data.categories);
        setCeremonyInfo(result.data);
        setDataSource("live");
        // Cache it
        localStorage.setItem("oscar-prediction-data", JSON.stringify(result));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const totalCats = categories.length;
  const totalPicked = Object.keys(predictions).length;
  const allPicked = totalCats > 0 && totalPicked === totalCats;

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold">Your Predictions</h2>
          <p className="text-zinc-500 text-sm">
            {ceremonyInfo?.ceremonyName || "99th Academy Awards"} — lock in your picks
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchLiveData}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg border border-amber-800/30 bg-amber-900/10 text-amber-400 text-sm hover:bg-amber-900/20 disabled:opacity-50"
          >
            {loading ? "Loading..." : "🔍 Fetch Live Predictions"}
          </button>
          {!locked && (
            <button
              onClick={() => allPicked && setLocked(true)}
              disabled={!allPicked}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${allPicked ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-zinc-800 text-zinc-600 cursor-not-allowed"}`}
            >
              {allPicked ? "🔒 Lock In" : "Pick " + (totalCats - totalPicked) + " more"}
            </button>
          )}
          <button onClick={() => { setPredictions({}); setLocked(false); }} className="px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-400 text-sm hover:bg-zinc-800">🔄 Reset</button>
        </div>
      </div>

      {/* Data source indicator */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2 text-xs text-zinc-600">
          <div className={`w-2 h-2 rounded-full ${dataSource === "live" ? "bg-green-500" : dataSource.includes("cached") ? "bg-amber-500" : "bg-zinc-600"}`} />
          Data: {dataSource === "live" ? "Live — Gold Derby · Variety · Deadline · IndieWire · Next Best Picture" : dataSource.includes("cached") ? "Cached from prediction feeds" : "Placeholder — click Fetch Live Predictions for real data"}
        </div>
        {ceremonyInfo?.sources && (
          <div className="text-xs text-zinc-700">
            Sources: {ceremonyInfo.sources.join(", ")}
          </div>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8 mb-6 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-zinc-600 border-t-amber-500 mb-4" />
          <p className="text-zinc-300 font-medium">Scanning prediction feeds...</p>
          <p className="text-zinc-600 text-sm mt-2">Gold Derby · Variety · Deadline · IndieWire · Next Best Picture · The Ankler</p>
          <p className="text-zinc-700 text-xs mt-1">Ranking films by how many sources are buzzing about them</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-950/30 border border-red-900/30 rounded-xl p-4 mb-6">
          <p className="text-red-400 text-sm mb-1">⚠️ {error}</p>
          <p className="text-zinc-600 text-xs">Using fallback data. Make sure your API key is set and route file exists.</p>
        </div>
      )}

      {/* Score card */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 mb-6 text-center">
        <p className="text-zinc-500 text-sm mb-2">Categories picked</p>
        <p className="text-2xl font-bold font-mono">{totalPicked} / {totalCats}</p>
        <div className="w-64 mx-auto mt-3 h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: (totalCats > 0 ? (totalPicked / totalCats) * 100 : 0) + "%" }} />
        </div>
        {locked && <p className="text-amber-400 text-sm font-medium mt-4">🔒 Predictions locked!</p>}
      </div>

      {/* Category cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {categories.map((cat) => (
          <div key={cat.id} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
            <h3 className="font-bold text-base mb-1 flex items-center gap-2">
              <span>{cat.icon}</span> {cat.name}
              {predictions[cat.id] && !locked && <span className="ml-auto text-xs text-blue-400 font-normal">✓</span>}
            </h3>

            {/* Frontrunner note */}
            {cat.frontrunner && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-amber-900/10 border border-amber-800/20">
                <p className="text-amber-400 text-xs font-medium">Frontrunner: {cat.frontrunner}</p>
                {cat.frontrunnerNote && <p className="text-zinc-600 text-[10px] mt-0.5">{cat.frontrunnerNote}</p>}
              </div>
            )}

            <div className="space-y-2">
              {(cat.nominees || []).map((nominee) => {
                const isSelected = predictions[cat.id] === nominee;
                const isFrontrunner = cat.frontrunner === nominee;
                return (
                  <button
                    key={nominee}
                    onClick={() => !locked && setPredictions((prev) => ({ ...prev, [cat.id]: nominee }))}
                    disabled={locked}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${
                      isSelected
                        ? "border-blue-500 bg-blue-500/10 text-blue-400 font-medium"
                        : isFrontrunner
                        ? "border-amber-800/30 bg-amber-900/5 text-zinc-300 hover:border-amber-700/40"
                        : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:bg-zinc-800/50"
                    } ${locked ? "cursor-default" : "cursor-pointer"}`}
                  >
                    {isFrontrunner && !isSelected && <span className="text-amber-600 mr-1">★</span>}
                    {nominee}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Dashboard ───
export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("predictions");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const tabs = [
    { id: "pipeline", label: "📋 Pipeline" },
    { id: "festivals", label: "🎪 Festivals" },
    { id: "precursors", label: "🏅 Precursors" },
    { id: "predictions", label: "🔮 Predictions" },
  ];

  const month = new Date().getMonth();
  const seasonPhase = month >= 4 && month <= 9 ? "festivals" : month >= 10 || month <= 1 ? "precursors" : "ceremony";

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold tracking-tight">🎬 Oscar Season Dashboard</h1>
          <p className="text-zinc-400 mt-2">99th Academy Awards — Tracking the 2026 Race</p>
          <div className="inline-block mt-3 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-500">
            Season phase: <span className="text-blue-400 font-medium">{seasonPhase}</span>
          </div>
        </div>

        <div className="flex justify-center gap-1 mb-8 bg-zinc-900 rounded-xl p-1 max-w-2xl mx-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "pipeline" && <PipelineView />}
        {activeTab === "festivals" && <FestivalView />}
        {activeTab === "precursors" && <PrecursorView />}
        {activeTab === "predictions" && <PredictionsView />}
      </div>
    </main>
  );
}