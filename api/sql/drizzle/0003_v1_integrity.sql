ALTER TABLE "usage_logs" ALTER COLUMN "team_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "usage_logs" ADD COLUMN IF NOT EXISTS "usage_estimated" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_sessions" DROP CONSTRAINT IF EXISTS "agent_sessions_session_id_unique";
--> statement-breakpoint
ALTER TABLE "agent_sessions" DROP CONSTRAINT IF EXISTS "agent_sessions_session_id_key";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_sessions_org_session_unique" ON "agent_sessions" USING btree ("org_id", "session_id");
--> statement-breakpoint
UPDATE "organizations"
SET "model_policy" = jsonb_set(
  "model_policy", '{allowed_models}', '["anthropic/claude-haiku-4-5","anthropic/claude-sonnet-4-6"]'::jsonb, true
)
WHERE "model_policy"->'allowed_models' = '["claude-haiku-4-5","claude-sonnet-4-6"]'::jsonb;
--> statement-breakpoint
UPDATE "organizations"
SET "model_policy" = jsonb_set("model_policy", '{max_model_tier}', '"high"'::jsonb, true)
WHERE COALESCE("model_policy"->>'max_model_tier', '') NOT IN ('low', 'standard', 'high', 'premium');
--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "model_policy" SET DEFAULT '{"allowed_models":["anthropic/claude-haiku-4-5","anthropic/claude-sonnet-4-6"],"max_model_tier":"high","require_classification":true,"allow_opus":false}'::jsonb;
