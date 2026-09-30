with open('api/src/clients/providers/groq.ts', 'r', encoding='utf-8') as f:
    content = f.read()
old = '  const response = await fetch(`${BASE_URL}/chat/completions`, {\n    method: \'POST\',\n    headers: {\n      \'Content-Type\': \'application/json\',\n      \'Authorization\': `Bearer ${params.apiKey}`,\n    },\n    body: JSON.stringify({\n      model: params.model,\n      messages,\n      max_tokens: params.maxTokens ?? 1024,\n      temperature: params.temperature ?? 1,\n    }),\n  })'
new = '  const response = await fetchWithTimeoutAndRetry({\n    url: `${BASE_URL}/chat/completions`,\n    method: \'POST\',\n    headers: {\n      \'Content-Type\': \'application/json\',\n      \'Authorization\': `Bearer ${params.apiKey}`,\n    },\n    body: JSON.stringify({\n      model: params.model,\n      messages,\n      max_tokens: params.maxTokens ?? 1024,\n      temperature: params.temperature ?? 1,\n    }),\n  }, \'groq\')'
content = content.replace(old, new)
open('api/src/clients/providers/groq.ts', 'w', encoding='utf-8').write(content)
print('groq fixed')
