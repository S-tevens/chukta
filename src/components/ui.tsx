import Link from "next/link";

export function Shell({ children, active }: { children: React.ReactNode; active: "overview" | "accounts" }) {
  const nav = [
    { href: "/", label: "Overview", key: "overview" },
    { href: "/accounts", label: "Accounts", key: "accounts" },
  ];
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-8 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-sm text-white">₹</span>
            Settlr
          </Link>
          <nav className="flex gap-1 text-sm">
            {nav.map((n) => (
              <Link
                key={n.key}
                href={n.href}
                className={`rounded-md px-3 py-1.5 ${active === n.key ? "bg-brand-soft font-medium text-brand" : "text-muted hover:text-foreground"}`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <span className="ml-auto hidden text-xs text-muted sm:block">Kaveri Finance · Demo portfolio</span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}

export function Card({ title, action, children, className = "" }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-surface ${className}`}>
      {title && (
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="num mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  NEW: "bg-stone-100 text-stone-700",
  CONTACTED: "bg-sky-50 text-sky-700",
  PROMISED: "bg-amber-50 text-amber-800",
  PAID: "bg-emerald-50 text-emerald-700",
  DISPUTE: "bg-rose-50 text-rose-700",
  CALLBACK: "bg-violet-50 text-violet-700",
  UNREACHABLE: "bg-stone-100 text-stone-500",
  WRONG_PERSON: "bg-stone-100 text-stone-500",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? "bg-stone-100 text-stone-700"}`}>
      {status.replace("_", " ").toLowerCase()}
    </span>
  );
}

const OUTCOME_LABELS: Record<string, string> = {
  paid_now: "Paid on call",
  plan_agreed: "Plan agreed",
  promise_to_pay: "Promise to pay",
  callback: "Callback booked",
  dispute: "Dispute",
  refused: "Refused",
  wrong_person: "Wrong person",
  no_contact: "No answer",
  no_commitment: "No commitment",
};

export function outcomeLabel(o: string | null | undefined) {
  return o ? (OUTCOME_LABELS[o] ?? o) : "—";
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}
