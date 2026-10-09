import type { FastifyInstance, FastifyError } from 'fastify'
import { logger } from '../lib/logger.js'
import { env } from '../config/env.js'

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | Error, request, reply) => {
    const statusCode = err.message === 'AGENT_GUARD_UNAVAILABLE'
      ? 503
      : 'statusCode' in err ? (err as any).statusCode as number : 500
    if (err.message === 'AGENT_GUARD_UNAVAILABLE') {
      return reply.code(503).send({
        error: 'AGENT_GUARD_UNAVAILABLE',
        message: 'Agent Guard state is unavailable; the request was not allowed to bypass enforcement.',
        call_id: request.callId,
      })
    }
    const isProd = env.NODE_ENV === 'production'

    logger.error({
      err: {
        message: err.message,
        name: err.name,
        stack: isProd ? undefined : err.stack,
      },
      requestId: request.id,
      url: request.url,
    }, 'Unhandled error')

    if ('validation' in err) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: err.message,
        fields: (err as any).validation,
        call_id: request.callId,
      })
    }

    return reply.code(statusCode < 600 ? statusCode : 500).send({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      call_id: request.callId,
    })
  })

  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({
      error: 'NOT_FOUND',
      message: `Route ${request.method} ${request.url} not found`,
      call_id: request.callId,
    })
  })
}
