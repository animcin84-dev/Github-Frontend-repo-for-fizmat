import { simpleParser } from "mailparser";
import { beforeEach, describe, expect, test } from "vitest";
import { decryptToken, encryptToken } from "@/server/crypto/token-encryption";
import { buildOAuthAuthorizationUrl, createOAuthState, validateOAuthState } from "@/server/integrations/gmail/oauth";
import { extractPresentationText, normalizeGmailMessage } from "@/server/integrations/gmail/parser";
import { buildReplyMime } from "@/server/integrations/gmail/send";
import { rawFixture } from "./fixtures/gmail";

beforeEach(() => {
  process.env.GMAIL_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.GMAIL_OAUTH_STATE_SECRET = "unit-test-oauth-state-secret";
  process.env.GOOGLE_CLIENT_ID = "client.example";
  process.env.GOOGLE_CLIENT_SECRET = "secret.example";
  process.env.GOOGLE_REDIRECT_URI = "http://localhost:3000/api/integrations/gmail/callback";
});

describe("OAuth state and token storage", () => {
  test("OAuth state is signed, bound to the cookie and time limited", () => {
    const now = 1_700_000_000_000;
    const state = createOAuthState(now);
    expect(validateOAuthState(state, state, now + 1_000).flow).toBe("gmail-connect");
    expect(() => validateOAuthState(state, state + "x", now + 1_000)).toThrow(/state/i);
    expect(() => validateOAuthState(state, state, now + 11 * 60_000)).toThrow(/expired/i);
    const url = new URL(buildOAuthAuthorizationUrl(state));
    expect(url.searchParams.get("state")).toBe(state);
    expect(url.searchParams.get("scope")).toContain("gmail.readonly");
    expect(url.searchParams.get("scope")).toContain("gmail.send");
  });

  test("refresh token encryption round trips and is randomized", () => {
    const a = encryptToken("refresh-token-value");
    const b = encryptToken("refresh-token-value");
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe("refresh-token-value");
    expect(a).not.toContain("refresh-token-value");
  });
});

describe("Gmail normalization and MIME reply construction", () => {
  test("normalizes inbound and outbound direction without treating all thread messages as inbound", async () => {
    const inbound = await normalizeGmailMessage(rawFixture({
      id: "m-in",
      threadId: "thread-1",
      from: "Customer <customer@example.test>",
      to: "support@example.test",
      body: "Current question\n\nOn Fri, Someone wrote:\n> old history",
    }), "support@example.test");
    const outbound = await normalizeGmailMessage(rawFixture({
      id: "m-out",
      threadId: "thread-1",
      from: "support@example.test",
      to: "customer@example.test",
    }), "support@example.test");

    expect(inbound.direction).toBe("inbound");
    expect(outbound.direction).toBe("outbound");
    expect(inbound.providerConversationId).toBe("thread-1");
    expect(inbound.displayText).toBe("Current question");
    expect(inbound.text).toContain("old history");
    expect(inbound.untrustedCustomerContent).toBe(true);
  });

  test("conservative quoted extraction preserves uncertain content", () => {
    expect(extractPresentationText("Short\n> maybe quote")).toBe("Short\n> maybe quote");
    expect(extractPresentationText("A sufficiently long new reply here.\nOn Fri, Person wrote:\n> old")).toBe("A sufficiently long new reply here.");
  });

  test("normalizes Gmail full payload without fetching attachment bodies", async () => {
    const full = await normalizeGmailMessage({
      id: "full-1",
      threadId: "thread-full",
      labelIds: ["INBOX", "UNREAD"],
      internalDate: String(Date.parse("2026-10-03T12:00:00Z")),
      payload: {
        mimeType: "multipart/mixed",
        headers: [
          { name: "From", value: "Customer <customer@example.test>" },
          { name: "To", value: "support@example.test" },
          { name: "Subject", value: "Attachment metadata only" },
          { name: "Date", value: "Sat, 03 Oct 2026 12:00:00 +0000" },
          { name: "Message-ID", value: "<full-1@example.test>" },
        ],
        parts: [
          { mimeType: "text/plain", body: { data: Buffer.from("Hello from Gmail full payload").toString("base64url"), size: 29 } },
          { mimeType: "application/pdf", filename: "invoice.pdf", body: { attachmentId: "att-1", size: 128_000 } },
        ],
      },
    }, "support@example.test");
    expect(full.text).toBe("Hello from Gmail full payload");
    expect(full.attachments).toEqual([{
      providerAttachmentId: "att-1",
      filename: "invoice.pdf",
      mimeType: "application/pdf",
      size: 128_000,
    }]);
  });

  test("HTML-only Gmail payload produces a plain-text Inbox body without executing HTML", async () => {
    const normalized = await normalizeGmailMessage({
      id: "html-only",
      threadId: "thread-html",
      labelIds: ["INBOX"],
      payload: {
        mimeType: "text/html",
        headers: [
          { name: "From", value: "customer@example.test" },
          { name: "To", value: "support@example.test" },
          { name: "Subject", value: "HTML support request" },
          { name: "Message-ID", value: "<html-only@example.test>" },
        ],
        body: {
          data: Buffer.from("<p>Hello <strong>support</strong>.</p><script>window.bad=true</script>").toString("base64url"),
          size: 72,
        },
      },
    }, "support@example.test");
    expect(normalized.text).toContain("Hello support");
    expect(normalized.displayText).toContain("Hello support");
    expect(normalized.html).toContain("<script>");
    expect(normalized.text).not.toContain("<script>");
  });

  test("builds RFC MIME reply with same-thread headers", async () => {
    const result = await buildReplyMime({
      mailboxEmail: "support@example.test",
      recipientEmail: "customer@example.test",
      subject: "Original subject",
      text: "Human reply",
      inReplyTo: "<previous@example.test>",
      references: ["<root@example.test>"],
      clientRequestId: "11111111-1111-4111-8111-111111111111",
    });
    const parsed = await simpleParser(Buffer.from(result.raw, "base64url"));
    expect(parsed.subject).toBe("Original subject");
    expect(parsed.inReplyTo).toBe("<previous@example.test>");
    expect(parsed.references).toEqual(expect.arrayContaining(["<root@example.test>", "<previous@example.test>"]));
    expect(parsed.text?.trim()).toBe("Human reply");
    expect(parsed.messageId).toBe(result.messageIdHeader);
  });
});
