import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { PayButton } from "@/components/pay-button";
import { db } from "@/lib/db";
import { rupees } from "@/lib/format";

export const dynamic = "force-dynamic";

// Borrower-facing payment page opened from the WhatsApp link.
export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payment = await db.payment.findUnique({ where: { id }, include: { account: true } });
  if (!payment) notFound();
  const a = payment.account;

  const upi = new URL("upi://pay");
  upi.searchParams.set("pa", process.env.UPI_VPA ?? "settlr@upi");
  upi.searchParams.set("pn", a.lenderName);
  upi.searchParams.set("am", payment.amount.toFixed(2));
  upi.searchParams.set("cu", "INR");
  upi.searchParams.set("tn", `${a.loanId} ${payment.id.slice(-6)}`);
  const qr = await QRCode.toDataURL(upi.toString(), { margin: 1, width: 220 });

  return (
    <main className="flex min-h-screen items-start justify-center px-4 py-10">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        <div className="bg-brand px-5 py-4 text-white">
          <p className="text-xs opacity-80">Secure payment to</p>
          <p className="text-lg font-semibold">{a.lenderName}</p>
        </div>
        <div className="px-5 py-6 text-center">
          <p className="text-sm text-muted">
            {a.name.split(" ")[0]} · Loan {a.loanId}
          </p>
          <p className="num mt-1 text-4xl font-semibold tracking-tight">{rupees(payment.amount)}</p>

          {payment.status === "PAID" ? (
            <div className="mt-6 rounded-xl bg-emerald-50 px-4 py-6 text-emerald-800">
              <p className="text-3xl">✓</p>
              <p className="mt-1 font-medium">Payment received</p>
              <p className="text-sm">Thank you! A receipt has been sent on WhatsApp.</p>
            </div>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="UPI QR code" className="mx-auto mt-5 h-[220px] w-[220px]" />
              <p className="mt-2 text-xs text-muted">Scan with any UPI app</p>
              <a
                href={upi.toString()}
                className="mt-5 block rounded-xl bg-foreground px-4 py-3 text-sm font-medium text-white"
              >
                Pay with GPay / PhonePe / Paytm
              </a>
              <PayButton paymentId={payment.id} />
            </>
          )}
          <p className="mt-6 text-[11px] leading-relaxed text-muted">
            Never share your UPI PIN or OTP with anyone, including callers from {a.lenderName}.
          </p>
        </div>
      </div>
    </main>
  );
}
