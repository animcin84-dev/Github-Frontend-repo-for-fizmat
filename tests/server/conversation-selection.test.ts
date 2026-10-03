import { afterEach, describe, expect, test, vi } from "vitest";
import { isDatabaseConversationId, resolveInboxConversationId } from "@/lib/conversation-selection";
import { getConversationContext } from "@/server/repositories/conversations";
import { GET } from "@/app/api/conversations/[conversationId]/route";
import { getConversationDetail } from "@/lib/client/conversation-api";

const realId = "11111111-1111-4111-8111-111111111111";
const olderId = "22222222-2222-4222-8222-222222222222";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("mode-aware inbox selection", () => {
  test("database selection never falls back to fixture IDs", () => {
    expect(resolveInboxConversationId([], undefined, "database")).toBeUndefined();
    expect(resolveInboxConversationId([{ id: "conv-00001" }], "conv-00001", "database")).toBeUndefined();
    expect(resolveInboxConversationId([{ id: realId }], "conv-00001", "database")).toBe(realId);
    expect(resolveInboxConversationId([{ id: realId }], undefined, "database")).toBe(realId);
  });

  test("real deep links remain valid even beyond the list limit", () => {
    expect(resolveInboxConversationId([{ id: realId }], olderId, "database")).toBe(olderId);
    expect(isDatabaseConversationId(realId)).toBe(true);
    expect(isDatabaseConversationId("conv-00001")).toBe(false);
  });

  test("mock selection and stale mock routes use the loaded list", () => {
    const items = [{ id: "conv-00001" }, { id: "conv-00002" }];
    expect(resolveInboxConversationId(items, "conv-00002", "mock")).toBe("conv-00002");
    expect(resolveInboxConversationId(items, "missing", "mock")).toBe("conv-00001");
  });

  test("malformed database IDs return 404 without reaching PostgreSQL", async () => {
    vi.stubEnv("SUPPORT_DATA_MODE", "database");
    vi.stubEnv("DATABASE_URL", "");
    expect(await getConversationContext("conv-00001")).toBeUndefined();
    const response = await GET(new Request("http://localhost/api/conversations/conv-00001"), {
      params: Promise.resolve({ conversationId: "conv-00001" }),
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found", message: "Conversation not found" });
  });

  test("a missing detail can recover without retrying a 404 as a server error", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", fetch);
    expect(await getConversationDetail(olderId)).toBeNull();
    expect(fetch).toHaveBeenCalledOnce();
  });
});
