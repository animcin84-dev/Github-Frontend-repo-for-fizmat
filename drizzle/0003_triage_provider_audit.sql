ALTER TABLE "conversation_analyses" ADD COLUMN "configuration_version" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_analyses" ADD COLUMN "latency_ms" integer;--> statement-breakpoint
ALTER TABLE "conversation_analyses" ADD COLUMN "usage" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_analyses" ADD COLUMN "provider_attempts" jsonb DEFAULT '[]'::jsonb NOT NULL;