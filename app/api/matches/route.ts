import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const leagueCode = searchParams.get("league");
  const limit = parseInt(searchParams.get("limit") ?? "20");

  try {
    const matches = await prisma.match.findMany({
      where: {
        ...(status ? { status: status as "SCHEDULED" | "FINISHED" | "LIVE" } : {}),
        ...(leagueCode ? { leagueCode } : {}),
      },
      include: {
        homeTeam: { select: { id: true, name: true, shortName: true, logo: true } },
        awayTeam: { select: { id: true, name: true, shortName: true, logo: true } },
        picks: { select: { id: true, status: true, confidenceScore: true, market: true, selection: true, americanOdds: true } },
      },
      orderBy: { matchDate: "asc" },
      take: Math.min(limit, 50),
    });

    return NextResponse.json({ matches });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
