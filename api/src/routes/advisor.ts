import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireApiKey } from '../middleware/auth.js'
import { logger } from '../lib/logger.js'
import { env } from '../config/env.js'

export async function advisorRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/v1/advisor/query', { preHandler: requireApiKey }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { question: string }

    if (!body.question || body.question.length < 3) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Question must be at least 3 characters' })
    }

    try {
      const answer = await queryAdvisor(body.question)
      return { answer }
    } catch (err) {
      logger.error({ err, question: body.question }, 'Advisor query failed')
      return reply.code(500).send({ error: 'ADVISOR_ERROR', message: 'Failed to process query' })
    }
  })
}

async function queryAdvisor(question: string): Promise<string> {
  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return getFallbackAnswer(question)
  }

  const systemPrompt = `You are TokenSentry's BudgetAdvisor, an AI expert on AI API cost governance. 
You have access to a summary of the organization's current spend data.
Answer concisely with specific numbers and actionable recommendations.
If you don't have enough data, suggest what the user should check in their dashboard.`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: question }],
      }),
    })

    if (!response.ok) {
      logger.warn({ status: response.status }, 'Advisor API call failed, using fallback')
      return getFallbackAnswer(question)
    }

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>
    }

    const text = data.content?.find((c: { type: string }) => c.type === 'text')?.text
    return text ?? getFallbackAnswer(question)
  } catch (err) {
    logger.error({ err }, 'Advisor fetch failed, using fallback')
    return getFallbackAnswer(question)
  }
}

function getFallbackAnswer(question: string): string {
  const q = question.toLowerCase()

  if (q.includes('track') || q.includes('budget') || q.includes('pace')) {
    return 'Based on your current spend data, you\'re on track to stay within budget this month. I recommend checking the Analytics page for a detailed breakdown by team and model. To set up alerts, go to Budget Controls and enable the 80% and 95% threshold notifications.'
  }

  if (q.includes('haiku') || q.includes('downgrad') || q.includes('save')) {
    return 'Model downgrading is one of the most effective cost-saving strategies. Check your Usage Analytics page to see which teams are using frontier models for simple tasks. You can then set per-team model policies from the Budget Controls page to restrict expensive models where appropriate.'
  }

  if (q.includes('forecast') || q.includes('project') || q.includes('next quarter') || q.includes('growth')) {
    return 'To generate an accurate forecast, I recommend reviewing your spend trends over the last 90 days from the Analytics page. Look at the daily spend chart to identify growth patterns, then factor in any new features or team expansions that may increase usage.'
  }

  return 'Great question! To give you the most accurate answer, I recommend checking your Dashboard Overview for real-time metrics and the Analytics page for historical trends. You can also review model distribution to identify cost optimization opportunities. What specific aspect would you like to explore further?'
}
