"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CallButton } from "./call-button";
import { StatusBadge, outcomeLabel } from "./ui";

export type AccountRow = {
  id: string;
  name: string;
  loanId: string;
  product: string;
  language: string;
  overdue: string;
  dpd: number;
  bucket: string;
  status: string;
  segment: string;
  lastOutcome: string | null;
  nextAction: string | null;
};

const FILTERS = ["All", "Pre-due", "1–30 DPD", "31–60 DPD", "60+ DPD"];

export function AccountsTable({ rows }: { rows: AccountRow[] }) {
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const visible = useMemo(() => rows.filter((r) => filter === "All" || r.bucket === filter), [rows, filter]);
  const callable = visible.filter((r) => !["PAID", "DISPUTE", "WRONG_PERSON"].includes(r.status));

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs ${filter === f ? "bg-foreground text-white" : "bg-stone-100 text-muted hover:text-foreground"}`}
          >
            {f}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setSelected(new Set(callable.map((r) => r.id)))}
            className="text-xs text-muted underline-offset-2 hover:underline"
          >
            Select all callable
          </button>
          <CallButton accountIds={[...selected]} label={`Start campaign (${selected.size})`} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="w-10 px-4 py-2" />
              <th className="py-2 pr-3 font-medium">Borrower</th>
              <th className="py-2 pr-3 font-medium">Product</th>
              <th className="py-2 pr-3 text-right font-medium">Overdue</th>
              <th className="py-2 pr-3 font-medium">DPD</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">Segment</th>
              <th className="py-2 pr-3 font-medium">Last outcome</th>
              <th className="py-2 pr-4" />
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className="border-t border-line hover:bg-stone-50">
                <td className="px-4 py-2">
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="accent-[var(--brand)]" />
                </td>
                <td className="py-2 pr-3">
                  <Link href={`/accounts/${r.id}`} className="font-medium hover:underline">
                    {r.name}
                  </Link>
                  <div className="text-xs text-muted">
                    {r.loanId} · {r.language.toUpperCase()}
                  </div>
                </td>
                <td className="py-2 pr-3 text-muted">{r.product}</td>
                <td className="num py-2 pr-3 text-right font-medium">{r.overdue}</td>
                <td className="num py-2 pr-3">{r.dpd <= 0 ? `due in ${-r.dpd}d` : `${r.dpd}d`}</td>
                <td className="py-2 pr-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="py-2 pr-3 text-muted">{r.segment === "unknown" ? "—" : r.segment.replace("_", " ")}</td>
                <td className="py-2 pr-3 text-muted">
                  {outcomeLabel(r.lastOutcome)}
                  {r.nextAction && <div className="text-xs">Next: {r.nextAction}</div>}
                </td>
                <td className="py-2 pr-4 text-right">
                  {!["PAID", "DISPUTE", "WRONG_PERSON"].includes(r.status) && <CallButton accountIds={[r.id]} variant="ghost" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
