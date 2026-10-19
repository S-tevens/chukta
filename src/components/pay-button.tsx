"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Demo stand-in for a real UPI payment confirmation. Also picks up payments made elsewhere. */
export function PayButton({ paymentId }: { paymentId: string }) {
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
      className="mt-2 block w-full rounded-xl border border-line px-4 py-3 text-sm text-muted hover:bg-stone-50 disabled:opacity-50"
    >
      {busy ? "Processing…" : "Simulate UPI payment (demo)"}
    </button>
  );
}
