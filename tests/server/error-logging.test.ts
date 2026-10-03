import { afterEach, expect, test, vi } from "vitest";
import { safeErrorResponse, SupportError } from "@/server/errors";
import { getDatabaseUrl } from "@/server/db/client";
import { serverLog, serverErrorLog } from "@/server/logging";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

test("API errors hide unexpected SQL/credential details but preserve safe error categories", () => {
  const secret = "private-token-and-message";
  expect(safeErrorResponse(new Error(`Failed query with params ${secret}`))).toEqual({
    error: "unknown", message: "An unexpected server error occurred. Please try again.", retryable: false,
  });
  expect(safeErrorResponse(new SupportError("sync_locked", "A Gmail synchronization is already running", { retryable: true })))
    .toMatchObject({ error: "sync_locked", message: "A Gmail synchronization is already running", retryable: true });
  vi.stubEnv("DATABASE_URL", "");
  expect(() => getDatabaseUrl()).toThrow("DATABASE_URL is required");
});

test.each(["info", "error"] as const)("%s logs omit credentials, authorization and message content", (level) => {
  const log = vi.spyOn(console, level).mockImplementation(() => {});
  const emit = level === "info" ? serverLog : serverErrorLog;
  emit("gmail_test", {
    integrationId: "integration-id", messagesInserted: 1,
    accessToken: "private", refresh_token: "private", secret: "private", password: "private",
    authorization: "private", oauthCode: "private", body: "private", content: "private", encryptionKey: "private",
  });
  expect(log).toHaveBeenCalledOnce();
  const output = JSON.parse(log.mock.calls[0][0]);
  expect(output).toMatchObject({ level, event: "gmail_test", integrationId: "integration-id", messagesInserted: 1 });
  expect(JSON.stringify(output)).not.toContain("private");
});
