import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { calculateProfit } from "@/lib/utils";

const CreateBetSchema = z.object({
  pickId: z.string().uuid(),
  userId: z.string().uuid(),
  stake: z.number().positive().max(10000),
  odds: z.number().min(1.01),
});

const SettleBetSchema = z.object({
  betId: z.string().uuid(),
  result: z.enum(["WON", "LOST", "VOID"]),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  try {
    const bets = await prisma.bet.findMany({
      where: { userId },
      include: {
        pick: {
          include: {
            match: {
              include: {
                homeTeam: { select: { name: true, logo: true } },
                awayTeam: { select: { name: true, logo: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ bets });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = CreateBetSchema.parse(body);

    const pick = await prisma.pick.findUnique({ where: { id: data.pickId } });
    if (!pick) {
      return NextResponse.json({ error: "Pick not found" }, { status: 404 });
    }

    const bet = await prisma.bet.create({
      data: {
        userId: data.userId,
        pickId: data.pickId,
        stake: data.stake,
        odds: data.odds,
        result: "PENDING",
      },
    });

    return NextResponse.json({ bet }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const data = SettleBetSchema.parse(body);

    const bet = await prisma.bet.findUnique({ where: { id: data.betId } });
    if (!bet) {
      return NextResponse.json({ error: "Bet not found" }, { status: 404 });
    }

    const profit =
      data.result === "WON"
        ? calculateProfit(bet.stake, bet.odds)
        : data.result === "VOID"
        ? 0
        : -bet.stake;

    const [updatedBet] = await prisma.$transaction([
      prisma.bet.update({
        where: { id: data.betId },
        data: { result: data.result, profit, settledAt: new Date() },
      }),
      prisma.pick.update({
        where: { id: bet.pickId },
        data: { status: data.result === "VOID" ? "VOID" : data.result },
      }),
      prisma.user.update({
        where: { id: bet.userId },
        data: { bankrollCurrent: { increment: profit } },
      }),
    ]);

    return NextResponse.json({ bet: updatedBet });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
