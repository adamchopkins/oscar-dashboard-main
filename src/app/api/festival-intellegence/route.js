import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request) {
  const { query_type = "festivals" } = await request.json();

  try {
    let prompt;

    if (query_type === "festivals") {
      prompt = `Search the web for films generating Oscar buzz for the next Academy Awards. Look for official festival selections (Cannes, Venice, TIFF, Telluride, Sundance) and films in production from past Oscar nominees/winners.

Return ONLY a valid JSON array. Each object:
{"title":"Film Title","director":"Director Name","cast":["Actor 1","Actor 2"],"festival":"Venice 2025" or null,"festivalSection":"Competition" or null,"distributor":"A24" or null,"releaseWindow":"Q4 2025" or "TBD","buzzLevel":"high" or "medium" or "low","buzzSummary":"One sentence","oscarCategories":["Best Picture","Best Director"]}

Return 15-20 films. ONLY the JSON array, no other text.`;
    } else if (query_type === "precursors") {
      prompt = `Search the web for the latest Oscar precursor awards data. Track: Golden Globes, Critics Choice, SAG Awards, DGA, PGA, BAFTA, WGA.

Return ONLY valid JSON:
{"season":"2025-2026","precursors":[{"name":"Golden Globes","status":"complete" or "nominees_announced" or "upcoming","date":"January 5, 2026","categories":{}}],"frontrunners":{"bestPicture":[{"title":"Film","precursorWins":3,"precursorNoms":6,"probability":72}],"bestDirector":[...],"bestActor":[...],"bestActress":[...],"bestSupportingActor":[...],"bestSupportingActress":[...]}}

ONLY the JSON, nothing else.`;
    }

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: prompt }],
    });

    const textBlocks = message.content.filter((b) => b.type === "text");
    const responseText = textBlocks.map((b) => b.text).join("");
    const cleaned = responseText
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    const data = JSON.parse(cleaned);

    return NextResponse.json({
      success: true,
      queryType: query_type,
      data,
    });
  } catch (error) {
    console.error("Festival intel error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}