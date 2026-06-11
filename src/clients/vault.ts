// src/clients/vault.ts
// Retrieves and decrypts customer AI provider API keys from Supabase Vault.
// Keys are NEVER stored in plaintext. Never logged. Never exposed in API responses.

import { createClient } from '@supabase/supabase-js'
import { redis } from './redis.js'

let _supabase: ReturnType<typeof createClient> | null = null

function getSupabase(): ReturnType<typeof createClient> {
  if (_supabase) return _supabase
  const url = process.env['SUPABASE_URL']
  const key = process.env['SUPABASE_SERVICE_KEY']
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required for Vault operations')
  }
  _supabase = createClient(url, key)
  return _supabase
}


export type Provider = 'anthropic' | 'openai' | 'gemini' | 'aws_bedrock'

// Cache decrypted keys in Redis for 5 minutes to avoid Vault round-trips on every call.
// TTL is short enough that key rotation takes effect quickly.
export async function getDecryptedApiKey(
  orgId: string,
  provider: Provider
): Promise<string | null> {
  const cacheKey = `vault:key:${orgId}:${provider}`

  const cached = await redis.get(cacheKey)
  if (cached) return cached

  // Fetch key reference from organizations table
  const { data: org, error } = await getSupabase()
    .from('organizations')
    .select(`${provider}_key_ref`)
    .eq('id', orgId)
    .single()

  if (error || !org) return null

  const keyRef = (org as Record<string, unknown>)[`${provider}_key_ref`] as string | null | undefined
  if (!keyRef) return null

  // Retrieve from Supabase Vault
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: vaultData, error: vaultError } = await (getSupabase() as any)
    .rpc('vault.decrypted_secrets', { secret_name: keyRef })

  if (vaultError || !vaultData) return null

  const decryptedKey = vaultData as string
  await redis.setex(cacheKey, 300, decryptedKey) // 5 min cache
  return decryptedKey
}

export async function storeApiKey(
  orgId: string,
  provider: Provider,
  rawKey: string
): Promise<boolean> {
  const secretName = `org_${orgId}_${provider}_key`

  // Store in Vault
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: vaultError } = await (getSupabase() as any)
    .rpc('vault.create_secret', {
      new_secret: rawKey,
      new_name: secretName,
    })

  if (vaultError) return false

  // Store reference in organizations table
  const column = `${provider}_key_ref`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (getSupabase() as any)
    .from('organizations')
    .update({ [column]: secretName })
    .eq('id', orgId)

  if (updateError) return false

  // Invalidate cache
  await redis.del(`vault:key:${orgId}:${provider}`)
  return true
}
