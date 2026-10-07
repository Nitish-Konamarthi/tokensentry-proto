import { providerRouter } from './provider-router.js'
import type { ProviderType } from '../types/index.js'
import { getCapabilityScore, MODEL_COSTS } from './model-metadata.js'
import type { ProviderHealthState } from './provider-router.js'

export interface ProviderScoreComponents {
  latency: number
  cost: number
  capability: number
  health: number
  preference: number
}

export interface ProviderScore {
  model: string
  provider: ProviderType
  totalScore: number
  components: ProviderScoreComponents
}

interface ScoreInput {
  models: string[]
  requestedModel: string
  orgPolicy: { allowed_models?: string[]; max_model_tier?: string }
  contextTokens: number
  outputTokens: number
}

const DEFAULT_LATENCIES_MS: Record<ProviderType, number> = {
  anthropic: 300,
  openai: 200,
  gemini: 250,
  groq: 180,
  openrouter: 250,
}

const WEIGHTS = {
  capability: 0.6,
  cost: 0.15,
  latency: 0.1,
  health: 0.1,
  preference: 0.05,
} as const

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function computeLatencyScore(provider: ProviderType): number {
  const latency = DEFAULT_LATENCIES_MS[provider] ?? 300
  return clamp01(1 - latency / Math.max(...Object.values(DEFAULT_LATENCIES_MS)))
}

function computeCostScore(model: string, inputTokens: number, outputTokens: number): number {
  const costs = MODEL_COSTS[model]
  if (!costs) return 0.5
  const cost = (inputTokens / 1_000_000) * costs.input + (outputTokens / 1_000_000) * costs.output
  const maxCost = Math.max(...Object.values(MODEL_COSTS).map((c) => {
    return (inputTokens / 1_000_000) * c.input + (outputTokens / 1_000_000) * c.output
  }))
  return clamp01(1 - cost / Math.max(maxCost, 1))
}

function computeCapabilityScore(model: string): number {
  const score = getCapabilityScore(model)
  if (score === 0) return 0.5
  return score / 4  // normalize from 1-4 to 0.25-1.0
}

function computeHealthScore(healthState: ProviderHealthState): number {
  return healthState.healthy ? 1 : 0.1
}

function computePreferenceScore(model: string, allowedModels: string[]): number {
  if (!allowedModels || allowedModels.length === 0) return 0.5
  const index = allowedModels.indexOf(model)
  if (index === -1) return 0.0
  return clamp01(1 - index / Math.max(allowedModels.length - 1, 1))
}

export class ProviderScoringEngine {
  async scoreProviders(params: ScoreInput): Promise<ProviderScore[]> {
    const healthStates = await this.getHealthStates(params.models)

    return params.models.map((model) => {
      const provider = providerRouter.resolveProvider(model)
      const healthState = healthStates[provider]
      const components: ProviderScoreComponents = {
        latency: computeLatencyScore(provider),
        cost: computeCostScore(model, params.contextTokens, params.outputTokens),
        capability: computeCapabilityScore(model),
        health: computeHealthScore(healthState),
        preference: computePreferenceScore(model, params.orgPolicy.allowed_models ?? []),
      }

      const totalScore = clamp01(
        components.capability * WEIGHTS.capability +
        components.cost * WEIGHTS.cost +
        components.latency * WEIGHTS.latency +
        components.health * WEIGHTS.health +
        components.preference * WEIGHTS.preference,
      )

      return {
        model,
        provider,
        totalScore,
        components,
      }
    })
  }

  private async getHealthStates(models: string[]): Promise<Record<ProviderType, ProviderHealthState>> {
    const providers = Array.from(new Set(models.map((model) => providerRouter.resolveProvider(model)))) as ProviderType[]
    const entries = await Promise.all(providers.map(async (provider) => ({
      provider,
      healthState: await providerRouter.checkProviderHealth(provider),
    })))

    return Object.fromEntries(entries.map((entry) => [entry.provider, entry.healthState])) as Record<ProviderType, ProviderHealthState>
  }
}

export const providerScoringEngine = new ProviderScoringEngine()
