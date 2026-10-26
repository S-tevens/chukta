// Prints what the app recorded for one account: calls, events and messages.
//   node --env-file=.env scripts/inspect-call.mjs <account_id>
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const a = await db.account.findUniqueOrThrow({
  where: { id: process.argv[2] },
  include: { calls: true, events: { orderBy: { createdAt: "asc" } }, messages: true, plans: true, payments: true },
});
console.log({ name: a.name, status: a.status, segment: a.segment, overdue: a.overdueAmount, memory: a.memory });
for (const c of a.calls) {
  const { transcript, ...rest } = c;
  console.log("\nCALL", rest);
  console.log("TRANSCRIPT:\n" + (transcript ?? "(none)"));
}
console.log("\nEVENTS:", a.events.map((e) => `${e.createdAt.toISOString().slice(11, 19)} ${e.type} ${e.data}`).join("\n  "));
console.log("\nMESSAGES:", a.messages.length, "| PLANS:", a.plans.length, "| PAYMENTS:", a.payments.map((p) => `${p.amount}:${p.status}`).join(", "));
await db.$disconnect();
