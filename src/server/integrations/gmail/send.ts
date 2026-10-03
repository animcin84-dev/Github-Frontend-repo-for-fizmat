import { createHash } from "node:crypto";
import MailComposer from "nodemailer/lib/mail-composer";

function stableMessageId(clientRequestId: string, mailboxEmail: string) {
  const digest = createHash("sha256").update(clientRequestId).digest("hex").slice(0, 24);
  const domain = mailboxEmail.split("@")[1]?.replace(/[^a-z0-9.-]/gi, "") || "support.local";
  return `<support-${digest}@${domain}>`;
}

export async function buildReplyMime(input: {
  mailboxEmail: string;
  recipientEmail: string;
  subject: string;
  text: string;
  inReplyTo?: string | null;
  references?: string[];
  clientRequestId: string;
}) {
  const messageId = stableMessageId(input.clientRequestId, input.mailboxEmail);
  const headers: Record<string, string> = { "Message-ID": messageId };
  if (input.inReplyTo) headers["In-Reply-To"] = input.inReplyTo;
  const refs = [...(input.references ?? []), ...(input.inReplyTo ? [input.inReplyTo] : [])];
  if (refs.length) headers.References = [...new Set(refs)].join(" ");

  const composer = new MailComposer({
    from: input.mailboxEmail,
    to: input.recipientEmail,
    subject: input.subject,
    text: input.text,
    headers,
  });
  const buffer = await composer.compile().build();
  return {
    raw: buffer.toString("base64url"),
    messageIdHeader: messageId,
  };
}
