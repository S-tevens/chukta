import { after } from "next/server";
import { db } from "./db";

export async function logEvent(accountId: string, type: string, data: Record<string, unknown> = {}) {
  await db.event.create({ data: { accountId, type, data: JSON.stringify(data) } });
}

export function baseUrl() {
  return (process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function whatsAppConfigured() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM } = process.env;
  return Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_FROM);
}

/**
 * Queue a WhatsApp message in the outbox. When Twilio is configured it is also sent,
 * after the response (also on serverless) so the agent tool replies to Bolna without waiting.
 */
export async function queueWhatsApp(accountId: string, body: string) {
  const msg = await db.message.create({ data: { accountId, body, channel: "whatsapp" } });
  await logEvent(accountId, "message.queued", { messageId: msg.id, channel: "whatsapp" });
  if (whatsAppConfigured()) after(() => deliverWhatsApp(msg.id));
  return msg;
}

async function deliverWhatsApp(messageId: string) {
  const msg = await db.message.findUniqueOrThrow({ where: { id: messageId }, include: { account: true } });
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_WHATSAPP_FROM: from = "", TWILIO_CONTENT_SID: contentSid } = process.env;
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: from.startsWith("whatsapp:") ? from : `whatsapp:${from}`,
        To: `whatsapp:${msg.account.phone}`,
        // Trial senders only accept fixed templates, so the full text stays in the dashboard outbox.
        ...(contentSid ? { ContentSid: contentSid } : { Body: msg.body }),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message ?? `Twilio returned ${res.status}`);
    await db.message.update({ where: { id: messageId }, data: { status: "sent" } });
    await logEvent(msg.accountId, "message.sent", { messageId, channel: "whatsapp", providerId: data.sid });
  } catch (err) {
    await db.message.update({ where: { id: messageId }, data: { status: "failed" } });
    await logEvent(msg.accountId, "message.failed", { messageId, channel: "whatsapp", error: String((err as Error).message ?? err) });
  }
}

export function paymentLink(paymentId: string) {
  return `${baseUrl()}/pay/${paymentId}`;
}
