import { db } from "./db";
import { logEvent } from "./events";
import { ruleBasedCompliance } from "./compliance";
import { parseJson } from "./format";

const NO_CONTACT = new Set(["no-answer", "busy", "failed", "canceled", "error", "balance-low", "stopped"]);

type LlmAnalysis = {
  summary: string;
  sentiment: "positive" | "neutral" | "negative";
  segment: "forgetful" | "cash_crunch" | "dispute" | "unwilling" | "unknown";
  refused: boolean;
  memory_facts: string[];
  compliance_issues: string[];
};

async function llmAnalysis(transcript: string): Promise<LlmAnalysis | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You review debt collection calls made by an AI agent for an Indian lender. The transcript may be in Hindi, English or a mix. " +
            "Return JSON with: summary (2 sentences, English), sentiment (positive|neutral|negative, of the borrower), " +
            "segment (forgetful = just forgot, cash_crunch = wants to pay but short of money, dispute = says amount is wrong or not theirs, unwilling = refuses, unknown), " +
            "refused (true if the borrower clearly refused to pay), memory_facts (up to 3 short facts useful on the next call, e.g. 'Salary comes on the 7th'), " +
            "compliance_issues (anything the AGENT did that breaks RBI fair-practice rules: threats, rudeness, contacting third parties, disclosing the debt to someone other than the borrower, not disclosing it is an AI or that the call is recorded). Empty array if none.",
        },
        { role: "user", content: transcript.slice(0, 20000) },
      ],
    }),
  });
  if (!res.ok) {
    console.error("LLM analysis failed", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  return parseJson<LlmAnalysis | null>(data.choices?.[0]?.message?.content, null);
}

/** Runs once per finished call: decides the outcome, checks compliance and updates the account. */
export async function analyzeCall(callId: string) {
  const call = await db.call.findUnique({ where: { id: callId }, include: { account: true } });
  if (!call || call.analyzedAt) return;
  const account = call.account;

  if (NO_CONTACT.has(call.status)) {
    const failures = await db.call.count({ where: { accountId: account.id, outcome: "no_contact" } });
    await db.call.update({ where: { id: callId }, data: { outcome: "no_contact", analyzedAt: new Date() } });
    if (account.status === "NEW" && failures + 1 >= 3) {
      await db.account.update({ where: { id: account.id }, data: { status: "UNREACHABLE" } });
    }
    await logEvent(account.id, "call.no_contact", { callId, status: call.status });
    return;
  }

  // Tool calls made during the call are the most reliable record of what was agreed.
  const during = await db.event.findMany({ where: { accountId: account.id, createdAt: { gte: call.createdAt } } });
  const types = new Set(during.map((e) => e.type));
  const transcript = call.transcript ?? "";
  const llm = transcript ? await llmAnalysis(transcript) : null;

  let outcome = "no_commitment";
  if (types.has("contact.wrong_person")) outcome = "wrong_person";
  else if (types.has("dispute.flagged")) outcome = "dispute";
  else if (types.has("payment.received")) outcome = "paid_now";
  else if (types.has("plan.created")) outcome = "plan_agreed";
  else if (types.has("callback.scheduled")) outcome = "callback";
  else if (types.has("payment.link_sent")) outcome = "promise_to_pay";
  else if (llm?.refused) outcome = "refused";

  const rules = ruleBasedCompliance(transcript);
  const complianceNotes = [...rules.notes, ...(llm?.compliance_issues ?? [])];
  const memory = [...parseJson<string[]>(account.memory, []), ...(llm?.memory_facts ?? [])].slice(-8);

  await db.call.update({
    where: { id: callId },
    data: {
      outcome,
      summary: llm?.summary ?? call.summary,
      sentiment: llm?.sentiment ?? null,
      compliancePassed: complianceNotes.length === 0,
      complianceNotes: JSON.stringify(complianceNotes),
      analyzedAt: new Date(),
    },
  });

  const fresh = await db.account.findUniqueOrThrow({ where: { id: account.id } });
  const segment =
    outcome === "dispute" ? "dispute" : outcome === "refused" ? "unwilling" : llm?.segment && llm.segment !== "unknown" ? llm.segment : fresh.segment;
  await db.account.update({
    where: { id: account.id },
    data: {
      memory: JSON.stringify(memory),
      segment,
      status: fresh.status === "NEW" || fresh.status === "UNREACHABLE" ? "CONTACTED" : fresh.status,
    },
  });
  await logEvent(account.id, "call.analyzed", { callId, outcome, compliancePassed: complianceNotes.length === 0 });
}
