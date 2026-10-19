// Custom function endpoints the Bolna agent calls during a live call.
// Every response carries a `message` written for the LLM to act on.
import { NextResponse, type NextRequest } from "next/server";
import type { Account } from "@prisma/client";
import { agentTool } from "@/lib/agent-tools";
import { db } from "@/lib/db";
import { logEvent, paymentLink, queueWhatsApp } from "@/lib/events";
import { daysPastDue, formatDate, parseJson, rupees } from "@/lib/format";
import { policyFor, validatePlan, type Installment } from "@/lib/policy";

type Args = Record<string, string>;

const last4 = (a: Account) => a.phone.slice(-4);
const noonIST = (isoDate: string) => new Date(`${isoDate}T12:00:00+05:30`);

async function lookupAccount(_args: Args, a: Account) {
  const p = policyFor(a);
  const plan = await db.paymentPlan.findFirst({ where: { accountId: a.id, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
  return {
    ok: true,
    account_id: a.id,
    name: a.name,
    lender: a.lenderName,
    loan_id: a.loanId,
    product: a.product,
    overdue_amount: a.overdueAmount,
    emi_amount: a.emiAmount,
    days_past_due: daysPastDue(a.dueDate),
    status: a.status,
    policy: p,
    active_plan: plan ? parseJson<Installment[]>(plan.schedule, []) : null,
    memory: parseJson<string[]>(a.memory, []),
    message: `Account found for ${a.name}. Verify identity before sharing any loan details.`,
  };
}

async function sendPaymentLink(args: Args, a: Account) {
  const amount = parseInt(args.amount?.replace(/[^\d]/g, "") || "", 10) || a.overdueAmount;
  if (amount > a.overdueAmount) {
    return { ok: false, message: `The most they owe is ${a.overdueAmount} rupees. Use that amount or less.` };
  }
  const payment = await db.payment.create({ data: { accountId: a.id, amount } });
  await queueWhatsApp(
    a.id,
    `Hi ${a.name.split(" ")[0]}, here is your secure UPI payment link for ${rupees(amount)} towards ${a.lenderName} loan ${a.loanId}: ${paymentLink(payment.id)}`,
  );
  await logEvent(a.id, "payment.link_sent", { paymentId: payment.id, amount });
  return {
    ok: true,
    payment_id: payment.id,
    message: `A UPI payment link for ${amount} rupees was sent on WhatsApp to the number ending ${last4(a)}. Ask them to open it and pay now while you stay on the line, then use check_payment_status.`,
  };
}

/** Accepts "2026-10-25:3000, 2026-11-10:3000" or "3000 on 2026-10-25; 3000 on 2026-11-10". */
function parsePlan(text: string): Installment[] {
  return text
    .split(/[,;\n]+/)
    .map((part) => {
      const date = part.match(/\d{4}-\d{2}-\d{2}/)?.[0];
      const amount = parseInt(part.replace(date ?? "", "").replace(/[^\d]/g, ""), 10);
      return date && amount ? { dueDate: date, amount } : null;
    })
    .filter((x): x is Installment => x !== null)
    .sort((x, y) => x.dueDate.localeCompare(y.dueDate));
}

async function createPaymentPlan(args: Args, a: Account) {
  const schedule = parsePlan(args.plan ?? "");
  const discountPct = parseInt(args.discount_pct || "0", 10) || 0;
  const check = validatePlan(a, schedule, discountPct);
  if (!check.ok) {
    const p = check.policy;
    return {
      ok: false,
      message:
        `That plan is not allowed: ${check.errors.join(" ")} ` +
        `Rules: up to ${p.maxInstallments} payments, all by ${p.latestDueDate}, first payment at least ${Math.ceil(check.owed * 0.2)} rupees` +
        (p.maxDiscountPct ? `, discount up to ${p.maxDiscountPct}%` : ", no discount") +
        ". Suggest a plan inside these rules.",
    };
  }

  await db.paymentPlan.updateMany({ where: { accountId: a.id, status: "ACTIVE" }, data: { status: "REPLACED" } });
  const plan = await db.paymentPlan.create({
    data: {
      accountId: a.id,
      schedule: JSON.stringify(schedule),
      total: check.total,
      discountPct,
      payments: { create: schedule.map((i) => ({ accountId: a.id, amount: i.amount, dueDate: noonIST(i.dueDate) })) },
    },
    include: { payments: { orderBy: { dueDate: "asc" } } },
  });
  if (discountPct > 0) await db.account.update({ where: { id: a.id }, data: { overdueAmount: check.owed } });
  await db.account.update({
    where: { id: a.id },
    data: { status: "PROMISED", nextActionAt: noonIST(schedule[0].dueDate) },
  });

  const first = plan.payments[0];
  const lines = schedule.map((i, n) => `${n + 1}. ${rupees(i.amount)} by ${formatDate(i.dueDate)}`).join("\n");
  await queueWhatsApp(
    a.id,
    `Hi ${a.name.split(" ")[0]}, your payment plan with ${a.lenderName} is confirmed:\n${lines}` +
      (discountPct ? `\n(${discountPct}% discount applied)` : "") +
      `\nPay the first installment here: ${paymentLink(first.id)}`,
  );
  await logEvent(a.id, "plan.created", { planId: plan.id, schedule, discountPct });
  return {
    ok: true,
    plan_id: plan.id,
    message: `Plan saved and confirmation sent on WhatsApp with a link for the first payment of ${first.amount} rupees. Read the dates back to them once, and ask if they can pay the first one now.`,
  };
}

async function checkPaymentStatus(_args: Args, a: Account) {
  const since = new Date(Date.now() - 60 * 60_000);
  const paid = await db.payment.findFirst({
    where: { accountId: a.id, status: "PAID", paidAt: { gte: since } },
    orderBy: { paidAt: "desc" },
  });
  if (paid) {
    const fresh = await db.account.findUniqueOrThrow({ where: { id: a.id } });
    return {
      ok: true,
      paid: true,
      message: `Payment of ${paid.amount} rupees received. Remaining overdue: ${fresh.overdueAmount} rupees. Thank them warmly.`,
    };
  }
  return {
    ok: true,
    paid: false,
    message: "No payment received yet. If they are paying, wait a moment and check again; otherwise confirm when they will pay.",
  };
}

async function flagDispute(args: Args, a: Account) {
  await db.account.update({ where: { id: a.id }, data: { status: "DISPUTE", segment: "dispute" } });
  await logEvent(a.id, "dispute.flagged", { reason: args.reason ?? "" });
  return {
    ok: true,
    message: "Dispute recorded. Collection calls are paused. Tell them a person from the lender's team will review it and contact them within 2 working days. Do not ask for payment again on this call.",
  };
}

async function scheduleCallback(args: Args, a: Account) {
  const when = new Date((args.when ?? "").replace(" ", "T") + (/[+Z]/.test(args.when ?? "") ? "" : "+05:30"));
  if (isNaN(when.getTime()) || when < new Date()) {
    return { ok: false, message: "Ask for a future date and time, as YYYY-MM-DD HH:MM." };
  }
  const hour = Number(when.toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  if (hour < 8 || hour >= 19) {
    return { ok: false, message: "Callbacks can only be between 8 AM and 7 PM. Ask for a time in that window." };
  }
  await db.account.update({ where: { id: a.id }, data: { status: "CALLBACK", nextActionAt: when } });
  await logEvent(a.id, "callback.scheduled", { when: when.toISOString(), reason: args.reason ?? "" });
  return { ok: true, message: `Callback booked. Confirm the time with them and end the call politely.` };
}

async function markWrongPerson(_args: Args, a: Account) {
  await db.account.update({ where: { id: a.id }, data: { status: "WRONG_PERSON" } });
  await logEvent(a.id, "contact.wrong_person");
  return { ok: true, message: "Apologise for the trouble and end the call. Do not mention the loan or the lender's reason for calling." };
}

const tools: Record<string, (args: Args, a: Account) => Promise<object>> = {
  lookup_account: lookupAccount,
  send_payment_link: sendPaymentLink,
  create_payment_plan: createPaymentPlan,
  check_payment_status: checkPaymentStatus,
  flag_dispute: flagDispute,
  schedule_callback: scheduleCallback,
  mark_wrong_person: markWrongPerson,
};

async function handle(req: NextRequest, ctx: { params: Promise<{ tool: string }> }) {
  const { tool } = await ctx.params;
  const fn = tools[tool];
  if (!fn) return NextResponse.json({ error: `unknown tool ${tool}` }, { status: 404 });
  return agentTool(fn)(req);
}

export { handle as GET, handle as POST };
