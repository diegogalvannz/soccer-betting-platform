import { NextResponse } from "next/server";
import { generatePicks } from "@/modules/engine/picker";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[Cron] Starting pick generation...");
    const result = await generatePicks();
    console.log("[Cron] Pick generation complete:", result);

    return NextResponse.json({
      success: true,
      generated: result.generated,
      skipped: result.skipped,
      errors: result.errors,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Cron] Pick generation failed:", err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
