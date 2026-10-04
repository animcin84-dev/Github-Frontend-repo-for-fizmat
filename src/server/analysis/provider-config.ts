import { createHash } from "node:crypto";
import { ProviderError } from "./provider-errors";

export type ProviderId = "groq" | "gemini" | "huggingface";
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
export const DEFAULT_HF_MODEL = "openai/gpt-oss-20b:novita";
const ids: ProviderId[] = ["groq", "gemini", "huggingface"];
const keyNames = { groq: "GROQ_API_KEY", gemini: "GEMINI_API_KEY", huggingface: "HF_TOKEN" } as const;
const hfProviders = new Set(["novita", "groq", "together", "fireworks-ai", "deepinfra", "hf-inference", "featherless-ai", "nscale", "ovhcloud", "scaleway", "publicai"]);

export function modelFor(provider: ProviderId): string {
  const value = provider === "groq" ? process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL : provider === "gemini" ? process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL : process.env.HF_MODEL?.trim() || DEFAULT_HF_MODEL;
  if (value.length > 160 || /cerebras/i.test(value)) throw new ProviderError("configuration");
  if (provider === "huggingface") {
    const match = /^([\w.-]+\/[\w.-]+):([a-z0-9-]+)$/.exec(value);
    if (!match || !hfProviders.has(match[2])) throw new ProviderError("configuration");
  } else if (!/^[\w./-]+$/.test(value)) throw new ProviderError("configuration");
  return value;
}

export function providerOrder(): ProviderId[] {
  const primary = process.env.AI_PRIMARY_PROVIDER?.trim() || "groq";
  if (!ids.includes(primary as ProviderId)) throw new ProviderError("configuration");
  return [primary as ProviderId, ...ids.filter((id) => id !== primary)];
}

export function providerConfig(provider: ProviderId) {
  const requiredKey = keyNames[provider];
  const model = modelFor(provider);
  return { provider, model, requiredKey, key: process.env[requiredKey]?.trim() || "" };
}

export function getProviderAvailability() {
  try {
    const order = providerOrder();
    const providers = order.map((provider) => {
      try {
        const config = providerConfig(provider);
        return { provider, model: config.model, requiredKey: config.requiredKey, configured: Boolean(config.key) };
      } catch {
        return { provider, model: "unsupported configuration", requiredKey: keyNames[provider], configured: false };
      }
    });
    const primary = providers[0];
    return { configured: primary.configured, provider: primary.provider, model: primary.model, requiredKey: primary.requiredKey, providers };
  } catch {
    return { configured: false, provider: "unsupported", model: "unsupported configuration", requiredKey: "AI_PRIMARY_PROVIDER", providers: [] };
  }
}

/** No key values are included. Changes in order/models invalidate cached analyses. */
export function getTriageConfigurationVersion(): string {
  const config = getProviderAvailability();
  return `triage-providers-v1:${createHash("sha256").update(JSON.stringify(config.providers.map(({ provider, model }) => ({ provider, model })))).digest("hex").slice(0, 24)}`;
}
