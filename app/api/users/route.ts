import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const CreateUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  bankrollStart: z.number().min(0).default(0),
  bankrollCurrent: z.number().min(0).default(0),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = CreateUserSchema.parse(body);

    const user = await prisma.user.upsert({
      where: { id: data.id },
      update: { email: data.email },
      create: {
        id: data.id,
        email: data.email,
        bankrollStart: data.bankrollStart,
        bankrollCurrent: data.bankrollCurrent,
      },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
