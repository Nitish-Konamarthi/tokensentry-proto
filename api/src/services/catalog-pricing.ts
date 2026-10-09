export function isUnknownPricing(pricing: { input: number; output: number }): boolean {
  return Number.isNaN(pricing.input) && Number.isNaN(pricing.output)
}
