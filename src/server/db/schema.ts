import type { NormalizedAddress } from "@/server/integrations/types";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const integrationAccounts = pgTable(
  "integration_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    emailAddress: text("email_address"),
    status: text("status").notNull().default("connected"),
    connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow().notNull(),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    grantedScopes: jsonb("granted_scopes").$type<string[]>().notNull(),
    lastHistoryId: text("last_history_id"),
    watchExpiration: timestamp("watch_expiration", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    syncState: text("sync_state").notNull().default("idle"),
    lastError: text("last_error"),
    syncQuery: text("sync_query").notNull().default("in:inbox newer_than:30d"),
    backfillDays: integer("backfill_days").notNull().default(30),
  },
  (table) => [
    uniqueIndex("integration_provider_account_uq").on(table.provider, table.providerAccountId),
    index("integration_email_idx").on(table.emailAddress),
  ],
);

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name"),
    email: text("email"),
    phone: text("phone"),
    providerIdentity: text("provider_identity"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("participant_provider_identity_uq").on(table.providerIdentity)],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    integrationAccountId: uuid("integration_account_id")
      .notNull()
      .references(() => integrationAccounts.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerConversationId: text("provider_conversation_id").notNull(),
    subject: text("subject").notNull().default("(no subject)"),
    status: text("status").notNull().default("new"),
    customerParticipantId: uuid("customer_participant_id").references(() => participants.id),
    firstMessageAt: timestamp("first_message_at", { withTimezone: true }).notNull(),
    latestMessageAt: timestamp("latest_message_at", { withTimezone: true }).notNull(),
    unread: boolean("unread").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("conversation_provider_thread_uq").on(
      table.integrationAccountId,
      table.providerConversationId,
    ),
    index("conversation_latest_idx").on(table.latestMessageAt),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    integrationAccountId: uuid("integration_account_id")
      .notNull()
      .references(() => integrationAccounts.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerMessageId: text("provider_message_id").notNull(),
    providerThreadId: text("provider_thread_id").notNull(),
    direction: text("direction").notNull(),
    fromAddress: text("from_address"),
    fromName: text("from_name"),
    toRecipients: jsonb("to_recipients").$type<NormalizedAddress[]>().notNull(),
    ccRecipients: jsonb("cc_recipients").$type<NormalizedAddress[]>().notNull(),
    subject: text("subject").notNull().default("(no subject)"),
    textBody: text("text_body").notNull().default(""),
    displayTextBody: text("display_text_body").notNull().default(""),
    htmlBody: text("html_body"),
    providerMessageIdHeader: text("provider_message_id_header"),
    inReplyTo: text("in_reply_to"),
    referencesHeader: jsonb("references_header").$type<string[]>().notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("message_provider_id_uq").on(table.integrationAccountId, table.providerMessageId),
    index("message_conversation_time_idx").on(table.conversationId, table.createdAt),
  ],
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    providerAttachmentId: text("provider_attachment_id"),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    size: bigint("size", { mode: "number" }).notNull().default(0),
  },
  (table) => [index("attachment_message_idx").on(table.messageId)],
);

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    integrationAccountId: uuid("integration_account_id")
      .notNull()
      .references(() => integrationAccounts.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("queued"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    messagesFound: integer("messages_found").notNull().default(0),
    messagesInserted: integer("messages_inserted").notNull().default(0),
    messagesSkipped: integer("messages_skipped").notNull().default(0),
    threadsFound: integer("threads_found").notNull().default(0),
    historyIdBefore: text("history_id_before"),
    historyIdAfter: text("history_id_after"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("sync_run_integration_idx").on(table.integrationAccountId, table.createdAt)],
);

export const outboundOperations = pgTable(
  "outbound_operations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    integrationAccountId: uuid("integration_account_id")
      .notNull()
      .references(() => integrationAccounts.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    clientRequestId: text("client_request_id").notNull(),
    status: text("status").notNull().default("pending"),
    attempt: integer("attempt").notNull().default(0),
    providerMessageId: text("provider_message_id"),
    providerThreadId: text("provider_thread_id"),
    providerErrorCode: text("provider_error_code"),
    providerErrorMessage: text("provider_error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("outbound_idempotency_uq").on(table.integrationAccountId, table.clientRequestId),
    index("outbound_conversation_idx").on(table.conversationId),
  ],
);

export const syncLocks = pgTable("sync_locks", {
  integrationAccountId: uuid("integration_account_id")
    .primaryKey()
    .references(() => integrationAccounts.id, { onDelete: "cascade" }),
  acquiredAt: timestamp("acquired_at", { withTimezone: true }).defaultNow().notNull(),
  owner: text("owner").notNull(),
});

export const pubsubNotifications = pgTable(
  "pubsub_notifications",
  {
    messageId: text("message_id").primaryKey(),
    emailAddress: text("email_address").notNull(),
    historyId: text("history_id").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [index("pubsub_email_idx").on(table.emailAddress)],
);
