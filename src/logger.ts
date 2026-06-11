// src/logger.ts
import pino from 'pino'
import { config } from './config.js'

const loggerOptions: pino.LoggerOptions = {
  level: config.LOG_LEVEL,
  base: {
    service: 'tokensentry-api',
    env: config.NODE_ENV,
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-api-key"]',
      'body.apiKey',
      'body.key',
    ],
    censor: '[REDACTED]',
  },
}

// Transport is only set in development — avoids exactOptionalPropertyTypes issue
if (config.NODE_ENV === 'development') {
  loggerOptions.transport = {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'HH:MM:ss' },
  }
}

export const logger = pino(loggerOptions)
