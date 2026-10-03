export type IntegrationProvider = "gmail" | "whatsapp";

export type MessageDirection = "inbound" | "outbound";

export type EmailAddress = { name?: string; email: string; phone?: never };
export type PhoneAddress = { name?: string; phone: string; email?: never };
export type NormalizedAddress = EmailAddress | PhoneAddress;

export interface NormalizedAttachment {
  providerAttachmentId?: string | null;
  filename: string;
  mimeType: string;
  size: number;
}

export interface NormalizedMessage {
  provider: IntegrationProvider;
  providerMessageId: string;
  providerConversationId: string;
  sender?: NormalizedAddress;
  recipients: NormalizedAddress[];
  cc: NormalizedAddress[];
  subject: string;
  text: string;
  displayText: string;
  html?: string | null;
  attachments: NormalizedAttachment[];
  messageIdHeader?: string | null;
  inReplyTo?: string | null;
  references: string[];
  occurredAt: Date;
  direction: MessageDirection;
  unread: boolean;
  untrustedCustomerContent: true;
}

export function addressValue(address: NormalizedAddress): string {
  return address.email ?? address.phone;
}
