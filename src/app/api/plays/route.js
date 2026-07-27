import { NextResponse } from "next/server";
import { getStageState } from "@/lib/stageState";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // cold build fetches metadata + history

// Full play history, served from the same shared cache as /api/now-playing.
// It only changes when the stage changes hands, which the cache detects
// with its cheap startBlock() probe.

export async function GET(request) {
  // fresh=1: right after a stage change — make sure the state is current
  // and skip the CDN cache on the way back.
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  try {
    const { plays } = await getStageState({ fresh });
    return NextResponse.json(plays, {
      headers: {
        "Cache-Control": fresh
          ? "no-store"
          : "public, s-maxage=12, stale-while-revalidate=120",
      },
    });
  } catch (error) {
    console.error("plays failed:", error);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
