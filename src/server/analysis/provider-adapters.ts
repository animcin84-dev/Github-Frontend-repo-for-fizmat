import { z } from "zod";
import { triageResultSchema, type TriageInput } from "./contracts";
import { providerConfig, type ProviderId } from "./provider-config";
import { ProviderError } from "./provider-errors";
import { TRIAGE_SYSTEM_PROMPT } from "./prompt";

const inputSchema = z.strictObject({
  subject: z.string().max(1000),
  messages: z.array(z.strictObject({ id: z.string().max(200), providerMessageId: z.string().max(300), text: z.string().max(6000), occurredAt: z.string().max(80) })).min(1).max(20),
});
const number = z.number().int().nonnegative().max(10_000_000).optional();
const chatResponse = z.object({
  id: z.string().max(200).optional(), model: z.string().max(200).optional(),
  choices: z.array(z.object({ finish_reason: z.literal("stop"), message: z.object({ content: z.string().max(20_000), refusal: z.string().nullable().optional() }) })).length(1),
  usage: z.object({ prompt_tokens: number, completion_tokens: number }).optional(),
});
const geminiResponse = z.object({
  responseId: z.string().max(200).optional(), modelVersion: z.string().max(200).optional(),
  candidates: z.array(z.object({ finishReason: z.literal("STOP"), content: z.object({ parts: z.array(z.object({ text: z.string().max(20_000), thought: z.boolean().optional() })).min(1).max(20) }) })).length(1),
  usageMetadata: z.object({ promptTokenCount: number, candidatesTokenCount: number }).optional(),
});

export function guardProviderExecution() {
  if (typeof process === "undefined" || !process.versions?.node) throw new ProviderError("configuration");
  if (process.env.CI && process.env.CI !== "false" && process.env.CI !== "0") throw new ProviderError("configuration");
}

export function validateProviderInput(input: TriageInput) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success || parsed.data.messages.reduce((sum, item) => sum + item.text.length, 0) > 30_000) throw new ProviderError("invalid_input", { status: 400 });
  // Pick only allowed fields; arbitrary object properties must not reach a provider.
  return JSON.stringify({ untrustedCustomerContent: true, subject: parsed.data.subject, messages: parsed.data.messages.map(({ text, occurredAt }) => ({ text, occurredAt })) });
}

/** Remove unsupported provider schema annotations, keeping Zod as final validator. */
function providerSchema() {
  const schema = z.toJSONSchema(triageResultSchema, { target: "draft-7" });
  const unsupported = new Set(["$schema", "minLength", "maxLength"]);
  function clean(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !unsupported.has(key)).map(([key, child]) => [key, clean(child)]));
    return value;
  }
  return clean(schema);
}

function httpError(status: number, provider: ProviderId, model: string) {
  const options = { provider, model };
  if (status === 401 || status === 403) return new ProviderError("authentication", options);
  if (status === 408) return new ProviderError("timeout", { ...options, transient: true });
  if (status === 429) return new ProviderError("rate_limited", { ...options, transient: true });
  if (status >= 500) return new ProviderError("unavailable", { ...options, transient: true });
  return new ProviderError("unsupported_request", options);
}

function parseFacts(text: string, provider: ProviderId, model: string) {
  let json: unknown;
  try { json = JSON.parse(text); } catch { throw new ProviderError("invalid_output", { provider, model }); }
  const parsed = triageResultSchema.safeParse(json);
  if (!parsed.success) throw new ProviderError("invalid_output", { provider, model });
  return parsed.data;
}

export async function callProvider(provider: ProviderId, input: TriageInput, timeoutMs = 15_000) {
  guardProviderExecution();
  const content = validateProviderInput(input);
  const config = providerConfig(provider);
  if (!config.key) throw new ProviderError("configuration", { provider, model: config.model });
  const schema = providerSchema();
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(timeoutMs, 15_000));
  try {
    const gemini = provider === "gemini";
    const url = gemini ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent` : provider === "groq" ? "https://api.groq.com/openai/v1/chat/completions" : "https://router.huggingface.co/v1/chat/completions";
    const body = gemini ? {
      systemInstruction: { parts: [{ text: TRIAGE_SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: content }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 1600, responseMimeType: "application/json", responseJsonSchema: schema, ...(config.model.startsWith("gemini-2.5-flash") ? { thinkingConfig: { thinkingBudget: 0 } } : {}) },
    } : {
      model: config.model, stream: false, temperature: 0, max_tokens: 1600,
      messages: [{ role: "system", content: TRIAGE_SYSTEM_PROMPT }, { role: "user", content }],
      response_format: { type: "json_schema", json_schema: { name: "support_triage_facts", strict: true, schema } },
      ...(provider === "groq" && config.model.startsWith("openai/gpt-oss-") ? { reasoning_effort: "low" } : {}),
    };
    const response = await fetch(url, {
      method: "POST", cache: "no-store", redirect: "error", signal: controller.signal,
      headers: { "content-type": "application/json", accept: "application/json", ...(gemini ? { "x-goog-api-key": config.key } : { authorization: `Bearer ${config.key}` }) },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw httpError(response.status, provider, config.model);
    let json: unknown;
    try { json = await response.json(); } catch (error) {
      if (controller.signal.aborted) throw new ProviderError("timeout", { transient: true, provider, model: config.model });
      if (!(error instanceof SyntaxError)) throw new ProviderError("network", { transient: true, provider, model: config.model });
      throw new ProviderError("invalid_output", { provider, model: config.model });
    }
    if (gemini) {
      const parsed = geminiResponse.safeParse(json);
      if (!parsed.success || parsed.data.candidates[0].content.parts.some((part) => part.thought)) throw new ProviderError("invalid_output", { provider, model: config.model });
      const result = parseFacts(parsed.data.candidates[0].content.parts.map((part) => part.text).join(""), provider, config.model);
      return { result, provider, model: parsed.data.modelVersion ?? config.model, providerResponseId: parsed.data.responseId, latencyMs: Date.now() - started, usage: { inputTokens: parsed.data.usageMetadata?.promptTokenCount, outputTokens: parsed.data.usageMetadata?.candidatesTokenCount } };
    }
    const parsed = chatResponse.safeParse(json);
    if (!parsed.success || parsed.data.choices[0].message.refusal) throw new ProviderError("invalid_output", { provider, model: config.model });
    return { result: parseFacts(parsed.data.choices[0].message.content, provider, config.model), provider, model: parsed.data.model ?? config.model, providerResponseId: parsed.data.id, latencyMs: Date.now() - started, usage: { inputTokens: parsed.data.usage?.prompt_tokens, outputTokens: parsed.data.usage?.completion_tokens } };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(controller.signal.aborted ? "timeout" : "network", { transient: true, provider, model: config.model });
  } finally {
    clearTimeout(timeout);
  }
}
