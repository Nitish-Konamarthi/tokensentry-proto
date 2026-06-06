// src/pillars/optimizer.ts — Pillar 2: Prompt Optimizer + Semantic Cache
import { createHash } from 'crypto'
import { callTokenSentryAI, type OptimizerResult } from '../clients/anthropic.js'
import { redis, RedisKeys, TTL } from '../clients/redis.js'
import { pg } from '../clients/db.js'
import { logger } from '../utils/logger.js'
import { hashPrompt } from '../utils/crypto.js'

const SIMILARITY_THRESHOLD = parseFloat(
  process.env['SEMANTIC_CACHE_SIMILARITY_THRESHOLD'] ?? '0.94'
)
const CACHE_ENABLED = process.env['ENABLE_SEMANTIC_CACHE'] !== 'false'

export interface OptimizationInput {
  prompt: string
  history: Array<{ role: string; content: string }>
  orgId: string
  preservePriority: 'accuracy' | 'speed' | 'cost'
  maxOutputTokens: number
}

export interface OptimizationOutput {
  optimized_prompt: string
  pruned_history: Array<{ role: string; content: string; turn_index: number }>
  original_token_estimate: number
  optimized_token_estimate: number
  reduction_percentage: number
  optimizations_applied: string[]
  semantic_integrity_score: number
  compression_notes: string
  cacheHit: boolean
  cachedResponse: string | undefined
  embeddingUsed: boolean | undefined
}

export class PromptOptimizer {
  async process(params: OptimizationInput): Promise<OptimizationOutput> {
    if (CACHE_ENABLED) {
      const cacheResult = await this.checkSemanticCache(params.prompt, params.orgId)
      if (cacheResult.hit) {
        logger.debug({ orgId: params.orgId, similarity: cacheResult.similarity }, 'Semantic cache hit')
        return {
          optimized_prompt: params.prompt,
          pruned_history: [],
          original_token_estimate: cacheResult.tokens ?? 0,
          optimized_token_estimate: 0,
          reduction_percentage: 100,
          optimizations_applied: ['semantic_cache_hit'],
          semantic_integrity_score: 1.0,
          compression_notes: `Cache hit — similarity ${cacheResult.similarity?.toFixed(3)}`,
          cacheHit: true,
          cachedResponse: cacheResult.response,
          embeddingUsed: true,
        }
      }
    }

    let result: OptimizerResult
    try {
      result = await callTokenSentryAI<OptimizerResult>(
        'prompt_optimizer',
        {
          original_prompt: params.prompt,
          conversation_history: params.history.map((h, i) => ({ ...h, turn_index: i })),
          max_output_tokens_budget: params.maxOutputTokens,
          preserve_priority: params.preservePriority,
        },
        { orgId: params.orgId }
      )
    } catch (err) {
      logger.warn({ err, orgId: params.orgId }, 'Optimizer failed, using original')
      return {
        optimized_prompt: params.prompt,
        pruned_history: params.history.map((h, i) => ({ ...h, turn_index: i })),
        original_token_estimate: Math.ceil(params.prompt.length / 4),
        optimized_token_estimate: Math.ceil(params.prompt.length / 4),
        reduction_percentage: 0,
        optimizations_applied: [],
        semantic_integrity_score: 1.0,
        compression_notes: 'Optimizer unavailable — original used',
        cacheHit: false,
        cachedResponse: undefined,
        embeddingUsed: undefined,
      }
    }

    void this.storeEmbedding(params.prompt, params.orgId).catch(
      (err) => logger.warn({ err }, 'Failed to store embedding')
    )

    return { ...result, cacheHit: false, cachedResponse: undefined, embeddingUsed: undefined }
  }

  async cacheResponse(params: {
    prompt: string; response: string; orgId: string
    modelUsed: string; inputTokens: number; outputTokens: number
  }): Promise<void> {
    if (!CACHE_ENABLED) return
    try {
      const embedding = await this.getEmbedding(params.prompt)
      const promptHash = hashPrompt(params.prompt)

      await pg`
        INSERT INTO semantic_cache
          (org_id, prompt_hash, embedding, prompt_preview, response, model_used, input_tokens, output_tokens)
        VALUES
          (${params.orgId}, ${promptHash}, ${JSON.stringify(embedding)}::vector,
           ${params.prompt.slice(0, 500)}, ${params.response},
           ${params.modelUsed}, ${params.inputTokens}, ${params.outputTokens})
        ON CONFLICT (org_id, prompt_hash)
        DO UPDATE SET response = EXCLUDED.response, last_hit_at = NOW(),
          hit_count = semantic_cache.hit_count + 1
      `
    } catch (err) {
      logger.warn({ err, orgId: params.orgId }, 'Failed to cache response')
    }
  }

  private async checkSemanticCache(prompt: string, orgId: string): Promise<{
    hit: boolean; response?: string; tokens?: number; similarity?: number
  }> {
    try {
      const embedding = await this.getEmbedding(prompt)

      const rows = await pg<Array<{
        id: string; response: string; input_tokens: number; similarity: number
      }>>`
        SELECT id, response, input_tokens,
               1 - (embedding <=> ${JSON.stringify(embedding)}::vector) AS similarity
        FROM semantic_cache
        WHERE org_id = ${orgId}
          AND created_at > NOW() - INTERVAL '24 hours'
          AND 1 - (embedding <=> ${JSON.stringify(embedding)}::vector) > ${SIMILARITY_THRESHOLD}
        ORDER BY similarity DESC
        LIMIT 1
      `

      const row = rows[0]
      if (row) {
        void pg`UPDATE semantic_cache SET hit_count = hit_count + 1, last_hit_at = NOW() WHERE id = ${row.id}`
        return { hit: true, response: row.response, tokens: row.input_tokens, similarity: row.similarity }
      }
    } catch (err) {
      logger.debug({ err }, 'Semantic cache check failed')
    }
    return { hit: false }
  }

  private async getEmbedding(text: string): Promise<number[]> {
    const cacheKey = RedisKeys.embed(
      createHash('sha256').update(text).digest('hex').slice(0, 16)
    )

    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached) as number[]

    const response = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env['VOYAGE_API_KEY']}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: [text.slice(0, 4096)], model: 'voyage-3' }),
    })

    if (!response.ok) throw new Error(`Voyage AI error: ${response.status}`)

    const data = await response.json() as { data: Array<{ embedding: number[] }> }
    const embedding = data.data[0]?.embedding
    if (!embedding) throw new Error('Voyage AI returned no embedding')

    await redis.setex(cacheKey, TTL.EMBED_SECONDS, JSON.stringify(embedding))
    return embedding
  }

  private async storeEmbedding(prompt: string, orgId: string): Promise<void> {
    const embedding = await this.getEmbedding(prompt)
    const promptHash = hashPrompt(prompt)
    await pg`
      INSERT INTO semantic_cache (org_id, prompt_hash, embedding, prompt_preview)
      VALUES (${orgId}, ${promptHash}, ${JSON.stringify(embedding)}::vector, ${prompt.slice(0, 500)})
      ON CONFLICT (org_id, prompt_hash) DO UPDATE SET created_at = NOW()
    `
  }
}

export const promptOptimizer = new PromptOptimizer()
