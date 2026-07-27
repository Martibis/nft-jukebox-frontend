import { NextResponse } from "next/server";
import { getStageState } from "@/lib/stageState";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // cold build fetches metadata + history

// Full play history, served from the same shared cache as /api/now-playing.
// It only changes when the stage changes hands, which the cache detects
// with its cheap startBlock() probe.

export async function GET() {
  try {
    const { plays } = await getStageState();
    return NextResponse.json(plays, {
      headers: {
        "Cache-Control": "public, s-maxage=12, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("plays failed:", error);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
