import { providerRouter } from './provider-router.js'
import { modelCatalogService } from './model-catalog-service.js'
import type { UpstreamId } from '../types/index.js'
import type { UpstreamHealthState } from './provider-router.js'

export interface UpstreamScoreComponents {
  latency: number
  cost: number
  capability: number
  health: number
  preference: number
}

export interface UpstreamScore {
  model: string
  upstream: UpstreamId
  upstreamModelId: string
  totalScore: number
  components: UpstreamScoreComponents
}

interface ScoreInput {
  models: string[]
  requestedModel: string
  orgPolicy: { allowed_models?: string[]; max_model_tier?: string }
  contextTokens: number
  outputTokens: number
}

const DEFAULT_LATENCIES_MS: Record<UpstreamId, number> = {
  'anthropic-direct': 300,
  'openai-direct': 200,
  'gemini-direct': 250,
  'groq-direct': 180,
  'openrouter': 250,
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

function computeLatencyScore(upstream: UpstreamId): number {
  const latency = DEFAULT_LATENCIES_MS[upstream] ?? 300
  return clamp01(1 - latency / Math.max(...Object.values(DEFAULT_LATENCIES_MS)))
}

function computeCostScore(model: string, upstreamModelId: string, inputTokens: number, outputTokens: number): number {
  const descriptor = modelCatalogService.getDescriptor(model)
  const costs = descriptor?.cost ?? { input: 0, output: 0 }
  const cost = (inputTokens / 1_000_000) * costs.input + (outputTokens / 1_000_000) * costs.output
  // Find max cost across all supported descriptors for normalization
  const allSupported = modelCatalogService.listSupported()
  const maxCost = Math.max(0.001, ...allSupported.map(id => {
    const d = modelCatalogService.getDescriptor(id)
    const c = d?.cost ?? { input: 0, output: 0 }
    return (inputTokens / 1_000_000) * c.input + (outputTokens / 1_000_000) * c.output
  }))
  return clamp01(1 - cost / maxCost)
}

function computeCapabilityScore(model: string): number {
  const descriptor = modelCatalogService.getDescriptor(model)
  const score = descriptor?.capabilityScore ?? 0
  if (score === 0) return 0.5
  return score / 4  // normalize from 1-4 to 0.25-1.0
}

function computeHealthScore(healthState: UpstreamHealthState): number {
  return healthState.healthy ? 1 : 0.1
}

function computePreferenceScore(model: string, allowedModels: string[]): number {
  if (!allowedModels || allowedModels.length === 0) return 0.5
  const index = allowedModels.indexOf(model)
  if (index === -1) return 0.0
  return clamp01(1 - index / Math.max(allowedModels.length - 1, 1))
}

export class ProviderScoringEngine {
  async scoreUpstreams(params: ScoreInput): Promise<UpstreamScore[]> {
    const allRoutes: Array<{ model: string; upstream: UpstreamId; upstreamModelId: string }> = []
    
    for (const model of params.models) {
      const routes = (await import('./model-routes.js')).getRoutesForModel(model)
      for (const route of routes) {
        allRoutes.push({
          model,
          upstream: route.upstreamId,
          upstreamModelId: route.upstreamModelId,
        })
      }
    }

    const healthStates = await this.getHealthStates(allRoutes.map(r => r.upstream))

    return allRoutes.map((route) => {
      const healthState = healthStates[route.upstream] ?? { upstream: route.upstream, healthy: true, lastCheckedAt: Date.now() }
      const components: UpstreamScoreComponents = {
        latency: computeLatencyScore(route.upstream),
        cost: computeCostScore(route.model, route.upstreamModelId, params.contextTokens, params.outputTokens),
        capability: computeCapabilityScore(route.model),
        health: computeHealthScore(healthState),
        preference: computePreferenceScore(route.model, params.orgPolicy.allowed_models ?? []),
      }

      const totalScore = clamp01(
        components.capability * WEIGHTS.capability +
        components.cost * WEIGHTS.cost +
        components.latency * WEIGHTS.latency +
        components.health * WEIGHTS.health +
        components.preference * WEIGHTS.preference,
      )

      return {
        model: route.model,
        upstream: route.upstream,
        upstreamModelId: route.upstreamModelId,
        totalScore,
        components,
      }
    })
  }

  private async getHealthStates(upstreams: UpstreamId[]): Promise<Record<UpstreamId, UpstreamHealthState>> {
    const uniqueUpstreams = Array.from(new Set(upstreams))
    const entries = await Promise.all(uniqueUpstreams.map(async (upstream) => ({
      upstream,
      healthState: await providerRouter.checkUpstreamHealth(upstream),
    })))

    return Object.fromEntries(entries.map((entry) => [entry.upstream, entry.healthState])) as Record<UpstreamId, UpstreamHealthState>
  }
}

export const providerScoringEngine = new ProviderScoringEngine()
