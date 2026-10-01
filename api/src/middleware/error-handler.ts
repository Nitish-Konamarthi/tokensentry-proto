import type { FastifyInstance, FastifyError } from 'fastify'
import { logger } from '../lib/logger.js'
import { env } from '../config/env.js'

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | Error, request, reply) => {
    const statusCode = 'statusCode' in err ? (err as any).statusCode as number : 500
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
      })
    }

    return reply.code(statusCode < 600 ? statusCode : 500).send({
      error: isProd ? 'INTERNAL_ERROR' : err.name ?? 'INTERNAL_ERROR',
      message: statusCode === 500 ? 'An unexpected error occurred' : err.message,
      request_id: request.id as string,
    })
  })

  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({
      error: 'NOT_FOUND',
      message: `Route ${request.method} ${request.url} not found`,
    })
  })
}
