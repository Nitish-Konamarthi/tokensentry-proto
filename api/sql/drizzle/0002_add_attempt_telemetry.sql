-- Add attempt history and fallback tracking columns to usage_logs and routing_logs

ALTER TABLE "usage_logs" ADD COLUMN IF NOT EXISTS "attempts" jsonb;
ALTER TABLE "usage_logs" ADD COLUMN IF NOT EXISTS "fallback_used" boolean;

ALTER TABLE "routing_logs" ADD COLUMN IF NOT EXISTS "attempts" jsonb;
ALTER TABLE "routing_logs" ADD COLUMN IF NOT EXISTS "fallback_used" boolean;
