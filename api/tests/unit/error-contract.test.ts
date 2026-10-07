import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'

describe('API error correlation contract', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('uses one generated call id for proxy authentication failures and the response header', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/proxy',
      payload: { model: 'claude-sonnet-4-6', messages: [{ role: 'user', content: 'Hello' }] },
    })

    const body = response.json()
    expect(response.statusCode).toBe(401)
    expect(body).toMatchObject({ error: 'UNAUTHORIZED', call_id: expect.any(String) })
    expect(response.headers['x-call-id']).toBe(body.call_id)
  })

  it('uses the same call id for validation errors raised before the proxy handler', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/proxy',
      headers: { authorization: 'Bearer ts_12345678901234567890' },
      payload: { model: 'claude-sonnet-4-6' },
    })

    const body = response.json()
    expect(response.statusCode).toBe(400)
    expect(body).toMatchObject({
      error: 'VALIDATION_ERROR',
      fields: expect.any(Array),
      call_id: expect.any(String),
    })
    expect(response.headers['x-call-id']).toBe(body.call_id)
  })

  it('uses the same call id for not-found responses', async () => {
    const response = await app.inject({ method: 'GET', url: '/missing-route' })

    const body = response.json()
    expect(response.statusCode).toBe(404)
    expect(body).toMatchObject({ error: 'NOT_FOUND', call_id: expect.any(String) })
    expect(response.headers['x-call-id']).toBe(body.call_id)
  })
})
