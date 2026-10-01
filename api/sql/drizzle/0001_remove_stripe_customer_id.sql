-- Remove stripe_customer_id column and its unique constraint from organizations table
-- This column was used for Stripe billing which has been removed from V1

ALTER TABLE "organizations" DROP COLUMN IF EXISTS "stripe_customer_id";