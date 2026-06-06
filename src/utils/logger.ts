// src/utils/logger.ts
// Structured JSON logger using pino — feeds into Loki via Promtail

import pino from 'pino'

export const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  ...(process.env['NODE_ENV'] !== 'production'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }
    : {
        // Production: pure JSON for Loki
        formatters: {
          level: (label: string) => ({ level: label }),
          bindings: () => ({ service: 'tokensentry-api' }),
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      }),
})
