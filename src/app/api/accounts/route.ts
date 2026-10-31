import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const accounts = await db.account.findMany({ orderBy: { createdAt: "asc" } });
  // Public endpoint: never expose phone numbers.
  return NextResponse.json(accounts.map(({ phone, ...a }) => ({ ...a, phoneLast4: phone.slice(-4) })));
}
