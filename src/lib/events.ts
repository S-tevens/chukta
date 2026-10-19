import { db } from "./db";

export async function logEvent(accountId: string, type: string, data: Record<string, unknown> = {}) {
  await db.event.create({ data: { accountId, type, data: JSON.stringify(data) } });
}

export function baseUrl() {
  return (process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Queue a WhatsApp message. Stored in the outbox; a provider integration can send it later. */
export async function queueWhatsApp(accountId: string, body: string) {
  const msg = await db.message.create({ data: { accountId, body, channel: "whatsapp" } });
  await logEvent(accountId, "message.queued", { messageId: msg.id, channel: "whatsapp" });
  return msg;
}

export function paymentLink(paymentId: string) {
  return `${baseUrl()}/pay/${paymentId}`;
}
