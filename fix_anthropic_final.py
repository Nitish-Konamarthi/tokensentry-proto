with open('api/src/clients/providers/anthropic.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the broken fetch call
old = '''  const response = await fetch(`${BASE_URL}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': params.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: params.maxTokens ?? 1024,
      messages: params.messages.filter(m => m.role !== 'system'),
      system: params.system,
      temperature: params.temperature ?? 1,
      stream: params.stream ?? false,
    })
  }, 'anthropic')'''

new = '''  const response = await fetchWithTimeoutAndRetry({
    url: `${BASE_URL}/messages`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': params.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: params.maxTokens ?? 1024,
      messages: params.messages.filter(m => m.role !== 'system'),
      system: params.system,
      temperature: params.temperature ?? 1,
      stream: params.stream ?? false,
    }),
  }, 'anthropic')'''

content = content.replace(old, new)
open('api/src/clients/providers/anthropic.ts', 'w', encoding='utf-8').write(content)
print('anthropic fixed properly')
