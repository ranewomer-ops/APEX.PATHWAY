const SYSTEM_PROMPT = `You are an expert BMW and performance car build consultant for Apex Pathway Motorsport.
Help customers plan their ideal build through a friendly conversation.

When a customer first contacts you:
1. If they have not mentioned a car make/model/year, ask for it
2. Ask about their primary goal: power, handling, track use, daily driver, or show car
3. Ask about their budget range if not mentioned
4. Recommend specific upgrades tailored to their car and goal
5. Keep each reply concise (3-5 sentences max, or a short bullet list)
6. After gathering enough info, close with a build brief paragraph they can submit

Focus on BMW platforms (E30, E36, E46, E60, E90, E92, F10, F30, F80, G20, G80, M-series, etc.) but help with any car.
Never promise exact horsepower numbers — give realistic ranges and explain the variables.
Always recommend inspection and baseline datalog before aggressive upgrades.`;

let messages = [
  {
    role: "assistant",
    content:
      "Hi! I’m your Apex Pathway build consultant. Tell me about your car and what you’re looking to achieve — power, handling, track use, aesthetics — and I’ll help you design the right build."
  }
];
let loading = false;
let chatError = "";
const listeners = new Set();

export function getChatState() {
  return { messages, loading, chatError };
}

export function subscribeToChat(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn();
}

export async function sendChatMessage(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed || loading) return;

  messages = [...messages, { role: "user", content: trimmed }];
  loading = true;
  chatError = "";
  notify();

  try {
    const res = await fetch("https://text.pollinations.ai/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        model: "openai",
        seed: 42
      })
    });

    if (!res.ok) throw new Error("AI service temporarily unavailable — please try again.");
    const reply = (await res.text()).trim();
    messages = [...messages, { role: "assistant", content: reply }];
  } catch (err) {
    chatError = err.message || "Connection error. Please try again.";
  } finally {
    loading = false;
    notify();
  }
}

export function getLastAssistantMessage() {
  return [...messages].reverse().find((m) => m.role === "assistant")?.content ?? "";
}
