/**
 * Minimal Gemini client for the student case chat — plain REST, no SDK.
 *
 * Set GEMINI_API_KEY in Railway (Google AI Studio key). GEMINI_MODEL is
 * optional (default gemini-3.5-flash-lite, falling back to 3.5-flash and
 * 3.7-flash). Used only to answer student questions from the admin-managed
 * FAQ/policy articles; without a key those questions go to the assigned
 * staff member instead.
 */
// GEMINI_API_BASE only exists so tests can point at a local stub.
function apiBase() {
  return String(process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta/models").replace(/\/$/, "");
}

export function geminiConfigured() {
  return Boolean(String(process.env.GEMINI_API_KEY || "").trim());
}

// Free-tier models as of Sep 2026 (ai.google.dev/gemini-api/docs/pricing).
// Flash-Lite first: fastest, cheapest, most generous free quota, and plenty
// for a short advisor chat. If a model is missing or its free quota is used
// up, the next one is tried — each model has its own quota.
const DEFAULT_MODELS = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.7-flash"];

function modelsToTry() {
  const configured = String(process.env.GEMINI_MODEL || "").trim();
  return [...new Set([configured, ...DEFAULT_MODELS].filter(Boolean))];
}

export function geminiModelName() {
  return modelsToTry()[0];
}

/**
 * One JSON-mode call. history: [{ role: "user" | "model", text }], oldest
 * first, ending with the user's turn. Returns the parsed JSON object that
 * matches `schema` (Gemini OpenAPI-subset schema).
 */
export async function geminiJson({ systemPrompt, history, schema, temperature = 0.2 }) {
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

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature,
      // Gemini 3 models think before answering and that counts here, so
      // leave headroom; the reply itself is ~90 words.
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  });

  let data = null;
  let lastError = null;
  for (const model of modelsToTry()) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch(`${apiBase()}/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body,
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        data = json;
        break;
      }
      lastError = new Error(`${model}: ${json?.error?.message || `Gemini request failed (${res.status})`}`);
      // Wrong/retired model name or free quota exhausted → try the next model.
      // Anything else (bad key, bad request) won't be fixed by another model.
      if (![404, 429, 503].includes(res.status)) throw lastError;
      console.warn("[gemini] falling back:", lastError.message);
    } finally {
      clearTimeout(timer);
    }
  }
  if (!data) throw lastError || new Error("Gemini request failed");

  {
    // Skip "thought" parts some models return alongside the answer.
    const raw = (data?.candidates?.[0]?.content?.parts || [])
      .filter((p) => !p.thought)
      .map((p) => p.text || "")
      .join("");
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error("Gemini returned non-JSON output");
    }
  }
}
