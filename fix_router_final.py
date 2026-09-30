with open('api/src/services/router.ts', 'r', encoding='utf-8') as f:
    content = f.read()

old_import = "import { providerScoringEngine } from './provider-scoring.js'\nimport { MODEL_COSTS, MODEL_TIERS } from './model-metadata.js'\nimport type { ProviderScore as ProviderScoringEngineScore } from './provider-scoring.js'"
new_import = "import { MODEL_COSTS } from './model-metadata.js'"
content = content.replace(old_import, new_import)

old_class = '''class Router {
  constructor(
    private readonly policyEvaluator = new PolicyEvaluator(),
    private readonly providerScorer = new ProviderScorer(),
    private readonly modelSelector = new ModelSelector(),
  ) {}

  async route(params: {
    requestedModel: string
    contextTokens: number
    outputTokens: number
    orgPolicy: { allowed_models?: string[]; max_model_tier?: string }
    preservePriority?: 'accuracy' | 'speed' | 'cost'
  }): Promise<RouterDecision> {
    const evaluation = this.policyEvaluator.evaluate(params)
    const providerScores = await providerScoringEngine.scoreProviders({
      models: evaluation.allowedModels,
      requestedModel: params.requestedModel,
      orgPolicy: params.orgPolicy,
      contextTokens: params.contextTokens,
      outputTokens: params.outputTokens,
    })

    const scoredProviders = this.providerScorer.scoreProviders({ models: evaluation.allowedModels })
    const approvedModel = this.modelSelector.selectModel({ evaluation, scoredProviders })
    const reasoning = evaluation.isRequestedAllowed
      ? 'Requested model is allowed by policy'
      : `Model ${evaluation.requestedModel} not in allowed list. Using ${approvedModel}.`

    return {
      approvedModel,
      complexity: 'unknown',
      confidence: 1.0,
      reasoning,
      overridden: evaluation.requestedModel !== approvedModel,
      estimatedCostUsd: this.estimateCost(params.contextTokens, params.outputTokens, approvedModel),
      providerScores,
    }
  }'''

new_class = '''class Router {
  constructor(
    private readonly policyEvaluator = new PolicyEvaluator(),
  ) {}

  async route(params: {
    requestedModel: string
    contextTokens: number
    outputTokens: number
    orgPolicy: { allowed_models?: string[]; max_model_tier?: string }
    preservePriority?: 'accuracy' | 'speed' | 'cost'
  }): Promise<RouterDecision> {
    const evaluation = this.policyEvaluator.evaluate(params)

    let approvedModel = evaluation.requestedModel
    let reasoning = 'Requested model is allowed by policy'
    let overridden = false

    if (!evaluation.isRequestedAllowed) {
      overridden = true
      const allowed = evaluation.allowedModels.filter((m) => Object.prototype.hasOwnProperty.call(MODEL_COSTS, m))
      if (allowed.length > 0) {
        const sorted = allowed.slice().sort((a, b) => {
          const costA = MODEL_COSTS[a]
          const costB = MODEL_COSTS[b]
          if (!costA || !costB) return (costA ? -1 : (costB ? 1 : 0))
          const totalA = params.contextTokens * costA.input + params.outputTokens * costA.output
          const totalB = params.contextTokens * costB.input + params.outputTokens * costB.output
          return totalA - totalB
        })
        approvedModel = sorted[0]
        reasoning = `Model ${evaluation.requestedModel} not allowed by policy (allowed: [${allowed.join(', ')}]). Using cheapest allowed: ${approvedModel}.`
      } else {
        approvedModel = 'claude-haiku-4-5'
        reasoning = `Model ${evaluation.requestedModel} not allowed and no allowed models configured. Using default fallback: ${approvedModel}.`
      }
    }

    const complexity = params.contextTokens > 8000 ? 'high' : (params.contextTokens > 2000 ? 'moderate' : 'low')

    return {
      approvedModel,
      complexity,
      confidence: 1.0,
      reasoning,
      overridden,
      estimatedCostUsd: this.estimateCost(params.contextTokens, params.outputTokens, approvedModel),
    }
  }'''

content = content.replace(old_class, new_class)

# Clean up leftover references to providerScores in RouterDecision interface or return
content = content.replace('providerScores?: ProviderScoringEngineScore[]', '')
content = content.replace(', providerScores', '')
content = content.replace('providerScores,', '')

open('api/src/services/router.ts', 'w', encoding='utf-8').write(content)
print('router deterministic rewritten')
