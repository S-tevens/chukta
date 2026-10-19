import { NextResponse, type NextRequest } from "next/server";
import { db } from "./db";

/** Bolna sends `Authorization: Bearer <AGENT_TOOL_TOKEN>` (set as api_token on each tool). */
export function authorized(req: NextRequest) {
  const expected = process.env.AGENT_TOOL_TOKEN;
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "") || req.nextUrl.searchParams.get("token");
  return token === expected;
}

/** Reads tool arguments from a JSON body, form body or query string. */
export async function readArgs(req: NextRequest): Promise<Record<string, string>> {
  const args: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => (args[k] = v));
  if (req.method !== "GET") {
    const text = await req.text();
    if (text) {
      try {
        Object.assign(args, JSON.parse(text));
      } catch {
        new URLSearchParams(text).forEach((v, k) => (args[k] = v));
      }
    }
  }
  for (const k of Object.keys(args)) args[k] = String(args[k] ?? "").trim();
  return args;
}

/** Wraps a tool: checks auth, loads the account, and always answers with a sentence the LLM can use. */
export function agentTool(
  handler: (args: Record<string, string>, account: NonNullable<Awaited<ReturnType<typeof findAccount>>>) => Promise<object>,
) {
  return async (req: NextRequest) => {
    if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const args = await readArgs(req);
    const account = await findAccount(args.account_id, args.phone);
    if (!account) {
      return NextResponse.json({ ok: false, message: "No account found. Do not discuss any loan details." });
    }
    try {
      return NextResponse.json(await handler(args, account));
    } catch (err) {
      console.error("agent tool failed", err);
      return NextResponse.json({
        ok: false,
        message: "The system had a problem. Apologise and offer to send the details on WhatsApp later.",
      });
    }
  };
}

export async function findAccount(accountId?: string, phone?: string) {
  if (accountId) {
    const a = await db.account.findFirst({ where: { OR: [{ id: accountId }, { loanId: accountId }] } });
    if (a) return a;
  }
  if (phone) {
    const digits = phone.replace(/\D/g, "").slice(-10);
    if (digits.length === 10) return db.account.findFirst({ where: { phone: { endsWith: digits } } });
  }
  return null;
}
