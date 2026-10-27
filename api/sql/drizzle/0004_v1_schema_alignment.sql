-- Bring persisted request and routing telemetry in line with the V1 Drizzle schema.
ALTER TABLE "usage_logs" ADD COLUMN IF NOT EXISTS "model_owner" text;
ALTER TABLE "usage_logs" ADD COLUMN IF NOT EXISTS "canonical_model" text;
ALTER TABLE "usage_logs" ADD COLUMN IF NOT EXISTS "upstream" text;
ALTER TABLE "usage_logs" ADD COLUMN IF NOT EXISTS "upstream_model" text;
ALTER TABLE "usage_logs" ADD COLUMN IF NOT EXISTS "route_priority" integer;
ALTER TABLE "usage_logs" ADD COLUMN IF NOT EXISTS "attempt_number" integer;
ALTER TABLE "usage_logs" ADD COLUMN IF NOT EXISTS "fallback_upstream" text;
ALTER TABLE "usage_logs" ADD COLUMN IF NOT EXISTS "success" boolean;
ALTER TABLE "usage_logs" ADD COLUMN IF NOT EXISTS "normalized_error_category" text;
--> statement-breakpoint
ALTER TABLE "routing_logs" ADD COLUMN IF NOT EXISTS "canonical_model" text;
ALTER TABLE "routing_logs" ADD COLUMN IF NOT EXISTS "model_owner" text;
ALTER TABLE "routing_logs" ADD COLUMN IF NOT EXISTS "upstream" text;
ALTER TABLE "routing_logs" ADD COLUMN IF NOT EXISTS "upstream_model" text;
ALTER TABLE "routing_logs" ADD COLUMN IF NOT EXISTS "route_priority" integer;
ALTER TABLE "routing_logs" ADD COLUMN IF NOT EXISTS "attempt_number" integer;
ALTER TABLE "routing_logs" ADD COLUMN IF NOT EXISTS "fallback_upstream" text;
ALTER TABLE "routing_logs" ADD COLUMN IF NOT EXISTS "success" boolean;
ALTER TABLE "routing_logs" ADD COLUMN IF NOT EXISTS "normalized_error_category" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_logs_upstream_idx" ON "usage_logs" USING btree ("org_id", "upstream");
