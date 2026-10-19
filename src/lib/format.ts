const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function rupees(n: number) {
  return inr.format(n);
}

export function daysPastDue(dueDate: Date, now = new Date()) {
  return Math.floor((now.getTime() - dueDate.getTime()) / 86_400_000);
}

export function dpdBucket(dpd: number) {
  if (dpd <= 0) return "Pre-due";
  if (dpd <= 30) return "1–30 DPD";
  if (dpd <= 60) return "31–60 DPD";
  return "60+ DPD";
}

/** "YYYY-MM-DD" in IST. */
export function isoDateIST(d: Date) {
  return new Date(d.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

export function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

export function formatDateTime(d: Date | string) {
  return new Date(d).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
