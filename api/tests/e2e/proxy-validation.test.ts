import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'

describe('E2E proxy request validation', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
  })

  afterAll(async () => {
    await app.close()
  })

  it('rejects missing required proxy fields without opening a provider request', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/proxy',
      headers: { authorization: 'Bearer ts_live_test_12345678901234567890' },
      payload: {},
    })

    expect(response.statusCode).toBeGreaterThanOrEqual(400)
    expect(response.headers['x-call-id']).toBeTruthy()
  })
})
