// Public "try it" call: a visitor enters their own number and Priya calls them about a demo loan.
import { NextResponse, type NextRequest } from "next/server";
import { bolnaConfigured, startCall } from "@/lib/bolna";
import { preCallCheck } from "@/lib/compliance";
import { db } from "@/lib/db";
import { logEvent } from "@/lib/events";

// Protects the Bolna wallet: total try-it calls allowed in any 24 hours.
const DAILY_LIMIT = Number(process.env.TRY_DAILY_LIMIT || 20);
const DEMO_LOAN = { lenderName: "Kaveri Finance", product: "Personal loan", emiAmount: 4500, overdueAmount: 9000, maxInstallments: 3, maxDiscountPct: 0 };

/** Accepts 98765 43210, 098765..., +91 98765 43210; returns +919876543210 or null. */
function indianMobile(input: string) {
  const digits = input.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

export async function POST(req: NextRequest) {
  if (!bolnaConfigured()) return NextResponse.json({ error: "Calling is not set up on this server." }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { name?: string; phone?: string; language?: string };
  const name = (body.name ?? "").trim().slice(0, 40);
  const phone = indianMobile(body.phone ?? "");
  const language = body.language === "en" ? "en" : "hi";
  if (!name) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  if (!phone) return NextResponse.json({ error: "Enter a 10-digit Indian mobile number." }, { status: 400 });

  const since = new Date(Date.now() - 24 * 3_600_000);
  const today = await db.call.count({ where: { createdAt: { gte: since }, account: { callable: true } } });
  if (today >= DAILY_LIMIT) {
    return NextResponse.json({ error: "Today's demo calls are used up. Please try again tomorrow." }, { status: 429 });
  }

  // Each try starts from a fresh overdue loan; past calls and memory stay on the account.
  const fresh = { name, language, status: "NEW", dueDate: new Date(Date.now() - 18 * 86_400_000), nextActionAt: null, ...DEMO_LOAN };
  const account = await db.account.upsert({
    where: { phone },
    update: { ...fresh, callable: true },
    create: { ...fresh, phone, callable: true, loanId: `KF-T${phone.slice(-6)}` },
  });
  if (!(await db.event.count({ where: { accountId: account.id } }))) await logEvent(account.id, "account.imported");

  const blocked = await preCallCheck(account);
  if (blocked.length) {
    await logEvent(account.id, "call.blocked", { reasons: blocked });
    return NextResponse.json({ error: `${blocked.join(". ")}.`, accountId: account.id }, { status: 409 });
  }
  try {
    await startCall(account);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message, accountId: account.id }, { status: 502 });
  }
  return NextResponse.json({ ok: true, accountId: account.id });
}
