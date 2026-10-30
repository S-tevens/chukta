"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Demo stand-in for a real UPI payment confirmation. Also picks up payments made elsewhere. */
export function PayButton({ paymentId, label = "Simulate UPI payment (demo)", primary = false }: { paymentId: string; label?: string; primary?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setInterval(async () => {
      const res = await fetch(`/api/pay/${paymentId}/status`);
      if ((await res.json()).status === "PAID") router.refresh();
    }, 3000);
    return () => clearInterval(t);
  }, [paymentId, router]);

  async function pay() {
    setBusy(true);
    await fetch(`/api/pay/${paymentId}`, { method: "POST" });
    router.refresh();
  }

  return (
    <button
      onClick={pay}
      disabled={busy}
      className={`mt-2 block w-full rounded-xl px-4 py-3 text-sm disabled:opacity-50 ${
        primary ? "bg-foreground font-medium text-white" : "border border-line text-muted hover:bg-stone-50"
      }`}
    >
      {busy ? "Processing…" : label}
    </button>
  );
}
