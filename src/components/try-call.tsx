"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** "Start calling": a visitor enters their own number and gets a live demo call from Priya. */
export function TryCall() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/try", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), phone: form.get("phone"), language: form.get("language") }),
      });
      const data = await res.json();
      if (res.ok) router.push(`/accounts/${data.accountId}`);
      else setError(data.error ?? "Could not start the call.");
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand";
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90">
        Start calling →
      </button>
      {open && (
        <form
          onSubmit={submit}
          className="absolute left-0 top-full sm:left-auto sm:right-0 z-20 mt-2 w-[min(20rem,calc(100vw-2rem))] space-y-3 rounded-xl border border-line bg-surface p-4 shadow-lg"
        >
          <div>
            <h2 className="text-sm font-semibold">Get a demo call</h2>
            <p className="text-xs text-muted">
              Priya, our AI agent, will call you about a sample overdue loan of ₹9,000. Play the borrower. No real money is charged.
            </p>
          </div>
          <input name="name" required maxLength={40} placeholder="Your first name" className={input} />
          <div className="flex">
            <span className="rounded-l-lg border border-r-0 border-line bg-stone-50 px-3 py-2 text-sm text-muted">+91</span>
            <input name="phone" required inputMode="tel" placeholder="98765 43210" className={`${input} rounded-l-none`} />
          </div>
          <select name="language" defaultValue="hi" className={input}>
            <option value="hi">Hindi</option>
            <option value="en">English</option>
          </select>
          <label className="flex gap-2 text-xs text-muted">
            <input type="checkbox" required className="mt-0.5" />
            This is my number, and I agree to a recorded demo call and WhatsApp messages.
          </label>
          {error && <p className="text-xs text-rose-700">{error}</p>}
          <button disabled={busy} className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {busy ? "Dialling…" : "Call me now"}
          </button>
        </form>
      )}
    </div>
  );
}
