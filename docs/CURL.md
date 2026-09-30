# TokenSentry - Curl Examples for Debugging

## Basic request
curl -X POST https://api.tokensentry.ai/v1/proxy \
  -H "Authorization: Bearer ts_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet-4-6","messages":[{"role":"user","content":"Hello"}]}'}

## Streaming request
curl -X POST https://api.tokensentry.ai/v1/proxy \
  -H "Authorization: Bearer ts_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet-4-6","messages":[{"role":"user","content":"Hello"}],"stream":true}'

## Health checks
curl https://api.tokensentry.ai/health/live
curl https://api.tokensentry.ai/health/ready
