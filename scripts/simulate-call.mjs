// Plays a fake call against the local app, the way Bolna would: tool calls, then webhooks.
// Useful for building the dashboard without spending call credits.
//   npm run simulate                   uses the first NEW account
//   npm run simulate -- <account_id>   uses that account
const base = "http://localhost:3000";
const token = process.env.AGENT_TOOL_TOKEN;
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let accountId = process.argv[2];
if (!accountId) {
  const res = await fetch(`${base}/api/accounts`);
  const accounts = await res.json();
  accountId = accounts.find((a) => a.status === "NEW" && a.overdueAmount > 3000)?.id;
}
if (!accountId) throw new Error("No account to simulate");

const tool = async (name, args) => {
  const res = await fetch(`${base}/api/agent/${name}`, { method: "POST", headers, body: JSON.stringify({ account_id: accountId, ...args }) });
  const data = await res.json();
  console.log(`→ ${name}:`, data.message);
  return data;
};
const hook = (payload) =>
  fetch(`${base}/api/bolna/webhook?token=${token}`, { method: "POST", headers, body: JSON.stringify(payload) });

const lookup = await tool("lookup_account", {});
const executionId = `sim-${Date.now()}`;
const owed = lookup.overdue_amount;
const first = Math.ceil(owed * 0.4);
const day = (n) => new Date(Date.now() + n * 86_400_000 + 5.5 * 3_600_000).toISOString().slice(0, 10);

await hook({ id: executionId, status: "in-progress", user_number: lookup.phone ?? "", context_details: { recipient_data: { account_id: accountId } } });
await sleep(800);

const link = await tool("send_payment_link", { amount: String(first) });
await fetch(`${base}/api/pay/${link.payment_id}`, { method: "POST" });
await tool("check_payment_status", {});
await tool("create_payment_plan", { plan: `${day(10)}:${owed - first}`, discount_pct: "0" });

const transcript = [
  `assistant: Namaste! Kya meri baat ${lookup.name.split(" ")[0]} ji se ho rahi hai?`,
  "user: Haan, bol raha hoon.",
  `assistant: Yeh call record ho rahi hai, aur main ${lookup.lender} ki AI assistant Priya hoon. Aapke ${lookup.product} par ${owed} rupaye pending hain.`,
  "user: Haan pata hai, is mahine salary late aayi. Abhi poora nahi de sakta.",
  `assistant: Samajh sakti hoon. Kya aap abhi ${first} rupaye de sakte hain, aur baaki 10 din mein?`,
  "user: Haan, yeh ho jayega. Salary 7 tareekh ko aati hai.",
  "assistant: Bahut badhiya. Maine WhatsApp par link bhej diya hai.",
  "user: Ho gaya payment.",
  "assistant: Dhanyavaad! Payment mil gaya. Baaki ka plan bhi WhatsApp par bhej diya hai.",
].join("\n");

await hook({ id: executionId, status: "call-disconnected", transcript });
await sleep(500);
await hook({
  id: executionId,
  status: "completed",
  transcript,
  conversation_duration: 142,
  total_cost: 4.1,
  summary: "Borrower's salary was late. Paid part now over UPI and agreed to clear the rest in 10 days.",
  telephony_data: { recording_url: "" },
});
console.log(`✔ Simulated call ${executionId} for account ${accountId}`);
