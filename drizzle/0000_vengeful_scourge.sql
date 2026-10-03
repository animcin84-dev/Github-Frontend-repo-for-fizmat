CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"provider_attachment_id" text,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_account_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_conversation_id" text NOT NULL,
	"subject" text DEFAULT '(no subject)' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"customer_participant_id" uuid,
	"first_message_at" timestamp with time zone NOT NULL,
	"latest_message_at" timestamp with time zone NOT NULL,
	"unread" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"email_address" text NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disconnected_at" timestamp with time zone,
	"encrypted_refresh_token" text,
	"granted_scopes" jsonb NOT NULL,
	"last_history_id" text,
	"watch_expiration" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"sync_state" text DEFAULT 'idle' NOT NULL,
	"last_error" text,
	"sync_query" text DEFAULT 'in:inbox newer_than:30d' NOT NULL,
	"backfill_days" integer DEFAULT 30 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_account_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_message_id" text NOT NULL,
	"provider_thread_id" text NOT NULL,
	"direction" text NOT NULL,
	"from_address" text,
	"from_name" text,
	"to_recipients" jsonb NOT NULL,
	"cc_recipients" jsonb NOT NULL,
	"subject" text DEFAULT '(no subject)' NOT NULL,
	"text_body" text DEFAULT '' NOT NULL,
	"display_text_body" text DEFAULT '' NOT NULL,
	"html_body" text,
	"provider_message_id_header" text,
	"in_reply_to" text,
	"references_header" jsonb NOT NULL,
	"sent_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_account_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"client_request_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"provider_message_id" text,
	"provider_thread_id" text,
	"provider_error_code" text,
	"provider_error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text,
	"phone" text,
	"provider_identity" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pubsub_notifications" (
	"message_id" text PRIMARY KEY NOT NULL,
	"email_address" text NOT NULL,
	"history_id" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sync_locks" (
	"integration_account_id" uuid PRIMARY KEY NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"owner" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"messages_found" integer DEFAULT 0 NOT NULL,
	"messages_inserted" integer DEFAULT 0 NOT NULL,
	"messages_skipped" integer DEFAULT 0 NOT NULL,
	"threads_found" integer DEFAULT 0 NOT NULL,
	"history_id_before" text,
	"history_id_after" text,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_integration_account_id_integration_accounts_id_fk" FOREIGN KEY ("integration_account_id") REFERENCES "public"."integration_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customer_participant_id_participants_id_fk" FOREIGN KEY ("customer_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_integration_account_id_integration_accounts_id_fk" FOREIGN KEY ("integration_account_id") REFERENCES "public"."integration_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_operations" ADD CONSTRAINT "outbound_operations_integration_account_id_integration_accounts_id_fk" FOREIGN KEY ("integration_account_id") REFERENCES "public"."integration_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_operations" ADD CONSTRAINT "outbound_operations_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_locks" ADD CONSTRAINT "sync_locks_integration_account_id_integration_accounts_id_fk" FOREIGN KEY ("integration_account_id") REFERENCES "public"."integration_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_integration_account_id_integration_accounts_id_fk" FOREIGN KEY ("integration_account_id") REFERENCES "public"."integration_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachment_message_idx" ON "attachments" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_provider_thread_uq" ON "conversations" USING btree ("integration_account_id","provider_conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_latest_idx" ON "conversations" USING btree ("latest_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_provider_account_uq" ON "integration_accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "integration_email_idx" ON "integration_accounts" USING btree ("email_address");--> statement-breakpoint
CREATE UNIQUE INDEX "message_provider_id_uq" ON "messages" USING btree ("integration_account_id","provider_message_id");--> statement-breakpoint
CREATE INDEX "message_conversation_time_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "outbound_idempotency_uq" ON "outbound_operations" USING btree ("integration_account_id","client_request_id");--> statement-breakpoint
CREATE INDEX "outbound_conversation_idx" ON "outbound_operations" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participant_provider_identity_uq" ON "participants" USING btree ("provider_identity");--> statement-breakpoint
CREATE INDEX "pubsub_email_idx" ON "pubsub_notifications" USING btree ("email_address");--> statement-breakpoint
CREATE INDEX "sync_run_integration_idx" ON "sync_runs" USING btree ("integration_account_id","created_at");