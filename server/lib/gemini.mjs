/**
 * Minimal Gemini client for the student case chat — plain REST, no SDK.
 *
 * Set GEMINI_API_KEY in Railway (Google AI Studio key). GEMINI_MODEL is
 * optional. With no key the chat still works: the AI step just answers with
 * a holding line and a human picks the conversation up.
 */
// GEMINI_API_BASE only exists so tests can point at a local stub.
function apiBase() {
  return String(process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta/models").replace(/\/$/, "");
}

export function geminiConfigured() {
  return Boolean(String(process.env.GEMINI_API_KEY || "").trim());
}

function geminiModel() {
  return String(process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    reply: { type: "STRING" },
    profile: {
      type: "OBJECT",
      properties: {
        country: { type: "STRING" },
        qualification: { type: "STRING" },
        field: { type: "STRING" },
        score: { type: "STRING" },
        budget: { type: "STRING" },
        intake: { type: "STRING" },
      },
    },
  },
  required: ["reply"],
};

/**
 * history: [{ role: "user" | "model", text }] oldest first.
 * Returns { reply, profile } — profile holds only fields the student stated.
 */
export async function geminiChat({ systemPrompt, history }) {
  const key = String(process.env.GEMINI_API_KEY || "").trim();
  if (!key) throw Object.assign(new Error("GEMINI_API_KEY is not set"), { code: "not_configured" });

  // Gemini wants user/model turns; merge consecutive same-role turns.
  const contents = [];
  for (const item of history) {
    const text = String(item.text || "").trim();
    if (!text) continue;
    const last = contents[contents.length - 1];
    if (last && last.role === item.role) last.parts[0].text += `\n${text}`;
    else contents.push({ role: item.role, parts: [{ text }] });
  }
  if (!contents.length || contents[contents.length - 1].role !== "user") {
    throw new Error("Gemini call needs the student's message last");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(`${apiBase()}/${encodeURIComponent(geminiModel())}:generateContent`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          // Flash models "think" by default and that eats the output budget;
          // a chat reply doesn't need it and is faster/cheaper without.
          ...(/flash/i.test(geminiModel()) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error?.message || `Gemini request failed (${res.status})`);
    }
    const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { reply: raw };
    }
    const reply = String(parsed?.reply || "").trim();
    if (!reply) throw new Error("Gemini returned an empty reply");
    const profile = {};
    for (const [k, v] of Object.entries(parsed?.profile || {})) {
      const value = String(v || "").trim();
      if (value && !/^(unknown|n\/a|none|null|not provided)$/i.test(value)) profile[k] = value;
    }
    return { reply, profile };
  } finally {
    clearTimeout(timer);
  }
}
