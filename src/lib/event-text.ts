import { outcomeLabel } from "@/components/ui";
import { parseJson, rupees } from "./format";

const EVENT_TEXT: Record<string, (d: Record<string, unknown>) => string> = {
  "account.imported": () => "Account imported",
  "call.started": () => "Call started",
  "call.blocked": (d) => `Call blocked: ${(d.reasons as string[] | undefined)?.join("; ") ?? "compliance check"}`,
  "call.override": () => "Compliance check overridden by operator",
  "call.no_contact": (d) => `No contact (${d.status})`,
  "call.analyzed": (d) => `Call ended · ${outcomeLabel(d.outcome as string)}`,
  "payment.link_sent": (d) => `UPI link sent for ${rupees(Number(d.amount))}`,
  "payment.received": (d) => `Received ${rupees(Number(d.amount))}`,
  "plan.created": () => "Payment plan agreed",
  "dispute.flagged": (d) => `Dispute flagged${d.reason ? `: ${d.reason}` : ""}`,
  "callback.scheduled": (d) => `Callback scheduled${d.reason ? ` (${d.reason})` : ""}`,
  "contact.wrong_person": () => "Wrong person answered",
  "message.queued": () => "WhatsApp message queued",
  "message.sent": () => "WhatsApp message delivered to Twilio",
  "message.failed": (d) => `WhatsApp message failed${d.error ? `: ${d.error}` : ""}`,
};

export function eventText(type: string, data: string) {
  const fn = EVENT_TEXT[type];
  return fn ? fn(parseJson(data, {})) : type;
}
