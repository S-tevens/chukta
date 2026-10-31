import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { TryCall } from "@/components/try-call";
import { Card, Empty, Shell, Stat, outcomeLabel } from "@/components/ui";
import { bolnaConfigured } from "@/lib/bolna";
import { db } from "@/lib/db";
import { eventText } from "@/lib/event-text";
import { daysPastDue, dpdBucket, formatDateTime, parseJson, rupees } from "@/lib/format";

export const dynamic = "force-dynamic";

const LIVE = ["queued", "initiated", "ringing", "in-progress"];

export default async function Overview() {
  const [accounts, calls, paidPayments, pendingPlanPayments, events] = await Promise.all([
    db.account.findMany(),
    db.call.findMany({ include: { account: true }, orderBy: { createdAt: "desc" } }),
    db.payment.findMany({ where: { status: "PAID" } }),
    db.payment.findMany({ where: { status: "PENDING", plan: { status: "ACTIVE" } } }),
    db.event.findMany({
      where: { type: { notIn: ["account.imported", "message.queued"] } },
      include: { account: true },
      orderBy: { createdAt: "desc" },
      take: 14,
    }),
  ]);

  const overdue = accounts.filter((a) => a.status !== "PAID").reduce((s, a) => s + a.overdueAmount, 0);
  const collected = paidPayments.reduce((s, p) => s + p.amount, 0);
  const promised = pendingPlanPayments.reduce((s, p) => s + p.amount, 0);
  const finished = calls.filter((c) => c.analyzedAt);
  const connected = finished.filter((c) => c.outcome !== "no_contact");
  const resolved = connected.filter((c) => ["paid_now", "plan_agreed", "promise_to_pay"].includes(c.outcome ?? ""));
  const checked = connected.filter((c) => c.compliancePassed !== null);
  const passed = checked.filter((c) => c.compliancePassed);
  const live = calls.filter((c) => LIVE.includes(c.status));
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

  const buckets = ["Pre-due", "1–30 DPD", "31–60 DPD", "60+ DPD"].map((b) => {
    const rows = accounts.filter((a) => dpdBucket(daysPastDue(a.dueDate)) === b && a.status !== "PAID");
    return { bucket: b, count: rows.length, amount: rows.reduce((s, a) => s + a.overdueAmount, 0) };
  });
  const maxBucket = Math.max(1, ...buckets.map((b) => b.amount));

  return (
    <Shell active="overview">
      <AutoRefresh />
      {!bolnaConfigured() && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Bolna isn&apos;t connected yet. Add <code className="font-mono">BOLNA_API_KEY</code> and{" "}
          <code className="font-mono">BOLNA_AGENT_ID</code> to <code className="font-mono">.env</code> to place real calls. Until
          then, <code className="font-mono">npm run simulate</code> plays a fake call.
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Collections overview</h1>
          <p className="text-sm text-muted">AI agents calling, negotiating and collecting, live.</p>
        </div>
        <TryCall />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Overdue in portfolio" value={rupees(overdue)} hint={`${accounts.filter((a) => a.status !== "PAID").length} open accounts`} />
        <Stat label="Collected" value={rupees(collected)} hint={`${paidPayments.length} UPI payments`} />
        <Stat label="Promised in plans" value={rupees(promised)} hint={`${pendingPlanPayments.length} upcoming installments`} />
        <Stat label="Resolution rate" value={pct(resolved.length, connected.length)} hint={`${connected.length} connected calls`} />
        <Stat label="Compliance pass rate" value={pct(passed.length, checked.length)} hint="Every call audited" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card title={`Live calls (${live.length})`} className="lg:col-span-1">
          {live.length === 0 ? (
            <Empty>No calls in progress.</Empty>
          ) : (
            <ul className="space-y-2">
              {live.map((c) => (
                <li key={c.id} className="flex items-center gap-3 rounded-lg bg-brand-soft px-3 py-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand" />
                  </span>
                  <Link href={`/accounts/${c.accountId}`} className="text-sm font-medium hover:underline">
                    {c.account.name}
                  </Link>
                  <span className="ml-auto text-xs text-muted">{c.status}</span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-muted">Overdue by bucket</h3>
          <ul className="space-y-2">
            {buckets.map((b) => (
              <li key={b.bucket} className="text-sm">
                <div className="flex justify-between">
                  <span>{b.bucket}</span>
                  <span className="num text-muted">
                    {rupees(b.amount)} · {b.count}
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-stone-100">
                  <div className="h-1.5 rounded-full bg-brand" style={{ width: `${(b.amount / maxBucket) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Recent calls" className="lg:col-span-2">
          {finished.length === 0 ? (
            <Empty>No finished calls yet.</Empty>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="pb-2 font-medium">Borrower</th>
                  <th className="pb-2 font-medium">Outcome</th>
                  <th className="hidden pb-2 font-medium md:table-cell">Summary</th>
                  <th className="pb-2 font-medium">Compliance</th>
                </tr>
              </thead>
              <tbody>
                {finished.slice(0, 8).map((c) => (
                  <tr key={c.id} className="border-t border-line align-top">
                    <td className="py-2 pr-3">
                      <Link href={`/accounts/${c.accountId}`} className="font-medium hover:underline">
                        {c.account.name}
                      </Link>
                      <div className="text-xs text-muted">{formatDateTime(c.createdAt)}</div>
                    </td>
                    <td className="py-2 pr-3">{outcomeLabel(c.outcome)}</td>
                    <td className="hidden py-2 pr-3 text-muted md:table-cell">{c.summary ?? "—"}</td>
                    <td className="py-2">
                      {c.compliancePassed === null ? (
                        <span className="text-muted">—</span>
                      ) : c.compliancePassed ? (
                        <span className="text-emerald-700">✓ Passed</span>
                      ) : (
                        <span className="text-rose-700" title={parseJson<string[]>(c.complianceNotes, []).join("\n")}>
                          ✕ Flagged
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Card title="Activity" className="mt-4">
        {events.length === 0 ? (
          <Empty>Nothing yet.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-28 shrink-0 text-xs text-muted">{formatDateTime(e.createdAt)}</span>
                <Link href={`/accounts/${e.accountId}`} className="w-40 shrink-0 truncate font-medium hover:underline">
                  {e.account.name}
                </Link>
                <span className="text-muted">{eventText(e.type, e.data)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Shell>
  );
}
