import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { CallButton } from "@/components/call-button";
import { Elapsed } from "@/components/elapsed";
import { Card, Empty, Shell, StatusBadge, outcomeLabel } from "@/components/ui";
import { db } from "@/lib/db";
import { eventText } from "@/lib/event-text";
import { daysPastDue, formatDate, formatDateTime, parseJson, rupees } from "@/lib/format";
import { policyFor, type Installment } from "@/lib/policy";

export const dynamic = "force-dynamic";

const LIVE = ["queued", "initiated", "ringing", "in-progress"];
const LIVE_LABEL: Record<string, string> = { queued: "Dialling", initiated: "Dialling", ringing: "Ringing", "in-progress": "On the call" };

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await db.account.findUnique({
    where: { id },
    include: {
      calls: { orderBy: { createdAt: "desc" } },
      plans: { orderBy: { createdAt: "desc" }, include: { payments: { orderBy: { dueDate: "asc" } } } },
      payments: { orderBy: { createdAt: "desc" } },
      messages: { orderBy: { createdAt: "desc" } },
      events: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!a) notFound();

  const p = policyFor(a);
  const memory = parseJson<string[]>(a.memory, []);
  const plan = a.plans.find((x) => x.status === "ACTIVE");
  const liveCall = a.calls.find((c) => LIVE.includes(c.status));
  const liveEvents = liveCall ? a.events.filter((e) => e.createdAt >= liveCall.createdAt && !["call.started", "message.queued"].includes(e.type)).reverse() : [];
  // The dashboard is public, so never show the full number.
  const maskedPhone = `+91 ••••• •${a.phone.slice(-4)}`;

  return (
    <Shell active="accounts">
      <AutoRefresh />
      <Link href="/accounts" className="text-sm text-muted hover:text-foreground">
        ← Accounts
      </Link>
      <div className="mb-6 mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{a.name}</h1>
            <StatusBadge status={a.status} />
          </div>
          <p className="text-sm text-muted">
            {a.lenderName} · {a.product} · {a.loanId} · {maskedPhone}
          </p>
        </div>
        {a.callable && !liveCall && !["PAID", "DISPUTE", "WRONG_PERSON"].includes(a.status) && <CallButton accountIds={[a.id]} label="Call now" />}
      </div>

      {liveCall && (
        <section className="mb-4 rounded-xl border border-brand/30 bg-brand-soft p-4">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-brand" />
            </span>
            <span className="font-semibold text-brand">{LIVE_LABEL[liveCall.status] ?? liveCall.status}</span>
            <span className="text-sm text-muted">Priya (AI agent) · {maskedPhone}</span>
            <span className="ml-auto text-lg font-semibold text-brand">
              <Elapsed since={liveCall.createdAt.toISOString()} />
            </span>
          </div>
          {liveEvents.length > 0 ? (
            <ol className="mt-3 space-y-1.5 border-l-2 border-brand/30 pl-4 text-sm">
              {liveEvents.map((e) => (
                <li key={e.id}>
                  <span className="mr-2 text-xs text-muted">{formatDateTime(e.createdAt).split(", ").pop()}</span>
                  {eventText(e.type, e.data)}
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-muted">Agent actions appear here as they happen.</p>
          )}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card title="Account">
            <dl className="grid grid-cols-2 gap-y-3 text-sm">
              <dt className="text-muted">Overdue</dt>
              <dd className="num text-right text-lg font-semibold">{rupees(a.overdueAmount)}</dd>
              <dt className="text-muted">EMI</dt>
              <dd className="num text-right">{rupees(a.emiAmount)}</dd>
              <dt className="text-muted">Due date</dt>
              <dd className="text-right">
                {formatDate(a.dueDate)} ({daysPastDue(a.dueDate)}d)
              </dd>
              <dt className="text-muted">Language</dt>
              <dd className="text-right uppercase">{a.language}</dd>
              <dt className="text-muted">Segment</dt>
              <dd className="text-right">{a.segment.replace("_", " ")}</dd>
              {a.nextActionAt && (
                <>
                  <dt className="text-muted">Next action</dt>
                  <dd className="text-right">{formatDateTime(a.nextActionAt)}</dd>
                </>
              )}
            </dl>
          </Card>

          {a.payments.length > 0 && (
            <Card title="UPI payment links">
              <ul className="space-y-3 text-sm">
                {a.payments.map((pay) => (
                  <li key={pay.id}>
                    <div className="flex justify-between">
                      <span className="num font-medium">{rupees(pay.amount)}</span>
                      <span className={pay.status === "PAID" ? "text-emerald-700" : "text-muted"}>
                        {pay.status === "PAID" ? `✓ paid ${pay.paidAt ? formatDateTime(pay.paidAt) : ""}` : pay.dueDate ? `due ${formatDate(pay.dueDate)}` : "pending"}
                      </span>
                    </div>
                    {pay.status !== "PAID" && (
                      <div className="mt-1 flex gap-3 text-xs">
                        <a href={`/pay/${pay.id}`} target="_blank" className="text-muted hover:text-foreground">
                          Open link
                        </a>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Agent's negotiation limits">
            <ul className="space-y-1 text-sm text-muted">
              <li>Up to {p.maxInstallments} payments, last by {formatDate(p.latestDueDate)}</li>
              <li>First payment at least {rupees(p.minFirstPayment)}</li>
              <li>{p.maxDiscountPct ? `Discount up to ${p.maxDiscountPct}%` : "No discount"}</li>
            </ul>
          </Card>

          <Card title="Agent memory">
            {memory.length === 0 ? (
              <Empty>Learnt after the first conversation.</Empty>
            ) : (
              <ul className="list-disc space-y-1 pl-4 text-sm">
                {memory.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            )}
          </Card>

          {plan && (
            <Card title="Active payment plan">
              <ul className="space-y-2 text-sm">
                {plan.payments.map((pay) => (
                  <li key={pay.id} className="flex justify-between">
                    <span>{pay.dueDate ? formatDate(pay.dueDate) : "—"}</span>
                    <span className="num">
                      {rupees(pay.amount)}{" "}
                      <span className={pay.status === "PAID" ? "text-emerald-700" : "text-muted"}>
                        {pay.status === "PAID" ? "✓ paid" : "pending"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              {plan.discountPct > 0 && <p className="mt-2 text-xs text-muted">{plan.discountPct}% discount applied</p>}
              <p className="mt-2 text-xs text-muted">
                Agreed {formatDateTime(plan.createdAt)} ·{" "}
                {parseJson<Installment[]>(plan.schedule, []).length} installment(s)
              </p>
            </Card>
          )}
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Card title={`Calls (${a.calls.length})`}>
            {a.calls.length === 0 ? (
              <Empty>No calls yet.</Empty>
            ) : (
              <ul className="space-y-3">
                {a.calls.map((c) => {
                  const notes = parseJson<string[]>(c.complianceNotes, []);
                  return (
                    <li key={c.id} className="rounded-lg border border-line p-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span className="font-medium">{outcomeLabel(c.outcome) !== "—" ? outcomeLabel(c.outcome) : c.status}</span>
                        <span className="text-xs text-muted">
                          {formatDateTime(c.createdAt)} · {c.direction} · {Math.floor(c.durationSec / 60)}m {c.durationSec % 60}s
                        </span>
                        {c.sentiment && <span className="text-xs text-muted">· mood {c.sentiment}</span>}
                        <span className="ml-auto text-xs">
                          {c.compliancePassed === null ? null : c.compliancePassed ? (
                            <span className="text-emerald-700">✓ Compliance passed</span>
                          ) : (
                            <span className="text-rose-700">✕ Compliance flagged</span>
                          )}
                        </span>
                      </div>
                      {c.summary && <p className="mt-2 text-sm text-muted">{c.summary}</p>}
                      {notes.length > 0 && (
                        <ul className="mt-2 list-disc pl-4 text-xs text-rose-700">
                          {notes.map((n, i) => (
                            <li key={i}>{n}</li>
                          ))}
                        </ul>
                      )}
                      {c.recordingUrl && <audio controls src={c.recordingUrl} className="mt-2 h-8 w-full" />}
                      {c.transcript && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-muted">Transcript</summary>
                          <div className="mt-2 space-y-1 text-sm">
                            {c.transcript.split("\n").filter(Boolean).map((line, i) => {
                              const agent = line.startsWith("assistant:");
                              return (
                                <p key={i} className={agent ? "" : "text-brand"}>
                                  <span className="mr-1 text-xs font-semibold uppercase text-muted">{agent ? "Agent" : "Borrower"}</span>
                                  {line.replace(/^(assistant|user):\s*/, "")}
                                </p>
                              );
                            })}
                          </div>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card title="WhatsApp messages">
              {a.messages.length === 0 ? (
                <Empty>None sent.</Empty>
              ) : (
                <ul className="space-y-2">
                  {a.messages.map((m) => (
                    <li key={m.id} className="rounded-lg rounded-tl-none bg-[#dcf8c6] px-3 py-2 text-sm text-stone-800">
                      <p className="whitespace-pre-line break-words">{m.body}</p>
                      <p className="mt-1 text-right text-[10px] text-stone-500">{formatDateTime(m.createdAt)}{m.status === "sent" ? " ✓✓" : m.status === "failed" ? " · not delivered" : ""}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Audit log">
              <ul className="space-y-2 text-sm">
                {a.events.map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <span className="w-24 shrink-0 text-xs text-muted">{formatDateTime(e.createdAt)}</span>
                    <span>{eventText(e.type, e.data)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </Shell>
  );
}
