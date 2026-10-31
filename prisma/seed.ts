// Demo portfolio for a fictional lender. Phone numbers are fake (+91 90000 000xx).
// Set DEMO_PHONE in .env to add an account that rings your own phone.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const day = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * day);

const borrowers = [
  { name: "Ramesh Kumar", language: "hi", product: "Personal loan", emi: 4200, overdue: 4200, dpd: 6 },
  { name: "Sunita Devi", language: "hi", product: "Consumer durable loan", emi: 2100, overdue: 4200, dpd: 34 },
  { name: "Arjun Reddy", language: "te", product: "Two-wheeler loan", emi: 3500, overdue: 3500, dpd: 3 },
  { name: "Lakshmi Narayan", language: "kn", product: "Personal loan", emi: 6800, overdue: 13600, dpd: 41 },
  { name: "Imran Shaikh", language: "hi", product: "Business loan", emi: 12500, overdue: 37500, dpd: 78 },
  { name: "Priya Menon", language: "en", product: "Credit line", emi: 5000, overdue: 5000, dpd: -2 },
  { name: "Karthik Subramanian", language: "ta", product: "Two-wheeler loan", emi: 3100, overdue: 6200, dpd: 29 },
  { name: "Neha Gupta", language: "hi", product: "BNPL", emi: 1800, overdue: 1800, dpd: 12 },
  { name: "Suresh Patil", language: "mr", product: "Personal loan", emi: 7500, overdue: 22500, dpd: 65 },
  { name: "Ananya Das", language: "bn", product: "Consumer durable loan", emi: 2600, overdue: 2600, dpd: 9 },
  { name: "Vikram Singh", language: "hi", product: "Personal loan", emi: 9200, overdue: 18400, dpd: 52 },
  { name: "Fatima Khan", language: "hi", product: "BNPL", emi: 1500, overdue: 3000, dpd: 33 },
];

async function main() {
  await db.event.deleteMany();
  await db.message.deleteMany();
  await db.payment.deleteMany();
  await db.paymentPlan.deleteMany();
  await db.call.deleteMany();
  await db.account.deleteMany();

  const rows = borrowers.map((b, i) => ({
    name: b.name,
    phone: `+9190000000${String(i + 10).padStart(2, "0")}`,
    language: b.language,
    lenderName: "Kaveri Finance",
    loanId: `KF-${(240100 + i * 37).toString()}`,
    product: b.product,
    emiAmount: b.emi,
    overdueAmount: b.overdue,
    dueDate: daysAgo(b.dpd),
    maxInstallments: b.overdue > 10000 ? 3 : 2,
    maxDiscountPct: b.dpd >= 60 ? 15 : 0,
    callable: false,
  }));

  const demoPhone = process.env.DEMO_PHONE?.trim();
  if (demoPhone) {
    rows.unshift({
      name: process.env.DEMO_NAME?.trim() || "Demo Borrower",
      phone: demoPhone,
      language: "hi",
      lenderName: "Kaveri Finance",
      loanId: "KF-DEMO01",
      callable: true,
      product: "Personal loan",
      emiAmount: 4500,
      overdueAmount: 9000,
      dueDate: daysAgo(18),
      maxInstallments: 3,
      maxDiscountPct: 0,
    });
  }

  for (const data of rows) {
    const a = await db.account.create({ data });
    await db.event.create({ data: { accountId: a.id, type: "account.imported", data: "{}" } });
  }
  console.log(`Seeded ${rows.length} accounts${demoPhone ? " (including your demo phone)" : ""}.`);
}

main().finally(() => db.$disconnect());
