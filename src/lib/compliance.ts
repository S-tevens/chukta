import type { Account } from "@prisma/client";
import { db } from "./db";

// RBI guidance for recovery calls: contact borrowers only between 08:00 and 19:00.
const CALL_WINDOW_START = 8;
const CALL_WINDOW_END = 19;
const MAX_ATTEMPTS_PER_DAY = 3;

function istHour(now: Date) {
  return new Date(now.getTime() + 5.5 * 3_600_000).getUTCHours();
}

/** Checks run before every outbound call. Returns the reasons a call is blocked (empty = allowed). */
export async function preCallCheck(account: Account, now = new Date()) {
  const reasons: string[] = [];
  const hour = istHour(now);
  if (hour < CALL_WINDOW_START || hour >= CALL_WINDOW_END) {
    reasons.push(`Outside the allowed calling window (08:00–19:00 IST); it is ${hour}:00 IST`);
  }
  if (["PAID", "DISPUTE", "WRONG_PERSON"].includes(account.status)) {
    reasons.push(`Account status is ${account.status}`);
  }
  const startOfDay = new Date(now.getTime() - 24 * 3_600_000);
  const attempts = await db.call.count({ where: { accountId: account.id, createdAt: { gte: startOfDay } } });
  if (attempts >= MAX_ATTEMPTS_PER_DAY) {
    reasons.push(`Already ${attempts} call attempts in the last 24 hours (limit ${MAX_ATTEMPTS_PER_DAY})`);
  }
  return reasons;
}

// Phrases a recovery agent must never use (English, Hindi and Hinglish).
const BANNED = [
  "police", "jail", "arrest", "court case", "legal action",
  "your family", "your office", "your boss", "shame", "defaulter",
  "पुलिस", "जेल", "गिरफ्तार", "बदनाम", "घरवालों", "ऑफिस में",
  "badnaam", "gharwalon", "giraftar",
];

/** Rule-based compliance review of the agent's side of a transcript. */
export function ruleBasedCompliance(transcript: string) {
  const agentLines = transcript
    .split("\n")
    .filter((l) => l.toLowerCase().startsWith("assistant:"))
    .join("\n")
    .toLowerCase();
  const notes: string[] = [];
  for (const phrase of BANNED) {
    if (agentLines.includes(phrase)) notes.push(`Agent used a prohibited phrase: "${phrase.trim()}"`);
  }
  // Both disclosures are required: that the caller is an AI, and that the call is recorded.
  const saidAi = /\b(ai|digital assistant|virtual assistant)\b|एआई/.test(agentLines);
  const saidRecorded = /\b(recorded|record|recording)\b|रिकॉर्ड/.test(agentLines);
  if (agentLines && !saidAi) notes.push("Agent did not disclose that it is an AI");
  if (agentLines && !saidRecorded) notes.push("Agent did not disclose that the call is recorded");
  return { passed: notes.length === 0, notes };
}
