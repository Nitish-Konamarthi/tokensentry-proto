import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../../src/app.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
})

afterAll(async () => {
  await app.close()
})

describe('PROXY INTEGRATION — Authentication', () => {
  it('rejects request without authorization header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/proxy',
      payload: { model: 'claude-sonnet-4-6', messages: [{ role: 'user', content: 'Hello' }] },
    })
    expect(res.statusCode).toBe(401)
    const body = JSON.parse(res.body)
    expect(body.error).toBe('UNAUTHORIZED')
  })

  it('rejects request with malformed authorization', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/proxy',
      headers: { Authorization: 'Basic not-a-key' },
      payload: { model: 'claude-sonnet-4-6', messages: [{ role: 'user', content: 'Hello' }] },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('HEALTH AND READINESS', () => {
  it('live endpoint responds', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/live' })
    expect(res.statusCode).toBe(200)
  })

  it('ready endpoint responds with dependency status', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/ready' })
    expect([200, 503]).toContain(res.statusCode)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('database')
    expect(body).toHaveProperty('valkey')
  })
})
