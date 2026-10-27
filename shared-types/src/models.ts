export type OrgRole = 'owner' | 'admin' | 'member'
export type AgentStatus = 'active' | 'terminated' | 'completed'
export type ModelOwner = 'anthropic' | 'openai' | 'google' | 'groq'
export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'groq' | 'openrouter'

export interface OrgSettings {
  name: string
  slug: string
  plan: string
  model_policy: {
    allowed_models: string[]
    max_model_tier: 'low' | 'standard' | 'high' | 'premium'
  } | null
}
