import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const p = await db.payment.findUnique({ where: { id }, select: { status: true } });
  return NextResponse.json({ status: p?.status ?? "NOT_FOUND" });
}
