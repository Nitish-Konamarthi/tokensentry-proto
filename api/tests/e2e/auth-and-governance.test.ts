import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'

describe('E2E authentication and authorization', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
  })

  afterAll(async () => {
    await app.close()
  })

  it('rejects missing Authorization header with 401 and a call ID', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/proxy',
      payload: { model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }] },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json().error).toBe('UNAUTHORIZED')
    expect(response.json().call_id).toBeTruthy()
    expect(response.headers['x-call-id']).toBeTruthy()
  })

  it('rejects invalid API key format with 401', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/proxy',
      headers: { authorization: 'Bearer bad' },
      payload: { model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }] },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json().message).toContain('Invalid API key format')
  })

  it('returns the same call ID in the response header and error body', async () => {
    const response = await app.inject({ method: 'POST', url: '/v1/proxy', payload: {} })
    expect(response.headers['x-call-id']).toBe(response.json().call_id)
  })
})
