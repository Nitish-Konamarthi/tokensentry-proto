content = open('api/src/clients/providers/openai.ts', 'r', encoding='utf-8').read()
old_fetch = '  const response = await fetch(`${BASE_URL}/chat/completions`, {\n    method: \'POST\',\n    headers: {\n      \'Content-Type\': \'application/json\',\n      \'Authorization\': `Bearer ${params.apiKey}`,\n    },\n    body: JSON.stringify({\n      model: params.model,\n      messages,\n      max_tokens: params.maxTokens ?? 1024,\n      temperature: params.temperature ?? 1,\n      stream: params.stream ?? false,\n    }),\n  })'
new_fetch = '  const response = await fetchWithTimeoutAndRetry({\n    url: `${BASE_URL}/chat/completions`,\n    method: \'POST\',\n    headers: {\n      \'Content-Type\': \'application/json\',\n      \'Authorization\': `Bearer ${params.apiKey}`,\n    },\n    body: JSON.stringify({\n      model: params.model,\n      messages,\n      max_tokens: params.maxTokens ?? 1024,\n      temperature: params.temperature ?? 1,\n      stream: params.stream ?? false,\n    }),\n  }, \'openai\')'
content = content.replace(old_fetch, new_fetch)
open('api/src/clients/providers/openai.ts', 'w', encoding='utf-8').write(content)
print('openai fetch replaced')
