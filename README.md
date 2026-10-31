# Settlr: AI collections for India

Voice AI agents, built on [Bolna](https://www.bolna.ai), that call borrowers in their own language, find out why they haven't paid, negotiate a plan within the lender's rules, and collect over UPI **during the call**. Every call is checked against RBI fair-practice rules.

Built for the Bolna Symphony Buildathon (submissions due 31 Oct 2026).

## How it works

```
Dashboard ──POST /api/calls──▶ compliance pre-check ──▶ Bolna /call (with account variables)
                                                            │
             Bolna agent "Priya" ◀── live phone call ──▶ borrower
                    │ tool calls (custom functions)
                    ▼
   /api/agent/send_payment_link     → WhatsApp UPI link → /pay/:id
   /api/agent/create_payment_plan   → validated against policy, saved, sent on WhatsApp
   /api/agent/check_payment_status  → "payment received, thank you!"
   /api/agent/flag_dispute | schedule_callback | mark_wrong_person
                    │
Bolna webhook ──▶ /api/bolna/webhook ──▶ outcome, compliance audit, memory for next call
```

| Path | What it is |
|---|---|
| `agent/prompt.md` | The agent's system prompt (Hinglish, identity check, negotiation, hard rules) |
| `scripts/create-agent.mjs` | Creates or updates the agent on Bolna with the prompt, tools and webhook |
| `scripts/simulate-call.mjs` | Plays a fake call against the local app, with no call credits used |
| `src/lib/policy.ts` | Negotiation limits: number of installments, deadline, minimum first payment, discounts |
| `src/lib/compliance.ts` | Calling-hours and attempt limits before a call; banned-phrase and disclosure checks after |
| `src/lib/analyze.ts` | Post-call outcome, segment, memory and compliance (an LLM if `OPENAI_API_KEY` is set) |

## Run it locally

```bash
npm install
cp .env.example .env        # then fill it in
npx prisma migrate deploy   # creates the tables in the Postgres database in DATABASE_URL
npm run db:seed             # loads a demo portfolio
npm run dev                 # http://localhost:3000
npm run simulate            # optional: a fake call so the dashboard has data
```

To put your own phone in the portfolio, set `DEMO_PHONE="+91XXXXXXXXXX"` (and optionally `DEMO_NAME`) in `.env`, then run `npm run db:reset`.

## Connect Bolna (real calls)

1. Get an API key at [platform.bolna.ai](https://platform.bolna.ai) → Developers, and put it in `.env` as `BOLNA_API_KEY`.
2. Expose the app publicly so Bolna can reach the tools and webhook:
   ```bash
   ngrok http 3000
   ```
   Put the https URL in `.env` as `PUBLIC_BASE_URL`, then restart `npm run dev`.
3. Create the agent:
   ```bash
   npm run agent:create
   ```
   Copy the printed `BOLNA_AGENT_ID` into `.env` and restart. After changing the prompt or the ngrok URL, run `npm run agent:create -- --update`.
4. Open **Accounts** and press **Call** on your demo account.

If agent creation is rejected (voice or model names change often), `agent/agent-config.generated.json` holds the full config. Build the agent in the Bolna dashboard instead and paste the prompt and custom functions from it.

## Not built yet
- Real WhatsApp sending (messages are stored in an outbox and shown on the account page)
- A real UPI gateway (Razorpay or Cashfree payment links plus their webhook replace `/api/pay/:id`)
- CSV import of a lender's portfolio, and automatic follow-up calls on promised dates
