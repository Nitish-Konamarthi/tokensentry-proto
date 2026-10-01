import { pg } from '../src/clients/postgres.js'
import { generateApiKey } from '../src/lib/crypto.js'

async function seed() {
  const { rawKey, keyHash, keyPrefix } = generateApiKey()

  await pg`
    INSERT INTO api_keys (org_id, team_id, key_hash, key_prefix, name)
    VALUES (
      '00000000-0000-0000-0000-000000000001',
      (SELECT id FROM teams WHERE slug = 'engineering' LIMIT 1),
      ${keyHash},
      ${keyPrefix},
      'Development Key'
    )
  `

  console.log('\n=== Test API Key ===')
  console.log(`\n  ${rawKey}\n`)
  console.log('curl -X POST http://localhost:3000/v1/proxy \\')
  console.log(`  -H "Authorization: Bearer ${rawKey}" \\`)
  console.log('  -H "Content-Type: application/json" \\')
  console.log('  -d \'{"model":"claude-sonnet-4-6","messages":[{"role":"user","content":"Hello"}]}\'')
  console.log()

  await pg.end()
}

seed().catch(console.error)
