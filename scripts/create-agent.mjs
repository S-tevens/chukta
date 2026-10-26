// Creates (or updates) the Settlr collections agent on Bolna.
//   npm run agent:create                 create a new agent, prints its ID
//   npm run agent:create -- --update     update the agent in BOLNA_AGENT_ID
//   npm run agent:create -- --dry-run    only write agent/agent-config.generated.json
// Requires PUBLIC_BASE_URL to be a public HTTPS URL (ngrok in dev): Bolna calls the tools there.
import { readFileSync, writeFileSync } from "node:fs";

const args = new Set(process.argv.slice(2));
const { BOLNA_API_KEY, BOLNA_AGENT_ID, PUBLIC_BASE_URL = "", AGENT_TOOL_TOKEN } = process.env;
const base = PUBLIC_BASE_URL.replace(/\/$/, "");

if (!base.startsWith("https://")) {
  console.warn(`⚠ PUBLIC_BASE_URL is "${base}". Bolna can only reach a public https URL (run ngrok and update .env).`);
}

const accountId = {
  account_id: { type: "string", description: "The account ID given in the call details. Always pass it exactly." },
};

// name -> [description, extra parameters, pre-call message]
const toolDefs = {
  send_payment_link: [
    "Send the borrower a UPI payment link on WhatsApp. Use when they agree to pay some or all of the overdue amount now.",
    { amount: { type: "string", description: "Amount in rupees to pay now, digits only" } },
    "Ek second, main aapko WhatsApp par payment link bhej rahi hoon.",
  ],
  create_payment_plan: [
    "Save an agreed payment plan and send it to the borrower on WhatsApp. Use only after the borrower agrees to specific dates and amounts.",
    {
      plan: { type: "string", description: 'Installments as "YYYY-MM-DD:amount" separated by commas, e.g. "2026-10-25:3000, 2026-11-10:3000"' },
      discount_pct: { type: "string", description: "Discount percent agreed, digits only. Use 0 if none." },
    },
    "Ek second, main yeh plan save kar rahi hoon.",
  ],
  check_payment_status: [
    "Check whether the borrower's payment has been received. Use after they say they have paid.",
    {},
    "Main check kar rahi hoon.",
  ],
  flag_dispute: [
    "Record that the borrower disputes the loan or the amount (wrong amount, not their loan, already paid, charged incorrectly).",
    { reason: { type: "string", description: "The borrower's reason, in a short English sentence" } },
    "Main yeh note kar rahi hoon.",
  ],
  schedule_callback: [
    "Book a callback when the borrower asks to talk later or wants to speak to a human.",
    {
      when: { type: "string", description: "Date and time in IST as YYYY-MM-DD HH:MM, between 08:00 and 19:00" },
      reason: { type: "string", description: "Why the callback is needed" },
    },
    "Theek hai, main time note kar rahi hoon.",
  ],
  mark_wrong_person: [
    "Use when the person who answered says this is the wrong number or they do not know the borrower.",
    {},
    "",
  ],
};

const tools = [];
const toolsParams = {};
for (const [name, [description, extra, preCall]] of Object.entries(toolDefs)) {
  const properties = { ...accountId, ...extra };
  tools.push({
    name,
    description,
    pre_call_message: preCall || undefined,
    parameters: { type: "object", properties, required: Object.keys(properties) },
    key: "custom_task",
  });
  toolsParams[name] = {
    method: "POST",
    url: `${base}/api/agent/${name}`,
    api_token: `Bearer ${AGENT_TOOL_TOKEN}`,
    param: Object.fromEntries(Object.keys(properties).map((k) => [k, `%(${k})s`])),
  };
}

const config = {
  agent_config: {
    agent_name: "Settlr Collections (Priya)",
    agent_welcome_message: "Namaste! Kya meri baat {first_name} ji se ho rahi hai?",
    webhook_url: `${base}/api/bolna/webhook?token=${AGENT_TOOL_TOKEN}`,
    agent_type: "other",
    tasks: [
      {
        task_type: "conversation",
        toolchain: { execution: "parallel", pipelines: [["transcriber", "llm", "synthesizer"]] },
        tools_config: {
          llm_agent: {
            agent_type: "simple_llm_agent",
            agent_flow_type: "streaming",
            llm_config: { provider: "openai", model: "gpt-4.1-mini", max_tokens: 200, temperature: 0.3 },
          },
          synthesizer: {
            provider: "sarvam",
            provider_config: { voice: "Priya (Recovery)", voice_id: "priya_hi_recovery", model: "bulbul:v4-flash", language: "hi" },
            stream: true,
            buffer_size: 250,
            audio_format: "wav",
          },
          transcriber: { provider: "deepgram", model: "nova-3", language: "hi", stream: true, encoding: "linear16", sampling_rate: 16000, endpointing: 300 },
          input: { provider: "plivo", format: "wav" },
          output: { provider: "plivo", format: "wav" },
          api_tools: { tools, tools_params: toolsParams },
        },
        task_config: { hangup_after_silence: 15, call_terminate: 420 },
      },
    ],
  },
  agent_prompts: { task_1: { system_prompt: readFileSync(new URL("../agent/prompt.md", import.meta.url), "utf8") } },
};

writeFileSync(new URL("../agent/agent-config.generated.json", import.meta.url), JSON.stringify(config, null, 2));
console.log("Wrote agent/agent-config.generated.json");
if (args.has("--dry-run")) process.exit(0);

if (!BOLNA_API_KEY) {
  console.error("Set BOLNA_API_KEY in .env");
  process.exit(1);
}

async function send(body) {
  const update = args.has("--update");
  if (update && !BOLNA_AGENT_ID) throw new Error("--update needs BOLNA_AGENT_ID in .env");
  const res = await fetch(`https://api.bolna.ai/v2/agent${update ? `/${BOLNA_AGENT_ID}` : ""}`, {
    method: update ? "PUT" : "POST",
    headers: { Authorization: `Bearer ${BOLNA_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

let { status, data } = await send(config);
if (status === 400 || status === 422) {
  // Some API versions expect the tools list as a JSON string.
  console.warn("Retrying with tools as a JSON string:", JSON.stringify(data));
  config.agent_config.tasks[0].tools_config.api_tools.tools = JSON.stringify(tools);
  ({ status, data } = await send(config));
}
if (status >= 300) {
  console.error(`Bolna returned ${status}:`, JSON.stringify(data, null, 2));
  process.exit(1);
}
console.log(`✔ Agent ${args.has("--update") ? "updated" : "created"}:`, data);
if (data.agent_id) console.log(`\nAdd this to .env:\nBOLNA_AGENT_ID="${data.agent_id}"`);
