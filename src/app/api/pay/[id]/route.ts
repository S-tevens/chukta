// Demo payment confirmation. Replace with a Razorpay/Cashfree payment webhook for real UPI payments.
import { NextResponse, type NextRequest } from "next/server";
import { markPaid } from "@/lib/payments";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const payment = await markPaid(id, "upi-demo");
  if (!payment) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, status: payment.status });
}
