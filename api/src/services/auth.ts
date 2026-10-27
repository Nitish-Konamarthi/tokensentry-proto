import { pg } from '../clients/postgres.js'
import { hashApiKey } from '../lib/crypto.js'
import { logger } from '../lib/logger.js'
import type { AuthContext } from '../types/index.js'

export class AuthService {
  async authenticateApiKey(rawKey: string, ip: string): Promise<AuthContext> {
    const keyHash = hashApiKey(rawKey)

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
      scopes: row.scopes ?? [],
    }

    void pg`UPDATE api_keys SET last_used_at = NOW(), last_used_ip = ${ip}::inet WHERE id = ${row.key_id}`
      .catch(err => logger.warn({ err, keyId: row.key_id }, 'Failed to update API key last-used metadata'))

    return ctx
  }

}

export const authService = new AuthService()
