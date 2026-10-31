// Dashboard action: call one account, or a list of accounts (a campaign).
import { NextResponse, type NextRequest } from "next/server";
import { bolnaConfigured, startCall } from "@/lib/bolna";
import { preCallCheck } from "@/lib/compliance";
import { db } from "@/lib/db";
import { logEvent } from "@/lib/events";

export async function POST(req: NextRequest) {
  if (!bolnaConfigured()) {
    return NextResponse.json({ error: "Set BOLNA_API_KEY and BOLNA_AGENT_ID in .env first." }, { status: 400 });
  }
  const body = (await req.json()) as { accountIds: string[]; override?: boolean };
  // Overriding the calling rules is off on the public deployment.
  const override = body.override && process.env.ALLOW_CALL_OVERRIDE === "true";
  const accountIds = body.accountIds;
  const accounts = await db.account.findMany({ where: { id: { in: accountIds ?? [] } } });

  const results = [];
  for (const a of accounts) {
    if (!a.callable) {
      results.push({ accountId: a.id, name: a.name, ok: false, reasons: ["Sample account with a made-up number. Use Start calling to try it on your own phone"] });
      continue;
    }
    const blocked = await preCallCheck(a);
    if (blocked.length && !override) {
      await logEvent(a.id, "call.blocked", { reasons: blocked });
      results.push({ accountId: a.id, name: a.name, ok: false, reasons: blocked });
      continue;
    }
    if (blocked.length) await logEvent(a.id, "call.override", { reasons: blocked });
    try {
      const executionId = await startCall(a);
      results.push({ accountId: a.id, name: a.name, ok: true, executionId });
    } catch (err) {
      results.push({ accountId: a.id, name: a.name, ok: false, reasons: [(err as Error).message] });
    }
  }
  return NextResponse.json({ results });
}
