import type { Account } from "@prisma/client";
import { daysPastDue, isoDateIST } from "./format";

export type Installment = { amount: number; dueDate: string };

// Negotiation rules the agent must stay inside. A lender would configure these per portfolio.
const MAX_PLAN_DAYS = 45; // last installment within 45 days
const MIN_FIRST_PCT = 20; // first installment at least 20% of the amount owed
const MIN_DISCOUNT_DPD = 60; // discounts only for accounts 60+ days past due

export function policyFor(account: Account, now = new Date()) {
  const dpd = daysPastDue(account.dueDate, now);
  const maxDiscountPct = dpd >= MIN_DISCOUNT_DPD ? account.maxDiscountPct : 0;
  const latest = new Date(now.getTime() + MAX_PLAN_DAYS * 86_400_000);
  return {
    dpd,
    maxInstallments: account.maxInstallments,
    maxDiscountPct,
    minFirstPayment: Math.ceil((account.overdueAmount * MIN_FIRST_PCT) / 100),
    latestDueDate: isoDateIST(latest),
  };
}

/** Validates a proposed plan. Returns errors the agent can read back to the borrower. */
export function validatePlan(account: Account, schedule: Installment[], discountPct: number, now = new Date()) {
  const p = policyFor(account, now);
  const errors: string[] = [];
  const today = isoDateIST(now);

  if (schedule.length === 0) errors.push("The plan needs at least one payment.");
  if (schedule.length > p.maxInstallments) errors.push(`At most ${p.maxInstallments} installments are allowed.`);
  if (discountPct > p.maxDiscountPct) {
    errors.push(p.maxDiscountPct === 0 ? "No discount is available on this account." : `The maximum discount is ${p.maxDiscountPct}%.`);
  }
  const owed = Math.round(account.overdueAmount * (1 - discountPct / 100));
  const total = schedule.reduce((s, i) => s + i.amount, 0);
  if (total < owed) errors.push(`The installments add up to ₹${total}, but ₹${owed} is owed.`);
  for (const [n, inst] of schedule.entries()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inst.dueDate)) errors.push(`Installment ${n + 1} needs a date as YYYY-MM-DD.`);
    else if (inst.dueDate < today) errors.push(`Installment ${n + 1} is dated in the past.`);
    else if (inst.dueDate > p.latestDueDate) errors.push(`All payments must be done by ${p.latestDueDate}.`);
    if (inst.amount <= 0) errors.push(`Installment ${n + 1} must be more than zero.`);
  }
  const minFirst = Math.ceil((owed * MIN_FIRST_PCT) / 100);
  if (schedule[0] && schedule[0].amount < minFirst) {
    errors.push(`The first payment must be at least ₹${minFirst}.`);
  }
  return { ok: errors.length === 0, errors, owed, total, policy: p };
}
