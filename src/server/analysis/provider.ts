import type { TriageInput, TriageProvider } from "./contracts";
import { callProvider, guardProviderExecution, validateProviderInput } from "./provider-adapters";
import { getProviderAvailability, getTriageConfigurationVersion, providerConfig, providerOrder, type ProviderId } from "./provider-config";
import { ProviderError, type ProviderAttempt } from "./provider-errors";

export type { TriageInput, TriageProvider } from "./contracts";
export { getProviderAvailability, getTriageConfigurationVersion, DEFAULT_GROQ_MODEL, DEFAULT_GEMINI_MODEL, DEFAULT_HF_MODEL } from "./provider-config";
export { ProviderError } from "./provider-errors";
export type { ProviderAttempt, ProviderErrorCategory } from "./provider-errors";
export { TRIAGE_PROMPT_VERSION } from "./prompt";

export function getIndividualProvider(provider: ProviderId): TriageProvider {
  guardProviderExecution();
  if (!["groq", "gemini", "huggingface"].includes(provider)) throw new ProviderError("configuration");
  const config = providerConfig(provider);
  if (!config.key) throw new ProviderError("configuration", { provider, model: config.model });
  return {
    id: provider, model: config.model,
    async analyze(input: TriageInput) {
      const started = Date.now();
      try {
        const response = await callProvider(provider, input);
        return { ...response, attempts: [{ provider, model: response.model, status: "completed" as const, latencyMs: response.latencyMs }] };
      } catch (error) {
        if (error instanceof ProviderError) error.attempts = [{ provider, model: config.model, status: "failed", latencyMs: Date.now() - started, errorCode: error.category }];
        throw error;
      }
    },
  };
}

/** One attempt per configured provider; deterministic failures stop immediately. */
export function getTriageProvider(): TriageProvider {
  guardProviderExecution();
  const availability = getProviderAvailability();
  if (!availability.configured) throw new ProviderError("configuration", { provider: availability.provider, model: availability.model });
  const order = providerOrder();
  const configurationVersion = getTriageConfigurationVersion();
  return {
    id: "orchestrator", model: configurationVersion,
    async analyze(input: TriageInput) {
      guardProviderExecution();
      validateProviderInput(input);
      const started = Date.now();
      const attempts: ProviderAttempt[] = [];
      let lastError: ProviderError | undefined;
      for (const provider of order) {
        const configured = availability.providers.find((entry) => entry.provider === provider);
        if (!configured?.configured) continue;
        const remaining = 45_000 - (Date.now() - started);
        if (remaining <= 0) break;
        const attemptStarted = Date.now();
        try {
          const response = await callProvider(provider, input, Math.min(remaining, 15_000));
          attempts.push({ provider, model: response.model, status: "completed", latencyMs: response.latencyMs });
          return { ...response, latencyMs: Date.now() - started, attempts };
        } catch (error) {
          const safe = error instanceof ProviderError ? error : new ProviderError("unsupported_request", { provider, model: configured.model });
          attempts.push({ provider, model: configured.model, status: "failed", latencyMs: Date.now() - attemptStarted, errorCode: safe.category });
          safe.attempts = [...attempts];
          if (!safe.transient) throw safe;
          lastError = safe;
        }
      }
      const error = lastError ?? new ProviderError("timeout", { transient: true });
      error.attempts = attempts;
      throw error;
    },
  };
}
