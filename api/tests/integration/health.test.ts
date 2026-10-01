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

describe('GET /health/live', () => {
  it('returns ok status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/live',
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.status).toBe('ok')
    expect(body.uptime).toBeGreaterThan(0)
    expect(body.timestamp).toBeTruthy()
  })
})

describe('GET /health/ready', () => {
  it('returns status (may be degraded locally)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/ready',
    })

    expect([200, 503]).toContain(response.statusCode)
    const body = JSON.parse(response.body)
    expect(body).toHaveProperty('database')
    expect(body).toHaveProperty('valkey')
  })
})

describe('POST /v1/proxy', () => {
  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/proxy',
      payload: {
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'Hello' }],
      },
    })

    expect(response.statusCode).toBe(401)
    const body = JSON.parse(response.body)
    expect(body.error).toBe('UNAUTHORIZED')
  })
})

describe('404 handler', () => {
  it('returns 404 for unknown routes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/nonexistent',
    })

    expect(response.statusCode).toBe(404)
    const body = JSON.parse(response.body)
    expect(body.error).toBe('NOT_FOUND')
  })
})
