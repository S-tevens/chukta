import { db } from "./db";
import { logEvent, queueWhatsApp } from "./events";
import { rupees } from "./format";

/** Records a payment as received and updates the account and its plan. */
export async function markPaid(paymentId: string, method = "upi") {
  const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { account: true } });
  if (!payment || payment.status === "PAID") return payment;

  const paid = await db.payment.update({ where: { id: paymentId }, data: { status: "PAID", paidAt: new Date() } });
  const remaining = Math.max(0, payment.account.overdueAmount - payment.amount);
  await db.account.update({
    where: { id: payment.accountId },
    data: { overdueAmount: remaining, status: remaining === 0 ? "PAID" : payment.planId ? "PROMISED" : payment.account.status },
  });

  if (payment.planId) {
    const open = await db.payment.count({ where: { planId: payment.planId, status: { not: "PAID" } } });
    if (open === 0) await db.paymentPlan.update({ where: { id: payment.planId }, data: { status: "COMPLETED" } });
  }

  await logEvent(payment.accountId, "payment.received", { paymentId, amount: payment.amount, method });
  await queueWhatsApp(
    payment.accountId,
    `Thank you ${payment.account.name.split(" ")[0]}! We received ${rupees(payment.amount)} for loan ${payment.account.loanId}. ` +
      (remaining === 0 ? "Your overdue amount is now fully cleared. 🎉" : `Remaining overdue: ${rupees(remaining)}.`),
  );
  return paid;
}
