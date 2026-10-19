import type { Account } from "@prisma/client";
import { db } from "./db";
import { logEvent } from "./events";
import { daysPastDue, isoDateIST, parseJson } from "./format";
import { policyFor } from "./policy";

const BOLNA_API = "https://api.bolna.ai";

const LANGUAGE_NAMES: Record<string, string> = {
  hi: "Hindi", en: "English", kn: "Kannada", ta: "Tamil", te: "Telugu", mr: "Marathi", bn: "Bengali",
};

export function bolnaConfigured() {
  return Boolean(process.env.BOLNA_API_KEY && process.env.BOLNA_AGENT_ID);
}

/** Values filled into the {variables} of the agent prompt for this call. */
export function callVariables(a: Account) {
  const p = policyFor(a);
  return {
    account_id: a.id,
    customer_name: a.name,
    first_name: a.name.split(" ")[0],
    preferred_language: LANGUAGE_NAMES[a.language] ?? "Hindi",
    lender_name: a.lenderName,
    loan_id: a.loanId,
    product: a.product,
    overdue_amount: String(a.overdueAmount),
    emi_amount: String(a.emiAmount),
    due_date: isoDateIST(a.dueDate),
    days_past_due: String(daysPastDue(a.dueDate)),
    max_installments: String(p.maxInstallments),
    latest_plan_date: p.latestDueDate,
    max_discount_pct: String(p.maxDiscountPct),
    min_first_payment: String(p.minFirstPayment),
    memory: parseJson<string[]>(a.memory, []).join("; ") || "No previous conversations.",
    today: isoDateIST(new Date()),
  };
}

/** Places an outbound call through Bolna and records it. */
export async function startCall(a: Account) {
  const body: Record<string, unknown> = {
    agent_id: process.env.BOLNA_AGENT_ID,
    recipient_phone_number: a.phone,
    user_data: callVariables(a),
  };
  if (process.env.BOLNA_FROM_NUMBER) body.from_phone_number = process.env.BOLNA_FROM_NUMBER;

  const res = await fetch(`${BOLNA_API}/call`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.BOLNA_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { execution_id?: string; status?: string; message?: string };
  if (!res.ok || !data.execution_id) {
    throw new Error(`Bolna call failed (${res.status}): ${data.message ?? JSON.stringify(data)}`);
  }

  await db.call.create({ data: { id: data.execution_id, accountId: a.id, status: data.status ?? "queued" } });
  await logEvent(a.id, "call.started", { executionId: data.execution_id });
  return data.execution_id;
}
