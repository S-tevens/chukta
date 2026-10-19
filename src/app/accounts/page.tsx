import { AccountsTable, type AccountRow } from "@/components/accounts-table";
import { AutoRefresh } from "@/components/auto-refresh";
import { Shell } from "@/components/ui";
import { db } from "@/lib/db";
import { daysPastDue, dpdBucket, formatDateTime, rupees } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const accounts = await db.account.findMany({
    include: { calls: { where: { analyzedAt: { not: null } }, orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { dueDate: "asc" },
  });

  const rows: AccountRow[] = accounts.map((a) => {
    const dpd = daysPastDue(a.dueDate);
    return {
      id: a.id,
      name: a.name,
      loanId: a.loanId,
      product: a.product,
      language: a.language,
      overdue: rupees(a.overdueAmount),
      dpd,
      bucket: dpdBucket(dpd),
      status: a.status,
      segment: a.segment,
      lastOutcome: a.calls[0]?.outcome ?? null,
      nextAction: a.nextActionAt ? formatDateTime(a.nextActionAt) : null,
    };
  });

  return (
    <Shell active="accounts">
      <AutoRefresh ms={4000} />
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <p className="text-sm text-muted">
          Calls only go out between 8 AM and 7 PM IST, and never to accounts that are paid, disputed or marked wrong person.
        </p>
      </div>
      <AccountsTable rows={rows} />
    </Shell>
  );
}
