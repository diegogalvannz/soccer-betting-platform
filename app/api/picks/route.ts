import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const limit = parseInt(searchParams.get("limit") ?? "20");

  try {
    const picks = await prisma.pick.findMany({
      where: status ? { status: status as "PENDING" | "WON" | "LOST" | "VOID" } : {},
      include: {
        match: {
          include: {
            homeTeam: { select: { id: true, name: true, shortName: true, logo: true } },
            awayTeam: { select: { id: true, name: true, shortName: true, logo: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 50),
    });

    return NextResponse.json({ picks });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
