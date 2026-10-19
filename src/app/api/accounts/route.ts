import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const accounts = await db.account.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(accounts);
}
