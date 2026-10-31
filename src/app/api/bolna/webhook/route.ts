// Bolna posts the execution payload here on every status change of a call.
import { NextResponse, type NextRequest } from "next/server";
import { authorized, findAccount } from "@/lib/agent-tools";
import { analyzeCall } from "@/lib/analyze";
import { db } from "@/lib/db";
import { logEvent } from "@/lib/events";

// Post-call analysis can call an LLM.
export const maxDuration = 30;

type Execution = {
  id?: string;
  execution_id?: string;
  status?: string;
  transcript?: string;
  conversation_duration?: number;
  total_cost?: number;
  summary?: string;
  user_number?: string;
  telephony_data?: { recording_url?: string; call_type?: string; to_number?: string; from_number?: string };
  context_details?: { recipient_data?: { account_id?: string } };
};

const DONE = new Set(["completed", "no-answer", "busy", "failed", "canceled", "error", "balance-low", "stopped"]);

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ex = (await req.json()) as Execution;
  const id = ex.id ?? ex.execution_id;
  if (!id || !ex.status) return NextResponse.json({ ok: true, ignored: true });

  let call = await db.call.findUnique({ where: { id } });
  if (!call) {
    // Inbound call, or a call started outside this app: match it by phone number.
    const knownAccountId = ex.context_details?.recipient_data?.account_id;
    const account = await findAccount(knownAccountId, ex.user_number);
    if (!account) return NextResponse.json({ ok: true, ignored: "unknown caller" });
    const direction = ex.telephony_data?.call_type ?? (knownAccountId ? "outbound" : "inbound");
    call = await db.call.create({ data: { id, accountId: account.id, status: ex.status, direction } });
    await logEvent(account.id, "call.started", { executionId: id, direction: call.direction });
  }

  call = await db.call.update({
    where: { id },
    data: {
      status: ex.status,
      transcript: ex.transcript || call.transcript,
      durationSec: Math.round(ex.conversation_duration ?? call.durationSec),
      recordingUrl: ex.telephony_data?.recording_url || call.recordingUrl,
      summary: ex.summary || call.summary,
      cost: ex.total_cost ?? call.cost,
    },
  });

  if (DONE.has(ex.status)) await analyzeCall(id);
  return NextResponse.json({ ok: true });
}
