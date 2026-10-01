import { pg } from '../clients/postgres.js'
import { valkey, ValkeyKeys } from '../clients/valkey.js'
import { hashApiKey } from '../lib/crypto.js'
import { logger } from '../lib/logger.js'
import { env } from '../config/env.js'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { AuthContext } from '../types/index.js'

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null
function getJwks() {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${env.AUTH0_DOMAIN}/.well-known/jwks.json`))
  }
  return jwks
}

export class AuthService {
  private readonly AUTH_CACHE_TTL = 300

  async authenticateApiKey(rawKey: string, ip: string): Promise<AuthContext> {
    const keyHash = hashApiKey(rawKey)
    const cacheKey = ValkeyKeys.authKey(keyHash.slice(0, 16))

    const cached = await valkey.get(cacheKey)
    if (cached) return JSON.parse(cached) as AuthContext

    const rows = await pg<Array<{
      key_id: string; org_id: string; team_id: string; user_id: string
      role: string; plan: string; scopes: string[]
    }>>`
      SELECT
        k.id AS key_id, k.org_id,
        COALESCE(k.team_id::text, '') AS team_id,
        COALESCE(k.user_id::text, '') AS user_id,
        COALESCE(m.role, 'member') AS role,
        o.plan, k.scopes
      FROM api_keys k
      JOIN organizations o ON o.id = k.org_id
      LEFT JOIN org_members m ON m.org_id = k.org_id AND m.user_id = k.user_id
      WHERE k.key_hash = ${keyHash}
        AND k.revoked_at IS NULL
        AND (k.expires_at IS NULL OR k.expires_at > NOW())
      LIMIT 1
    `

    const row = rows[0]
    if (!row) throw new Error('INVALID_API_KEY')

    const ctx: AuthContext = {
      orgId: row.org_id,
      teamId: row.team_id,
      userId: row.user_id,
      keyId: row.key_id,
      role: row.role as AuthContext['role'],
      plan: row.plan as AuthContext['plan'],
    }

    await valkey.setex(cacheKey, this.AUTH_CACHE_TTL, JSON.stringify(ctx))
    void pg`UPDATE api_keys SET last_used_at = NOW(), last_used_ip = ${ip}::inet WHERE id = ${row.key_id}`

    return ctx
  }

  async authenticateJWT(token: string): Promise<{ sub: string; email?: string }> {
    try {
      const { payload } = await jwtVerify(token, getJwks(), {
        issuer: `https://${env.AUTH0_DOMAIN}/`,
        audience: env.AUTH0_AUDIENCE,
      })

      const jti = payload['jti']
      if (jti) {
        const blacklisted = await valkey.exists(ValkeyKeys.authJwtBlacklist(String(jti)))
        if (blacklisted) throw new Error('TOKEN_REVOKED')
      }

      return {
        sub: payload['sub'] as string,
        ...(typeof payload['email'] === 'string' ? { email: payload['email'] } : {}),
      }
    } catch (err) {
      throw new Error('INVALID_JWT')
    }
  }
}

export const authService = new AuthService()
