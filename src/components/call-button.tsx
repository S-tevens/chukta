"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Result = { accountId: string; name: string; ok: boolean; reasons?: string[] };

/** Starts calls for one or more accounts and shows why any were blocked. */
export function CallButton({ accountIds, label = "Call", variant = "primary" }: { accountIds: string[]; label?: string; variant?: "primary" | "ghost" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function start(override = false) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountIds, override }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? "Could not start the call.");
        return;
      }
      const results = data.results as Result[];
      const started = results.filter((r) => r.ok).length;
      const blocked = results.filter((r) => !r.ok);
      if (blocked.length && !override && blocked.every((b) => b.reasons?.some((r) => r.startsWith("Outside the allowed")))) {
        if (confirm(`${blocked[0].reasons?.[0]}.\n\nOverride for a demo? The override is written to the audit log.`)) {
          await start(true);
          return;
        }
      }
      setNotice(
        [started ? `${started} call${started > 1 ? "s" : ""} started.` : "", ...blocked.map((b) => `${b.name}: ${b.reasons?.join("; ")}`)]
          .filter(Boolean)
          .join(" "),
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const styles =
    variant === "primary"
      ? "bg-brand text-white hover:opacity-90"
      : "border border-line bg-surface text-foreground hover:bg-stone-50";
  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        onClick={() => start()}
        disabled={busy || accountIds.length === 0}
        className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${styles}`}
      >
        {busy ? "Dialling…" : label}
      </button>
      {notice && <p className="max-w-xs text-right text-xs text-muted">{notice}</p>}
    </div>
  );
}
