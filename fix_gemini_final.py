with open('api/src/clients/providers/gemini.ts', 'r', encoding='utf-8') as f:
    content = f.read()
old = '''  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      systemInstruction: params.system ? { parts: [{ text: params.system }] } : undefined,
      generationConfig: {
        maxOutputTokens: params.maxTokens ?? 1024,
        temperature: params.temperature ?? 1,
      },
    }),
  })'''
new = '''  const response = await fetchWithTimeoutAndRetry({
    url,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      systemInstruction: params.system ? { parts: [{ text: params.system }] } : undefined,
      generationConfig: {
        maxOutputTokens: params.maxTokens ?? 1024,
        temperature: params.temperature ?? 1,
      },
    }),
  }, 'gemini')'''
content = content.replace(old, new)
open('api/src/clients/providers/gemini.ts', 'w', encoding='utf-8').write(content)
print('gemini fixed')
