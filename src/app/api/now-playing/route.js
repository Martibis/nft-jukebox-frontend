import { NextResponse } from "next/server";
import { getStageState } from "@/lib/stageState";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // cold build fetches metadata + history

// The piece currently on stage, served from the shared server-side cache
// (see lib/stageState.js). The chain is probed at most every ~4s total,
// regardless of visitor count; the CDN absorbs everything else.

export async function GET(request) {
  // fresh=1: used right after a confirmed play — probe the chain now
  // (rate-limited server-side) and skip the CDN cache on the way back.
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  try {
    const { nowPlaying, currentBlock } = await getStageState({ fresh });
    return NextResponse.json(
      { ...nowPlaying, currentBlock },
      {
        headers: {
          "Cache-Control": fresh
            ? "no-store"
            : "public, s-maxage=4, stale-while-revalidate=300",
        },
      }
    );
  } catch (error) {
    console.error("now-playing failed:", error);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
