CREATE TABLE "conversation_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"provider_response_id" text,
	"prompt_version" text NOT NULL,
	"workflow_version" text NOT NULL,
	"source_hash" text NOT NULL,
	"input_message_ids" jsonb NOT NULL,
	"input_truncated" boolean DEFAULT false NOT NULL,
	"result" jsonb,
	"priority" text,
	"priority_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"priority_policy_version" text,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_analyses" ADD CONSTRAINT "conversation_analyses_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analysis_conversation_created_idx" ON "conversation_analyses" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_active_conversation_uq" ON "conversation_analyses" USING btree ("conversation_id") WHERE "conversation_analyses"."status" in ('pending', 'running');